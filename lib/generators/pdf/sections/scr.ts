/**
 * Seção 14 — COMPARATIVO SCR — EMPRESA (PJ)
 * Fiel ao HTML de referência secoes-restantes-estetica-v3.html
 */
import type { PdfCtx } from "../context";
import { checkPageBreak, parseMoneyToNumber, fmtBR } from "../helpers";
import { calcScrTotal } from "@/lib/scrTotal";

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
  } else if (data.scrSandboxSemHistorico) {
    doc.setFont("helvetica","italic"); doc.setFontSize(6.5); doc.setTextColor(...P.x5);
    doc.text(`Período: ${scr.periodoReferencia || "Atual"} · Comparativo histórico requer credenciais de produção DataBox360`, ML, pos.y + 4);
    pos.y += 8;
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
  // SCR Total via helper único: soma carteira+vencidos+prejuízos. O campo
  // `totalDividasAtivas` da fonte é usado só como fallback porque algumas
  // origens (DataBox360) o populam sem prejuízos. Caso CRAVINFOODS 2026-05-04.
  const scrTotalAtual = calcScrTotal(scr);
  const scrTotalAnt   = hasAnt ? calcScrTotal(scrAnt) : 0;
  const alav = ctx.params.alavancagem ?? (fmm12m > 0 ? scrTotalAtual / fmm12m : 0);
  const alavAnt = (hasAnt && fmm12m > 0) ? scrTotalAnt / fmm12m : null;

  const rows: SCRRow[] = [
    { label: "Curto Prazo",       cat: "Carteira",      cur: n(scr.carteiraCurtoPrazo || scr.carteiraAVencer),  ant: hasAnt ? n(scrAnt!.carteiraCurtoPrazo || scrAnt!.carteiraAVencer) : null },
    { label: "Longo Prazo",       cat: "Carteira",      cur: n(scr.carteiraLongoPrazo),                          ant: hasAnt ? n(scrAnt!.carteiraLongoPrazo) : null },
    { label: "A Vencer",          cat: "Carteira",      cur: n(scr.operacoesAVencer || scr.carteiraAVencer),    ant: hasAnt ? n(scrAnt!.operacoesAVencer || scrAnt!.carteiraAVencer) : null },
    { label: "Vencidos",          cat: "Inadimplência", cur: n(scr.vencidos),                                    ant: hasAnt ? n(scrAnt!.vencidos) : null },
    { label: "Prejuízos",         cat: "Inadimplência", cur: n(scr.prejuizos),                                   ant: hasAnt ? n(scrAnt!.prejuizos) : null },
    { label: "Limite Crédito",    cat: "Capacidade",    cur: n(scr.limiteCredito),                               ant: hasAnt ? n(scrAnt!.limiteCredito) : null, invertColor: true },
    { label: "Nº IFs",            cat: "Capacidade",    cur: ni(scr.qtdeInstituicoes),                           ant: hasAnt ? ni(scrAnt!.qtdeInstituicoes) : null, isCount: true },
    { label: "Nº Operações",      cat: "Capacidade",    cur: ni(scr.qtdeOperacoes),                              ant: hasAnt ? ni(scrAnt!.qtdeOperacoes) : null, isCount: true },
    { label: "Total Dívidas",     cat: "Resumo",        cur: scrTotalAtual,                                       ant: hasAnt ? scrTotalAnt : null, isTotal: true },
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

  // ── Fonte / badge DataBox360 ────────────────────────────────────────────────
  if (scr.fonteBureau) {
    checkPageBreak(ctx, 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...P.x4);
    const badge = `Fonte: ${scr.fonteBureau} (API SCR/BCB)`;
    doc.text(badge, ML, pos.y + 4);
    pos.y += 7;
  }

  // ── Faixas de Vencimento ────────────────────────────────────────────────────
  const fv = scr.faixasAVencer;
  const fvAnt = scrAnt?.faixasAVencer;
  if (fv) {
    checkPageBreak(ctx, 50);
    stitle("Faixas de Vencimento — Carteira a Vencer");

    type FaixaRow = { label: string; cur: string; ant?: string };
    const faixaRows: FaixaRow[] = [
      { label: "Até 30 dias",     cur: fv.ate30d,    ant: fvAnt?.ate30d },
      { label: "31 a 60 dias",    cur: fv.d31_60,    ant: fvAnt?.d31_60 },
      { label: "61 a 90 dias",    cur: fv.d61_90,    ant: fvAnt?.d61_90 },
      { label: "91 a 180 dias",   cur: fv.d91_180,   ant: fvAnt?.d91_180 },
      { label: "181 a 360 dias",  cur: fv.d181_360,  ant: fvAnt?.d181_360 },
      { label: "Acima de 360 d",  cur: fv.acima360d, ant: fvAnt?.acima360d },
      { label: "Prazo Indet.",    cur: fv.prazoIndeterminado ?? "—", ant: fvAnt?.prazoIndeterminado },
      { label: "Total A Vencer",  cur: fv.total,     ant: fvAnt?.total },
    ];

    const FRH = 7; const FHH = 8;
    const FTH = FHH + faixaRows.length * FRH + 2;
    const fy0 = pos.y;

    doc.setFillColor(...P.wh); doc.setDrawColor(...P.x2); doc.setLineWidth(0.25);
    doc.roundedRect(ML, fy0, CW, FTH, 2, 2, "FD");
    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, fy0, CW, FHH, 2, 2, "F");
    doc.rect(ML, fy0+3, CW, FHH-3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("Faixa", ML + 4, fy0 + 5.5);
    if (hasAnt) {
      doc.text(scrAnt!.periodoReferencia || "Anterior", ML + CW*0.57, fy0 + 5.5, { align: "right" });
      doc.text(scr.periodoReferencia || "Atual",        ML + CW*0.78, fy0 + 5.5, { align: "right" });
    } else {
      doc.text(scr.periodoReferencia || "Atual", ML + CW*0.78, fy0 + 5.5, { align: "right" });
    }

    faixaRows.forEach((r, i) => {
      const ry = fy0 + FHH + i * FRH;
      const isLast = i === faixaRows.length - 1;
      if (isLast) doc.setFillColor(...P.n0);
      else if (i % 2 === 0) doc.setFillColor(...P.x0);
      else doc.setFillColor(...P.wh);
      doc.rect(ML, ry, CW, FRH, "F");

      doc.setFont("helvetica", isLast ? "bold" : "normal");
      doc.setFontSize(7); doc.setTextColor(...(isLast ? P.n9 : P.x7));
      doc.text(r.label, ML + 4, ry + 5.5);

      const fmtMo = (v: string | undefined) => {
        if (!v || v === "—") return "—";
        const num = parseMoneyToNumber(v);
        return num === 0 ? "—" : mo(num);
      };

      if (hasAnt) {
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
        doc.text(fmtMo(r.ant), ML + CW*0.57, ry + 5.5, { align: "right" });
      }
      doc.setFont("helvetica", isLast ? "bold" : "normal");
      doc.setFontSize(7); doc.setTextColor(...(isLast ? P.n9 : P.x7));
      doc.text(fmtMo(r.cur), ML + CW*0.78, ry + 5.5, { align: "right" });

      doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
      doc.line(ML+2, ry+FRH, ML+CW-2, ry+FRH);
    });

    pos.y = fy0 + FTH + 5;
  }

  // ── Vencidos por faixa ──────────────────────────────────────────────────────
  const fvc = scr.faixasVencidos;
  const fvcAnt = scrAnt?.faixasVencidos;
  if (fvc && n(scr.vencidos) > 0) {
    checkPageBreak(ctx, 50);
    stitle("Faixas de Atraso — Carteira Vencida");

    type FaixaRow = { label: string; cur: string; ant?: string };
    const vencRows: FaixaRow[] = [
      { label: "15 a 30 dias",   cur: fvc.ate30d,    ant: fvcAnt?.ate30d },
      { label: "31 a 60 dias",   cur: fvc.d31_60,    ant: fvcAnt?.d31_60 },
      { label: "61 a 90 dias",   cur: fvc.d61_90,    ant: fvcAnt?.d61_90 },
      { label: "91 a 180 dias",  cur: fvc.d91_180,   ant: fvcAnt?.d91_180 },
      { label: "181 a 360 dias", cur: fvc.d181_360,  ant: fvcAnt?.d181_360 },
      { label: "Acima de 360 d", cur: fvc.acima360d, ant: fvcAnt?.acima360d },
      { label: "Total Vencido",  cur: fvc.total,     ant: fvcAnt?.total },
    ];

    const FRH = 7; const FHH = 8;
    const FTH = FHH + vencRows.length * FRH + 2;
    const vy0 = pos.y;

    doc.setFillColor(...P.wh); doc.setDrawColor(...P.x2); doc.setLineWidth(0.25);
    doc.roundedRect(ML, vy0, CW, FTH, 2, 2, "FD");
    doc.setFillColor(...P.r6);
    doc.roundedRect(ML, vy0, CW, FHH, 2, 2, "F");
    doc.rect(ML, vy0+3, CW, FHH-3, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
    doc.text("Faixa de Atraso", ML + 4, vy0 + 5.5);
    if (hasAnt) {
      doc.text(scrAnt!.periodoReferencia || "Anterior", ML + CW*0.57, vy0 + 5.5, { align: "right" });
      doc.text(scr.periodoReferencia || "Atual",        ML + CW*0.78, vy0 + 5.5, { align: "right" });
    } else {
      doc.text(scr.periodoReferencia || "Atual", ML + CW*0.78, vy0 + 5.5, { align: "right" });
    }

    vencRows.forEach((r, i) => {
      const ry = vy0 + FHH + i * FRH;
      const isLast = i === vencRows.length - 1;
      if (isLast) doc.setFillColor(...P.r1);
      else if (i % 2 === 0) doc.setFillColor(...P.x0);
      else doc.setFillColor(...P.wh);
      doc.rect(ML, ry, CW, FRH, "F");

      doc.setFont("helvetica", isLast ? "bold" : "normal");
      doc.setFontSize(7); doc.setTextColor(...(isLast ? P.r6 : P.x7));
      doc.text(r.label, ML + 4, ry + 5.5);

      const fmtMo = (v: string | undefined) => {
        if (!v || v === "—") return "—";
        const num = parseMoneyToNumber(v);
        return num === 0 ? "—" : mo(num);
      };

      if (hasAnt) {
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
        doc.text(fmtMo(r.ant), ML + CW*0.57, ry + 5.5, { align: "right" });
      }
      doc.setFont("helvetica", isLast ? "bold" : "normal");
      doc.setFontSize(7); doc.setTextColor(...(isLast ? P.r6 : P.x7));
      doc.text(fmtMo(r.cur), ML + CW*0.78, ry + 5.5, { align: "right" });

      doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
      doc.line(ML+2, ry+FRH, ML+CW-2, ry+FRH);
    });

    pos.y = vy0 + FTH + 5;
  }

  // ── Outros Valores ──────────────────────────────────────────────────────────
  const ov = scr.outrosValores;
  if (ov) {
    const ovItems = [
      { label: "Carteira de Crédito",      val: ov.carteiraCredito },
      { label: "Responsabilidade Total",   val: ov.responsabilidadeTotal },
      { label: "Risco Total",              val: ov.riscoTotal },
      { label: "Coobrigação Assumida",     val: ov.coobrigacaoAssumida },
      { label: "Coobrigação Recebida",     val: ov.coobrigacaoRecebida },
      { label: "Créditos a Liberar",       val: ov.creditosALiberar },
    ].filter(x => {
      const num = parseMoneyToNumber(x.val ?? "0");
      return num !== 0;
    });

    if (ovItems.length > 0) {
      checkPageBreak(ctx, 14 + ovItems.length * 7);
      stitle("Outros Valores SCR");

      const ORH = 7; const OHH = 8;
      const OTH = OHH + ovItems.length * ORH + 2;
      const oy0 = pos.y;

      doc.setFillColor(...P.wh); doc.setDrawColor(...P.x2); doc.setLineWidth(0.25);
      doc.roundedRect(ML, oy0, CW, OTH, 2, 2, "FD");
      doc.setFillColor(...P.n8);
      doc.roundedRect(ML, oy0, CW, OHH, 2, 2, "F");
      doc.rect(ML, oy0+3, CW, OHH-3, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...P.wh);
      doc.text("Item", ML + 4, oy0 + 5.5);
      doc.text("Valor", ML + CW*0.78, oy0 + 5.5, { align: "right" });

      ovItems.forEach((r, i) => {
        const ry = oy0 + OHH + i * ORH;
        if (i % 2 === 0) doc.setFillColor(...P.x0); else doc.setFillColor(...P.wh);
        doc.rect(ML, ry, CW, ORH, "F");
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...P.x7);
        doc.text(r.label, ML + 4, ry + 5.5);
        doc.text(mo(r.val), ML + CW*0.78, ry + 5.5, { align: "right" });
        doc.setDrawColor(...P.x1); doc.setLineWidth(0.15);
        doc.line(ML+2, ry+ORH, ML+CW-2, ry+ORH);
      });

      pos.y = oy0 + OTH + 5;
    }
  }

  void params;
}
