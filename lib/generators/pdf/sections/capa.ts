import type { PdfCtx } from "../context";
import { newPage } from "../helpers";

export function renderCapa(ctx: PdfCtx): void {
  const { doc, DS, params, data, W, margin, contentW } = ctx;
  const { decision, finalRating } = params;
  const colors = DS.colors;

  newPage(ctx);

  // ══════════════════════════════════════════════════════════════════════════
  // CAPA COMPACTA — ocupa ~1/3 da página (100mm) para dar espaço ao índice
  // ══════════════════════════════════════════════════════════════════════════

  const capaH = 95;

  // Navy background
  doc.setFillColor(...colors.navy);
  doc.rect(0, 0, W, capaH, "F");

  // Green accent top line
  doc.setFillColor(...colors.accentRGB);
  doc.rect(0, 0, W, 2, "F");

  // Decorative circles (subtle)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.15);
  doc.circle(175, 20, 30);
  doc.circle(35, 75, 18);
  doc.setLineWidth(0.1);

  // Brand: capital finanças
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("CAPITAL", margin, 16);
  doc.setTextColor(...colors.accentRGB);
  doc.text("FINANÇAS", margin + doc.getTextWidth("CAPITAL "), 16);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text("ANÁLISE DE CEDENTE — FIDC", margin, 22);

  // Date top-right
  const coverDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(coverDate, W - margin, 16, { align: "right" });

  // Divider line
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.08);
  doc.line(margin, 28, W - margin, 28);

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Relatório de Due Diligence", margin, 42);

  // Company name
  if (data.cnpj?.razaoSocial) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.accentRGB);
    const nameLines = doc.splitTextToSize(data.cnpj.razaoSocial, contentW * 0.7);
    doc.text(nameLines[0] || "", margin, 54);
  }

  // CNPJ
  if (data.cnpj?.cnpj) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("CNPJ: " + data.cnpj.cnpj, margin, 62);
  }

  // Decision badge + Rating (right side)
  {
    const decC: [number, number, number] = decision === "APROVADO" ? [22, 163, 74]
      : decision === "REPROVADO" ? [220, 38, 38]
      : [217, 119, 6];
    const decBg: [number, number, number] = decision === "APROVADO" ? [220, 252, 231]
      : decision === "REPROVADO" ? [254, 226, 226]
      : [254, 243, 199];

    // Decision pill
    const decLabel = decision.replace(/_/g, " ");
    doc.setFontSize(9);
    const pillW = doc.getTextWidth(decLabel) + 14;
    const pillX = W - margin - pillW;
    doc.setFillColor(...decBg);
    doc.roundedRect(pillX, 36, pillW, 8, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...decC);
    doc.text(decLabel, pillX + pillW / 2, 41.5, { align: "center" });

    // Rating
    const rc: [number, number, number] = finalRating >= 7 ? [22, 163, 74] : finalRating >= 4 ? [245, 158, 11] : [239, 68, 68];
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...rc);
    doc.text(String(finalRating), W - margin - 22, 62);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text("/ 10", W - margin - 6, 62);

    const riskLabel = finalRating >= 7 ? "BAIXO RISCO" : finalRating >= 4 ? "RISCO MODERADO" : "ALTO RISCO";
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...rc);
    doc.text(riskLabel, W - margin - 14, 68, { align: "center" });
  }

  // Bottom bar
  doc.setFillColor(0, 0, 0);
  doc.rect(0, capaH - 12, W, 12, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 130, 180);
  doc.text("Documento confidencial — uso exclusivamente interno", margin, capaH - 4.5);
  doc.text("Capital Finanças · " + coverDate, W - margin, capaH - 4.5, { align: "right" });

  // Green accent bottom
  doc.setFillColor(...colors.accentRGB);
  doc.rect(0, capaH, W, 1.5, "F");

  ctx.pos.y = capaH + 6;
}
