/**
 * Seção 12 — IR DOS SÓCIOS
 * Dados patrimoniais por sócio, alertas de malhas/débitos, sociedades, coerência
 */
import type { PdfCtx } from "../context";
import {
  checkPageBreak, drawSectionTitle, drawSpacer,
  drawAlertDeduped, drawDetAlerts,
  fmtMoney, gerarAlertasIRSocios,
} from "../helpers";

export function renderSocios(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  if (!data.irSocios || data.irSocios.length === 0 || !data.irSocios.some((s: { nomeSocio?: string; anoBase?: string }) => s.nomeSocio || s.anoBase)) {
    return;
  }

  const alertasIR = gerarAlertasIRSocios(data.irSocios, new Date().getFullYear());

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 50);
  drawSectionTitle(ctx, "12", "IR DOS SOCIOS");

  for (let idx = 0; idx < data.irSocios.length; idx++) {
    const ir = data.irSocios[idx];
    if (!ir.nomeSocio && !ir.anoBase) continue;

    checkPageBreak(ctx, 60);

    // Separador entre sócios
    if (idx > 0) {
      doc.setDrawColor(...colors.border);
      doc.setLineWidth(0.3);
      doc.line(margin, pos.y, margin + contentW, pos.y);
      pos.y += 6;
    }

    // Header do sócio
    doc.setFillColor(240, 246, 255);
    doc.rect(margin, pos.y, contentW, 8, "F");
    doc.setFontSize(DS.font.bodySmall);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.primary);
    doc.text(`Sócio ${idx + 1} — ${ir.nomeSocio || "Nome não informado"}`, margin + 3, pos.y + 5.2);

    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    const cpfAno = [ir.cpf && `CPF: ${ir.cpf}`, ir.anoBase && `Ano-base: ${ir.anoBase}`]
      .filter(Boolean).join("   |   ");
    if (cpfAno) {
      doc.text(cpfAno, margin + contentW - 3, pos.y + 5.2, { align: "right" });
    }
    pos.y += 10;

    // Tipo do documento
    const tipoLabel = ir.tipoDocumento === "declaracao" ? "Declaração Completa" : "Recibo de Entrega";
    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...colors.textMuted);
    doc.text(`Documento: ${tipoLabel}`, margin + 3, pos.y);
    pos.y += 6;

    // Alertas de malhas e débitos
    if (ir.situacaoMalhas) {
      drawAlertDeduped(ctx, `Sócio ${ir.nomeSocio || ""} — Pendência de malhas fiscais na Receita Federal`.trim(), "ALTA");
    }
    if (ir.debitosEmAberto) {
      const _desc = ir.descricaoDebitos?.trim();
      const _debitosSubtitle = _desc && _desc.length < 100 && !_desc.toLowerCase().includes("constavam débitos") ? _desc : undefined;
      drawAlertDeduped(ctx,
        `Sócio ${ir.nomeSocio || ""} — Débitos em aberto perante a Receita Federal / PGFN`.trim(),
        "ALTA",
        _debitosSubtitle
      );
    }

    // Tabela de dados patrimoniais
    const linhasIR: { label: string; valor: string; bold?: boolean }[] = [
      { label: "Renda Total", valor: `R$ ${fmtMoney(ir.rendimentoTotal || "0,00")}` },
      { label: "Rendimentos Tributáveis", valor: `R$ ${fmtMoney(ir.rendimentosTributaveis || "0,00")}`, bold: true },
      { label: "Rendimentos Isentos", valor: `R$ ${fmtMoney(ir.rendimentosIsentos || "0,00")}` },
      { label: "Imposto Definido", valor: `R$ ${fmtMoney((ir as unknown as Record<string, string>).impostoDefinido || "0,00")}`, bold: true },
      { label: "Valor da Quota", valor: `R$ ${fmtMoney((ir as unknown as Record<string, string>).valorQuota || "0,00")}` },
      { label: "Total Bens e Direitos", valor: `R$ ${fmtMoney(ir.totalBensDireitos || "0,00")}`, bold: true },
      { label: "Dívidas e Ônus", valor: `R$ ${fmtMoney(ir.dividasOnus || "0,00")}` },
      { label: "Patrimônio Líquido", valor: `R$ ${fmtMoney(ir.patrimonioLiquido || "0,00")}`, bold: true },
    ];

    linhasIR.forEach((linha, i) => {
      const bg: [number, number, number] = i % 2 === 0 ? colors.zebraRow : colors.cardBg;
      doc.setFillColor(...bg);
      doc.rect(margin, pos.y, contentW, DS.space.tableRowH, "F");
      doc.setFontSize(DS.font.micro);
      doc.setFont("helvetica", linha.bold ? "bold" : "normal");
      doc.setTextColor(...colors.text);
      doc.text(linha.label, margin + 3, pos.y + 5.2);
      doc.text(linha.valor, margin + contentW - 3, pos.y + 5.2, { align: "right" });
      pos.y += DS.space.tableRowH;
    });

    pos.y += 4;

    // Participação em outras sociedades
    if (ir.temSociedades && ir.sociedades && ir.sociedades.length > 0) {
      doc.setFontSize(DS.font.micro);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doc.text("Participação em outras sociedades:", margin + 3, pos.y);
      pos.y += 5;
      ir.sociedades.forEach((soc: { razaoSocial?: string; cnpj?: string; participacao?: string }) => {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.text);
        doc.setFontSize(DS.font.micro);
        doc.text(
          `• ${soc.razaoSocial || "N/D"}${soc.cnpj ? ` — CNPJ: ${soc.cnpj}` : ""}${soc.participacao ? ` (${soc.participacao})` : ""}`,
          margin + 5,
          pos.y
        );
        pos.y += 4.5;
      });
      pos.y += 3;
    }

    // Indicador de coerência
    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "bold");
    if (ir.coerenciaComEmpresa) {
      doc.setTextColor(...colors.success);
      doc.text("✓ Renda compatível com o porte da empresa", margin + 3, pos.y);
    } else {
      doc.setTextColor(...colors.danger);
      doc.text("⚠ Renda incompatível com o porte da empresa", margin + 3, pos.y);
    }
    pos.y += 6;

    // Observações
    if (ir.observacoes) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(DS.font.micro);
      doc.setTextColor(...colors.textMuted);
      const obsLines = doc.splitTextToSize(ir.observacoes, contentW - 6);
      obsLines.forEach((l: string) => {
        doc.text(l, margin + 3, pos.y);
        pos.y += 4;
      });
      pos.y += 2;
    }
  }

  // Alertas determinísticos — IR Sócios
  if (alertasIR.length > 0) { drawSpacer(ctx, 4); drawDetAlerts(ctx, alertasIR); }

  pos.y += 6;
}
