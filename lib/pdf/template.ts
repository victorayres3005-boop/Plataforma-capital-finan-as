import type { PDFReportParams } from "@/lib/generators/pdf";
import type { FundCriterion, ProcessoItem } from "@/types";

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
  return "R$ " + n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtCnpj(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g,"");
  return d.length===14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5") : raw;
}
function decisaoBadge(decisao: string): string {
  const map: Record<string,{bg:string;color:string;label:string}> = {
    APROVADO:             {bg:"#dcfce7",color:"#166534",label:"APROVADO"},
    APROVACAO_CONDICIONAL:{bg:"#fef3c7",color:"#92400e",label:"CONDICIONAL"},
    PENDENTE:             {bg:"#fef3c7",color:"#92400e",label:"PENDENTE"},
    REPROVADO:            {bg:"#fee2e2",color:"#991b1b",label:"REPROVADO"},
  };
  const d = map[decisao] ?? {bg:"#f3f4f6",color:"#374151",label:esc(decisao)};
  return `<span style="display:inline-block;padding:5px 16px;border-radius:99px;background:${d.bg};color:${d.color};font-weight:700;font-size:12px;letter-spacing:.06em">${d.label}</span>`;
}
function kpi(label: string, value: string, color="#1a2744"): string {
  return `<div style="background:#f7f8fa;border-radius:8px;padding:12px 14px">
    <div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${esc(label)}</div>
    <div style="font-size:16px;font-weight:800;color:${color};line-height:1.1">${value}</div>
  </div>`;
}
function secHdr(num: string, title: string): string {
  return `<div style="display:flex;align-items:center;gap:10px;background:#eef3fb;border-left:4px solid #22c55e;padding:8px 14px;margin-bottom:16px;border-radius:2px">
    <span style="font-size:10px;font-weight:800;color:#fff;background:#1a2744;border-radius:4px;padding:2px 8px">${num}</span>
    <span style="font-size:13px;font-weight:700;color:#1a2744;text-transform:uppercase;letter-spacing:.04em">${esc(title)}</span>
  </div>`;
}
function row(cells: string[], head=false): string {
  const tag = head ? "th" : "td";
  return `<tr>${cells.map(c=>`<${tag}>${c}</${tag}>`).join("")}</tr>`;
}
function alert2(msg: string, sev: "ALTA"|"MODERADA"|"INFO"): string {
  const cfg = {ALTA:{bg:"#fee2e2",brd:"#f87171",c:"#991b1b",icon:"⚠"},MODERADA:{bg:"#fef3c7",brd:"#fcd34d",c:"#92400e",icon:"!"},INFO:{bg:"#eff6ff",brd:"#93c5fd",c:"#1d4ed8",icon:"i"}}[sev];
  return `<div style="background:${cfg.bg};border-left:4px solid ${cfg.brd};color:${cfg.c};border-radius:4px;padding:10px 14px;margin-bottom:8px;font-size:12px"><strong>${cfg.icon}</strong> ${esc(msg)}</div>`;
}
function grid(cols: number, items: string[]): string {
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;margin-bottom:14px">${items.join("")}</div>`;
}
function subTitle(t: string): string {
  return `<div style="font-size:12px;font-weight:700;color:#1a2744;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:14px 0 8px">${esc(t)}</div>`;
}
function paraBox(text: string): string {
  return `<div style="background:#f7f8fa;border-left:4px solid #1a2744;border-radius:4px;padding:14px 16px;font-size:12px;line-height:1.7;color:#374151">${esc(text)}</div>`;
}
const TS = "width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px";
const TH = "background:#f1f5f9;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb";
const TD = "padding:7px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top";

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#111827;background:#fff;line-height:1.5}
th{${TH}}td{${TD}}tr:nth-child(even) td{background:#f7f8fa}
.pb{page-break-before:always}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}
.ok{background:#dcfce7;color:#166534}.fail{background:#fee2e2;color:#991b1b}.warn{background:#fef3c7;color:#92400e}
@media print{@page{margin:20mm 16mm}}
`;

// ─── Sections ────────────────────────────────────────────────────────────────

function secCapa(p: PDFReportParams): string {
  const {data,finalRating,decision,companyAge} = p;
  const razao  = data.cnpj?.razaoSocial||"—";
  const cnpj   = fmtCnpj(data.cnpj?.cnpj);
  const situ   = data.cnpj?.situacaoCadastral||"";
  const hoje   = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const pct    = Math.min(100,Math.max(0,(finalRating/10)*100));
  const rc     = finalRating>=7?"#22c55e":finalRating>=4?"#f59e0b":"#ef4444";
  return `<div style="page-break-after:always;min-height:250mm;display:flex;flex-direction:column">
  <div style="background:#1a2744;padding:36px 40px;flex:1">
    <div style="font-size:13px;font-weight:800;color:#fff;letter-spacing:.06em;text-transform:uppercase;margin-bottom:52px">Capital <span style="color:#22c55e">Finanças</span></div>
    <div style="font-size:26px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:10px;max-width:80%">${esc(razao)}</div>
    <div style="font-size:12px;color:#94a3b8;margin-bottom:28px">CNPJ ${cnpj} &nbsp;·&nbsp; ${esc(situ)} &nbsp;·&nbsp; ${esc(companyAge)}</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:40px">${decisaoBadge(decision)}<span style="font-size:11px;color:#64748b">Emitido em ${hoje}</span></div>
    <div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Rating de Crédito</div>
      <div style="height:10px;background:rgba(255,255,255,.12);border-radius:99px;width:300px;position:relative;margin-bottom:10px">
        <div style="height:100%;width:${pct}%;background:${rc};border-radius:99px;position:absolute;left:0;top:0"></div>
        <div style="width:16px;height:16px;border-radius:50%;border:3px solid #fff;background:${rc};position:absolute;top:-3px;left:calc(${pct}% - 8px)"></div>
      </div>
      <div style="font-size:32px;font-weight:900;color:${rc}">${finalRating}<span style="font-size:16px;color:#64748b"> / 10</span></div>
    </div>
  </div>
  <div style="background:#111827;padding:14px 40px;display:flex;justify-content:space-between;font-size:10px;color:#64748b">
    <span>Confidencial — uso interno · Capital Finanças</span><span>${hoje}</span>
  </div>
</div>`;
}

function secSumario(): string {
  const itens:[string,string][] = [["00","Sumário Executivo"],["01","Cartão CNPJ"],["FS","Conformidade com Parâmetros do Fundo"],["05","SCR / Bacen"],["07","Processos Judiciais"],["OP","Relatório de Visita"],["NT","Anotações do Analista"]];
  return `<div style="page-break-after:always;padding:8px 0">
  <h2 style="font-size:20px;color:#1a2744;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #e5e7eb">Índice do Relatório</h2>
  ${itens.map(([n,l])=>`<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #f3f4f6">
    <span style="font-size:10px;font-weight:800;color:#fff;background:#1a2744;border-radius:4px;padding:2px 7px;flex-shrink:0">${n}</span>
    <span style="font-size:14px;font-weight:600;color:#111827">${l}</span>
  </div>`).join("")}
</div>`;
}

function secSumarioExec(p: PDFReportParams): string {
  const {data,finalRating,decision,alerts,alertsHigh,pontosFortes,pontosFracos,resumoExecutivo,protestosVigentes,vencidosSCR,companyAge} = p;
  const capitalSocial = data.qsa?.capitalSocial||data.cnpj?.capitalSocialCNPJ||"—";
  const fmm = data.faturamento?.fmm12m||data.faturamento?.mediaAno||"—";
  const rc  = finalRating>=7?"#16a34a":finalRating>=4?"#d97706":"#dc2626";
  const socios = data.qsa?.quadroSocietario?.slice(0,3).map(s=>esc(s.nome)).join(", ")||"—";
  return `<div class="pb">
  ${secHdr("00","Sumário Executivo")}
  ${alertsHigh.length>0?`<div style="margin-bottom:12px">${alertsHigh.map(a=>alert2(a.message,"ALTA")).join("")}</div>`:""}
  ${alerts.filter(a=>a.severity!=="ALTA").slice(0,3).map(a=>alert2(a.message,a.severity as "MODERADA"|"INFO")).join("")}
  ${grid(4,[kpi("Rating",`${finalRating} / 10`,rc),kpi("Decisão",decision.replace("_"," ")),kpi("Dívida SCR",fmtMoney(data.scr?.totalDividasAtivas)),kpi("Protestos Vigentes",String(protestosVigentes))])}
  ${grid(4,[kpi("SCR Vencidos",String(vencidosSCR),vencidosSCR>0?"#dc2626":"#111827"),kpi("FMM 12m",fmtMoney(fmm)),kpi("Processos Passivos",fmt(data.processos?.passivosTotal)),kpi("Capital Social",fmtMoney(capitalSocial))])}
  <table style="${TS}"><tbody>
    ${row(["Empresa",esc(data.cnpj?.razaoSocial||"—")])}
    ${row(["CNPJ",fmtCnpj(data.cnpj?.cnpj)])}
    ${row(["Situação",esc(data.cnpj?.situacaoCadastral||"—")])}
    ${row(["Idade",esc(companyAge)])}
    ${row(["Sócios",socios])}
    ${row(["Capital Social",fmtMoney(capitalSocial)])}
    ${row(["FMM 12 meses",fmtMoney(fmm)])}
  </tbody></table>
  ${resumoExecutivo?`${subTitle("Resumo Executivo")}${paraBox(resumoExecutivo)}`:""}
  ${(pontosFortes.length>0||pontosFracos.length>0)?`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
    <div style="background:#f7f8fa;border-radius:6px;padding:14px 16px">
      <div style="font-size:10px;color:#16a34a;font-weight:700;text-transform:uppercase;margin-bottom:6px">Pontos Fortes</div>
      <ul style="padding-left:16px">${pontosFortes.map(x=>`<li style="font-size:12px;margin-bottom:4px">${esc(x)}</li>`).join("")}</ul>
    </div>
    <div style="background:#f7f8fa;border-radius:6px;padding:14px 16px">
      <div style="font-size:10px;color:#dc2626;font-weight:700;text-transform:uppercase;margin-bottom:6px">Pontos de Atenção</div>
      <ul style="padding-left:16px">${pontosFracos.map(x=>`<li style="font-size:12px;margin-bottom:4px">${esc(x)}</li>`).join("")}</ul>
    </div>
  </div>`:""}
</div>`;
}

function secCnpj(p: PDFReportParams): string {
  const {data} = p;
  const c = data.cnpj;
  const cap = data.qsa?.capitalSocial||c?.capitalSocialCNPJ||"";
  const ok  = (c?.situacaoCadastral||"").toUpperCase().includes("ATIVA");
  return `<div class="pb">
  ${secHdr("01","Cartão CNPJ")}
  <div style="background:#1a2e4a;border-left:5px solid ${ok?"#22c55e":"#ef4444"};border-radius:6px;padding:16px 20px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
    <div>
      <div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:3px">${esc(c?.razaoSocial)}</div>
      ${c?.nomeFantasia&&c.nomeFantasia!==c.razaoSocial?`<div style="font-size:11px;color:#94a3b8;font-style:italic">"${esc(c.nomeFantasia)}"</div>`:""}
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">CNPJ ${fmtCnpj(c?.cnpj)}</div>
    </div>
    <span class="badge ${ok?"ok":"fail"}" style="flex-shrink:0">${esc(c?.situacaoCadastral||"—")}</span>
  </div>
  ${grid(4,[kpi("Data de Abertura",fmt(c?.dataAbertura)),kpi("Natureza Jurídica",fmt(c?.naturezaJuridica)),kpi("Porte",fmt(c?.porte)),kpi("Capital Social",fmtMoney(cap))])}
  ${[c?.tipoEmpresa,c?.regimeTributario,c?.funcionarios,c?.telefone].some(Boolean)?grid(4,[c?.tipoEmpresa?kpi("Tipo Empresa",fmt(c.tipoEmpresa)):"",c?.regimeTributario?kpi("Regime Tributário",fmt(c.regimeTributario)):"",c?.funcionarios?kpi("Funcionários",fmt(c.funcionarios)):"",c?.telefone?kpi("Telefone",fmt(c.telefone)):""]):""  }
  ${c?.cnaePrincipal?`<div style="background:#f7f8fa;border-radius:6px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:14px"><span style="background:#dbeafe;color:#1d4ed8;font-size:9px;font-weight:700;padding:3px 8px;border-radius:4px;flex-shrink:0;text-transform:uppercase;white-space:nowrap">CNAE Principal</span><span style="font-size:12px">${esc(c.cnaePrincipal)}</span></div>`:""}
  ${c?.endereco?`<div style="background:#fff;border:1px solid #e5e7eb;border-left:3px solid #22c55e;border-radius:6px;padding:12px 14px;margin-bottom:12px"><div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:4px">Endereço Principal</div><div style="font-size:12px;font-weight:600">${esc(c.endereco)}</div></div>`:""}
  ${data.qsa?.quadroSocietario?.filter(s=>s.nome).length?`
  ${subTitle("Quadro Societário")}
  <table style="${TS}"><thead>${row(["Nome","CPF/CNPJ","Qualificação","Participação"],true)}</thead><tbody>
  ${data.qsa.quadroSocietario.filter(s=>s.nome).map(s=>row([esc(s.nome),fmtCnpj(s.cpfCnpj),fmt(s.qualificacao),s.participacao?(String(s.participacao).includes("%")?esc(s.participacao):esc(s.participacao)+"%"):"—"])).join("")}
  </tbody></table>`:""}
</div>`;
}

function secFundo(p: PDFReportParams): string {
  if (!p.fundValidation||p.fundValidation.criteria.length===0) return "";
  const fv = p.fundValidation;
  const norm = (t:string)=>t.replace(/≥/g,">=").replace(/≤/g,"<=");
  const aprov = fv.failCount===0&&!fv.hasEliminatoria;
  const cond  = fv.warnCount>0&&fv.failCount===0;
  const vBg   = aprov?"#f0fdf4":cond?"#fffbeb":"#fff1f2";
  const vBrd  = aprov?"#86efac":cond?"#fde68a":"#fca5a5";
  const vClr  = aprov?"#166534":cond?"#92400e":"#991b1b";
  const vTxt  = (fv.hasEliminatoria&&fv.failCount>0)?"EMPRESA NÃO ELEGÍVEL — Critério eliminatório não atendido":fv.failCount>0?"REPROVADO PELOS PARÂMETROS DO FUNDO":fv.warnCount>0?"APROVAÇÃO CONDICIONAL":"EMPRESA ELEGÍVEL — Todos os critérios atendidos";
  return `<div class="pb">
  ${secHdr("FS","Conformidade com Parâmetros do Fundo")}
  ${grid(3,[kpi("Aprovados",String(fv.passCount),"#16a34a"),kpi("Em Atenção",String(fv.warnCount),"#d97706"),kpi("Reprovados",String(fv.failCount),"#dc2626")])}
  <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:12px">
    <div style="background:#f1f5f9;padding:8px 12px;display:grid;grid-template-columns:1fr 90px 90px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase"><span>Critério</span><span style="text-align:right">Limite</span><span style="text-align:right">Apurado</span></div>
    ${fv.criteria.map((cr:FundCriterion)=>{
      const ok=cr.status==="ok",err=cr.status==="error",wrn=cr.status==="warning";
      const rb=err?"#fff5f5":wrn?"#fffbeb":"transparent";
      const ac=ok?"#16a34a":err?"#dc2626":"#d97706";
      const ic=ok?`<span style="color:#16a34a">✓</span>`:err?`<span style="color:#dc2626">✗</span>`:`<span style="color:#d97706">!</span>`;
      return `<div style="display:grid;grid-template-columns:1fr 90px 90px;align-items:flex-start;gap:8px;padding:9px 12px;border-bottom:1px solid #f3f4f6;background:${rb}">
        <div style="display:flex;gap:8px;align-items:flex-start;min-width:0">
          <span style="font-size:14px;flex-shrink:0">${ic}</span>
          <div>
            <div style="font-size:12px;font-weight:600;color:#111827">${esc(cr.eliminatoria?"* "+cr.label:cr.label)}</div>
            ${cr.detail?`<div style="font-size:11px;color:#6b7280;margin-top:2px">${esc(cr.detail)}</div>`:""}
            ${cr.eliminatoria?`<span class="badge fail" style="font-size:9px;margin-top:3px">ELIMINATÓRIO</span>`:""}
          </div>
        </div>
        <div style="text-align:right;font-size:10px;color:#9ca3af">${esc(norm(cr.threshold))}</div>
        <div style="text-align:right;font-size:12px;font-weight:700;color:${ac}">${esc(cr.actual)}</div>
      </div>`;
    }).join("")}
  </div>
  <div style="border-radius:6px;padding:14px 18px;background:${vBg};border:1px solid ${vBrd}">
    <div style="font-size:10px;color:#9ca3af;margin-bottom:4px">${fv.passCount}/${fv.criteria.length} critérios aprovados</div>
    <div style="font-size:13px;font-weight:800;color:${vClr}">${vTxt}</div>
  </div>
  ${fv.criteria.some((c:FundCriterion)=>c.eliminatoria)?`<div style="margin-top:6px;font-size:10px;color:#9ca3af;font-style:italic">* Critério eliminatório: não atendimento impede aprovação independente dos demais.</div>`:""}
</div>`;
}

function secScr(p: PDFReportParams): string {
  const {data,vencidosSCR,vencidas,prejuizosVal} = p;
  const scr = data.scr;
  if (!scr) return "";
  const mods = (scr.modalidades||[]).filter(m=>m.nome);
  return `<div class="pb">
  ${secHdr("05","SCR / Bacen")}
  <div style="font-size:11px;color:#6b7280;margin-bottom:12px">Período: <strong>${fmt(scr.periodoReferencia)}</strong>${scr.qtdeInstituicoes?` &nbsp;·&nbsp; ${esc(scr.qtdeInstituicoes)} inst.`:""}${scr.qtdeOperacoes?` &nbsp;·&nbsp; ${esc(scr.qtdeOperacoes)} op.`:""}</div>
  ${grid(3,[kpi("Total Dívidas",fmtMoney(scr.totalDividasAtivas)),kpi("Carteira a Vencer",fmtMoney(scr.carteiraAVencer)),kpi("Vencidos",fmtMoney(scr.vencidos),vencidosSCR>0?"#dc2626":"#111827")])}
  ${grid(3,[kpi("Prejuízos",fmtMoney(scr.prejuizos),prejuizosVal>0?"#dc2626":"#111827"),kpi("Curto Prazo",fmtMoney(scr.carteiraCurtoPrazo)),kpi("Longo Prazo",fmtMoney(scr.carteiraLongoPrazo))])}
  ${vencidas>0?alert2(`${vencidas} operação(ões) vencida(s) no SCR`,"ALTA"):""}
  ${mods.length>0?`${subTitle("Modalidades de Crédito")}<table style="${TS}"><thead>${row(["Modalidade","Total","A Vencer","Vencido","Part."],true)}</thead><tbody>${mods.map(m=>row([esc(m.nome),fmtMoney(m.total),fmtMoney(m.aVencer),`<span style="${m.vencido&&m.vencido!=="0"?"color:#dc2626;font-weight:700":""}">${fmtMoney(m.vencido)}</span>`,fmt(m.participacao)])).join("")}</tbody></table>`:""}
  ${(scr.instituicoes||[]).length>0?`${subTitle("Principais Instituições")}<table style="${TS}"><thead>${row(["Instituição","Exposição"],true)}</thead><tbody>${(scr.instituicoes||[]).slice(0,8).map(i=>row([esc(i.nome),fmtMoney(i.valor)])).join("")}</tbody></table>`:""}
</div>`;
}

function secProcessos(p: PDFReportParams): string {
  const proc = p.data.processos;
  if (!proc) return "";
  const total  = parseInt(proc.passivosTotal ||"0");
  const ativo  = parseInt(proc.poloAtivoQtd  ||"0");
  const passiv = parseInt(proc.poloPassivoQtd||"0");
  const top10  = ((proc.top10Valor||proc.top10Recentes||[]) as ProcessoItem[]).slice(0,8);
  return `<div class="pb">
  ${secHdr("07","Processos Judiciais")}
  ${proc.temRJ?alert2("Pedido de Recuperação Judicial / Falência identificado","ALTA"):""}
  ${proc.temFalencia?alert2("Pedido de falência identificado","ALTA"):""}
  ${grid(4,[kpi("Total",String(total),total>20?"#dc2626":"#111827"),kpi("Polo Ativo",String(ativo)),kpi("Polo Passivo",String(passiv),passiv>10?"#dc2626":"#111827"),kpi("Valor Estimado",fmtMoney(proc.valorTotalEstimado))])}
  ${(proc.distribuicao||[]).length>0?`${subTitle("Distribuição por Tipo")}<table style="${TS}"><thead>${row(["Tipo","Qtd","%"],true)}</thead><tbody>${proc.distribuicao.map(d=>row([esc(d.tipo),fmt(d.qtd),fmt(d.pct)])).join("")}</tbody></table>`:""}
  ${top10.length>0?`${subTitle("Principais Processos por Valor")}<table style="${TS}"><thead>${row(["Número","Tipo","Data","Valor","Status"],true)}</thead><tbody>${top10.map(pr=>row([esc(pr.numero),esc(pr.tipo),fmt(pr.data),fmtMoney(pr.valor),`<span class="badge ${(pr.status||"").toLowerCase().includes("andamento")?"warn":"ok"}">${esc(pr.status)}</span>`])).join("")}</tbody></table>`:""}
</div>`;
}

function secVisita(p: PDFReportParams): string {
  const v = p.data.relatorioVisita;
  if (!v) return "";
  const mg = (items:{label:string;value:string}[]) =>
    items.length===0?`<div style="color:#9ca3af;font-size:12px;padding:8px 0">Não informado</div>`:grid(3,items.map(i=>kpi(i.label,i.value)));
  const taxas = ([
    v.taxaConvencional   &&{label:"Taxa Convencional",   value:v.taxaConvencional+"%"},
    v.taxaComissaria     &&{label:"Taxa Comissária",     value:v.taxaComissaria+"%"},
    v.limiteTotal        &&{label:"Limite Total",        value:fmtMoney(v.limiteTotal)},
    v.limiteConvencional &&{label:"Limite Convencional", value:fmtMoney(v.limiteConvencional)},
    v.limiteComissaria   &&{label:"Limite Comissária",   value:fmtMoney(v.limiteComissaria)},
    v.limitePorSacado    &&{label:"Limite / Sacado",     value:fmtMoney(v.limitePorSacado)},
  ] as (false|{label:string;value:string})[]).filter(Boolean) as {label:string;value:string}[];
  const cond = ([
    v.prazoMaximoOp        &&{label:"Prazo Máximo",     value:v.prazoMaximoOp+" dias"},
    v.prazoRecompraCedente &&{label:"Recompra Cedente", value:v.prazoRecompraCedente+" dias"},
    v.prazoEnvioCartorio   &&{label:"Envio Cartório",   value:v.prazoEnvioCartorio+" dias"},
    v.ticketMedio          &&{label:"Ticket Médio",     value:fmtMoney(v.ticketMedio)},
    v.cobrancaTAC          &&{label:"TAC",              value:esc(v.cobrancaTAC)},
    v.tranche              &&{label:"Tranche",          value:fmtMoney(v.tranche)},
  ] as (false|{label:string;value:string})[]).filter(Boolean) as {label:string;value:string}[];
  const mix = ([
    v.vendasDuplicata       &&{label:"Duplicata",          value:v.vendasDuplicata+"%"},
    v.vendasCheque          &&{label:"Cheque",             value:v.vendasCheque+"%"},
    v.vendasOutras          &&{label:"Outras Formas",       value:v.vendasOutras+"%"},
    v.prazoMedioFaturamento &&{label:"Prazo Médio Fat.",    value:v.prazoMedioFaturamento+" dias"},
    v.prazoMedioEntrega     &&{label:"Prazo Médio Entrega", value:v.prazoMedioEntrega+" dias"},
    v.folhaPagamento        &&{label:"Folha Pagamento",     value:fmtMoney(v.folhaPagamento)},
  ] as (false|{label:string;value:string})[]).filter(Boolean) as {label:string;value:string}[];
  const rC:Record<string,string>={aprovado:"#166534",condicional:"#92400e",reprovado:"#991b1b"};
  const rB:Record<string,string>={aprovado:"#dcfce7",condicional:"#fef3c7",reprovado:"#fee2e2"};
  const rL:Record<string,string>={aprovado:"APROVADO",condicional:"CONDICIONAL",reprovado:"REPROVADO"};
  return `<div class="pb">
  ${secHdr("OP","Relatório de Visita")}
  <div style="background:#f7f8fa;border-radius:6px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:11px;color:#6b7280">Data: <strong>${fmt(v.dataVisita)}</strong></div>
      ${v.responsavelVisita?`<div style="font-size:11px;color:#6b7280">Responsável: <strong>${esc(v.responsavelVisita)}</strong></div>`:""}
    </div>
    ${v.recomendacaoVisitante?`<span style="display:inline-block;padding:4px 12px;border-radius:99px;background:${rB[v.recomendacaoVisitante]||"#f3f4f6"};color:${rC[v.recomendacaoVisitante]||"#374151"};font-weight:700;font-size:11px">${rL[v.recomendacaoVisitante]||esc(v.recomendacaoVisitante)}</span>`:""}
  </div>
  ${subTitle("Taxas e Limites")}${mg(taxas)}
  ${subTitle("Condições e Prazos")}${mg(cond)}
  ${subTitle("Mix de Vendas e Operação")}${mg(mix)}
  ${v.descricaoEstrutura?`${subTitle("Descrição da Estrutura")}${paraBox(v.descricaoEstrutura)}`:""}
  ${v.observacoesLivres?`${subTitle("Observações")}${paraBox(v.observacoesLivres)}`:""}
</div>`;
}

function secAnotacoes(p: PDFReportParams): string {
  const t = p.observacoes?.trim();
  if (!t) return "";
  return `<div class="pb">${secHdr("NT","Anotações do Analista")}<div style="background:#f7f8fa;border-left:4px solid #1a2744;border-radius:4px;padding:16px 18px;font-size:12px;line-height:1.8;color:#374151;white-space:pre-wrap">${esc(t)}</div></div>`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function gerarHtmlRelatorio(p: PDFReportParams): string {
  const razao = p.data?.cnpj?.razaoSocial || "Cedente";
  return `<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Relatório de Crédito — ${esc(razao)}</title>
  <style>${CSS}</style>
</head><body>
  ${secCapa(p)}
  ${secSumario()}
  ${secSumarioExec(p)}
  ${secCnpj(p)}
  ${secFundo(p)}
  ${secScr(p)}
  ${secProcessos(p)}
  ${secVisita(p)}
  ${secAnotacoes(p)}
</body></html>`;
}
