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
  const map: Record<string,{bg:string;color:string;border:string;label:string}> = {
    APROVADO:              {bg:"#dcfce7",color:"#166534",border:"#86efac",label:"APROVADO"},
    APROVACAO_CONDICIONAL: {bg:"#fef9c3",color:"#854d0e",border:"#fde68a",label:"CONDICIONAL"},
    PENDENTE:              {bg:"#fef9c3",color:"#854d0e",border:"#fde68a",label:"PENDENTE"},
    REPROVADO:             {bg:"#fee2e2",color:"#991b1b",border:"#fca5a5",label:"REPROVADO"},
  };
  const d = map[decisao] ?? {bg:"#f3f4f6",color:"#374151",border:"#d1d5db",label:esc(decisao)};
  if (big) return `<span style="display:inline-block;padding:10px 28px;border-radius:10px;background:${d.bg};color:${d.color};font-weight:900;font-size:15px;letter-spacing:.08em;border:2px solid ${d.border}">${d.label}</span>`;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:99px;background:${d.bg};color:${d.color};font-weight:700;font-size:9px;letter-spacing:.05em;text-transform:uppercase">${d.label}</span>`;
}

function kpi(label: string, value: string, color="#111827", sub?: string): string {
  return `<div style="background:#fff;border:1px solid #e0e4ec;border-radius:8px;padding:13px 15px;min-width:0;box-shadow:0 1px 2px rgba(32,59,136,.04)">
    <div style="font-size:8.5px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;font-family:'Open Sans',Arial,sans-serif">${label}</div>
    <div style="font-size:15px;font-weight:800;color:${color};line-height:1.1;word-break:break-all">${value}</div>
    ${sub?`<div style="font-size:9px;color:#9ca3af;margin-top:3px">${sub}</div>`:""}
  </div>`;
}

function secHdr(num: string, title: string): string {
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #e5e7eb">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#203B88;color:#fff;font-size:9px;font-weight:800;border-radius:6px;flex-shrink:0">${num}</span>
    <span style="font-family:'Bebas Neue','Open Sans',Arial,sans-serif;font-size:16px;font-weight:700;color:#203B88;text-transform:uppercase;letter-spacing:.06em">${esc(title)}</span>
    <div style="flex:1;height:2px;background:linear-gradient(to right,#73B815,transparent)"></div>
  </div>`;
}

function row(cells: string[], head=false): string {
  const tag=head?"th":"td";
  return `<tr>${cells.map(c=>`<${tag}>${c}</${tag}>`).join("")}</tr>`;
}

function alertBox(msg: string, sev: "ALTA"|"MODERADA"|"INFO"): string {
  const cfg={
    ALTA:     {bg:"#fff1f2",brd:"#ef4444",c:"#991b1b",label:"RISCO ALTO"},
    MODERADA: {bg:"#fffbeb",brd:"#f59e0b",c:"#92400e",label:"ATENCAO"},
    INFO:     {bg:"#eff6ff",brd:"#3b82f6",c:"#1d4ed8",label:"INFORMACAO"},
  }[sev];
  return `<div style="display:flex;gap:10px;background:${cfg.bg};border-left:4px solid ${cfg.brd};border-radius:0 6px 6px 0;padding:10px 14px;margin-bottom:8px;page-break-inside:avoid">
    <div><div style="font-size:8px;font-weight:800;color:${cfg.c};text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">${cfg.label}</div>
    <div style="font-size:11px;color:${cfg.c};line-height:1.5">${esc(msg)}</div></div>
  </div>`;
}

function grid(cols: number, items: string[]): string {
  const filled=items.filter(Boolean);
  if(filled.length===0) return "";
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;margin-bottom:14px">${items.map(i=>i||"<div></div>").join("")}</div>`;
}

function subTitle(t: string): string {
  return `<div style="font-family:'Bebas Neue','Open Sans',Arial,sans-serif;font-size:11px;font-weight:700;color:#203B88;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e5e7eb;padding-bottom:5px;margin:18px 0 10px">${esc(t)}</div>`;
}

function paraBox(text: string): string {
  return `<div style="background:#f8f9fb;border-left:3px solid #203B88;border-radius:0 6px 6px 0;padding:14px 16px;font-size:12px;line-height:1.8;color:#374151;page-break-inside:avoid">${esc(text)}</div>`;
}

// ─── SVG Brand Logo ──────────────────────────────────────────────────────────
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#203b88"/><circle cx="32" cy="28" r="14" stroke="#ffffff" stroke-width="3.5" fill="none"/><circle cx="32" cy="44" r="3.2" fill="#73b815"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${typeof Buffer !== "undefined" ? Buffer.from(LOGO_SVG).toString("base64") : ""}`;

// ─── SVG Rating Gauge ─────────────────────────────────────────────────────────
function ratingGauge(rating: number): string {
  const cx=90,cy=82,R=68;
  const color=rating>=7?"#22c55e":rating>=4?"#f59e0b":"#ef4444";
  const angle=Math.PI*(1-rating/10);
  const ex=cx+R*Math.cos(angle),ey=cy-R*Math.sin(angle);
  return `<svg width="180" height="90" viewBox="0 0 180 90" style="overflow:visible">
    <path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${cx+R},${cy}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10" stroke-linecap="round"/>
    ${rating>0?`<path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`:""}
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="7" fill="${color}" stroke="#203B88" stroke-width="2.5"/>
    <text x="${cx}" y="${cy-14}" text-anchor="middle" font-family="'Open Sans',Arial,sans-serif" font-size="36" font-weight="900" fill="${color}">${rating}</text>
    <text x="${cx}" y="${cy+4}" text-anchor="middle" font-family="'Open Sans',Arial,sans-serif" font-size="11" fill="rgba(255,255,255,.35)">/ 10</text>
  </svg>`;
}

// ─── Faturamento Bar Chart (improved) ────────────────────────────────────────
function faturamentoChart(meses: FaturamentoMensal[], fmmRef?: number): string {
  if(!meses||meses.length===0) return "";
  const values=meses.map(m=>numVal(m.valor));
  const max=Math.max(...values, fmmRef||0, 1);
  const n=meses.length, W=640, H=140, gap=4, padTop=22, padBot=20;
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
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${clr}"/>
${label ? `<text x="${x+bw/2}" y="${y-5}" text-anchor="middle" font-size="8" font-weight="700" fill="#203B88" font-family="'Open Sans',Arial">${label}</text>` : ""}
<text x="${x+bw/2}" y="${padTop+H+14}" text-anchor="middle" font-size="7.5" fill="#6b7280" font-family="'Open Sans',Arial">${mesLabel}</text>`;
  }).join("");

  const fmmLine = fmmRef && fmmRef > 0 ? (() => {
    const fmmY = padTop + H - Math.floor((fmmRef / max) * H);
    return `<line x1="0" y1="${fmmY}" x2="${W}" y2="${fmmY}" stroke="#73B815" stroke-width="1.5" stroke-dasharray="6,3"/>
<text x="${W-2}" y="${fmmY-4}" text-anchor="end" font-size="8" fill="#73B815" font-weight="700" font-family="'Open Sans',Arial">FMM ${fmtCompact(fmmRef)}</text>`;
  })() : "";

  return `<div style="margin-bottom:14px;padding:16px 18px;background:#f8f9fb;border-radius:8px;border:1px solid #e0e4ec">
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Faturamento Mensal</div>
    <svg width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">${bars}${fmmLine}</svg>
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

function delta(cur:string|undefined,ant:string|undefined):string{
  const c=numVal(cur),a=numVal(ant);
  if(a===0||c===0) return "";
  const d=c-a,pct=Math.round((d/a)*100),up=d>0;
  return `<span style="font-size:9px;font-weight:700;color:${up?"#dc2626":"#16a34a"};margin-left:6px">${up?"\u2191":"\u2193"} ${Math.abs(pct)}%</span>`;
}

const TS = "width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;page-break-inside:avoid";

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&family=Bebas+Neue&display=swap');
:root{--navy:#203B88;--green:#73B815;--bg-light:#edf2fb;--bg-card:#f8f9fb;--border:#e0e4ec;--text:#111827;--text-muted:#6b7280}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Open Sans','Helvetica Neue',Arial,sans-serif;font-size:12px;color:var(--text);background:#fff;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px}
th{background:#203B88;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:9px 11px;text-align:left;border-bottom:2px solid #e5e7eb}
td{padding:9px 11px;border-bottom:1px solid #f0f1f5;vertical-align:top;font-size:11px}
tr:nth-child(even) td{background:#fafbfd}
table{page-break-inside:avoid}
.sec{margin-top:28px}
.avoid{page-break-inside:avoid}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.ok{background:#dcfce7;color:#166534}
.fail{background:#fee2e2;color:#991b1b}
.warn{background:#fef3c7;color:#92400e}
.info{background:#dbeafe;color:#1d4ed8}
.money{text-align:right;font-variant-numeric:tabular-nums}
.neg{color:#dc2626;font-weight:700}
@media print{@page{margin:28mm 16mm 18mm}}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: CAPA
// ═══════════════════════════════════════════════════════════════════════════════
function secCapa(p: PDFReportParams): string {
  const c=p.data.cnpj;
  const ok=(c?.situacaoCadastral||"").toUpperCase().includes("ATIVA");
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  return `<div style="page-break-after:always;min-height:260mm;display:flex;flex-direction:column;background:#203B88">
  <div style="padding:32px 40px 0;display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="${LOGO_DATA_URI}" width="48" height="48" style="border-radius:10px" />
      <div>
        <div style="font-family:'Bebas Neue','Open Sans',Arial,sans-serif;font-size:22px;color:#fff;letter-spacing:.06em;line-height:1">capital <span style="color:#73B815">financas</span></div>
        <div style="font-size:9px;color:rgba(255,255,255,.45);margin-top:2px;letter-spacing:.06em;text-transform:uppercase;font-family:'Open Sans',Arial,sans-serif">Analise de Credito</div>
      </div>
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,.4);font-family:'Open Sans',Arial,sans-serif">${hoje}</div>
  </div>
  <div style="margin:20px 40px;height:1px;background:rgba(255,255,255,.1)"></div>
  <div style="padding:0 40px;flex:1">
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
      <span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${ok?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)"};color:${ok?"#4ade80":"#fca5a5"};font-size:9px;font-weight:700;letter-spacing:.06em;border:1px solid ${ok?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}">${esc(c?.situacaoCadastral||"\u2014")}</span>
    </div>
    <div style="font-family:'Bebas Neue','Open Sans',Arial,sans-serif;font-size:32px;font-weight:700;color:#fff;line-height:1.15;margin-bottom:6px;max-width:75%;letter-spacing:.02em">${esc(c?.razaoSocial||"\u2014")}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.45);margin-bottom:28px;font-family:'Open Sans',Arial,sans-serif">CNPJ ${fmtCnpj(c?.cnpj)} &nbsp;&middot;&nbsp; ${esc(p.companyAge||"\u2014")}</div>
    <div style="display:flex;align-items:flex-end;gap:48px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;font-family:'Open Sans',Arial,sans-serif">Decisao de Credito</div>
        ${decisaoBadge(p.decision,true)}
      </div>
      <div>
        <div style="font-size:9px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;text-align:center;font-family:'Open Sans',Arial,sans-serif">Rating</div>
        ${ratingGauge(p.finalRating)}
      </div>
    </div>
  </div>
  <div style="padding:14px 40px;background:#111827;margin-top:16px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:9px;color:rgba(255,255,255,.35);font-family:'Open Sans',Arial,sans-serif">Documento de uso interno</span>
    <span style="font-size:9px;color:rgba(255,255,255,.3);font-family:'Open Sans',Arial,sans-serif">Capital Financas &middot; ${hoje}</span>
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: CHECKLIST DE DOCUMENTOS
// ═══════════════════════════════════════════════════════════════════════════════
function secChecklist(p: PDFReportParams): string {
  const d=p.data;
  const docs:[string,boolean][]=[
    ["CNPJ",!!d.cnpj],
    ["Contrato Social",!!d.contrato],
    ["Faturamento",!!(d.faturamento?.meses?.length)],
    ["SCR",!!(d.scr?.periodoReferencia)],
    ["Protestos",d.protestos?.vigentesQtd!==undefined],
    ["Processos",d.processos?.passivosTotal!==undefined],
    ["DRE",!!(d.dre?.anos?.length)],
    ["Balanco",!!(d.balanco?.anos?.length)],
    ["IR Socios",!!(d.irSocios?.length)],
    ["Relatorio de Visita",!!(d.relatorioVisita?.dataVisita)],
    ["Curva ABC",!!(d.curvaABC?.clientes?.length)],
    ["CCF",d.ccf?.qtdRegistros!==undefined],
    ["Historico Consultas",!!(d.historicoConsultas?.length)],
  ];
  const recebidos=docs.filter(x=>x[1]).length;
  const pct=Math.round((recebidos/docs.length)*100);
  const barColor = pct >= 80 ? "#73B815" : pct >= 50 ? "#f59e0b" : "#dc2626";
  return `<div class="sec">${secHdr("02","Checklist de Documentos")}
  <div style="margin-bottom:16px;padding:16px 18px;background:#f8f9fb;border-radius:8px;border:1px solid #e0e4ec">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:13px;font-weight:800;color:#111827">${recebidos} de ${docs.length} documentos coletados (${pct}%)</span>
      <span style="font-size:11px;font-weight:700;color:${barColor}">${pct}%</span>
    </div>
    <div style="width:100%;height:10px;background:#e5e7eb;border-radius:6px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${barColor};border-radius:6px;transition:width .3s"></div>
    </div>
  </div>
  <div style="border:1px solid #e0e4ec;border-radius:8px;overflow:hidden;page-break-inside:avoid">
    ${docs.map(([label,ok],i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f3f4f6;background:${i%2===0?"#fff":"#fafbfd"}">
      <span style="font-size:14px">${ok?"\u2705":"\u274C"}</span>
      <span style="font-size:11px;font-weight:${ok?"600":"400"};color:${ok?"#111827":"#9ca3af"}">${esc(label)}</span>
      <span style="margin-left:auto;font-size:9px;color:${ok?"#16a34a":"#dc2626"};font-weight:700">${ok?"Recebido":"Pendente"}</span>
    </div>`).join("")}
  </div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: SINTESE PRELIMINAR
// ═══════════════════════════════════════════════════════════════════════════════
function secSintese(p: PDFReportParams): string {
  const {data,finalRating,decision,alerts,alavancagem}=p;
  const fmm=data.faturamento?.fmm12m||data.faturamento?.mediaAno||"\u2014";
  const rc=finalRating>=7?"#16a34a":finalRating>=4?"#d97706":"#dc2626";

  // Extra KPIs
  const fatMeses = data.faturamento?.meses || [];
  const fatMedia = fatMeses.length > 0 ? fatMeses.reduce((s, m) => s + numVal(m.valor), 0) / fatMeses.length : 0;

  const rv = data.relatorioVisita;
  const modalidade = rv?.modalidade || (rv?.taxaComissaria && rv?.taxaConvencional ? "Hibrida" : rv?.taxaComissaria ? "Comissaria" : rv?.taxaConvencional ? "Convencional" : "\u2014");
  const pleito = rv?.pleito || rv?.limiteTotal || "\u2014";

  const geCount = data.grupoEconomico?.empresas?.length || 0;

  // Curva ABC top 3
  const abcClientes = data.curvaABC?.clientes || [];
  const top3Names = abcClientes.slice(0, 3).map(c => esc(c.nome || "")).join(", ");
  const top3Pct = data.curvaABC?.concentracaoTop3 || (abcClientes.length >= 3 ? "\u2014" : "\u2014");

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

  return `<div class="sec">${secHdr("03","Sintese Preliminar")}
  ${grid(4,[
    kpi("Rating",`${finalRating} / 10`,rc),
    kpi("Decisao",decision.replace(/_/g," ")),
    kpi("FMM 12m",fmtMoney(fmm)),
    kpi("Faturamento Medio", fatMedia > 0 ? fmtMoney(String(fatMedia)) : "\u2014"),
  ])}
  ${grid(4,[
    kpi("Protestos Vigentes",String(p.protestosVigentes),p.protestosVigentes>0?"#dc2626":"#111827"),
    kpi("Processos",`A:${procAtivo} / P:${procPassivo}`),
    kpi("SCR Vencido",fmtMoney(data.scr?.vencidos),p.vencidosSCR>0?"#dc2626":"#111827"),
    kpi("Alavancagem",alavancagem!=null?`${alavancagem.toFixed(1)}x`:"\u2014",alavancagem&&alavancagem>3?"#dc2626":"#111827"),
  ])}
  ${grid(4,[
    kpi("Tempo Empresa",esc(p.companyAge)||"\u2014"),
    kpi("Modalidade",esc(String(modalidade))),
    kpi("Pleito",typeof pleito === "string" ? (pleito.match(/\d/) ? fmtMoney(pleito) : esc(pleito)) : fmtMoney(pleito)),
    kpi("Grupo Economico",geCount > 0 ? `${geCount} empresa(s)` : "\u2014"),
  ])}
  ${grid(4,[
    kpi("Curva ABC Top 3",fmt(top3Pct), "#111827", top3Names || undefined),
    kpi("Ult. Protesto",esc(String(lastProtesto))),
    kpi("Ult. Processo",esc(String(lastProcesso))),
    kpi("CCF", data.ccf ? (data.ccf.qtdRegistros > 0 ? `${data.ccf.qtdRegistros} ocorr.` : "Sem ocorrencias") : "\u2014", data.ccf && data.ccf.qtdRegistros > 0 ? "#dc2626" : "#111827"),
  ])}

  ${subTitle("Composicao do Score")}
  <table style="${TS}">
    <thead>${row(["Componente","Peso","Status","Relevancia","Diagnostico"],true)}</thead>
    <tbody>${scoreRows.map(r=>{
      const clr=r.status==="OK"?"#16a34a":r.status==="ALERTA"?"#dc2626":"#d97706";
      return row([esc(r.comp),esc(r.peso),`<span style="color:${clr};font-weight:700">${esc(r.status)}</span>`,esc(r.relevancia),esc(r.diag)]);
    }).join("")}</tbody>
  </table>

  ${alerts&&alerts.length>0?`${subTitle("Alertas")}${alerts.map(a=>alertBox(a.message,(a.severity||"INFO") as "ALTA"|"MODERADA"|"INFO")).join("")}`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: PARAMETROS OPERACIONAIS
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
  return `<div class="sec">${secHdr("04","Parametros Operacionais")}
  <table style="${TS}">
    <thead>${row(["Parametro","Valor"],true)}</thead>
    <tbody>${params.map(([l,v2])=>row([`<strong>${esc(l)}</strong>`,v2])).join("")}</tbody>
  </table>
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
  return `<div class="sec">${secHdr("05","Conformidade com as Politicas do Fundo")}
  <table style="${TS}">
    <thead>${row(["Criterio","Limite","Apurado","Status"],true)}</thead>
    <tbody>${fv.criteria.map((cr: FundCriterion)=>{
      const ok=cr.status==="ok",err=cr.status==="error";
      const clr=ok?"#16a34a":err?"#dc2626":"#d97706";
      const icon=ok?`<span style="color:#16a34a;font-weight:800;font-size:13px">\u2713</span>`:err?`<span style="color:#dc2626;font-weight:800;font-size:13px">\u2717</span>`:`<span style="color:#d97706;font-weight:800;font-size:13px">!</span>`;
      return `<tr><td style="border-left:3px solid ${clr}"><strong>${esc(cr.label)}</strong>${cr.eliminatoria?' <span class="badge fail" style="font-size:8px">ELIMINATORIO</span>':""}</td><td>${esc(cr.threshold)}</td><td style="font-weight:700;color:${clr}">${esc(cr.actual||"\u2014")}</td><td style="text-align:center">${icon}</td></tr>`;
    }).join("")}</tbody>
  </table>
  <div style="border-radius:8px;padding:14px 18px;background:${vBg};border:1px solid ${vBrd};page-break-inside:avoid">
    <div style="font-size:13px;font-weight:800;color:${vClr}">${aprov?"ELEGIVEL - Todos os criterios atendidos":"NAO ELEGIVEL - Criterio(s) nao atendido(s)"}</div>
    <div style="font-size:9px;color:#9ca3af;margin-top:4px">${fv.passCount} de ${fv.criteria.length} criterios aprovados</div>
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
  const fmmVal = numVal(fat.fmm12m);
  return `<div class="sec">${secHdr("06","Faturamento")}
  ${faturamentoChart(meses, fmmVal > 0 ? fmmVal : undefined)}
  ${fat.fmm12m?`<div style="margin-bottom:14px;font-size:12px;color:#374151">FMM 12 meses: <strong>${fmtMoney(fat.fmm12m)}</strong></div>`:""}
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

  // Distribuicao Temporal
  const now = new Date();
  const parseDate = (d: string | undefined): Date | null => {
    if (!d) return null;
    const parts = d.split("/");
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  };
  const daysDiff = (d: Date): number => Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  type DistTemp = { label: string; qtd: number; valor: number };
  const temporal: DistTemp[] = [
    { label: "Ultimo mes (30 dias)", qtd: 0, valor: 0 },
    { label: "Ultimos 3 meses", qtd: 0, valor: 0 },
    { label: "Ultimos 12 meses", qtd: 0, valor: 0 },
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
    kpi("Vigentes Qtd",String(vig),vig>0?"#dc2626":"#111827"),
    kpi("Vigentes R$",fmtMoney(prot.vigentesValor),vig>0?"#dc2626":"#111827"),
    kpi("Regularizados Qtd",String(reg)),
    kpi("Regularizados R$",fmtMoney(prot.regularizadosValor)),
  ])}
  ${hasDistributions ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
    <div>
      ${subTitle("Distribuicao Temporal")}
      <table style="${TS}">
        <thead>${row(["Periodo","Qtd","Valor"],true)}</thead>
        <tbody>${temporal.map(t => row([esc(t.label), String(t.qtd), fmtMoney(String(t.valor))])).join("")}</tbody>
      </table>
    </div>
    <div>
      ${subTitle("Distribuicao por Faixa de Valor")}
      <table style="${TS}">
        <thead>${row(["Faixa","Qtd","Valor"],true)}</thead>
        <tbody>${faixas.map(f => row([esc(f.label), String(f.qtd), fmtMoney(String(f.valor))])).join("")}</tbody>
      </table>
    </div>
  </div>` : ""}
  ${top10Rec.length>0?`${subTitle("Top 10 Mais Recentes")}
  <table style="${TS}"><thead>${row(["Data","Credor","Valor","Regularizado"],true)}</thead>
  <tbody>${top10Rec.map(d=>row([fmt(d.data),esc(d.apresentante||d.credor||"\u2014"),fmtMoney(d.valor),d.regularizado?'<span class="badge ok">Sim</span>':'<span class="badge fail">Nao</span>'])).join("")}</tbody></table>`:""}
  ${top10Val.length>0?`${subTitle("Top 10 por Valor")}
  <table style="${TS}"><thead>${row(["Data","Credor","Valor","Regularizado"],true)}</thead>
  <tbody>${top10Val.map(d=>row([fmt(d.data),esc(d.apresentante||d.credor||"\u2014"),fmtMoney(d.valor),d.regularizado?'<span class="badge ok">Sim</span>':'<span class="badge fail">Nao</span>'])).join("")}</tbody></table>`:""}
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
  <tbody>${(proc.top10Recentes as ProcessoItem[]).slice(0,10).map(pr=>row([esc(pr.tipo),fmt(pr.data),fmt((pr as {ultimaMovimentacao?:string}).ultimaMovimentacao),esc(pr.assunto),fmtMoney(pr.valor),`<span class="badge ${(pr.status||"").toLowerCase().includes("andamento")?"warn":"info"}">${esc(pr.status)}</span>`,fmt((pr as {fase?:string}).fase)])).join("")}</tbody></table>`:""}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: TOP 10 POR VALOR (PROCESSOS)
// ═══════════════════════════════════════════════════════════════════════════════
function secProcessosTop10Valor(p: PDFReportParams): string {
  const proc=p.data.processos;
  const top=(proc?.top10Valor as ProcessoItem[]|undefined);
  if(!top?.length) return "";
  return `<div class="sec">${secHdr("09","Processos - Top 10 por Valor")}
  <table style="${TS}"><thead>${row(["Tipo","Distrib.","Ult. Movto.","Assunto","Valor","Status","Fase"],true)}</thead>
  <tbody>${top.slice(0,10).map(pr=>row([esc(pr.tipo),fmt(pr.data),fmt((pr as {ultimaMovimentacao?:string}).ultimaMovimentacao),esc(pr.assunto),fmtMoney(pr.valor),`<span class="badge ${(pr.status||"").toLowerCase().includes("andamento")?"warn":"info"}">${esc(pr.status)}</span>`,fmt((pr as {fase?:string}).fase)])).join("")}</tbody></table>
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
  return `<div class="sec">${secHdr("11","Curva ABC")}
  ${grid(3,[
    kpi("Top 3 Clientes %",fmt(abc.concentracaoTop3)),
    kpi("Top 5 Clientes %",fmt(abc.concentracaoTop5)),
    kpi("Total Clientes",String(abc.totalClientesNaBase||abc.totalClientesExtraidos||abc.clientes.length)),
  ])}
  <table style="${TS}"><thead>${row(["#","Cliente","Faturamento","% Receita","Classe"],true)}</thead>
  <tbody>${top5.map((c,i)=>row([String(c.posicao||i+1),`<strong>${esc(c.nome)}</strong>`,fmtMoney(c.valorFaturado),fmt(c.percentualReceita),`<span class="badge ${c.classe==="A"?"ok":c.classe==="B"?"warn":"info"}">${esc(c.classe)}</span>`])).join("")}</tbody></table>
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
  <div style="background:#203B88;border-radius:10px;padding:20px 24px;margin-bottom:16px;page-break-inside:avoid">
    <div style="font-family:'Bebas Neue','Open Sans',Arial,sans-serif;font-size:20px;font-weight:700;color:#fff;margin-bottom:3px;letter-spacing:.02em">${esc(c.razaoSocial||"\u2014")}</div>
    ${c.nomeFantasia&&c.nomeFantasia!==c.razaoSocial?`<div style="font-size:11px;color:rgba(255,255,255,.45);font-style:italic;margin-bottom:4px">"${esc(c.nomeFantasia)}"</div>`:""}
    <div style="font-size:11px;color:rgba(255,255,255,.45)">CNPJ ${fmtCnpj(c.cnpj)}</div>
    <span style="margin-top:8px;display:inline-block;padding:3px 10px;border-radius:4px;background:${ok?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)"};color:${ok?"#4ade80":"#fca5a5"};font-size:9px;font-weight:700">${esc(c.situacaoCadastral||"\u2014")}</span>
  </div>
  <table style="${TS}">
    <tbody>
      ${row(["Razao Social",`<strong>${esc(c.razaoSocial||"\u2014")}</strong>`])}
      ${row(["Nome Fantasia",fmt(c.nomeFantasia)])}
      ${row(["Situacao Cadastral",fmt(c.situacaoCadastral)])}
      ${row(["Data de Abertura",fmt(c.dataAbertura)])}
      ${row(["Natureza Juridica",fmt(c.naturezaJuridica)])}
      ${row(["Porte",fmt(c.porte)])}
      ${row(["Capital Social",fmtMoney(cap)])}
      ${c.tipoEmpresa?row(["Tipo Empresa",fmt(c.tipoEmpresa)]):""}
      ${c.telefone?row(["Telefone",fmt(c.telefone)]):""}
      ${c.email?row(["Email",fmt(c.email)]):""}
      ${row(["Data Situacao",fmt(c.dataSituacaoCadastral)])}
      ${c.endereco?row(["Endereco Principal",esc(c.endereco)]):""}
      ${c.cnaePrincipal?row(["CNAE Principal",esc(c.cnaePrincipal)]):""}
      ${c.cnaeSecundarios?row(["CNAEs Secundarios",esc(c.cnaeSecundarios)]):""}
    </tbody>
  </table>
  ${p.streetViewBase64||p.mapStaticBase64?`<div style="display:grid;grid-template-columns:${p.streetViewBase64&&p.mapStaticBase64?"1fr 1fr":"1fr"};gap:12px;margin-bottom:16px;page-break-inside:avoid">
    ${p.streetViewBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e0e4ec">
      <img src="data:image/jpeg;base64,${p.streetViewBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8f9fb;font-size:9px;color:#9ca3af">Street View</div>
    </div>`:""}
    ${p.mapStaticBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e0e4ec">
      <img src="data:image/jpeg;base64,${p.mapStaticBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8f9fb;font-size:9px;color:#9ca3af">Mapa</div>
    </div>`:""}
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
  ${cap?`<div style="margin-bottom:14px;font-size:12px;color:#374151">Capital Social: <strong>${fmtMoney(cap)}</strong></div>`:""}
  <table style="${TS}">
    <thead>${row(["Nome","CPF/CNPJ","Qualificacao","Participacao %"],true)}</thead>
    <tbody>${qsa.quadroSocietario.filter(s=>s.nome).map(s=>row([
      `<strong>${esc(s.nome)}</strong>`,
      s.cpfCnpj?(s.cpfCnpj.replace(/\D/g,"").length>11?fmtCnpj(s.cpfCnpj):fmtCpf(s.cpfCnpj)):"\u2014",
      fmt(s.qualificacao),
      s.participacao?(String(s.participacao).includes("%")?esc(String(s.participacao)):esc(String(s.participacao))+"%"):"\u2014",
    ])).join("")}</tbody>
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
  <table style="${TS}">
    <tbody>
      ${ct.objetoSocial?row(["Objeto Social",esc(ct.objetoSocial)]):""}
      ${ct.administracao?row(["Administracao e Poderes",esc(ct.administracao)]):""}
      ${ct.capitalSocial?row(["Capital Social",fmtMoney(ct.capitalSocial)]):""}
      ${ct.dataConstituicao?row(["Data de Constituicao",fmt(ct.dataConstituicao)]):""}
      ${ct.prazoDuracao?row(["Prazo de Duracao",fmt(ct.prazoDuracao)]):""}
      ${ct.foro?row(["Foro",fmt(ct.foro)]):""}
    </tbody>
  </table>
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
  <ul style="padding-left:18px;font-size:11px;color:#374151">${ge.parentescosDetectados.map(pr=>`<li>${esc(pr.socio1)} e ${esc(pr.socio2)} - sobrenome: ${esc(pr.sobrenomeComum||"comum")}</li>`).join("")}</ul>`:""}
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
  function addRow(grupo:string,metrica:string,antVal:string|undefined,atualVal:string|undefined){
    const v=delta(atualVal,antVal)||"\u2014";
    rows.push({grupo,metrica,ant:fmtMoney(antVal),atual:fmtMoney(atualVal),variacao:v});
  }
  addRow("CARTEIRA","Curto Prazo",prev.carteiraCurtoPrazo,scr.carteiraCurtoPrazo);
  addRow("CARTEIRA","Longo Prazo",prev.carteiraLongoPrazo,scr.carteiraLongoPrazo);
  addRow("CARTEIRA","A Vencer",prev.carteiraAVencer,scr.carteiraAVencer);
  addRow("INADIMPLENCIA","Total Dividas",prev.totalDividasAtivas,scr.totalDividasAtivas);
  addRow("INADIMPLENCIA","Vencidos",prev.vencidos,scr.vencidos);
  addRow("CAPACIDADE","Limite Credito",prev.limiteCredito,scr.limiteCredito);
  addRow("CAPACIDADE","IFs",prev.qtdeInstituicoes,scr.qtdeInstituicoes);
  addRow("CAPACIDADE","Operacoes",prev.qtdeOperacoes,scr.qtdeOperacoes);
  const fmm=numVal(p.data.faturamento?.fmm12m);
  const alvAtual=fmm>0?`${(numVal(scr.totalDividasAtivas)/fmm).toFixed(1)}x`:"\u2014";
  const alvAnt=fmm>0?`${(numVal(prev.totalDividasAtivas)/fmm).toFixed(1)}x`:"\u2014";
  rows.push({grupo:"RESUMO",metrica:"Alavancagem",ant:alvAnt,atual:alvAtual,variacao:"\u2014"});

  return `<div class="sec">${secHdr("16","Comparativo SCR")}
  <div style="margin-bottom:12px;font-size:10px;color:#6b7280">Anterior: <strong>${perAnt}</strong> | Atual: <strong>${perAtual}</strong></div>
  <table style="${TS}">
    <thead>${row(["Metrica",`${perAnt}`,`${perAtual}`,"Variacao"],true)}</thead>
    <tbody>${rows.map(r=>`<tr><td><strong>${esc(r.metrica)}</strong><br/><span style="font-size:8px;color:#9ca3af">${esc(r.grupo)}</span></td><td>${r.ant}</td><td>${r.atual}</td><td>${r.variacao}</td></tr>`).join("")}</tbody>
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
    void prev; // may be used for modalidades comparison later

    return `<div class="sec" style="margin-top:20px;padding:16px 18px;background:#f8f9fb;border-radius:8px;border:1px solid #e0e4ec;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:#203B88;color:#fff;font-size:8px;font-weight:800;border-radius:5px;flex-shrink:0">PF</span>
        <div>
          <div style="font-size:13px;font-weight:800;color:#111827">${esc(socio.nomeSocio)}</div>
          <div style="font-size:10px;color:#6b7280">CPF ${fmtCpf(socio.cpfSocio)} &middot; Ref: ${perAtual}</div>
        </div>
      </div>
      ${rows.length > 0 ? `<table style="${TS}">
        <thead>${row(prev ? ["Metrica", perAnt, perAtual, "Var."] : ["Metrica", perAtual], true)}</thead>
        <tbody>${rows.map(r => prev
          ? `<tr><td><strong>${esc(r.metrica)}</strong></td><td>${r.ant}</td><td>${r.atual}</td><td>${r.variacao}</td></tr>`
          : `<tr><td><strong>${esc(r.metrica)}</strong></td><td>${r.atual}</td></tr>`
        ).join("")}</tbody>
      </table>` : ""}
      ${mods.length > 0 ? `<div style="font-size:9px;font-weight:700;color:#203B88;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Modalidades</div>
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
  const anos=dre.anos.slice(-3);
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
        if(m.isPct) return fmt(v);
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
  const anos=bal.anos.slice(-3);
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
    {label:"Capital de Giro",key:"capitalDeGiroLiquido",isMoney:true,isPct:false},
  ];
  return `<div class="sec">${secHdr("20","Balanco Patrimonial")}
  <table style="${TS}">
    <thead>${row(["Metrica",...anos.map(a=>`<strong>${esc(a.ano)}</strong>`)],true)}</thead>
    <tbody>${metricas.map(m=>{
      const vals=anos.map(a=>{
        const v=(a as unknown as Record<string,string>)[m.key];
        if(!v||v==="0"||v==="") return "\u2014";
        if(m.isPct) return fmt(v);
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
    return `<div style="border:1px solid #e0e4ec;border-left:4px solid #203B88;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:14px;page-break-inside:avoid">
      <div style="font-size:14px;font-weight:800;color:#111827;margin-bottom:2px">${esc(s.nomeSocio)}</div>
      <div style="font-size:10px;color:#6b7280;margin-bottom:12px">CPF ${fmtCpf(s.cpf)} ${s.anoBase?` &middot; Ano-base ${esc(s.anoBase)}`:""}</div>
      <table style="${TS}">
        <tbody>
          ${row(["Renda Total",fmtMoney(s.rendimentoTotal)])}
          ${row(["Rendimentos Tributaveis",fmtMoney(s.rendimentosTributaveis)])}
          ${row(["Rendimentos Isentos",fmtMoney(s.rendimentosIsentos)])}
          ${row(["Imposto Definido",fmtMoney(s.impostoDefinido)])}
          ${s.valorQuota?row(["Valor da Quota",fmtMoney(s.valorQuota)]):""}
          ${row(["Total Bens e Direitos",fmtMoney(s.totalBensDireitos)])}
          ${row(["Dividas e Onus",fmtMoney(s.dividasOnus)])}
          ${row(["Patrimonio Liquido",fmtMoney(s.patrimonioLiquido)])}
        </tbody>
      </table>
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
  <table style="${TS}">
    <tbody>
      ${v.dataVisita?row(["Data",fmt(v.dataVisita)]):""}
      ${v.responsavelVisita?row(["Responsavel",fmt(v.responsavelVisita)]):""}
      ${v.duracaoVisita?row(["Duracao",fmt(v.duracaoVisita)]):""}
      ${v.localVisita||v.descricaoEstrutura?row(["Local",fmt(v.localVisita||v.descricaoEstrutura)]):""}
    </tbody>
  </table>
  ${pontosPositivos.length>0?`${subTitle("Pontos Positivos")}
  <ul style="padding-left:18px;margin-bottom:14px">${pontosPositivos.map(pt=>`<li style="font-size:11px;color:#166534;margin-bottom:4px;line-height:1.5">${esc(pt)}</li>`).join("")}</ul>`:""}
  ${pontosNegativos.length>0?`${subTitle("Pontos Negativos")}
  <ul style="padding-left:18px;margin-bottom:14px">${pontosNegativos.map(pt=>`<li style="font-size:11px;color:#991b1b;margin-bottom:4px;line-height:1.5">${esc(pt)}</li>`).join("")}</ul>`:""}
  ${v.recomendacaoVisitante?`${subTitle("Recomendacao")}<div style="font-size:12px;color:#374151;margin-bottom:14px">${esc(v.recomendacaoVisitante)}</div>`:""}
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
  <table style="${TS}">
    <thead>${row(["Indicador","Valor"],true)}</thead>
    <tbody>${params.map(([l,val])=>row([`<strong>${esc(l)}</strong>`,val])).join("")}</tbody>
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
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});

  const html=`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Relatorio de Credito \u2014 ${razao}</title>
  <style>${CSS}</style>
</head><body>
  ${secCapa(p)}
  ${secChecklist(p)}
  ${secSintese(p)}
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

  const headerTemplate=`<div style="width:100%;padding:5px 16mm 3px;display:flex;justify-content:space-between;align-items:center;font-family:'Open Sans','Helvetica Neue',Arial,sans-serif;font-size:8px;color:#6b7280;border-bottom:1px solid #e5e7eb">
    <span style="font-weight:800;color:#203B88;letter-spacing:.04em">CAPITAL <span style="color:#73B815">FINANCAS</span></span>
    <span style="max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${razao}</span>
    <span></span>
  </div>`;

  const footerTemplate=`<div style="width:100%;padding:3px 16mm 5px;display:flex;justify-content:space-between;align-items:center;font-family:'Open Sans','Helvetica Neue',Arial,sans-serif;font-size:8px;color:#9ca3af;border-top:1px solid #f3f4f6">
    <span>Uso interno &middot; ${hoje}</span>
    <span>Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;

  return {html,headerTemplate,footerTemplate};
}
