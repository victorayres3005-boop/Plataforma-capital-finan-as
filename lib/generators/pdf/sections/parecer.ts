/**
 * Seção 04 — PARECER PRELIMINAR
 * Exibe o parecer da IA (resumo executivo, análise, fortes/fracos, perguntas)
 * Se não disponível, mostra card "pendente"
 */
import type { PdfCtx } from "../context";
import { newPage, drawHeader, checkPageBreak, drawJustifiedText } from "../helpers";

const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
  n7:  [26,  58, 107]  as [number,number,number],
  a5:  [212, 149,  10] as [number,number,number],
  a1:  [253, 243, 215] as [number,number,number],
  a0:  [255, 251, 235] as [number,number,number],
  r6:  [197,  48,  48] as [number,number,number],
  r1:  [254, 226, 226] as [number,number,number],
  r0:  [254, 242, 242] as [number,number,number],
  g6:  [ 22, 101,  58] as [number,number,number],
  g1:  [209, 250, 229] as [number,number,number],
  g0:  [236, 253, 245] as [number,number,number],
  x9:  [ 17,  24,  39] as [number,number,number],
  x7:  [ 55,  65,  81] as [number,number,number],
  x5:  [107, 114, 128] as [number,number,number],
  x4:  [156, 163, 175] as [number,number,number],
  x2:  [229, 231, 235] as [number,number,number],
  x1:  [243, 244, 246] as [number,number,number],
  x0:  [249, 250, 251] as [number,number,number],
  wh:  [255, 255, 255] as [number,number,number],
};

const tr = (s: string, n: number) => {
  const t = (s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

export function renderParecerSection(ctx: PdfCtx): void {
  const { doc, pos, params, aiAnalysis, margin: ML, contentW: CW } = ctx;
  const { decision, finalRating, pontosFortes, pontosFracos, resumoExecutivo } = params;
  const GAP = 3.5;

  const decRaw     = (decision || "PENDENTE").replace(/_/g," ").toUpperCase();
  const decAprov   = /APROV/i.test(decRaw) && !/CONDIC/i.test(decRaw);
  const decReprov  = /REPROV/i.test(decRaw);
  const dec        = decAprov ? "Tend. de Aprovação" : decReprov ? "Tend. de Reprovação" : /CONDIC/i.test(decRaw) ? "Tend. Condicional" : "Pendente";
  const decColor: [number,number,number] = decAprov ? P.g6 : decReprov ? P.r6 : P.a5;
  const decBg:    [number,number,number] = decAprov ? P.g1 : decReprov ? P.r1 : P.a1;
  const score      = finalRating || 0;
  const scoreColor: [number,number,number] = score >= 6.5 ? P.g6 : score >= 5 ? P.a5 : P.r6;

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

  newPage(ctx);
  drawHeader(ctx);

  // ── Banner da seção — navy900 full-width ───────────────────────────────────
  {
    const BH = 13;
    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, pos.y, CW, BH + 2, 2, 2, "F");
    doc.rect(ML, pos.y + 3, CW, BH - 1, "F");

    // Número em amber
    doc.setFont("courier", "bold"); doc.setFontSize(9); doc.setTextColor(...P.a5);
    doc.text("03", ML + 5, pos.y + BH - 1);
    const nw = doc.getTextWidth("03");

    // Divider
    doc.setDrawColor(...P.a5); doc.setLineWidth(0.5);
    doc.line(ML + 5 + nw + 3, pos.y + 4, ML + 5 + nw + 3, pos.y + BH - 2);

    // Title
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...P.wh);
    doc.text("PARECER PRELIMINAR", ML + 5 + nw + 7, pos.y + BH - 1);

    // Badge decisão (direita) + score
    const sR  = 5;
    const sCx = ML + CW - sR - 4;
    const sCy = pos.y + BH/2 + 1;
    doc.setDrawColor(...scoreColor); doc.setLineWidth(1.5);
    doc.circle(sCx, sCy, sR, "S");
    doc.setFont("courier","bold"); doc.setFontSize(7); doc.setTextColor(...scoreColor);
    doc.text(score.toFixed(1), sCx, sCy + 1.5, { align: "center" });

    doc.setFont("helvetica","bold"); doc.setFontSize(6.5);
    const dlbl = dec;
    const dw   = doc.getTextWidth(dlbl) + 8;
    doc.setFillColor(...decBg);
    doc.roundedRect(sCx - sR - dw - 5, pos.y + BH/2 - 2.5, dw, 6, 1.5, 1.5, "F");
    doc.setTextColor(...decColor);
    doc.text(dlbl, sCx - sR - dw/2 - 5, pos.y + BH/2 + 2, { align: "center" });

    pos.y += BH + 6;
  }

  if (!aiAnalysis && !resumoExecutivo) {
    // Pending card
    checkPageBreak(ctx, 30);
    doc.setFillColor(...P.x0);
    doc.setDrawColor(...P.x2);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, pos.y, CW, 28, 3, 3, "FD");
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...P.x4);
    doc.text("Parecer pendente — análise com IA não disponível", ML + CW/2, pos.y + 12, { align: "center" });
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...P.x4);
    doc.text("Clique em 'Analisar com IA' na plataforma para gerar o parecer", ML + CW/2, pos.y + 19, { align: "center" });
    pos.y += 33;
    return;
  }

  // Resumo executivo — estilo citação editorial
  const texto = (resumoExecutivo || "").trim();
  if (texto) {
    checkPageBreak(ctx, 30);
    const lines = doc.splitTextToSize(texto, CW - 20) as string[];
    const TH = Math.max(25, lines.length * 4.8 + 14);
    // Borda esquerda amber + fundo amber50
    doc.setFillColor(...P.a0);
    doc.setDrawColor(...P.a1);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, pos.y, CW, TH, 2, 2, "FD");
    // Barra esquerda amber
    doc.setFillColor(...P.a5);
    doc.rect(ML, pos.y + 2, 3, TH - 4, "F");
    // Texto itálico sobre o fundo amber
    doc.setFont("helvetica","italic"); doc.setFontSize(8.5); doc.setTextColor(...P.x7);
    drawJustifiedText(doc, lines, ML + 10, pos.y + 9, CW - 20, 4.8);

    pos.y += TH + 5;
  }

  // Pontos Fortes & Fracos
  const pf = pontosFortes.slice(0, 6);
  const pw = pontosFracos.slice(0, 6);
  if (pf.length > 0 || pw.length > 0) {
    checkPageBreak(ctx, 14);
    stitle("Análise");
    const rows   = Math.max(pf.length, pw.length, 1);
    const RH4    = 6.5; const HH4 = 8;
    const CARDH  = HH4 + rows * RH4 + 4;
    const hw     = (CW - GAP) / 2;

    checkPageBreak(ctx, CARDH + 8);
    const y0 = pos.y;

    doc.setFillColor(...P.g0); doc.setDrawColor(...P.g1); doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, hw, CARDH, 2, 2, "FD");
    doc.setFillColor(...P.g6);
    doc.roundedRect(ML, y0, hw, HH4, 2, 2, "F"); doc.rect(ML, y0+3, hw, HH4-3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("PONTOS FORTES", ML + 4, y0 + 5.8);
    pf.forEach((item, i) => {
      const iy = y0 + HH4 + i * RH4;
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
      doc.setTextColor(...P.g6); doc.text("✓", ML + 3, iy + 5);
      doc.setTextColor(...P.x7); doc.text(tr(item, 46), ML + 8, iy + 5);
      doc.setDrawColor(...P.g1); doc.setLineWidth(0.15);
      doc.line(ML + 2, iy + RH4, ML + hw - 2, iy + RH4);
    });

    const fx = ML + hw + GAP;
    doc.setFillColor(...P.r0); doc.setDrawColor(...P.r1);
    doc.roundedRect(fx, y0, hw, CARDH, 2, 2, "FD");
    doc.setFillColor(...P.r6);
    doc.roundedRect(fx, y0, hw, HH4, 2, 2, "F"); doc.rect(fx, y0+3, hw, HH4-3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("PONTOS FRACOS", fx + 4, y0 + 5.8);
    pw.forEach((item, i) => {
      const iy = y0 + HH4 + i * RH4;
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
      doc.setTextColor(...P.r6); doc.text("✕", fx + 3, iy + 5);
      doc.setTextColor(...P.x7); doc.text(tr(item, 46), fx + 8, iy + 5);
      doc.setDrawColor(...P.r1); doc.setLineWidth(0.15);
      doc.line(fx + 2, iy + RH4, fx + hw - 2, iy + RH4);
    });

    pos.y = y0 + CARDH + 5;
  }

  // Perguntas para visita
  const perguntas = params.perguntasVisita || [];
  if (perguntas.length > 0) {
    checkPageBreak(ctx, 14);
    stitle("Perguntas para Visita");
    const RHp = 6.5; const Hp = perguntas.length * RHp + 8;
    checkPageBreak(ctx, Hp + 4);
    const y0 = pos.y;
    doc.setFillColor(...P.n0); doc.setDrawColor(...P.n1); doc.setLineWidth(0.25);
    doc.roundedRect(ML, y0, CW, Hp, 2, 2, "FD");
    perguntas.slice(0, 8).forEach((pq, i) => {
      const iy = y0 + 5 + i * RHp;
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.n7);
      doc.text(`${i+1}.`, ML + 4, iy + 4);
      doc.setFont("helvetica","normal"); doc.setTextColor(...P.x7);
      doc.text(tr(pq.pergunta || String(pq), 80), ML + 10, iy + 4);
    });
    pos.y = y0 + Hp + 5;
  }

  void GAP;
}
