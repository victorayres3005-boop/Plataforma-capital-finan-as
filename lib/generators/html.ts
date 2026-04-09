import type { ExtractedData, AIAnalysis } from "@/types";
import { calcularCobertura } from "@/lib/generators/helpers";

interface Alert {
  message: string;
  severity: "ALTA" | "MODERADA" | "INFO";
  impacto?: string;
}

export interface HTMLReportParams {
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  alerts: Alert[];
  alertsHigh: Alert[];
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: { pergunta: string; contexto: string }[];
  resumoExecutivo: string;
  companyAge: string;
  vencidosSCR: number;
  vencidas: number;
  prejuizosVal: number;
  protestosVigentes: number;
  alavancagem?: number;
}

export function buildHTMLReport(p: HTMLReportParams): string {
  const d = p.data;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { decision, finalRating, alerts, alertsHigh, pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo, companyAge, vencidosSCR, vencidas, prejuizosVal, protestosVigentes } = p;

  const esc = (s: string) => (s || "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const maskCpf = (cpf: string) => cpf ? cpf.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, "$1.***.*$3-$4") : "—";
  const genDt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const vs = d.contrato.socios.filter(s => s.nome);
  const vq = d.qsa.quadroSocietario.filter(s => s.nome);

  const parseMoney = (v: string): number => {
    if (!v || v === "—") return 0;
    return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
  };
  const fmtMoney = (n: number): string =>
    n === 0 ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmmNum = parseMoney(d.faturamento?.mediaAno || "0");
  const scrAtualNum = parseMoney(d.scr?.totalDividasAtivas || "0");
  const scrAntNum = parseMoney(d.scrAnterior?.totalDividasAtivas || "0");
  const alavancagem = p.alavancagem ?? (fmmNum > 0 ? scrAtualNum / fmmNum : 0);
  const alavAnterior = fmmNum > 0 && scrAntNum > 0 ? scrAntNum / fmmNum : 0;
  const alavAtualStr = alavancagem > 0 ? alavancagem.toFixed(2) + "x" : "—";

  const scrEhZero = scrAtualNum === 0 && parseMoney(d.scr?.limiteCredito || "0") === 0 && (d.scr?.qtdeInstituicoes === "0" || !d.scr?.qtdeInstituicoes);

  const motivoPreRequisito = p.aiAnalysis?.motivoPreRequisito?.join("; ") || null;

  // Fix: faturamento zerado — recalcula corretamente
  const meses = d.faturamento?.meses || [];
  const faturamentoRealmenteZerado = meses.length === 0 || meses.every(m => parseMoney(m.valor) === 0);

  // Fix: ordenar meses cronologicamente
  const mesesOrdenados = [...meses].filter(m => m.mes).sort((a, b) => {
    const [ma, ya] = (a.mes || "").split("/").map(Number);
    const [mb, yb] = (b.mes || "").split("/").map(Number);
    return (ya || 0) !== (yb || 0) ? (ya || 0) - (yb || 0) : (ma || 0) - (mb || 0);
  });

  const protestosDet = d.protestos?.detalhes || [];
  const distArr = d.processos?.distribuicao || [];
  const bancArr = d.processos?.bancarios || [];
  const geArr = d.grupoEconomico?.empresas || [];

  // Cobertura da análise
  const cobertura = calcularCobertura(d);
  const coberturaColor = cobertura.nivel === "completa" ? "#16a34a" : cobertura.nivel === "parcial" ? "#d97706" : "#dc2626";
  const coberturaLabel = cobertura.nivel === "completa" ? "Completa" : cobertura.nivel === "parcial" ? "Parcial" : "Mínima";
  const ausentes = cobertura.documentos.filter(doc => !doc.presente && !doc.automatico).map(doc => doc.label);
  const coberturaBarW = Math.round((cobertura.totalPresentes / cobertura.totalPossivel) * 100);

  // Helpers
  const row = (label: string, value: string) => {
    const isEmpty = !value || value === "—" || value === "0" || value === "0,00";
    return `<tr><td class="lbl">${esc(label)}</td><td class="val${isEmpty ? " muted" : ""}">${isEmpty ? "—" : esc(value)}</td></tr>`;
  };
  const moneyRow = (label: string, value: string) => {
    const isEmpty = !value || value === "—" || value === "0" || value === "0,00";
    return `<tr><td class="lbl">${esc(label)}</td><td class="val money${isEmpty ? " muted" : ""}">${isEmpty ? "—" : esc(value)}</td></tr>`;
  };
  const alertHtml = (a: Alert) => {
    const sevMap: Record<string, { cls: string; label: string }> = { ALTA: { cls: "alert-critico", label: "CRITICO" }, MODERADA: { cls: "alert-moderado", label: "MODERADO" }, INFO: { cls: "alert-info", label: "INFO" } };
    const sev = sevMap[a.severity] || sevMap.INFO;
    return `<div class="alert-line"><span class="alert-badge ${sev.cls}">${sev.label}</span><span class="alert-text">${esc(a.message)}</span>${a.impacto ? `<span class="alert-mitigation">${esc(a.impacto)}</span>` : ""}</div>`;
  };
  const sectionWarning = (msg: string) => `<div class="section-warning">ATENCAO: ${esc(msg)}</div>`;

  // Alert cards data
  const alertCards = [
    { label: "Protestos", value: protestosVigentes > 0 ? `R$ ${d.protestos?.vigentesValor || "0"}` : "—", danger: protestosVigentes > 0, warning: false },
    { label: "Processos passivos", value: d.processos?.passivosTotal || "—", danger: parseInt(d.processos?.passivosTotal || "0") > 20, warning: false },
    { label: "SCR Vencido", value: vencidosSCR > 0 ? `R$ ${d.scr.vencidos}` : "—", danger: vencidosSCR > 0, warning: false },
    { label: "SCR Prejuizo", value: prejuizosVal > 0 ? `R$ ${d.scr.prejuizos}` : "—", danger: prejuizosVal > 0, warning: false },
    { label: "Rec. Judicial", value: d.processos?.temRJ ? "Sim" : "—", danger: !!d.processos?.temRJ, warning: false },
    { label: "Alavancagem", value: alavancagem > 0 ? `${alavancagem.toFixed(2)}x` : "—", danger: alavancagem > 5, warning: alavancagem > 3.5 && alavancagem <= 5 },
  ];

  // SVG chart
  const gerarGrafico = (): string => {
    if (mesesOrdenados.length === 0) return "";
    const valores = mesesOrdenados.map(m => parseMoney(m.valor));
    const maxVal = Math.max(...valores);
    if (maxVal === 0) return "";
    const W = 380, H = 140, PAD = 6, BOTTOM = 22;
    const n = mesesOrdenados.length;
    const barW = Math.max(3, Math.floor((W - PAD * 2) / n) - 2);
    const chartH = H - BOTTOM;
    const fmmY = fmmNum > 0 && maxVal > 0 ? H - BOTTOM - Math.round((fmmNum / maxVal) * chartH) : -1;
    const bars = mesesOrdenados.map((m, i) => {
      const v = valores[i]; const bH = Math.round((v / maxVal) * chartH);
      const x = PAD + i * (barW + 2); const y = H - BOTTOM - bH; const isMax = v === maxVal;
      const valLabel = v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "K" : v.toFixed(0);
      return `<rect x="${x}" y="${y}" width="${barW}" height="${bH}" fill="${isMax ? "#1e3a5f" : "#2563eb"}" rx="1.5"/>
        <text x="${x + barW / 2}" y="${H - 4}" text-anchor="middle" font-size="7" fill="#94a3b8" font-family="system-ui">${esc(m.mes)}</text>
        ${bH > 16 ? `<text x="${x + barW / 2}" y="${y - 2}" text-anchor="middle" font-size="6" fill="#64748b" font-family="system-ui">${valLabel}</text>` : ""}`;
    }).join("");
    const total = valores.reduce((s, v) => s + v, 0);
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;display:block">
      ${fmmY > 0 ? `<line x1="${PAD}" y1="${fmmY}" x2="${W - PAD}" y2="${fmmY}" stroke="#94a3b8" stroke-dasharray="2,2" stroke-width="0.8"/><text x="${W - PAD}" y="${fmmY - 3}" text-anchor="end" font-size="7" fill="#94a3b8" font-family="system-ui">FMM</text>` : ""}
      ${bars}</svg>
    <p style="font-size:10px;color:#94a3b8;text-align:center;margin:4px 0 0">FMM: ${fmtMoney(fmmNum)} &nbsp;|&nbsp; Total: ${fmtMoney(total)} &nbsp;|&nbsp; ${mesesOrdenados.length} meses</p>`;
  };

  // SCR comparison rows
  const scrCompRows = [
    { label: "Em Dia", ant: parseMoney(d.scrAnterior?.carteiraAVencer || "0"), at: parseMoney(d.scr?.carteiraAVencer || "0"), positiveIsGood: true, bold: false },
    { label: "CP", ant: parseMoney(d.scrAnterior?.carteiraCurtoPrazo || "0"), at: parseMoney(d.scr?.carteiraCurtoPrazo || "0"), positiveIsGood: false, bold: false },
    { label: "LP", ant: parseMoney(d.scrAnterior?.carteiraLongoPrazo || "0"), at: parseMoney(d.scr?.carteiraLongoPrazo || "0"), positiveIsGood: false, bold: false },
    { label: "Total", ant: parseMoney(d.scrAnterior?.totalDividasAtivas || "0"), at: scrAtualNum, positiveIsGood: false, bold: true },
    { label: "Vencida", ant: parseMoney(d.scrAnterior?.vencidos || "0"), at: parseMoney(d.scr?.vencidos || "0"), positiveIsGood: false, bold: false },
    { label: "Prejuizo", ant: parseMoney(d.scrAnterior?.prejuizos || "0"), at: prejuizosVal, positiveIsGood: false, bold: false },
    { label: "Limite", ant: parseMoney(d.scrAnterior?.limiteCredito || "0"), at: parseMoney(d.scr?.limiteCredito || "0"), positiveIsGood: true, bold: false },
    { label: "IFs", ant: parseInt(d.scrAnterior?.qtdeInstituicoes || "0"), at: parseInt(d.scr?.qtdeInstituicoes || "0"), positiveIsGood: true, bold: false },
    { label: "Alav.", ant: alavAnterior, at: alavancagem, positiveIsGood: false, bold: false, isMultiple: true as const },
  ];

  const renderScrCompTable = () => scrCompRows.map(m => {
    const diff = m.at - m.ant; const isMultiple = "isMultiple" in m && m.isMultiple;
    let varStr = "="; let varColor = "#999";
    if (diff !== 0) {
      if (isMultiple) varStr = (diff > 0 ? "+" : "") + diff.toFixed(2) + "x";
      else if (m.ant > 0) varStr = (diff > 0 ? "+" : "") + ((diff / m.ant) * 100).toFixed(1) + "%";
      else varStr = diff > 0 ? "+" + fmtMoney(diff) : fmtMoney(diff);
      const isGood = (diff > 0 && m.positiveIsGood) || (diff < 0 && !m.positiveIsGood);
      varColor = isGood ? "#16a34a" : "#dc2626";
    }
    const antStr = isMultiple ? (m.ant > 0 ? m.ant.toFixed(2) + "x" : "—") : (m.ant > 0 ? fmtMoney(m.ant) : "—");
    const atStr = isMultiple ? (m.at > 0 ? m.at.toFixed(2) + "x" : "—") : (m.at > 0 ? fmtMoney(m.at) : "—");
    return `<tr><td style="${m.bold ? "font-weight:600" : ""}">${esc(m.label)}</td><td class="money">${antStr}</td><td class="money">${atStr}</td><td class="money" style="color:${varColor};font-weight:600">${varStr}</td></tr>`;
  }).join("");

  const decisionClass = decision === "APROVADO" ? "decision-approved" : decision === "REPROVADO" ? "decision-rejected" : "decision-pending";

  // ═══════════════════════════════════════
  // CSS
  // ═══════════════════════════════════════
  const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#1a1a1a;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:860px;margin:0 auto;padding:40px 36px}.doc-header{padding-bottom:16px;border-bottom:1px solid #e5e5e5;margin-bottom:24px}.brand{font-size:14px;font-weight:300;color:#1a1a1a}.brand-sub{font-size:10px;letter-spacing:0.15em;color:#666;text-transform:uppercase;margin-top:2px}.sintese{margin-bottom:28px}.sintese-empresa{font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:4px}.sintese-meta{font-size:12px;color:#999;margin-bottom:12px}.sintese-badges{display:flex;gap:12px;align-items:center;margin-bottom:16px}.rating-big{font-size:22px;font-weight:700}.decision-badge{display:inline-block;font-size:12px;font-weight:600;padding:6px 16px;border-radius:4px;border:1px solid}.decision-approved{background:#f0fdf4;color:#16a34a;border-color:#bbf7d0}.decision-pending{background:#fffbeb;color:#d97706;border-color:#fde68a}.decision-rejected{background:#fef2f2;color:#dc2626;border-color:#fecaca}.alert-cards{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:24px}.alert-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;text-align:center}.alert-card.danger{background:#fef2f2;border-color:#fecaca}.alert-card.warning{background:#fffbeb;border-color:#fde68a}.alert-card-value{font-size:16px;font-weight:700;color:#1a1a1a;display:block;line-height:1.2}.alert-card-label{font-size:9px;text-transform:uppercase;letter-spacing:0.06em;color:#666;margin-top:4px;display:block}.section{margin-bottom:28px;page-break-inside:avoid}.sec-num{display:block;font-size:10px;color:#999;margin-bottom:3px}.sec-heading{font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:#1a1a1a}.sec-rule{border:none;border-top:1px solid #e5e5e5;margin:6px 0 16px}table.kv{width:100%;border-collapse:collapse}table.kv td{padding:6px 0;font-size:12px;border-bottom:1px solid #f0f0f0;vertical-align:top}table.kv tr:last-child td{border-bottom:none}td.lbl{width:200px;color:#666}td.val{color:#1a1a1a;font-weight:500}td.val.muted{color:#999;font-weight:400}td.val.money{text-align:right;font-variant-numeric:tabular-nums}.dtable{width:100%;border-collapse:collapse;margin-bottom:16px}.dtable th{background:#f8f9fa;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;padding:8px 10px;font-weight:500;text-align:left;border-bottom:1px solid #e5e5e5}.dtable td{font-size:12px;padding:7px 10px;color:#1a1a1a;border-bottom:1px solid #f0f0f0}.dtable tr:last-child td{border-bottom:none}.dtable .money{text-align:right;font-variant-numeric:tabular-nums}.dtable .empty{text-align:center;color:#999;padding:20px 10px;font-style:italic}.badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:9px;font-weight:500}.badge-red{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}.badge-green{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0}.badge-amber{background:#fffbeb;color:#d97706;border:1px solid #fde68a}.two-col{display:grid;grid-template-columns:58% 40%;gap:16px;margin-bottom:16px}.alert-line{margin-bottom:6px;line-height:1.5}.alert-badge{display:inline-block;font-size:9px;padding:2px 6px;border-radius:3px;font-weight:500;margin-right:8px;vertical-align:middle}.alert-critico{background:#fef2f2;color:#dc2626}.alert-moderado{background:#fffbeb;color:#d97706}.alert-info{background:#eff6ff;color:#2563eb}.alert-positivo{background:#f0fdf4;color:#16a34a}.alert-text{font-size:12px;color:#444}.alert-mitigation{display:block;font-size:11px;color:#888;font-style:italic;margin-top:1px;padding-left:56px}.section-warning{padding:6px 10px;background:#fffbeb;border-left:3px solid #d97706;margin-bottom:12px;font-size:11px;color:#d97706}.sub-heading{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin:20px 0 10px;padding-bottom:4px;border-bottom:1px solid #f0f0f0}.muted{color:#999}.parecer-box{border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;margin:20px 0}.parecer-header{background:#f97316;color:#fff;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;padding:7px 14px}.decisao-label{font-size:13px;font-weight:700;color:#f97316;padding:10px 14px 4px}.parecer-resumo{font-size:12px;color:#333;line-height:1.7;padding:0 14px 6px}.parecer-section{font-size:12px;font-weight:600;color:#16a34a;padding:6px 14px 2px}.parecer-section.fracos{color:#dc2626}.parecer-item{font-size:12px;color:#333;padding:1px 14px 1px 22px;line-height:1.6}.pergunta-item{font-size:12px;color:#333;padding:3px 14px;line-height:1.6}.pergunta-contexto{font-size:11px;color:#666}.doc-footer{border-top:1px solid #e5e5e5;padding-top:10px;margin-top:32px;display:flex;justify-content:space-between}.doc-footer span{font-size:9px;color:#999}@media print{body{background:#fff}.page{padding:0;max-width:100%}.section{page-break-inside:avoid}.no-print{display:none}}@page{margin:18mm 14mm}`;

  // ═══════════════════════════════════════
  // HTML
  // ═══════════════════════════════════════
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatorio — ${esc(d.cnpj.razaoSocial || "Capital Financas")}</title>
<style>${css}</style></head><body><div class="page">

<!-- HEADER -->
<div class="doc-header"><div class="brand">capital financas</div><div class="brand-sub">CONSOLIDADOR DE DOCUMENTOS</div></div>

<!-- SINTESE -->
<div class="sintese">
<div class="sintese-empresa">${esc(d.cnpj.razaoSocial)}</div>
<div class="sintese-badges">
<span class="rating-big" style="color:${decision === "APROVADO" ? "#16a34a" : decision === "REPROVADO" ? "#dc2626" : "#d97706"}">${finalRating}/10</span>
<span class="decision-badge ${decisionClass}">${esc(decision)}</span>
${motivoPreRequisito ? `<span style="font-size:11px;color:#dc2626">${esc(motivoPreRequisito)}</span>` : ""}
</div>
<div style="margin:8px 0 12px">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
    <div style="width:160px;height:5px;background:#e5e5e5;border-radius:3px;overflow:hidden;flex-shrink:0">
      <div style="height:100%;width:${coberturaBarW}%;background:${coberturaColor};border-radius:3px"></div>
    </div>
    <span style="font-size:11px;color:#555">Base da análise: <strong>${cobertura.totalPresentes} de ${cobertura.totalPossivel}</strong> documentos &nbsp;·&nbsp; <span style="color:${coberturaColor};font-weight:600">${coberturaLabel}</span> (${cobertura.pesoAtingido}% do score coberto)</span>
  </div>
  ${ausentes.length > 0 ? `<div style="font-size:10px;color:#999">Não incluídos: ${ausentes.map(a => esc(a)).join(" · ")}</div>` : ""}
</div>
<div class="sintese-meta">CNPJ ${esc(d.cnpj.cnpj)} &nbsp;|&nbsp; ${companyAge ? companyAge + " de operacao &nbsp;|&nbsp; " : ""}${esc(d.cnpj.situacaoCadastral || "")} &nbsp;|&nbsp; ${genDt}</div>
</div>

<!-- ALERT CARDS -->
<div class="alert-cards">
${alertCards.map(c => `<div class="alert-card${c.danger ? " danger" : c.warning ? " warning" : ""}"><span class="alert-card-value">${esc(String(c.value))}</span><span class="alert-card-label">${esc(c.label)}</span></div>`).join("")}
</div>

<!-- SOCIOS PF -->
${vq.length > 0 ? `<div class="section"><span class="sec-num">S1</span><span class="sec-heading">Gestao e Socios PF</span><hr class="sec-rule">
<table class="dtable"><thead><tr><th>Nome / CPF</th><th style="text-align:right">Qualificacao</th><th style="text-align:right">Participacao</th></tr></thead>
<tbody>${vq.map(s => `<tr><td>${esc(s.nome)}<br><span style="font-size:10px;color:#999">${esc(s.cpfCnpj)}</span></td><td style="text-align:right">${esc(s.qualificacao)}</td><td style="text-align:right"><strong>${esc(s.participacao)}</strong></td></tr>`).join("")}</tbody></table></div>` : ""}

<!-- GRUPO ECONOMICO -->
${(geArr.length > 0 || d.grupoEconomico?.alertaParentesco) ? `<div class="section"><span class="sec-num">S2</span><span class="sec-heading">Grupo Economico</span><hr class="sec-rule">
${geArr.length > 0 ? `<table class="dtable"><thead><tr><th>Razao Social</th><th>CNPJ</th><th>Situacao</th><th>Via Socio</th><th style="text-align:right">Participacao</th><th>Relacao</th></tr></thead>
<tbody>${geArr.map(e => { const sitStyle = e.situacao === "ATIVA" ? "color:#16a34a;font-weight:600" : e.situacao === "BAIXADA" ? "color:#dc2626;font-weight:600" : "color:#d97706;font-weight:600"; return `<tr><td>${esc(e.razaoSocial)}</td><td style="font-variant-numeric:tabular-nums">${esc(e.cnpj)}</td><td><span style="${sitStyle}">${esc(e.situacao || "—")}</span></td><td style="font-size:11px;color:#555">${esc(e.socioOrigem || "—")}</td><td style="text-align:right">${esc(e.participacao || "—")}</td><td>${esc(e.relacao)}</td></tr>`; }).join("")}</tbody></table>` : ""}
${(d.grupoEconomico?.alertaParentesco && (d.grupoEconomico?.parentescosDetectados?.length ?? 0) > 0) ? `<div style="margin-top:12px;padding:10px 14px;background:#fef3c7;border-left:4px solid #d97706;border-radius:4px"><strong style="color:#92400e">&#9888; Alerta: Possivel Parentesco entre Socios</strong><ul style="margin:6px 0 0 16px;padding:0">${(d.grupoEconomico.parentescosDetectados ?? []).map(pt => `<li style="font-size:12px;color:#78350f;margin-bottom:2px">${esc(pt.socio1)} e ${esc(pt.socio2)} — sobrenome em comum: <strong>${esc(pt.sobrenomeComum)}</strong></li>`).join("")}</ul></div>` : ""}
</div>` : ""}

<!-- FATURAMENTO + SCR lado a lado -->
<div class="section"><span class="sec-num">S3</span><span class="sec-heading">Faturamento e Perfil de Credito</span><hr class="sec-rule">
${faturamentoRealmenteZerado ? sectionWarning("Faturamento zerado no periodo") : ""}
${!d.faturamento.dadosAtualizados ? sectionWarning(`Dados desatualizados — ultimo mes: ${d.faturamento.ultimoMesComDados || "N/A"}`) : ""}
<div class="two-col">
<div>
<p style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Faturamento Mensal</p>
${gerarGrafico() || '<p class="muted" style="font-size:12px">Sem dados de faturamento</p>'}
</div>
<div>
<p style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Comparativo SCR</p>
${scrEhZero ? `<p style="font-size:12px;color:#3b82f6">Sem historico bancario</p>` : `<table class="dtable" style="font-size:11px"><thead><tr><th></th><th style="text-align:right">${d.scrAnterior?.periodoReferencia || "Ant."}</th><th style="text-align:right">${d.scr?.periodoReferencia || "Atual"}</th><th style="text-align:right">Var.</th></tr></thead><tbody>${renderScrCompTable()}</tbody></table>`}
</div>
</div>
</div>

<!-- PARECER -->
<div class="parecer-box">
<div class="parecer-header">PARECER PRELIMINAR</div>
<div class="decisao-label">DECISAO PRELIMINAR: ${esc(decision)}</div>
${resumoExecutivo ? `<p class="parecer-resumo">${esc(resumoExecutivo)}</p>` : ""}
${pontosFortes.length > 0 ? `<div class="parecer-section">Pontos Fortes:</div>${pontosFortes.map(pp => `<div class="parecer-item">• ${esc(pp)}</div>`).join("")}` : ""}
${pontosFracos.length > 0 ? `<div class="parecer-section fracos" style="color:#dc2626">Pontos Fracos:</div>${pontosFracos.map(pp => `<div class="parecer-item">• ${esc(pp)}</div>`).join("")}` : ""}
${perguntasVisita.length > 0 ? `<div class="parecer-section" style="color:#d97706">Perguntas para a Visita:</div>${perguntasVisita.map((q, i) => `<div class="pergunta-item">${i + 1}. ${esc(q.pergunta)} <span class="pergunta-contexto">(${esc(q.contexto)})</span></div>`).join("")}` : ""}
${d.resumoRisco && d.resumoRisco !== resumoExecutivo ? `<div class="parecer-section" style="color:#1a1a1a">Analise Detalhada:</div><p class="parecer-resumo" style="white-space:pre-line">${esc(d.resumoRisco)}</p>` : ""}
</div>

<!-- ═══ PAGINAS DETALHADAS ═══ -->

<!-- 01 IDENTIFICACAO -->
<div class="section"><span class="sec-num">01</span><span class="sec-heading">Identificacao da Empresa</span><hr class="sec-rule">
<table class="kv">${row("Razao Social", d.cnpj.razaoSocial)}${row("Nome Fantasia", d.cnpj.nomeFantasia)}${row("CNPJ", d.cnpj.cnpj)}${row("Data de Abertura", d.cnpj.dataAbertura)}${row("Situacao Cadastral", d.cnpj.situacaoCadastral)}${row("Natureza Juridica", d.cnpj.naturezaJuridica)}${row("CNAE Principal", d.cnpj.cnaePrincipal)}${row("Porte", d.cnpj.porte)}${row("Capital Social", d.cnpj.capitalSocialCNPJ)}${row("Endereco", d.cnpj.endereco)}${row("Telefone", d.cnpj.telefone)}${row("E-mail", d.cnpj.email)}</table></div>

<!-- 02 CONTRATO -->
<div class="section"><span class="sec-num">02</span><span class="sec-heading">Contrato Social</span><hr class="sec-rule">
${d.contrato.temAlteracoes ? sectionWarning("Alteracoes societarias recentes") : ""}
<table class="dtable"><thead><tr><th>Socio</th><th>CPF</th><th>Qualificacao</th><th>Participacao</th></tr></thead>
<tbody>${vs.length > 0 ? vs.map(s => `<tr><td>${esc(s.nome)}</td><td style="font-variant-numeric:tabular-nums">${maskCpf(s.cpf)}</td><td>${esc(s.qualificacao)}</td><td><strong>${esc(s.participacao)}</strong></td></tr>`).join("") : '<tr><td colspan="4" class="empty">Nenhum socio</td></tr>'}</tbody></table>
<table class="kv">${row("Capital Social", d.contrato.capitalSocial)}${row("Data Constituicao", d.contrato.dataConstituicao)}${row("Objeto Social", d.contrato.objetoSocial)}${row("Administracao", d.contrato.administracao)}${row("Foro", d.contrato.foro)}</table></div>

<!-- 03 FATURAMENTO DETALHADO -->
<div class="section"><span class="sec-num">03</span><span class="sec-heading">Faturamento Detalhado</span><hr class="sec-rule">
<table class="kv">${moneyRow("Somatoria (R$)", d.faturamento.somatoriaAno)}${moneyRow("Media Mensal (R$)", d.faturamento.mediaAno)}${row("Ultimo Mes", d.faturamento.ultimoMesComDados)}</table>
${mesesOrdenados.length > 0 ? `<div class="sub-heading">Serie Mensal</div><table class="dtable"><thead><tr><th>Mes</th><th style="text-align:right">Valor (R$)</th></tr></thead><tbody>${mesesOrdenados.map(m => `<tr><td>${esc(m.mes)}</td><td class="money"><strong>${esc(m.valor || "0,00")}</strong></td></tr>`).join("")}</tbody></table>` : ""}</div>

<!-- 04 SCR DETALHADO -->
<div class="section"><span class="sec-num">04</span><span class="sec-heading">SCR / BACEN — Detalhado</span><hr class="sec-rule">
${(vencidosSCR > 0 || vencidas > 0) ? sectionWarning("Operacoes vencidas no SCR") : ""}
${prejuizosVal > 0 ? sectionWarning("Prejuizos registrados") : ""}
${scrEhZero ? `<div style="padding:16px;background:#f8fafc;border-radius:6px;border-left:3px solid #3b82f6"><p style="font-size:12px;font-weight:500;color:#1e40af;margin:0">Sem historico de credito bancario</p></div>` : `<table class="kv">${moneyRow("Total Dividas", d.scr.totalDividasAtivas)}${moneyRow("Carteira a Vencer", d.scr.carteiraAVencer)}${moneyRow("Vencidos", d.scr.vencidos)}${moneyRow("Prejuizos", d.scr.prejuizos)}${moneyRow("Limite", d.scr.limiteCredito)}${row("Qtde IFs", d.scr.qtdeInstituicoes)}${row("Alavancagem", alavAtualStr)}</table>`}
${d.scr.modalidades.length > 0 ? `<div class="sub-heading">Modalidades</div><table class="dtable"><thead><tr><th>Modalidade</th><th style="text-align:right">Total</th><th style="text-align:right">A Vencer</th><th style="text-align:right">Vencido</th><th style="text-align:right">Part.</th></tr></thead><tbody>${d.scr.modalidades.map(m => `<tr><td>${esc(m.nome)}</td><td class="money">${esc(m.total)}</td><td class="money">${esc(m.aVencer)}</td><td class="money">${esc(m.vencido)}</td><td class="money"><strong>${esc(m.participacao)}</strong></td></tr>`).join("")}</tbody></table>` : ""}</div>

<!-- 05 PROTESTOS -->
<div class="section"><span class="sec-num">05</span><span class="sec-heading">Protestos</span><hr class="sec-rule">
${protestosVigentes > 0 ? sectionWarning(`${protestosVigentes} protesto(s) vigente(s)`) : ""}
<table class="kv">${row("Vigentes", d.protestos?.vigentesQtd || "0")}${moneyRow("Valor Vigentes", d.protestos?.vigentesValor || "0,00")}${row("Regularizados", d.protestos?.regularizadosQtd || "0")}</table>
${protestosDet.length > 0 ? `<div class="sub-heading">Detalhes</div><table class="dtable"><thead><tr><th>Data</th><th>Credor</th><th style="text-align:right">Valor</th><th>Status</th></tr></thead><tbody>${protestosDet.map(pp => `<tr><td>${esc(pp.data)}</td><td>${esc(pp.credor)}</td><td class="money">${esc(pp.valor)}</td><td>${pp.regularizado ? '<span class="badge badge-green">Reg.</span>' : '<span class="badge badge-red">Vigente</span>'}</td></tr>`).join("")}</tbody></table>` : ""}</div>

<!-- 06 PROCESSOS -->
<div class="section"><span class="sec-num">06</span><span class="sec-heading">Processos Judiciais</span><hr class="sec-rule">
${d.processos?.temRJ ? sectionWarning("RECUPERACAO JUDICIAL") : ""}
<table class="kv">${row("Passivos", d.processos?.passivosTotal || "0")}${row("Ativos", d.processos?.ativosTotal || "0")}${moneyRow("Valor Estimado", d.processos?.valorTotalEstimado || "0,00")}</table>
${distArr.length > 0 ? `<div class="sub-heading">Distribuicao</div><table class="dtable"><thead><tr><th>Tipo</th><th style="text-align:right">Qtd</th><th style="text-align:right">%</th></tr></thead><tbody>${distArr.map(dd => `<tr><td>${esc(dd.tipo)}</td><td class="money">${esc(dd.qtd)}</td><td class="money">${dd.pct ? esc(dd.pct) + "%" : "—"}</td></tr>`).join("")}</tbody></table>` : ""}
${bancArr.length > 0 ? `<div class="sub-heading">Bancarios</div><table class="dtable"><thead><tr><th>Banco</th><th>Assunto</th><th>Status</th><th>Data</th></tr></thead><tbody>${bancArr.map(b => `<tr><td>${esc(b.banco)}</td><td>${esc(b.assunto)}</td><td>${esc(b.status)}</td><td>${esc(b.data)}</td></tr>`).join("")}</tbody></table>` : ""}</div>

<!-- ALERTAS DETALHADOS -->
${alerts.length > 0 ? `<div class="section"><span class="sec-num">07</span><span class="sec-heading">Alertas Detalhados</span><hr class="sec-rule">${alerts.map(a => alertHtml(a)).join("")}</div>` : ""}

<!-- FOOTER -->
<div class="doc-footer"><span>capital financas — Consolidador de Documentos</span><span>Documento confidencial — uso restrito</span><span>Gerado em ${genDt}</span></div>

</div></body></html>`;
}
