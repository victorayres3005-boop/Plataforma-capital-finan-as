/**
 * Seção 02 — CHECKLIST DE DOCUMENTOS
 * Mostra quais documentos foram coletados, com barra de progresso
 */
import type { PdfCtx } from "../context";
import { newPage, drawHeader, checkPageBreak } from "../helpers";

const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
  n7:  [26,  58, 107]  as [number,number,number],
  g6:  [ 22, 101,  58] as [number,number,number],
  g1:  [209, 250, 229] as [number,number,number],
  g0:  [236, 253, 245] as [number,number,number],
  x9:  [ 17,  24,  39] as [number,number,number],
  x7:  [ 55,  65,  81] as [number,number,number],
  x5:  [107, 114, 128] as [number,number,number],
  x4:  [156, 163, 175] as [number,number,number],
  x3:  [209, 213, 219] as [number,number,number],
  x2:  [229, 231, 235] as [number,number,number],
  x1:  [243, 244, 246] as [number,number,number],
  x0:  [249, 250, 251] as [number,number,number],
  wh:  [255, 255, 255] as [number,number,number],
  gl:  [115, 184,  21] as [number,number,number],
};

type DocDef = { label: string; obrigatorio: boolean; present: boolean };

export function renderIndice(ctx: PdfCtx): void {
  const { doc, pos, data, margin: ML, contentW: CW } = ctx;

  newPage(ctx);
  drawHeader(ctx);

  const stitle = (label: string) => {
    const y = pos.y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...P.x5);
    const up = label.toUpperCase();
    doc.text(up, ML, y + 3);
    const tw = doc.getTextWidth(up);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.3);
    doc.line(ML + tw + 2.5, y + 2.5, ML + CW, y + 2.5);
    pos.y += 7;
  };

  stitle("02 · Checklist de Documentos");

  // Build checklist
  const d = data;
  const docs: DocDef[] = [
    // Financeiros
    { label: "Cartão CNPJ",                obrigatorio: true,  present: !!(d.cnpj?.razaoSocial) },
    { label: "QSA / Quadro de Sócios",     obrigatorio: true,  present: !!(d.qsa?.quadroSocietario?.length) },
    { label: "Contrato Social",            obrigatorio: true,  present: !!(d.contrato?.objetoSocial || d.contrato?.capitalSocial) },
    { label: "Faturamento",                obrigatorio: true,  present: !!(d.faturamento?.meses?.length) },
    { label: "SCR / BACEN",                obrigatorio: true,  present: !!(d.scr?.periodoReferencia) },
    { label: "Protestos",                  obrigatorio: true,  present: !!(d.protestos) },
    { label: "Processos Judiciais",        obrigatorio: true,  present: !!(d.processos) },
    { label: "DRE",                        obrigatorio: false, present: !!(d.dre?.anos?.length) },
    { label: "Balanço Patrimonial",        obrigatorio: false, present: !!(d.balanco?.anos?.length) },
    { label: "Curva ABC — Top Clientes",   obrigatorio: false, present: !!(d.curvaABC?.clientes?.length) },
    { label: "IR dos Sócios",              obrigatorio: false, present: !!(d.irSocios?.length) },
    { label: "Relatório de Visita",        obrigatorio: false, present: !!(d.relatorioVisita?.dataVisita || d.relatorioVisita?.responsavelVisita) },
    { label: "SCR Período Anterior",       obrigatorio: false, present: !!(d.scrAnterior?.periodoReferencia) },
    { label: "Grupo Econômico",            obrigatorio: false, present: !!(d.grupoEconomico?.empresas?.length) },
    { label: "SCR dos Sócios",             obrigatorio: false, present: !!(d.scrSocios?.length) },
    { label: "Score / Bureau",             obrigatorio: false, present: !!(d.score?.serasa || d.score?.spc || d.score?.credithub) },
  ];

  const total     = docs.length;
  const received  = docs.filter(d => d.present).length;
  const pct       = Math.round(received / total * 100);

  // Progress bar
  checkPageBreak(ctx, 28);
  {
    const y0 = pos.y;
    const barW = CW;
    const barH = 5;

    // Background bar
    doc.setFillColor(...P.x2);
    doc.roundedRect(ML, y0, barW, barH, 1, 1, "F");
    // Fill
    const fillW = Math.max(barW * pct / 100, 1);
    doc.setFillColor(...P.gl);
    doc.roundedRect(ML, y0, fillW, barH, 1, 1, "F");

    // Percentage
    doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...P.n9);
    doc.text(`${pct}%`, ML, y0 + 18);
    const pctW = doc.getTextWidth(`${pct}%`);
    doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(...P.x5);
    doc.text(`${received} de ${total} documentos coletados`, ML + pctW + 3, y0 + 18);

    pos.y = y0 + 22;
  }

  // Doc list
  const ROW_H = 9;
  docs.forEach((item, i) => {
    checkPageBreak(ctx, ROW_H + 2);
    const y0 = pos.y;

    if (i % 2 === 0) {
      doc.setFillColor(...P.x0);
      doc.rect(ML, y0, CW, ROW_H, "F");
    }
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.15);
    doc.line(ML, y0 + ROW_H, ML + CW, y0 + ROW_H);

    // Icon
    const iconBg: [number,number,number] = item.present ? P.g1 : P.x1;
    const iconFg: [number,number,number] = item.present ? P.g6 : P.x4;
    doc.setFillColor(...iconBg);
    doc.roundedRect(ML, y0 + 2, 7, ROW_H - 4, 1, 1, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...iconFg);
    doc.text(item.present ? "✓" : "—", ML + 3.5, y0 + ROW_H/2 + 1.5, { align: "center" });

    // Label
    doc.setFont("helvetica", item.present ? "normal" : "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...(item.present ? P.x7 : P.x4));
    doc.text(item.label, ML + 10, y0 + ROW_H/2 + 1.5);

    // Badge OBR/OPC
    const badgeLabel = item.obrigatorio ? "OBR" : "OPC";
    const badgeBg: [number,number,number] = item.obrigatorio ? P.n1 : P.x1;
    const badgeFg: [number,number,number] = item.obrigatorio ? P.n8 : P.x5;
    doc.setFont("helvetica","bold"); doc.setFontSize(5.5);
    const bw = doc.getTextWidth(badgeLabel) + 6;
    doc.setFillColor(...badgeBg);
    doc.roundedRect(ML + CW - bw - 1, y0 + 2.5, bw, 4.5, 1, 1, "F");
    doc.setTextColor(...badgeFg);
    doc.text(badgeLabel, ML + CW - bw/2 - 1, y0 + 6, { align: "center" });

    pos.y = y0 + ROW_H;
  });

  pos.y += 5;
}
