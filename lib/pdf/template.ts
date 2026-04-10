import type { PDFReportParams } from "@/lib/generators/pdf";
import type { FundCriterion, ProcessoItem, FaturamentoMensal, SCRSocioData } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return esc(String(v));
}
function fmtMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = parseFloat(String(v).replace(/[^\d,-]/g,"").replace(",","."));
  if (isNaN(n)) return esc(String(v));
  return "R$\u00a0" + n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtCnpj(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g,"");
  return d.length===14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5") : raw;
}
function fmtCpf(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g,"");
  return d.length===11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4") : raw;
}
function numVal(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d,-]/g,"").replace(",","."));
  return isNaN(n) ? 0 : n;
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
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;min-width:0">
    <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${label}</div>
    <div style="font-size:15px;font-weight:800;color:${color};line-height:1.1;word-break:break-all">${value}</div>
    ${sub?`<div style="font-size:9px;color:#9ca3af;margin-top:3px">${sub}</div>`:""}
  </div>`;
}
function kpiSm(label: string, value: string, color="#111827"): string {
  return `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:9px 12px">
    <div style="font-size:8px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">${label}</div>
    <div style="font-size:13px;font-weight:800;color:${color};line-height:1.1">${value}</div>
  </div>`;
}
function kpiDark(label: string, value: string, color="#fff"): string {
  return `<div style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:12px 14px">
    <div style="font-size:9px;color:rgba(255,255,255,.5);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${label}</div>
    <div style="font-size:15px;font-weight:800;color:${color};line-height:1.1">${value}</div>
  </div>`;
}

function secHdr(num: string, title: string): string {
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #e5e7eb">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#1a2744;color:#fff;font-size:9px;font-weight:800;border-radius:6px;flex-shrink:0">${num}</span>
    <span style="font-size:14px;font-weight:800;color:#1a2744;text-transform:uppercase;letter-spacing:.05em">${esc(title)}</span>
    <div style="flex:1;height:2px;background:linear-gradient(to right,#22c55e,transparent)"></div>
  </div>`;
}

function row(cells: string[], head=false): string {
  const tag=head?"th":"td";
  return `<tr>${cells.map(c=>`<${tag}>${c}</${tag}>`).join("")}</tr>`;
}

function alertBox(msg: string, sev: "ALTA"|"MODERADA"|"INFO"): string {
  const cfg={
    ALTA:     {bg:"#fff1f2",brd:"#ef4444",c:"#991b1b",label:"RISCO ALTO"},
    MODERADA: {bg:"#fffbeb",brd:"#f59e0b",c:"#92400e",label:"ATENÇÃO"},
    INFO:     {bg:"#eff6ff",brd:"#3b82f6",c:"#1d4ed8",label:"INFORMAÇÃO"},
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
  return `<div style="font-size:10px;font-weight:800;color:#1a2744;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e5e7eb;padding-bottom:5px;margin:18px 0 10px">${esc(t)}</div>`;
}

function paraBox(text: string): string {
  return `<div style="background:#f8fafc;border-left:3px solid #1a2744;border-radius:0 6px 6px 0;padding:14px 16px;font-size:12px;line-height:1.8;color:#374151;page-break-inside:avoid">${esc(text)}</div>`;
}

const TS = "width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;page-break-inside:avoid";

// ─── SVG Rating Gauge ─────────────────────────────────────────────────────────
function ratingGauge(rating: number): string {
  const cx=90,cy=82,R=68;
  const color=rating>=7?"#22c55e":rating>=4?"#f59e0b":"#ef4444";
  const angle=Math.PI*(1-rating/10);
  const ex=cx+R*Math.cos(angle),ey=cy-R*Math.sin(angle);
  return `<svg width="180" height="90" viewBox="0 0 180 90" style="overflow:visible">
    <path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${cx+R},${cy}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10" stroke-linecap="round"/>
    ${rating>0?`<path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`:""}
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="7" fill="${color}" stroke="#1a2744" stroke-width="2.5"/>
    <text x="${cx}" y="${cy-14}" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="900" fill="${color}">${rating}</text>
    <text x="${cx}" y="${cy+4}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,.35)">/ 10</text>
  </svg>`;
}

// ─── Faturamento Bar Chart ────────────────────────────────────────────────────
function faturamentoChart(meses: FaturamentoMensal[]): string {
  if(!meses||meses.length===0) return "";
  const values=meses.map(m=>numVal(m.valor));
  const max=Math.max(...values,1);
  const n=meses.length,W=480,H=72,gap=3;
  const bw=Math.floor((W-(n-1)*gap)/n);
  const bars=meses.map((m,i)=>{
    const v=values[i],bh=Math.max(3,Math.floor((v/max)*H)),x=i*(bw+gap),y=H-bh;
    const clr=v===0?"#e5e7eb":v===max?"#22c55e":v>=max*0.7?"#4ade80":"#93c5fd";
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="${clr}"/>
<text x="${x+bw/2}" y="${H+11}" text-anchor="middle" font-size="7" fill="#9ca3af" font-family="Arial">${esc(m.mes?.slice(0,3)||"")}</text>`;
  }).join("");
  return `<div style="margin-bottom:14px;padding:12px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e5e7eb">
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Faturamento Mensal</div>
    <svg width="${W}" height="${H+14}" viewBox="0 0 ${W} ${H+14}">${bars}</svg>
  </div>`;
}

// ─── SCR Faixas Bar ───────────────────────────────────────────────────────────
function faixasBar(label: string, faixas: Record<string,string>, color: string): string {
  const ordem=[
    {k:"ate30d",l:"≤30d"},
    {k:"d31_60",l:"31-60d"},
    {k:"d61_90",l:"61-90d"},
    {k:"d91_180",l:"91-180d"},
    {k:"d181_360",l:"181-360d"},
    {k:"acima360d",l:">360d"},
  ];
  const vals=ordem.map(o=>({...o,v:numVal(faixas[o.k])}));
  const max=Math.max(...vals.map(x=>x.v),1);
  const total=vals.reduce((s,x)=>s+x.v,0);
  if(total===0) return "";
  return `<div style="margin-bottom:12px">
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${esc(label)}</div>
    ${vals.filter(x=>x.v>0).map(x=>{
      const pct=Math.round((x.v/max)*100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <div style="width:52px;font-size:9px;color:#6b7280;text-align:right;flex-shrink:0">${x.l}</div>
        <div style="flex:1;height:14px;background:#f3f4f6;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .3s"></div>
        </div>
        <div style="font-size:10px;font-weight:700;color:#374151;width:90px;flex-shrink:0">${fmtMoney(String(x.v))}</div>
      </div>`;
    }).join("")}
    <div style="text-align:right;font-size:9px;color:#6b7280;margin-top:4px">Total: <strong>${fmtMoney(String(total))}</strong></div>
  </div>`;
}

// ─── Donut Chart (processos) ──────────────────────────────────────────────────
function donutChart(segments: {label:string;value:number;color:string}[]): string {
  const total=segments.reduce((s,x)=>s+x.value,0);
  if(total===0) return "";
  const cx=55,cy=55,r=40,sw=16;
  const circ=2*Math.PI*r;
  let offset=0;
  const arcs=segments.filter(s=>s.value>0).map(seg=>{
    const dash=(seg.value/total)*circ;
    const arc=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-(offset/total)*circ).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset+=seg.value;
    return arc;
  });
  const legend=segments.filter(s=>s.value>0).map(s=>`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
      <div style="width:10px;height:10px;border-radius:2px;background:${s.color};flex-shrink:0"></div>
      <div style="font-size:10px;color:#374151">${esc(s.label)}: <strong>${s.value}</strong> <span style="color:#9ca3af">(${Math.round(s.value/total*100)}%)</span></div>
    </div>`).join("");
  return `<div style="display:flex;align-items:center;gap:20px;margin-bottom:14px">
    <svg width="${cx*2}" height="${cy*2}" viewBox="0 0 ${cx*2} ${cy*2}" style="flex-shrink:0">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f3f4f6" stroke-width="${sw}"/>
      ${arcs.join("")}
      <text x="${cx}" y="${cy-4}" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="900" fill="#1a2744">${total}</text>
      <text x="${cx}" y="${cy+12}" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" fill="#9ca3af">processos</text>
    </svg>
    <div>${legend}</div>
  </div>`;
}

const TS_AVOID = TS; // alias for clarity

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#111827;background:#fff;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px}
th{background:#f1f5f9;color:#6b7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb}
td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:11px}
tr:nth-child(even) td{background:#f9fafb}
table{page-break-inside:avoid}
.pb{page-break-before:always;padding-top:2px}
.avoid{page-break-inside:avoid}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.ok{background:#dcfce7;color:#166534}
.fail{background:#fee2e2;color:#991b1b}
.warn{background:#fef3c7;color:#92400e}
.info{background:#dbeafe;color:#1d4ed8}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:90px;font-weight:900;color:rgba(26,39,68,0.035);white-space:nowrap;pointer-events:none;z-index:1;font-family:'Inter',Arial,sans-serif;letter-spacing:.15em;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{@page{margin:28mm 16mm 18mm}}
`;

// ─── Cover ────────────────────────────────────────────────────────────────────
function secCapa(p: PDFReportParams): string {
  const {data,finalRating,decision,companyAge,riskScore,creditLimit}=p;
  const c=data.cnpj;
  const ok=(c?.situacaoCadastral||"").toUpperCase().includes("ATIVA");
  const rc=finalRating>=7?"#22c55e":finalRating>=4?"#f59e0b":"#ef4444";
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const rsMap:Record<string,string>={alto:"#ef4444",medio:"#f59e0b",baixo:"#22c55e"};
  const rsLabel:Record<string,string>={alto:"ALTO",medio:"MÉDIO",baixo:"BAIXO"};
  const limiteStr=creditLimit?.limiteAjustado?fmtMoney(creditLimit.limiteAjustado):null;
  return `<div style="page-break-after:always;min-height:260mm;display:flex;flex-direction:column;background:#0f1e3c">
  <div style="padding:28px 40px 0;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:11px;font-weight:900;color:#fff;letter-spacing:.1em;text-transform:uppercase">CAPITAL <span style="color:#22c55e">FINANÇAS</span></div>
      <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px;letter-spacing:.04em">ANÁLISE DE CRÉDITO</div>
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,.35)">${hoje}</div>
  </div>
  <div style="margin:24px 40px;height:1px;background:rgba(255,255,255,.08)"></div>
  <div style="padding:0 40px;flex:1">
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
      <span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${ok?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)"};color:${ok?"#4ade80":"#fca5a5"};font-size:9px;font-weight:700;letter-spacing:.06em;border:1px solid ${ok?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}">${esc(c?.situacaoCadastral||"—")}</span>
      ${c?.porte?`<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.5);font-size:9px;border:1px solid rgba(255,255,255,.1)">${esc(c.porte)}</span>`:""}
    </div>
    <div style="font-size:28px;font-weight:900;color:#fff;line-height:1.15;margin-bottom:6px;max-width:75%">${esc(c?.razaoSocial||"—")}</div>
    ${c?.nomeFantasia&&c.nomeFantasia!==c.razaoSocial?`<div style="font-size:13px;color:rgba(255,255,255,.45);margin-bottom:6px;font-style:italic">"${esc(c.nomeFantasia)}"</div>`:""}
    <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:28px">CNPJ ${fmtCnpj(c?.cnpj)} &nbsp;·&nbsp; ${esc(companyAge||"—")}${c?.cnaePrincipal?` &nbsp;·&nbsp; ${esc(c.cnaePrincipal)}`:""}</div>
    <div style="display:flex;align-items:flex-end;gap:48px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Decisão de Crédito</div>
        ${decisaoBadge(decision,true)}
        ${riskScore?`<div style="margin-top:8px;font-size:9px;color:rgba(255,255,255,.4)">Nível de risco: <span style="color:${rsMap[riskScore]||"#fff"};font-weight:700">${rsLabel[riskScore]||esc(riskScore)}</span></div>`:""}
        ${limiteStr?`<div style="margin-top:14px"><div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Limite Sugerido</div><div style="font-size:20px;font-weight:900;color:#22c55e">${limiteStr}</div></div>`:""}
      </div>
      <div>
        <div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;text-align:center">Rating de Crédito</div>
        ${ratingGauge(finalRating)}
        <div style="text-align:center;margin-top:2px">
          <span class="badge" style="background:${rc}20;color:${rc};border:1px solid ${rc}50;font-size:9px">${finalRating>=7?"BAIXO RISCO":finalRating>=4?"RISCO MODERADO":"ALTO RISCO"}</span>
        </div>
      </div>
    </div>
  </div>
  <div style="margin:28px 40px 0;padding:16px 0;border-top:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:repeat(4,1fr);gap:0">
    ${kpiDark("Dívida SCR",fmtMoney(data.scr?.totalDividasAtivas))}
    ${kpiDark("Protestos Vigentes",fmt(data.protestos?.vigentesQtd),p.protestosVigentes>0?"#fca5a5":"#fff")}
    ${kpiDark("SCR Vencidos",fmtMoney(data.scr?.vencidos),p.vencidosSCR>0?"#fca5a5":"#fff")}
    ${kpiDark("Processos Passivos",fmt(data.processos?.passivosTotal),parseInt(data.processos?.passivosTotal||"0")>15?"#fca5a5":"#fff")}
  </div>
  <div style="padding:12px 40px;background:rgba(0,0,0,.25);margin-top:16px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:9px;color:rgba(255,255,255,.3)">Documento confidencial — uso exclusivamente interno</span>
    <span style="font-size:9px;color:rgba(255,255,255,.25)">Capital Finanças · ${hoje}</span>
  </div>
</div>`;
}

// ─── TOC ──────────────────────────────────────────────────────────────────────
function secSumario(p: PDFReportParams): string {
  type TI=[string,string,string];
  const itens:TI[]=[
    ["00","Sumário Executivo","Visão geral, alertas, pontos fortes e fracos"],
    ["SC","Scorecard do Rating","Breakdown detalhado de como o rating foi calculado"],
    ["01","Cartão CNPJ","Dados cadastrais, sócios, endereço e faturamento"],
  ];
  if(p.creditLimit) itens.push(["CL","Limite de Crédito","Cálculo e parâmetros do limite aprovado"]);
  if(p.fundValidation?.criteria.length) itens.push(["FS","Conformidade com o Fundo","Critérios e parâmetros avaliados"]);
  itens.push(["05","SCR / Bacen","Histórico de crédito, exposição bancária e faixas de vencimento"]);
  if(p.data.scrSocios?.length) itens.push(["SS","SCR dos Sócios","Exposição de crédito individual de cada sócio"]);
  const temProt=(p.data.protestos?.vigentesQtd&&p.data.protestos.vigentesQtd!=="0")||p.data.protestos?.detalhes?.length;
  if(temProt) itens.push(["PR","Protestos","Protestos vigentes e histórico de regularizações"]);
  itens.push(["07","Processos Judiciais","Distribuição por tipo e principais processos"]);
  if(p.data.relatorioVisita||p.perguntasVisita?.length) itens.push(["OP","Relatório de Visita","Taxas, limites, condições e observações de campo"]);
  if(p.observacoes?.trim()) itens.push(["NT","Anotações do Analista","Observações e notas livres do analista"]);
  return `<div style="page-break-after:always;padding:4px 0">
  <h2 style="font-size:22px;font-weight:900;color:#1a2744;margin-bottom:6px">Índice do Relatório</h2>
  <div style="height:3px;background:linear-gradient(to right,#22c55e,#1a2744,transparent);margin-bottom:24px;border-radius:2px"></div>
  ${itens.map(([num,title,desc])=>`
  <div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #f3f4f6;page-break-inside:avoid">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:#1a2744;color:#fff;font-size:9px;font-weight:800;border-radius:6px;flex-shrink:0">${num}</span>
    <div style="flex:1"><div style="font-size:13px;font-weight:700;color:#111827">${esc(title)}</div><div style="font-size:10px;color:#9ca3af;margin-top:1px">${esc(desc)}</div></div>
    <div style="width:80px;height:1px;border-top:1px dashed #d1d5db"></div>
  </div>`).join("")}
</div>`;
}

// ─── Executive Summary ────────────────────────────────────────────────────────
function secSumarioExec(p: PDFReportParams): string {
  const {data,finalRating,decision,alerts,alertsHigh,pontosFortes,pontosFracos,resumoExecutivo,protestosVigentes,vencidosSCR,vencidas,prejuizosVal,alavancagem}=p;
  const cap=data.qsa?.capitalSocial||data.cnpj?.capitalSocialCNPJ||"—";
  const fmm=data.faturamento?.fmm12m||data.faturamento?.mediaAno||"—";
  const rc=finalRating>=7?"#16a34a":finalRating>=4?"#d97706":"#dc2626";
  const socios=data.qsa?.quadroSocietario?.slice(0,3).map(s=>esc(s.nome)).join(", ")||"—";
  return `<div class="pb">
  ${secHdr("00","Sumário Executivo")}
  ${alertsHigh.length>0?`<div style="margin-bottom:14px">${alertsHigh.map(a=>alertBox(a.message,"ALTA")).join("")}</div>`:""}
  ${alerts.filter(a=>a.severity!=="ALTA").slice(0,4).map(a=>alertBox(a.message,a.severity as "MODERADA"|"INFO")).join("")}
  ${grid(4,[
    kpi("Rating de Crédito",`${finalRating} / 10`,rc),
    kpi("Decisão",decision.replace(/_/g," ")),
    kpi("Dívida SCR Total",fmtMoney(data.scr?.totalDividasAtivas)),
    kpi("Protestos Vigentes",String(protestosVigentes),protestosVigentes>0?"#dc2626":"#111827"),
  ])}
  ${grid(4,[
    kpi("SCR Vencidos",fmtMoney(data.scr?.vencidos),vencidosSCR>0?"#dc2626":"#111827"),
    kpi("FMM 12 meses",fmtMoney(fmm)),
    kpi("Processos Passivos",fmt(data.processos?.passivosTotal),parseInt(data.processos?.passivosTotal||"0")>15?"#dc2626":"#111827"),
    alavancagem!=null?kpi("Alavancagem",`${alavancagem.toFixed(1)}x`,alavancagem>3?"#dc2626":alavancagem>1.5?"#d97706":"#111827"):kpi("Prejuízos SCR",fmtMoney(data.scr?.prejuizos),prejuizosVal>0?"#dc2626":"#111827"),
  ])}
  <table style="${TS_AVOID}"><tbody>
    ${row(["Razão Social",`<strong>${esc(data.cnpj?.razaoSocial||"—")}</strong>`])}
    ${row(["CNPJ",fmtCnpj(data.cnpj?.cnpj)])}
    ${row(["Situação",`${decisaoBadge(data.cnpj?.situacaoCadastral?.toUpperCase().includes("ATIVA")?"APROVADO":"REPROVADO")} ${esc(data.cnpj?.situacaoCadastral||"—")}`])}
    ${row(["Tempo de Operação",esc(p.companyAge)])}
    ${row(["Sócios",socios])}
    ${row(["Capital Social",fmtMoney(cap)])}
    ${row(["FMM 12 meses",fmtMoney(fmm)])}
    ${vencidas>0?row(["SCR — Operações Vencidas",`<span style="color:#dc2626;font-weight:700">${vencidas} operação(ões)</span>`]):""}
  </tbody></table>
  ${resumoExecutivo?`${subTitle("Análise do Analista / IA")}${paraBox(resumoExecutivo)}`:""}
  ${(pontosFortes.length>0||pontosFracos.length>0)?`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;page-break-inside:avoid">
    ${pontosFortes.length>0?`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px">
      <div style="font-size:9px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">✓ Pontos Fortes</div>
      <ul style="padding-left:16px">${pontosFortes.map(x=>`<li style="font-size:11px;color:#14532d;margin-bottom:4px;line-height:1.5">${esc(x)}</li>`).join("")}</ul>
    </div>`:""}
    ${pontosFracos.length>0?`<div style="background:#fff1f2;border:1px solid #fca5a5;border-radius:8px;padding:14px 16px">
      <div style="font-size:9px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">⚠ Pontos de Atenção</div>
      <ul style="padding-left:16px">${pontosFracos.map(x=>`<li style="font-size:11px;color:#7f1d1d;margin-bottom:4px;line-height:1.5">${esc(x)}</li>`).join("")}</ul>
    </div>`:""}
  </div>`:""}
</div>`;
}

// ─── Scorecard ────────────────────────────────────────────────────────────────
function secScorecard(p: PDFReportParams): string {
  const {data,finalRating,vencidosSCR,vencidas,prejuizosVal,protestosVigentes}=p;
  // Compute each factor (same logic as GenerateStep)
  const situacaoOk=(data.cnpj?.situacaoCadastral||"").toUpperCase().includes("ATIVA");
  let idadeOk=false;
  if(data.cnpj?.dataAbertura){
    const parts=data.cnpj.dataAbertura.split("/");
    if(parts.length>=3){const y=parseInt(parts[parts.length-1],10);if(!isNaN(y))idadeOk=new Date().getFullYear()-y>5;}
  }
  const fatOk=!data.faturamento?.faturamentoZerado;
  const fatAtu=!!(data.faturamento?.dadosAtualizados);
  const vencOk=vencidosSCR===0&&vencidas===0;
  const prejOk=prejuizosVal===0;
  const cl=(data.scr?.classificacaoRisco||"").toUpperCase().trim();
  const classOk=["A","AA","B","C"].includes(cl);
  const protOk=protestosVigentes===0;
  const rjOk=!data.processos?.temRJ&&!data.processos?.temFalencia;

  type Fator={label:string;desc:string;peso:number;ok:boolean;valor?:string};
  const fatores:Fator[]=[
    {label:"Situação Cadastral",     desc:"ATIVA no CNPJ",               peso:1.0, ok:situacaoOk, valor:data.cnpj?.situacaoCadastral||"—"},
    {label:"Tempo de Operação",      desc:"Mais de 5 anos",               peso:1.0, ok:idadeOk,    valor:p.companyAge||"—"},
    {label:"Faturamento Saudável",   desc:"Faturamento não zerado",       peso:1.5, ok:fatOk,      valor:fatOk?"Positivo":"Zerado"},
    {label:"Dados Atualizados",      desc:"Faturamento do mês corrente",  peso:0.5, ok:fatAtu,     valor:fatAtu?"Atualizado":"Desatualizado"},
    {label:"SCR Sem Vencidos",       desc:"Nenhuma operação vencida",     peso:1.5, ok:vencOk,     valor:vencOk?"R$ 0,00":fmtMoney(data.scr?.vencidos)},
    {label:"SCR Sem Prejuízos",      desc:"Nenhum prejuízo registrado",   peso:1.5, ok:prejOk,     valor:prejOk?"R$ 0,00":fmtMoney(data.scr?.prejuizos)},
    {label:"Classificação de Risco", desc:"Carteira A, B ou C no SCR",   peso:1.0, ok:classOk,    valor:cl||"—"},
    {label:"Sem Protestos",          desc:"Zero protestos vigentes",      peso:1.0, ok:protOk,     valor:protOk?"0 protestos":`${protestosVigentes} protesto(s)`},
    {label:"Processos Saudáveis",    desc:"Sem RJ nem pedido de falência",peso:0.5, ok:rjOk,       valor:rjOk?"Normal":"Atenção"},
    {label:"Base",                   desc:"Dados mínimos disponíveis",    peso:0.5, ok:true,        valor:"—"},
  ];
  const maxScore=fatores.reduce((s,f)=>s+f.peso,0);
  const localScore=fatores.filter(f=>f.ok).reduce((s,f)=>s+f.peso,0);
  const usandoIA=finalRating!==Math.min(10,Math.round(localScore*10)/10);

  return `<div class="pb">
  ${secHdr("SC","Scorecard do Rating")}
  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;page-break-inside:avoid">
    <div>
      <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Rating Final</div>
      <div style="font-size:28px;font-weight:900;color:${finalRating>=7?"#16a34a":finalRating>=4?"#d97706":"#dc2626"}">${finalRating}<span style="font-size:14px;color:#9ca3af"> / 10</span></div>
    </div>
    <div style="width:1px;height:48px;background:#e5e7eb"></div>
    <div>
      <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Score Base (fatores)</div>
      <div style="font-size:28px;font-weight:900;color:#374151">${Math.min(10,Math.round(localScore*10)/10)}<span style="font-size:14px;color:#9ca3af"> / ${maxScore}</span></div>
    </div>
    ${usandoIA?`<div style="width:1px;height:48px;background:#e5e7eb"></div>
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:8px 12px">
      <div style="font-size:9px;color:#1d4ed8;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Ajuste por IA</div>
      <div style="font-size:11px;color:#1e40af">Rating final ajustado pela análise de inteligência artificial</div>
    </div>`:""}
  </div>

  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#f1f5f9;padding:8px 14px;display:grid;grid-template-columns:1fr 60px 130px 70px;font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;gap:8px">
      <span>Fator</span><span style="text-align:center">Peso</span><span>Valor Apurado</span><span style="text-align:right">Pontos</span>
    </div>
    ${fatores.map((f,i)=>{
      const earned=f.ok?f.peso:0;
      const pct=Math.round((f.peso/maxScore)*100);
      return `<div style="display:grid;grid-template-columns:1fr 60px 130px 70px;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #f3f4f6;background:${i%2===0?"#fff":"#fafafa"}">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:${f.ok?"#dcfce7":"#fee2e2"};color:${f.ok?"#16a34a":"#dc2626"};font-size:11px;font-weight:900;flex-shrink:0">${f.ok?"✓":"✗"}</span>
            <div>
              <div style="font-size:11px;font-weight:600;color:#111827">${esc(f.label)}</div>
              <div style="font-size:9px;color:#9ca3af">${esc(f.desc)}</div>
            </div>
          </div>
        </div>
        <div style="text-align:center">
          <span style="font-size:10px;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:4px">${pct}%</span>
        </div>
        <div style="font-size:10px;color:#374151;font-style:italic">${esc(f.valor||"—")}</div>
        <div style="text-align:right">
          <span style="font-size:13px;font-weight:800;color:${f.ok?"#16a34a":"#dc2626"}">${earned.toFixed(1)}</span>
          <span style="font-size:9px;color:#9ca3af"> / ${f.peso.toFixed(1)}</span>
        </div>
      </div>`;
    }).join("")}
    <div style="background:#f8fafc;padding:10px 14px;display:grid;grid-template-columns:1fr 60px 130px 70px;gap:8px;border-top:2px solid #e5e7eb">
      <div style="font-size:12px;font-weight:800;color:#1a2744">Total</div>
      <div></div>
      <div style="font-size:10px;color:#6b7280">${fatores.filter(f=>f.ok).length} de ${fatores.length} fatores aprovados</div>
      <div style="text-align:right;font-size:15px;font-weight:900;color:${localScore>=7?"#16a34a":localScore>=4?"#d97706":"#dc2626"}">${Math.min(10,Math.round(localScore*10)/10)}</div>
    </div>
  </div>
</div>`;
}

// ─── Credit Limit ─────────────────────────────────────────────────────────────
function secCreditLimit(p: PDFReportParams): string {
  const cl=p.creditLimit;
  if(!cl) return "";
  const dataRev=cl.dataRevisao?new Date(cl.dataRevisao).toLocaleDateString("pt-BR"):"—";
  const reducaoLabel=cl.fatorReducao===1?"Sem redução (APROVADO)":cl.fatorReducao===0.7?"Redução 30% (CONDICIONAL)":"Bloqueado (REPROVADO)";
  const clrDecisao=cl.classificacao==="APROVADO"?"#16a34a":cl.classificacao==="CONDICIONAL"?"#d97706":"#dc2626";
  return `<div class="pb">
  ${secHdr("CL","Limite de Crédito")}
  ${grid(3,[
    kpi("Limite Aprovado",fmtMoney(cl.limiteAjustado),clrDecisao),
    kpi("Classificação",cl.classificacao,clrDecisao),
    kpi("Preset Utilizado",esc(cl.presetName)),
  ])}

  ${subTitle("Cálculo do Limite")}
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:14px;page-break-inside:avoid">
    ${[
      {step:"1",label:"FMM 12 meses (base)",value:fmtMoney(cl.fmmBase),note:"Faturamento médio mensal dos últimos 12 meses",color:"#f8fafc"},
      {step:"×",label:`Fator do fundo (${cl.fatorBase}x)`,value:`× ${cl.fatorBase}`,note:`Parâmetro do preset "${esc(cl.presetName)}"`,color:"#f8fafc"},
      {step:"=",label:"Limite Base",value:fmtMoney(cl.limiteBase),note:"FMM × fator antes das reduções",color:"#eff6ff"},
      {step:"×",label:`Fator de redução (${cl.fatorReducao}x)`,value:`× ${cl.fatorReducao}`,note:reducaoLabel,color:cl.fatorReducao<1?"#fff9eb":"#f8fafc"},
      {step:"=",label:"Limite Ajustado",value:`<strong style="font-size:15px;color:${clrDecisao}">${fmtMoney(cl.limiteAjustado)}</strong>`,note:"Limite final aprovado para a operação",color:cl.classificacao==="APROVADO"?"#f0fdf4":cl.classificacao==="CONDICIONAL"?"#fffbeb":"#fff1f2"},
    ].map(s=>`<div style="display:grid;grid-template-columns:32px 1fr 140px;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f3f4f6;background:${s.color}">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#1a2744;color:#fff;font-size:12px;font-weight:900;border-radius:6px">${s.step}</span>
      <div><div style="font-size:12px;font-weight:600;color:#111827">${s.label}</div><div style="font-size:9px;color:#9ca3af;margin-top:1px">${s.note}</div></div>
      <div style="text-align:right;font-size:13px;font-weight:700;color:#374151">${s.value}</div>
    </div>`).join("")}
  </div>

  ${subTitle("Condições e Vigência")}
  ${grid(4,[
    kpi("Prazo Máximo",`${cl.prazo} dias`),
    kpi("Próxima Revisão",dataRev),
    kpi("Concentração Máx.",`${cl.concentracaoMaxPct}% / sacado`),
    kpi("Limite / Sacado",fmtMoney(cl.limiteConcentracao)),
  ])}
</div>`;
}

// ─── CNPJ ────────────────────────────────────────────────────────────────────
function secCnpj(p: PDFReportParams): string {
  const {data}=p;
  const c=data.cnpj,cap=data.qsa?.capitalSocial||c?.capitalSocialCNPJ||"",ok=(c?.situacaoCadastral||"").toUpperCase().includes("ATIVA");
  const fat=data.faturamento;
  return `<div class="pb">
  ${secHdr("01","Cartão CNPJ")}
  <div style="background:#1a2744;border-radius:10px;padding:20px 24px;margin-bottom:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;page-break-inside:avoid">
    <div style="flex:1;min-width:0">
      <div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:3px;line-height:1.2">${esc(c?.razaoSocial||"—")}</div>
      ${c?.nomeFantasia&&c.nomeFantasia!==c.razaoSocial?`<div style="font-size:11px;color:rgba(255,255,255,.45);font-style:italic;margin-bottom:4px">"${esc(c.nomeFantasia)}"</div>`:""}
      <div style="font-size:11px;color:rgba(255,255,255,.45)">CNPJ ${fmtCnpj(c?.cnpj)}</div>
      ${c?.cnaePrincipal?`<div style="margin-top:8px;display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(34,197,94,.12);color:#4ade80;font-size:9px;font-weight:600;border:1px solid rgba(34,197,94,.2)">${esc(c.cnaePrincipal)}</div>`:""}
    </div>
    <span style="flex-shrink:0;padding:5px 14px;border-radius:6px;background:${ok?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)"};color:${ok?"#4ade80":"#fca5a5"};font-size:10px;font-weight:700;border:1px solid ${ok?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}">${esc(c?.situacaoCadastral||"—")}</span>
  </div>
  ${grid(4,[kpi("Data de Abertura",fmt(c?.dataAbertura)),kpi("Natureza Jurídica",fmt(c?.naturezaJuridica)),kpi("Porte",fmt(c?.porte)),kpi("Capital Social",fmtMoney(cap))])}
  ${[c?.tipoEmpresa,c?.regimeTributario,c?.funcionarios,c?.telefone].some(Boolean)?grid(4,[
    c?.tipoEmpresa?kpi("Tipo de Empresa",fmt(c.tipoEmpresa)):"",
    c?.regimeTributario?kpi("Regime Tributário",fmt(c.regimeTributario)):"",
    c?.funcionarios?kpi("Funcionários",fmt(c.funcionarios)):"",
    c?.telefone?kpi("Telefone",fmt(c.telefone)):"",
  ]):""}
  ${c?.endereco?`<div style="background:#f8fafc;border:1px solid #e5e7eb;border-left:3px solid #22c55e;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:14px;page-break-inside:avoid">
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Endereço Principal</div>
    <div style="font-size:12px;font-weight:600;color:#111827">${esc(c.endereco)}</div>
    ${c.email?`<div style="font-size:11px;color:#6b7280;margin-top:3px">${esc(c.email)}</div>`:""}
  </div>`:""}
  ${fat&&!fat.faturamentoZerado?`
  ${subTitle("Faturamento")}
  ${grid(4,[
    fat.fmm12m?kpi("FMM 12 meses",fmtMoney(fat.fmm12m)):"",
    fat.mediaAno?kpi("Média Anual",fmtMoney(fat.mediaAno)):"",
    fat.somatoriaAno?kpi("Somatória Ano",fmtMoney(fat.somatoriaAno)):"",
    fat.tendencia?kpi("Tendência",fat.tendencia==="crescimento"?"↑ Crescimento":fat.tendencia==="queda"?"↓ Queda":"→ Estável",fat.tendencia==="crescimento"?"#16a34a":fat.tendencia==="queda"?"#dc2626":"#111827"):"",
  ].filter(Boolean).slice(0,4))}
  ${fat.meses?.length>0?faturamentoChart(fat.meses):""}`:""}
  ${data.qsa?.quadroSocietario?.filter(s=>s.nome).length?`
  ${subTitle("Quadro Societário")}
  <table style="${TS_AVOID}">
    <thead>${row(["Nome","CPF / CNPJ","Qualificação","Participação"],true)}</thead>
    <tbody>${data.qsa.quadroSocietario.filter(s=>s.nome).map(s=>row([
      `<strong>${esc(s.nome)}</strong>`,fmtCnpj(s.cpfCnpj),fmt(s.qualificacao),
      s.participacao?(String(s.participacao).includes("%")?esc(s.participacao):esc(s.participacao)+"%"):"—",
    ])).join("")}</tbody>
  </table>`:""}
</div>`;
}

// ─── Fund Compliance ──────────────────────────────────────────────────────────
function secFundo(p: PDFReportParams): string {
  if(!p.fundValidation||p.fundValidation.criteria.length===0) return "";
  const fv=p.fundValidation;
  const norm=(t:string)=>t.replace(/≥/g,">=").replace(/≤/g,"<=");
  const aprov=fv.failCount===0&&!fv.hasEliminatoria;
  const cond=fv.warnCount>0&&fv.failCount===0;
  const vBg=aprov?"#f0fdf4":cond?"#fffbeb":"#fff1f2";
  const vBrd=aprov?"#86efac":cond?"#fde68a":"#fca5a5";
  const vClr=aprov?"#166534":cond?"#92400e":"#991b1b";
  const vTxt=(fv.hasEliminatoria&&fv.failCount>0)?"EMPRESA NÃO ELEGÍVEL — Critério eliminatório não atendido":fv.failCount>0?"REPROVADO PELOS PARÂMETROS DO FUNDO":fv.warnCount>0?"APROVAÇÃO CONDICIONAL":"EMPRESA ELEGÍVEL — Todos os critérios atendidos";
  const total=fv.criteria.length;
  const pctPass=Math.round((fv.passCount/total)*100);
  return `<div class="pb">
  ${secHdr("FS","Conformidade com Parâmetros do Fundo")}
  ${grid(3,[kpi("Aprovados",String(fv.passCount),"#16a34a",`${pctPass}% do total`),kpi("Em Atenção",String(fv.warnCount),fv.warnCount>0?"#d97706":"#111827"),kpi("Reprovados",String(fv.failCount),fv.failCount>0?"#dc2626":"#111827",fv.hasEliminatoria?"inclui eliminatório":"")])}
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:14px;page-break-inside:avoid">
    <div style="background:#f1f5f9;padding:9px 14px;display:grid;grid-template-columns:auto 1fr 90px 90px;gap:8px;font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">
      <span style="width:20px"></span><span>Critério</span><span style="text-align:right">Limite</span><span style="text-align:right">Apurado</span>
    </div>
    ${fv.criteria.map((cr:FundCriterion)=>{
      const ok=cr.status==="ok",err=cr.status==="error";
      const rb=err?(cr.eliminatoria?"#fff0f0":"#fff5f5"):!ok?"#fffbeb":"transparent";
      const ac=ok?"#16a34a":err?"#dc2626":"#d97706";
      const ic=ok?`<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#dcfce7;color:#16a34a;font-size:12px;font-weight:900">✓</span>`:err?`<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#fee2e2;color:#dc2626;font-size:12px;font-weight:900">✗</span>`:`<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#fef3c7;color:#d97706;font-size:12px;font-weight:700">!</span>`;
      return `<div style="display:grid;grid-template-columns:auto 1fr 90px 90px;align-items:start;gap:8px;padding:10px 14px;border-top:1px solid #f3f4f6;background:${rb}">
        <span>${ic}</span>
        <div>
          <div style="font-size:11px;font-weight:600;color:#111827">${esc(cr.eliminatoria?"★ "+cr.label:cr.label)}</div>
          ${cr.detail?`<div style="font-size:10px;color:#6b7280;margin-top:2px;font-style:italic">${esc(cr.detail)}</div>`:""}
          ${cr.eliminatoria?`<span class="badge fail" style="font-size:8px;margin-top:4px;display:inline-block">ELIMINATÓRIO</span>`:""}
        </div>
        <div style="text-align:right;font-size:10px;color:#9ca3af;padding-top:2px">${esc(norm(cr.threshold||""))}</div>
        <div style="text-align:right;font-size:12px;font-weight:700;color:${ac}">${esc(cr.actual||"—")}</div>
      </div>`;
    }).join("")}
  </div>
  <div style="border-radius:8px;padding:16px 20px;background:${vBg};border:1px solid ${vBrd};display:flex;align-items:center;gap:14px;page-break-inside:avoid">
    <div style="flex:1">
      <div style="font-size:9px;color:#9ca3af;margin-bottom:4px">${fv.passCount} de ${total} critérios aprovados</div>
      <div style="font-size:13px;font-weight:800;color:${vClr}">${vTxt}</div>
    </div>
    <span style="font-size:22px;font-weight:900;color:${vClr}">${pctPass}%</span>
  </div>
  ${fv.criteria.some((c:FundCriterion)=>c.eliminatoria)?`<div style="margin-top:8px;font-size:9px;color:#9ca3af;font-style:italic">★ Critério eliminatório — não atendimento impede aprovação independente dos demais.</div>`:""}
</div>`;
}

// ─── SCR ──────────────────────────────────────────────────────────────────────
function secScr(p: PDFReportParams): string {
  const {data,vencidosSCR,vencidas,prejuizosVal}=p;
  const scr=data.scr;
  if(!scr) return "";
  const prev=data.scrAnterior;
  const mods=(scr.modalidades||[]).filter(m=>m.nome);
  const insts=(scr.instituicoes||[]).slice(0,8);
  function delta(cur:string|undefined,ant:string|undefined):string{
    const c=numVal(cur),a=numVal(ant);
    if(a===0||c===0) return "";
    const d=c-a,pct=Math.round((d/a)*100),up=d>0;
    return `<span style="font-size:9px;font-weight:700;color:${up?"#dc2626":"#16a34a"};margin-left:6px">${up?"↑":"↓"} ${Math.abs(pct)}%</span>`;
  }
  return `<div class="pb">
  ${secHdr("05","SCR / Bacen")}
  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:10px;color:#6b7280;page-break-inside:avoid">
    Período: <strong style="color:#111827">${fmt(scr.periodoReferencia)}</strong>
    ${prev?.periodoReferencia?` &nbsp;·&nbsp; Anterior: <strong style="color:#111827">${fmt(prev.periodoReferencia)}</strong>`:""}
    ${scr.qtdeInstituicoes?` &nbsp;·&nbsp; ${esc(scr.qtdeInstituicoes)} inst.`:""}
    ${scr.qtdeOperacoes?` &nbsp;·&nbsp; ${esc(scr.qtdeOperacoes)} op.`:""}
    ${scr.classificacaoRisco?` &nbsp;·&nbsp; Risco: <strong style="color:${["A","AA","B","C"].includes(scr.classificacaoRisco.toUpperCase())?"#16a34a":"#dc2626"}">${esc(scr.classificacaoRisco)}</strong>`:""}
  </div>
  ${grid(3,[
    kpi("Total Dívidas"+delta(scr.totalDividasAtivas,prev?.totalDividasAtivas),fmtMoney(scr.totalDividasAtivas)),
    kpi("Carteira a Vencer"+delta(scr.carteiraAVencer,prev?.carteiraAVencer),fmtMoney(scr.carteiraAVencer)),
    kpi("Vencidos"+delta(scr.vencidos,prev?.vencidos),fmtMoney(scr.vencidos),vencidosSCR>0?"#dc2626":"#111827"),
  ])}
  ${grid(3,[
    kpi("Prejuízos",fmtMoney(scr.prejuizos),prejuizosVal>0?"#dc2626":"#111827"),
    kpi("Curto Prazo",fmtMoney(scr.carteiraCurtoPrazo)),
    kpi("Longo Prazo",fmtMoney(scr.carteiraLongoPrazo)),
  ])}
  ${vencidas>0?alertBox(`${vencidas} operação(ões) vencida(s). Total: ${fmtMoney(scr.vencidos)}`,"ALTA"):""}
  ${prejuizosVal>0?alertBox(`Prejuízos identificados: ${fmtMoney(scr.prejuizos)}`,"ALTA"):""}

  ${scr.faixasAVencer&&numVal(scr.faixasAVencer.total)>0?`${subTitle("Faixas de Vencimento — Carteira a Vencer")}${faixasBar("",scr.faixasAVencer as unknown as Record<string,string>,"#3b82f6")}`:""}
  ${scr.faixasVencidos&&numVal(scr.faixasVencidos.total)>0?`${subTitle("Faixas de Vencimento — Vencidos")}${faixasBar("",scr.faixasVencidos as unknown as Record<string,string>,"#ef4444")}`:""}

  ${prev?`${subTitle("Comparativo de Períodos")}
  <table style="${TS_AVOID}">
    <thead>${row(["Métrica",fmt(prev.periodoReferencia)+" (ant.)",fmt(scr.periodoReferencia)+" (atual)","Variação"],true)}</thead>
    <tbody>
      ${row(["Total Dívidas",fmtMoney(prev.totalDividasAtivas),fmtMoney(scr.totalDividasAtivas),delta(scr.totalDividasAtivas,prev.totalDividasAtivas)||"—"])}
      ${row(["Carteira a Vencer",fmtMoney(prev.carteiraAVencer),fmtMoney(scr.carteiraAVencer),delta(scr.carteiraAVencer,prev.carteiraAVencer)||"—"])}
      ${row(["Vencidos",fmtMoney(prev.vencidos),`<span style="${numVal(scr.vencidos)>0?"color:#dc2626;font-weight:700":""}">${fmtMoney(scr.vencidos)}</span>`,delta(scr.vencidos,prev.vencidos)||"—"])}
      ${row(["Prejuízos",fmtMoney(prev.prejuizos),`<span style="${numVal(scr.prejuizos)>0?"color:#dc2626;font-weight:700":""}">${fmtMoney(scr.prejuizos)}</span>`,delta(scr.prejuizos,prev.prejuizos)||"—"])}
    </tbody>
  </table>`:""}

  ${mods.length>0?`${subTitle("Modalidades de Crédito")}
  <table style="${TS_AVOID}">
    <thead>${row(["Modalidade","Total","A Vencer","Vencido","Part."],true)}</thead>
    <tbody>${mods.map(m=>row([esc(m.nome),fmtMoney(m.total),fmtMoney(m.aVencer),`<span style="${m.vencido&&m.vencido!=="0"?"color:#dc2626;font-weight:700":""}">${fmtMoney(m.vencido)}</span>`,fmt(m.participacao)])).join("")}</tbody>
  </table>`:""}
  ${insts.length>0?`${subTitle("Principais Instituições")}
  <table style="${TS_AVOID}">
    <thead>${row(["Instituição","Exposição Total"],true)}</thead>
    <tbody>${insts.map(i=>row([esc(i.nome),fmtMoney(i.valor)])).join("")}</tbody>
  </table>`:""}
</div>`;
}

// ─── SCR Sócios ───────────────────────────────────────────────────────────────
function secScrSocios(p: PDFReportParams): string {
  const socios=p.data.scrSocios;
  if(!socios||socios.length===0) return "";
  function socioCard(s: SCRSocioData): string {
    const scr=s.periodoAtual;
    const prev=s.periodoAnterior;
    const venc=numVal(scr.vencidos);
    const prej=numVal(scr.prejuizos);
    const hasRisk=venc>0||prej>0;
    function delta(cur:string|undefined,ant:string|undefined):string{
      const c=numVal(cur),a=numVal(ant);
      if(a===0||c===0) return "";
      const d=c-a,pct=Math.round((d/a)*100),up=d>0;
      return `<span style="font-size:8px;color:${up?"#dc2626":"#16a34a"};margin-left:4px">${up?"↑":"↓"}${Math.abs(pct)}%</span>`;
    }
    return `<div style="border:1px solid ${hasRisk?"#fca5a5":"#e5e7eb"};border-left:4px solid ${hasRisk?"#ef4444":"#22c55e"};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="font-size:13px;font-weight:800;color:#111827">${esc(s.nomeSocio)}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:1px">CPF ${fmtCpf(s.cpfSocio)} &nbsp;·&nbsp; Período: ${fmt(scr.periodoReferencia)}</div>
        </div>
        ${hasRisk?`<span class="badge fail">RISCO ALTO</span>`:`<span class="badge ok">NORMAL</span>`}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${kpiSm("Total Dívidas"+delta(scr.totalDividasAtivas,prev?.totalDividasAtivas),fmtMoney(scr.totalDividasAtivas))}
        ${kpiSm("A Vencer",fmtMoney(scr.carteiraAVencer))}
        ${kpiSm("Vencidos"+delta(scr.vencidos,prev?.vencidos),fmtMoney(scr.vencidos),venc>0?"#dc2626":"#111827")}
        ${kpiSm("Prejuízos",fmtMoney(scr.prejuizos),prej>0?"#dc2626":"#111827")}
      </div>
      ${scr.classificacaoRisco?`<div style="margin-top:8px;font-size:10px;color:#6b7280">Classificação de risco: <strong style="color:${["A","AA","B","C"].includes(scr.classificacaoRisco.toUpperCase())?"#16a34a":"#dc2626"}">${esc(scr.classificacaoRisco)}</strong>${scr.qtdeInstituicoes?` &nbsp;·&nbsp; ${esc(scr.qtdeInstituicoes)} inst.`:""}</div>`:""}
    </div>`;
  }
  return `<div class="pb">
  ${secHdr("SS","SCR dos Sócios")}
  <div style="background:#fff9eb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#92400e">
    Exposição de crédito <strong>pessoal</strong> de cada sócio. Dívidas pessoais elevadas podem impactar a capacidade de injeção de capital e o risco sistêmico da operação.
  </div>
  ${socios.map(s=>socioCard(s)).join("")}
</div>`;
}

// ─── Protestos ────────────────────────────────────────────────────────────────
function secProtestos(p: PDFReportParams): string {
  const prot=p.data.protestos;
  if(!prot) return "";
  const vig=parseInt(prot.vigentesQtd||"0");
  const reg=parseInt(prot.regularizadosQtd||"0");
  if(vig===0&&reg===0&&(!prot.detalhes||prot.detalhes.length===0)) return "";
  const detalhes=(prot.detalhes||[]).slice(0,10);
  return `<div class="pb">
  ${secHdr("PR","Protestos")}
  ${vig>0?alertBox(`${vig} protesto(s) vigente(s) — valor total: ${fmtMoney(prot.vigentesValor)}`,"ALTA"):""}
  ${grid(4,[
    kpi("Protestos Vigentes",String(vig),vig>0?"#dc2626":"#111827"),
    kpi("Valor Vigentes",fmtMoney(prot.vigentesValor),vig>0?"#dc2626":"#111827"),
    kpi("Regularizados",String(reg)),
    kpi("Valor Regularizados",fmtMoney(prot.regularizadosValor)),
  ])}
  ${detalhes.length>0?`${subTitle("Detalhes dos Protestos")}
  <table style="${TS_AVOID}">
    <thead>${row(["Data","Credor / Apresentante","Valor","Situação"],true)}</thead>
    <tbody>${detalhes.map(d=>row([fmt(d.data),esc(d.apresentante||d.credor||"—"),fmtMoney(d.valor),`<span class="badge ${d.regularizado?"ok":"fail"}">${d.regularizado?"Regularizado":"Vigente"}</span>`])).join("")}</tbody>
  </table>`:""}
</div>`;
}

// ─── Processos ────────────────────────────────────────────────────────────────
function secProcessos(p: PDFReportParams): string {
  const proc=p.data.processos;
  if(!proc) return "";
  const total=parseInt(proc.passivosTotal||"0");
  const ativo=parseInt(proc.poloAtivoQtd||"0");
  const passiv=parseInt(proc.poloPassivoQtd||"0");
  const top=((proc.top10Valor||proc.top10Recentes||[]) as ProcessoItem[]).slice(0,8);
  const tipoColors:Record<string,string>={
    TRABALHISTA:"#f59e0b",FISCAL:"#ef4444",BANCARIO:"#3b82f6",BANCÁRIO:"#3b82f6",
    FORNECEDOR:"#8b5cf6",OUTROS:"#6b7280",OUTRO:"#6b7280",CIVEL:"#06b6d4",CÍVEL:"#06b6d4",
  };
  const donutSegs=(proc.distribuicao||[]).map(d=>({
    label:esc(d.tipo),value:parseInt(d.qtd||"0"),
    color:tipoColors[d.tipo?.toUpperCase()]||"#94a3b8",
  }));
  return `<div class="pb">
  ${secHdr("07","Processos Judiciais")}
  ${proc.temRJ?alertBox("Pedido de Recuperação Judicial / Falência identificado","ALTA"):""}
  ${proc.temFalencia?alertBox("Pedido de falência identificado","ALTA"):""}
  ${grid(4,[
    kpi("Total Processos",String(total),total>20?"#dc2626":"#111827"),
    kpi("Polo Ativo",String(ativo)),
    kpi("Polo Passivo",String(passiv),passiv>10?"#dc2626":"#111827"),
    kpi("Valor Total Estimado",fmtMoney(proc.valorTotalEstimado)),
  ])}
  ${donutSegs.length>0?`${subTitle("Distribuição por Tipo")}${donutChart(donutSegs)}`:""}
  ${top.length>0?`${subTitle("Principais Processos")}
  <table style="${TS_AVOID}">
    <thead>${row(["Número","Tipo","Data","Valor","Status"],true)}</thead>
    <tbody>${top.map(pr=>row([
      `<span style="font-size:10px;font-family:monospace">${esc(pr.numero)}</span>`,
      esc(pr.tipo),fmt(pr.data),fmtMoney(pr.valor),
      `<span class="badge ${(pr.status||"").toLowerCase().includes("andamento")?"warn":"info"}">${esc(pr.status)}</span>`,
    ])).join("")}</tbody>
  </table>`:""}
</div>`;
}

// ─── Visita ───────────────────────────────────────────────────────────────────
function secVisita(p: PDFReportParams): string {
  const v=p.data.relatorioVisita;
  const perguntas=p.perguntasVisita||[];
  if(!v&&perguntas.length===0) return "";
  const rC:Record<string,string>={aprovado:"#166534",condicional:"#92400e",reprovado:"#991b1b"};
  const rB:Record<string,string>={aprovado:"#dcfce7",condicional:"#fef3c7",reprovado:"#fee2e2"};
  const rL:Record<string,string>={aprovado:"APROVADO",condicional:"CONDICIONAL",reprovado:"REPROVADO"};
  type GI={label:string;value:string};
  function mg(items:GI[]){
    if(items.length===0) return `<div style="color:#9ca3af;font-size:11px;padding:8px 0">Não informado</div>`;
    return grid(Math.min(items.length,3),items.map(i=>kpi(i.label,i.value)));
  }
  const taxas:GI[]=[
    v?.taxaConvencional    ?{label:"Taxa Convencional",   value:v.taxaConvencional+"%"}:null!,
    v?.taxaComissaria      ?{label:"Taxa Comissária",     value:v.taxaComissaria+"%"}:null!,
    v?.limiteTotal         ?{label:"Limite Total",        value:fmtMoney(v.limiteTotal)}:null!,
    v?.limiteConvencional  ?{label:"Limite Convencional", value:fmtMoney(v.limiteConvencional)}:null!,
    v?.limiteComissaria    ?{label:"Limite Comissária",   value:fmtMoney(v.limiteComissaria)}:null!,
    v?.limitePorSacado     ?{label:"Limite / Sacado",     value:fmtMoney(v.limitePorSacado)}:null!,
  ].filter(Boolean);
  const cond:GI[]=[
    v?.prazoMaximoOp         ?{label:"Prazo Máximo Op.",    value:v.prazoMaximoOp+" dias"}:null!,
    v?.prazoRecompraCedente  ?{label:"Recompra Cedente",    value:v.prazoRecompraCedente+" dias"}:null!,
    v?.prazoEnvioCartorio    ?{label:"Envio Cartório",      value:v.prazoEnvioCartorio+" dias"}:null!,
    v?.ticketMedio           ?{label:"Ticket Médio",        value:fmtMoney(v.ticketMedio)}:null!,
    v?.cobrancaTAC           ?{label:"TAC",                 value:esc(v.cobrancaTAC)}:null!,
    v?.tranche               ?{label:"Tranche",             value:fmtMoney(v.tranche)}:null!,
  ].filter(Boolean);
  const mix:GI[]=[
    v?.vendasDuplicata       ?{label:"Duplicata",           value:v.vendasDuplicata+"%"}:null!,
    v?.vendasCheque          ?{label:"Cheque",              value:v.vendasCheque+"%"}:null!,
    v?.vendasOutras          ?{label:"Outras Formas",        value:v.vendasOutras+"%"}:null!,
    v?.prazoMedioFaturamento ?{label:"Prazo Médio Fat.",    value:v.prazoMedioFaturamento+" dias"}:null!,
    v?.prazoMedioEntrega     ?{label:"Prazo Médio Entrega", value:v.prazoMedioEntrega+" dias"}:null!,
    v?.folhaPagamento        ?{label:"Folha Pagamento",     value:fmtMoney(v.folhaPagamento)}:null!,
  ].filter(Boolean);
  return `<div class="pb">
  ${secHdr("OP","Relatório de Visita")}
  ${v?`<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;page-break-inside:avoid">
    <div>
      ${v.dataVisita?`<div style="font-size:11px;color:#6b7280;margin-bottom:2px">Data da Visita: <strong style="color:#111827">${fmt(v.dataVisita)}</strong></div>`:""}
      ${v.responsavelVisita?`<div style="font-size:11px;color:#6b7280">Responsável: <strong style="color:#111827">${esc(v.responsavelVisita)}</strong></div>`:""}
    </div>
    ${v.recomendacaoVisitante?`<span style="display:inline-block;padding:6px 16px;border-radius:6px;background:${rB[v.recomendacaoVisitante]||"#f3f4f6"};color:${rC[v.recomendacaoVisitante]||"#374151"};font-weight:800;font-size:11px">${rL[v.recomendacaoVisitante]||esc(v.recomendacaoVisitante)}</span>`:""}
  </div>
  ${p.streetViewBase64?`<div style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;page-break-inside:avoid">
    <img src="${p.streetViewBase64}" style="width:100%;height:180px;object-fit:cover;display:block"/>
    <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Street View — Fachada do estabelecimento</div>
  </div>`:""}
  ${taxas.length>0?`${subTitle("Taxas e Limites")}${mg(taxas)}`:""}
  ${cond.length>0?`${subTitle("Condições e Prazos")}${mg(cond)}`:""}
  ${mix.length>0?`${subTitle("Mix de Vendas e Operação")}${mg(mix)}`:""}
  ${v.descricaoEstrutura?`${subTitle("Descrição da Estrutura")}${paraBox(v.descricaoEstrutura)}`:""}
  ${v.observacoesLivres?`${subTitle("Observações")}${paraBox(v.observacoesLivres)}`:""}`:p.streetViewBase64?`<div style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
    <img src="${p.streetViewBase64}" style="width:100%;height:180px;object-fit:cover;display:block"/>
    <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Street View — Local do estabelecimento</div>
  </div>`:""}

  ${perguntas.length>0?`${subTitle("Agenda de Visita — Perguntas Sugeridas")}
  <div style="font-size:10px;color:#6b7280;margin-bottom:10px">Questões geradas por análise de IA com base nos dados apurados. Use como roteiro durante a visita ao cedente.</div>
  ${perguntas.map((q,i)=>`<div style="border:1px solid #e5e7eb;border-left:3px solid #3b82f6;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:8px;page-break-inside:avoid">
    <div style="display:flex;gap:10px;align-items:flex-start">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#1a2744;color:#fff;font-size:9px;font-weight:800;border-radius:4px;flex-shrink:0;margin-top:1px">${i+1}</span>
      <div>
        <div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:3px">${esc(q.pergunta)}</div>
        ${q.contexto?`<div style="font-size:10px;color:#6b7280;font-style:italic">${esc(q.contexto)}</div>`:""}
      </div>
    </div>
  </div>`).join("")}`:""}
</div>`;
}

// ─── Notes ────────────────────────────────────────────────────────────────────
function secAnotacoes(p: PDFReportParams): string {
  const t=p.observacoes?.trim();
  if(!t) return "";
  return `<div class="pb">${secHdr("NT","Anotações do Analista")}<div style="background:#f8fafc;border-left:4px solid #1a2744;border-radius:0 8px 8px 0;padding:18px 20px;font-size:12px;line-height:1.9;color:#374151;white-space:pre-wrap;page-break-inside:avoid">${esc(t)}</div></div>`;
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function gerarHtmlRelatorio(p: PDFReportParams): {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
} {
  const razao=esc(p.data?.cnpj?.razaoSocial||"Cedente");
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});

  const html=`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Relatório de Crédito — ${razao}</title>
  <style>${CSS}</style>
</head><body>
  <div class="watermark">CONFIDENCIAL</div>
  ${secCapa(p)}
  ${secSumario(p)}
  ${secSumarioExec(p)}
  ${secScorecard(p)}
  ${secCnpj(p)}
  ${secCreditLimit(p)}
  ${secFundo(p)}
  ${secScr(p)}
  ${secScrSocios(p)}
  ${secProtestos(p)}
  ${secProcessos(p)}
  ${secVisita(p)}
  ${secAnotacoes(p)}
</body></html>`;

  const headerTemplate=`<div style="width:100%;padding:5px 16mm 3px;display:flex;justify-content:space-between;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;color:#6b7280;border-bottom:1px solid #e5e7eb">
    <span style="font-weight:800;color:#1a2744;letter-spacing:.04em">CAPITAL <span style="color:#22c55e">FINANÇAS</span></span>
    <span style="max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${razao}</span>
  </div>`;

  const footerTemplate=`<div style="width:100%;padding:3px 16mm 5px;display:flex;justify-content:space-between;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;color:#9ca3af;border-top:1px solid #f3f4f6">
    <span>Confidencial — uso exclusivamente interno · ${hoje}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;

  return {html,headerTemplate,footerTemplate};
}
