import type { PDFReportParams } from "@/lib/generators/pdf";
import type { FundCriterion, ProcessoItem, FaturamentoMensal, SCRSocioData, Operacao } from "@/types";

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
      <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px;letter-spacing:.04em">ANÁLISE DE CEDENTE — FIDC</div>
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
  if(p.creditLimit||p.data.faturamento?.fmm12m) itens.push(["RC","Capacidade de Recompra","Alavancagem, cobertura anual e patrimonial para FIDC"]);
  if(p.fundValidation?.criteria.length) itens.push(["FS","Conformidade com o Fundo","Critérios e parâmetros avaliados"]);
  itens.push(["05","SCR / Bacen","Histórico de crédito, exposição bancária e faixas de vencimento"]);
  if(p.data.scrSocios?.length) itens.push(["SS","SCR dos Sócios","Exposição de crédito individual de cada sócio"]);
  if(p.data.irSocios?.length) itens.push(["IR","IR dos Sócios","Patrimônio declarado, rendimentos e situação na malha"]);
  const temProt=(p.data.protestos?.vigentesQtd&&p.data.protestos.vigentesQtd!=="0")||p.data.protestos?.detalhes?.length;
  if(temProt) itens.push(["PR","Protestos","Protestos vigentes e histórico de regularizações"]);
  itens.push(["07","Processos Judiciais","Distribuição por tipo e principais processos"]);
  if(p.data.score&&(p.data.score.serasa||p.data.score.spc||p.data.score.quod)) itens.push(["BS","Bureau Score","Serasa, SPC e Quod — scores externos de crédito"]);
  if(p.data.ccf&&p.data.ccf.qtdRegistros>0) itens.push(["CF","CCF — Cheque Sem Fundo","Registros de cheques sem cobertura por banco"]);
  if(p.data.curvaABC?.clientes?.length) itens.push(["SA","Análise de Sacados FIDC","Concentração, risco por sacado e perfil da carteira"]);
  if(p.data.relatorioVisita||p.fundValidation) itens.push(["ET","Elegibilidade dos Títulos","Mix de instrumentos, prazo médio e risco de diluição"]);
  if(p.creditLimit||p.fundValidation||p.data.relatorioVisita) itens.push(["CV","Covenants e Condições","Parâmetros operacionais e gatilhos de monitoramento"]);
  if(p.histOperacoes?.length) itens.push(["HO","Histórico de Operações","Volume, taxa média, inadimplência e registro de todas as operações"]);
  if(p.data.curvaABC?.clientes?.length) itens.push(["CA","Curva ABC de Clientes","Concentração de receita e carteira de sacados"]);
  if(p.data.grupoEconomico?.empresas?.length) itens.push(["GE","Grupo Econômico","Empresas vinculadas e risco consolidado do grupo"]);
  if(p.data.balanco?.anos?.length) itens.push(["BP","Balanço Patrimonial","Ativo, passivo, PL e índices de liquidez e endividamento"]);
  if(p.data.dre?.anos?.length) itens.push(["DR","DRE","Demonstração de resultado e análise de margens"]);
  itens.push(["DC","Checklist de Documentos","Status de recebimento de toda a documentação necessária"]);
  if(p.data.relatorioVisita||p.perguntasVisita?.length) itens.push(["OP","Relatório de Visita","Taxas, limites, condições e observações de campo"]);
  if(p.observacoes?.trim()) itens.push(["NT","Anotações do Analista","Observações e notas livres do analista"]);
  itens.push(["DF","Parecer Final","Decisão consolidada, condições e assinatura do analista"]);
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
  const cl=p.creditLimit;
  const termSheet=cl?`<div style="background:linear-gradient(135deg,#1a2744 0%,#0f172a 100%);border-radius:10px;padding:18px 20px;margin-bottom:18px;page-break-inside:avoid">
  <div style="font-size:9px;font-weight:900;color:#22c55e;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px">Term Sheet — Condições Indicativas</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
    ${[
      ["Decisão",cl.limiteAjustado>0?"Aprovado":"Reprovado"],
      ["Limite Aprovado",fmtMoney(cl.limiteAjustado)],
      ["Prazo Máx.",cl.prazo?`${cl.prazo} dias`:"—"],
      ["Concentração Máx.",cl.concentracaoMaxPct!=null?`${cl.concentracaoMaxPct}%`:"—"],
      ["Fator de Risco",cl.fatorReducao!=null?`${(cl.fatorReducao*100).toFixed(0)}%`:"—"],
      ["Base FMM",fmtMoney(cl.fmmBase)],
    ].map(([l,v])=>`<div style="background:rgba(255,255,255,.07);border-radius:6px;padding:10px 12px">
      <div style="font-size:8px;color:rgba(255,255,255,.45);letter-spacing:.05em;margin-bottom:4px">${l}</div>
      <div style="font-size:13px;font-weight:800;color:#fff">${v}</div>
    </div>`).join("")}
  </div>
</div>`:"";
  return `<div class="pb">
  ${secHdr("00","Sumário Executivo")}
  ${termSheet}
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
  ${p.streetViewBase64||p.mapStaticBase64?`<div style="display:grid;grid-template-columns:${p.streetViewBase64&&p.mapStaticBase64?"1fr 1fr":"1fr"};gap:12px;margin-bottom:16px;page-break-inside:avoid">
    ${p.streetViewBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <img src="${p.streetViewBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Street View — Fachada do estabelecimento</div>
    </div>`:""}
    ${p.mapStaticBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <img src="${p.mapStaticBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Mapa Aéreo — Localização do estabelecimento</div>
    </div>`:""}
  </div>`:""}
  ${taxas.length>0?`${subTitle("Taxas e Limites")}${mg(taxas)}`:""}
  ${cond.length>0?`${subTitle("Condições e Prazos")}${mg(cond)}`:""}
  ${mix.length>0?`${subTitle("Mix de Vendas e Operação")}${mg(mix)}`:""}
  ${v.descricaoEstrutura?`${subTitle("Descrição da Estrutura")}${paraBox(v.descricaoEstrutura)}`:""}
  ${v.observacoesLivres?`${subTitle("Observações")}${paraBox(v.observacoesLivres)}`:""}`:p.streetViewBase64||p.mapStaticBase64?`<div style="display:grid;grid-template-columns:${p.streetViewBase64&&p.mapStaticBase64?"1fr 1fr":"1fr"};gap:12px;margin-bottom:16px">
    ${p.streetViewBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <img src="${p.streetViewBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Street View — Local do estabelecimento</div>
    </div>`:""}
    ${p.mapStaticBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <img src="${p.mapStaticBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Mapa Aéreo — Localização</div>
    </div>`:""}
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

// ─── Checklist de Documentos ─────────────────────────────────────────────────
function secDocumentos(p: PDFReportParams): string {
  const d=p.data;
  type Doc={label:string;categoria:string;recebido:boolean;obrigatorio:boolean;detalhe?:string};
  const docs:Doc[]=[
    {label:"Cartão CNPJ",                categoria:"Cadastral",   obrigatorio:true,  recebido:!!(d.cnpj?.razaoSocial)},
    {label:"QSA / Quadro Societário",    categoria:"Cadastral",   obrigatorio:true,  recebido:!!(d.qsa?.quadroSocietario?.length)},
    {label:"Contrato Social",            categoria:"Cadastral",   obrigatorio:false, recebido:!!(d.contrato?.capitalSocial||d.contrato?.socios?.length)},
    {label:"Faturamento (extrato fiscal)",categoria:"Financeiro", obrigatorio:true,  recebido:!!(d.faturamento?.meses?.length||d.faturamento?.fmm12m)},
    {label:"SCR / Bacen",                categoria:"Crédito",     obrigatorio:true,  recebido:!!(d.scr?.periodoReferencia),detalhe:d.scr?.periodoReferencia?`Ref. ${d.scr.periodoReferencia}`:undefined},
    {label:"SCR Período Anterior",       categoria:"Crédito",     obrigatorio:false, recebido:!!(d.scrAnterior?.periodoReferencia)},
    {label:"SCR dos Sócios",             categoria:"Crédito",     obrigatorio:false, recebido:!!(d.scrSocios?.length),detalhe:d.scrSocios?.length?`${d.scrSocios.length} sócio(s)`:undefined},
    {label:"Protestos",                  categoria:"Crédito",     obrigatorio:true,  recebido:d.protestos?.vigentesQtd!==undefined&&d.protestos?.vigentesQtd!==null},
    {label:"Processos Judiciais",        categoria:"Jurídico",    obrigatorio:true,  recebido:!!(d.processos?.passivosTotal!==undefined)},
    {label:"Grupo Econômico",            categoria:"Cadastral",   obrigatorio:false, recebido:!!(d.grupoEconomico?.empresas?.length)},
    {label:"Bureau Score (Serasa/SPC)",  categoria:"Crédito",     obrigatorio:false, recebido:!!(d.score?.serasa||d.score?.spc||d.score?.quod)},
    {label:"CCF — Cheque Sem Fundo",     categoria:"Crédito",     obrigatorio:false, recebido:d.ccf?.qtdRegistros!==undefined},
    {label:"Curva ABC / Carteira",       categoria:"Operacional", obrigatorio:false, recebido:!!(d.curvaABC?.clientes?.length)},
    {label:"DRE",                        categoria:"Financeiro",  obrigatorio:false, recebido:!!(d.dre?.anos?.length)},
    {label:"Balanço Patrimonial",        categoria:"Financeiro",  obrigatorio:false, recebido:!!(d.balanco?.anos?.length)},
    {label:"IR dos Sócios",              categoria:"Financeiro",  obrigatorio:false, recebido:!!(d.irSocios?.length),detalhe:d.irSocios?.length?`${d.irSocios.length} sócio(s)`:undefined},
    {label:"Relatório de Visita",        categoria:"Operacional", obrigatorio:false, recebido:!!(d.relatorioVisita?.dataVisita)},
  ];
  const recebidos=docs.filter(x=>x.recebido).length;
  const obrigRecebidos=docs.filter(x=>x.obrigatorio&&x.recebido).length;
  const obrigTotal=docs.filter(x=>x.obrigatorio).length;
  const completude=Math.round((recebidos/docs.length)*100);
  const baseOk=obrigRecebidos===obrigTotal;
  const catClr:Record<string,string>={Cadastral:"#1a2744",Financeiro:"#0891b2",Crédito:"#dc2626",Jurídico:"#7c3aed",Operacional:"#16a34a"};
  const cats=Array.from(new Set(docs.map(d=>d.categoria)));
  return `<div class="pb">${secHdr("DC","Documentos Recebidos — Base da Análise")}
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px;page-break-inside:avoid">
    <div style="border:1px solid #e5e7eb;border-top:3px solid ${completude>=80?"#22c55e":completude>=60?"#f59e0b":"#ef4444"};border-radius:8px;padding:14px 16px">
      <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:4px">Completude</div>
      <div style="font-size:28px;font-weight:900;color:${completude>=80?"#16a34a":completude>=60?"#d97706":"#dc2626"}">${completude}%</div>
      <div style="height:6px;background:#f3f4f6;border-radius:3px;margin-top:8px;overflow:hidden"><div style="height:100%;width:${completude}%;background:${completude>=80?"#22c55e":completude>=60?"#f59e0b":"#ef4444"};border-radius:3px"></div></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px">${recebidos} de ${docs.length} documentos</div>
    </div>
    <div style="border:1px solid ${baseOk?"#86efac":"#fca5a5"};border-top:3px solid ${baseOk?"#22c55e":"#ef4444"};border-radius:8px;padding:14px 16px">
      <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:4px">Obrigatórios</div>
      <div style="font-size:28px;font-weight:900;color:${baseOk?"#16a34a":"#dc2626"}">${obrigRecebidos}<span style="font-size:14px;color:#9ca3af"> / ${obrigTotal}</span></div>
      <div style="margin-top:8px"><span class="badge ${baseOk?"ok":"fail"}">${baseOk?"BASE COMPLETA":"BASE INCOMPLETA"}</span></div>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px">
      <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:8px">Por Categoria</div>
      ${cats.map(cat=>{const n=docs.filter(x=>x.categoria===cat&&x.recebido).length,t=docs.filter(x=>x.categoria===cat).length;return`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px"><span style="font-size:9px;color:${catClr[cat]||"#374151"};font-weight:600">${cat}</span><span style="font-size:9px;color:#374151">${n}/${t}</span></div>`;}).join("")}
    </div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid">
    ${docs.map((doc,i)=>`<div style="display:grid;grid-template-columns:24px 1fr 90px 80px 140px;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f3f4f6;background:${!doc.recebido&&doc.obrigatorio?"#fff8f8":i%2===0?"#fff":"#fafafa"}">
      <span style="font-size:14px">${doc.recebido?"✅":"⬜"}</span>
      <div style="font-size:11px;font-weight:${doc.recebido?"600":"400"};color:${doc.recebido?"#111827":"#9ca3af"}">${esc(doc.label)}</div>
      <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${catClr[doc.categoria]||"#1a2744"}15;color:${catClr[doc.categoria]||"#1a2744"};font-size:8px;font-weight:700">${esc(doc.categoria)}</span>
      <span style="font-size:8px;font-weight:700;color:${doc.obrigatorio?"#dc2626":"#9ca3af"}">${doc.obrigatorio?"OBRIGATÓRIO":"OPCIONAL"}</span>
      <span style="font-size:9px;color:${doc.recebido?"#16a34a":"#dc2626"}">${doc.recebido?doc.detalhe?"Recebido — "+doc.detalhe:"Recebido":"Pendente / Não enviado"}</span>
    </div>`).join("")}
  </div>
</div>`;
}

// ─── IR dos Sócios ────────────────────────────────────────────────────────────
function secIrSocios(p: PDFReportParams): string {
  const socios=p.data.irSocios;
  if(!socios||socios.length===0) return "";
  const limite=numVal(p.creditLimit?.limiteAjustado);
  return `<div class="pb">${secHdr("IR","IR dos Sócios — Capacidade Patrimonial")}
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#0369a1;page-break-inside:avoid">
    O patrimônio pessoal dos sócios é o colchão de segurança para recompra em um FIDC. Um sócio com patrimônio líquido superior ao limite solicitado representa menor risco operacional.
  </div>
  ${socios.map(s=>{
    const pl=numVal(s.patrimonioLiquido);
    const rend=numVal(s.rendimentoTotal);
    void numVal(s.totalBensDireitos); // bens — disponível se necessário
    const dividas=numVal(s.dividasOnus);
    const cobPatrim=limite>0&&pl>0?Math.round((pl/limite)*100):0;
    const plClr=cobPatrim>=100?"#16a34a":cobPatrim>=50?"#d97706":"#dc2626";
    return `<div style="border:1px solid ${s.situacaoMalhas||s.debitosEmAberto?"#fca5a5":"#e5e7eb"};border-left:4px solid ${pl>=limite?"#22c55e":pl>=limite*0.5?"#f59e0b":"#ef4444"};border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:14px;page-break-inside:avoid">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:800;color:#111827">${esc(s.nomeSocio)}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">CPF ${fmtCpf(s.cpf)} · IRPF ${esc(s.anoBase)} ${s.tipoDocumento?` · ${esc(s.tipoDocumento)}`:""}${s.dataEntrega?` · Entregue ${esc(s.dataEntrega)}`:""}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${s.situacaoMalhas?`<span class="badge fail">MALHA FISCAL</span>`:""}
          ${s.debitosEmAberto?`<span class="badge fail">DÉBITOS EM ABERTO</span>`:""}
          ${!s.situacaoMalhas&&!s.debitosEmAberto?`<span class="badge ok">SEM PENDÊNCIAS</span>`:""}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">
        ${kpi("Rendimento Total",fmtMoney(s.rendimentoTotal),rend>0?"#111827":"#9ca3af")}
        ${kpi("Patrimônio Líquido",fmtMoney(s.patrimonioLiquido),plClr,limite>0?`${cobPatrim}% do limite FIDC`:undefined)}
        ${kpi("Total Bens e Direitos",fmtMoney(s.totalBensDireitos))}
        ${kpi("Dívidas e Ônus",fmtMoney(s.dividasOnus),dividas>0?"#dc2626":"#111827")}
      </div>
      ${(numVal(s.bensImoveis)>0||numVal(s.bensVeiculos)>0||numVal(s.aplicacoesFinanceiras)>0)?`
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
        ${numVal(s.bensImoveis)>0?kpiSm("Bens Imóveis",fmtMoney(s.bensImoveis)):""}
        ${numVal(s.bensVeiculos)>0?kpiSm("Veículos",fmtMoney(s.bensVeiculos)):""}
        ${numVal(s.aplicacoesFinanceiras)>0?kpiSm("Aplicações Financeiras",fmtMoney(s.aplicacoesFinanceiras)):""}
      </div>`:""}
      ${s.debitosEmAberto&&s.descricaoDebitos?`<div style="background:#fff1f2;border-left:3px solid #ef4444;border-radius:0 4px 4px 0;padding:8px 12px;font-size:10px;color:#991b1b;margin-top:4px">${esc(s.descricaoDebitos)}</div>`:""}
      ${limite>0?`<div style="margin-top:10px;display:flex;align-items:center;gap:10px">
        <div style="font-size:9px;color:#6b7280">Cobertura do limite FIDC (${fmtMoney(String(limite))}):</div>
        <div style="flex:1;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.min(100,cobPatrim)}%;background:${plClr};border-radius:3px"></div></div>
        <div style="font-size:10px;font-weight:700;color:${plClr}">${cobPatrim}%</div>
      </div>`:""}
    </div>`;
  }).join("")}
</div>`;
}

// ─── Balanço Patrimonial ──────────────────────────────────────────────────────
function secBalanco(p: PDFReportParams): string {
  const bal=p.data.balanco;
  if(!bal||!bal.anos?.length) return "";
  const anos=bal.anos.slice(-3);
  const ultimo=anos[anos.length-1];
  const tlClr=bal.tendenciaPatrimonio==="crescimento"?"#16a34a":bal.tendenciaPatrimonio==="queda"?"#dc2626":"#d97706";
  const tlLbl=bal.tendenciaPatrimonio==="crescimento"?"↑ Crescimento":bal.tendenciaPatrimonio==="queda"?"↓ Queda":"→ Estável";
  const liqC=parseFloat(ultimo?.liquidezCorrente||"0");
  const endiv=parseFloat(ultimo?.endividamentoTotal||"0");
  const liqClr=liqC>=2?"#16a34a":liqC>=1?"#d97706":"#dc2626";
  const endivClr=endiv<=40?"#16a34a":endiv<=60?"#d97706":"#dc2626";
  type BRow={label:string;key:keyof typeof anos[0];bold?:boolean;isMoney?:boolean};
  const estrutura:BRow[]=[
    {label:"Ativo Total",key:"ativoTotal",bold:true,isMoney:true},
    {label:"  Ativo Circulante",key:"ativoCirculante",isMoney:true},
    {label:"    Caixa e Equivalentes",key:"caixaEquivalentes",isMoney:true},
    {label:"    Contas a Receber",key:"contasAReceber",isMoney:true},
    {label:"    Estoques",key:"estoques",isMoney:true},
    {label:"  Ativo Não Circulante",key:"ativoNaoCirculante",isMoney:true},
    {label:"    Imobilizado",key:"imobilizado",isMoney:true},
    {label:"Passivo Total",key:"passivoTotal",bold:true,isMoney:true},
    {label:"  Passivo Circulante",key:"passivoCirculante",isMoney:true},
    {label:"    Empréstimos CP",key:"emprestimosCP",isMoney:true},
    {label:"  Passivo Não Circulante",key:"passivoNaoCirculante",isMoney:true},
    {label:"    Empréstimos LP",key:"emprestimosLP",isMoney:true},
    {label:"Patrimônio Líquido",key:"patrimonioLiquido",bold:true,isMoney:true},
  ];
  return `<div class="pb">${secHdr("BP","Balanço Patrimonial")}
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;page-break-inside:avoid">
    ${kpi("Tendência Patrimonial",tlLbl,tlClr)}
    ${kpi("Patrimônio Líquido",fmtMoney(ultimo?.patrimonioLiquido),numVal(ultimo?.patrimonioLiquido)>0?"#111827":"#dc2626")}
    ${kpi("Liquidez Corrente",ultimo?.liquidezCorrente?parseFloat(ultimo.liquidezCorrente).toFixed(2)+"x":"—",liqClr,liqC>=1?"Saudável (>1)":liqC>0?"Atenção (<1)":undefined)}
    ${kpi("Endividamento Total",ultimo?.endividamentoTotal?parseFloat(ultimo.endividamentoTotal).toFixed(1)+"%":"—",endivClr,endiv<=60?"Normal (<60%)":endiv>0?"Elevado (>60%)":undefined)}
  </div>
  ${subTitle("Estrutura Patrimonial")}
  <table style="${TS_AVOID}">
    <thead>${row(["Indicador",...anos.map(a=>`<strong>${esc(a.ano)}</strong>`)],true)}</thead>
    <tbody>${estrutura.map(r=>{
      const vals=anos.map(a=>String(a[r.key]||""));
      if(vals.every(v=>!v||v==="0"||v==="")) return "";
      return row([
        `<span style="${r.bold?"font-weight:700;color:#1a2744":"color:#374151"}">${esc(r.label)}</span>`,
        ...vals.map(v=>v?fmtMoney(v):"—")
      ]);
    }).filter(Boolean).join("")}</tbody>
  </table>
  ${subTitle("Índices Financeiros")}
  <table style="${TS_AVOID}">
    <thead>${row(["Índice",...anos.map(a=>`<strong>${esc(a.ano)}</strong>`),"Referência"],true)}</thead>
    <tbody>
      ${anos.some(a=>a.liquidezCorrente)?row(["Liquidez Corrente",...anos.map(a=>a.liquidezCorrente?`<span style="color:${parseFloat(a.liquidezCorrente||"0")>=1?"#16a34a":"#dc2626"};font-weight:700">${parseFloat(a.liquidezCorrente).toFixed(2)}x</span>`:"—"),"≥ 1,00 (saudável)"]):""}
      ${anos.some(a=>a.liquidezGeral)?row(["Liquidez Geral",...anos.map(a=>a.liquidezGeral?`${parseFloat(a.liquidezGeral).toFixed(2)}x`:"—"),"≥ 1,00"]):""}
      ${anos.some(a=>a.endividamentoTotal)?row(["Endividamento Total",...anos.map(a=>a.endividamentoTotal?`<span style="color:${parseFloat(a.endividamentoTotal||"0")<=60?"#16a34a":"#dc2626"};font-weight:700">${parseFloat(a.endividamentoTotal).toFixed(1)}%</span>`:"—"),"≤ 60%"]):""}
      ${anos.some(a=>a.capitalDeGiroLiquido)?row(["Capital de Giro Líquido",...anos.map(a=>a.capitalDeGiroLiquido?fmtMoney(a.capitalDeGiroLiquido):"—"),"Positivo = saudável"]):""}
    </tbody>
  </table>
  ${bal.observacoes?`${subTitle("Observações")}${paraBox(bal.observacoes)}`:""}
</div>`;
}

// ─── FIDC: Capacidade de Recompra ────────────────────────────────────────────
function secRecompra(p: PDFReportParams): string {
  const cl=p.creditLimit;
  const fmm=numVal(cl?.fmmBase||p.data.faturamento?.fmm12m||p.data.faturamento?.mediaAno);
  const limite=numVal(cl?.limiteAjustado);
  if(!limite||!fmm) return "";
  const v=p.data.relatorioVisita;
  const capSocial=numVal(p.data.qsa?.capitalSocial||p.data.cnpj?.capitalSocialCNPJ);
  const endivBanco=numVal(v?.endividamentoBanco);
  const endivFIDC=numVal(v?.endividamentoFactoring);
  const endivTotal=endivBanco+endivFIDC;

  // Metrics
  const alavLimit=fmm>0?(limite/fmm):0;        // limite ÷ FMM (meses)
  const cobAnual=fmm>0?((fmm*12)/limite)*100:0; // FMM×12/limite (%)
  const cobPatrim=capSocial>0?(capSocial/limite)*100:0;
  const exposTotal=endivTotal+limite;
  const expVsFmm12=fmm>0?(exposTotal/(fmm*12))*100:0;

  const alvClr=alavLimit<=2?"#16a34a":alavLimit<=4?"#d97706":"#dc2626";
  const alvLabel=alavLimit<=2?"SAUDÁVEL":alavLimit<=4?"ATENÇÃO":"ALTO RISCO";
  const cobClr=cobAnual>=100?"#16a34a":cobAnual>=50?"#d97706":"#dc2626";
  const patClr=cobPatrim>=100?"#16a34a":cobPatrim>=50?"#d97706":"#dc2626";

  function meter(pct:number,color:string,max=200):string{
    const w=Math.min(100,Math.round((pct/max)*100));
    return `<div style="height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;margin-top:6px">
      <div style="height:100%;width:${w}%;background:${color};border-radius:4px"></div>
    </div>`;
  }

  return `<div class="pb">${secHdr("RC","Capacidade de Recompra — FIDC")}
  <div style="background:#fff9eb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#92400e">
    <strong>Recompra</strong>: se o sacado não pagar, o cedente é obrigado a recomprar o título. Esta seção avalia se o cedente tem capacidade financeira para honrar essa obrigação.
  </div>

  <!-- Main metrics -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px">
    <div style="border:1px solid #e5e7eb;border-top:3px solid ${alvClr};border-radius:8px;padding:14px 16px;page-break-inside:avoid">
      <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Alavancagem do Limite</div>
      <div style="font-size:26px;font-weight:900;color:${alvClr};line-height:1">${alavLimit.toFixed(1)}<span style="font-size:12px;color:#9ca3af">× FMM</span></div>
      ${meter(alavLimit,alvClr,6)}
      <div style="font-size:9px;margin-top:6px"><span style="display:inline-block;padding:2px 7px;border-radius:99px;background:${alvClr}18;color:${alvClr};font-weight:700;font-size:8px">${alvLabel}</span></div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px">Limite representa ${alavLimit.toFixed(1)} meses de receita</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:3px solid ${cobClr};border-radius:8px;padding:14px 16px;page-break-inside:avoid">
      <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Cobertura Anual</div>
      <div style="font-size:26px;font-weight:900;color:${cobClr};line-height:1">${cobAnual.toFixed(0)}<span style="font-size:12px;color:#9ca3af">%</span></div>
      ${meter(cobAnual,cobClr,200)}
      <div style="font-size:9px;color:#9ca3af;margin-top:10px">FMM × 12 ÷ limite = ${fmtMoney(String(fmm*12))} ÷ ${fmtMoney(String(limite))}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:3px solid ${capSocial>0?patClr:"#9ca3af"};border-radius:8px;padding:14px 16px;page-break-inside:avoid">
      <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Cobertura Patrimonial</div>
      <div style="font-size:26px;font-weight:900;color:${capSocial>0?patClr:"#9ca3af"};line-height:1">${capSocial>0?cobPatrim.toFixed(0)+"<span style='font-size:12px;color:#9ca3af'>%</span>":"—"}</div>
      ${capSocial>0?meter(cobPatrim,patClr,200):""}
      <div style="font-size:9px;color:#9ca3af;margin-top:${capSocial>0?"10":"14"}px">Capital social ÷ limite: ${capSocial>0?fmtMoney(String(capSocial)):"não informado"}</div>
    </div>
  </div>

  <!-- Exposure table -->
  ${subTitle("Composição da Exposição")}
  <table style="${TS_AVOID}">
    <thead>${row(["Componente","Valor","% da Receita Anual"],true)}</thead>
    <tbody>
      ${row(["Limite FIDC solicitado",`<strong>${fmtMoney(String(limite))}</strong>`,`${((limite/(fmm*12))*100).toFixed(1)}%`])}
      ${endivBanco>0?row(["Endividamento Bancário",fmtMoney(String(endivBanco)),`${((endivBanco/(fmm*12))*100).toFixed(1)}%`]):""}
      ${endivFIDC>0?row(["Endividamento Factoring/FIDC",fmtMoney(String(endivFIDC)),`${((endivFIDC/(fmm*12))*100).toFixed(1)}%`]):""}
      ${endivTotal>0?row([`<strong>Exposição Total</strong>`,`<strong style="color:${expVsFmm12>100?"#dc2626":"#111827"}">${fmtMoney(String(exposTotal))}</strong>`,`<strong style="color:${expVsFmm12>100?"#dc2626":"#111827"}">${expVsFmm12.toFixed(1)}%</strong>`]):""}
    </tbody>
  </table>

  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;font-size:11px;color:#0369a1">
    <strong>Interpretação:</strong> alavancagem ≤ 2× é considerada saudável para FIDC. Cobertura anual ≥ 100% significa que a receita de 1 ano cobre o limite. Cobertura patrimonial ≥ 100% significa que o capital social da empresa garante o limite.
  </div>
</div>`;
}

// ─── FIDC: Elegibilidade dos Títulos ─────────────────────────────────────────
function secElegibilidade(p: PDFReportParams): string {
  const v=p.data.relatorioVisita;
  const fv=p.fundValidation;
  const dupPct=parseFloat(v?.vendasDuplicata||"0");
  const chqPct=parseFloat(v?.vendasCheque||"0");
  const outrPct=parseFloat(v?.vendasOutras||"0");
  const hasMix=dupPct>0||chqPct>0||outrPct>0;
  const prazoMedio=parseInt(v?.prazoMedioFaturamento||"0");
  const ticketMedio=numVal(v?.ticketMedio);
  const prazoMax=parseInt(v?.prazoMaximoOp||p.creditLimit?.prazo?.toString()||"0");

  // Eligibility evaluation
  type EligRow={tipo:string;pct:string;status:"ok"|"warn"|"fail"|"info";nota:string};
  const tipos:EligRow[]=[
    {tipo:"Duplicata Mercantil",pct:dupPct>0?dupPct+"% do mix":"—",
     status:dupPct>=50?"ok":dupPct>0?"warn":"info",
     nota:dupPct>=50?"Principal instrumento. Elegível com endosso.":dupPct>0?"Presente mas não predominante.":"Não identificado no mix."},
    {tipo:"Cheque",pct:chqPct>0?chqPct+"% do mix":"—",
     status:chqPct===0?"ok":chqPct<=20?"warn":"fail",
     nota:chqPct===0?"Ausente — sem risco de diluição por cheque.":chqPct<=20?"Baixa concentração. Verificar política do fundo.":"Alta concentração. Risco elevado de diluição e devoluções."},
    {tipo:"Outras Formas",pct:outrPct>0?outrPct+"% do mix":"—",
     status:outrPct===0?"ok":outrPct<=30?"warn":"fail",
     nota:outrPct===0?"Ausente.":outrPct<=30?"Verificar tipos — boleto, PIX, cartão não são cedíveis.":"Alto percentual. Verificar quais são cedíveis ao FIDC."},
  ];

  // Diluição risk
  const dilRisk=chqPct>30?"alto":chqPct>10||outrPct>30?"medio":"baixo";
  const dilClr=dilRisk==="baixo"?"#16a34a":dilRisk==="medio"?"#d97706":"#dc2626";

  // Prazo assessment
  const prazoOk=prazoMax>0&&prazoMedio>0&&prazoMedio<=prazoMax;
  const prazoClr=prazoMedio===0?"#9ca3af":prazoOk?"#16a34a":prazoMedio<=prazoMax*1.2?"#d97706":"#dc2626";

  const sClr:{ok:string;warn:string;fail:string;info:string}={ok:"#16a34a",warn:"#d97706",fail:"#dc2626",info:"#6b7280"};
  const sBg:{ok:string;warn:string;fail:string;info:string}={ok:"#dcfce7",warn:"#fef3c7",fail:"#fee2e2",info:"#f3f4f6"};
  const sIcon:{ok:string;warn:string;fail:string;info:string}={ok:"✓",warn:"!",fail:"✗",info:"—"};

  return `<div class="pb">${secHdr("ET","Elegibilidade dos Títulos — FIDC")}
  ${!hasMix&&!prazoMedio?`<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;font-size:11px;color:#6b7280">Dados do relatório de visita não disponíveis. Preencha o mix de vendas durante a visita para análise completa.</div>`:`
  ${hasMix?`
  ${subTitle("Mix de Instrumentos de Venda")}
  <!-- Visual mix bar -->
  <div style="height:20px;border-radius:6px;overflow:hidden;display:flex;margin-bottom:8px;page-break-inside:avoid">
    ${dupPct>0?`<div style="width:${dupPct}%;background:#22c55e;display:flex;align-items:center;justify-content:center"><span style="font-size:8px;font-weight:700;color:#fff">${dupPct>8?dupPct+"% Dup.":""}</span></div>`:""}
    ${chqPct>0?`<div style="width:${chqPct}%;background:#f59e0b;display:flex;align-items:center;justify-content:center"><span style="font-size:8px;font-weight:700;color:#fff">${chqPct>8?chqPct+"% Cheq.":""}</span></div>`:""}
    ${outrPct>0?`<div style="width:${outrPct}%;background:#94a3b8;display:flex;align-items:center;justify-content:center"><span style="font-size:8px;font-weight:700;color:#fff">${outrPct>8?outrPct+"% Outros":""}</span></div>`:""}
  </div>
  <div style="display:flex;gap:12px;margin-bottom:16px;font-size:9px;color:#6b7280">
    ${dupPct>0?`<span>🟢 Duplicata ${dupPct}%</span>`:""}
    ${chqPct>0?`<span>🟡 Cheque ${chqPct}%</span>`:""}
    ${outrPct>0?`<span>⚪ Outros ${outrPct}%</span>`:""}
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:14px">
    ${tipos.map(t=>`<div style="display:grid;grid-template-columns:160px 80px 1fr 90px;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f3f4f6">
      <div style="font-size:11px;font-weight:600;color:#111827">${esc(t.tipo)}</div>
      <div style="font-size:11px;color:#374151">${t.pct}</div>
      <div style="font-size:10px;color:#6b7280;font-style:italic">${t.nota}</div>
      <div style="text-align:right"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${sBg[t.status]};color:${sClr[t.status]};font-size:12px;font-weight:900">${sIcon[t.status]}</span></div>
    </div>`).join("")}
  </div>`:""}

  ${grid(3,[
    prazoMedio>0?kpi("Prazo Médio de Fat.",`${prazoMedio} dias`,prazoClr,prazoMax>0?`Máx. fundo: ${prazoMax}d`:""):"",
    ticketMedio>0?kpi("Ticket Médio",fmtMoney(String(ticketMedio))):"",
    kpi("Risco de Diluição",dilRisk==="baixo"?"BAIXO":dilRisk==="medio"?"MÉDIO":"ALTO",dilClr),
  ].filter(Boolean))}

  ${fv?.criteria.length?`${subTitle("Critérios de Elegibilidade do Fundo")}
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px">
    ${fv.criteria.slice(0,6).map((cr:FundCriterion)=>{
      const ok=cr.status==="ok",err=cr.status==="error";
      const clr=ok?"#16a34a":err?"#dc2626":"#d97706";
      const bg=ok?"#f0fdf4":err?"#fff1f2":"#fffbeb";
      return `<div style="background:${bg};border:1px solid ${clr}30;border-radius:6px;padding:8px 12px;display:flex;align-items:center;gap:8px;page-break-inside:avoid">
        <span style="font-size:14px;color:${clr};font-weight:900;flex-shrink:0">${ok?"✓":err?"✗":"!"}</span>
        <div><div style="font-size:10px;font-weight:600;color:#111827">${esc(cr.label)}</div><div style="font-size:9px;color:${clr}">${esc(cr.actual||"—")} ${cr.threshold?"(lim: "+cr.threshold+")":""}</div></div>
      </div>`;
    }).join("")}
  </div>`:""}
  `}
</div>`;
}

// ─── FIDC: Análise de Sacados ─────────────────────────────────────────────────
function secSacados(p: PDFReportParams): string {
  const abc=p.data.curvaABC;
  if(!abc||!abc.clientes?.length) return "";
  const clientes=abc.clientes.slice(0,20);
  const total=abc.totalClientesNaBase||abc.totalClientesExtraidos||clientes.length;
  const concTop1=parseFloat(abc.maiorClientePct||"0");
  const concTop3=parseFloat(abc.concentracaoTop3||"0");
  const concTop5=parseFloat(abc.concentracaoTop5||"0");

  // FIDC risk classification
  const fidcRisk=concTop1>=40||concTop3>=70?"CRÍTICO":concTop1>=25||concTop3>=55?"ELEVADO":concTop3>=40?"MODERADO":"DIVERSIFICADO";
  const fidcClr=fidcRisk==="CRÍTICO"?"#dc2626":fidcRisk==="ELEVADO"?"#d97706":fidcRisk==="MODERADO"?"#f59e0b":"#16a34a";
  const fidcBg=fidcRisk==="CRÍTICO"?"#fff1f2":fidcRisk==="ELEVADO"?"#fffbeb":fidcRisk==="MODERADO"?"#fefce8":"#f0fdf4";

  // Limite por sacado
  const limiteSacado=numVal(p.creditLimit?.limiteConcentracao||p.data.relatorioVisita?.limitePorSacado);
  const concMaxPct=p.creditLimit?.concentracaoMaxPct||0;

  return `<div class="pb">${secHdr("SA","Análise de Sacados — Risco de Concentração FIDC")}
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#0369a1;page-break-inside:avoid">
    <strong>Para um FIDC</strong>, o risco de inadimplência recai sobre os <strong>sacados</strong> (quem deve pagar os títulos). Alta concentração em poucos sacados amplifica o impacto de uma inadimplência.
  </div>

  <!-- FIDC Risk badge -->
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding:14px 18px;background:${fidcBg};border:1px solid ${fidcClr}30;border-radius:8px;page-break-inside:avoid">
    <div style="flex:1">
      <div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Perfil de Concentração FIDC</div>
      <div style="font-size:18px;font-weight:900;color:${fidcClr}">${fidcRisk}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Baseado na concentração dos top sacados</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${kpiSm("Top 1 sacado",concTop1.toFixed(1)+"%",concTop1>=40?"#dc2626":concTop1>=25?"#d97706":"#16a34a")}
      ${kpiSm("Top 3 sacados",concTop3.toFixed(1)+"%",concTop3>=70?"#dc2626":concTop3>=55?"#d97706":"#16a34a")}
      ${kpiSm("Top 5 sacados",concTop5.toFixed(1)+"%",concTop5>=80?"#dc2626":concTop5>=65?"#d97706":"#16a34a")}
    </div>
  </div>

  ${grid(4,[
    kpi("Total de Sacados",String(total)),
    kpi("Sacados Classe A",String(abc.totalClientesClasseA||"—")),
    limiteSacado>0?kpi("Limite por Sacado",fmtMoney(String(limiteSacado))):"",
    concMaxPct>0?kpi("Concentração Máx.",concMaxPct+"%"):"",
  ].filter(Boolean))}

  ${subTitle("Top Sacados — Risco de Concentração")}
  <table style="${TS_AVOID}">
    <thead>${row(["#","Sacado","Valor Faturado","% Receita","% Acum.","Cl.","Risco FIDC"],true)}</thead>
    <tbody>${clientes.map(c=>{
      const pct=parseFloat(c.percentualReceita||"0");
      const fidcR=pct>=40?"CRÍTICO":pct>=25?"ELEVADO":pct>=15?"MODERADO":"BAIXO";
      const fr=fidcR==="CRÍTICO"?"#dc2626":fidcR==="ELEVADO"?"#d97706":fidcR==="MODERADO"?"#f59e0b":"#16a34a";
      const classCor:Record<string,string>={A:"#16a34a",B:"#d97706",C:"#6b7280"};
      return row([
        String(c.posicao||""),
        `<strong>${esc(c.nome)}</strong>`,
        fmtMoney(c.valorFaturado),
        `<span style="font-weight:700;color:${pct>=25?"#dc2626":pct>=15?"#d97706":"#374151"}">${fmt(c.percentualReceita)}</span>`,
        fmt(c.percentualAcumulado),
        `<span style="font-size:9px;font-weight:700;color:${classCor[c.classe]||"#6b7280"}">${esc(c.classe)}</span>`,
        `<span style="display:inline-block;padding:2px 7px;border-radius:99px;background:${fr}15;color:${fr};font-size:8px;font-weight:800">${fidcR}</span>`,
      ]);
    }).join("")}</tbody>
  </table>
</div>`;
}

// ─── FIDC: Covenants e Condições ─────────────────────────────────────────────
function secCovenants(p: PDFReportParams): string {
  const cl=p.creditLimit;
  const fv=p.fundValidation;
  const v=p.data.relatorioVisita;
  if(!cl&&!fv&&!v) return "";
  const dataRev=cl?.dataRevisao?new Date(cl.dataRevisao).toLocaleDateString("pt-BR"):"—";

  type CV={categoria:string;condicao:string;parametro:string;status:"ok"|"warn"|"fail"|"info"};
  const covenants:CV[]=[];

  // From creditLimit
  if(cl){
    covenants.push({categoria:"Limite",condicao:"Limite Total Aprovado",parametro:fmtMoney(cl.limiteAjustado),status:"ok"});
    if(cl.concentracaoMaxPct) covenants.push({categoria:"Concentração",condicao:"Máximo por Sacado",parametro:`${cl.concentracaoMaxPct}% / ${fmtMoney(cl.limiteConcentracao)}`,status:"info"});
    if(cl.prazo) covenants.push({categoria:"Prazo",condicao:"Prazo Máximo de Operação",parametro:`${cl.prazo} dias`,status:"info"});
    covenants.push({categoria:"Revisão",condicao:"Próxima Revisão do Cedente",parametro:`${cl.revisaoDias} dias (${dataRev})`,status:"info"});
  }
  // From visit
  if(v?.prazoRecompraCedente) covenants.push({categoria:"Recompra",condicao:"Prazo de Recompra pelo Cedente",parametro:`${v.prazoRecompraCedente} dias`,status:"info"});
  if(v?.prazoEnvioCartorio) covenants.push({categoria:"Cartório",condicao:"Prazo para Envio ao Cartório",parametro:`${v.prazoEnvioCartorio} dias`,status:"info"});
  if(v?.cobrancaTAC) covenants.push({categoria:"TAC",condicao:"Cobrança de TAC",parametro:esc(v.cobrancaTAC),status:"info"});
  if(v?.modalidade) covenants.push({categoria:"Modalidade",condicao:"Modalidade Operacional",parametro:v.modalidade.charAt(0).toUpperCase()+v.modalidade.slice(1),status:"info"});

  // Monitoring triggers (from current state vs. fund limits)
  const protests=p.protestosVigentes;
  const vencPct=numVal(p.data.scr?.vencidos)>0&&numVal(p.data.scr?.totalDividasAtivas)>0
    ?Math.round((numVal(p.data.scr.vencidos)/numVal(p.data.scr.totalDividasAtivas))*100):0;

  const catClr:Record<string,string>={Limite:"#1a2744",Concentração:"#7c3aed",Prazo:"#0369a1",Revisão:"#6b7280",Recompra:"#d97706",Cartório:"#6b7280",TAC:"#6b7280",Modalidade:"#0891b2"};
  const stClr:{ok:string;warn:string;fail:string;info:string}={ok:"#16a34a",warn:"#d97706",fail:"#dc2626",info:"#374151"};
  const stBg:{ok:string;warn:string;fail:string;info:string}={ok:"#f0fdf4",warn:"#fffbeb",fail:"#fff1f2",info:"#f8fafc"};

  return `<div class="pb">${secHdr("CV","Covenants e Condições Operacionais")}
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;page-break-inside:avoid">
    <div style="background:#f1f5f9;padding:8px 14px;display:grid;grid-template-columns:90px 1fr 1fr 70px;font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;gap:8px">
      <span>Categoria</span><span>Condição</span><span>Parâmetro</span><span style="text-align:right">Status</span>
    </div>
    ${covenants.map((cv,i)=>`<div style="display:grid;grid-template-columns:90px 1fr 1fr 70px;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #f3f4f6;background:${i%2===0?"#fff":"#fafafa"}">
      <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${catClr[cv.categoria]||"#1a2744"}15;color:${catClr[cv.categoria]||"#1a2744"};font-size:8px;font-weight:700;text-align:center">${esc(cv.categoria)}</span>
      <div style="font-size:11px;font-weight:600;color:#111827">${esc(cv.condicao)}</div>
      <div style="font-size:11px;color:#374151">${cv.parametro}</div>
      <div style="text-align:right"><span style="display:inline-block;padding:2px 8px;border-radius:99px;background:${stBg[cv.status]};color:${stClr[cv.status]};font-size:8px;font-weight:700">${cv.status==="ok"?"ATENDIDO":cv.status==="warn"?"ATENÇÃO":cv.status==="fail"?"VIOLADO":"—"}</span></div>
    </div>`).join("")}
  </div>

  ${subTitle("Gatilhos de Monitoramento")}
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px">
    <div style="border:1px solid ${protests===0?"#86efac":"#fca5a5"};border-radius:8px;padding:12px 14px;background:${protests===0?"#f0fdf4":"#fff1f2"};page-break-inside:avoid">
      <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Protestos Vigentes</div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:18px;font-weight:900;color:${protests===0?"#16a34a":"#dc2626"}">${protests}</span>
        <span class="badge ${protests===0?"ok":"fail"}">${protests===0?"NORMAL":"GATILHO ATIVO"}</span>
      </div>
    </div>
    <div style="border:1px solid ${vencPct===0?"#86efac":vencPct<=10?"#fde68a":"#fca5a5"};border-radius:8px;padding:12px 14px;background:${vencPct===0?"#f0fdf4":vencPct<=10?"#fffbeb":"#fff1f2"};page-break-inside:avoid">
      <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">SCR Vencidos / Carteira</div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:18px;font-weight:900;color:${vencPct===0?"#16a34a":vencPct<=10?"#d97706":"#dc2626"}">${vencPct}%</span>
        <span class="badge ${vencPct===0?"ok":vencPct<=10?"warn":"fail"}">${vencPct===0?"NORMAL":vencPct<=10?"ATENÇÃO":"GATILHO ATIVO"}</span>
      </div>
    </div>
  </div>

  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;font-size:10px;color:#6b7280;line-height:1.7">
    <strong style="color:#1a2744">Monitoramento Contínuo:</strong> O cedente deve ser monitorado mensalmente quanto a protestos, SCR, processos e faturamento. Gatilhos de bloqueio automático devem ser configurados no sistema do FIDC.
  </div>
</div>`;
}

// ─── Risk Heatmap ─────────────────────────────────────────────────────────────
function secHeatmap(p: PDFReportParams): string {
  const {data,finalRating,vencidosSCR,prejuizosVal,protestosVigentes,fundValidation}=p;
  const fmm=numVal(data.faturamento?.fmm12m||data.faturamento?.mediaAno);
  type Row={label:string;score:number;detail:string;status:"ok"|"warn"|"fail"};
  const rows:Row[]=[
    {label:"CNPJ / Cadastral",
     score:(data.cnpj?.situacaoCadastral||"").toUpperCase().includes("ATIVA")?90:20,
     detail:`${esc(data.cnpj?.situacaoCadastral||"—")} · ${esc(p.companyAge||"—")}`,
     status:(data.cnpj?.situacaoCadastral||"").toUpperCase().includes("ATIVA")?"ok":"fail"},
    {label:"Faturamento",
     score:data.faturamento?.faturamentoZerado?10:data.faturamento?.dadosAtualizados?85:60,
     detail:fmm>0?`FMM ${fmtMoney(String(fmm))}`:data.faturamento?.faturamentoZerado?"Zerado":"—",
     status:data.faturamento?.faturamentoZerado?"fail":data.faturamento?.dadosAtualizados?"ok":"warn"},
    {label:"SCR / Bacen",
     score:vencidosSCR===0&&prejuizosVal===0?85:vencidosSCR>0&&prejuizosVal>0?10:35,
     detail:vencidosSCR===0&&prejuizosVal===0?"Sem vencidos":`Vencidos ${fmtMoney(data.scr?.vencidos)}`,
     status:vencidosSCR===0&&prejuizosVal===0?"ok":vencidosSCR>0&&prejuizosVal>0?"fail":"warn"},
    {label:"Protestos",
     score:protestosVigentes===0?100:protestosVigentes<=2?50:15,
     detail:protestosVigentes===0?"Nenhum vigente":`${protestosVigentes} vigente(s) · ${fmtMoney(data.protestos?.vigentesValor)}`,
     status:protestosVigentes===0?"ok":protestosVigentes<=2?"warn":"fail"},
    {label:"Processos",
     score:data.processos?.temRJ?5:parseInt(data.processos?.passivosTotal||"0")<=5?90:parseInt(data.processos?.passivosTotal||"0")<=15?65:35,
     detail:data.processos?.temRJ?"RJ/Falência identificado":`${fmt(data.processos?.passivosTotal)} processos passivos`,
     status:data.processos?.temRJ?"fail":parseInt(data.processos?.passivosTotal||"0")<=15?"ok":"warn"},
    ...(p.data.scrSocios?.length?[{
      label:"SCR dos Sócios",
      score:p.data.scrSocios.every(s=>numVal(s.periodoAtual.vencidos)===0)?90:40,
      detail:p.data.scrSocios.every(s=>numVal(s.periodoAtual.vencidos)===0)?`${p.data.scrSocios.length} sócio(s) sem vencidos`:"Vencidos identificados",
      status:(p.data.scrSocios.every(s=>numVal(s.periodoAtual.vencidos)===0)?"ok":"fail") as "ok"|"fail",
    }]:[]),
    ...(fundValidation?.criteria.length?[{
      label:"Parâmetros do Fundo",
      score:fundValidation.failCount===0?Math.round((fundValidation.passCount/fundValidation.criteria.length)*100):Math.round((fundValidation.passCount/fundValidation.criteria.length)*70),
      detail:`${fundValidation.passCount}/${fundValidation.criteria.length} critérios aprovados`,
      status:(fundValidation.failCount===0&&!fundValidation.hasEliminatoria?"ok":fundValidation.failCount>0?"fail":"warn") as "ok"|"warn"|"fail",
    }]:[]),
  ];
  const clr={ok:"#22c55e",warn:"#f59e0b",fail:"#ef4444"};
  const bg={ok:"#f0fdf4",warn:"#fffbeb",fail:"#fff1f2"};
  const lbl={ok:"OK",warn:"ATENÇÃO",fail:"RISCO"};
  const rc=finalRating>=7?"#22c55e":finalRating>=4?"#f59e0b":"#ef4444";
  return `<div style="margin-bottom:24px;page-break-inside:avoid">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
    <div style="flex:1"><div style="font-size:11px;font-weight:800;color:#1a2744;text-transform:uppercase;letter-spacing:.05em">Mapa de Risco</div><div style="font-size:9px;color:#9ca3af;margin-top:1px">Visão consolidada dos indicadores de risco</div></div>
    <div style="text-align:right"><div style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase">Rating Geral</div><div style="font-size:22px;font-weight:900;color:${rc}">${finalRating}<span style="font-size:11px;color:#9ca3af"> /10</span></div></div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    ${rows.map((r,i)=>`<div style="display:grid;grid-template-columns:140px 1fr 80px;align-items:center;gap:12px;padding:9px 14px;background:${i%2===0?"#fff":"#fafafa"};border-bottom:1px solid #f3f4f6">
      <div style="font-size:10px;font-weight:700;color:#374151">${r.label}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${r.score}%;background:${clr[r.status]};border-radius:4px"></div>
        </div>
        <div style="font-size:10px;color:#6b7280;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${r.detail}</div>
      </div>
      <div style="text-align:right"><span style="display:inline-block;padding:2px 8px;border-radius:99px;background:${bg[r.status]};color:${clr[r.status]};font-size:8px;font-weight:800;letter-spacing:.04em">${lbl[r.status]}</span></div>
    </div>`).join("")}
  </div>
</div>`;
}

// ─── Bureau Score ─────────────────────────────────────────────────────────────
function secBureau(p: PDFReportParams): string {
  const score=p.data.score;
  if(!score||(!score.serasa&&!score.spc&&!score.quod)) return "";
  function scoreBar(s:number,max=1000):string{
    const pct=Math.round((s/max)*100);
    const clr=pct>=70?"#22c55e":pct>=50?"#f59e0b":"#ef4444";
    return `<div style="height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;margin:6px 0 2px">
      <div style="height:100%;width:${pct}%;background:${clr};border-radius:4px"></div>
    </div><div style="display:flex;justify-content:space-between;font-size:8px;color:#9ca3af"><span>0</span><span>${max}</span></div>`;
  }
  const bureaus=[];
  if(score.serasa){const s=score.serasa;const clr=s.score>=700?"#16a34a":s.score>=500?"#d97706":"#dc2626";
    bureaus.push(`<div style="border:1px solid ${s.inadimplente?"#fca5a5":"#e5e7eb"};border-top:3px solid ${clr};border-radius:8px;padding:14px 16px;page-break-inside:avoid">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div><div style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Serasa</div>
        ${s.faixa?`<div style="font-size:9px;color:${clr};font-weight:700;margin-top:2px">${esc(s.faixa)}</div>`:""}
        </div>
        ${s.inadimplente?`<span class="badge fail">INADIMPLENTE</span>`:`<span class="badge ok">ADIMPLENTE</span>`}
      </div>
      <div style="font-size:30px;font-weight:900;color:${clr};line-height:1">${s.score}</div>
      ${scoreBar(s.score)}
      ${s.consultadoEm?`<div style="font-size:8px;color:#9ca3af;margin-top:4px">Consultado em ${esc(s.consultadoEm)}</div>`:""}
    </div>`);}
  if(score.spc){const s=score.spc;const clr=s.score>=700?"#16a34a":s.score>=500?"#d97706":"#dc2626";
    bureaus.push(`<div style="border:1px solid ${s.inadimplente?"#fca5a5":"#e5e7eb"};border-top:3px solid ${clr};border-radius:8px;padding:14px 16px;page-break-inside:avoid">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div><div style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">SPC</div>
        ${s.pendencias>0?`<div style="font-size:9px;color:#dc2626;font-weight:700;margin-top:2px">${s.pendencias} pendência(s)</div>`:`<div style="font-size:9px;color:#16a34a;margin-top:2px">Sem pendências</div>`}
        </div>
        ${s.inadimplente?`<span class="badge fail">INADIMPLENTE</span>`:`<span class="badge ok">ADIMPLENTE</span>`}
      </div>
      <div style="font-size:30px;font-weight:900;color:${clr};line-height:1">${s.score}</div>
      ${scoreBar(s.score)}
      ${s.consultadoEm?`<div style="font-size:8px;color:#9ca3af;margin-top:4px">Consultado em ${esc(s.consultadoEm)}</div>`:""}
    </div>`);}
  if(score.quod){const s=score.quod;const clr=s.score>=700?"#16a34a":s.score>=500?"#d97706":"#dc2626";
    bureaus.push(`<div style="border:1px solid #e5e7eb;border-top:3px solid ${clr};border-radius:8px;padding:14px 16px;page-break-inside:avoid">
      <div style="margin-bottom:8px"><div style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Quod</div>
      ${s.faixa?`<div style="font-size:9px;color:${clr};font-weight:700;margin-top:2px">${esc(s.faixa)}</div>`:""}
      </div>
      <div style="font-size:30px;font-weight:900;color:${clr};line-height:1">${s.score}</div>
      ${scoreBar(s.score)}
      ${s.consultadoEm?`<div style="font-size:8px;color:#9ca3af;margin-top:4px">Consultado em ${esc(s.consultadoEm)}</div>`:""}
    </div>`);}
  const cols=bureaus.length;
  return `<div class="pb">${secHdr("BS","Bureau Score — Birôs de Crédito")}
  <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:14px;margin-bottom:14px">${bureaus.join("")}</div>
</div>`;
}

// ─── CCF ──────────────────────────────────────────────────────────────────────
function secCcf(p: PDFReportParams): string {
  const ccf=p.data.ccf;
  if(!ccf||ccf.qtdRegistros===0) return "";
  const tend=ccf.tendenciaLabel;
  return `<div class="pb">${secHdr("CF","CCF — Cheque Sem Fundo")}
  ${ccf.qtdRegistros>0?alertBox(`${ccf.qtdRegistros} registro(s) de cheque sem fundo identificado(s)`,"ALTA"):""}
  ${grid(3,[
    kpi("Total Registros",String(ccf.qtdRegistros),"#dc2626"),
    kpi("Bancos Afetados",String((ccf.bancos||[]).length)),
    tend?kpi("Tendência",tend==="crescimento"?"↑ Aumentando":tend==="queda"?"↓ Diminuindo":"→ Estável",tend==="crescimento"?"#dc2626":tend==="queda"?"#16a34a":"#d97706"):"",
  ])}
  ${(ccf.bancos||[]).length>0?`${subTitle("Detalhes por Banco")}
  <table style="${TS_AVOID}">
    <thead>${row(["Banco","Quantidade","Último Ocorrência","Motivo"],true)}</thead>
    <tbody>${ccf.bancos.map(b=>row([esc(b.banco),`<strong style="color:#dc2626">${b.quantidade}</strong>`,fmt(b.dataUltimo),fmt(b.motivo)])).join("")}</tbody>
  </table>`:""}
</div>`;
}

// ─── Curva ABC ────────────────────────────────────────────────────────────────
function secCurvaAbc(p: PDFReportParams): string {
  const abc=p.data.curvaABC;
  if(!abc||!abc.clientes?.length) return "";
  const clientes=abc.clientes.slice(0,15);
  const classCor:Record<string,string>={A:"#16a34a",B:"#d97706",C:"#6b7280"};
  return `<div class="pb">${secHdr("CA","Curva ABC — Concentração de Clientes")}
  ${abc.alertaConcentracao?alertBox(`Alta concentração de receita: maior cliente representa ${esc(abc.maiorClientePct)} do faturamento`,"MODERADA"):""}
  ${grid(4,[
    kpi("Total Clientes",String(abc.totalClientesNaBase||abc.totalClientesExtraidos||clientes.length)),
    kpi("Concentração Top 3",fmt(abc.concentracaoTop3),parseFloat(abc.concentracaoTop3||"0")>60?"#dc2626":parseFloat(abc.concentracaoTop3||"0")>40?"#d97706":"#16a34a"),
    kpi("Concentração Top 5",fmt(abc.concentracaoTop5),parseFloat(abc.concentracaoTop5||"0")>70?"#dc2626":parseFloat(abc.concentracaoTop5||"0")>50?"#d97706":"#16a34a"),
    kpi("Maior Cliente",fmt(abc.maiorClientePct),parseFloat(abc.maiorClientePct||"0")>30?"#dc2626":"#111827",esc(abc.maiorCliente||"")),
  ])}
  ${abc.periodoReferencia?`<div style="font-size:9px;color:#6b7280;margin-bottom:12px">Período de referência: <strong>${esc(abc.periodoReferencia)}</strong>${abc.receitaTotalBase?` · Receita total: <strong>${fmtMoney(abc.receitaTotalBase)}</strong>`:""}</div>`:""}
  ${subTitle("Principais Clientes")}
  <table style="${TS_AVOID}">
    <thead>${row(["#","Cliente","CNPJ/CPF","Valor","% Receita","% Acum.","Classe"],true)}</thead>
    <tbody>${clientes.map(c=>row([
      String(c.posicao||""),
      `<strong>${esc(c.nome)}</strong>`,
      fmtCnpj(c.cnpjCpf),
      fmtMoney(c.valorFaturado),
      fmt(c.percentualReceita),
      fmt(c.percentualAcumulado),
      `<span class="badge" style="background:${classCor[c.classe]||"#6b7280"}20;color:${classCor[c.classe]||"#6b7280"};border:1px solid ${classCor[c.classe]||"#6b7280"}40">${esc(c.classe)}</span>`,
    ])).join("")}</tbody>
  </table>
</div>`;
}

// ─── DRE ─────────────────────────────────────────────────────────────────────
function secDre(p: PDFReportParams): string {
  const dre=p.data.dre;
  if(!dre||!dre.anos?.length) return "";
  const anos=dre.anos.slice(-3); // last 3 years
  const tlClr=dre.tendenciaLucro==="crescimento"?"#16a34a":dre.tendenciaLucro==="queda"?"#dc2626":"#d97706";
  const tlLbl=dre.tendenciaLucro==="crescimento"?"↑ Crescimento":dre.tendenciaLucro==="queda"?"↓ Queda":"→ Estável";
  const metricas:[string,keyof typeof anos[0]][]=[
    ["Receita Bruta","receitaBruta"],
    ["Receita Líquida","receitaLiquida"],
    ["Lucro Bruto","lucroBruto"],
    ["Margem Bruta","margemBruta"],
    ["EBITDA","ebitda"],
    ["Margem EBITDA","margemEbitda"],
    ["Lucro Líquido","lucroLiquido"],
    ["Margem Líquida","margemLiquida"],
  ];
  const isMargin=(k:string)=>k.toLowerCase().includes("margem");
  return `<div class="pb">${secHdr("DR","DRE — Demonstração de Resultado")}
  ${grid(3,[
    kpi("Tendência de Lucro",tlLbl,tlClr),
    dre.crescimentoReceita?kpi("Crescimento Receita",fmt(dre.crescimentoReceita),parseFloat(dre.crescimentoReceita||"0")>=0?"#16a34a":"#dc2626"):"",
    dre.periodoMaisRecente?kpi("Período Mais Recente",fmt(dre.periodoMaisRecente)):"",
  ].filter(Boolean))}
  <table style="${TS_AVOID}">
    <thead>${row(["Indicador",...anos.map(a=>`<strong>${esc(a.ano)}</strong>`)],true)}</thead>
    <tbody>${metricas.map(([label,key])=>{
      const vals=anos.map(a=>String(a[key]||""));
      if(vals.every(v=>!v||v==="0"||v==="")) return "";
      return row([label,...vals.map(v=>v?isMargin(key)?esc(v):fmtMoney(v):"—")]);
    }).filter(Boolean).join("")}</tbody>
  </table>
  ${dre.observacoes?`${subTitle("Observações")}${paraBox(dre.observacoes)}`:""}
</div>`;
}

// ─── Grupo Econômico ──────────────────────────────────────────────────────────
function secGrupoEconomico(p: PDFReportParams): string {
  const ge=p.data.grupoEconomico;
  if(!ge||!ge.empresas?.length) return "";
  const totalSCR=ge.empresas.reduce((s,e)=>s+numVal(e.scrTotal),0);
  const comProblemas=ge.empresas.filter(e=>numVal(e.protestos)>0||numVal(e.processos)>10||numVal(e.scrTotal)>500000);
  return `<div class="pb">${secHdr("GE","Grupo Econômico")}
  ${ge.alertaParentesco?alertBox(`Possível parentesco entre sócios detectado: ${(ge.parentescosDetectados||[]).map(x=>`${esc(x.socio1)} e ${esc(x.socio2)} (sobrenome "${esc(x.sobrenomeComum)}")`).join("; ")}`,"MODERADA"):""}
  ${comProblemas.length>0?alertBox(`${comProblemas.length} empresa(s) do grupo com indicadores de risco elevado`,"ALTA"):""}
  ${grid(3,[
    kpi("Empresas Vinculadas",String(ge.empresas.length)),
    kpi("SCR Consolidado Grupo",fmtMoney(String(totalSCR)),totalSCR>1000000?"#dc2626":"#111827"),
    kpi("Com Problemas",String(comProblemas.length),comProblemas.length>0?"#dc2626":"#111827"),
  ])}
  <table style="${TS_AVOID}">
    <thead>${row(["Empresa","CNPJ","Relação / Sócio","SCR Total","Protestos","Processos","Situação"],true)}</thead>
    <tbody>${ge.empresas.map(e=>{
      const risco=numVal(e.scrTotal)>500000||numVal(e.protestos)>0||numVal(e.processos)>15;
      return row([
        `<strong style="${risco?"color:#dc2626":""}">${esc(e.razaoSocial)}</strong>`,
        fmtCnpj(e.cnpj),
        e.socioOrigem?`${esc(e.relacao)} · <span style="font-size:10px;color:#6b7280">${esc(e.socioOrigem)}</span>`:esc(e.relacao),
        `<span style="${numVal(e.scrTotal)>500000?"color:#dc2626;font-weight:700":""}">${fmtMoney(e.scrTotal)}</span>`,
        `<span style="${numVal(e.protestos)>0?"color:#dc2626;font-weight:700":""}">${fmt(e.protestos)}</span>`,
        `<span style="${numVal(e.processos)>15?"color:#dc2626;font-weight:700":""}">${fmt(e.processos)}</span>`,
        e.situacao?`<span class="badge ${(e.situacao||"").toUpperCase().includes("ATIVA")?"ok":"fail"}">${esc(e.situacao)}</span>`:"—",
      ]);
    }).join("")}</tbody>
  </table>
</div>`;
}

// ─── Decisão Final ────────────────────────────────────────────────────────────
function secDecisaoFinal(p: PDFReportParams): string {
  const {finalRating,decision,creditLimit,alerts,alertsHigh}=p;
  const rc=finalRating>=7?"#22c55e":finalRating>=4?"#f59e0b":"#ef4444";
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const map:Record<string,{bg:string;border:string;color:string;label:string}> = {
    APROVADO:              {bg:"rgba(34,197,94,.12)",border:"rgba(34,197,94,.4)",color:"#22c55e",label:"APROVADO"},
    APROVACAO_CONDICIONAL: {bg:"rgba(245,158,11,.12)",border:"rgba(245,158,11,.4)",color:"#f59e0b",label:"CONDICIONAL"},
    PENDENTE:              {bg:"rgba(245,158,11,.12)",border:"rgba(245,158,11,.4)",color:"#f59e0b",label:"PENDENTE"},
    REPROVADO:             {bg:"rgba(239,68,68,.12)",border:"rgba(239,68,68,.4)",color:"#ef4444",label:"REPROVADO"},
  };
  const d=map[decision]??{bg:"rgba(255,255,255,.1)",border:"rgba(255,255,255,.3)",color:"#fff",label:esc(decision)};
  const highRisks=alertsHigh.slice(0,4);
  const modRisks=alerts.filter(a=>a.severity!=="ALTA").slice(0,3);
  return `<div class="pb" style="min-height:240mm;background:#0f1e3c;display:flex;flex-direction:column;border-radius:0">
  <div style="padding:36px 40px 0;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Capital Finanças · Análise de Crédito</div>
      <div style="font-size:22px;font-weight:900;color:#fff">Parecer Final</div>
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,.35)">${hoje}</div>
  </div>
  <div style="margin:20px 40px;height:1px;background:rgba(255,255,255,.08)"></div>

  <!-- Company + decision -->
  <div style="padding:0 40px;flex:1">
    <div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:4px">${esc(p.data.cnpj?.razaoSocial||"—")}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.3);margin-bottom:24px">CNPJ ${fmtCnpj(p.data.cnpj?.cnpj)} · ${esc(p.companyAge||"—")}</div>

    <!-- Decision block -->
    <div style="display:inline-block;padding:18px 32px;border-radius:12px;background:${d.bg};border:2px solid ${d.border};margin-bottom:28px">
      <div style="font-size:9px;color:${d.color};text-transform:uppercase;letter-spacing:.1em;opacity:.7;margin-bottom:6px">Decisão de Crédito</div>
      <div style="font-size:36px;font-weight:900;color:${d.color};letter-spacing:.06em">${d.label}</div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="font-size:11px;color:rgba(255,255,255,.5)">Rating: <span style="font-weight:900;color:${rc};font-size:15px">${finalRating}/10</span></div>
        ${creditLimit?.limiteAjustado?`<div style="font-size:11px;color:rgba(255,255,255,.5)">Limite: <span style="font-weight:900;color:#22c55e;font-size:15px">${fmtMoney(creditLimit.limiteAjustado)}</span></div>`:""}
        ${creditLimit?.prazo?`<div style="font-size:11px;color:rgba(255,255,255,.5)">Prazo: <span style="font-weight:700;color:#fff">${creditLimit.prazo} dias</span></div>`:""}
      </div>
    </div>

    <!-- Risk factors -->
    ${highRisks.length>0||modRisks.length>0?`<div style="margin-bottom:24px">
      <div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Fatores de Risco Identificados</div>
      ${highRisks.map(a=>`<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px">
        <span style="font-size:11px;color:#ef4444;flex-shrink:0">●</span>
        <span style="font-size:11px;color:rgba(255,255,255,.7)">${esc(a.message)}</span>
      </div>`).join("")}
      ${modRisks.map(a=>`<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px">
        <span style="font-size:11px;color:#f59e0b;flex-shrink:0">●</span>
        <span style="font-size:11px;color:rgba(255,255,255,.5)">${esc(a.message)}</span>
      </div>`).join("")}
    </div>`:""}
  </div>

  <!-- Signature block -->
  <div style="margin:0 40px;padding:20px 0;border-top:1px solid rgba(255,255,255,.08)">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">
      <div>
        <div style="height:1px;background:rgba(255,255,255,.2);margin-bottom:6px"></div>
        <div style="font-size:9px;color:rgba(255,255,255,.35)">Analista Responsável · Assinatura</div>
      </div>
      <div>
        <div style="height:1px;background:rgba(255,255,255,.2);margin-bottom:6px"></div>
        <div style="font-size:9px;color:rgba(255,255,255,.35)">Data da Análise · ${hoje}</div>
      </div>
    </div>
  </div>
  <div style="padding:12px 40px;background:rgba(0,0,0,.3);display:flex;justify-content:space-between">
    <span style="font-size:9px;color:rgba(255,255,255,.25)">Capital Finanças · Documento confidencial</span>
    <span style="font-size:9px;color:rgba(255,255,255,.2)">capital-financas.vercel.app</span>
  </div>
</div>`;
}

// ─── Histórico de Operações ───────────────────────────────────────────────────
function secHistoricoOperacoes(p: PDFReportParams): string {
  const ops: Operacao[] = p.histOperacoes || [];
  if (!ops.length) return "";

  const statusClr: Record<string,string> = {
    ativa:        "#16a34a",
    liquidada:    "#0891b2",
    inadimplente: "#dc2626",
    prorrogada:   "#d97706",
  };
  const statusBg: Record<string,string> = {
    ativa:        "#f0fdf4",
    liquidada:    "#ecfeff",
    inadimplente: "#fee2e2",
    prorrogada:   "#fef3c7",
  };
  const statusLabel: Record<string,string> = {
    ativa:        "Ativa",
    liquidada:    "Liquidada",
    inadimplente: "Inadimplente",
    prorrogada:   "Prorrogada",
  };

  const total = ops.reduce((s, o) => s + o.valor, 0);
  const inadimplentes = ops.filter(o => o.status === "inadimplente");
  const volumeInad = inadimplentes.reduce((s, o) => s + o.valor, 0);
  const taxaMedia = ops.filter(o => o.taxa_mensal).reduce((s, o, _, arr) =>
    s + (o.taxa_mensal || 0) / arr.length, 0);
  const taxaMediaStr = taxaMedia > 0 ? `${taxaMedia.toFixed(2)}% a.m.` : "—";
  const inadPct = total > 0 ? ((volumeInad / total) * 100).toFixed(1) : "0.0";

  const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const fmtR = (v: number) => "R$\u00a0" + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return `<div class="pb">${secHdr("HO","Histórico de Operações com o Fundo")}
  ${grid(4,[
    kpi("Total de Operações", String(ops.length)),
    kpi("Volume Total", fmtR(total)),
    kpi("Taxa Média", taxaMediaStr),
    kpi("Inadimplência", `${inadPct}%`, parseFloat(inadPct) > 5 ? "#dc2626" : "#111827"),
  ])}
  <table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px">
    <thead>
      <tr style="background:#1a2744">
        ${["Data","Nº Op.","Modalidade","Valor","Taxa a.m.","Prazo","Vencimento","Sacado","Status"].map(h =>
          `<th style="padding:7px 8px;text-align:left;font-size:9px;font-weight:700;color:#fff;letter-spacing:.04em;white-space:nowrap">${h}</th>`
        ).join("")}
      </tr>
    </thead>
    <tbody>
      ${ops.map((o, i) => `
      <tr style="background:${i%2===0?"#fff":"#f9fafb"};border-bottom:1px solid #f3f4f6">
        <td style="padding:7px 8px;white-space:nowrap">${fmtDate(o.data_operacao)}</td>
        <td style="padding:7px 8px;color:#6b7280">${esc(o.numero_operacao) || "—"}</td>
        <td style="padding:7px 8px;font-weight:600;color:#1a2744">${esc(o.modalidade)}</td>
        <td style="padding:7px 8px;font-weight:700;font-variant-numeric:tabular-nums">${fmtR(o.valor)}</td>
        <td style="padding:7px 8px">${o.taxa_mensal != null ? `${o.taxa_mensal.toFixed(2)}%` : "—"}</td>
        <td style="padding:7px 8px">${o.prazo != null ? `${o.prazo}d` : "—"}</td>
        <td style="padding:7px 8px;white-space:nowrap">${fmtDate(o.data_vencimento)}</td>
        <td style="padding:7px 8px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.sacado) || "—"}</td>
        <td style="padding:7px 8px">
          <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700;background:${statusBg[o.status]||"#f1f5f9"};color:${statusClr[o.status]||"#374151"}">
            ${statusLabel[o.status] || o.status}
          </span>
        </td>
      </tr>`).join("")}
    </tbody>
  </table>
  ${inadimplentes.length > 0 ? `
  <div style="margin-top:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;page-break-inside:avoid">
    <div style="font-size:9px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Operações Inadimplentes — Volume: ${fmtR(volumeInad)}</div>
    ${inadimplentes.map(o => `<div style="font-size:10px;color:#7f1d1d;margin-bottom:3px">
      ${fmtDate(o.data_operacao)} · ${esc(o.modalidade)} · ${fmtR(o.valor)} · Sacado: ${esc(o.sacado)||"—"}
      ${o.observacoes ? `<span style="color:#9ca3af"> — ${esc(o.observacoes)}</span>` : ""}
    </div>`).join("")}
  </div>` : ""}
</div>`;
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
  ${secHeatmap(p)}
  ${secScorecard(p)}
  ${secCnpj(p)}
  ${secCreditLimit(p)}
  ${secRecompra(p)}
  ${secFundo(p)}
  ${secScr(p)}
  ${secScrSocios(p)}
  ${secIrSocios(p)}
  ${secProtestos(p)}
  ${secProcessos(p)}
  ${secBureau(p)}
  ${secCcf(p)}
  ${secSacados(p)}
  ${secElegibilidade(p)}
  ${secCovenants(p)}
  ${secHistoricoOperacoes(p)}
  ${secCurvaAbc(p)}
  ${secGrupoEconomico(p)}
  ${secBalanco(p)}
  ${secDre(p)}
  ${secVisita(p)}
  ${secAnotacoes(p)}
  ${secDocumentos(p)}
  ${secDecisaoFinal(p)}
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
