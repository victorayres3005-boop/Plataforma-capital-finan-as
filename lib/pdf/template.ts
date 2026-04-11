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

function secHdr(num: string, title: string): string {
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #e5e7eb">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:var(--navy);color:#fff;font-size:9px;font-weight:800;border-radius:6px;flex-shrink:0">${num}</span>
    <span style="font-size:14px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.05em">${esc(title)}</span>
    <div style="flex:1;height:2px;background:linear-gradient(to right,var(--green),transparent)"></div>
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
  return `<div style="font-size:10px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e5e7eb;padding-bottom:5px;margin:18px 0 10px">${esc(t)}</div>`;
}

function paraBox(text: string): string {
  return `<div style="background:#f8fafc;border-left:3px solid var(--navy);border-radius:0 6px 6px 0;padding:14px 16px;font-size:12px;line-height:1.8;color:#374151;page-break-inside:avoid">${esc(text)}</div>`;
}

// ─── SVG Rating Gauge ─────────────────────────────────────────────────────────
function ratingGauge(rating: number): string {
  const cx=90,cy=82,R=68;
  const color=rating>=7?"#22c55e":rating>=4?"#f59e0b":"#ef4444";
  const angle=Math.PI*(1-rating/10);
  const ex=cx+R*Math.cos(angle),ey=cy-R*Math.sin(angle);
  return `<svg width="180" height="90" viewBox="0 0 180 90" style="overflow:visible">
    <path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${cx+R},${cy}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10" stroke-linecap="round"/>
    ${rating>0?`<path d="M ${cx-R},${cy} A ${R},${R} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`:""}
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="7" fill="${color}" stroke="var(--navy)" stroke-width="2.5"/>
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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
:root{--navy:#203B88;--navy-dark:#1a2744;--green:#73B815;--green-light:#22c55e}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#111827;background:#fff;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px}
th{background:var(--navy-dark);color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb}
td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:11px}
tr:nth-child(even) td{background:#f9fafb}
table{page-break-inside:avoid}
.sec{margin-top:24px}
.avoid{page-break-inside:avoid}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.ok{background:#dcfce7;color:#166534}
.fail{background:#fee2e2;color:#991b1b}
.warn{background:#fef3c7;color:#92400e}
.info{background:#dbeafe;color:#1d4ed8}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:90px;font-weight:900;color:rgba(32,59,136,0.035);white-space:nowrap;pointer-events:none;z-index:1;font-family:'Inter',Arial,sans-serif;letter-spacing:.15em;-webkit-print-color-adjust:exact;print-color-adjust:exact}
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
  return `<div style="page-break-after:always;min-height:260mm;display:flex;flex-direction:column;background:#0f1e3c">
  <div style="padding:28px 40px 0;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:11px;font-weight:900;color:#fff;letter-spacing:.1em;text-transform:uppercase">CAPITAL <span style="color:var(--green-light)">FINANCAS</span></div>
      <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px;letter-spacing:.04em">ANALISE DE CREDITO</div>
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,.35)">${hoje}</div>
  </div>
  <div style="margin:24px 40px;height:1px;background:rgba(255,255,255,.08)"></div>
  <div style="padding:0 40px;flex:1">
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
      <span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${ok?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)"};color:${ok?"#4ade80":"#fca5a5"};font-size:9px;font-weight:700;letter-spacing:.06em;border:1px solid ${ok?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}">${esc(c?.situacaoCadastral||"\u2014")}</span>
    </div>
    <div style="font-size:28px;font-weight:900;color:#fff;line-height:1.15;margin-bottom:6px;max-width:75%">${esc(c?.razaoSocial||"\u2014")}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:28px">CNPJ ${fmtCnpj(c?.cnpj)} &nbsp;·&nbsp; ${esc(p.companyAge||"\u2014")}</div>
    <div style="display:flex;align-items:flex-end;gap:48px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Decisao de Credito</div>
        ${decisaoBadge(p.decision,true)}
      </div>
      <div>
        <div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;text-align:center">Rating</div>
        ${ratingGauge(p.finalRating)}
      </div>
    </div>
  </div>
  <div style="padding:12px 40px;background:rgba(0,0,0,.25);margin-top:16px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:9px;color:rgba(255,255,255,.3)">Documento confidencial</span>
    <span style="font-size:9px;color:rgba(255,255,255,.25)">Capital Financas · ${hoje}</span>
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
  return `<div class="sec">${secHdr("02","Checklist de Documentos")}
  <div style="margin-bottom:12px;font-size:11px;color:#6b7280">${recebidos} de ${docs.length} documentos recebidos</div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid">
    ${docs.map(([label,ok],i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f3f4f6;background:${i%2===0?"#fff":"#fafafa"}">
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
    kpi("Protestos Vigentes",String(p.protestosVigentes),p.protestosVigentes>0?"#dc2626":"#111827"),
  ])}
  ${grid(4,[
    kpi("Processos",fmt(data.processos?.passivosTotal)),
    kpi("SCR Vencido",fmtMoney(data.scr?.vencidos),p.vencidosSCR>0?"#dc2626":"#111827"),
    kpi("Alavancagem",alavancagem!=null?`${alavancagem.toFixed(1)}x`:"\u2014",alavancagem&&alavancagem>3?"#dc2626":"#111827"),
    kpi("Tempo Empresa",esc(p.companyAge)||"\u2014"),
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
// SECTION 5: CONFORMIDADE COM PARAMETROS DO FUNDO
// ═══════════════════════════════════════════════════════════════════════════════
function secFundo(p: PDFReportParams): string {
  if(!p.fundValidation||!p.fundValidation.criteria.length) return "";
  const fv=p.fundValidation;
  const aprov=fv.failCount===0&&!fv.hasEliminatoria;
  const vClr=aprov?"#166534":"#991b1b";
  const vBg=aprov?"#f0fdf4":"#fff1f2";
  const vBrd=aprov?"#86efac":"#fca5a5";
  return `<div class="sec">${secHdr("05","Conformidade com Parametros do Fundo")}
  <table style="${TS}">
    <thead>${row(["Criterio","Limite","Apurado","Status"],true)}</thead>
    <tbody>${fv.criteria.map((cr: FundCriterion)=>{
      const ok=cr.status==="ok",err=cr.status==="error";
      const clr=ok?"#16a34a":err?"#dc2626":"#d97706";
      const bg=ok?"#f0fdf4":err?"#fff1f2":"#fffbeb";
      return `<tr style="background:${bg}"><td><strong>${esc(cr.label)}</strong>${cr.eliminatoria?' <span class="badge fail" style="font-size:8px">ELIMINATORIO</span>':""}</td><td>${esc(cr.threshold)}</td><td style="font-weight:700;color:${clr}">${esc(cr.actual||"\u2014")}</td><td><span style="color:${clr};font-weight:700">${ok?"\u2713":err?"\u2717":"!"}</span></td></tr>`;
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
  return `<div class="sec">${secHdr("06","Faturamento")}
  ${faturamentoChart(meses)}
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

  return `<div class="sec">${secHdr("07","Protestos")}
  ${grid(4,[
    kpi("Vigentes Qtd",String(vig),vig>0?"#dc2626":"#111827"),
    kpi("Vigentes R$",fmtMoney(prot.vigentesValor),vig>0?"#dc2626":"#111827"),
    kpi("Regularizados Qtd",String(reg)),
    kpi("Regularizados R$",fmtMoney(prot.regularizadosValor)),
  ])}
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
    kpi("Polo Ativo",String(ativo)),
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
  <div style="background:var(--navy-dark);border-radius:10px;padding:20px 24px;margin-bottom:16px;page-break-inside:avoid">
    <div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:3px">${esc(c.razaoSocial||"\u2014")}</div>
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
    ${p.streetViewBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <img src="${p.streetViewBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Street View</div>
    </div>`:""}
    ${p.mapStaticBase64?`<div style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <img src="${p.mapStaticBase64}" style="width:100%;height:170px;object-fit:cover;display:block"/>
      <div style="padding:6px 10px;background:#f8fafc;font-size:9px;color:#9ca3af">Mapa</div>
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
    return `<div style="border:1px solid #e5e7eb;border-left:4px solid var(--navy);border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:14px;page-break-inside:avoid">
      <div style="font-size:14px;font-weight:800;color:#111827;margin-bottom:2px">${esc(s.nomeSocio)}</div>
      <div style="font-size:10px;color:#6b7280;margin-bottom:12px">CPF ${fmtCpf(s.cpf)} ${s.anoBase?` · Ano-base ${esc(s.anoBase)}`:""}</div>
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
  <div class="watermark">CONFIDENCIAL</div>
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
  ${secDre(p)}
  ${secBalanco(p)}
  ${secHistoricoConsultas(p)}
  ${secIrSocios(p)}
  ${secVisita(p)}
  ${secDadosEmpresa(p)}
</body></html>`;

  const headerTemplate=`<div style="width:100%;padding:5px 16mm 3px;display:flex;justify-content:space-between;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;color:#6b7280;border-bottom:1px solid #e5e7eb">
    <span style="font-weight:800;color:#203B88;letter-spacing:.04em">CAPITAL <span style="color:#73B815">FINANCAS</span></span>
    <span style="max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${razao}</span>
    <span></span>
  </div>`;

  const footerTemplate=`<div style="width:100%;padding:3px 16mm 5px;display:flex;justify-content:space-between;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;color:#9ca3af;border-top:1px solid #f3f4f6">
    <span>Confidencial \u2014 uso interno \u00b7 ${hoje}</span>
    <span>Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;

  return {html,headerTemplate,footerTemplate};
}
