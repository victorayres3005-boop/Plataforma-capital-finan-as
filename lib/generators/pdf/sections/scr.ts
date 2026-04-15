/**
 * Seção 14 — COMPARATIVO SCR — EMPRESA (PJ)
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";

const P = {
  n9:  [12,  27,  58]  as [number,number,number],
  n8:  [19,  41,  82]  as [number,number,number],
  n0:  [238, 243, 251] as [number,number,number],
  n1:  [220, 230, 245] as [number,number,number],
  n7:  [26,  58, 107]  as [number,number,number],
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

export function renderSCR(ctx: PdfCtx): void {
  const { doc, pos, params, data, margin: ML, contentW: CW } = ctx;
  const scr    = data.scr;
  const scrAnt = data.scrAnterior;
  const hasAnt = !!(scrAnt && scrAnt.periodoReferencia);

  if (!scr) return;

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

  stitle("14 · Comparativo SCR — Empresa (PJ)");

  // Info line
  checkPageBreak(ctx, 10);
  if (hasAnt) {
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...P.x5);
    doc.text(`Período anterior: `, ML, pos.y + 5);
    const lw = doc.getTextWidth("Período anterior: ");
    doc.setFont("helvetica","bold"); doc.setTextColor(...P.x9);
    doc.text(scrAnt!.periodoReferencia || "Anterior", ML + lw, pos.y + 5);
    const sep = doc.getTextWidth(scrAnt!.periodoReferencia || "Anterior") + lw;
    doc.setFont("helvetica","normal"); doc.setTextColor(...P.x5);
    doc.text(` · Período atual: `, ML + sep, pos.y + 5);
    const sep2 = sep + doc.getTextWidth(" · Período atual: ");
    doc.setFont("helvetica","bold"); doc.setTextColor(...P.x9);
    doc.text(scr.periodoReferencia || "Atual", ML + sep2, pos.y + 5);
    pos.y += 10;
  }

  // Table
  const RH = 8; const HH = 9;

  type SCRRow = {
    label: string;
    cat: string;
    cur: number;
    ant: number | null;
    isTotal?: boolean;
    /** true = redução é RUIM (limite) */
    invertColor?: boolean;
    isCount?: boolean;
  };

  const n = (v: string | undefined | null) => v ? parseMoneyToNumber(v) : 0;
  const ni = (v: string | undefined | null) => v ? (parseInt(v) || 0) : 0;

  const fmm12m = (() => {
    const f = data.faturamento?.fmm12m ? parseMoneyToNumber(data.faturamento.fmm12m) : 0;
    if (f > 0) return f;
    const meses = (data.faturamento?.meses || []).slice(-12);
    const s = meses.reduce((acc, m) => acc + parseMoneyToNumber(m.valor||"0"), 0);
    return meses.length > 0 ? s / meses.length : 0;
  })();
  const alav = fmm12m > 0 ? n(scr.totalDividasAtivas) / fmm12m : 0;
  const alavAnt = (hasAnt && fmm12m > 0) ? n(scrAnt!.totalDividasAtivas) / fmm12m : null;

  const rows: SCRRow[] = [
    { label: "Curto Prazo",       cat: "Carteira",      cur: n(scr.carteiraCurtoPrazo || scr.carteiraAVencer),  ant: hasAnt ? n(scrAnt!.carteiraCurtoPrazo || scrAnt!.carteiraAVencer) : null },
    { label: "Longo Prazo",       cat: "Carteira",      cur: n(scr.carteiraLongoPrazo),                          ant: hasAnt ? n(scrAnt!.carteiraLongoPrazo) : null },
    { label: "A Vencer",          cat: "Carteira",      cur: n(scr.operacoesAVencer || scr.carteiraAVencer),    ant: hasAnt ? n(scrAnt!.operacoesAVencer || scrAnt!.carteiraAVencer) : null },
    { label: "Vencidos",          cat: "Inadimplência", cur: n(scr.vencidos),                                    ant: hasAnt ? n(scrAnt!.vencidos) : null },
    { label: "Prejuízos",         cat: "Inadimplência", cur: n(scr.prejuizos),                                   ant: hasAnt ? n(scrAnt!.prejuizos) : null },
    { label: "Limite Crédito",    cat: "Capacidade",    cur: n(scr.limiteCredito),                               ant: hasAnt ? n(scrAnt!.limiteCredito) : null, invertColor: true },
    { label: "Nº IFs",            cat: "Capacidade",    cur: ni(scr.qtdeInstituicoes),                           ant: hasAnt ? ni(scrAnt!.qtdeInstituicoes) : null, isCount: true },
    { label: "Nº Operações",      cat: "Capacidade",    cur: ni(scr.qtdeOperacoes),                              ant: hasAnt ? ni(scrAnt!.qtdeOperacoes) : null, isCount: true },
    { label: "Total Dívidas",     cat: "Resumo",        cur: n(scr.totalDividasAtivas),                          ant: hasAnt ? n(scrAnt!.totalDividasAtivas) : null, isTotal: true },
    { label: "Alavancagem",       cat: "Resumo",        cur: alav,                                               ant: alavAnt, isTotal: true, isCount: true },
  ];

  const cols: {label:string;x:number;align:"left"|"right"}[] = [
    { label: "Métrica",    x: 4,        align: "left" },
    { label: "Categoria",  x: CW*0.37,  align: "left" },
  ];
  if (hasAnt) {
    cols.push(
      { label: scrAnt!.periodoReferencia||"Anterior", x: CW*0.56,  align: "right" },
      { label: scr.periodoReferencia||"Atual",        x: CW*0.76,  align: "right" },
      { label: "Var.",     x: CW - 2,   align: "right" },
    );
  } else {
    cols.push({ label: scr.periodoReferencia||"Atual", x: CW*0.76, align: "right" });
  }

  const TH = HH + rows.length * RH + 2;
  checkPageBreak(ctx, TH + 6);
  const y0 = pos.y;

  doc.setFillColor(...P.wh);
  doc.setDrawColor(...P.x2);
  doc.setLineWidth(0.25);
  doc.roundedRect(ML, y0, CW, TH, 2, 2, "FD");

  // Header
  doc.setFillColor(...P.n9);
  doc.roundedRect(ML, y0, CW, HH, 2, 2, "F");
  doc.rect(ML, y0+3, CW, HH-3, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
  cols.forEach(c => {
    if (c.align === "right") doc.text(c.label, ML + c.x, y0 + 6.5, { align: "right" });
    else doc.text(c.label, ML + c.x, y0 + 6.5);
  });

  rows.forEach((r, i) => {
    const ry = y0 + HH + i * RH;
    if (r.isTotal) {
      doc.setFillColor(...P.n0);
    } else if (i % 2 === 0) {
      doc.setFillColor(...P.x0);
    } else {
      doc.setFillColor(...P.wh);
    }
    doc.rect(ML, ry, CW, RH, "F");

    doc.setFont("helvetica", r.isTotal ? "bold" : "normal");
    doc.setFontSize(7);
    doc.setTextColor(...(r.isTotal ? P.n9 : P.x7));
    doc.text(r.label, ML + 4, ry + 6);

    doc.setFont("helvetica","normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...P.x4);
    doc.text(r.cat, ML + CW*0.37, ry + 6);

    const fmtVal = (v: number) => {
      if (v === 0) return "—";
      if (r.isCount) return fmtBR(v, v < 10 ? 1 : 0);
      return mo(v);
    };

    if (hasAnt) {
      // Anterior
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
      doc.text(r.ant !== null ? fmtVal(r.ant) : "—", ML + CW*0.56, ry + 6, { align: "right" });
      // Atual
      doc.text(fmtVal(r.cur), ML + CW*0.76, ry + 6, { align: "right" });
      // Variation
      if (r.ant !== null && r.ant > 0 && r.cur > 0) {
        const vp = (r.cur - r.ant) / r.ant * 100;
        const isGood = r.invertColor ? vp > 0 : vp < 0;
        const vc: [number,number,number] = isGood ? P.g6 : P.r6;
        doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...vc);
        doc.text((vp > 0 ? "+" : "") + fmtBR(vp, 0) + "%", ML + CW - 2, ry + 6, { align: "right" });
      } else {
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x4);
        doc.text("—", ML + CW - 2, ry + 6, { align: "right" });
      }
    } else {
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
      doc.text(fmtVal(r.cur), ML + CW*0.76, ry + 6, { align: "right" });
    }

    doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
    doc.line(ML+2, ry+RH, ML+CW-2, ry+RH);
  });

  pos.y = y0 + TH + 5;

  // Alerts
  const vencidos = n(scr.vencidos);
  const limiteAt = n(scr.limiteCredito);
  const limiteAn = hasAnt ? n(scrAnt!.limiteCredito) : null;
  const ifs = ni(scr.qtdeInstituicoes);

  if (vencidos > 0) alertRow("alta", `SCR com ${mo(vencidos)} em operações vencidas`);
  if (limiteAn && limiteAt > 0 && limiteAn > 0) {
    const drop = (limiteAn - limiteAt) / limiteAn * 100;
    if (drop > 30) alertRow("mod", `Limite de crédito reduzido em ${fmtBR(drop,0)}%`);
  }
  if (ifs === 0) alertRow("alta", "Empresa sem relacionamento bancário ativo (0 IFs)");

  void params;
}
