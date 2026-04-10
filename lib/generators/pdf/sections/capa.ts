import type { PdfCtx } from "../context";
import { newPage } from "../helpers";

export function renderCapa(ctx: PdfCtx): void {
  const { doc, DS, params, data, W } = ctx;
  const { decision, finalRating } = params;
  const colors = DS.colors;

  newPage(ctx);

  // Navy full-page background
  doc.setFillColor(...colors.navy);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(...colors.accentRGB);
  doc.rect(0, 0, 210, 3, "F");

  // Decorative circles
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.circle(160, 50, 40);
  doc.circle(50, 250, 30);

  // Logo circle
  doc.setLineWidth(2);
  doc.circle(W / 2, 65, 18);
  doc.setFillColor(255, 255, 255);
  doc.circle(W / 2, 84, 3, "F");

  // Brand name
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const capW2 = doc.getTextWidth("capital");
  doc.text("capital", W / 2 - (capW2 + doc.getTextWidth("financas") + 2) / 2, 105);
  doc.setTextColor(...colors.accentRGB);
  doc.text("financas", W / 2 - (capW2 + doc.getTextWidth("financas") + 2) / 2 + capW2 + 2, 105);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 240);
  doc.text("CONSOLIDADOR DE DOCUMENTOS", W / 2, 116, { align: "center" });

  // Accent divider
  doc.setFillColor(...colors.accentRGB);
  doc.rect(W / 2 - 30, 123, 60, 1.5, "F");

  // Title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Relatorio de", W / 2, 145, { align: "center" });
  doc.text("Due Diligence", W / 2, 156, { align: "center" });

  // Company name
  if (data.cnpj?.razaoSocial) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.accentRGB);
    doc.text(data.cnpj.razaoSocial.substring(0, 50), W / 2, 175, { align: "center" });
  }

  // CNPJ
  if (data.cnpj?.cnpj) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 240);
    doc.text("CNPJ: " + data.cnpj.cnpj, W / 2, 184, { align: "center" });
  }

  // Date
  const coverDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.setFontSize(9);
  doc.setTextColor(140, 170, 220);
  doc.text("Gerado em " + coverDate, W / 2, 198, { align: "center" });

  // Decision badge
  {
    const decC: [number, number, number] = decision === "APROVADO" ? [22, 163, 74]
      : decision === "REPROVADO" ? [220, 38, 38]
      : [217, 119, 6];
    const decBg: [number, number, number] = decision === "APROVADO" ? [220, 252, 231]
      : decision === "REPROVADO" ? [254, 226, 226]
      : [254, 243, 199];

    const badgeW = 80; const badgeH = 14;
    const badgeX = W / 2 - badgeW / 2;
    const badgeY = 210;

    doc.setFillColor(...decBg);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...decC);
    doc.text(decision.replace(/_/g, " "), W / 2, badgeY + 9, { align: "center" });

    // Rating sub-text
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 170, 220);
    const ratingLabel = finalRating >= 8 ? "Excelente" : finalRating >= 6.5 ? "Satisfatório" : finalRating >= 5 ? "Moderado" : "Alto Risco";
    doc.text(`Score: ${finalRating}/10 — ${ratingLabel}`, W / 2, 232, { align: "center" });
  }

  // Confidential footer
  doc.setFontSize(7);
  doc.setTextColor(100, 140, 200);
  doc.text("Documento confidencial — uso restrito", W / 2, 280, { align: "center" });

  doc.setFillColor(...colors.accentRGB);
  doc.rect(0, 294, 210, 3, "F");
}
