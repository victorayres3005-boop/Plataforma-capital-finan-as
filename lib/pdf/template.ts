import type { PDFReportParams } from "@/lib/generators/pdf";
import type { FundCriterion, ProcessoItem, FaturamentoMensal } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "\u2014";
  return esc(String(v));
}
function fmtMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "\u2014";
  const n = parseFloat(String(v).replace(/[^\d,-]/g,"").replace(",","."));
  if (isNaN(n)) return esc(String(v));
  return "R$\u00a0" + n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtMoneyRound(v: string | number | null | undefined): string {
  if (v == null || v === "") return "\u2014";
  const n = parseFloat(String(v).replace(/[^\d,-]/g,"").replace(",","."));
  if (isNaN(n)) return esc(String(v));
  if (Math.abs(n) >= 1_000_000) return "R$\u00a0" + (n / 1_000_000).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1}) + "M";
  if (Math.abs(n) >= 1_000) return "R$\u00a0" + (n / 1_000).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0}) + "k";
  return "R$\u00a0" + Math.round(n).toLocaleString("pt-BR");
}
function fmtPct(v: string | number | null | undefined): string {
  if (v == null || v === "") return "\u2014";
  const s = String(v).trim();
  if (s.includes("%")) return esc(s);
  const n = parseFloat(s.replace(/[^\d,.-]/g,"").replace(",","."));
  if (isNaN(n)) return esc(s);
  return n.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2}) + "%";
}
function fmtCnpj(raw: string | null | undefined): string {
  if (!raw) return "\u2014";
  const d = raw.replace(/\D/g,"");
  return d.length===14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5") : raw;
}
function fmtCpf(raw: string | null | undefined): string {
  if (!raw) return "\u2014";
  const d = raw.replace(/\D/g,"");
  return d.length===11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4") : raw;
}
function numVal(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  // Preserve sign
  const rawStr = String(v).trim();
  const isNegative = rawStr.startsWith("-") || rawStr.includes("(");
  const cleaned = rawStr.replace(/[^\d.,\-]/g, "").replace(/^-/, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let num: number;
  if (hasComma && hasDot) {
    // Ambos separadores: o último é o decimal
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // BR: 1.234.567,89
      num = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    } else {
      // US: 1,234,567.89
      num = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (hasComma) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // BR decimal: 123456,78
      num = parseFloat(cleaned.replace(",", "."));
    } else {
      // US thousands: 1,234,567
      num = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (hasDot) {
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal: 123.45
      num = parseFloat(cleaned);
    } else {
      // BR thousands: 1.234.567 (sem decimal)
      num = parseFloat(cleaned.replace(/\./g, ""));
    }
  } else {
    // Sem separador: 35061582 - pode ser valor completo
    num = parseFloat(cleaned);
  }
  if (isNaN(num) || !isFinite(num)) return 0;
  // Sanity check: valor individual maior que R$ 100 bilhões é absurdo
  // Provavelmente erro de parsing - zera pra não poluir a soma
  if (Math.abs(num) > 100_000_000_000) return 0;
  return isNegative ? -Math.abs(num) : num;
}
function fmtCompact(v: number): string {
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace(".", ",") + "M";
  if (v >= 1000) return Math.round(v / 1000) + "k";
  return String(Math.round(v));
}

function decisaoBadge(decisao: string, big = false): string {
  const map: Record<string,{bg:string;color:string;border:string;label:string;icon:string}> = {
    APROVADO:              {bg:"rgba(34,197,94,.15)",color:"#4ade80",border:"rgba(34,197,94,.3)",label:"APROVADO",icon:"\u2713"},
    APROVACAO_CONDICIONAL: {bg:"rgba(245,158,11,.12)",color:"#fbbf24",border:"rgba(245,158,11,.3)",label:"CONDICIONAL",icon:"\u26A0"},
    PENDENTE:              {bg:"rgba(245,158,11,.12)",color:"#fbbf24",border:"rgba(245,158,11,.3)",label:"PENDENTE",icon:"\u23F3"},
    REPROVADO:             {bg:"rgba(239,68,68,.15)",color:"#fca5a5",border:"rgba(239,68,68,.3)",label:"REPROVADO",icon:"\u2717"},
  };
  const d = map[decisao] ?? {bg:"rgba(255,255,255,.08)",color:"rgba(255,255,255,.6)",border:"rgba(255,255,255,.15)",label:esc(decisao),icon:""};
  if (big) return `<div style="display:inline-flex;align-items:center;gap:10px;padding:12px 32px;border-radius:12px;background:${d.bg};border:2px solid ${d.border}">
    <span style="font-size:20px">${d.icon}</span>
    <span style="font-weight:900;font-size:16px;color:${d.color};letter-spacing:.1em">${d.label}</span>
  </div>`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:99px;background:${d.bg};color:${d.color};font-weight:700;font-size:9px;letter-spacing:.05em;text-transform:uppercase;border:1px solid ${d.border}">${d.icon?`<span style="font-size:10px">${d.icon}</span>`:""}${d.label}</span>`;
}

/** Inline status badge for tables */
function statusBadge(text: string, type: "ok"|"fail"|"warn"|"info"): string {
  const cfg = {
    ok:   {bg:"#dcfce7",color:"#166534",brd:"#bbf7d0",icon:"\u2713"},
    fail: {bg:"#fee2e2",color:"#991b1b",brd:"#fecaca",icon:"\u2717"},
    warn: {bg:"#fef3c7",color:"#92400e",brd:"#fde68a",icon:"\u26A0"},
    info: {bg:"#dbeafe",color:"#1d4ed8",brd:"#bfdbfe",icon:"\u24D8"},
  }[type];
  return `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:99px;background:${cfg.bg};color:${cfg.color};font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border:1px solid ${cfg.brd}"><span style="font-size:9px">${cfg.icon}</span> ${esc(text)}</span>`;
}

function kpi(label: string, value: string, color="#111827", sub?: string, borderColor?: string): string {
  const bdr = borderColor || (color==="#dc2626" ? "#DC2626" : color==="#16a34a" ? "#73B815" : "#203B88");
  return `<div style="background:linear-gradient(135deg,#ffffff 0%,#f8faff 100%);border:1px solid #e0e4ec;border-left:4px solid ${bdr};border-radius:8px;padding:14px 16px;min-width:0;box-shadow:0 2px 8px rgba(32,59,136,.06)">
    <div style="display:inline-block;padding:2px 8px;border-radius:99px;background:#edf2fb;font-size:8px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;font-family:'Open Sans',Arial,sans-serif">${label}</div>
    <div style="font-size:18px;font-weight:900;color:${color};line-height:1.15;word-break:break-all;font-variant-numeric:tabular-nums">${value}</div>
    ${sub?`<div style="font-size:9px;color:#9ca3af;margin-top:4px">${sub}</div>`:""}
  </div>`;
}

/** Placeholder KPI for empty grid cells */
function kpiPlaceholder(): string {
  return `<div style="background:#f8f9fb;border:1px dashed #e0e4ec;border-radius:8px;padding:14px 16px;min-width:0;display:flex;align-items:center;justify-content:center">
    <span style="color:#d1d5db;font-size:14px">\u2014</span>
  </div>`;
}

function secHdr(num: string, title: string): string {
  return `<div style="margin-bottom:18px;page-break-inside:avoid">
    <div style="display:flex;align-items:center;background:#203B88;padding:12px 16px;gap:12px">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:#ffffff;color:#203B88;font-size:12px;font-weight:900;border-radius:50%;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.15)">${num}</span>
      <span style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:.08em">${esc(title)}</span>
    </div>
    <div style="height:3px;background:#73B815"></div>
  </div>`;
}

function row(cells: string[], head=false): string {
  const tag=head?"th":"td";
  return `<tr>${cells.map(c=>`<${tag}>${c}</${tag}>`).join("")}</tr>`;
}

function alertBox(msg: string, sev: "ALTA"|"MODERADA"|"INFO"): string {
  const cfg={
    ALTA:     {bg:"#fff1f2",brd:"#ef4444",c:"#991b1b",label:"RISCO ALTO",icon:"\u26A0\uFE0F"},
    MODERADA: {bg:"#fffbeb",brd:"#f59e0b",c:"#92400e",label:"ATENCAO",icon:"\u26A1"},
    INFO:     {bg:"#eff6ff",brd:"#3b82f6",c:"#1d4ed8",label:"INFORMACAO",icon:"\u24D8"},
  }[sev];
  return `<div style="display:flex;gap:12px;align-items:flex-start;background:${cfg.bg};border-left:5px solid ${cfg.brd};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:10px;page-break-inside:avoid;box-shadow:0 1px 4px rgba(0,0,0,.04)">
    <span style="font-size:18px;flex-shrink:0;line-height:1">${cfg.icon}</span>
    <div><div style="font-size:8.5px;font-weight:800;color:${cfg.c};text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">${cfg.label}</div>
    <div style="font-size:11px;color:${cfg.c};line-height:1.55">${esc(msg)}</div></div>
  </div>`;
}

function grid(cols: number, items: string[]): string {
  const filled=items.filter(Boolean);
  if(filled.length===0) return "";
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin-bottom:16px">${items.map(i=>i||kpiPlaceholder()).join("")}</div>`;
}

function subTitle(t: string): string {
  return `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:12px;font-weight:700;color:#203B88;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin:20px 0 12px">${esc(t)}</div>`;
}

function paraBox(text: string): string {
  return `<div style="background:linear-gradient(135deg,#f8f9fb 0%,#edf2fb 100%);border-left:4px solid #203B88;border-radius:0 8px 8px 0;padding:16px 18px;font-size:12px;line-height:1.8;color:#374151;page-break-inside:avoid">${esc(text)}</div>`;
}

/** Data card for grid layouts instead of plain tables */
function dataCard(label: string, value: string): string {
  return `<div style="background:#fff;border:1px solid #e0e4ec;border-radius:8px;padding:12px 14px;page-break-inside:avoid">
    <div style="font-size:8px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${esc(label)}</div>
    <div style="font-size:12px;font-weight:600;color:#111827;line-height:1.4;word-break:break-word">${value}</div>
  </div>`;
}

/** Translate legal status to simpler Portuguese */
function translateProcessoStatus(status: string | undefined): string {
  if (!status) return "\u2014";
  const upper = status.toUpperCase().trim();
  const map: Record<string,string> = {
    "DISTRIBUIDO": "Em Andamento",
    "ARQUIVADO": "Arquivado",
    "JULGADO": "Julgado",
    "EM GRAU DE RECURSO": "Em Recurso",
    "TRANSITADO EM JULGADO": "Transitado",
  };
  if (map[upper]) return map[upper];
  // Capitalize properly
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

// ─── SVG Brand Logo ──────────────────────────────────────────────────────────
const COVER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="120" height="120"><defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="64" height="64" rx="14" fill="rgba(255,255,255,0.1)" filter="url(#glow)"/><circle cx="32" cy="28" r="14" stroke="#ffffff" stroke-width="3.5" fill="none"/><circle cx="32" cy="44" r="3.2" fill="#73b815"/></svg>`;
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#203b88"/><circle cx="32" cy="28" r="14" stroke="#ffffff" stroke-width="3.5" fill="none"/><circle cx="32" cy="44" r="3.2" fill="#73b815"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${typeof Buffer !== "undefined" ? Buffer.from(LOGO_SVG).toString("base64") : ""}`;
void LOGO_DATA_URI; // used in header template

// ─── SVG Rating Gauge ─────────────────────────────────────────────────────────
function ratingGauge(rating: number, size: "large"|"small" = "large"): string {
  const w = size === "large" ? 200 : 180;
  const h = size === "large" ? 110 : 90;
  const cx = w/2, cy = h - 18, R = size === "large" ? 76 : 68;
  const color=rating>=7?"#22c55e":rating>=4?"#f59e0b":"#ef4444";
  const angle=Math.PI*(1-rating/10);
  const ex=cx+R*Math.cos(angle),ey=cy-R*Math.sin(angle);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
    <path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${cx+R},${cy}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="12" stroke-linecap="round"/>
    ${rating>0?`<path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/>`:""}
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="8" fill="${color}" stroke="#fff" stroke-width="2.5" filter="drop-shadow(0 2px 4px rgba(0,0,0,.3))"/>
    <text x="${cx}" y="${cy-18}" text-anchor="middle" font-family="'Open Sans',Arial,sans-serif" font-size="40" font-weight="900" fill="${color}">${rating}</text>
    <text x="${cx}" y="${cy}" text-anchor="middle" font-family="'Open Sans',Arial,sans-serif" font-size="12" fill="rgba(255,255,255,.35)">/ 10</text>
  </svg>`;
}

// ─── Faturamento Bar Chart ──────────────────────────────────────────────────
function faturamentoChart(meses: FaturamentoMensal[], fmmRef?: number): string {
  if(!meses||meses.length===0) return "";
  const values=meses.map(m=>numVal(m.valor));
  const max=Math.max(...values, fmmRef||0, 1);
  const n=meses.length, H=140, gap=4, padTop=22, padBot=20;
  const W = Math.max(640, n * 40);
  const bw=Math.floor((W-(n-1)*gap)/n);
  const totalH = H + padTop + padBot;

  const bars=meses.map((m,i)=>{
    const v=values[i];
    const bh=Math.max(3,Math.floor((v/max)*H));
    const x=i*(bw+gap);
    const y=padTop+H-bh;
    const intensity = v === 0 ? 0 : Math.max(0.35, v / max);
    const clr = v === 0 ? "#e5e7eb" : `rgba(32,59,136,${intensity.toFixed(2)})`;
    const label = v > 0 ? fmtCompact(v) : "";
    const mesLabel = esc(m.mes || "");
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${clr}"/>
${label ? `<text x="${x+bw/2}" y="${y-5}" text-anchor="middle" font-size="8" font-weight="700" fill="#203B88" font-family="'Open Sans',Arial">${label}</text>` : ""}
<text x="${x+bw/2}" y="${padTop+H+14}" text-anchor="middle" font-size="7.5" fill="#6b7280" font-family="'Open Sans',Arial">${mesLabel}</text>`;
  }).join("");

  const fmmLine = fmmRef && fmmRef > 0 ? (() => {
    const fmmY = padTop + H - Math.floor((fmmRef / max) * H);
    return `<line x1="0" y1="${fmmY}" x2="${W}" y2="${fmmY}" stroke="#73B815" stroke-width="1.5" stroke-dasharray="6,3"/>
<text x="${W-2}" y="${fmmY-4}" text-anchor="end" font-size="8" fill="#73B815" font-weight="700" font-family="'Open Sans',Arial">FMM ${fmtCompact(fmmRef)}</text>`;
  })() : "";

  return `<div style="margin-bottom:16px;padding:12px 14px;background:linear-gradient(135deg,#f8f9fb 0%,#edf2fb 100%);border-radius:10px;border:1px solid #e0e4ec">
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Faturamento Mensal</div>
    <svg width="100%" height="${totalH}" viewBox="0 0 ${W} ${totalH}" preserveAspectRatio="xMidYMid meet">${bars}${fmmLine}</svg>
  </div>`;
}

function sortMeses(meses: FaturamentoMensal[]): FaturamentoMensal[] {
  return [...meses].sort((a,b)=>{
    const dk = (s:string)=>{
      const parts=s.split("/"); if(parts.length!==2) return 0;
      const mm:Record<string,number>={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
      const month=isNaN(Number(parts[0]))?(mm[parts[0].toLowerCase()]||0):Number(parts[0]);
      const year=Number(parts[1])<100?Number(parts[1])+2000:Number(parts[1]);
      return year*100+month;
    };
    return dk(a.mes)-dk(b.mes);
  });
}

/** Compute FMM from meses[] — sempre recalcula do array (nunca confia em fmm12m gravado, que pode estar com escala errada). */
function computeFmm(faturamento: { fmm12m?: string | number; mediaAno?: string | number; meses?: FaturamentoMensal[] } | undefined): number {
  if (!faturamento) return 0;
  // Filtra meses válidos com valor numérico positivo (descarta zerados pra não puxar média pra baixo)
  const valid = sortMeses(faturamento.meses || []).filter(m => {
    if (!m?.mes || !m?.valor) return false;
    const v = numVal(m.valor);
    return isFinite(v) && v > 0;
  });
  const last12 = valid.slice(-12);
  if (last12.length > 0) {
    const sum = last12.reduce((s, m) => s + numVal(m.valor), 0);
    // Divide pela QTD REAL de meses com valor (não fixo em 12) — evita subestimar quando faltam meses
    return sum / last12.length;
  }
  // Sem série mensal: cai pra valores pré-calculados (último recurso)
  if (faturamento.fmm12m) return numVal(faturamento.fmm12m);
  if (faturamento.mediaAno) return numVal(faturamento.mediaAno);
  return 0;
}

function delta(cur:string|undefined,ant:string|undefined):string{
  const c=numVal(cur),a=numVal(ant);
  if(a===0||c===0) return "";
  const d=c-a,pct=Math.round((d/a)*100),up=d>0;
  const color=up?"#dc2626":"#16a34a";
  const barW=Math.min(Math.abs(pct),100);
  return `<span style="font-size:13px;font-weight:900;color:${color};margin-left:6px">${up?"\u25B2":"\u25BC"} ${Math.abs(pct)}%</span><span style="display:inline-block;width:${barW}px;height:6px;background:${color};border-radius:3px;margin-left:6px;vertical-align:middle"></span>`;
}

const TS = "width:100%;border-collapse:separate;border-spacing:0;font-size:11px;margin-bottom:16px;page-break-inside:avoid;border-radius:8px;overflow:hidden;border:1px solid #e0e4ec";

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap');
:root{--navy:#203B88;--green:#73B815;--bg-light:#edf2fb;--bg-card:#f8f9fb;--border:#e0e4ec;--text:#111827;--text-muted:#6b7280}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Open Sans','Helvetica Neue',Arial,sans-serif;font-size:12px;color:var(--text);background:#fff;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;border-top:3px solid #73B815}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;margin-bottom:16px;border-radius:8px;overflow:hidden}
th{background:linear-gradient(135deg,#203B88 0%,#2a4da6 100%);color:#fff;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:10px 12px;text-align:left;border-bottom:3px solid #73B815}
th:first-child{border-radius:8px 0 0 0}
th:last-child{border-radius:0 8px 0 0}
td{padding:10px 12px;border-bottom:1px solid #eef0f4;vertical-align:top;font-size:11px;font-variant-numeric:tabular-nums}
tr:nth-child(even) td{background:#f0f4ff}
tr:nth-child(odd) td{background:#fff}
table{page-break-inside:avoid}
.sec{margin-top:30px}
.sec:nth-child(even){background:#f8f9fb;margin-left:-20px;margin-right:-20px;padding:20px 20px 4px;border-radius:10px}
.avoid{page-break-inside:avoid}
.badge{display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.ok{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
.fail{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
.warn{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
.info{background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe}
.money{text-align:right;font-variant-numeric:tabular-nums}
.neg{color:#dc2626;font-weight:700}
.score-row-ok td{background:rgba(34,197,94,.06) !important}
.score-row-fail td{background:rgba(239,68,68,.06) !important}
.score-row-warn td{background:rgba(245,158,11,.06) !important}
@media print{@page{margin:28mm 16mm 22mm}body::after{content:"Capital Financas · Confidencial";position:fixed;bottom:5mm;left:14mm;font-size:8px;color:#9ca3af}}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: CAPA
// ═══════════════════════════════════════════════════════════════════════════════
function secCapa(p: PDFReportParams): string {
  const c=p.data.cnpj;
  const hoje=new Date();
  const meses=["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const dataFormatada=`${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`;
  return `<div style="page-break-after:always;min-height:260mm;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%, #2a4da6 0%, #203B88 50%, #1a2f6b 100%);text-align:center;padding:40px;position:relative;overflow:hidden">

  <!-- Subtle geometric pattern overlay -->
  <div style="position:absolute;inset:0;opacity:0.04;background-image:radial-gradient(circle, #ffffff 1px, transparent 1px);background-size:24px 24px"></div>

  <!-- Logo + Brand -->
  <div style="margin-bottom:8px;position:relative;z-index:1">
    ${COVER_LOGO_SVG}
  </div>
  <div style="font-family:'Open Sans',Arial,sans-serif;font-size:28px;font-weight:800;color:#fff;letter-spacing:.08em;line-height:1;position:relative;z-index:1">CAPITAL <span style="color:#73B815">FINANCAS</span></div>
  <div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:4px;letter-spacing:.12em;text-transform:uppercase;font-family:'Open Sans',Arial,sans-serif;font-weight:600;position:relative;z-index:1">Analise de Credito</div>

  <!-- Divider -->
  <div style="width:200px;height:1px;background:rgba(255,255,255,.15);margin:28px auto;position:relative;z-index:1"></div>

  <!-- Company Info -->
  <div style="font-family:'Open Sans',Arial,sans-serif;font-size:30px;font-weight:800;color:#fff;line-height:1.15;margin-bottom:8px;max-width:80%;letter-spacing:.03em;position:relative;z-index:1">${esc(c?.razaoSocial||"\u2014")}</div>
  <div style="font-size:13px;color:rgba(255,255,255,.5);font-family:'Open Sans',Arial,sans-serif;font-weight:500;margin-bottom:32px;position:relative;z-index:1">CNPJ: ${fmtCnpj(c?.cnpj)}</div>

  <!-- Rating Gauge -->
  <div style="margin-bottom:16px;position:relative;z-index:1">
    ${ratingGauge(p.finalRating, "large")}
  </div>

  <!-- Decision Badge -->
  <div style="margin-bottom:32px;position:relative;z-index:1">
    ${decisaoBadge(p.decision, true)}
  </div>

  <!-- Date + Confidential -->
  <div style="font-size:11px;color:rgba(255,255,255,.4);font-family:'Open Sans',Arial,sans-serif;position:relative;z-index:1">${dataFormatada}</div>
  <div style="font-size:9px;color:rgba(255,255,255,.25);margin-top:6px;letter-spacing:.08em;text-transform:uppercase;font-family:'Open Sans',Arial,sans-serif;position:relative;z-index:1">Documento confidencial</div>
  <div style="font-size:8px;color:rgba(255,255,255,0.35);margin-top:8px;font-family:'Open Sans',Arial,sans-serif;position:relative;z-index:1">Esta analise e valida por 90 dias a partir de ${dataFormatada}</div>
  <div style="font-size:8px;color:rgba(255,255,255,0.3);margin-top:4px;font-family:'Open Sans',Arial,sans-serif;position:relative;z-index:1">Codigo de verificacao: ${(() => {
    const raw = (c?.cnpj || "") + dataFormatada;
    let h = 0;
    for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h + raw.charCodeAt(i)) | 0; }
    return ("CF-" + Math.abs(h).toString(36).toUpperCase().padStart(8, "0")).substring(0, 14);
  })()}</div>

  ${p.committeMembers ? `<div style="margin-top:24px;text-align:center;position:relative;z-index:1">
    <div style="font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px">Comite de Credito</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:0.03em">${esc(p.committeMembers)}</div>
  </div>` : ""}

</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: CHECKLIST DE DOCUMENTOS
// ═══════════════════════════════════════════════════════════════════════════════
function secChecklist(p: PDFReportParams): string {
  const d=p.data;

  type CheckItem = { label: string; ok: boolean; tipo: "OBR"|"OPC" };

  const frente1: CheckItem[] = [
    { label: "Cartao CNPJ", ok: !!d.cnpj, tipo: "OBR" },
    { label: "QSA / Quadro de Socios", ok: !!(d.qsa?.quadroSocietario?.length), tipo: "OBR" },
    { label: "Contrato Social", ok: !!d.contrato, tipo: "OBR" },
    { label: "Faturamento", ok: !!(d.faturamento?.meses?.length), tipo: "OBR" },
    { label: "DRE", ok: !!(d.dre?.anos?.length), tipo: "OPC" },
    { label: "Balanco Patrimonial", ok: !!(d.balanco?.anos?.length), tipo: "OPC" },
    { label: "Curva ABC - Top Clientes", ok: !!(d.curvaABC?.clientes?.length), tipo: "OPC" },
    { label: "IR dos Socios", ok: !!(d.irSocios?.length), tipo: "OPC" },
    { label: "Relatorio de Visita", ok: !!(d.relatorioVisita && (
      d.relatorioVisita.dataVisita ||
      d.relatorioVisita.responsavelVisita ||
      d.relatorioVisita.localVisita ||
      d.relatorioVisita.descricaoEstrutura ||
      d.relatorioVisita.observacoesLivres ||
      (d.relatorioVisita.pontosPositivos && d.relatorioVisita.pontosPositivos.length > 0) ||
      (d.relatorioVisita.pontosAtencao && d.relatorioVisita.pontosAtencao.length > 0) ||
      d.relatorioVisita.recomendacaoVisitante ||
      d.relatorioVisita.estruturaFisicaConfirmada !== undefined ||
      d.relatorioVisita.funcionariosObservados
    )), tipo: "OPC" },
  ];

  const frente2: CheckItem[] = [
    { label: "SCR / BACEN", ok: !!(d.scr?.periodoReferencia), tipo: "OBR" },
    { label: "SCR Periodo Anterior", ok: !!(d.scrAnterior?.periodoReferencia), tipo: "OPC" },
    { label: "Protestos", ok: d.protestos?.vigentesQtd !== undefined, tipo: "OBR" },
    { label: "Processos Judiciais", ok: d.processos?.passivosTotal !== undefined, tipo: "OBR" },
    { label: "Grupo Economico", ok: !!(d.grupoEconomico?.empresas?.length), tipo: "OPC" },
    { label: "SCR dos Socios", ok: !!(d.scrSocios?.length), tipo: "OPC" },
    { label: "Score Bureau", ok: !!(d.score), tipo: "OPC" },
  ];

  const allDocs = [...frente1, ...frente2];
  const recebidos = allDocs.filter(x => x.ok).length;
  const pct = Math.round((recebidos / allDocs.length) * 100);
  const barColor = pct >= 80 ? "#73B815" : pct >= 50 ? "#f59e0b" : "#dc2626";

  function renderItem(item: CheckItem): string {
    const tipoBg = item.tipo === "OBR" ? "#203B88" : "#9ca3af";
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:${item.ok?"#f0fdf4":"#fff"};border:1px solid ${item.ok?"#bbf7d0":"#f3f4f6"};margin-bottom:6px${item.ok?";box-shadow:0 1px 3px rgba(34,197,94,.08)":""}">
      <span style="font-size:14px;flex-shrink:0">${item.ok?"\u2705":"\u274C"}</span>
      <span style="font-size:10.5px;font-weight:${item.ok?"700":"400"};color:${item.ok?"#111827":"#9ca3af"};flex:1">${esc(item.label)}</span>
      <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${tipoBg};color:#fff;font-size:7.5px;font-weight:800;letter-spacing:.04em;flex-shrink:0">${item.tipo}</span>
    </div>`;
  }

  return `<div class="sec">${secHdr("02","Checklist de Documentos")}
  <!-- Coverage Ribbon -->
  <div style="margin-bottom:18px;padding:14px 20px;border-radius:10px;background:${pct >= 80 ? "linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)" : pct >= 50 ? "linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)" : "linear-gradient(135deg,#fff1f2 0%,#fee2e2 100%)"};border:2px solid ${barColor};text-align:center">
    <div style="font-size:10px;font-weight:800;color:${pct >= 80 ? "#166534" : pct >= 50 ? "#92400e" : "#991b1b"};text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Cobertura da Analise</div>
    <div style="font-size:28px;font-weight:900;color:${barColor}">${pct}%</div>
  </div>
  <div style="margin-bottom:18px;padding:18px 20px;background:linear-gradient(135deg,#f8f9fb 0%,#edf2fb 100%);border-radius:10px;border:1px solid #e0e4ec">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:14px;font-weight:800;color:#111827">${recebidos} de ${allDocs.length} documentos coletados</span>
      <span style="display:inline-block;padding:4px 14px;border-radius:99px;background:${barColor};color:#fff;font-size:12px;font-weight:800">${pct}%</span>
    </div>
    <div style="width:100%;height:14px;background:#e5e7eb;border-radius:8px;overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,.08)">
      <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${barColor},${barColor}dd);border-radius:8px"></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;page-break-inside:avoid">
    <div>
      <div style="font-size:10px;font-weight:800;color:#203B88;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">Frente 1 - Dados Financeiros e Societarios</div>
      ${frente1.map(renderItem).join("")}
    </div>
    <div>
      <div style="font-size:10px;font-weight:800;color:#203B88;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">Frente 2 - Risco e Historico</div>
      ${frente2.map(renderItem).join("")}
    </div>
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: SINTESE PRELIMINAR
// ═══════════════════════════════════════════════════════════════════════════════
function secSintese(p: PDFReportParams): string {
  const { data, finalRating, decision, pontosFortes, pontosFracos, resumoExecutivo, companyAge } = p;

  // Palette (mirrors lib/generators/pdf/sections/sintese.ts C constant)
  const PAL = {
    navy900: "#0c1b3a", navy800: "#132c4e", navy700: "#1a3a6b",
    navy100: "#dce6f5", navy50: "#eef3fb",
    amber500: "#d4960a", amber100: "#fdf3d7", amber50: "#fef9ec",
    red600: "#c53030", red100: "#fee2e2", red50: "#fef2f2",
    green600: "#16653a", green100: "#d1fae5", green50: "#ecfdf5",
    gray900: "#111827", gray700: "#374151", gray500: "#6b7280",
    gray400: "#9ca3af", gray300: "#d1d5db", gray200: "#e5e7eb",
    gray100: "#f3f4f6", gray50: "#f9fafb",
    greenLogo: "#73B815",
  };

  const score = finalRating || 0;
  const scoreColor = score >= 6.5 ? PAL.green600 : score >= 5 ? PAL.amber500 : PAL.red600;
  const scoreLabel = score >= 8 ? "EXCELENTE" : score >= 6.5 ? "SATISFATÓRIO" : score >= 5 ? "MODERADO" : "ALTO RISCO";
  const dec = (decision || "\u2014").replace(/_/g, " ").toUpperCase();
  const decAprov = /APROV/i.test(dec) && !/CONDIC/i.test(dec);
  const decReprov = /REPROV/i.test(dec);
  const decColor = decAprov ? PAL.green600 : decReprov ? PAL.red600 : PAL.amber500;

  // Faturamento series
  const allMesesSorted = sortMeses(data.faturamento?.meses || []).filter(m => m?.mes && m?.valor);
  const last12 = allMesesSorted.slice(-12);
  const fmmNum = computeFmm(data.faturamento);
  const fatTotal12 = last12.reduce((s, m) => s + numVal(m.valor), 0);

  // Risco
  const protQtd = p.protestosVigentes || 0;
  const protVal = numVal(data.protestos?.vigentesValor || "0");
  const ccfQtd = data.ccf?.qtdRegistros ?? null;
  const procPass = parseInt(data.processos?.passivosTotal || "0") || 0;
  const scrVenc = p.vencidosSCR || 0;
  const scrTotalAt = numVal(data.scr?.totalDividasAtivas || "0");
  const scrVencPct = scrTotalAt > 0 ? (scrVenc / scrTotalAt) * 100 : 0;
  const alav = p.alavancagem ?? 0;

  const razao = esc(data.cnpj?.razaoSocial || "\u2014");
  const fantasia = esc(data.cnpj?.nomeFantasia || "");
  const cnpjFmt = fmtCnpj(data.cnpj?.cnpj);
  const situacao = (data.cnpj?.situacaoCadastral || "").toUpperCase().trim();
  const situAtiva = situacao.includes("ATIVA");
  const situBg = situAtiva ? PAL.green100 : PAL.amber100;
  const situFg = situAtiva ? PAL.green600 : PAL.amber500;

  const extractLocal = (endereco: string | undefined): string => {
    if (!endereco) return "\u2014";
    const m = endereco.match(/([A-Za-zÁÂÃÇÉÍÓÔÚáâãçéíóôú \-']{3,})[\s/-]+([A-Z]{2})\b/);
    if (m) return `${m[1].trim()}/${m[2]}`;
    const parts = endereco.split(/[,\-/]/).map(s => s.trim()).filter(Boolean);
    return parts.slice(-2).join("/") || endereco.substring(0, 22);
  };

  // ── BLOCO 1 — Empresa + Rating ─────────────────────────────────────────
  const block1 = `<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid ${PAL.gray200};padding-bottom:8px;margin-bottom:10px;page-break-inside:avoid">
    <div style="flex:2;min-width:0">
      <div style="font:900 13px/1.2 Helvetica,Arial,sans-serif;color:${PAL.navy900}">${razao}</div>
      ${fantasia ? `<div style="font:400 8.5px/1.3 Helvetica,Arial,sans-serif;color:${PAL.gray500};margin-top:2px">${fantasia}</div>` : ""}
      <div style="margin-top:4px;display:flex;align-items:center;gap:6px">
        <span style="font:400 9.5px/1 'Courier New',monospace;color:${PAL.gray700}">${esc(cnpjFmt)}</span>
        ${situacao ? `<span style="display:inline-block;padding:2px 6px;border-radius:3px;background:${situBg};color:${situFg};font:700 8px/1 Helvetica,Arial,sans-serif">${esc(situacao.substring(0,14))}</span>` : ""}
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center">
      <div style="width:60px;height:60px;border-radius:50%;border:2px solid ${scoreColor};display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font:900 18px/1 Helvetica,Arial,sans-serif;color:${scoreColor}">${score.toFixed(1).replace(".", ",")}</div>
        <div style="font:400 7px/1 Helvetica,Arial,sans-serif;color:${PAL.gray400};margin-top:1px">/10</div>
      </div>
      <div style="font:800 8px/1 Helvetica,Arial,sans-serif;color:${scoreColor};margin-top:5px;letter-spacing:.04em">${scoreLabel}</div>
      <div style="display:inline-block;margin-top:4px;padding:3px 8px;background:${decColor};color:#fff;font:700 7px/1 Helvetica,Arial,sans-serif;border-radius:3px;letter-spacing:.04em">${esc(dec)}</div>
    </div>
  </div>`;

  // ── BLOCO 2 — Fundação & Dados Básicos (6 cards) ───────────────────────
  const capSocRaw2 = data.cnpj?.capitalSocialCNPJ || data.qsa?.capitalSocial || "";
  const capSoc2 = capSocRaw2 ? fmtMoneyRound(capSocRaw2) : "\u2014";
  const cells2: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Data Fund.", value: data.cnpj?.dataAbertura || "\u2014" },
    { label: "Idade", value: companyAge || "\u2014" },
    { label: "Porte", value: (data.cnpj?.porte || "\u2014").substring(0, 14) },
    { label: "Cap. Social", value: capSoc2, mono: true },
    { label: "Tipo", value: (data.cnpj?.tipoEmpresa || "\u2014").substring(0, 14) },
    { label: "Local", value: extractLocal(data.cnpj?.endereco) },
  ];
  const block2 = `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:10px;page-break-inside:avoid">
    ${cells2.map(c => `<div style="background:${PAL.gray50};border:1px solid ${PAL.gray100};border-radius:3px;padding:6px 8px;min-width:0">
      <div style="font:700 6.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray400};text-transform:uppercase;letter-spacing:.06em">${esc(c.label)}</div>
      <div style="font:800 9px/1.2 ${c.mono ? "'Courier New',monospace" : "Helvetica,Arial,sans-serif"};color:${c.value === "\u2014" ? PAL.gray400 : PAL.gray900};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.value)}</div>
    </div>`).join("")}
  </div>`;

  // ── BLOCO 3 — Segmento (CNAE) ──────────────────────────────────────────
  const cnaePr = (data.cnpj?.cnaePrincipal || "").trim();
  const cnaeSec = (data.cnpj?.cnaeSecundarios || "").trim();
  let cnaeCode = "";
  let cnaeDesc = cnaePr;
  const cm = cnaePr.match(/^([\d./-]{6,})\s+(.*)$/);
  if (cm) { cnaeCode = cm[1]; cnaeDesc = cm[2]; }
  const block3 = (cnaePr || cnaeSec) ? `<div style="background:${PAL.navy50};border:1px solid ${PAL.navy100};border-radius:3px;padding:8px 10px;margin-bottom:10px;page-break-inside:avoid">
    ${cnaeCode ? `<div style="font:800 9px/1.3 Helvetica,Arial,sans-serif;color:${PAL.navy900}">CNAE ${esc(cnaeCode)}</div>` : ""}
    <div style="font:400 9px/1.4 Helvetica,Arial,sans-serif;color:${PAL.navy700};margin-top:2px">${esc(cnaeDesc || "\u2014")}</div>
    ${cnaeSec ? `<div style="font:400 8.5px/1.4 Helvetica,Arial,sans-serif;color:${PAL.navy700};margin-top:3px">CNAEs sec.: ${esc(cnaeSec)}</div>` : ""}
  </div>` : "";

  // ── BLOCO 4 — Foto + Endereço (CONDITIONAL) ────────────────────────────
  const svRaw = p.streetViewBase64;
  const svValid = typeof svRaw === "string" && svRaw.length > 100
    && (svRaw.startsWith("data:image") || svRaw.startsWith("http") || svRaw.startsWith("/9j/") || svRaw.startsWith("iVBOR"));
  const svSrc = svValid
    ? (svRaw!.startsWith("data:") || svRaw!.startsWith("http") ? svRaw! : `data:image/jpeg;base64,${svRaw}`)
    : "";
  const addressCard = `<div style="background:${PAL.gray50};border:1px solid ${PAL.gray100};border-radius:3px;padding:12px 14px;min-width:0">
      <div style="font:700 7.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray400};text-transform:uppercase;letter-spacing:.06em">Endereço</div>
      <div style="font:400 10px/1.5 Helvetica,Arial,sans-serif;color:${PAL.gray700};margin-top:5px">${esc(data.cnpj?.endereco || "\u2014")}</div>
    </div>`;
  const block4 = svValid ? `<div style="display:flex;gap:8px;margin-bottom:10px;page-break-inside:avoid">
    <img src="${svSrc}" style="width:50%;height:120px;object-fit:cover;border-radius:3px;border:1px solid ${PAL.gray200}" alt="Street View" />
    <div style="flex:1;min-width:0">${addressCard}</div>
  </div>` : `<div style="margin-bottom:10px;page-break-inside:avoid">${addressCard}</div>`;

  // ── BLOCO 5 — Estrutura Societária ─────────────────────────────────────
  const socios = (data.qsa?.quadroSocietario || []).filter(s => s?.nome || s?.cpfCnpj);
  const empresas = data.grupoEconomico?.empresas || [];
  const hasBlock5 = socios.length > 0 || empresas.length > 0;

  const socioRows5 = socios.map(s => {
    const digits = (s.cpfCnpj || "").replace(/\D/g, "");
    const docFmt = digits.length > 11 ? fmtCnpj(s.cpfCnpj) : digits.length > 0 ? fmtCpf(s.cpfCnpj) : "\u2014";
    return `<tr>
      <td><strong>${esc(s.nome || "\u2014")}</strong></td>
      <td>${docFmt}</td>
      <td>${esc(s.qualificacao || "\u2014")}</td>
      <td style="text-align:right">${esc(s.participacao || "\u2014")}</td>
    </tr>`;
  }).join("");

  const capSocStr5 = data.qsa?.capitalSocial
    ? fmtMoneyRound(data.qsa.capitalSocial)
    : data.cnpj?.capitalSocialCNPJ
      ? fmtMoneyRound(data.cnpj.capitalSocialCNPJ)
      : "\u2014";
  const grupoStr5 = empresas.length > 0 ? `${empresas.length} empresa(s)` : "Não identificado";

  const block5 = hasBlock5 ? `<div style="margin-bottom:10px;page-break-inside:avoid">
    <div style="font:800 7.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray500};text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">GESTÃO &amp; GRUPO ECONÔMICO</div>
    ${socios.length > 0 ? `<table style="${TS};margin-bottom:5px;font-size:9px">
      <thead><tr>${["Nome","CPF/CNPJ","Qualificação","Part."].map(h => `<th style="background:${PAL.navy900};border-bottom:none;color:#fff">${h}</th>`).join("")}</tr></thead>
      <tbody>${socioRows5}</tbody>
    </table>` : ""}
    <div style="font:400 8.5px/1.4 Helvetica,Arial,sans-serif;color:${PAL.gray500}">Capital Social: ${capSocStr5} · Grupo Econômico: ${grupoStr5}</div>
  </div>` : "";

  // ── BLOCO 6 — Indicadores de Risco ─────────────────────────────────────
  type RiskTone = "red" | "green" | "amber" | "gray";
  const toneCss = (t: RiskTone) => {
    switch (t) {
      case "red":   return { bg: PAL.red50,    bd: PAL.red100,    fg: PAL.red600   };
      case "green": return { bg: PAL.green50,  bd: PAL.green100,  fg: PAL.green600 };
      case "amber": return { bg: PAL.amber50,  bd: PAL.amber100,  fg: PAL.amber500 };
      default:      return { bg: PAL.gray50,   bd: PAL.gray100,   fg: PAL.gray400  };
    }
  };
  const cells6: Array<{ label: string; value: string; sub: string; tone: RiskTone }> = [
    {
      label: "Protestos",
      value: protQtd > 0 ? String(protQtd) : "0",
      sub: protQtd > 0 ? fmtMoneyRound(String(protVal)) : "sem ocorr.",
      tone: protQtd > 2 ? "red" : "green",
    },
    {
      label: "CCF",
      value: ccfQtd == null ? "\u2014" : String(ccfQtd),
      sub: ccfQtd == null ? "n/c" : ccfQtd > 0 ? "ocorr." : "limpo",
      tone: ccfQtd == null ? "gray" : ccfQtd > 0 ? "red" : "green",
    },
    {
      label: "Processos",
      value: String(procPass),
      sub: "polo passivo",
      tone: procPass > 0 ? "red" : data.processos ? "green" : "gray",
    },
    {
      label: "SCR Venc.",
      value: scrVenc > 0 ? fmtMoneyRound(String(scrVenc)) : "\u2014",
      sub: scrTotalAt > 0 ? `${scrVencPct.toFixed(1)}% do total` : "em dia",
      tone: scrVencPct > 10 ? "red" : scrVenc > 0 ? "amber" : "green",
    },
    {
      label: "Alavancagem",
      value: alav > 0 ? `${alav.toFixed(2)}x` : "\u2014",
      sub: alav > 5 ? "alto" : alav > 3 ? "atenção" : alav > 0 ? "saudável" : "s/ dados",
      tone: alav > 5 ? "red" : alav > 3 ? "amber" : alav > 0 ? "green" : "gray",
    },
  ];
  const block6Cards = cells6.map(c => {
    const t = toneCss(c.tone);
    return `<div style="background:${t.bg};border:1px solid ${t.bd};border-radius:3px;padding:8px 10px;min-width:0">
      <div style="font:700 6.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray400};text-transform:uppercase;letter-spacing:.06em">${esc(c.label)}</div>
      <div style="font:900 14px/1.1 Helvetica,Arial,sans-serif;color:${t.fg};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.value)}</div>
      <div style="font:400 7.5px/1.2 Helvetica,Arial,sans-serif;color:${PAL.gray500};margin-top:3px">${esc(c.sub)}</div>
    </div>`;
  }).join("");
  const allHigh6 = (p.alertsHigh || []).slice(0, 2);
  const allMed6 = (p.alerts || []).filter(a => a.severity === "MODERADA").slice(0, 2);
  const alertBanners6 = [...allHigh6, ...allMed6].slice(0, 4).map(a => {
    const isHigh = a.severity === "ALTA";
    const bg = isHigh ? PAL.red50 : PAL.amber50;
    const bd = isHigh ? PAL.red100 : PAL.amber100;
    const fg = isHigh ? PAL.red600 : PAL.amber500;
    return `<div style="background:${bg};border:1px solid ${bd};border-left:3px solid ${fg};border-radius:2px;padding:5px 8px;margin-top:4px;font:600 8.5px/1.3 Helvetica,Arial,sans-serif;color:${PAL.gray700}">${esc(a.message)}</div>`;
  }).join("");
  const block6 = `<div style="margin-bottom:10px;page-break-inside:avoid">
    <div style="font:800 7.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray500};text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">INDICADORES DE RISCO</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${block6Cards}</div>
    ${alertBanners6}
  </div>`;

  // ── BLOCO 7 — Faturamento + SCR comparativo ───────────────────────────
  const scr = data.scr;
  const scrAnt = data.scrAnterior;
  const hasFat7 = last12.length > 0;
  const hasScr7 = !!(scr && scr.periodoReferencia);
  const hasScrAnt7 = !!(scrAnt && scrAnt.periodoReferencia);

  const maxVal7 = Math.max(...last12.map(m => numVal(m.valor)), 1);
  let varPct7 = 0;
  if (last12.length >= 6) {
    const values = last12.map(m => numVal(m.valor));
    const rec = values.slice(-3).reduce((a, b) => a + b, 0);
    const ant = values.slice(-6, -3).reduce((a, b) => a + b, 0);
    if (ant > 0) varPct7 = ((rec - ant) / ant) * 100;
  }
  const upTrend7 = varPct7 > 2;
  const trendArrow7 = varPct7 > 2 ? "\u2191" : varPct7 < -2 ? "\u2193" : "\u2192";

  const bars7 = last12.map((m, i) => {
    const v = numVal(m.valor);
    const isHi = i >= last12.length - 3 && upTrend7;
    const c = v === 0 ? PAL.gray300 : isHi ? PAL.greenLogo : PAL.navy800;
    const hPct = (v / maxVal7) * 100;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;min-width:0">
      <div style="width:100%;background:${c};height:${hPct}%;min-height:1px"></div>
      <div style="font:400 5.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray500};white-space:nowrap;overflow:hidden">${esc((m.mes || "").substring(0, 5))}</div>
    </div>`;
  }).join("");

  const fatPanel7 = hasFat7 ? `<div style="flex:1;background:${PAL.gray50};border:1px solid ${PAL.gray100};border-radius:3px;padding:8px 10px;min-width:0">
    <div style="font:700 6.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray500};text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Faturamento</div>
    <div style="display:flex;align-items:flex-end;gap:2px;height:55px">${bars7}</div>
    <div style="font:400 7.5px/1.3 Helvetica,Arial,sans-serif;color:${PAL.gray700};margin-top:5px">FMM ${fmtMoneyRound(String(fmmNum))} · Total ${fmtMoneyRound(String(fatTotal12))} · ${trendArrow7} ${varPct7.toFixed(0)}%</div>
  </div>` : "";

  const sr7 = (k: string) => numVal(String((scr as unknown as Record<string, string>)?.[k] || "0"));
  const srAnt7 = (k: string) => numVal(String((scrAnt as unknown as Record<string, string> | null)?.[k] || "0"));
  const scrRows7: Array<{ label: string; cur: number; prev: number; bold?: boolean }> = [
    { label: "Carteira A/V", cur: sr7("carteiraAVencer"), prev: srAnt7("carteiraAVencer") },
    { label: "Vencidos",     cur: sr7("vencidos"),         prev: srAnt7("vencidos") },
    { label: "Prejuízos",    cur: sr7("prejuizos"),        prev: srAnt7("prejuizos") },
    { label: "Total Dívidas",cur: sr7("totalDividasAtivas"),prev: srAnt7("totalDividasAtivas"), bold: true },
  ];
  const scrRowsHtml7 = scrRows7.map(r => {
    let varHtml = `<td style="color:${PAL.gray400}">\u2014</td>`;
    if (r.prev > 0 && r.cur > 0) {
      const pct = ((r.cur - r.prev) / r.prev) * 100;
      const vColor = pct > 2 ? PAL.red600 : pct < -2 ? PAL.green600 : PAL.gray500;
      varHtml = `<td style="color:${vColor};font-weight:700">${pct > 0 ? "+" : ""}${pct.toFixed(0)}%</td>`;
    }
    return `<tr style="font-weight:${r.bold ? "800" : "400"}">
      <td>${r.label}</td>
      <td class="money">${r.cur > 0 ? fmtMoneyRound(r.cur) : "\u2014"}</td>
      <td class="money">${r.prev > 0 ? fmtMoneyRound(r.prev) : "\u2014"}</td>
      ${varHtml}
    </tr>`;
  }).join("");
  const scrPanel7 = (hasScr7 && hasScrAnt7) ? `<div style="flex:1;background:${PAL.gray50};border:1px solid ${PAL.gray100};border-radius:3px;padding:8px 10px;min-width:0">
    <div style="font:700 6.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray500};text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">SCR ${esc(scrAnt!.periodoReferencia)} → ${esc(scr!.periodoReferencia)}</div>
    <table style="width:100%;font-size:9px;border-collapse:collapse">
      <thead><tr>${["Métrica","Atual","Ant.","Var%"].map(h => `<th style="background:${PAL.navy900};border-bottom:none;color:#fff;font-size:8.5px">${h}</th>`).join("")}</tr></thead>
      <tbody>${scrRowsHtml7}</tbody>
    </table>
  </div>` : "";
  const block7 = (hasFat7 || hasScr7) ? `<div style="display:flex;gap:8px;margin-bottom:10px;page-break-inside:avoid">
    ${fatPanel7}
    ${scrPanel7}
  </div>` : "";

  // ── BLOCO 8 — Curva ABC (CONDITIONAL) ──────────────────────────────────
  const clientes = data.curvaABC?.clientes || [];
  let block8 = "";
  if (clientes.length > 0) {
    const top5 = clientes.slice(0, 5);
    const baseTotal = numVal(data.curvaABC?.receitaTotalBase || "0");
    const pctOf = (c: { valorFaturado: string; percentualReceita: string }) => {
      const v = numVal(c.valorFaturado);
      if (baseTotal > 0) return (v / baseTotal) * 100;
      return parseFloat(String(c.percentualReceita).replace(",", ".").replace("%", "")) || 0;
    };
    let acum = 0;
    const rows8 = top5.map((c, i) => {
      const pct = pctOf(c);
      acum += pct;
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${esc(c.nome || "\u2014")}</strong></td>
        <td class="money">${fmtMoneyRound(c.valorFaturado)}</td>
        <td>${pct.toFixed(1)}%</td>
        <td>${acum.toFixed(1)}%</td>
        <td style="text-align:center">${esc(c.classe || "\u2014")}</td>
      </tr>`;
    }).join("");
    const top3 = top5.slice(0, 3).reduce((s, c) => s + pctOf(c), 0);
    const totalCli = data.curvaABC?.totalClientesNaBase || clientes.length;
    const top1 = pctOf(top5[0]);
    const concAlert = top1 > 30 ? `<div style="background:${PAL.red50};border:1px solid ${PAL.red100};border-left:3px solid ${PAL.red600};border-radius:2px;padding:5px 8px;margin-top:4px;font:600 8.5px/1.3 Helvetica,Arial,sans-serif;color:${PAL.gray700}">Concentração elevada: maior cliente representa ${top1.toFixed(0)}% da receita</div>` : "";
    block8 = `<div style="margin-bottom:10px;page-break-inside:avoid">
      <div style="font:800 7.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray500};text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">CURVA ABC — TOP 5 CLIENTES</div>
      <table style="${TS};margin-bottom:5px;font-size:9px">
        <thead><tr>${["#","Cliente","Faturamento","% Rec.","% Acum.","Cl."].map(h => `<th style="background:${PAL.navy900};border-bottom:none;color:#fff">${h}</th>`).join("")}</tr></thead>
        <tbody>${rows8}</tbody>
      </table>
      <div style="font:400 8.5px/1.4 Helvetica,Arial,sans-serif;color:${PAL.gray500}">Top 3: ${top3.toFixed(0)}% · Top 5: ${acum.toFixed(0)}% · Total clientes: ${totalCli}</div>
      ${concAlert}
    </div>`;
  }

  // ── BLOCO 9 — Pleito (CONDITIONAL) ─────────────────────────────────────
  const rv = data.relatorioVisita;
  const hasPleito = !!(rv && (rv.pleito || rv.limiteTotal || rv.modalidade || rv.prazoMaximoOp || rv.taxaConvencional));
  const block9 = hasPleito ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;page-break-inside:avoid">
    ${[
      { label: "Valor Pleiteado", value: rv!.limiteTotal ? fmtMoneyRound(rv!.limiteTotal) : (rv!.pleito || "\u2014"), mono: !!rv!.limiteTotal },
      { label: "Modalidade", value: (rv!.modalidade || "\u2014").toUpperCase() },
      { label: "Prazo Máx.", value: rv!.prazoMaximoOp ? `${rv!.prazoMaximoOp} dias` : "\u2014" },
      { label: "Taxa", value: rv!.taxaConvencional ? `${rv!.taxaConvencional}%` : "\u2014" },
    ].map(c => `<div style="background:${PAL.navy50};border:1px solid ${PAL.navy100};border-radius:3px;padding:8px 10px">
      <div style="font:700 6.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray400};text-transform:uppercase;letter-spacing:.06em">${esc(c.label)}</div>
      <div style="font:800 11px/1.2 ${c.mono ? "'Courier New',monospace" : "Helvetica,Arial,sans-serif"};color:${PAL.navy900};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.value)}</div>
    </div>`).join("")}
  </div>` : "";

  // ── BLOCO 10 — Análise (Fortes / Fracos / Alertas) ─────────────────────
  const fortes10 = (pontosFortes || []).slice(0, 6);
  const fracos10 = (pontosFracos || []).slice(0, 6);
  const moderados10 = (p.alerts || []).filter(a => a.severity === "MODERADA").map(a => a.message).slice(0, 6);
  const hasBlock10 = fortes10.length > 0 || fracos10.length > 0 || moderados10.length > 0;
  const cols10 = [
    { title: "PONTOS FORTES", items: fortes10,    bg: PAL.green50, bd: PAL.green100, fg: PAL.green600 },
    { title: "PONTOS FRACOS", items: fracos10,    bg: PAL.red50,   bd: PAL.red100,   fg: PAL.red600 },
    { title: "ALERTAS",       items: moderados10, bg: PAL.amber50, bd: PAL.amber100, fg: PAL.amber500 },
  ];
  const block10 = hasBlock10 ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;page-break-inside:avoid">
    ${cols10.map(col => `<div style="background:${col.bg};border:1px solid ${col.bd};border-radius:3px;padding:8px 10px;min-height:80px">
      <div style="font:800 7.5px/1 Helvetica,Arial,sans-serif;color:${col.fg};text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid ${col.bd};padding-bottom:3px">${col.title}</div>
      <ul style="list-style:none;padding:0;margin:5px 0 0 0">${col.items.slice(0, 5).map(it => `<li style="font:400 7.5px/1.4 Helvetica,Arial,sans-serif;color:${PAL.gray700};padding:2px 0 2px 8px;position:relative"><span style="position:absolute;left:0;top:2px;color:${col.fg};font-weight:700">•</span>${esc(it)}</li>`).join("")}</ul>
    </div>`).join("")}
  </div>` : "";

  // ── BLOCO 11 — Percepção do Analista (CONDITIONAL) ─────────────────────
  const parecerObj11 = typeof p.aiAnalysis?.parecer === "object" && p.aiAnalysis?.parecer !== null
    ? p.aiAnalysis.parecer as { resumoExecutivo?: string; textoCompleto?: string }
    : null;
  let parecerTxt11 = (resumoExecutivo
    || parecerObj11?.resumoExecutivo
    || parecerObj11?.textoCompleto
    || (typeof p.aiAnalysis?.parecer === "string" ? p.aiAnalysis.parecer : "")
    || p.aiAnalysis?.sinteseExecutiva
    || "").trim();
  if (parecerTxt11.length > 600) parecerTxt11 = parecerTxt11.substring(0, 600).trimEnd() + "\u2026";
  const block11 = parecerTxt11 ? `<div style="background:${PAL.gray50};border:1px solid ${PAL.gray200};border-radius:4px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid">
    <div style="font:400 9px/1.5 Helvetica,Arial,sans-serif;color:${PAL.gray700}">${esc(parecerTxt11)}</div>
    <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
      <span style="font:400 8.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray500}">Recomendação:</span>
      <span style="display:inline-block;padding:3px 8px;background:${decColor};color:#fff;font:700 7.5px/1 Helvetica,Arial,sans-serif;border-radius:3px;letter-spacing:.04em">${esc(dec)}</span>
    </div>
    <div style="font:400 7.5px/1 Helvetica,Arial,sans-serif;color:${PAL.gray400};margin-top:5px">Ver parecer completo na seção 02.</div>
  </div>` : "";

  return `<div class="sec" style="padding:8px 14px">
  ${block1}
  ${block2}
  ${block3}
  ${block4}
  ${block5}
  ${block6}
  ${block7}
  ${block8}
  ${block9}
  ${block10}
  ${block11}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3.5: PARECER PRELIMINAR
// ═══════════════════════════════════════════════════════════════════════════════
function secParecer(p: PDFReportParams): string {
  // Resolve data from multiple possible sources
  const parecerObj = p.aiAnalysis?.parecer;
  const parecerIsObj = parecerObj && typeof parecerObj === "object";

  const textoCompleto = parecerIsObj ? (parecerObj as { textoCompleto?: string }).textoCompleto : undefined;

  const resumo = p.resumoExecutivo
    || (parecerIsObj ? (parecerObj as { resumoExecutivo?: string }).resumoExecutivo : undefined)
    || p.aiAnalysis?.sinteseExecutiva
    || "";

  const pontosFortes: string[] = p.pontosFortes?.length
    ? p.pontosFortes
    : (parecerIsObj ? ((parecerObj as { pontosFortes?: string[] }).pontosFortes || []) : []);

  const pontosFracos: string[] = p.pontosFracos?.length
    ? p.pontosFracos
    : (parecerIsObj ? ((parecerObj as { pontosNegativosOuFracos?: string[] }).pontosNegativosOuFracos || []) : []);

  const perguntasVisita: { pergunta: string; contexto: string }[] = p.perguntasVisita?.length
    ? p.perguntasVisita
    : (parecerIsObj ? ((parecerObj as { perguntasVisita?: { pergunta: string; contexto: string }[] }).perguntasVisita || []) : []);

  const rc = p.finalRating >= 7 ? "#16a34a" : p.finalRating >= 4 ? "#d97706" : "#dc2626";

  // Diagnostico: lista o que veio do Gemini e o que nao veio
  const aiOk = !!p.aiAnalysis;
  const fieldsStatus = [
    { label: "Resumo executivo", ok: !!resumo },
    { label: "Análise completa", ok: !!textoCompleto },
    { label: "Pontos fortes", ok: pontosFortes.length > 0 },
    { label: "Pontos fracos", ok: pontosFracos.length > 0 },
    { label: "Perguntas para visita", ok: perguntasVisita.length > 0 },
  ];
  const allEmpty = !resumo && !textoCompleto && pontosFortes.length === 0 && pontosFracos.length === 0 && perguntasVisita.length === 0;

  // Banner placeholder quando o parecer nao foi gerado/veio vazio
  const placeholderBanner = allEmpty ? `<div style="padding:16px 20px;background:#fffbeb;border-left:4px solid #d97706;border-radius:0 8px 8px 0;margin-bottom:20px">
    <div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:8px">${aiOk ? "Parecer da IA veio vazio" : "Parecer ainda não foi gerado pela IA"}</div>
    <div style="font-size:11px;color:#78350f;line-height:1.7;margin-bottom:10px">${aiOk
      ? "O endpoint /api/analyze foi chamado mas o Gemini não retornou nenhum dos campos esperados (resumo, pontos fortes/fracos, análise completa, perguntas de visita). Provavel falha de parsing JSON ou rate limit. Tente clicar em <strong>Analisar com IA</strong> novamente."
      : "Antes de gerar o relatório, clique no botão <strong>Analisar com IA</strong> para que o Gemini produza o parecer (resumo executivo, pontos fortes, pontos fracos, análise completa e perguntas de visita)."}
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px">
      ${fieldsStatus.map(f => `<div style="padding:6px 8px;background:${f.ok ? '#dcfce7' : '#fee2e2'};border:1px solid ${f.ok ? '#bbf7d0' : '#fecaca'};border-radius:6px;text-align:center">
        <div style="font-size:9px;font-weight:700;color:${f.ok ? '#166534' : '#991b1b'}">${f.ok ? '✓' : '✗'} ${esc(f.label)}</div>
      </div>`).join("")}
    </div>
  </div>` : "";

  return `<div class="sec">${secHdr("03b","Parecer Preliminar")}
  ${placeholderBanner}

  <!-- Decision banner with rating -->
  <div style="display:flex;align-items:center;justify-content:center;gap:24px;padding:20px;margin-bottom:20px;background:linear-gradient(135deg,#f8f9fb 0%,#edf2fb 100%);border-radius:12px;border:1px solid #e0e4ec">
    <div style="text-align:center">
      <div style="font-size:36px;font-weight:900;color:${rc};line-height:1">${p.finalRating}</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:2px">/ 10</div>
    </div>
    <div style="width:1px;height:50px;background:#e0e4ec"></div>
    <div>${decisaoBadge(p.decision, true)}</div>
  </div>

  ${resumo ? `<!-- Resumo Executivo -->
  ${subTitle("Resumo Executivo")}
  <div style="background:linear-gradient(135deg,#f8f9fb 0%,#edf2fb 100%);border-left:4px solid #203B88;border-radius:0 8px 8px 0;padding:16px 18px;font-size:12px;line-height:1.8;color:#374151;page-break-inside:avoid;margin-bottom:20px">${esc(resumo)}</div>` : ""}

  ${textoCompleto ? `<!-- Analise Completa -->
  ${subTitle("Analise de Credito")}
  <div style="background:#fff;border:1px solid #e0e4ec;border-radius:8px;padding:18px 20px;font-size:11.5px;line-height:1.9;color:#374151;page-break-inside:avoid;margin-bottom:20px;text-align:justify">${textoCompleto.split(/\n\n|\n/).filter(p => p.trim()).map(p => `<p style="margin:0 0 12px 0">${esc(p.trim())}</p>`).join("")}</div>` : ""}

  ${pontosFortes.length > 0 ? `<!-- Pontos Fortes -->
  ${subTitle("Pontos Fortes")}
  <div style="margin-bottom:20px">${pontosFortes.map(pt =>
    `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:8px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:0 8px 8px 0;page-break-inside:avoid">
      <span style="color:#22c55e;font-size:14px;font-weight:900;flex-shrink:0;line-height:1.3">\u2713</span>
      <span style="font-size:11px;color:#166534;line-height:1.6;font-weight:500">${esc(pt)}</span>
    </div>`
  ).join("")}</div>` : ""}

  ${pontosFracos.length > 0 ? `<!-- Pontos Fracos -->
  ${subTitle("Pontos Fracos")}
  <div style="margin-bottom:20px">${pontosFracos.map(pt =>
    `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:8px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;page-break-inside:avoid">
      <span style="color:#ef4444;font-size:14px;font-weight:900;flex-shrink:0;line-height:1.3">\u2717</span>
      <span style="font-size:11px;color:#991b1b;line-height:1.6;font-weight:500">${esc(pt)}</span>
    </div>`
  ).join("")}</div>` : ""}

  ${perguntasVisita.length > 0 ? `<!-- Perguntas para a Visita -->
  ${subTitle("Perguntas para a Visita")}
  <div style="margin-bottom:20px">${perguntasVisita.map((pv, i) =>
    `<div style="padding:12px 14px;margin-bottom:10px;background:#fff;border:1px solid #e0e4ec;border-radius:8px;page-break-inside:avoid">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#203B88;color:#fff;font-size:10px;font-weight:800;border-radius:50%;flex-shrink:0">${i + 1}</span>
        <div>
          <div style="font-size:11px;font-weight:700;color:#111827;line-height:1.5">${esc(pv.pergunta)}</div>
          ${pv.contexto ? `<div style="font-size:9.5px;color:#9ca3af;margin-top:4px;line-height:1.5;font-style:italic">${esc(pv.contexto)}</div>` : ""}
        </div>
      </div>
    </div>`
  ).join("")}</div>` : ""}

</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: PARAMETROS OPERACIONAIS DO CEDENTE
// ═══════════════════════════════════════════════════════════════════════════════
function secParametros(p: PDFReportParams): string {
  const v=p.data.relatorioVisita;
  const cl=p.creditLimit;
  const params:[string,string][]=[
    ["Taxa Convencional",v?.taxaConvencional?v.taxaConvencional+"%":"\u2014"],
    ["Taxa Comissaria",v?.taxaComissaria?v.taxaComissaria+"%":"\u2014"],
    ["Limite Total",fmtMoney(v?.limiteTotal||cl?.limiteAjustado)],
    ["Limite Convencional",fmtMoney(v?.limiteConvencional)],
    ["Limite Comissaria",fmtMoney(v?.limiteComissaria)],
    ["Limite por Sacado",fmtMoney(v?.limitePorSacado||cl?.limiteConcentracao)],
    ["Ticket Medio",fmtMoney(v?.ticketMedio)],
    ["Valor Cobranca de Boleto",fmt(v?.valorCobrancaBoleto)],
    ["Prazo Recompra",v?.prazoRecompraCedente?v.prazoRecompraCedente+" dias":"\u2014"],
    ["Envio Cartorio",v?.prazoEnvioCartorio?v.prazoEnvioCartorio+" dias":"\u2014"],
    ["Prazo Maximo",v?.prazoMaximoOp?v.prazoMaximoOp+" dias":(cl?.prazo?cl.prazo+" dias":"\u2014")],
    ["Cobranca TAC",fmt(v?.cobrancaTAC)],
    ["Tranche",fmtMoney(v?.tranche)],
    ["Prazo em Tranche",fmt(v?.prazoTranche)],
  ];
  return `<div class="sec">${secHdr("04","Parametros Operacionais do Cedente")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    ${params.map(([l,v2])=>dataCard(l,v2)).join("")}
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: CONFORMIDADE COM AS POLITICAS DO FUNDO
// ═══════════════════════════════════════════════════════════════════════════════
function secFundo(p: PDFReportParams): string {
  if(!p.fundValidation||!p.fundValidation.criteria.length) return "";
  const fv=p.fundValidation;
  const aprov=fv.failCount===0&&!fv.hasEliminatoria;
  const vClr=aprov?"#166534":"#991b1b";
  const vBg=aprov?"#f0fdf4":"#fff1f2";
  const vBrd=aprov?"#86efac":"#fca5a5";

  // Collect failed eliminatorio criteria for alert boxes
  const failedEliminatorios = fv.criteria.filter((cr: FundCriterion) => cr.eliminatoria && cr.status !== "ok");

  return `<div class="sec">${secHdr("05","Conformidade com as Politicas do Fundo")}
  <table style="${TS}">
    <thead>${row(["Criterio","Limite","Apurado","Status"],true)}</thead>
    <tbody>${fv.criteria.map((cr: FundCriterion)=>{
      const ok=cr.status==="ok",err=cr.status==="error";
      const st=ok?"ok":err?"fail":"warn";
      const stLabel=ok?"APROVADO":err?"REPROVADO":"ATENCAO";
      return `<tr><td style="border-left:3px solid ${ok?"#16a34a":err?"#dc2626":"#d97706"}"><strong>${esc(cr.label)}</strong></td><td>${esc(cr.threshold)}</td><td style="font-weight:700">${esc(cr.actual||"\u2014")}</td><td style="text-align:center">${statusBadge(stLabel,st)}</td></tr>`;
    }).join("")}</tbody>
  </table>
  ${failedEliminatorios.length > 0 ? failedEliminatorios.map((cr: FundCriterion) =>
    `<div style="display:flex;gap:12px;align-items:flex-start;background:#fff1f2;border-left:5px solid #ef4444;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:10px;page-break-inside:avoid;box-shadow:0 1px 4px rgba(0,0,0,.04)">
      <span style="font-size:18px;flex-shrink:0;line-height:1">\u26A0\uFE0F</span>
      <div>
        <div style="font-size:8.5px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">CRITERIO ELIMINATORIO NAO ATENDIDO</div>
        <div style="font-size:11px;color:#991b1b;line-height:1.55">${esc(cr.label)}${cr.actual ? ". Apurado: " + esc(cr.actual) : ""}</div>
      </div>
    </div>`
  ).join("") : ""}
  <div style="border-radius:10px;padding:16px 20px;background:${vBg};border:2px solid ${vBrd};page-break-inside:avoid;box-shadow:0 2px 8px rgba(0,0,0,.04)">
    <div style="font-size:14px;font-weight:800;color:${vClr}">${aprov?"\u2713 ELEGIVEL - Todos os criterios atendidos":"\u2717 NAO ELEGIVEL - Criterio(s) nao atendido(s)"}</div>
    <div style="font-size:10px;color:#9ca3af;margin-top:4px">${fv.passCount} de ${fv.criteria.length} criterios aprovados</div>
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: FATURAMENTO
// ═══════════════════════════════════════════════════════════════════════════════
function secFaturamento(p: PDFReportParams): string {
  const fat=p.data.faturamento;
  if(!fat||!fat.meses?.length) return `<div class="sec">${secHdr("06","Faturamento")}<div style="color:#9ca3af;font-size:11px">Dados de faturamento nao disponiveis.</div></div>`;
  const meses=sortMeses(fat.meses);

  // FMM - correct calculation (always /12)
  const fmmNum = computeFmm(fat);

  // Last 12 months for media and total
  const validMeses = meses.filter(m => m?.mes && m?.valor);
  const last12 = validMeses.slice(-12);
  const values12 = last12.map(m => numVal(m.valor));
  const total12 = values12.reduce((s, v) => s + v, 0);
  const media12 = values12.length > 0 ? total12 / values12.length : 0;

  const lastThree = values12.slice(-3);
  const prevThree = values12.slice(-6, -3);
  const tendencia = prevThree.length >= 3 && lastThree.length >= 3
    ? (lastThree.reduce((s,v)=>s+v,0)/3 > prevThree.reduce((s,v)=>s+v,0)/3 ? "\u25B2 Crescente" : "\u25BC Decrescente")
    : "\u2014";
  const tendColor = tendencia.includes("Crescente") ? "#16a34a" : tendencia.includes("Decrescente") ? "#dc2626" : "#6b7280";

  // Trend indicator: last 3 months vs previous 3 months
  const trendHtml = (() => {
    if (prevThree.length < 3 || lastThree.length < 3) return "";
    const sumLast = lastThree.reduce((s, v) => s + v, 0);
    const sumPrev = prevThree.reduce((s, v) => s + v, 0);
    if (sumPrev === 0) return "";
    const pctChange = ((sumLast - sumPrev) / sumPrev) * 100;
    const absPct = Math.abs(pctChange).toFixed(1);
    if (pctChange > 5) {
      return `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:99px;background:#dcfce7;border:1px solid #bbf7d0;margin-bottom:14px">
        <span style="font-size:14px;color:#16a34a;font-weight:900">\u2191</span>
        <span style="font-size:10px;font-weight:700;color:#166534">Crescimento de ${absPct}% (ultimos 3 meses vs anteriores)</span>
      </div>`;
    }
    if (pctChange < -5) {
      return `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:99px;background:#fee2e2;border:1px solid #fecaca;margin-bottom:14px">
        <span style="font-size:14px;color:#dc2626;font-weight:900">\u2193</span>
        <span style="font-size:10px;font-weight:700;color:#991b1b">Queda de ${absPct}% (ultimos 3 meses vs anteriores)</span>
      </div>`;
    }
    return `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:99px;background:#f3f4f6;border:1px solid #e5e7eb;margin-bottom:14px">
      <span style="font-size:14px;color:#6b7280;font-weight:900">\u2192</span>
      <span style="font-size:10px;font-weight:700;color:#6b7280">Estavel (variacao de ${absPct}%)</span>
    </div>`;
  })();

  return `<div class="sec">${secHdr("06","Faturamento")}
  ${grid(4,[
    kpi("FMM 12m", fmmNum > 0 ? fmtMoneyRound(String(fmmNum)) : "\u2014", "#203B88", "media mensal"),
    kpi("Total (12m)", fmtMoneyRound(String(total12)), "#111827", `soma ultimos 12 meses`),
    kpi("Meses", String(last12.length), "#111827", media12 > 0 ? `media ${fmtMoneyRound(String(media12))}` : undefined),
    kpi("Tendencia", tendencia, tendColor),
  ])}
  ${trendHtml}
  ${faturamentoChart(meses, fmmNum > 0 ? fmmNum : undefined)}
  <table style="${TS}">
    <thead>${row(["Mes","Faturamento (R$)"],true)}</thead>
    <tbody>${meses.map(m=>row([esc(m.mes),`<span class="money">${fmtMoney(m.valor)}</span>`])).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: PROTESTOS
// ═══════════════════════════════════════════════════════════════════════════════
function secProtestos(p: PDFReportParams): string {
  const prot=p.data.protestos;
  if(!prot) return "";
  const vig=parseInt(prot.vigentesQtd||"0");
  const reg=parseInt(prot.regularizadosQtd||"0");
  if(vig===0&&reg===0&&(!prot.detalhes||prot.detalhes.length===0)) return "";
  const detalhes=prot.detalhes||[];
  const top10Rec=detalhes.slice(0,10);
  const top10Val=[...detalhes].sort((a,b)=>numVal(b.valor)-numVal(a.valor)).slice(0,10);

  // Distribuicao Temporal - correct date handling
  const now = new Date();
  const parseDate = (d: string | undefined): Date | null => {
    if (!d) return null;
    // Handle DD/MM/YYYY format explicitly
    const parts = d.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const dt = new Date(year, month, day);
      return isNaN(dt.getTime()) ? null : dt;
    }
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  };
  const daysDiff = (d: Date): number => Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  type DistTemp = { label: string; qtd: number; valor: number };
  const temporal: DistTemp[] = [
    { label: "Ultimo mes (30 dias)", qtd: 0, valor: 0 },
    { label: "Ultimos 3 meses (90 dias)", qtd: 0, valor: 0 },
    { label: "Ultimos 12 meses (365 dias)", qtd: 0, valor: 0 },
    { label: "Mais de 12 meses", qtd: 0, valor: 0 },
  ];
  detalhes.forEach(d => {
    const dt = parseDate(d.data);
    const v = Number(numVal(d.valor)) || 0;
    // Sanity: ignora valores absurdos
    if (!isFinite(v) || Math.abs(v) > 100_000_000_000) return;
    if (!dt) { temporal[3].qtd++; temporal[3].valor = Number(temporal[3].valor) + v; return; }
    const days = daysDiff(dt);
    if (days <= 30) { temporal[0].qtd++; temporal[0].valor = Number(temporal[0].valor) + v; }
    else if (days <= 90) { temporal[1].qtd++; temporal[1].valor = Number(temporal[1].valor) + v; }
    else if (days <= 365) { temporal[2].qtd++; temporal[2].valor = Number(temporal[2].valor) + v; }
    else { temporal[3].qtd++; temporal[3].valor = Number(temporal[3].valor) + v; }
  });

  // Distribuicao por Faixa de Valor
  type DistFaixa = { label: string; qtd: number; valor: number };
  const faixas: DistFaixa[] = [
    { label: "Abaixo de R$ 1.000", qtd: 0, valor: 0 },
    { label: "R$ 1.000 a R$ 10.000", qtd: 0, valor: 0 },
    { label: "R$ 10.000 a R$ 50.000", qtd: 0, valor: 0 },
    { label: "R$ 50.000 a R$ 100.000", qtd: 0, valor: 0 },
    { label: "Acima de R$ 100.000", qtd: 0, valor: 0 },
  ];
  detalhes.forEach(d => {
    const v = Number(numVal(d.valor)) || 0;
    // Sanity: ignora valores absurdos (> R$ 100 bilhões)
    if (!isFinite(v) || Math.abs(v) > 100_000_000_000) return;
    if (v < 1000) { faixas[0].qtd++; faixas[0].valor = Number(faixas[0].valor) + v; }
    else if (v < 10000) { faixas[1].qtd++; faixas[1].valor = Number(faixas[1].valor) + v; }
    else if (v < 50000) { faixas[2].qtd++; faixas[2].valor = Number(faixas[2].valor) + v; }
    else if (v < 100000) { faixas[3].qtd++; faixas[3].valor = Number(faixas[3].valor) + v; }
    else { faixas[4].qtd++; faixas[4].valor = Number(faixas[4].valor) + v; }
  });

  const hasDistributions = detalhes.length > 0;

  return `<div class="sec">${secHdr("07","Protestos")}
  ${grid(4,[
    kpi("Vigentes Qtd",String(vig),vig>0?"#dc2626":"#111827",undefined,vig>0?"#dc2626":"#203B88"),
    kpi("Vigentes R$",fmtMoneyRound(prot.vigentesValor),vig>0?"#dc2626":"#111827",undefined,vig>0?"#dc2626":"#203B88"),
    kpi("Regularizados Qtd",String(reg),"#111827",undefined,"#73B815"),
    kpi("Regularizados R$",fmtMoneyRound(prot.regularizadosValor),"#111827",undefined,"#73B815"),
  ])}
  ${hasDistributions ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
    <div>
      ${subTitle("Distribuicao Temporal")}
      <table style="${TS}">
        <thead>${row(["Periodo","Qtd","Valor"],true)}</thead>
        <tbody>${temporal.map(t => row([esc(t.label), String(t.qtd), fmtMoneyRound(String(t.valor))])).join("")}</tbody>
      </table>
    </div>
    <div>
      ${subTitle("Distribuicao por Faixa de Valor")}
      <table style="${TS}">
        <thead>${row(["Faixa","Qtd","Valor"],true)}</thead>
        <tbody>${faixas.map(f => row([esc(f.label), String(f.qtd), fmtMoneyRound(String(f.valor))])).join("")}</tbody>
      </table>
    </div>
  </div>` : ""}
  ${top10Rec.length>0?`${subTitle("Top 10 Mais Recentes")}
  <table style="${TS}"><thead>${row(["Data","Credor","Valor","Regularizado"],true)}</thead>
  <tbody>${top10Rec.map(d=>row([fmt(d.data),esc(d.apresentante||d.credor||"\u2014"),fmtMoney(d.valor),d.regularizado?statusBadge("Sim","ok"):statusBadge("Nao","fail")])).join("")}</tbody></table>`:""}
  ${top10Val.length>0?`${subTitle("Top 10 por Valor")}
  <table style="${TS}"><thead>${row(["Data","Credor","Valor","Regularizado"],true)}</thead>
  <tbody>${top10Val.map(d=>row([fmt(d.data),esc(d.apresentante||d.credor||"\u2014"),fmtMoney(d.valor),d.regularizado?statusBadge("Sim","ok"):statusBadge("Nao","fail")])).join("")}</tbody></table>`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: PROCESSOS JUDICIAIS
// ═══════════════════════════════════════════════════════════════════════════════
function secProcessos(p: PDFReportParams): string {
  const proc=p.data.processos;
  if(!proc) return `<div class="sec">${secHdr("08","Processos Judiciais")}<div style="color:#9ca3af;font-size:11px">Dados nao disponiveis.</div></div>`;
  const total=parseInt(proc.passivosTotal||"0");
  const ativo=parseInt(proc.poloAtivoQtd||"0");
  const passiv=parseInt(proc.poloPassivoQtd||"0");
  const temRJ=proc.temRJ||proc.temFalencia;

  function renderProcessoStatus(status: string | undefined): string {
    const translated = translateProcessoStatus(status);
    const lower = (status || "").toLowerCase();
    const type: "ok"|"fail"|"warn"|"info" = lower.includes("arquivado") || lower.includes("transitado") ? "ok"
      : lower.includes("andamento") || lower.includes("distribuido") ? "warn"
      : "info";
    return statusBadge(translated, type);
  }

  return `<div class="sec">${secHdr("08","Processos Judiciais")}
  ${temRJ?alertBox("Pedido de RJ/Falencia identificado","ALTA"):""}
  ${grid(4,[
    kpi("Total Processos",String(total),total>20?"#dc2626":"#111827"),
    kpi("Polo Ativo",String(ativo),"#203B88"),
    kpi("Polo Passivo",String(passiv),passiv>10?"#dc2626":"#111827"),
    kpi("Falencia/RJ",temRJ?"SIM":"NAO",temRJ?"#dc2626":"#16a34a"),
  ])}
  ${proc.distribuicao?.length?`${subTitle("Distribuicao por Tipo")}
  <table style="${TS}"><thead>${row(["Tipo","Qtd","%"],true)}</thead>
  <tbody>${proc.distribuicao.map(d=>{
    const t=parseInt(d.qtd||"0");
    const pct=total>0?Math.round(t/total*100):0;
    return row([esc(d.tipo),fmt(d.qtd),pct+"%"]);
  }).join("")}</tbody></table>`:""}
  ${(proc.top10Recentes as ProcessoItem[]|undefined)?.length?`${subTitle("Top 10 Mais Recentes")}
  <table style="${TS}"><thead>${row(["Tipo","Distrib.","Ult. Movto.","Assunto","Valor","Status","Fase"],true)}</thead>
  <tbody>${(proc.top10Recentes as ProcessoItem[]).slice(0,10).map(pr=>row([esc(pr.tipo),fmt(pr.data),fmt((pr as {ultimaMovimentacao?:string}).ultimaMovimentacao),esc(pr.assunto),fmtMoney(pr.valor),renderProcessoStatus(pr.status),fmt((pr as {fase?:string}).fase)])).join("")}</tbody></table>`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: TOP 10 POR VALOR (PROCESSOS)
// ═══════════════════════════════════════════════════════════════════════════════
function secProcessosTop10Valor(p: PDFReportParams): string {
  const proc=p.data.processos;
  const top=(proc?.top10Valor as ProcessoItem[]|undefined);
  if(!top?.length) return "";

  function renderProcessoStatus(status: string | undefined): string {
    const translated = translateProcessoStatus(status);
    const lower = (status || "").toLowerCase();
    const type: "ok"|"fail"|"warn"|"info" = lower.includes("arquivado") || lower.includes("transitado") ? "ok"
      : lower.includes("andamento") || lower.includes("distribuido") ? "warn"
      : "info";
    return statusBadge(translated, type);
  }

  return `<div class="sec">${secHdr("09","Processos - Top 10 por Valor")}
  <table style="${TS}"><thead>${row(["Tipo","Distrib.","Ult. Movto.","Assunto","Valor","Status","Fase"],true)}</thead>
  <tbody>${top.slice(0,10).map(pr=>row([esc(pr.tipo),fmt(pr.data),fmt((pr as {ultimaMovimentacao?:string}).ultimaMovimentacao),esc(pr.assunto),fmtMoney(pr.valor),renderProcessoStatus(pr.status),fmt((pr as {fase?:string}).fase)])).join("")}</tbody></table>

  <!-- Glossario de Status/Fase -->
  <div style="margin-top:12px;padding:14px 18px;background:#f8f9fb;border:1px solid #e0e4ec;border-radius:8px;page-break-inside:avoid">
    <div style="font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Glossario</div>
    <div style="font-size:10px;color:#6b7280;line-height:1.8">
      <div><strong style="color:#374151">Definitivo:</strong> Decisao transitada em julgado, sem possibilidade de recurso</div>
      <div><strong style="color:#374151">Confirmada:</strong> Decisao mantida em instancia superior</div>
      <div><strong style="color:#374151">Primeiro Grau:</strong> Processo em tramitacao na primeira instancia</div>
      <div><strong style="color:#374151">Segundo Grau:</strong> Processo em fase de recurso/apelacao</div>
      <div><strong style="color:#374151">Decurso de Prazo:</strong> Prazo processual esgotado sem manifestacao</div>
      <div><strong style="color:#374151">Juizado Especial:</strong> Tramita no juizado de pequenas causas</div>
    </div>
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: CCF
// ═══════════════════════════════════════════════════════════════════════════════
function secCcf(p: PDFReportParams): string {
  const ccf=p.data.ccf;
  if(!ccf||ccf.qtdRegistros===0) return "";
  return `<div class="sec">${secHdr("10","CCF - Cheques Sem Fundo")}
  ${grid(3,[
    kpi("Total Ocorrencias",String(ccf.qtdRegistros||0),"#dc2626"),
    kpi("Bancos Registrados",String(ccf.bancos?.length||0)),
    kpi("Situacao",ccf.qtdRegistros>0?"Com ocorrencias":"Sem ocorrencias"),
  ])}
  ${ccf.bancos?.length?`<table style="${TS}"><thead>${row(["Banco","Quantidade","Ultima Ocorrencia","Motivo"],true)}</thead>
  <tbody>${ccf.bancos.map(b=>row([esc(b.banco),String(b.quantidade),fmt(b.dataUltimo),fmt(b.motivo)])).join("")}</tbody></table>`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: CURVA ABC
// ═══════════════════════════════════════════════════════════════════════════════
function secCurvaAbc(p: PDFReportParams): string {
  const abc=p.data.curvaABC;
  if(!abc||!abc.clientes?.length) return "";
  const top5=abc.clientes.slice(0,5);

  // Concentration alert
  const concTop3Num = numVal(abc.concentracaoTop3);
  const showAlert = !!(abc as { alertaConcentracao?: boolean }).alertaConcentracao || concTop3Num > 60;

  return `<div class="sec">${secHdr("11","Curva ABC")}
  ${showAlert ? alertBox(`Alta concentracao de receita: os 3 maiores clientes representam ${concTop3Num > 0 ? concTop3Num.toFixed(0) + "%" : fmt(abc.concentracaoTop3)} do faturamento total.`, "MODERADA") : ""}
  ${grid(3,[
    kpi("Top 3 Clientes %",fmt(abc.concentracaoTop3)),
    kpi("Top 5 Clientes %",fmt(abc.concentracaoTop5)),
    kpi("Total Clientes",String(abc.totalClientesNaBase||abc.totalClientesExtraidos||abc.clientes.length)),
  ])}
  <table style="${TS}"><thead>${row(["#","Cliente","Faturamento","% Receita","Classe"],true)}</thead>
  <tbody>${top5.map((c,i)=>row([String(c.posicao||i+1),`<strong>${esc(c.nome)}</strong>`,fmtMoney(c.valorFaturado),fmt(c.percentualReceita),statusBadge(c.classe,c.classe==="A"?"ok":c.classe==="B"?"warn":"info")])).join("")}</tbody></table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12: CARTAO CNPJ
// ═══════════════════════════════════════════════════════════════════════════════
function secCnpj(p: PDFReportParams): string {
  const c=p.data.cnpj;
  if(!c) return "";
  const ok=(c.situacaoCadastral||"").toUpperCase().includes("ATIVA");
  const cap=p.data.qsa?.capitalSocial||c.capitalSocialCNPJ||"";
  return `<div class="sec">${secHdr("12","Cartao CNPJ")}
  <div style="background:linear-gradient(135deg,#203B88 0%,#2a4da6 100%);border-radius:12px;padding:22px 26px;margin-bottom:18px;page-break-inside:avoid;box-shadow:0 4px 12px rgba(32,59,136,.2)">
    <div style="font-family:'Open Sans',Arial,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:.03em">${esc(c.razaoSocial||"\u2014")}</div>
    ${c.nomeFantasia&&c.nomeFantasia!==c.razaoSocial?`<div style="font-size:11px;color:rgba(255,255,255,.45);font-style:italic;margin-bottom:4px">"${esc(c.nomeFantasia)}"</div>`:""}
    <div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:8px">CNPJ ${fmtCnpj(c.cnpj)}</div>
    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:${ok?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)"};color:${ok?"#4ade80":"#fca5a5"};font-size:9px;font-weight:700;letter-spacing:.04em;border:1px solid ${ok?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}"><span style="font-size:10px">${ok?"\u2713":"\u2717"}</span> ${esc(c.situacaoCadastral||"\u2014")}</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    ${dataCard("Razao Social",`<strong>${esc(c.razaoSocial||"\u2014")}</strong>`)}
    ${dataCard("Nome Fantasia",fmt(c.nomeFantasia))}
    ${dataCard("Data de Abertura",fmt(c.dataAbertura))}
    ${dataCard("Natureza Juridica",fmt(c.naturezaJuridica))}
    ${dataCard("Porte",fmt(c.porte))}
    ${dataCard("Capital Social",fmtMoney(cap))}
    ${c.tipoEmpresa?dataCard("Tipo Empresa",fmt(c.tipoEmpresa)):""}
    ${c.telefone?dataCard("Telefone",fmt(c.telefone)):""}
    ${c.email?dataCard("Email",fmt(c.email)):""}
    ${dataCard("Data Situacao",fmt(c.dataSituacaoCadastral))}
  </div>
  ${c.endereco?`<div style="margin-bottom:12px">${dataCard("Endereco Principal",esc(c.endereco))}</div>`:""}
  ${c.cnaePrincipal?`<div style="margin-bottom:12px">${dataCard("CNAE Principal",esc(c.cnaePrincipal))}</div>`:""}
  ${c.cnaeSecundarios?`<div style="margin-bottom:12px">${dataCard("CNAEs Secundarios",esc(c.cnaeSecundarios))}</div>`:""}
  ${p.streetViewBase64||p.mapStaticBase64?`<div style="display:grid;grid-template-columns:${p.streetViewBase64&&p.mapStaticBase64?"1fr 1fr":"1fr"};gap:12px;margin-top:12px;margin-bottom:16px;page-break-inside:avoid">
    ${p.mapStaticBase64?`<div><div style="font-size:9px;color:#6b7280;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">LOCALIZACAO</div><img src="data:image/jpeg;base64,${p.mapStaticBase64}" style="width:100%;border-radius:8px;border:1px solid #e0e4ec" /></div>`:""}
    ${p.streetViewBase64?`<div><div style="font-size:9px;color:#6b7280;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">STREET VIEW</div><img src="data:image/jpeg;base64,${p.streetViewBase64}" style="width:100%;border-radius:8px;border:1px solid #e0e4ec" /></div>`:""}
  </div>`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13: QUADRO SOCIETARIO (QSA)
// ═══════════════════════════════════════════════════════════════════════════════
function secQsa(p: PDFReportParams): string {
  const qsa=p.data.qsa;
  if(!qsa?.quadroSocietario?.length) return "";
  const cap=qsa.capitalSocial||p.data.cnpj?.capitalSocialCNPJ||"";
  return `<div class="sec">${secHdr("13","Quadro Societario")}
  ${cap?`<div style="margin-bottom:16px;padding:14px 18px;background:linear-gradient(135deg,#f8f9fb 0%,#edf2fb 100%);border-radius:8px;border:1px solid #e0e4ec;font-size:12px;color:#374151">Capital Social: <strong style="font-size:14px;color:#203B88">${fmtMoney(cap)}</strong></div>`:""}
  <table style="${TS}">
    <thead>${row(["Nome","CPF/CNPJ","Qualificacao","Participacao"],true)}</thead>
    <tbody>${qsa.quadroSocietario.filter(s=>s.nome).map(s=>{
      const digits = s.cpfCnpj ? s.cpfCnpj.replace(/\D/g,"") : "";
      const docFormatted = digits.length > 11 ? fmtCnpj(s.cpfCnpj) : digits.length > 0 ? fmtCpf(s.cpfCnpj) : "\u2014";
      const partStr = s.participacao != null
        ? (String(s.participacao).includes("%") ? esc(String(s.participacao)) : esc(String(s.participacao)) + "%")
        : "\u2014";
      return row([
        `<strong>${esc(s.nome)}</strong>`,
        docFormatted,
        fmt(s.qualificacao),
        partStr,
      ]);
    }).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14: CONTRATO SOCIAL
// ═══════════════════════════════════════════════════════════════════════════════
function secContrato(p: PDFReportParams): string {
  const ct=p.data.contrato;
  if(!ct) return "";
  return `<div class="sec">${secHdr("14","Contrato Social")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    ${ct.capitalSocial?dataCard("Capital Social",fmtMoney(ct.capitalSocial)):""}
    ${ct.dataConstituicao?dataCard("Data de Constituicao",fmt(ct.dataConstituicao)):""}
    ${ct.prazoDuracao?dataCard("Prazo de Duracao",fmt(ct.prazoDuracao)):""}
    ${ct.foro?dataCard("Foro",fmt(ct.foro)):""}
  </div>
  ${ct.objetoSocial?`<div style="margin-bottom:12px">${dataCard("Objeto Social",esc(ct.objetoSocial))}</div>`:""}
  ${ct.administracao?`<div style="margin-bottom:12px">${dataCard("Administracao e Poderes",esc(ct.administracao))}</div>`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 15: GESTAO E GRUPO ECONOMICO
// ═══════════════════════════════════════════════════════════════════════════════
function secGrupoEconomico(p: PDFReportParams): string {
  const ge=p.data.grupoEconomico;
  if(!ge?.empresas?.length) return "";
  return `<div class="sec">${secHdr("15","Gestao e Grupo Economico")}
  <table style="${TS}">
    <thead>${row(["Empresa","CNPJ","Relacao","Situacao"],true)}</thead>
    <tbody>${ge.empresas.map(e=>row([
      `<strong>${esc(e.razaoSocial||"\u2014")}</strong>`,
      fmtCnpj(e.cnpj),
      fmt(e.relacao),
      fmt(e.situacao),
    ])).join("")}</tbody>
  </table>
  ${ge.alertaParentesco?alertBox("Parentesco detectado entre socios de empresas do grupo","MODERADA"):""}
  ${ge.parentescosDetectados?.length?`${subTitle("Parentescos Detectados")}
  <ul style="padding-left:18px;font-size:11px;color:#374151">${ge.parentescosDetectados.map(pr=>`<li style="margin-bottom:4px;line-height:1.5">${esc(pr.socio1)} e ${esc(pr.socio2)} - sobrenome: ${esc(pr.sobrenomeComum||"comum")}</li>`).join("")}</ul>`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 16: COMPARATIVO SCR
// ═══════════════════════════════════════════════════════════════════════════════
function secComparativoScr(p: PDFReportParams): string {
  const scr=p.data.scr;
  if(!scr) return "";
  const prev=p.data.scrAnterior;
  if(!prev) return "";
  const perAnt=fmt(prev.periodoReferencia);
  const perAtual=fmt(scr.periodoReferencia);
  type R={grupo:string;metrica:string;ant:string;atual:string;variacao:string};
  const rows:R[]=[];
  /** addRow for monetary values — formats with fmtMoney */
  function addRow(grupo:string,metrica:string,antVal:string|undefined,atualVal:string|undefined){
    const v=delta(atualVal,antVal)||"\u2014";
    rows.push({grupo,metrica,ant:prev ? fmtMoney(antVal) : "\u2014",atual:fmtMoney(atualVal),variacao:v});
  }
  /** addRowNum for plain numeric counts — formats with fmt (no R$) */
  function addRowNum(grupo:string,metrica:string,antVal:string|undefined,atualVal:string|undefined){
    const v=delta(atualVal,antVal)||"\u2014";
    rows.push({grupo,metrica,ant:prev ? fmt(antVal) : "\u2014",atual:fmt(atualVal),variacao:v});
  }
  addRow("CARTEIRA","Curto Prazo",prev.carteiraCurtoPrazo,scr.carteiraCurtoPrazo);
  addRow("CARTEIRA","Longo Prazo",prev.carteiraLongoPrazo,scr.carteiraLongoPrazo);
  addRow("CARTEIRA","A Vencer",prev.carteiraAVencer,scr.carteiraAVencer);
  addRow("INADIMPLENCIA","Total Dividas",prev.totalDividasAtivas,scr.totalDividasAtivas);
  addRow("INADIMPLENCIA","Vencidos",prev.vencidos,scr.vencidos);
  addRow("CAPACIDADE","Limite Credito",prev.limiteCredito,scr.limiteCredito);
  addRowNum("CAPACIDADE","IFs",prev.qtdeInstituicoes,scr.qtdeInstituicoes);
  addRowNum("CAPACIDADE","Operacoes",prev.qtdeOperacoes,scr.qtdeOperacoes);
  const fmmNum=computeFmm(p.data.faturamento);
  const alvAtualNum = fmmNum>0 ? numVal(scr.totalDividasAtivas)/fmmNum : 0;
  const alvAntNum = fmmNum>0 ? numVal(prev.totalDividasAtivas)/fmmNum : 0;
  const alvAtual = fmmNum>0 ? `${alvAtualNum.toFixed(2)}x` : "\u2014";
  const alvAnt = fmmNum>0 ? `${alvAntNum.toFixed(2)}x` : "\u2014";
  let alvVar = "\u2014";
  if (alvAntNum > 0 && alvAtualNum > 0) {
    const diffPct = Math.round(((alvAtualNum - alvAntNum) / alvAntNum) * 100);
    const up = diffPct > 0;
    const color = up ? "#dc2626" : "#16a34a";
    const barW = Math.min(Math.abs(diffPct), 100);
    alvVar = `<span style="font-size:13px;font-weight:900;color:${color};margin-left:6px">${up?"\u25B2":"\u25BC"} ${Math.abs(diffPct)}%</span><span style="display:inline-block;width:${barW}px;height:6px;background:${color};border-radius:3px;margin-left:6px;vertical-align:middle"></span>`;
  }
  rows.push({grupo:"RESUMO",metrica:"Alavancagem",ant:alvAnt,atual:alvAtual,variacao:alvVar});

  // ── PJ Comparativo Table ──
  const cnpjFmt = fmtCnpj(p.data.cnpj?.cnpj);
  const razaoFmt = esc(p.data.cnpj?.razaoSocial || "Empresa");
  void razaoFmt;
  let html = `<div class="sec">${secHdr("16","Comparativo SCR - Empresa (PJ)")}
  <div style="font-size:10px;font-weight:800;color:#203B88;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding:6px 12px;background:#edf2fb;border-radius:6px;display:inline-block">Empresa (PJ) — ${cnpjFmt}</div>
  <div style="display:flex;gap:16px;margin-bottom:16px">
    <div style="flex:1;padding:12px 16px;background:#f8f9fb;border-radius:8px;border:1px solid #e0e4ec;text-align:center">
      <div style="font-size:8px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Periodo Anterior</div>
      <div style="font-size:13px;font-weight:800;color:#203B88">${perAnt}</div>
    </div>
    <div style="flex:1;padding:12px 16px;background:#203B88;border-radius:8px;text-align:center">
      <div style="font-size:8px;font-weight:700;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Periodo Atual</div>
      <div style="font-size:13px;font-weight:800;color:#fff">${perAtual}</div>
    </div>
  </div>
  <table style="${TS}">
    <thead>${row(["Metrica",`${perAnt}`,`${perAtual}`,"Variacao"],true)}</thead>
    <tbody>${rows.map(r=>{
      const isRisk = (r.metrica === "Vencidos" || r.metrica === "Prejuizo") && numVal(r.atual) > 0;
      const isTotalDividas = r.metrica === "Total Dividas";
      const isAlav = r.metrica === "Alavancagem";
      const rowStyle = isAlav
        ? "background:linear-gradient(90deg,#edf2fb 0%,#f8f9fb 100%);border-top:2px solid #203B88"
        : isRisk ? "background:#fff5f5" : "";
      const metricStyle = isAlav
        ? "font-weight:900;font-size:13px;color:#203B88"
        : isTotalDividas ? "font-weight:900;font-size:12px" : "font-weight:700";
      const atualStyle = isAlav ? "font-weight:900;font-size:14px;color:#203B88" : "font-weight:700";
      return `<tr style="${rowStyle}"><td><strong style="${metricStyle}">${esc(r.metrica)}</strong><br/><span style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em">${esc(r.grupo)}</span></td><td>${r.ant}</td><td style="${atualStyle}">${r.atual}</td><td style="text-align:center">${r.variacao}</td></tr>`;
    }).join("")}</tbody>
  </table>`;

  // Note: Socios (PF) are rendered separately by secScrSocios() to keep PJ and PF as 2 distinct sections.
  html += `</div>`;
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 17: SCR VENCIMENTOS
// ═══════════════════════════════════════════════════════════════════════════════
function secScrVencimentos(p: PDFReportParams): string {
  const scr=p.data.scr;
  if(!scr) return "";
  const faixas=scr.faixasAVencer;
  if(!faixas) return "";
  const ordem=[
    {k:"ate30d",l:"Ate 30d"},{k:"d31_60",l:"31-60d"},{k:"d61_90",l:"61-90d"},
    {k:"d91_180",l:"91-180d"},{k:"d181_360",l:"181-360d"},{k:"acima360d",l:">360d"},
  ];
  const vals=ordem.map(o=>({l:o.l,v:numVal((faixas as unknown as Record<string,string>)[o.k])})).filter(x=>x.v>0);
  if(vals.length===0) return "";
  return `<div class="sec">${secHdr("17","SCR Vencimentos")}
  <table style="${TS}">
    <thead>${row(["Faixa","Valor"],true)}</thead>
    <tbody>${vals.map(v=>row([v.l,fmtMoney(String(v.v))])).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 18: MODALIDADES SCR
// ═══════════════════════════════════════════════════════════════════════════════
function secModalidadesScr(p: PDFReportParams): string {
  const scr=p.data.scr;
  if(!scr?.modalidades?.length) return "";
  const prev=p.data.scrAnterior;
  const prevMods=prev?.modalidades||[];
  return `<div class="sec">${secHdr("18","Modalidades SCR")}
  <table style="${TS}">
    <thead><tr><th rowspan="2">Modalidade</th>${prev?`<th colspan="4" style="text-align:center">${fmt(prev.periodoReferencia)} (ant.)</th>`:""}<th colspan="4" style="text-align:center">${fmt(scr.periodoReferencia)} (atual)</th></tr>
    <tr>${prev?"<th>Total</th><th>A Vencer</th><th>Vencido</th><th>Part%</th>":""}<th>Total</th><th>A Vencer</th><th>Vencido</th><th>Part%</th></tr></thead>
    <tbody>${scr.modalidades.filter(m=>m.nome).map(m=>{
      const pm=prevMods.find(x=>x.nome===m.nome);
      const vencClr=m.vencido&&m.vencido!=="0"?"color:#dc2626;font-weight:700":"";
      return `<tr><td><strong>${esc(m.nome)}</strong></td>${prev?`<td>${fmtMoney(pm?.total)}</td><td>${fmtMoney(pm?.aVencer)}</td><td>${fmtMoney(pm?.vencido)}</td><td>${fmt(pm?.participacao)}</td>`:""}<td>${fmtMoney(m.total)}</td><td>${fmtMoney(m.aVencer)}</td><td style="${vencClr}">${fmtMoney(m.vencido)}</td><td>${fmt(m.participacao)}</td></tr>`;
    }).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 18b: SCR SOCIOS
// ═══════════════════════════════════════════════════════════════════════════════
function secScrSocios(p: PDFReportParams): string {
  const socios = p.data.scrSocios;
  // Sócios PF do QSA — pra mostrar quem está na empresa quando não há SCR
  const sociosQsa = (p.data.qsa?.quadroSocietario || []).filter(s => {
    const digits = (s.cpfCnpj || "").replace(/\D/g, "");
    return digits.length === 11; // somente PF
  });

  // Vazio: renderiza placeholder com lista do QSA pra ficar visível o gap
  if (!socios || socios.length === 0) {
    if (sociosQsa.length === 0) return "";
    return `<div class="sec">${secHdr("16b","Comparativo SCR - Socios PF")}
      <div style="padding:14px 18px;background:#fffbeb;border-left:4px solid #d97706;border-radius:0 8px 8px 0;margin-bottom:16px">
        <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:6px">SCR dos socios nao foi enviado/extraido</div>
        <div style="font-size:11px;color:#78350f;line-height:1.6">A analise FIDC ideal exige o SCR de cada socio pessoa fisica para mensurar a exposicao consolidada (alavancagem total = divida PJ + divida PF). Sem esses dados, a alavancagem reportada cobre apenas a empresa.</div>
      </div>
      <div style="font-size:10px;font-weight:800;color:#203B88;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Socios PF identificados (${sociosQsa.length}) - SCR pendente</div>
      <table style="${TS}">
        <thead>${row(["Socio","CPF","Qualificacao","Participacao","Status SCR"], true)}</thead>
        <tbody>${sociosQsa.map(s => `<tr>
          <td><strong>${esc(s.nome || "\u2014")}</strong></td>
          <td>${fmtCpf(s.cpfCnpj)}</td>
          <td>${esc(s.qualificacao || "\u2014")}</td>
          <td>${esc(s.participacao || "\u2014")}</td>
          <td><span class="badge fail">PENDENTE</span></td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
  }

  const cards = socios.map((socio) => {
    const scr = socio.periodoAtual;
    const prev = socio.periodoAnterior;
    const perAtual = fmt(scr?.periodoReferencia);
    const perAnt = prev ? fmt(prev.periodoReferencia) : "";

    // Comparativo table
    type R = { metrica: string; ant: string; atual: string; variacao: string };
    const rows: R[] = [];
    function addRow(metrica: string, antVal: string | undefined, atualVal: string | undefined) {
      const v = prev ? (delta(atualVal, antVal) || "\u2014") : "\u2014";
      rows.push({ metrica, ant: prev ? fmtMoney(antVal) : "\u2014", atual: fmtMoney(atualVal), variacao: v });
    }
    if (scr) {
      addRow("Total Dividas", prev?.totalDividasAtivas, scr.totalDividasAtivas);
      addRow("Vencidos", prev?.vencidos, scr.vencidos);
      addRow("A Vencer", prev?.carteiraAVencer, scr.carteiraAVencer);
      addRow("Limite Credito", prev?.limiteCredito, scr.limiteCredito);
    }

    // Modalidades
    const mods = scr?.modalidades || [];
    void perAnt; // may be used for display

    return `<div class="sec" style="margin-top:18px;padding:16px 18px;background:#fff;border-radius:8px;border:1px solid #e0e4ec;border-left:4px solid #203B88;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:linear-gradient(135deg,#203B88,#2a4da6);color:#fff;font-size:9px;font-weight:800;border-radius:8px;flex-shrink:0;box-shadow:0 2px 4px rgba(32,59,136,.2)">PF</span>
        <div>
          <div style="font-size:14px;font-weight:800;color:#111827">${esc(socio.nomeSocio)}</div>
          <div style="font-size:10px;color:#6b7280">CPF ${fmtCpf(socio.cpfSocio)} &middot; Ref: ${perAtual}</div>
        </div>
      </div>
      ${rows.length > 0 ? `<table style="${TS}">
        <thead>${row(prev ? ["Metrica", perAnt, perAtual, "Var."] : ["Metrica", perAtual], true)}</thead>
        <tbody>${rows.map(r => prev
          ? `<tr><td><strong>${esc(r.metrica)}</strong></td><td>${r.ant}</td><td style="font-weight:700">${r.atual}</td><td style="text-align:center">${r.variacao}</td></tr>`
          : `<tr><td><strong>${esc(r.metrica)}</strong></td><td style="font-weight:700">${r.atual}</td></tr>`
        ).join("")}</tbody>
      </table>` : ""}
      ${mods.length > 0 ? `<div style="font-size:9px;font-weight:700;color:#203B88;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Modalidades</div>
      <table style="${TS}">
        <thead><tr><th>Modalidade</th><th>Total</th><th>A Vencer</th><th>Vencido</th><th>Part%</th></tr></thead>
        <tbody>${mods.filter(m => m.nome).map(m => {
          const vencClr = m.vencido && m.vencido !== "0" ? "color:#dc2626;font-weight:700" : "";
          return `<tr><td><strong>${esc(m.nome)}</strong></td><td>${fmtMoney(m.total)}</td><td>${fmtMoney(m.aVencer)}</td><td style="${vencClr}">${fmtMoney(m.vencido)}</td><td>${fmt(m.participacao)}</td></tr>`;
        }).join("")}</tbody>
      </table>` : ""}
    </div>`;
  }).join("");

  // Tabela consolidada — 1 linha por sócio
  const fmmNumPf = computeFmm(p.data.faturamento);
  const consolidRows = socios.map(s => {
    const cur = s.periodoAtual;
    const div = numVal(cur?.totalDividasAtivas);
    const venc = numVal(cur?.vencidos);
    const aVenc = numVal(cur?.carteiraAVencer);
    const alav = fmmNumPf > 0 && div > 0 ? `${(div / fmmNumPf).toFixed(2)}x` : "\u2014";
    return { nome: s.nomeSocio, cpf: s.cpfSocio, div, venc, aVenc, alav };
  });
  const totalDiv = consolidRows.reduce((s, r) => s + r.div, 0);
  const totalVenc = consolidRows.reduce((s, r) => s + r.venc, 0);
  const totalAVenc = consolidRows.reduce((s, r) => s + r.aVenc, 0);
  const alavPfTotal = fmmNumPf > 0 && totalDiv > 0 ? `${(totalDiv / fmmNumPf).toFixed(2)}x` : "\u2014";

  const consolidTable = `<table style="${TS}">
    <thead>${row(["Socio","CPF","Dividas Totais","A Vencer","Vencidos","Alav. (Div/FMM)"], true)}</thead>
    <tbody>${consolidRows.map(r => `<tr>
      <td><strong>${esc(r.nome || "\u2014")}</strong></td>
      <td>${fmtCpf(r.cpf)}</td>
      <td class="money">${r.div > 0 ? fmtMoneyRound(String(r.div)) : "\u2014"}</td>
      <td class="money">${r.aVenc > 0 ? fmtMoneyRound(String(r.aVenc)) : "\u2014"}</td>
      <td class="money${r.venc > 0 ? " neg" : ""}">${r.venc > 0 ? fmtMoneyRound(String(r.venc)) : "\u2014"}</td>
      <td class="money" style="font-weight:700">${r.alav}</td>
    </tr>`).join("")}
    <tr style="background:#edf2fb">
      <td colspan="2"><strong style="color:#203B88">CONSOLIDADO PF (${consolidRows.length})</strong></td>
      <td class="money" style="font-weight:900;color:#203B88">${totalDiv > 0 ? fmtMoneyRound(String(totalDiv)) : "\u2014"}</td>
      <td class="money" style="font-weight:900">${totalAVenc > 0 ? fmtMoneyRound(String(totalAVenc)) : "\u2014"}</td>
      <td class="money${totalVenc > 0 ? " neg" : ""}" style="font-weight:900">${totalVenc > 0 ? fmtMoneyRound(String(totalVenc)) : "\u2014"}</td>
      <td class="money" style="font-weight:900;color:#203B88">${alavPfTotal}</td>
    </tr>
    </tbody>
  </table>`;

  // Mostra cards detalhados apenas para sócios com dívida relevante
  const sociosComDivida = socios.filter(s => numVal(s.periodoAtual?.totalDividasAtivas) > 0);
  const cardsRelevantes = sociosComDivida.length > 0 && sociosComDivida.length < socios.length
    ? socios.filter(s => numVal(s.periodoAtual?.totalDividasAtivas) > 0).map((_, idx) => {
        const arr = socios.filter(s => numVal(s.periodoAtual?.totalDividasAtivas) > 0);
        return arr[idx];
      })
    : socios;
  void cardsRelevantes;

  return `<div class="sec" style="page-break-before:always">${secHdr("16b","Comparativo SCR - Socios PF (TABELA SEPARADA)")}
    <div style="padding:12px 16px;background:#edf2fb;border-left:4px solid #203B88;border-radius:0 8px 8px 0;margin-bottom:18px">
      <div style="font-size:12px;font-weight:800;color:#203B88;margin-bottom:4px">Tabela exclusiva da exposicao bancaria dos socios pessoa fisica</div>
      <div style="font-size:10px;color:#374151;line-height:1.6">Esta secao e <strong>independente</strong> da tabela SCR PJ (secao 16). Mostra o resumo consolidado dos ${socios.length} socio(s) e o detalhamento individual de cada um por modalidade bancaria.</div>
    </div>
    <div style="font-size:10px;font-weight:800;color:#203B88;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Resumo consolidado PF (${socios.length} socio${socios.length !== 1 ? "s" : ""})</div>
    ${consolidTable}
    <div style="font-size:10px;font-weight:800;color:#203B88;text-transform:uppercase;letter-spacing:.08em;margin:24px 0 10px">Detalhamento individual por socio</div>
    ${cards}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 19: DRE
// ═══════════════════════════════════════════════════════════════════════════════
/** Reconstrói campos faltantes do DRE quando o extrator não pegou (margens, receita líquida, lucro bruto). */
function enrichDreAno(a: Record<string, string>): Record<string, string> & { _calcFlags?: Set<string> } {
  const out: Record<string, string> & { _calcFlags?: Set<string> } = { ...a };
  const calcFlags = new Set<string>();
  const toBR = (n: number) => n.toFixed(2).replace(".", ",");

  const rb = numVal(a.receitaBruta);
  const ded = numVal(a.deducoes); // tipicamente negativo
  const cps = numVal(a.custoProdutosServicos); // tipicamente negativo
  const ll = numVal(a.lucroLiquido);
  const eb = numVal(a.ebitda);

  // Receita Liquida: prefere extraida, senao RB - |Deducoes|
  let rl = numVal(a.receitaLiquida);
  if (rl === 0 && rb > 0) {
    rl = ded !== 0 ? rb + ded : rb; // se ded ja vier negativo a soma reduz
    if (rl > 0 && rl <= rb) {
      out.receitaLiquida = toBR(rl);
      calcFlags.add("receitaLiquida");
    } else if (rb > 0) {
      // sem deducoes, assume RL = RB para nao mostrar zero
      rl = rb;
      out.receitaLiquida = toBR(rl);
      calcFlags.add("receitaLiquida");
    }
  }

  // Lucro Bruto: prefere extraido, senao RL - |CPS|
  let lb = numVal(a.lucroBruto);
  if (lb === 0 && rl > 0 && cps !== 0) {
    lb = rl + cps;
    if (lb !== 0) {
      out.lucroBruto = toBR(lb);
      calcFlags.add("lucroBruto");
    }
  }

  // Margem Bruta
  if (numVal(a.margemBruta) === 0 && lb > 0 && rl > 0) {
    out.margemBruta = toBR((lb / rl) * 100);
    calcFlags.add("margemBruta");
  }

  // Margem EBITDA
  if (numVal(a.margemEbitda) === 0 && eb > 0 && rl > 0) {
    out.margemEbitda = toBR((eb / rl) * 100);
    calcFlags.add("margemEbitda");
  }

  // Margem Liquida — base preferida: receita liquida; fallback: receita bruta
  if (numVal(a.margemLiquida) === 0 && ll !== 0) {
    const base = rl > 0 ? rl : rb;
    if (base > 0) {
      out.margemLiquida = toBR((ll / base) * 100);
      calcFlags.add("margemLiquida");
    }
  }

  if (calcFlags.size > 0) out._calcFlags = calcFlags;
  return out;
}

function secDre(p: PDFReportParams): string {
  const dre=p.data.dre;
  if(!dre?.anos?.length) return "";
  // Deduplication by ano + chronological sort
  const anosUnicos = dre.anos.filter((a, i, arr) => arr.findIndex(x => x.ano === a.ano) === i);
  const anosOrdenados = [...anosUnicos].sort((a, b) => parseInt(a.ano || "0") - parseInt(b.ano || "0"));
  const anosRaw = anosOrdenados.slice(-3);
  // Enriquece cada ano com fallbacks calculados
  const anos = anosRaw.map(a => enrichDreAno(a as unknown as Record<string, string>));
  const anyHasCalc = anos.some(a => a._calcFlags && a._calcFlags.size > 0);

  type M={label:string;key:string;isMoney:boolean;isPct:boolean};
  const metricas:M[]=[
    {label:"Receita Bruta",key:"receitaBruta",isMoney:true,isPct:false},
    {label:"Receita Liquida",key:"receitaLiquida",isMoney:true,isPct:false},
    {label:"Lucro Bruto",key:"lucroBruto",isMoney:true,isPct:false},
    {label:"Margem Bruta",key:"margemBruta",isMoney:false,isPct:true},
    {label:"EBITDA",key:"ebitda",isMoney:true,isPct:false},
    {label:"Margem EBITDA",key:"margemEbitda",isMoney:false,isPct:true},
    {label:"Lucro Liquido",key:"lucroLiquido",isMoney:true,isPct:false},
    {label:"Margem Liquida",key:"margemLiquida",isMoney:false,isPct:true},
  ];
  return `<div class="sec">${secHdr("19","DRE")}
  ${anyHasCalc ? `<div style="font-size:10px;color:#6b7280;margin-bottom:10px;padding:8px 12px;background:#f8f9fb;border-left:3px solid #203B88;border-radius:0 6px 6px 0">
    <strong>Nota:</strong> Valores marcados com <em>(calc)</em> foram reconstruidos a partir dos campos disponiveis (Receita Bruta, Lucro Liquido, Custo, etc) quando o extrator nao identificou diretamente. Verificar com a DRE original.
  </div>` : ""}
  <table style="${TS}">
    <thead>${row(["Metrica",...anos.map(a=>`<strong>${esc(a.ano)}</strong>`)],true)}</thead>
    <tbody>${metricas.map(m=>{
      const vals=anos.map(a=>{
        const v=(a as Record<string,string>)[m.key];
        if(!v||v==="0"||v==="") return "\u2014";
        const wasCalc = a._calcFlags?.has(m.key) === true;
        const calcMark = wasCalc ? `<span style="font-size:8px;color:#6b7280;font-style:italic;margin-left:4px">(calc)</span>` : "";
        if(m.isPct) return fmtPct(v) + calcMark;
        if(m.isMoney){
          const n=numVal(v);
          return `<span class="money${n<0?" neg":""}">${fmtMoney(v)}</span>` + calcMark;
        }
        return fmt(v) + calcMark;
      });
      if(vals.every(v=>v==="\u2014")) return "";
      return row([`<strong>${esc(m.label)}</strong>`,...vals]);
    }).filter(Boolean).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 20: BALANCO PATRIMONIAL
// ═══════════════════════════════════════════════════════════════════════════════
function secBalanco(p: PDFReportParams): string {
  const bal=p.data.balanco;
  if(!bal?.anos?.length) return "";
  // Deduplication by ano + chronological sort
  const anosUnicos = bal.anos.filter((a, i, arr) => arr.findIndex(x => x.ano === a.ano) === i);
  const anosOrdenados = [...anosUnicos].sort((a, b) => parseInt(a.ano || "0") - parseInt(b.ano || "0"));
  const anos=anosOrdenados.slice(-3);
  type M={label:string;key:string;isMoney:boolean;isPct:boolean};
  const metricas:M[]=[
    {label:"Ativo Total",key:"ativoTotal",isMoney:true,isPct:false},
    {label:"Ativo Circulante",key:"ativoCirculante",isMoney:true,isPct:false},
    {label:"Ativo Nao Circulante",key:"ativoNaoCirculante",isMoney:true,isPct:false},
    {label:"Passivo Total",key:"passivoTotal",isMoney:true,isPct:false},
    {label:"Passivo Circulante",key:"passivoCirculante",isMoney:true,isPct:false},
    {label:"Passivo Nao Circulante",key:"passivoNaoCirculante",isMoney:true,isPct:false},
    {label:"Patrimonio Liquido",key:"patrimonioLiquido",isMoney:true,isPct:false},
    {label:"Liquidez Corrente",key:"liquidezCorrente",isMoney:false,isPct:false},
    {label:"Endividamento",key:"endividamentoTotal",isMoney:false,isPct:true},
    {label:"Capital de Giro Liq.",key:"capitalDeGiroLiquido",isMoney:true,isPct:false},
    {label:"NCG (Necess. Cap. Giro)",key:"_ncg",isMoney:true,isPct:false},
  ];
  return `<div class="sec">${secHdr("20","Balanco Patrimonial")}
  <table style="${TS}">
    <thead>${row(["Metrica",...anos.map(a=>`<strong>${esc(a.ano)}</strong>`)],true)}</thead>
    <tbody>${metricas.map(m=>{
      const vals=anos.map(a=>{
        // NCG = Ativo Circulante - Passivo Circulante (calculado)
        if(m.key==="_ncg"){
          const ac=numVal((a as unknown as Record<string,string>).ativoCirculante);
          const pc=numVal((a as unknown as Record<string,string>).passivoCirculante);
          if(ac===0&&pc===0) return "\u2014";
          const ncg=ac-pc;
          return `<span class="money${ncg<0?" neg":""}" title="Ativo Circ. ${fmtMoney(String(ac))} - Passivo Circ. ${fmtMoney(String(pc))}">${fmtMoney(String(ncg))}</span><span style="font-size:8px;color:#6b7280;font-style:italic;margin-left:4px">(calc)</span>`;
        }
        const v=(a as unknown as Record<string,string>)[m.key];
        if(!v||v==="0"||v==="") return "\u2014";
        if(m.isPct) return fmtPct(v);
        if(m.isMoney){
          const n=numVal(v);
          return `<span class="money${n<0?" neg":""}">${fmtMoney(v)}</span>`;
        }
        if(m.key==="liquidezCorrente"){
          const n=parseFloat(v||"0");
          return `<span style="color:${n>=1?"#16a34a":"#dc2626"};font-weight:700">${n.toFixed(2)}x</span>`;
        }
        return fmt(v);
      });
      if(vals.every(v=>v==="\u2014")) return "";
      return row([`<strong>${esc(m.label)}</strong>`,...vals]);
    }).filter(Boolean).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 21: HISTORICO DE CONSULTAS
// ═══════════════════════════════════════════════════════════════════════════════
function secHistoricoConsultas(p: PDFReportParams): string {
  const hist=p.data.historicoConsultas;
  if(!hist?.length) return "";
  return `<div class="sec">${secHdr("21","Historico de Consultas")}
  <table style="${TS}">
    <thead>${row(["Instituicao","Data da Consulta"],true)}</thead>
    <tbody>${hist.map(h=>row([esc(h.usuario||"\u2014"),fmt(h.ultimaConsulta)])).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 22: IR DOS SOCIOS
// ═══════════════════════════════════════════════════════════════════════════════
function secIrSocios(p: PDFReportParams): string {
  const socios = p.data.irSocios;
  // Sócios PF do QSA — para mostrar pendências quando IR não foi extraído
  const sociosQsa = (p.data.qsa?.quadroSocietario || []).filter(s => {
    const digits = (s.cpfCnpj || "").replace(/\D/g, "");
    return digits.length === 11;
  });

  // Vazio: renderiza placeholder com sócios pendentes
  if (!socios?.length) {
    if (sociosQsa.length === 0) return "";
    return `<div class="sec">${secHdr("22","IR dos Socios")}
      <div style="padding:14px 18px;background:#fffbeb;border-left:4px solid #d97706;border-radius:0 8px 8px 0;margin-bottom:16px">
        <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:6px">IR dos socios nao foi coletado/extraido</div>
        <div style="font-size:11px;color:#78350f;line-height:1.6">A declaracao de IR dos socios PF e o instrumento mais confiavel para validar capacidade financeira pessoal, patrimonio liquido individual, dividas/onus declarados e participacao em outras sociedades. Recomenda-se solicitar a Receita Federal ou o documento "Recibo de Entrega" da DIRPF.</div>
      </div>
      <table style="${TS}">
        <thead>${row(["Socio","CPF","Qualificacao","Participacao","Status IR"], true)}</thead>
        <tbody>${sociosQsa.map(s => `<tr>
          <td><strong>${esc(s.nome || "\u2014")}</strong></td>
          <td>${fmtCpf(s.cpfCnpj)}</td>
          <td>${esc(s.qualificacao || "\u2014")}</td>
          <td>${esc(s.participacao || "\u2014")}</td>
          <td><span class="badge fail">PENDENTE</span></td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
  }
  return `<div class="sec">${secHdr("22","IR dos Socios")}
  ${socios.map(s=>{
    return `<div style="border:1px solid #e0e4ec;border-left:5px solid #203B88;border-radius:0 10px 10px 0;padding:16px 18px;margin-bottom:16px;page-break-inside:avoid;box-shadow:0 2px 8px rgba(32,59,136,.04)">
      <div style="font-size:15px;font-weight:800;color:#111827;margin-bottom:3px">${esc(s.nomeSocio)}</div>
      <div style="font-size:10px;color:#6b7280;margin-bottom:14px">CPF ${fmtCpf(s.cpf)} ${s.anoBase?` &middot; Ano-base ${esc(s.anoBase)}`:""}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${dataCard("Renda Total",fmtMoney(s.rendimentoTotal))}
        ${dataCard("Rendimentos Tributaveis",fmtMoney(s.rendimentosTributaveis))}
        ${dataCard("Rendimentos Isentos",fmtMoney(s.rendimentosIsentos))}
        ${dataCard("Imposto Definido",fmtMoney(s.impostoDefinido))}
        ${s.valorQuota?dataCard("Valor da Quota",fmtMoney(s.valorQuota)):""}
        ${dataCard("Total Bens e Direitos",fmtMoney(s.totalBensDireitos))}
        ${dataCard("Dividas e Onus",fmtMoney(s.dividasOnus))}
        ${dataCard("Patrimonio Liquido",fmtMoney(s.patrimonioLiquido))}
      </div>
    </div>`;
  }).join("")}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 23: RELATORIO DE VISITA
// ═══════════════════════════════════════════════════════════════════════════════
function secVisita(p: PDFReportParams): string {
  const v=p.data.relatorioVisita;
  if(!v) return "";
  const pontosPositivos=(v.pontosPositivos||[]) as string[];
  const pontosNegativos=(v.pontosAtencao||[]) as string[];
  return `<div class="sec">${secHdr("23","Relatorio de Visita")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    ${v.dataVisita?dataCard("Data",fmt(v.dataVisita)):""}
    ${v.responsavelVisita?dataCard("Responsavel",fmt(v.responsavelVisita)):""}
    ${v.duracaoVisita?dataCard("Duracao",fmt(v.duracaoVisita)):""}
    ${v.localVisita||v.descricaoEstrutura?dataCard("Local",fmt(v.localVisita||v.descricaoEstrutura)):""}
  </div>
  ${pontosPositivos.length>0?`${subTitle("Pontos Positivos")}
  <div style="margin-bottom:16px">${pontosPositivos.map(pt=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;margin-bottom:6px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0"><span style="color:#16a34a;font-size:13px;font-weight:800;flex-shrink:0">\u2713</span><span style="font-size:11px;color:#166534;line-height:1.5">${esc(pt)}</span></div>`).join("")}</div>`:""}
  ${pontosNegativos.length>0?`${subTitle("Pontos de Atencao")}
  <div style="margin-bottom:16px">${pontosNegativos.map(pt=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;margin-bottom:6px;background:#fff1f2;border-radius:6px;border:1px solid #fecaca"><span style="color:#dc2626;font-size:13px;font-weight:800;flex-shrink:0">\u26A0</span><span style="font-size:11px;color:#991b1b;line-height:1.5">${esc(pt)}</span></div>`).join("")}</div>`:""}
  ${v.recomendacaoVisitante?`${subTitle("Recomendacao")}<div style="font-size:12px;color:#374151;margin-bottom:14px;padding:12px 16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe">${esc(v.recomendacaoVisitante)}</div>`:""}
  ${v.observacoesLivres?`${subTitle("Observacoes")}${paraBox(v.observacoesLivres)}`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 24: DADOS DA EMPRESA
// ═══════════════════════════════════════════════════════════════════════════════
function secDadosEmpresa(p: PDFReportParams): string {
  const v=p.data.relatorioVisita;
  if(!v) return "";
  const params:[string,string][]=[
    ["N Funcionarios",String(v.funcionariosObservados||"\u2014")],
    ["Folha Pagamento",fmtMoney(v.folhaPagamento)],
    ["Endividamento Banco",fmtMoney(v.endividamentoBanco)],
    ["Endividamento Factoring/FIDC",fmtMoney(v.endividamentoFactoring)],
    ["Vendas (Cheque)",v.vendasCheque?v.vendasCheque+"%":"\u2014"],
    ["Vendas (Duplicata)",v.vendasDuplicata?v.vendasDuplicata+"%":"\u2014"],
    ["Vendas (Outras)",v.vendasOutras?v.vendasOutras+"%":"\u2014"],
    ["Prazo Medio Faturamento",v.prazoMedioFaturamento?v.prazoMedioFaturamento+" dias":"\u2014"],
    ["Prazo Medio Entrega",v.prazoMedioEntrega?v.prazoMedioEntrega+" dias":"\u2014"],
    ["Referencias Comerciais",fmt(v.referenciasFornecedores)],
  ];
  return `<div class="sec">${secHdr("24","Dados da Empresa")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    ${params.map(([l,val])=>dataCard(l,val)).join("")}
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 25: HISTORICO DE OPERACOES COM O FUNDO
// ═══════════════════════════════════════════════════════════════════════════════
function secHistoricoOperacoes(p: PDFReportParams): string {
  const ops = p.histOperacoes;
  if (!ops || ops.length === 0) return "";

  function opStatusBadge(status: string): string {
    const s = (status || "").toLowerCase();
    if (s === "ativa") return statusBadge("Ativa", "info");
    if (s === "liquidada") return statusBadge("Liquidada", "ok");
    if (s === "inadimplente") return statusBadge("Inadimplente", "fail");
    if (s === "prorrogada") return statusBadge("Prorrogada", "warn");
    return statusBadge(status || "\u2014", "info");
  }

  function fmtIsoDate(d: string | null | undefined): string {
    if (!d) return "\u2014";
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return esc(d);
      return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return esc(d); }
  }

  // Sort by data_operacao descending
  const sorted = [...ops].sort((a, b) => {
    const da = a.data_operacao ? new Date(a.data_operacao).getTime() : 0;
    const db = b.data_operacao ? new Date(b.data_operacao).getTime() : 0;
    return db - da;
  });

  // KPIs
  const totalOps = sorted.length;
  const totalValor = sorted.reduce((s, o) => s + (o.valor || 0), 0);
  const ativas = sorted.filter(o => o.status === "ativa").length;
  const inadimplentes = sorted.filter(o => o.status === "inadimplente").length;

  return `<div class="sec">${secHdr("25","Historico de Operacoes com o Fundo")}
  ${grid(4, [
    kpi("Total Operacoes", String(totalOps)),
    kpi("Volume Total", fmtMoneyRound(String(totalValor))),
    kpi("Ativas", String(ativas), "#203B88"),
    kpi("Inadimplentes", String(inadimplentes), inadimplentes > 0 ? "#dc2626" : "#16a34a"),
  ])}
  <table style="${TS}">
    <thead>${row(["Data", "N\u00BA", "Valor", "Taxa", "Prazo", "Modalidade", "Status", "Sacado"], true)}</thead>
    <tbody>${sorted.map(o => `<tr>
      <td>${fmtIsoDate(o.data_operacao)}</td>
      <td>${fmt(o.numero_operacao)}</td>
      <td class="money">${fmtMoney(o.valor)}</td>
      <td>${o.taxa_mensal != null ? o.taxa_mensal.toFixed(2) + "%" : "\u2014"}</td>
      <td>${o.prazo != null ? o.prazo + "d" : "\u2014"}</td>
      <td>${fmt(o.modalidade)}</td>
      <td>${opStatusBadge(o.status)}</td>
      <td>${esc(o.sacado || "\u2014")}</td>
    </tr>`).join("")}</tbody>
  </table>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export function gerarHtmlRelatorio(p: PDFReportParams): {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
} {
  const razao=esc(p.data?.cnpj?.razaoSocial||"Cedente");

  const html=`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Relatorio de Credito \u2014 ${razao}</title>
  <style>${CSS}</style>
</head><body>
  ${secCapa(p)}
  ${secChecklist(p)}
  ${secSintese(p)}
  ${secParecer(p)}
  ${secParametros(p)}
  ${secHistoricoOperacoes(p)}
  ${secFundo(p)}
  ${secFaturamento(p)}
  ${secProtestos(p)}
  ${secProcessos(p)}
  ${secProcessosTop10Valor(p)}
  ${secCcf(p)}
  ${secCurvaAbc(p)}
  ${secCnpj(p)}
  ${secQsa(p)}
  ${secContrato(p)}
  ${secGrupoEconomico(p)}
  ${secComparativoScr(p)}
  ${secScrSocios(p)}
  ${secScrVencimentos(p)}
  ${secModalidadesScr(p)}
  ${secDre(p)}
  ${secBalanco(p)}
  ${secHistoricoConsultas(p)}
  ${secIrSocios(p)}
  ${secVisita(p)}
  ${secDadosEmpresa(p)}
</body></html>`;

  const headerTemplate=`<div style="width:100%;font-family:'Open Sans','Helvetica Neue',Arial,sans-serif">
    <div style="height:3px;background:#203B88"></div>
    <div style="padding:6px 16mm 4px;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#6b7280">
      <span style="font-weight:800;color:#203B88;letter-spacing:.06em;font-size:9px">CAPITAL <span style="color:#73B815">FINANCAS</span></span>
      <span style="max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9ca3af">${razao}</span>
      <span></span>
    </div>
  </div>`;

  const footerTemplate=`<div style="width:100%;font-family:'Open Sans','Helvetica Neue',Arial,sans-serif">
    <div style="height:1.5px;background:#73B815"></div>
    <div style="padding:5px 16mm 6px;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#9ca3af">
      <span>Capital Financas &middot; Analise de Credito &middot; Confidencial</span>
      <span>Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>
  </div>`;

  return {html,headerTemplate,footerTemplate};
}
