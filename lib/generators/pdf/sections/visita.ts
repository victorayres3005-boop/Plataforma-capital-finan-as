/**
 * Seção 13 — RELATÓRIO DE VISITA
 * Cabeçalho, checklist, pontos positivos/atenção, recomendação, observações livres,
 * parâmetros operacionais, dados da empresa
 */
import type { PdfCtx } from "../context";
import {
  checkPageBreak, drawSectionTitle, drawSpacer, dsMiniHeader,
} from "../helpers";

export function renderVisita(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;
  const rv = data.relatorioVisita;

  if (!rv || (
    !rv.dataVisita &&
    !rv.responsavelVisita &&
    !rv.descricaoEstrutura &&
    !rv.observacoesLivres &&
    (!rv.pontosPositivos || rv.pontosPositivos.length === 0) &&
    (!rv.pontosAtencao || rv.pontosAtencao.length === 0)
  )) {
    return;
  }

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 55);
  drawSectionTitle(ctx, "13", "RELATORIO DE VISITA");
  pos.y += 8;

  // Cabeçalho da visita
  doc.setFontSize(DS.font.caption);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...colors.text);
  doc.text(`Data: ${rv.dataVisita || "—"}   |   Responsavel: ${rv.responsavelVisita || "—"}   |   Duracao: ${rv.duracaoVisita || "—"}`, margin + 2, pos.y);
  pos.y += 6;
  doc.text(`Local: ${rv.localVisita || "—"}`, margin + 2, pos.y);
  pos.y += 8;

  // Checklist
  const checklist = [
    { label: "Estrutura fisica confirmada no endereco", ok: rv.estruturaFisicaConfirmada },
    { label: "Operacao compativel com faturamento declarado", ok: rv.operacaoCompativelFaturamento },
    { label: "Estoque visivel no local", ok: rv.estoqueVisivel },
    { label: "Maquinas e equipamentos observados", ok: rv.maquinasEquipamentos },
    { label: "Socios presentes durante a visita", ok: rv.presencaSocios },
  ];

  checklist.forEach((item, i) => {
    const bg: [number, number, number] = i % 2 === 0 ? colors.zebraRow : colors.cardBg;
    doc.setFillColor(...bg);
    doc.rect(margin, pos.y, contentW, DS.space.tableRowH, "F");
    doc.setFontSize(DS.font.micro);
    const itemColor: [number, number, number] = item.ok ? colors.success : colors.danger;
    doc.setTextColor(...itemColor);
    doc.text(item.ok ? "+" : "x", margin + 3, pos.y + 5.2);
    doc.setTextColor(...colors.text);
    doc.text(item.label, margin + 10, pos.y + 5.2);
    pos.y += DS.space.tableRowH;
  });

  pos.y += 4;

  // Pontos positivos
  if (rv.pontosPositivos?.length > 0) {
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.primary);
    doc.text("Pontos Positivos:", margin + 2, pos.y);
    pos.y += 5;
    rv.pontosPositivos.forEach((p: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(DS.font.micro);
      doc.setTextColor(...colors.success);
      doc.text(`+ ${p}`, margin + 4, pos.y);
      pos.y += 4.5;
    });
    pos.y += 2;
  }

  // Pontos de atenção
  if (rv.pontosAtencao?.length > 0) {
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.primary);
    doc.text("Pontos de Atencao:", margin + 2, pos.y);
    pos.y += 5;
    rv.pontosAtencao.forEach((p: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(DS.font.micro);
      doc.setTextColor(...colors.danger);
      doc.text(`! ${p}`, margin + 4, pos.y);
      pos.y += 4.5;
    });
    pos.y += 2;
  }

  // Recomendação
  pos.y += 4;
  const recCor: [number, number, number] = rv.recomendacaoVisitante === "aprovado" ? colors.success :
    rv.recomendacaoVisitante === "condicional" ? colors.warning : colors.danger;
  doc.setFillColor(...recCor);
  doc.roundedRect(margin, pos.y, contentW, 9, 1, 1, "F");
  doc.setFontSize(DS.font.bodySmall);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const recTexto = rv.recomendacaoVisitante === "aprovado" ? "Recomendação do visitante: Aprovado" :
    rv.recomendacaoVisitante === "condicional" ? "Recomendação do visitante: Condicional" :
      "Recomendação do visitante: Reprovado";
  doc.text(recTexto, margin + 4, pos.y + 6);
  pos.y += 11;

  // Observações livres
  if (rv.observacoesLivres) {
    pos.y += 12;
    checkPageBreak(ctx, 16);
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.textMuted);
    doc.text("Observações:", margin + 2, pos.y);
    pos.y += 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(DS.font.micro);
    doc.setTextColor(...colors.text);
    const obsLines = doc.splitTextToSize(rv.observacoesLivres, contentW - 6);
    obsLines.forEach((l: string) => { checkPageBreak(ctx, 5); doc.text(l, margin + 2, pos.y); pos.y += 4.5; });
    pos.y += 4;
  }

  // ── Parâmetros Operacionais ──
  const rvR = rv as unknown as Record<string, string | undefined>;
  const temParamsOp = [
    rvR.taxaConvencional, rvR.taxaComissaria, rvR.limiteTotal, rvR.limiteConvencional,
    rvR.limiteComissaria, rvR.limitePorSacado, rvR.ticketMedio, rvR.valorCobrancaBoleto,
    rvR.prazoRecompraCedente, rvR.prazoEnvioCartorio, rvR.prazoMaximoOp, rvR.cobrancaTAC,
    rvR.tranche, rvR.prazoTranche,
  ].some(v => v && v.trim() !== "");

  const temDadosEmpresa = [
    rvR.folhaPagamento, rvR.endividamentoBanco, rvR.endividamentoFactoring,
    rvR.vendasCheque, rvR.vendasDuplicata, rvR.vendasOutras,
    rvR.prazoMedioFaturamento, rvR.prazoMedioEntrega, rvR.referenciasFornecedores,
  ].some(v => v && v.trim() !== "");

  const drawOpTable = (rows: [string, string][]) => {
    const colLW = 90;
    const colRW = contentW - colLW;
    rows.forEach(([label, value], i) => {
      checkPageBreak(ctx, DS.space.tableRowH);
      const bg: [number, number, number] = i % 2 === 0 ? colors.zebraRow : colors.cardBg;
      doc.setFillColor(...bg);
      doc.rect(margin, pos.y, contentW, DS.space.tableRowH, "F");
      doc.setFontSize(DS.font.micro);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.textMuted);
      doc.text(label, margin + 3, pos.y + 5.2);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.text);
      doc.text(value || "—", margin + colLW, pos.y + 5.2, { maxWidth: colRW - 4 });
      pos.y += DS.space.tableRowH;
    });
    pos.y += 3;
  };

  if (temParamsOp) {
    checkPageBreak(ctx, 20);
    pos.y += 6;
    dsMiniHeader(ctx, 'PARAMETROS OPERACIONAIS');
    drawOpTable([
      ["Taxa Convencional", rvR.taxaConvencional || ""],
      ["Taxa Comissaria", rvR.taxaComissaria || ""],
      ["Limite Total", rvR.limiteTotal ? `R$ ${rvR.limiteTotal}` : ""],
      ["Limite Convencional", rvR.limiteConvencional ? `R$ ${rvR.limiteConvencional}` : ""],
      ["Limite Comissaria", rvR.limiteComissaria ? `R$ ${rvR.limiteComissaria}` : ""],
      ["Limite por Sacado", rvR.limitePorSacado ? `R$ ${rvR.limitePorSacado}` : ""],
      ["Ticket Medio", rvR.ticketMedio ? `R$ ${rvR.ticketMedio}` : ""],
      ["Valor Cobranca de Boleto", rvR.valorCobrancaBoleto ? `R$ ${rvR.valorCobrancaBoleto}` : ""],
      ["Cond. Cobranca — Prazo de Recompra (Cedente)", rvR.prazoRecompraCedente ? `${rvR.prazoRecompraCedente} dias` : ""],
      ["Cond. Cobranca — Envio para Cartorio em", rvR.prazoEnvioCartorio ? `${rvR.prazoEnvioCartorio} dias` : ""],
      ["Prazo Maximo", rvR.prazoMaximoOp ? `${rvR.prazoMaximoOp} dias` : ""],
      ["Cobranca de TAC", rvR.cobrancaTAC || ""],
      ["Tranche", rvR.tranche ? `R$ ${rvR.tranche}` : ""],
      ["Prazo em Tranche", rvR.prazoTranche ? `${rvR.prazoTranche} dias` : ""],
    ]);
  }

  if (temDadosEmpresa) {
    checkPageBreak(ctx, 20);
    pos.y += 2;
    dsMiniHeader(ctx, 'DADOS DA EMPRESA');
    drawOpTable([
      ["Numero de Funcionarios", String(rv.funcionariosObservados || "")],
      ["Folha de Pagamento", rvR.folhaPagamento ? `R$ ${rvR.folhaPagamento}` : ""],
      ["Endividamento Banco", rvR.endividamentoBanco || ""],
      ["Endividamento Factoring/FIDC", rvR.endividamentoFactoring ? `R$ ${rvR.endividamentoFactoring}` : ""],
      ["Vendas (Cheque)", rvR.vendasCheque || ""],
      ["Vendas (Duplicata)", rvR.vendasDuplicata || ""],
      ["Vendas (Outras)", rvR.vendasOutras || ""],
      ["Prazo Medio de Faturamento", rvR.prazoMedioFaturamento ? `${rvR.prazoMedioFaturamento} dias` : ""],
      ["Prazo Medio de Entrega das Mercadorias", rvR.prazoMedioEntrega ? `${rvR.prazoMedioEntrega} dias` : ""],
      ["Referencias Comerciais / Fornecedores", rvR.referenciasFornecedores || ""],
    ]);
  }
}
