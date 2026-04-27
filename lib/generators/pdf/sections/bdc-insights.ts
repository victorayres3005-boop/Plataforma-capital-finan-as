/**
 * Seção BDC Insights — dados exclusivos BigDataCorp
 *   1. Comportamento de Crédito (interests_and_behaviors)
 *   2. Processos dos Sócios / Grupo (owners_lawsuits_distribution_data)
 *   3. Dívidas com a União / PGFN (government_debtors por sócio)
 */
import type { PdfCtx } from "../context";
import { checkPageBreak } from "../helpers";

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
  pu:  [232, 213, 245] as [number,number,number],
  puf: [107,  33, 168] as [number,number,number],
};

// Escala A-H: A = melhor, H = pior
const SCALE_COLOR = (level: string): [number,number,number] => {
  const l = level.toUpperCase();
  if (l === "A" || l === "B") return P.g6;
  if (l === "C" || l === "D") return P.n8;
  if (l === "E" || l === "F") return P.a5;
  return P.r6;
};
const SCALE_BG = (level: string): [number,number,number] => {
  const l = level.toUpperCase();
  if (l === "A" || l === "B") return P.g0;
  if (l === "C" || l === "D") return P.n0;
  if (l === "E" || l === "F") return P.a0;
  return P.r0;
};

function stitle(ctx: PdfCtx, label: string) {
  const { doc, pos, margin: ML, contentW: CW } = ctx;
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
}

export function renderBdcInsights(ctx: PdfCtx): void {
  const { doc, pos, data, margin: ML, contentW: CW } = ctx;

  const hasInterests  = !!(data.bdcInterests?.creditSeeker || data.bdcInterests?.creditCardScore);
  const hasLawDist    = !!(data.bdcLawsuitsDistribution?.totalLawsuits);
  const sociosComPGFN = (data.qsa?.quadroSocietario ?? []).filter(s => (s.pgfnTotalDebts ?? 0) > 0);
  const sociosComProc = (data.qsa?.quadroSocietario ?? []).filter(s => (s.processosTotal ?? 0) > 0);
  const hasConsultas   = !!(data.assertivaConsultas?.total);
  const hasAssertProt  = !!(data.assertivaProtestos?.qtd);
  const scorePJ        = data.cnpj?.scoreAssertivaPJ;
  const negAssertiva   = data.cnpj?.negativacoesAssertiva;
  const hasAssertScore = (scorePJ ?? 0) > 0;

  if (!hasInterests && !hasLawDist && sociosComPGFN.length === 0 &&
      sociosComProc.length === 0 && !hasConsultas && !hasAssertProt && !hasAssertScore) return;

  // ══════════════════════════════════════════════════════════════════
  // 0. Score de Crédito — Assertiva PJ
  // ══════════════════════════════════════════════════════════════════
  if (hasAssertScore) {
    checkPageBreak(ctx, 30);
    stitle(ctx, "Score de Crédito — Assertiva PJ");

    const hasNeg = (negAssertiva ?? 0) >= 0 && negAssertiva !== undefined;
    const kpiW   = hasNeg ? (CW - 3) / 2 : CW;
    const kpiH   = 16;
    const yS     = pos.y;

    const lvl = scorePJ! >= 700 ? "bom" : scorePJ! >= 400 ? "mod" : "ruim";
    const scoreBg:  [number,number,number] = lvl === "bom" ? P.g0 : lvl === "mod" ? P.a0 : P.r0;
    const scoreFg:  [number,number,number] = lvl === "bom" ? P.g6 : lvl === "mod" ? P.a5 : P.r6;
    const scoreBdr: [number,number,number] = lvl === "bom" ? P.g1 : lvl === "mod" ? P.a1 : P.r1;

    doc.setFillColor(...scoreBg); doc.setDrawColor(...scoreBdr); doc.setLineWidth(0.25);
    doc.roundedRect(ML, yS, kpiW, kpiH, 2, 2, "FD");
    doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
    doc.text("SCORE ASSERTIVA PJ  (0–1000)", ML + 3, yS + 5);
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...scoreFg);
    doc.text(String(scorePJ), ML + kpiW / 2, yS + 13, { align: "center" });

    if (hasNeg) {
      const nx = ML + kpiW + 3;
      const negBg:  [number,number,number] = (negAssertiva ?? 0) > 0 ? P.r0 : P.g0;
      const negFg:  [number,number,number] = (negAssertiva ?? 0) > 0 ? P.r6 : P.g6;
      const negBdr: [number,number,number] = (negAssertiva ?? 0) > 0 ? P.r1 : P.g1;
      doc.setFillColor(...negBg); doc.setDrawColor(...negBdr);
      doc.roundedRect(nx, yS, kpiW, kpiH, 2, 2, "FD");
      doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
      doc.text("NEGATIVAÇÕES ASSERTIVA", nx + 3, yS + 5);
      doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...negFg);
      doc.text(String(negAssertiva ?? 0), nx + kpiW / 2, yS + 13, { align: "center" });
    }

    pos.y = yS + kpiH + 3;
    doc.setFont("helvetica","normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
    doc.text("Assertiva Score  ·  700+ = baixo risco  ·  400–699 = moderado  ·  < 400 = alto risco", ML, pos.y);
    pos.y += 7;
  }

  // ══════════════════════════════════════════════════════════════════
  // 1. Comportamento de Crédito (interests_and_behaviors)
  // ══════════════════════════════════════════════════════════════════
  if (hasInterests) {
    checkPageBreak(ctx, 38);
    stitle(ctx, "Comportamento de Crédito — BigDataCorp");

    const ib = data.bdcInterests!;
    const GAP = 3;
    const cards = [
      { label: "Buscador Crédito", value: ib.creditSeeker },
      { label: "Score Cartão",     value: ib.creditCardScore },
      { label: "App Financeiro",   value: String(ib.appUser) },
      { label: "Serv. Pagamento",  value: String(ib.paymentServicesUser) },
      { label: "Banco Digital",    value: String(ib.onlineBankingUser) },
      { label: "Invest. Online",   value: ib.onlineInvestor ? "SIM" : "NÃO" },
    ].filter(c => c.value && c.value !== "false" && c.value !== "");

    const ncards = Math.min(cards.length, 6);
    const cw = (CW - GAP * (ncards - 1)) / ncards;
    const CH = 20;

    checkPageBreak(ctx, CH + 10);
    const y0 = pos.y;

    cards.slice(0, ncards).forEach((card, i) => {
      const x = ML + i * (cw + GAP);
      const isScale = /^[A-H]$/.test(card.value.toUpperCase());
      const bg: [number,number,number] = isScale ? SCALE_BG(card.value) : P.x0;
      const fg: [number,number,number] = isScale ? SCALE_COLOR(card.value) : P.x9;

      doc.setFillColor(...bg);
      doc.setDrawColor(...P.x1);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, y0, cw, CH, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(...P.x4);
      doc.text(card.label.toUpperCase(), x + 3, y0 + 5.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(card.value.length > 3 ? 8 : 13);
      doc.setTextColor(...fg);
      doc.text(card.value, x + cw / 2, y0 + 15, { align: "center" });
    });

    pos.y = y0 + CH + 6;

    // Legenda
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...P.x4);
    doc.text("Escala A–H: A = melhor comportamento financeiro  ·  H = maior risco  ·  Fonte: BigDataCorp Interests & Behaviors", ML, pos.y);
    pos.y += 7;
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. Processos dos Sócios Ativos (owners_lawsuits_distribution_data)
  // ══════════════════════════════════════════════════════════════════
  if (hasLawDist) {
    const ld = data.bdcLawsuitsDistribution!;
    checkPageBreak(ctx, 45);
    stitle(ctx, "Processos dos Sócios — BigDataCorp");

    // KPIs topo
    const kpis = [
      { label: "Total Processos",  value: String(ld.totalLawsuits) },
      { label: "Polo Ativo",       value: String(ld.totalAsAuthor) },
      { label: "Polo Passivo",     value: String(ld.totalAsDefendant) },
      { label: "Sócios c/ Process.", value: String(ld.totalOwners) },
    ];
    const GAP2 = 3;
    const kpiW = (CW - GAP2 * 3) / 4;
    const kpiH = 16;
    const y1 = pos.y;

    checkPageBreak(ctx, kpiH + 4);
    kpis.forEach((kp, i) => {
      const x = ML + i * (kpiW + GAP2);
      const isHigh = kp.label === "Polo Passivo" && parseInt(kp.value) > 0;
      const bg: [number,number,number] = isHigh ? P.r0 : P.x0;
      const fg: [number,number,number] = isHigh ? P.r6 : P.x9;
      doc.setFillColor(...bg); doc.setDrawColor(...P.x1); doc.setLineWidth(0.25);
      doc.roundedRect(x, y1, kpiW, kpiH, 2, 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
      doc.text(kp.label.toUpperCase(), x + 3, y1 + 5.5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...fg);
      doc.text(kp.value || "0", x + kpiW / 2, y1 + 13, { align: "center" });
    });
    pos.y = y1 + kpiH + 4;

    // Distribuição por tipo — tabela compacta 2 colunas
    const typeEntries = Object.entries(ld.typeDistribution).sort((a, b) => b[1] - a[1]);
    const courtEntries = Object.entries(ld.courtTypeDistribution).sort((a, b) => b[1] - a[1]);

    if (typeEntries.length > 0 || courtEntries.length > 0) {
      checkPageBreak(ctx, 8 + Math.max(typeEntries.length, courtEntries.length) * 5 + 4);
      const half = (CW - 4) / 2;

      // Header tipo
      doc.setFillColor(...P.n0); doc.setDrawColor(...P.n1); doc.setLineWidth(0.2);
      doc.roundedRect(ML, pos.y, half, 7, 1, 1, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...P.n7);
      doc.text("TIPO DE PROCESSO", ML + 4, pos.y + 4.8);

      // Header tribunal
      doc.setFillColor(...P.n0); doc.setDrawColor(...P.n1);
      doc.roundedRect(ML + half + 4, pos.y, half, 7, 1, 1, "FD");
      doc.text("TRIBUNAL", ML + half + 8, pos.y + 4.8);
      pos.y += 8;

      const maxRows = Math.max(typeEntries.length, courtEntries.length, 1);
      for (let i = 0; i < maxRows; i++) {
        checkPageBreak(ctx, 5);
        const rowH = 5;
        if (i % 2 === 0) {
          doc.setFillColor(...P.x0);
          doc.rect(ML, pos.y, CW, rowH, "F");
        }

        // Tipo
        if (typeEntries[i]) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
          const [tipo, qtd] = typeEntries[i];
          const truncTipo = tipo.length > 26 ? tipo.slice(0, 24) + "…" : tipo;
          doc.text(truncTipo, ML + 3, pos.y + 3.5);
          doc.setFont("helvetica", "bold"); doc.setTextColor(...P.x9);
          doc.text(String(qtd), ML + half - 3, pos.y + 3.5, { align: "right" });
        }

        // Tribunal
        if (courtEntries[i]) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
          const [tribunal, qtd] = courtEntries[i];
          doc.text(tribunal, ML + half + 7, pos.y + 3.5);
          doc.setFont("helvetica", "bold"); doc.setTextColor(...P.x9);
          doc.text(String(qtd), ML + CW - 3, pos.y + 3.5, { align: "right" });
        }
        pos.y += rowH;
      }
      pos.y += 4;
    }

    // Matérias principais
    const subjectEntries = Object.entries(ld.subjectDistribution).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (subjectEntries.length > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
      doc.text("MATÉRIA PRINCIPAL: " + subjectEntries.map(([s, q]) => `${s} (${q})`).join(" · "), ML, pos.y);
      pos.y += 5;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. Dívidas com a União / PGFN (por sócio)
  // ══════════════════════════════════════════════════════════════════
  if (sociosComPGFN.length > 0) {
    checkPageBreak(ctx, 12 + sociosComPGFN.length * 20);
    stitle(ctx, "Dívidas com a União (PGFN) — BigDataCorp");

    for (const socio of sociosComPGFN) {
      checkPageBreak(ctx, 18);

      // Linha do sócio
      doc.setFillColor(...P.r0); doc.setDrawColor(...P.r1); doc.setLineWidth(0.2);
      doc.roundedRect(ML, pos.y, CW, 8, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...P.r6);
      doc.text(socio.nome || "Sócio", ML + 4, pos.y + 5.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...P.r6);
      const pgfnInfo = `${socio.pgfnTotalDebts} dívida(s) · Total: ${socio.pgfnDebtTotal}`;
      doc.text(pgfnInfo, ML + CW - 3, pos.y + 5.5, { align: "right" });
      pos.y += 10;

      // Detalhe das dívidas
      if (Array.isArray(socio.pgfnDebts) && socio.pgfnDebts.length > 0) {
        const ROW_H = 5;
        for (let i = 0; i < Math.min(socio.pgfnDebts.length, 5); i++) {
          checkPageBreak(ctx, ROW_H);
          const debt = socio.pgfnDebts[i];
          if (i % 2 === 0) { doc.setFillColor(...P.x0); doc.rect(ML, pos.y, CW, ROW_H, "F"); }
          doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
          doc.text(debt.origin || "—", ML + 4, pos.y + 3.5);
          doc.text(debt.situation || "—", ML + CW * 0.5, pos.y + 3.5);
          doc.setFont("helvetica", "bold"); doc.setTextColor(...P.r6);
          doc.text(debt.value, ML + CW - 3, pos.y + 3.5, { align: "right" });
          pos.y += ROW_H;
        }
        if (socio.pgfnDebts.length > 5) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
          doc.text(`+ ${socio.pgfnDebts.length - 5} dívida(s) adicionais`, ML + 3, pos.y + 3.5);
          pos.y += 5;
        }
      }
      pos.y += 4;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. Processos dos Sócios — Individual (BDC processes por CPF)
  // ══════════════════════════════════════════════════════════════════
  if (sociosComProc.length > 0) {
    checkPageBreak(ctx, 12 + sociosComProc.length * 12);
    stitle(ctx, "Processos por Sócio — BigDataCorp");

    const GAP3 = 3;
    const cols4 = ["Sócio", "Total", "Passivo", "Ativo", "Valor Est."];
    const colX  = [4, CW * 0.52, CW * 0.64, CW * 0.76, CW - 3];
    const HH = 8; const RH = 7;
    const TH = HH + sociosComProc.length * RH + 2;
    checkPageBreak(ctx, TH + 4);

    doc.setFillColor(...P.wh); doc.setDrawColor(...P.x2); doc.setLineWidth(0.25);
    doc.roundedRect(ML, pos.y, CW, TH, 2, 2, "FD");

    // header
    doc.setFillColor(...P.n9);
    doc.roundedRect(ML, pos.y, CW, HH, 2, 2, "F");
    doc.rect(ML, pos.y + 3, CW, HH - 3, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...P.wh);
    cols4.forEach((c, i) => {
      const align = i === 0 ? "left" : "right";
      doc.text(c, ML + colX[i], pos.y + 5.5, { align });
    });

    sociosComProc.forEach((socio, i) => {
      const ry = pos.y + HH + i * RH;
      if (i % 2 !== 0) { doc.setFillColor(...P.x0); doc.rect(ML, ry, CW, RH, "F"); }
      doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
      const nm = socio.nome.length > 28 ? socio.nome.slice(0, 26) + "…" : socio.nome;
      doc.text(nm, ML + 4, ry + 4.8);
      doc.setFont("helvetica", "bold"); doc.setTextColor(...((socio.processosPassivo ?? 0) > 0 ? P.r6 : P.x9));
      doc.text(String(socio.processosTotal ?? 0), ML + colX[1], ry + 4.8, { align: "right" });
      doc.setTextColor(...P.x9);
      doc.text(String(socio.processosPassivo ?? 0), ML + colX[2], ry + 4.8, { align: "right" });
      doc.text(String(socio.processosAtivo  ?? 0), ML + colX[3], ry + 4.8, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setTextColor(...P.x5);
      doc.text(socio.processosValorTotal ?? "—", ML + colX[4], ry + 4.8, { align: "right" });
    });
    void GAP3;
    pos.y += TH + 5;
  }

  // ══════════════════════════════════════════════════════════════════
  // 5. Consultas ao Mercado — Assertiva
  // ══════════════════════════════════════════════════════════════════
  if (hasConsultas) {
    const ac = data.assertivaConsultas!;
    checkPageBreak(ctx, 14 + Math.min(ac.recentes.length, 8) * 5 + 4);
    stitle(ctx, "Consultas ao Mercado — Assertiva Score");

    // KPI: total + última consulta
    const kpiW = (CW - 3) / 2; const kpiH = 14;
    checkPageBreak(ctx, kpiH + 4);
    const yK = pos.y;

    doc.setFillColor(...(ac.total > 10 ? P.a0 : P.x0));
    doc.setDrawColor(...(ac.total > 10 ? P.a1 : P.x1));
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, yK, kpiW, kpiH, 2, 2, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
    doc.text("CONSULTAS (ÚLTIMOS MESES)", ML + 3, yK + 5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setTextColor(...(ac.total > 10 ? P.a5 : P.x9));
    doc.text(String(ac.total), ML + kpiW / 2, yK + 12, { align: "center" });

    doc.setFillColor(...P.x0); doc.setDrawColor(...P.x1);
    doc.roundedRect(ML + kpiW + 3, yK, kpiW, kpiH, 2, 2, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
    doc.text("ÚLTIMA CONSULTA", ML + kpiW + 6, yK + 5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...P.x9);
    doc.text(ac.ultima || "—", ML + kpiW + 3 + kpiW / 2, yK + 12, { align: "center" });
    pos.y = yK + kpiH + 4;

    // Lista de consultantes recentes
    if (ac.recentes.length > 0) {
      const rows = ac.recentes.slice(0, 8);
      const RH = 5;
      checkPageBreak(ctx, rows.length * RH + 2);
      rows.forEach((c, i) => {
        if (i % 2 === 0) { doc.setFillColor(...P.x0); doc.rect(ML, pos.y, CW, RH, "F"); }
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
        doc.text(c.consultante || "—", ML + 3, pos.y + 3.5);
        doc.setFont("helvetica", "normal"); doc.setTextColor(...P.x4);
        doc.text(c.data || "—", ML + CW - 3, pos.y + 3.5, { align: "right" });
        pos.y += RH;
      });
      if (ac.total > 8) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
        doc.text(`+ ${ac.total - 8} consulta(s) adicionais — Fonte: Assertiva Score`, ML + 3, pos.y + 3.5);
        pos.y += 5;
      }
    }
    pos.y += 4;
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. Protestos — Assertiva (somente se Credit Hub não retornou)
  // ══════════════════════════════════════════════════════════════════
  if (hasAssertProt) {
    const ap = data.assertivaProtestos!;
    checkPageBreak(ctx, 12 + Math.min(ap.lista.length, 5) * 6 + 4);
    stitle(ctx, "Protestos — Assertiva Score");

    // KPI
    const kpiW2 = (CW - 3) / 2; const kpiH2 = 14;
    const yP = pos.y;
    doc.setFillColor(...(ap.qtd > 0 ? P.r0 : P.g0));
    doc.setDrawColor(...(ap.qtd > 0 ? P.r1 : P.g1));
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, yP, kpiW2, kpiH2, 2, 2, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
    doc.text("QUANTIDADE", ML + 3, yP + 5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setTextColor(...(ap.qtd > 0 ? P.r6 : P.g6));
    doc.text(String(ap.qtd), ML + kpiW2 / 2, yP + 12, { align: "center" });

    doc.setFillColor(...(ap.valor > 0 ? P.r0 : P.g0));
    doc.setDrawColor(...(ap.valor > 0 ? P.r1 : P.g1));
    doc.roundedRect(ML + kpiW2 + 3, yP, kpiW2, kpiH2, 2, 2, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
    doc.text("VALOR TOTAL", ML + kpiW2 + 6, yP + 5);
    const valStr = ap.valor > 0 ? `R$ ${ap.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...(ap.valor > 0 ? P.r6 : P.g6));
    doc.text(valStr, ML + kpiW2 + 3 + kpiW2 / 2, yP + 12, { align: "center" });
    pos.y = yP + kpiH2 + 4;

    // Detalhes
    if (ap.lista.length > 0) {
      const rows = ap.lista.slice(0, 5);
      const RH = 6;
      checkPageBreak(ctx, rows.length * RH + 2);
      rows.forEach((p, i) => {
        if (i % 2 === 0) { doc.setFillColor(...P.r0); doc.rect(ML, pos.y, CW, RH, "F"); }
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
        doc.text(`${p.cidade}/${p.uf} — ${p.data}`, ML + 3, pos.y + 4);
        const cart = p.cartorio.length > 30 ? p.cartorio.slice(0, 28) + "…" : p.cartorio;
        doc.text(cart, ML + CW * 0.38, pos.y + 4);
        doc.setFont("helvetica", "bold"); doc.setTextColor(...P.r6);
        doc.text(`R$ ${p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ML + CW - 3, pos.y + 4, { align: "right" });
        pos.y += RH;
      });
      if (!ap.completo) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
        doc.text("* Lista de protestos incompleta — dados parciais da Assertiva", ML + 3, pos.y + 3.5);
        pos.y += 5;
      }
    }
    pos.y += 4;
  }

  // ══════════════════════════════════════════════════════════════════
  // 7. Patrimônio, Veículos e Imóveis — Assertiva PF
  // ══════════════════════════════════════════════════════════════════
  {
    const sociosBens = (data.scrSocios ?? []).filter(ss =>
      ss.patrimonioEstimado || (ss.bensVeiculos?.length ?? 0) > 0 || (ss.bensImoveis?.length ?? 0) > 0
    );
    if (sociosBens.length > 0) {
      checkPageBreak(ctx, 20);
      stitle(ctx, "Patrimônio & Bens — Assertiva PF");

      for (const ss of sociosBens) {
        const rowH = 6;
        const nameH = 8;
        const veics = ss.bensVeiculos ?? [];
        const imovs = ss.bensImoveis ?? [];
        const estimated = nameH + (ss.patrimonioEstimado ? 8 : 0) + veics.length * rowH + imovs.length * rowH + 4;
        checkPageBreak(ctx, Math.min(estimated, 50));

        // Nome do sócio
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...P.n8);
        doc.text(ss.nomeSocio, ML, pos.y + 5);
        pos.y += nameH;

        // Patrimônio estimado
        if (ss.patrimonioEstimado) {
          doc.setFillColor(...P.n0); doc.setDrawColor(...P.x1); doc.setLineWidth(0.2);
          doc.roundedRect(ML, pos.y, CW / 3, 7, 1, 1, "FD");
          doc.setFont("helvetica", "bold"); doc.setFontSize(5); doc.setTextColor(...P.x4);
          doc.text("PATRIMÔNIO ESTIMADO", ML + 2, pos.y + 2.5);
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...P.n8);
          doc.text(ss.patrimonioEstimado, ML + 2, pos.y + 6);
          pos.y += 9;
        }

        // Veículos
        if (veics.length > 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
          doc.text("VEÍCULOS", ML, pos.y + 3.5);
          pos.y += 5;
          veics.slice(0, 5).forEach((v, i) => {
            if (i % 2 === 0) { doc.setFillColor(...P.x0); doc.rect(ML, pos.y, CW, rowH, "F"); }
            doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
            doc.text(`${v.placa || "—"}  ${v.modelo || "—"}  ${v.ano || ""}`, ML + 3, pos.y + 4);
            doc.setFont("helvetica", "normal"); doc.setTextColor(...P.x4);
            doc.text(v.valorFipe || "—", ML + CW - 3, pos.y + 4, { align: "right" });
            pos.y += rowH;
          });
        }

        // Imóveis
        if (imovs.length > 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(...P.x4);
          doc.text("IMÓVEIS", ML, pos.y + 3.5);
          pos.y += 5;
          imovs.slice(0, 5).forEach((v, i) => {
            if (i % 2 === 0) { doc.setFillColor(...P.x0); doc.rect(ML, pos.y, CW, rowH, "F"); }
            doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...P.x7);
            const area = v.areaM2 ? `${v.areaM2}m²` : "";
            doc.text(`${v.municipio || "—"}/${v.uf || "—"}  ${area}`, ML + 3, pos.y + 4);
            doc.setFont("helvetica", "normal"); doc.setTextColor(...P.x4);
            doc.text(v.valorEstimado || "—", ML + CW - 3, pos.y + 4, { align: "right" });
            pos.y += rowH;
          });
        }

        pos.y += 4;
      }
    }
  }

  pos.y += 3;
}
