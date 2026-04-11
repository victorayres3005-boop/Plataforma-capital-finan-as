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
  const n = parseFloat(String(v).replace(/[^\d,-]/g,"").replace(",","."));
  return isNaN(n) ? 0 : n;
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

/** Compute FMM from fmm12m or last 12 months of meses[] — ALWAYS divide by 12 */
function computeFmm(faturamento: { fmm12m?: string | number; mediaAno?: string | number; meses?: FaturamentoMensal[] } | undefined): number {
  if (!faturamento) return 0;
  if (faturamento.fmm12m) return numVal(faturamento.fmm12m);
  const valid = sortMeses(faturamento.meses || []).filter(m => m?.mes && m?.valor);
  const last12 = valid.slice(-12);
  if (last12.length === 0) return 0;
  const sum = last12.reduce((s, m) => s + numVal(m.valor), 0);
  return sum / 12; // ALWAYS divide by 12, even if fewer months
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
@media print{@page{margin:28mm 16mm 18mm}}
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
    { label: "Relatorio de Visita", ok: !!(d.relatorioVisita?.dataVisita), tipo: "OPC" },
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

/** Build calculated contextual alerts (deterministic, outside template literal) */
function buildCalcAlerts(p: PDFReportParams, data: PDFReportParams["data"], alerts: PDFReportParams["alerts"], fmmNum: number, alavancagem: number | null): string {
  const calcAlerts: {msg:string;sev:"ALTA"|"MODERADA"|"INFO"}[] = [];

  // Protestos vs faturamento
  const protVal = numVal(data.protestos?.vigentesValor);
  if (p.protestosVigentes > 0 && fmmNum > 0 && protVal > 0) {
    const pctFat = (protVal / fmmNum) * 100;
    calcAlerts.push({msg:"Protesto vigente de " + fmtMoneyRound(data.protestos?.vigentesValor) + " representa " + pctFat.toFixed(1) + "% do faturamento mensal", sev: pctFat > 10 ? "ALTA" : "MODERADA"});
  }

  // CCF with bank names
  const ccf = data.ccf;
  if (ccf && ccf.qtdRegistros > 0) {
    const bancoNames = (ccf.bancos || []).slice(0, 5).map(b => b.banco).filter(Boolean).join(", ");
    calcAlerts.push({msg: ccf.qtdRegistros + " ocorrencia(s) de cheque sem fundo" + (bancoNames ? " nos bancos: " + bancoNames : ""), sev:"ALTA"});
  }

  // Alavancagem
  if (alavancagem != null && alavancagem > 3) {
    calcAlerts.push({msg:"Alavancagem de " + alavancagem.toFixed(1) + "x acima do patamar conservador (max 3x)", sev: alavancagem > 5 ? "ALTA" : "MODERADA"});
  }

  // PL negativo (from balanço)
  const balAnos2 = data.balanco?.anos || [];
  if (balAnos2.length > 0) {
    const ultimoBal = balAnos2[balAnos2.length - 1];
    const pl = numVal(ultimoBal.patrimonioLiquido);
    if (pl < 0) calcAlerts.push({msg:"Patrimonio Liquido negativo de " + fmtMoneyRound(String(pl)) + " — passivo a descoberto", sev:"ALTA"});
    const lc = parseFloat(String(ultimoBal.liquidezCorrente || "0").replace(",", "."));
    if (lc > 0 && lc < 1) calcAlerts.push({msg:"Liquidez corrente de " + lc.toFixed(2) + " — abaixo do ideal (>1,0)", sev:"MODERADA"});
  }

  // Vencidos SCR
  if (p.vencidosSCR > 0 && fmmNum > 0) {
    const vencVal = numVal(data.scr?.vencidos);
    const pctVenc = (vencVal / fmmNum) * 100;
    calcAlerts.push({msg:"SCR com " + fmtMoneyRound(data.scr?.vencidos) + " em vencidos (" + pctVenc.toFixed(1) + "% do FMM)", sev:"ALTA"});
  }

  // Render with deduplication
  const filtered = calcAlerts.filter(ca => !alerts.some(a => a.message.toLowerCase().includes(ca.msg.substring(0, 30).toLowerCase())));
  if (filtered.length === 0) return "";
  return (alerts.length === 0 ? subTitle("Alertas") : "") + filtered.map(ca => alertBox(ca.msg, ca.sev)).join("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: SINTESE PRELIMINAR
// ═══════════════════════════════════════════════════════════════════════════════
function secSintese(p: PDFReportParams): string {
  const {data,finalRating,decision,alerts}=p;
  const rc=finalRating>=7?"#16a34a":finalRating>=4?"#d97706":"#dc2626";

  // FMM calculation - correct
  const fmmNum = computeFmm(data.faturamento);

  // Faturamento Medio - last 12 months only
  const allMesesSorted = sortMeses(data.faturamento?.meses || []).filter(m => m?.mes && m?.valor);
  const last12Meses = allMesesSorted.slice(-12);
  const fatMedia = last12Meses.length > 0 ? last12Meses.reduce((s, m) => s + numVal(m.valor), 0) / last12Meses.length : 0;

  // Alavancagem - calculate if not provided
  const alavancagem = p.alavancagem != null
    ? p.alavancagem
    : (fmmNum > 0 ? numVal(data.scr?.totalDividasAtivas || "0") / fmmNum : null);

  const rv = data.relatorioVisita;
  const modalidade = rv?.modalidade || (rv?.taxaComissaria && rv?.taxaConvencional ? "Hibrida" : rv?.taxaComissaria ? "Comissaria" : rv?.taxaConvencional ? "Convencional" : "\u2014");
  const modalidadeSub = String(modalidade).toLowerCase().includes("hibrida") ? "Convencional e Comissaria" : undefined;
  const pleito = rv?.pleito || rv?.limiteTotal || "\u2014";

  const geCount = data.grupoEconomico?.empresas?.length || 0;
  const geNames = (data.grupoEconomico?.empresas || []).slice(0, 3).map(e => e.razaoSocial || "").filter(Boolean).join(", ");

  // Curva ABC top 3
  const abcClientes = data.curvaABC?.clientes || [];
  const top3Names = abcClientes.slice(0, 3).map(c => esc(c.nome || "")).join(", ");
  const top3Pct = data.curvaABC?.concentracaoTop3 || "\u2014";

  // CCF bank names
  const ccfBancos = (data.ccf?.bancos || []).map(b => b.banco).filter(Boolean).slice(0, 3).join(", ");

  // Most recent protesto
  const detProtestos = data.protestos?.detalhes || [];
  const sortedProtestos = [...detProtestos].sort((a, b) => {
    const da = a.data ? new Date(a.data.split("/").reverse().join("-")).getTime() : 0;
    const db = b.data ? new Date(b.data.split("/").reverse().join("-")).getTime() : 0;
    return db - da;
  });
  const lastProtesto = sortedProtestos.length > 0 ? sortedProtestos[0].data || "\u2014" : "\u2014";

  // Processos ativo + passivo and most recent
  const procAtivo = parseInt(data.processos?.poloAtivoQtd || "0");
  const procPassivo = parseInt(data.processos?.passivosTotal || "0");
  const procRecentes = (data.processos?.top10Recentes as ProcessoItem[] | undefined) || [];
  const lastProcesso = procRecentes.length > 0 ? procRecentes[0].data || "\u2014" : "\u2014";

  // Score composition
  const cob=p.aiAnalysis?.coberturaAnalise;
  type ScoreRow={comp:string;peso:string;status:string;relevancia:string;diag:string};
  const scoreRows:ScoreRow[]=[];
  if(cob&&Array.isArray(cob)){
    (cob as {componente:string;peso:string;status:string;relevancia:string;diagnostico:string}[]).forEach(c=>{
      scoreRows.push({comp:c.componente,peso:c.peso,status:c.status,relevancia:c.relevancia,diag:c.diagnostico});
    });
  }
  if(scoreRows.length===0){
    const vencOk=p.vencidosSCR===0;
    const fatOk=!!(data.faturamento?.meses?.length);
    const ccfOk=!data.ccf||data.ccf.qtdRegistros===0;
    const protOk=p.protestosVigentes===0;
    const procOk=parseInt(data.processos?.passivosTotal||"0")<10;
    const dreOk=!!(data.dre?.anos?.length);
    const irOk=!!(data.irSocios?.length);
    scoreRows.push(
      {comp:"SCR/Bacen",peso:"25%",status:vencOk?"OK":"ALERTA",relevancia:"Alta",diag:vencOk?"Sem vencidos":"Vencidos detectados"},
      {comp:"Faturamento",peso:"20%",status:fatOk?"OK":"PENDENTE",relevancia:"Alta",diag:fatOk?"Dados disponiveis":"Sem dados"},
      {comp:"CCF",peso:"15%",status:ccfOk?"OK":"ALERTA",relevancia:"Media",diag:ccfOk?"Sem ocorrencias":"Ocorrencias detectadas"},
      {comp:"Protestos",peso:"15%",status:protOk?"OK":"ALERTA",relevancia:"Media",diag:protOk?"Sem protestos vigentes":`${p.protestosVigentes} protesto(s)`},
      {comp:"Processos Jud.",peso:"10%",status:procOk?"OK":"ALERTA",relevancia:"Media",diag:procOk?"Normal":"Volume elevado"},
      {comp:"DRE/Balanco",peso:"10%",status:dreOk?"OK":"PENDENTE",relevancia:"Baixa",diag:dreOk?"Dados disponiveis":"Sem dados"},
      {comp:"IR Socios",peso:"5%",status:irOk?"OK":"PENDENTE",relevancia:"Baixa",diag:irOk?"Dados disponiveis":"Sem dados"},
    );
  }

  /** Group label header — more prominent */
  function groupLabel(label: string): string {
    return `<div style="font-size:11px;font-weight:900;color:#203B88;text-transform:uppercase;letter-spacing:.12em;margin:24px 0 12px;padding:8px 14px;background:linear-gradient(90deg,#edf2fb 0%,#f8f9fb 100%);border-left:4px solid #73B815;border-radius:0 6px 6px 0;border-bottom:2px solid #e0e4ec">${esc(label)}</div>`;
  }

  const resumoTldr = p.aiAnalysis?.sinteseExecutiva || p.resumoExecutivo || "";
  const tldrHtml = resumoTldr ? `
    <div style="background:#edf2fb;border-left:4px solid #203B88;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;page-break-inside:avoid">
      <div style="font-size:13px;color:#1a2744;line-height:1.7;font-style:italic">${esc(resumoTldr.length > 400 ? resumoTldr.substring(0, 400) + "... (ver Parecer)" : resumoTldr)}</div>
    </div>` : "";

  return `<div class="sec">${secHdr("03","Sintese Preliminar")}

  ${tldrHtml}

  ${groupLabel("IDENTIFICACAO")}
  ${grid(4,[
    kpi("Rating",`${finalRating} / 10`,rc),
    kpi("Decisao",decision.replace(/_/g," ")),
    kpi("Tempo Empresa",esc(p.companyAge)||"\u2014"),
    kpi("Modalidade",esc(String(modalidade)), "#111827", modalidadeSub),
  ])}

  ${groupLabel("INDICADORES FINANCEIROS")}
  ${grid(4,[
    kpi("FMM 12m", fmmNum > 0 ? fmtMoneyRound(String(fmmNum)) : "\u2014"),
    kpi("Faturamento Medio", fatMedia > 0 ? fmtMoneyRound(String(fatMedia)) : "\u2014", "#111827", last12Meses.length > 0 ? `ultimos ${last12Meses.length} meses` : undefined),
    kpi("Alavancagem", alavancagem != null ? `${alavancagem.toFixed(1)}x` : "\u2014", alavancagem != null && alavancagem > 3 ? "#dc2626" : "#111827"),
    kpi("Pleito",typeof pleito === "string" ? (pleito.match(/\d/) ? fmtMoneyRound(pleito) : esc(pleito)) : fmtMoneyRound(pleito)),
  ])}

  ${groupLabel("INDICADORES DE RISCO")}
  ${grid(4,[
    kpi("Protestos Vigentes",String(p.protestosVigentes),p.protestosVigentes>0?"#dc2626":"#111827", `${fmtMoneyRound(data.protestos?.vigentesValor)} | ult: ${esc(String(lastProtesto))}`),
    kpi("Processos",`A:${procAtivo} / P:${procPassivo}`, "#111827", `ult: ${esc(String(lastProcesso))}`),
    kpi("SCR Vencido",fmtMoneyRound(data.scr?.vencidos),p.vencidosSCR>0?"#dc2626":"#111827"),
    kpi("CCF", data.ccf ? (data.ccf.qtdRegistros > 0 ? `${data.ccf.qtdRegistros} ocorr.` : "Sem ocorrencias") : "\u2014", data.ccf && data.ccf.qtdRegistros > 0 ? "#dc2626" : "#111827", ccfBancos || undefined),
  ])}

  ${groupLabel("ESTRUTURA")}
  ${(() => {
    // NCG = Ativo Circulante - Passivo Circulante (último ano do balanço)
    const balAnos = data.balanco?.anos || [];
    const ultimoAno = balAnos.length > 0 ? balAnos[balAnos.length - 1] : null;
    const ncgVal = ultimoAno ? numVal(ultimoAno.ativoCirculante) - numVal(ultimoAno.passivoCirculante) : 0;
    const ncgStr = ultimoAno ? fmtMoneyRound(String(ncgVal)) : "\u2014";
    const ncgColor = ncgVal < 0 ? "#dc2626" : "#16a34a";
    const ncgSub = ncgVal < 0 ? "Deficit \u2014 necessita financiamento" : "Superavit";
    return grid(4,[
      kpi("Grupo Economico",geCount > 0 ? `${geCount} empresa(s)` : "\u2014", "#111827", geNames || undefined),
      kpi("Curva ABC Top 3",fmt(top3Pct), "#111827", top3Names || undefined),
      kpi("NCG (Cap. Giro)", ncgStr, ncgColor, ncgSub),
      kpiPlaceholder(),
    ]);
  })()}

  ${subTitle("Composicao do Score")}
  <table style="${TS}">
    <thead>${row(["Componente","Peso","Status","Impacto","Relevancia","Diagnostico"],true)}</thead>
    <tbody>${scoreRows.map(r=>{
      const st=r.status==="OK"?"ok":r.status==="ALERTA"?"fail":"warn";
      const pesoNum = parseFloat(r.peso) || 0;
      const pesoFrac = pesoNum / 100;
      const impactoVal = pesoFrac * 10 * (st === "ok" ? 1 : st === "fail" ? 0.3 : 0.5);
      const impactoColor = st === "ok" ? "#16a34a" : "#dc2626";
      const impactoSign = st === "ok" ? "+" : "-";
      const impactoDisplay = `<span style="font-weight:800;color:${impactoColor}">${impactoSign}${impactoVal.toFixed(1)} pts</span>`;
      const rowBg = st === "ok" ? "background:rgba(34,197,94,.06)" : st === "fail" ? "background:rgba(239,68,68,.06)" : "background:rgba(245,158,11,.06)";
      const progressBar = `<div style="display:flex;align-items:center;gap:6px"><span>${esc(r.peso)}</span><div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden"><div style="width:${pesoNum}%;height:100%;background:${st==="ok"?"#22c55e":st==="fail"?"#ef4444":"#f59e0b"};border-radius:3px"></div></div></div>`;
      const badgeCfg = {ok:{bg:"#dcfce7",color:"#166534",brd:"#bbf7d0",icon:"\u2713"},fail:{bg:"#fee2e2",color:"#991b1b",brd:"#fecaca",icon:"\u2717"},warn:{bg:"#fef3c7",color:"#92400e",brd:"#fde68a",icon:"\u26A0"}}[st];
      const bigBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 14px;border-radius:99px;background:${badgeCfg.bg};color:${badgeCfg.color};font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border:1px solid ${badgeCfg.brd}"><span style="font-size:10px">${badgeCfg.icon}</span> ${esc(r.status)}</span>`;
      return `<tr style="${rowBg}"><td>${esc(r.comp)}</td><td>${progressBar}</td><td>${bigBadge}</td><td style="text-align:center">${impactoDisplay}</td><td>${esc(r.relevancia)}</td><td>${esc(r.diag)}</td></tr>`;
    }).join("")}
    <tr style="background:linear-gradient(135deg,#203B88 0%,#2a4da6 100%)"><td colspan="6" style="text-align:center;padding:12px 16px;border-bottom:none"><span style="font-size:14px;font-weight:900;color:#fff;letter-spacing:.05em">SCORE FINAL: ${finalRating} / 10 &mdash; ${esc(decision.replace(/_/g," "))}</span></td></tr>
    </tbody>
  </table>

  ${alerts&&alerts.length>0?`${subTitle("Alertas")}${alerts.map(a=>alertBox(a.message,(a.severity||"INFO") as "ALTA"|"MODERADA"|"INFO")).join("")}`:""}

  ${buildCalcAlerts(p, data, alerts, fmmNum, alavancagem)}
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

  // If we have nothing to show, skip section
  if (!resumo && !textoCompleto && pontosFortes.length === 0 && pontosFracos.length === 0 && perguntasVisita.length === 0) return "";

  const rc = p.finalRating >= 7 ? "#16a34a" : p.finalRating >= 4 ? "#d97706" : "#dc2626";

  return `<div class="sec">${secHdr("03b","Parecer Preliminar")}

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

  return `<div class="sec">${secHdr("06","Faturamento")}
  ${grid(4,[
    kpi("FMM 12m", fmmNum > 0 ? fmtMoney(String(fmmNum)) : "\u2014", "#203B88"),
    kpi("Total do Periodo", fmtMoney(String(total12)), "#111827", `ultimos 12 meses`),
    kpi("Media 12m", media12 > 0 ? fmtMoney(String(media12)) : "\u2014", "#111827", `${last12.length} meses`),
    kpi("Tendencia", tendencia, tendColor),
  ])}
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
    const v = numVal(d.valor);
    if (!dt) { temporal[3].qtd++; temporal[3].valor += v; return; }
    const days = daysDiff(dt);
    if (days <= 30) { temporal[0].qtd++; temporal[0].valor += v; }
    else if (days <= 90) { temporal[1].qtd++; temporal[1].valor += v; }
    else if (days <= 365) { temporal[2].qtd++; temporal[2].valor += v; }
    else { temporal[3].qtd++; temporal[3].valor += v; }
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
    const v = numVal(d.valor);
    if (v < 1000) { faixas[0].qtd++; faixas[0].valor += v; }
    else if (v < 10000) { faixas[1].qtd++; faixas[1].valor += v; }
    else if (v < 50000) { faixas[2].qtd++; faixas[2].valor += v; }
    else if (v < 100000) { faixas[3].qtd++; faixas[3].valor += v; }
    else { faixas[4].qtd++; faixas[4].valor += v; }
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
  const alvAtual=fmmNum>0?`${(numVal(scr.totalDividasAtivas)/fmmNum).toFixed(1)}x`:"\u2014";
  const alvAnt=fmmNum>0?`${(numVal(prev.totalDividasAtivas)/fmmNum).toFixed(1)}x`:"\u2014";
  rows.push({grupo:"RESUMO",metrica:"Alavancagem",ant:alvAnt,atual:alvAtual,variacao:"\u2014"});

  return `<div class="sec">${secHdr("16","Comparativo SCR")}
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
      const rowStyle = isRisk ? "background:#fff5f5" : "";
      const metricStyle = isTotalDividas ? "font-weight:900;font-size:12px" : "font-weight:700";
      return `<tr style="${rowStyle}"><td><strong style="${metricStyle}">${esc(r.metrica)}</strong><br/><span style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em">${esc(r.grupo)}</span></td><td>${r.ant}</td><td style="font-weight:700">${r.atual}</td><td style="text-align:center">${r.variacao}</td></tr>`;
    }).join("")}</tbody>
  </table>
</div>`;
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
  if (!socios || socios.length === 0) return "";

  return socios.map((socio) => {
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

    return `<div class="sec" style="margin-top:20px;padding:18px 20px;background:linear-gradient(135deg,#f8f9fb 0%,#edf2fb 100%);border-radius:10px;border:1px solid #e0e4ec;page-break-inside:avoid;box-shadow:0 2px 8px rgba(32,59,136,.04)">
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
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 19: DRE
// ═══════════════════════════════════════════════════════════════════════════════
function secDre(p: PDFReportParams): string {
  const dre=p.data.dre;
  if(!dre?.anos?.length) return "";
  // Deduplication by ano
  const anosUnicos = dre.anos.filter((a, i, arr) => arr.findIndex(x => x.ano === a.ano) === i);
  const anos=anosUnicos.slice(-3);
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
  <table style="${TS}">
    <thead>${row(["Metrica",...anos.map(a=>`<strong>${esc(a.ano)}</strong>`)],true)}</thead>
    <tbody>${metricas.map(m=>{
      const vals=anos.map(a=>{
        const v=(a as unknown as Record<string,string>)[m.key];
        if(!v||v==="0"||v==="") return "\u2014";
        if(m.isPct) return fmtPct(v);
        if(m.isMoney){
          const n=numVal(v);
          return `<span class="money${n<0?" neg":""}">${fmtMoney(v)}</span>`;
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
// SECTION 20: BALANCO PATRIMONIAL
// ═══════════════════════════════════════════════════════════════════════════════
function secBalanco(p: PDFReportParams): string {
  const bal=p.data.balanco;
  if(!bal?.anos?.length) return "";
  // Deduplication by ano
  const anosUnicos = bal.anos.filter((a, i, arr) => arr.findIndex(x => x.ano === a.ano) === i);
  const anos=anosUnicos.slice(-3);
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
          return `<span class="money${ncg<0?" neg":""}" title="Ativo Circ. ${fmtMoney(String(ac))} - Passivo Circ. ${fmtMoney(String(pc))}">${fmtMoney(String(ncg))}</span>`;
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
  const socios=p.data.irSocios;
  if(!socios?.length) return "";
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
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export function gerarHtmlRelatorio(p: PDFReportParams): {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
} {
  const razao=esc(p.data?.cnpj?.razaoSocial||"Cedente");
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});

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
  ${secScrVencimentos(p)}
  ${secModalidadesScr(p)}
  ${secScrSocios(p)}
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
    <div style="height:2px;background:linear-gradient(90deg,#73B815,#73B815 40%,transparent)"></div>
    <div style="padding:4px 16mm 6px;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#9ca3af">
      <span>Capital Financas &middot; Analise de Credito &middot; ${hoje}</span>
      <span>Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>
  </div>`;

  return {html,headerTemplate,footerTemplate};
}
