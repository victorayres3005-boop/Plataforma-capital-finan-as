/**
 * Seção 10 — CURVA ABC (Concentração de Clientes)
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";

const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n7:  [26,  58, 107]  as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
  a5:  [212, 149,  10] as [number,number,number],
  a1:  [253, 243, 215] as [number,number,number],
  a0:  [254, 249, 236] as [number,number,number],
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

const mo = (v: string | number | null | undefined): string => {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseMoneyToNumber(String(v));
  if (!isFinite(n) || n === 0) return "—";
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}R$ ${fmtBR(a / 1_000_000, 2)}M`;
  if (a >= 1_000)     return `${s}R$ ${fmtBR(a / 1_000, 0)}k`;
  return `${s}R$ ${fmtBR(Math.round(a), 0)}`;
};

const tr = (s: string, n: number) => {
  const t = (s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

export function renderABC(ctx: PdfCtx): void {
  const { doc, pos, data, margin: ML, contentW: CW } = ctx;
  const abc = data.curvaABC;

  if (!abc || !abc.clientes || abc.clientes.length === 0) return;

  const GAP = 3.5;

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

  const icell = (
    x: number, y: number, w: number, h: number,
    label: string, value: string,
    bg: [number,number,number] = P.x0,
    bd: [number,number,number] = P.x1,
    valColor: [number,number,number] = P.n9,
  ) => {
    doc.setFillColor(...bg);
    doc.setDrawColor(...bd);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(...P.x4);
    doc.text(label.toUpperCase(), x + 4, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(value.length > 10 ? 7 : 10);
    doc.setTextColor(...valColor);
    doc.text(value || "—", x + 4, y + 14);
  };

  const alertRow = (sev: "alta"|"mod"|"info"|"ok", msg: string) => {
    const bg: [number,number,number] = sev==="alta"?P.r0:sev==="mod"?P.a0:sev==="ok"?P.g0:P.n0;
    const bd: [number,number,number] = sev==="alta"?P.r1:sev==="mod"?P.a1:sev==="ok"?P.g1:P.n1;
    const fg: [number,number,number] = sev==="alta"?P.r6:sev==="mod"?P.a5:sev==="ok"?P.g6:P.n7;
    const tag = sev==="alta"?"ALTA":sev==="mod"?"MOD":sev==="ok"?"OK":"INFO";
    const lines = doc.splitTextToSize(msg, CW - 26) as string[];
    const H = Math.max(8, lines.length * 4.5 + 5);
    checkPageBreak(ctx, H + 2);
    doc.setFillColor(...bg);
    doc.setDrawColor(...bd);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, pos.y, CW, H, 2, 2, "FD");
    const tw = doc.getTextWidth(tag);
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...fg);
    doc.setFillColor(...bd);
    doc.roundedRect(ML + 3, pos.y + (H-4.5)/2, tw+4, 4.5, 1, 1, "F");
    doc.text(tag, ML + 5, pos.y + H/2 + 1);
    doc.setFont("helvetica","normal"); doc.setFontSize(7);
    doc.text(lines, ML + tw + 10, pos.y + H/2 - (lines.length-1)*2.25 + 1);
    pos.y += H + 2.5;
  };

  stitle("10 · Concentração de Clientes (Curva ABC)");

  // KPI cards
  const top3pct = parseFloat(abc.concentracaoTop3 || "0");
  const top5pct = parseFloat(abc.concentracaoTop5 || "0");
  const totalCli = abc.totalClientesNaBase || abc.clientes.length;

  checkPageBreak(ctx, 22);
  {
    const CH = 18; const cw = (CW - GAP * 2) / 3; const y0 = pos.y;
    icell(ML,        y0, cw, CH, "Top 3 Clientes", top3pct > 0 ? fmtBR(top3pct,0)+"%" : "—",
      top3pct > 50 ? P.a0 : P.x0, top3pct > 50 ? P.a1 : P.x1, top3pct > 50 ? P.a5 : P.n9);
    icell(ML+cw+GAP, y0, cw, CH, "Top 5 Clientes", top5pct > 0 ? fmtBR(top5pct,0)+"%" : "—",
      top5pct > 70 ? P.a0 : P.x0, top5pct > 70 ? P.a1 : P.x1, top5pct > 70 ? P.a5 : P.n9);
    icell(ML+(cw+GAP)*2, y0, cw, CH, "Total Clientes", String(totalCli));
    pos.y = y0 + CH + 5;
  }

  // Table
  const shown = abc.clientes.slice(0, 10);
  const RH = 11; const HH = 9;
  const TH = HH + shown.length * RH + 8;
  checkPageBreak(ctx, TH + 6);
  const y0 = pos.y;

  doc.setFillColor(...P.x0);
  doc.setDrawColor(...P.x2);
  doc.setLineWidth(0.25);
  doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");

  // Header
  doc.setFillColor(...P.n9);
  doc.roundedRect(ML, y0, CW, HH, 2, 2, "F");
  doc.rect(ML, y0+3, CW, HH-3, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
  doc.text("#",           ML + 7.5,      y0 + 6.5, { align: "center" });
  doc.text("Cliente",     ML + 17,        y0 + 6.5);
  doc.text("Faturamento", ML + CW*0.60,  y0 + 6.5, { align: "right" });
  doc.text("% Rec.",      ML + CW*0.74,  y0 + 6.5, { align: "right" });
  doc.text("% Acum.",     ML + CW*0.87,  y0 + 6.5, { align: "right" });
  doc.text("Cl.",         ML + CW - 2,   y0 + 6.5, { align: "right" });

  const maxFat = Math.max(1, ...shown.map(c => parseMoneyToNumber(c.valorFaturado || "0")));

  // Compute cumulative percentages from scratch (spec: CALCULAR, not trust the data)
  let cumulPct = 0;

  shown.forEach((c, i) => {
    const ry = y0 + HH + i * RH;
    if (i % 2 !== 0) {
      doc.setFillColor(...P.wh);
    } else {
      doc.setFillColor(...P.x0);
    }
    doc.rect(ML, ry, CW, RH, "F");

    // Rank circle
    doc.setFillColor(...P.n8);
    doc.circle(ML + 7.5, ry + RH/2, 3.5, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text(String(i+1), ML + 7.5, ry + RH/2 + 1.5, { align: "center" });

    // Name + bar
    doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...P.x9);
    doc.text(tr(c.nome || "—", 30), ML + 14, ry + 5.5);
    const fat = parseMoneyToNumber(c.valorFaturado || "0");
    const barW = Math.max(fat / maxFat * (CW * 0.35), 1);
    doc.setFillColor(...P.n7);
    doc.roundedRect(ML + 14, ry + 7.5, barW, 1.5, 0.5, 0.5, "F");

    // Faturamento
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
    doc.text(mo(fat), ML + CW*0.60, ry + 6, { align: "right" });

    // % Rec
    const pct = parseFloat(c.percentualReceita || "0");
    doc.setFont("helvetica","bold"); doc.setTextColor(...P.x7);
    doc.text(fmtBR(pct, 1) + "%", ML + CW*0.74, ry + 6, { align: "right" });

    // % Acum
    cumulPct += pct;
    doc.setFont("helvetica","bold"); doc.setTextColor(...P.x7);
    doc.text(fmtBR(cumulPct, 1) + "%", ML + CW*0.87, ry + 6, { align: "right" });

    // Classe based on cumul
    const cl = cumulPct <= 80 ? "A" : cumulPct <= 95 ? "B" : "C";
    const cBg: [number,number,number] = cl==="A"?P.r1:cl==="B"?P.a1:P.x1;
    const cFg: [number,number,number] = cl==="A"?P.r6:cl==="B"?P.a5:P.x5;
    const clx = ML + CW - 2;
    doc.setFillColor(...cBg);
    doc.roundedRect(clx - 9, ry + 2, 9, 5, 1, 1, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...cFg);
    doc.text(cl, clx - 4.5, ry + 5.5, { align: "center" });

    doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
    doc.line(ML+2, ry+RH, ML+CW-2, ry+RH);
  });

  // Summary
  const sumY = y0 + TH - 6;
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...P.x5);
  doc.text(`Top 3: ${top3pct > 0 ? fmtBR(top3pct,0) : "—"}% · Top 5: ${top5pct > 0 ? fmtBR(top5pct,0) : "—"}% · Total clientes: ${totalCli}`, ML + 4, sumY);

  pos.y = y0 + TH + 5;

  // Alerts
  const top1 = shown[0];
  if (top1) {
    const top1pct = parseFloat(top1.percentualReceita || "0");
    if (top1pct > 30) alertRow("alta", `${tr(top1.nome || "Cliente 1", 35)} concentra ${fmtBR(top1pct,0)}% da receita — acima do limite recomendado de 20%`);
  }
  if (top3pct > 50) alertRow("mod", `Alta concentração — top 3 clientes = ${fmtBR(top3pct,0)}% da receita`);
}
