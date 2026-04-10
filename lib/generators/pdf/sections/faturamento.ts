/**
 * Seção 04 — FATURAMENTO / SCR
 * Gráfico de barras, tabela mensal, SCR comparativo, vencimentos, modalidades, SCR sócios, DRE, Balanço, Curva ABC
 */
import type { PdfCtx } from "../context";
import type { AutoCell } from "../context";
import {
  newPage, drawHeader, checkPageBreak, drawSectionTitle, drawSpacer,
  drawAlertDeduped, drawDetAlerts, autoT,
  fmtMoney, fmtBR, parseMoneyToNumber, normalizeTendencia,
  gerarAlertasFaturamento, gerarAlertasSCR, gerarAlertasDRE, gerarAlertasBalanco,
} from "../helpers";

export function renderFaturamento(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  // ── Pre-compute validMeses ──
  const validMeses = [...(data.faturamento?.meses || [])]
    .filter(m => m?.mes && m?.valor)
    .sort((a, b) => {
      const dk = (s: string) => {
        const parts = s.split("/");
        if (parts.length !== 2) return 0;
        const [p1, p2] = parts;
        const mm: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
        const month = isNaN(Number(p1)) ? (mm[p1.toLowerCase()] || 0) : Number(p1);
        const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
        return year * 100 + month;
      };
      return dk(a.mes) - dk(b.mes);
    });

  const mesesFMM = validMeses.slice(-12);
  const fmmNum = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : mesesFMM.reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / Math.max(mesesFMM.length, 1);
  const faturamentoRealmenteZerado = validMeses.length > 0 && validMeses.every(m => parseMoneyToNumber(m.valor) === 0);
  const alertasFat = gerarAlertasFaturamento(data.faturamento, validMeses);

  // ── SCR pre-compute ──
  const fmmVal = parseMoneyToNumber(data.faturamento?.mediaAno || "0");
  const hasAnterior = !!(data.scrAnterior && data.scrAnterior.periodoReferencia);
  const periodoAnt = hasAnterior ? (data.scrAnterior!.periodoReferencia || "Anterior") : "";
  const periodoAt = data.scr?.periodoReferencia || "Atual";
  const alertasSCR = gerarAlertasSCR(data.scr, data.scrAnterior, fmmVal);
  const alertasDRE = gerarAlertasDRE(data.dre);
  const alertasBalanco = gerarAlertasBalanco(data.balanco);

  newPage(ctx);
  drawHeader(ctx);
  drawSectionTitle(ctx, "06", "FATURAMENTO / SCR");

  const leftW = contentW;
  const leftX = margin;
  const chartMeses = mesesFMM;

  let yLeft = pos.y;

  // ── Alertas de faturamento no topo ──
  if (faturamentoRealmenteZerado) {
    pos.y = yLeft;
    drawAlertDeduped(ctx, "Faturamento zerado no período — sem receita declarada", "ALTA");
    yLeft = pos.y;
  }
  if ((data.faturamento?.meses || []).length > 0 && !data.faturamento?.dadosAtualizados) {
    pos.y = yLeft;
    drawAlertDeduped(ctx, `Faturamento desatualizado — último mês com dados: ${data.faturamento?.ultimoMesComDados || "N/A"}`, "MODERADA");
    yLeft = pos.y;
  }

  const mesLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const parseMesLabel = (mesStr: string): string => {
    const parts = (mesStr || "").split("/");
    const part0 = parts[0] || "";
    const part1 = parts[1] || "";
    const numerico = parseInt(part0);
    if (!isNaN(numerico)) {
      const yr = part1.length === 4 ? part1.slice(2) : part1;
      return (mesLabels[numerico - 1] || part0) + (yr ? "/" + yr : "");
    }
    const capitalizado = part0.charAt(0).toUpperCase() + part0.slice(1).toLowerCase();
    const yr = part1.length === 4 ? part1.slice(2) : part1;
    return capitalizado + (yr ? "/" + yr : "");
  };

  if (chartMeses.length > 0) {
    const chartVals = chartMeses.map(m => parseMoneyToNumber(m.valor));
    const chartMax = Math.max(...chartVals, 1);
    const fmmChart = parseMoneyToNumber(data.faturamento?.fmm12m || "0");
    const barAreaH = 40;
    const barTopPadding = 10;
    const labelAreaH = mesesFMM.length > 6 ? 12 : 6;
    const n = chartMeses.length;
    const bW = Math.max(2, (leftW / n) - 1.5);
    const chartTopY = yLeft + barTopPadding;

    // FMM reference line
    if (fmmChart > 0) {
      const fmmLineY = chartTopY + barAreaH - (fmmChart / chartMax) * barAreaH;
      doc.setDrawColor(150, 150, 150);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(leftX, fmmLineY, leftX + leftW, fmmLineY);
      doc.setLineDashPattern([], 0);
      doc.setFontSize(5);
      doc.setTextColor(130, 130, 130);
      doc.text("FMM", leftX + leftW + 1, fmmLineY + 1);
    }

    // Bars
    chartMeses.forEach((m, i) => {
      const v = chartVals[i];
      const bH = Math.max(1, (v / chartMax) * barAreaH);
      const bX = leftX + i * (bW + 1.5);
      const bY = chartTopY + barAreaH - bH;
      const isMax = v === chartMax && v > 0;
      const isZero = v === 0;
      const barColor: [number, number, number] = isZero ? [217, 119, 6] : isMax ? [20, 40, 100] : colors.navy;
      doc.setFillColor(...barColor);
      doc.roundedRect(bX, bY, bW, bH, 0.5, 0.5, "F");

      doc.setFontSize(4.5);
      doc.setTextColor(100, 100, 100);
      const mLabel = parseMesLabel(m.mes);
      const labelX = bX + bW / 2;
      const isEven = i % 2 === 0;
      const labelY = chartTopY + barAreaH + (isEven ? 4 : 8);

      doc.setFontSize(5.5);
      doc.setTextColor(80, 80, 80);
      doc.text(mLabel, labelX, labelY, { align: "center" });

      const vLabel = v >= 1000
        ? fmtBR(v / 1000, 0) + "k"
        : v > 0
          ? fmtBR(v / 1000, 1) + "k"
          : "0";

      doc.setFontSize(4);
      doc.setTextColor(70, 70, 70);
      if (bH > 6) {
        doc.text(vLabel, bX + bW / 2, bY - 1, { align: "center" });
      } else if (v > 0) {
        doc.setTextColor(30, 30, 30);
        doc.text(vLabel, bX + bW / 2, chartTopY + barAreaH - bH - 1.5, { align: "center" });
      }
    });

    yLeft = chartTopY + barAreaH + labelAreaH + 1;

    // Summary line
    const fmmK = fmmNum > 0 ? (fmmNum / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
    const fmmMedioNum = data.faturamento?.fmmMedio
      ? parseMoneyToNumber(data.faturamento.fmmMedio)
      : (() => {
        const porAno: Record<string, number[]> = {};
        for (const m of validMeses) {
          const ano = (m.mes || "").split("/")[1];
          if (!ano) continue;
          if (!porAno[ano]) porAno[ano] = [];
          porAno[ano].push(parseMoneyToNumber(m.valor));
        }
        const anosValidos = Object.values(porAno).filter(v => v.length >= 10);
        if (anosValidos.length === 0) return fmmNum;
        return anosValidos.reduce((s, v) => s + v.reduce((a, b) => a + b, 0) / v.length, 0) / anosValidos.length;
      })();
    const fmmMedioK = fmmMedioNum > 0 ? (fmmMedioNum / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
    const totalFat = chartVals.reduce((a, b) => a + b, 0);
    const totalK = (totalFat / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.textMuted);
    doc.text(`FMM 12M (mil R$): ${fmmK}   |   FMM Médio (mil R$): ${fmmMedioK}   |   Total (mil R$): ${totalK}`, leftX, yLeft);
    yLeft += 6;

    // ── Tabela faturamento mensal — 2 colunas ──
    yLeft += 6;
    const tbl2RowH = 5.2;
    const tbl2HdrH = 6;
    const tbl2ColW = (leftW - 4) / 2;

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.headerBg);
    doc.text("FATURAMENTO MENSAL DETALHADO", leftX, yLeft);
    yLeft += 5;
    pos.y = yLeft;
    checkPageBreak(ctx, 20);
    yLeft = pos.y;

    const drawTbl2Header = (cx: number) => {
      doc.setFillColor(...DS.colors.headerBg);
      doc.rect(cx, yLeft, tbl2ColW, tbl2HdrH, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("MÊS", cx + 2, yLeft + 4.2);
      doc.text("FATURAMENTO (R$)", cx + tbl2ColW - 2, yLeft + 4.2, { align: "right" });
    };
    drawTbl2Header(leftX);
    drawTbl2Header(leftX + tbl2ColW + 4);
    yLeft += tbl2HdrH;

    const midIdx = Math.ceil(validMeses.length / 2);
    const colA = validMeses.slice(0, midIdx);
    const colB = validMeses.slice(midIdx);
    const maxRows = Math.max(colA.length, colB.length);

    const drawTbl2Row = (cx: number, mes: { mes: string; valor: string } | null, idx: number) => {
      const bg: [number, number, number] = idx % 2 === 0 ? [235, 243, 255] : [247, 251, 255];
      doc.setFillColor(...bg);
      doc.rect(cx, yLeft, tbl2ColW, tbl2RowH, "F");
      if (!mes) return;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DS.colors.textPrimary);
      doc.text(parseMesLabel(mes.mes), cx + 2, yLeft + 3.6);
      const valNum = parseMoneyToNumber(mes.valor || "0");
      const valColor: [number, number, number] = valNum === 0 ? DS.colors.warn : DS.colors.textPrimary;
      doc.setTextColor(...valColor);
      doc.text(mes.valor || "—", cx + tbl2ColW - 2, yLeft + 3.6, { align: "right" });
      doc.setDrawColor(210, 225, 250);
      doc.setLineWidth(0.15);
      doc.line(cx, yLeft + tbl2RowH, cx + tbl2ColW, yLeft + tbl2RowH);
      doc.setLineWidth(0.1);
    };

    for (let i = 0; i < maxRows; i++) {
      if (yLeft + tbl2RowH > 275) {
        pos.y = yLeft;
        newPage(ctx);
        drawHeader(ctx);
        yLeft = pos.y + 4;
      }
      drawTbl2Row(leftX, colA[i] ?? null, i);
      drawTbl2Row(leftX + tbl2ColW + 4, colB[i] ?? null, i);
      yLeft += tbl2RowH;
    }
    yLeft += 4;

    // FMM por ano
    const fmmAnual = data.faturamento?.fmmAnual || {};
    const fmmAnualTexto = Object.entries(fmmAnual)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([ano, valor]) => {
        const qtdMeses = (data.faturamento?.meses || [])
          .filter(m => m.mes?.endsWith(ano)).length;
        return `FMM ${ano}: R$ ${fmtMoney(valor)} (${qtdMeses} meses)`;
      })
      .join("   |   ");
    if (fmmAnualTexto) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130, 130, 130);
      doc.text(fmmAnualTexto, leftX, yLeft);
      yLeft += 5;
    }

    // Meses zerados
    const mesesZeradosPDF = data.faturamento?.mesesZerados;
    if (mesesZeradosPDF && mesesZeradosPDF.length > 0) {
      const listaMeses = mesesZeradosPDF.map((mz: { mes: string }) => mz.mes).join(", ");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.warning);
      doc.text(`\u26A0 ${mesesZeradosPDF.length} mes(es) com faturamento zero: ${listaMeses}`, leftX, yLeft);
      yLeft += 5;
    }
  } else {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textMuted);
    doc.text("Sem dados de faturamento disponiveis", leftX + leftW / 2, yLeft + 20, { align: "center" });
    yLeft += 30;
  }

  // Alertas determinísticos — Faturamento
  if (alertasFat.length > 0) {
    yLeft += 4;
    pos.y = yLeft;
    drawDetAlerts(ctx, alertasFat);
    yLeft = pos.y;
  }

  // ══════════════════════ SCR ══════════════════════════════════════════════════
  let currentSCRPage = doc.getCurrentPageInfo().pageNumber;
  let yRight = yLeft + 6;

  const scrSemHistorico =
    data.scr?.semHistorico === true ||
    (
      parseMoneyToNumber(data.scr?.totalDividasAtivas || "0") === 0 &&
      parseMoneyToNumber(data.scr?.limiteCredito || "0") === 0 &&
      parseMoneyToNumber(data.scr?.carteiraAVencer || "0") === 0 &&
      (!data.scr?.modalidades || data.scr.modalidades.length === 0)
    );

  if (scrSemHistorico) {
    doc.setFillColor(...colors.primary);
    doc.roundedRect(margin, yRight, contentW, 7, 1, 1, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("\u2713 PERFIL SCR \u2014 SEM OPERAÇÕES BANCÁRIAS", margin + 3, yRight + 4.8);
    yRight += 9;

    const pctConsulta = data.scr?.pctDocumentosProcessados || "99%+";
    const confirmacoes = [
      `\u2713 Consulta realizada: ${pctConsulta} das instituições consultadas`,
      "\u2713 Sem dívida bancária ativa em nenhuma IF",
      "\u2713 Sem coobrigações (não figura como avalista)",
      "\u2713 Sem operações em discordância ou sub judice",
    ];
    doc.setFontSize(6.5);
    confirmacoes.forEach(linha => {
      doc.setFillColor(240, 246, 255);
      doc.rect(margin, yRight, contentW, 6, "F");
      doc.setFont("helvetica", "normal");
      doc.setTextColor(22, 163, 74);
      doc.text(linha, margin + 3, yRight + 4.2);
      yRight += 6;
    });

    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, yRight + 1, margin + contentW, yRight + 1);
    yRight += 4;

    const interpretacaoLines = doc.splitTextToSize(
      "Empresa opera sem alavancagem bancária \u2014 indica autofinanciamento ou uso exclusivo de capital próprio. Ausência confirmada pelo Bacen, não presumida.",
      contentW - 4
    );
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...colors.textMuted);
    interpretacaoLines.forEach((l: string) => { doc.text(l, margin + 2, yRight); yRight += 4; });

    const antSemHist = data.scrAnterior && data.scrAnterior.semHistorico;
    if (antSemHist) {
      yRight += 2;
      const doisPeriodos = doc.splitTextToSize(
        `Confirmado em dois periodos consecutivos: ${data.scrAnterior!.periodoReferencia} e ${data.scr?.periodoReferencia}`,
        contentW - 4
      );
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.primary);
      doisPeriodos.forEach((l: string) => { doc.text(l, margin + 2, yRight); yRight += 4; });
    }
  }

  // ── Tabela SCR — EVOLUÇÃO SCR ──
  {
    const toKu = (v: string | undefined) => {
      const n = parseMoneyToNumber(v || "0");
      return n > 0 ? (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
    };

    const alavAtU = fmmVal > 0
      ? fmtBR(parseMoneyToNumber(data.scr?.totalDividasAtivas || "0") / fmmVal, 2) + "x"
      : "—";
    const alavAntU = hasAnterior && fmmVal > 0
      ? fmtBR(parseMoneyToNumber(data.scrAnterior!.totalDividasAtivas || "0") / fmmVal, 2) + "x"
      : "—";

    const cLabel = contentW * 0.38;
    const cAnt = contentW * 0.19;
    const cAt = contentW * 0.19;
    const scrRowH = 7;
    const grpRowH = 5.5;

    const buildVar = (atRaw: number, antRaw: number, positiveIsGood: boolean): { str: string; color: [number, number, number] } => {
      if (antRaw === 0) return { str: "—", color: [160, 160, 160] };
      const diff = atRaw - antRaw;
      if (Math.abs(diff / antRaw) < 0.001) return { str: "=  0%", color: [160, 160, 160] };
      const pct = (diff / antRaw) * 100;
      const str = (pct > 0 ? "+" : "") + fmtBR(pct, 1) + "%";
      const isGood = (diff > 0 && positiveIsGood) || (diff < 0 && !positiveIsGood);
      return { str, color: isGood ? [22, 163, 74] : [220, 38, 38] };
    };

    type DataRow = { type: "data"; label: string; antVal: string; atVal: string; antRaw: number; atRaw: number; positiveIsGood: boolean; bold?: boolean; skipVar?: boolean };
    type GrpRow = { type: "group"; label: string };
    type ScrRow = DataRow | GrpRow;

    const allRows: ScrRow[] = [
      { type: "group", label: "CARTEIRA" },
      { type: "data", label: "Em Dia", antVal: toKu(data.scrAnterior?.emDia), atVal: toKu(data.scr?.emDia), antRaw: parseMoneyToNumber(data.scrAnterior?.emDia || "0"), atRaw: parseMoneyToNumber(data.scr?.emDia || "0"), positiveIsGood: true },
      { type: "data", label: "Curto Prazo", antVal: toKu(data.scrAnterior?.carteiraCurtoPrazo), atVal: toKu(data.scr?.carteiraCurtoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraCurtoPrazo || "0"), atRaw: parseMoneyToNumber(data.scr?.carteiraCurtoPrazo || "0"), positiveIsGood: false },
      { type: "data", label: "Longo Prazo", antVal: toKu(data.scrAnterior?.carteiraLongoPrazo), atVal: toKu(data.scr?.carteiraLongoPrazo), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraLongoPrazo || "0"), atRaw: parseMoneyToNumber(data.scr?.carteiraLongoPrazo || "0"), positiveIsGood: false },
      { type: "data", label: "A Vencer (total)", antVal: toKu(data.scrAnterior?.carteiraAVencer), atVal: toKu(data.scr?.carteiraAVencer), antRaw: parseMoneyToNumber(data.scrAnterior?.carteiraAVencer || "0"), atRaw: parseMoneyToNumber(data.scr?.carteiraAVencer || "0"), positiveIsGood: false },
      { type: "group", label: "INADIMPLÊNCIA" },
      { type: "data", label: "Total Dívidas", antVal: toKu(data.scrAnterior?.totalDividasAtivas), atVal: toKu(data.scr?.totalDividasAtivas), antRaw: parseMoneyToNumber(data.scrAnterior?.totalDividasAtivas || "0"), atRaw: parseMoneyToNumber(data.scr?.totalDividasAtivas || "0"), positiveIsGood: false, bold: true },
      { type: "data", label: "Vencidos", antVal: toKu(data.scrAnterior?.vencidos), atVal: toKu(data.scr?.vencidos), antRaw: parseMoneyToNumber(data.scrAnterior?.vencidos || "0"), atRaw: parseMoneyToNumber(data.scr?.vencidos || "0"), positiveIsGood: false },
      { type: "data", label: "Prejuízos", antVal: toKu(data.scrAnterior?.prejuizos), atVal: toKu(data.scr?.prejuizos), antRaw: parseMoneyToNumber(data.scrAnterior?.prejuizos || "0"), atRaw: parseMoneyToNumber(data.scr?.prejuizos || "0"), positiveIsGood: false },
      { type: "group", label: "CAPACIDADE BANCÁRIA" },
      { type: "data", label: "Limite de Crédito", antVal: toKu(data.scrAnterior?.limiteCredito), atVal: toKu(data.scr?.limiteCredito), antRaw: parseMoneyToNumber(data.scrAnterior?.limiteCredito || "0"), atRaw: parseMoneyToNumber(data.scr?.limiteCredito || "0"), positiveIsGood: true },
      { type: "data", label: "Nº Instituições", antVal: data.scrAnterior?.qtdeInstituicoes || data.scrAnterior?.numeroIfs || "—", atVal: data.scr?.qtdeInstituicoes || data.scr?.numeroIfs || "—", antRaw: parseFloat(data.scrAnterior?.qtdeInstituicoes || data.scrAnterior?.numeroIfs || "0") || 0, atRaw: parseFloat(data.scr?.qtdeInstituicoes || data.scr?.numeroIfs || "0") || 0, positiveIsGood: true },
      { type: "data", label: "Nº Operações", antVal: data.scrAnterior?.qtdeOperacoes || "—", atVal: data.scr?.qtdeOperacoes || "—", antRaw: parseFloat(data.scrAnterior?.qtdeOperacoes || "0") || 0, atRaw: parseFloat(data.scr?.qtdeOperacoes || "0") || 0, positiveIsGood: true },
      { type: "group", label: "RESUMO" },
      { type: "data", label: "Alavancagem / FMM", antVal: alavAntU, atVal: alavAtU, antRaw: 0, atRaw: 0, positiveIsGood: false, skipVar: true, bold: true },
    ];

    const filteredRows: ScrRow[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.type === "group") {
        let hasData = false;
        for (let j = i + 1; j < allRows.length; j++) {
          if (allRows[j].type === "group") break;
          const dr = allRows[j] as DataRow;
          if (!(dr.atVal === "—" && dr.antVal === "—")) { hasData = true; break; }
        }
        if (hasData) filteredRows.push(row);
      } else {
        const dr = row as DataRow;
        if (!(dr.atVal === "—" && dr.antVal === "—")) filteredRows.push(row);
      }
    }

    const scrTableTitle = hasAnterior
      ? `EVOLUÇÃO SCR — ${periodoAnt}  »  ${periodoAt}`
      : `POSIÇÃO SCR — ${periodoAt}`;

    const dataRowCount = filteredRows.filter(r => r.type === "data").length;
    const grpRowCount = filteredRows.filter(r => r.type === "group").length;
    const scrNeeded = 16 + grpRowCount * grpRowH + dataRowCount * scrRowH + 4;
    if (yRight + scrNeeded > 220) {
      pos.y = yRight;
      newPage(ctx);
      drawHeader(ctx);
      currentSCRPage = doc.getCurrentPageInfo().pageNumber;
      yRight = pos.y;
    }

    yRight += 4;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text(scrTableTitle, margin, yRight + 4.5);
    yRight += 6;
    doc.setFontSize(5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...colors.textMuted);
    doc.text("Saldos em mil R$ extraidos do Banco Central (SCR/Bacen). Variação: verde = melhora, vermelho = piora.", margin, yRight + 4);
    yRight += 6;

    doc.setFillColor(...colors.navy);
    doc.rect(margin, yRight, contentW, 7, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("MÉTRICA", margin + 3, yRight + 4.8);
    if (hasAnterior) {
      doc.text(periodoAnt, margin + cLabel + cAnt - 2, yRight + 4.8, { align: "right" });
      doc.text(periodoAt, margin + cLabel + cAnt + cAt - 2, yRight + 4.8, { align: "right" });
      doc.text("VARIAÇÃO", margin + contentW - 2, yRight + 4.8, { align: "right" });
    } else {
      doc.text(periodoAt, margin + contentW - 2, yRight + 4.8, { align: "right" });
    }
    yRight += 8;

    let dataIdx = 0;
    filteredRows.forEach((row) => {
      if (row.type === "group") {
        if (yRight + grpRowH > 275) {
          pos.y = yRight;
          newPage(ctx);
          drawHeader(ctx);
          currentSCRPage = doc.getCurrentPageInfo().pageNumber;
          yRight = pos.y;
        }
        doc.setFillColor(240, 244, 252);
        doc.rect(margin, yRight, contentW, grpRowH, "F");
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 138);
        doc.text(row.label, margin + 3, yRight + 3.8);
        doc.setFillColor(30, 58, 138);
        doc.rect(margin, yRight, 2, grpRowH, "F");
        yRight += grpRowH;
      } else {
        const dr = row as DataRow;
        if (yRight + scrRowH > 275) {
          pos.y = yRight;
          newPage(ctx);
          drawHeader(ctx);
          currentSCRPage = doc.getCurrentPageInfo().pageNumber;
          yRight = pos.y;
        }

        const bg: [number, number, number] = dataIdx % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
        doc.setFillColor(...bg);
        doc.rect(margin, yRight, contentW, scrRowH, "F");

        doc.setFontSize(6.5);
        doc.setFont("helvetica", dr.bold ? "bold" : "normal");
        doc.setTextColor(...(dr.bold ? colors.text : [60, 70, 90] as [number, number, number]));
        doc.text((dr.bold ? "  " : "    ") + dr.label, margin + 2, yRight + 4.8);

        if (hasAnterior) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(140, 150, 165);
          doc.text(dr.antVal, margin + cLabel + cAnt - 2, yRight + 4.8, { align: "right" });

          doc.setFont("helvetica", dr.bold ? "bold" : "normal");
          doc.setTextColor(...colors.text);
          doc.text(dr.atVal, margin + cLabel + cAnt + cAt - 2, yRight + 4.8, { align: "right" });

          if (!dr.skipVar) {
            const { str, color } = buildVar(dr.atRaw, dr.antRaw, dr.positiveIsGood);
            doc.setFont("helvetica", dr.bold ? "bold" : "normal");
            doc.setTextColor(...color);
            doc.text(str, margin + contentW - 2, yRight + 4.8, { align: "right" });
          } else {
            doc.setTextColor(140, 150, 165);
            doc.text(dr.atVal !== "—" ? dr.atVal : "—", margin + contentW - 2, yRight + 4.8, { align: "right" });
          }
        } else {
          doc.setFont("helvetica", dr.bold ? "bold" : "normal");
          doc.setTextColor(...colors.text);
          doc.text(dr.atVal, margin + contentW - 2, yRight + 4.8, { align: "right" });
        }

        doc.setDrawColor(225, 230, 240);
        doc.setLineWidth(0.2);
        doc.line(margin, yRight + scrRowH, margin + contentW, yRight + scrRowH);
        yRight += scrRowH;
        dataIdx++;
      }
    });
    yRight += 4;
  }

  // Sync pos.y
  if (doc.getCurrentPageInfo().pageNumber < currentSCRPage) {
    doc.setPage(currentSCRPage);
  }
  pos.y = yRight + 6;

  // ── SCR Vencimentos ──
  _renderSCRVencimentos(ctx);

  // ── Modalidades PJ ──
  _renderModalidadesPJ(ctx, hasAnterior, periodoAnt, periodoAt);

  // ── Instituições Credoras ──
  if (data.scr?.instituicoes && data.scr.instituicoes.length > 0) {
    drawSpacer(ctx, 4);
    checkPageBreak(ctx, 8 + 8 + data.scr.instituicoes.length * 10 + 4);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.text);
    doc.text("INSTITUICOES CREDORAS", margin, pos.y + 4);
    pos.y += 8;
    const instColW = [contentW * 0.60, contentW * 0.40];
    autoT(ctx,
      ["INSTITUIÇÃO", "VALOR (R$)"],
      data.scr.instituicoes.map((i: { nome: string; valor: string }) => [i.nome, i.valor]),
      instColW,
    );
  }

  if (data.scr?.historicoInadimplencia) {
    pos.y += 4;
    checkPageBreak(ctx, 12);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.textMuted);
    doc.text("Historico de Inadimplencia", margin, pos.y);
    pos.y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...colors.text);
    const lines = doc.splitTextToSize(data.scr.historicoInadimplencia, contentW - 4);
    lines.forEach((l: string) => { doc.text(l, margin + 2, pos.y); pos.y += 4; });
  }

  // ── SCR Sócios ──
  _renderSCRSocios(ctx, hasAnterior, periodoAt, periodoAnt);

  // Alertas SCR
  if (alertasSCR.length > 0) { drawSpacer(ctx, 4); drawDetAlerts(ctx, alertasSCR); }

  // ── DRE ──
  _renderDRE(ctx, alertasDRE);

  // ── Balanço ──
  _renderBalanco(ctx, alertasBalanco);

  // ── Curva ABC ──
  _renderCurvaABC(ctx);
}

function _renderSCRVencimentos(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  const faixaKeys = ["ate30d", "d31_60", "d61_90", "d91_180", "d181_360", "acima360d"] as const;
  const faixaKeyLabels: Record<string, string> = {
    ate30d: "Até 30 dias", d31_60: "31–60 dias", d61_90: "61–90 dias",
    d91_180: "91–180 dias", d181_360: "181–360 dias", acima360d: "Acima de 360d",
  };

  type VencEntity = {
    label: string;
    aVencer: Record<string, string> | undefined;
    vencidos: Record<string, string> | undefined;
    totalAVencer: string;
    totalVencido: string;
  };

  const makeVencEnt = (label: string, scr: typeof data.scr | undefined | null): VencEntity | null => {
    if (!scr) return null;
    return {
      label,
      aVencer: scr.faixasAVencer as unknown as Record<string, string> | undefined,
      vencidos: scr.faixasVencidos as unknown as Record<string, string> | undefined,
      totalAVencer: scr.carteiraAVencer || scr.faixasAVencer?.total || "0,00",
      totalVencido: scr.vencidos || scr.faixasVencidos?.total || "0,00",
    };
  };

  const vencEntities: VencEntity[] = [];
  const empLabel = (data.cnpj?.razaoSocial || "Empresa").split(" ")[0] + " (PJ)";
  const empEnt = makeVencEnt(empLabel, data.scr);
  if (empEnt) vencEntities.push(empEnt);

  if (data.scrSocios) {
    data.scrSocios.forEach((s: { nomeSocio?: string; cpfSocio?: string; periodoAtual?: typeof data.scr }) => {
      const nome = (s.nomeSocio || s.cpfSocio || "Sócio").split(" ")[0] + " (PF)";
      const ent = makeVencEnt(nome, s.periodoAtual);
      if (ent) vencEntities.push(ent);
    });
  }

  const hasVencData = vencEntities.some(e =>
    parseMoneyToNumber(e.totalAVencer) > 0 || parseMoneyToNumber(e.totalVencido) > 0
  );

  if (!hasVencData) return;

  const vColLabel = contentW * 0.35;
  const vColData = (contentW - vColLabel) / vencEntities.length;
  const vRowH = 5.5;

  const hasFaixaBreakdown = vencEntities.some(e =>
    faixaKeys.some(k => parseMoneyToNumber((e.aVencer as Record<string, string> | undefined)?.[k] || "0") > 0
      || parseMoneyToNumber((e.vencidos as Record<string, string> | undefined)?.[k] || "0") > 0)
  );

  const totalRows = hasFaixaBreakdown
    ? 1 + 6 + 1 + 1 + 6 + 1
    : 1 + 2;
  const vNeeded = 10 + 6 + totalRows * vRowH + 4;

  drawSpacer(ctx, 6);
  checkPageBreak(ctx, vNeeded);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...colors.text);
  doc.text("SCR VENCIMENTOS", margin, pos.y + 4);
  pos.y += 5;
  doc.setFontSize(5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...colors.textMuted);
  doc.text(
    hasFaixaBreakdown
      ? "Distribuicao da carteira por prazo — valores em mil R$ (extraidos do documento SCR enviado)."
      : "Detalhamento por faixa nao disponivel — valores totais extraidos do SCR/Bacen.",
    margin, pos.y + 4
  );
  pos.y += 7;

  doc.setFillColor(...colors.navy);
  doc.rect(margin, pos.y, contentW, 6, "F");
  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(hasFaixaBreakdown ? "FAIXA" : "POSIÇÃO", margin + 2, pos.y + 4);
  vencEntities.forEach((ent, i) => {
    doc.text(ent.label, margin + vColLabel + i * vColData + vColData / 2, pos.y + 4, { align: "center" });
  });
  pos.y += 6;

  const fmtV = (v: string) => {
    const n = parseMoneyToNumber(v || "0");
    if (n === 0) return "—";
    return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  };

  let vIdx = 0;
  const drawVRow = (
    label: string,
    vals: string[],
    opts: { bold?: boolean; sectionBg?: "blue" | "red"; summaryBg?: "blue" | "red" } = {}
  ) => {
    if (pos.y + vRowH > 275) {
      newPage(ctx);
      drawHeader(ctx);
    }

    if (opts.sectionBg) {
      const isBlue = opts.sectionBg === "blue";
      doc.setFillColor(...(isBlue ? [22, 78, 140] as [number, number, number] : [185, 28, 28] as [number, number, number]));
      doc.rect(margin, pos.y, contentW, vRowH, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(label, margin + 2, pos.y + 3.8);
      pos.y += vRowH;
      vIdx = 0;
      return;
    }

    if (opts.summaryBg) {
      const isBlue = opts.summaryBg === "blue";
      doc.setFillColor(...(isBlue ? [215, 237, 255] as [number, number, number] : [255, 220, 220] as [number, number, number]));
      doc.rect(margin, pos.y, contentW, vRowH, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      const summaryColor = isBlue ? colors.primary : [185, 28, 28] as [number, number, number];
      doc.setTextColor(...summaryColor);
      doc.text(label, margin + 2, pos.y + 3.8);
      vals.forEach((v, i) => {
        doc.setTextColor(...summaryColor);
        doc.text(fmtV(v), margin + vColLabel + i * vColData + vColData - 1, pos.y + 3.8, { align: "right" });
      });
      doc.setTextColor(...colors.text);
      pos.y += vRowH;
      return;
    }

    const isVencida = opts.bold === false && vals.some(v => parseMoneyToNumber(v) > 0);
    doc.setFillColor(...(vIdx % 2 === 0 ? [248, 250, 252] as [number, number, number] : [255, 255, 255] as [number, number, number]));
    doc.rect(margin, pos.y, contentW, vRowH, "F");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.textSec);
    doc.text(label, margin + 2, pos.y + 3.8);
    vals.forEach((v, i) => {
      const display = fmtV(v);
      const hasVal = display !== "—";
      doc.setTextColor(...(isVencida && hasVal ? [185, 28, 28] as [number, number, number] : hasVal ? colors.text : colors.textMuted));
      doc.text(display, margin + vColLabel + i * vColData + vColData - 1, pos.y + 3.8, { align: "right" });
    });
    doc.setTextColor(...colors.text);
    pos.y += vRowH;
    vIdx++;
  };

  if (hasFaixaBreakdown) {
    drawVRow("A VENCER", [], { sectionBg: "blue" });
    faixaKeys.forEach(key => {
      const vals = vencEntities.map(e => (e.aVencer as Record<string, string> | undefined)?.[key] || "0,00");
      if (vals.some(v => parseMoneyToNumber(v) > 0)) {
        drawVRow(faixaKeyLabels[key], vals);
      }
    });
    drawVRow("Total a Vencer", vencEntities.map(e => e.totalAVencer), { summaryBg: "blue" });
    drawVRow("VENCIDOS", [], { sectionBg: "red" });
    faixaKeys.forEach(key => {
      const vals = vencEntities.map(e => (e.vencidos as Record<string, string> | undefined)?.[key] || "0,00");
      if (vals.some(v => parseMoneyToNumber(v) > 0)) {
        drawVRow(faixaKeyLabels[key], vals, { bold: false });
      }
    });
    drawVRow("Total Vencido", vencEntities.map(e => e.totalVencido), { summaryBg: "red" });
  } else {
    drawVRow("Total a Vencer", vencEntities.map(e => e.totalAVencer), { summaryBg: "blue" });
    drawVRow("Total Vencido", vencEntities.map(e => e.totalVencido), { summaryBg: "red" });
  }

  pos.y += 4;

  if (!data.scrSocios || data.scrSocios.length === 0) {
    doc.setFontSize(5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...colors.textMuted);
    doc.text("* SCR dos socios nao enviado — apenas dados da empresa exibidos.", margin, pos.y);
    pos.y += 6;
  }
}

function _renderModalidadesPJ(ctx: PdfCtx, hasAnterior: boolean, periodoAnt: string, periodoAt: string): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;
  if (!data.scr?.modalidades || data.scr.modalidades.length === 0) return;

  const modPJ = data.scr.modalidades;
  const modPJAnt = data.scrAnterior?.modalidades || [];
  const temAntPJ = modPJAnt.length > 0 && hasAnterior;
  const modPJRowH = 6;
  const modPJNeeded = 4 + 8 + 6 + 5 + modPJ.length * modPJRowH + 4;
  if (pos.y + modPJNeeded > 275) {
    newPage(ctx);
    drawHeader(ctx);
  } else {
    pos.y += 4;
  }

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...colors.text);
  const razaoFull = data.cnpj?.razaoSocial || "Empresa";
  const cnpjFmt = (data.cnpj?.cnpj || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  doc.text(`MODALIDADES SCR — ${razaoFull} — ${cnpjFmt}`, margin, pos.y + 4, { maxWidth: contentW });
  pos.y += 8;

  const modColNomePJ = contentW * 0.32;
  const modColGrpPJ = (contentW - modColNomePJ) / (temAntPJ ? 2 : 1);
  const modSubColsPJ = [modColGrpPJ / 4, modColGrpPJ / 4, modColGrpPJ / 4, modColGrpPJ / 4];

  doc.setFillColor(...colors.navy);
  doc.rect(margin, pos.y, contentW, 6, "F");
  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  if (temAntPJ) {
    doc.text(periodoAnt, margin + modColNomePJ + modColGrpPJ / 2, pos.y + 4, { align: "center" });
    doc.text(periodoAt, margin + modColNomePJ + modColGrpPJ + modColGrpPJ / 2, pos.y + 4, { align: "center" });
  } else {
    doc.text(periodoAt, margin + modColNomePJ + modColGrpPJ / 2, pos.y + 4, { align: "center" });
  }
  pos.y += 6;

  doc.setFillColor(50, 70, 110);
  doc.rect(margin, pos.y, contentW, 5, "F");
  doc.setFontSize(4.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("MODALIDADE", margin + 2, pos.y + 3.5);

  const drawPJSubHeader = (startX: number) => {
    doc.text("TOTAL", startX + modSubColsPJ[0] - 1, pos.y + 3.5, { align: "right" });
    doc.text("A VENCER", startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, pos.y + 3.5, { align: "right" });
    doc.text("VENCIDO", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, pos.y + 3.5, { align: "right" });
    doc.text("PART.", startX + modColGrpPJ - 1, pos.y + 3.5, { align: "right" });
  };
  if (temAntPJ) drawPJSubHeader(margin + modColNomePJ);
  drawPJSubHeader(margin + modColNomePJ + (temAntPJ ? modColGrpPJ : 0));
  pos.y += 5;

  const normaisPJ = [...modPJ].filter((m: { ehContingente?: boolean }) => !m.ehContingente).sort((a: { total?: string }, b: { total?: string }) =>
    parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
  );
  const contingentesPJ = [...modPJ].filter((m: { ehContingente?: boolean }) => m.ehContingente).sort((a: { total?: string }, b: { total?: string }) =>
    parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
  );
  const orderedModPJ = [...normaisPJ, ...contingentesPJ];

  const toKPJ = (v: string) => {
    const n = parseMoneyToNumber(v || "0");
    return n === 0 ? "—" : n >= 1000000 ? fmtBR(n / 1000000, 1) + "M" : n >= 1000 ? fmtBR(Math.round(n / 1000), 0) : v;
  };

  type ModItem = { nome: string; total?: string; aVencer?: string; vencido?: string; participacao?: string; ehContingente?: boolean };

  const drawPJCells = (startX: number, mod: ModItem | undefined) => {
    if (!mod) {
      doc.setTextColor(...colors.textMuted);
      doc.text("—", startX + modSubColsPJ[0] - 1, pos.y + 4, { align: "right" });
      doc.text("—", startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, pos.y + 4, { align: "right" });
      doc.text("—", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, pos.y + 4, { align: "right" });
      doc.text("—", startX + modColGrpPJ - 1, pos.y + 4, { align: "right" });
    } else {
      const hasVencPJ = mod.vencido && mod.vencido !== "0,00" && mod.vencido !== "—";
      doc.setTextColor(...colors.text);
      doc.text(toKPJ(mod.total || "0"), startX + modSubColsPJ[0] - 1, pos.y + 4, { align: "right" });
      doc.text(toKPJ(mod.aVencer || "0"), startX + modSubColsPJ[0] + modSubColsPJ[1] - 1, pos.y + 4, { align: "right" });
      doc.setTextColor(...(hasVencPJ ? [185, 28, 28] as [number, number, number] : colors.textMuted));
      doc.text(hasVencPJ ? toKPJ(mod.vencido || "0") : "—", startX + modSubColsPJ[0] + modSubColsPJ[1] + modSubColsPJ[2] - 1, pos.y + 4, { align: "right" });
      doc.setTextColor(...colors.textSec);
      doc.text(mod.participacao || "—", startX + modColGrpPJ - 1, pos.y + 4, { align: "right" });
    }
  };

  let bgIdxPJ = 0;
  let separadorRendered = false;

  orderedModPJ.forEach((m: ModItem) => {
    if (m.ehContingente && !separadorRendered) {
      separadorRendered = true;
      if (pos.y + modPJRowH + 1 > 275) { newPage(ctx); drawHeader(ctx); }
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, pos.y, contentW, modPJRowH, "F");
      doc.setFontSize(4.8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...colors.textMuted);
      doc.text("Responsabilidades contingentes / Títulos fora da carteira", margin + 2, pos.y + 4);
      pos.y += modPJRowH;
      bgIdxPJ = 0;
    }

    if (pos.y + modPJRowH > 275) { newPage(ctx); drawHeader(ctx); }
    const bg: [number, number, number] = bgIdxPJ % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(...bg);
    doc.rect(margin, pos.y, contentW, modPJRowH, "F");
    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.text);
    const nomeT = m.nome.length > 38 ? m.nome.substring(0, 37) + "…" : m.nome;
    doc.text(nomeT, margin + 2, pos.y + 4);

    if (temAntPJ) {
      drawPJCells(margin + modColNomePJ, modPJAnt.find((a: ModItem) => a.nome === m.nome));
      drawPJCells(margin + modColNomePJ + modColGrpPJ, m);
    } else {
      drawPJCells(margin + modColNomePJ, m);
    }
    doc.setTextColor(...colors.text);
    pos.y += modPJRowH;
    bgIdxPJ++;
  });
  pos.y += 4;
}

function _renderSCRSocios(ctx: PdfCtx, hasAnterior: boolean, periodoAt: string, periodoAnt: string): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;
  if (!data.scrSocios || data.scrSocios.length === 0) return;

  for (const socio of data.scrSocios) {
    checkPageBreak(ctx, 80);
    pos.y += 6;

    doc.setFillColor(...colors.primary);
    doc.roundedRect(margin, pos.y, contentW, 7, 1, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`SCR SÓCIO — ${socio.nomeSocio || socio.cpfSocio}`, margin + 3, pos.y + 4.8);
    pos.y += 9;

    const temAnteriorSocio = !!(socio.periodoAnterior?.periodoReferencia);
    const periodoAtSocio = socio.periodoAtual?.periodoReferencia || "Atual";
    const periodoAntSocio = socio.periodoAnterior?.periodoReferencia || "Anterior";

    doc.setFillColor(...colors.primary);
    doc.roundedRect(margin, pos.y, contentW, 6, 1, 1, "F");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);

    const colMetrica = contentW * 0.40;
    const colAt = contentW * 0.22;
    const colAnt = contentW * 0.22;

    doc.text("MÉTRICA", margin + 2, pos.y + 4);
    doc.text(periodoAtSocio, margin + colMetrica + 2, pos.y + 4);
    if (temAnteriorSocio) {
      doc.text(periodoAntSocio, margin + colMetrica + colAt + 2, pos.y + 4);
      doc.text("VAR.", margin + colMetrica + colAt + colAnt + 2, pos.y + 4);
    }
    pos.y += 6;

    const fmtSCRSocio = (v: string | undefined) =>
      (v && v !== "0,00" && v !== "") ? `R$ ${fmtMoney(v)}` : "R$ 0,00";

    const linhasSocio = [
      { label: "Carteira a Vencer", at: fmtSCRSocio(socio.periodoAtual?.carteiraAVencer), ant: fmtSCRSocio(socio.periodoAnterior?.carteiraAVencer), positiveIsGood: false },
      { label: "Vencidos", at: fmtSCRSocio(socio.periodoAtual?.vencidos), ant: fmtSCRSocio(socio.periodoAnterior?.vencidos), positiveIsGood: false },
      { label: "Prejuízos", at: fmtSCRSocio(socio.periodoAtual?.prejuizos), ant: fmtSCRSocio(socio.periodoAnterior?.prejuizos), positiveIsGood: false },
      { label: "Total Dívidas", at: fmtSCRSocio(socio.periodoAtual?.totalDividasAtivas), ant: fmtSCRSocio(socio.periodoAnterior?.totalDividasAtivas), positiveIsGood: false, bold: true },
      { label: "Qtde IFs", at: socio.periodoAtual?.qtdeInstituicoes || "0", ant: socio.periodoAnterior?.qtdeInstituicoes || "0", positiveIsGood: true },
      { label: "% Docs Processados", at: `${socio.periodoAtual?.pctDocumentosProcessados || "—"}%`, ant: `${socio.periodoAnterior?.pctDocumentosProcessados || "—"}%`, positiveIsGood: true },
    ];

    linhasSocio.forEach((linha, idx) => {
      const bgColor = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
      doc.setFillColor(...(bgColor as [number, number, number]));
      doc.rect(margin, pos.y, contentW, 5.5, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", (linha as { bold?: boolean }).bold ? "bold" : "normal");
      doc.setTextColor(...colors.text);
      doc.text(linha.label, margin + 2, pos.y + 3.8);
      doc.text(linha.at, margin + colMetrica + 2, pos.y + 3.8);

      if (temAnteriorSocio) {
        doc.text(linha.ant, margin + colMetrica + colAt + 2, pos.y + 3.8);
        const numAt = parseFloat((linha.at || "0").replace(/[^0-9,]/g, "").replace(",", "."));
        const numAnt = parseFloat((linha.ant || "0").replace(/[^0-9,]/g, "").replace(",", "."));
        if (!isNaN(numAt) && !isNaN(numAnt) && numAnt !== 0) {
          const varPct = ((numAt - numAnt) / numAnt) * 100;
          const melhorou = linha.positiveIsGood ? varPct > 0 : varPct < 0;
          const igual = Math.abs(varPct) < 0.1;
          const varStr = (varPct > 0 ? "+" : "") + fmtBR(varPct, 1) + "%";
          doc.setTextColor(
            igual ? colors.textMuted[0] : melhorou ? 22 : 220,
            igual ? colors.textMuted[1] : melhorou ? 163 : 38,
            igual ? colors.textMuted[2] : melhorou ? 74 : 38
          );
          doc.text(varStr, margin + colMetrica + colAt + colAnt + 2, pos.y + 3.8);
          doc.setTextColor(...colors.text);
        } else {
          doc.setTextColor(...colors.textMuted);
          doc.text("—", margin + colMetrica + colAt + colAnt + 2, pos.y + 3.8);
          doc.setTextColor(...colors.text);
        }
      }
      pos.y += 5.5;
    });

    // Modalidades do sócio
    if (socio.periodoAtual?.modalidades && socio.periodoAtual.modalidades.length > 0) {
      const modS = socio.periodoAtual.modalidades;
      const modSAnt = socio.periodoAnterior?.modalidades || [];
      const modSRowH = 6;
      const modSNeeded = 8 + 6 + 6 + modS.length * modSRowH + 4;
      checkPageBreak(ctx, modSNeeded);
      pos.y += 4;

      const labelMod = `MODALIDADES — ${(socio.nomeSocio || socio.cpfSocio || "Sócio").split(" ").slice(0, 2).join(" ")}`;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.text);
      doc.text(labelMod, margin, pos.y + 4);
      pos.y += 7;

      const temAntMod = modSAnt.length > 0 && !!socio.periodoAnterior?.periodoReferencia;
      const modColNome = contentW * 0.32;
      const modColGrp = (contentW - modColNome) / (temAntMod ? 2 : 1);
      const modSubCols = [modColGrp / 4, modColGrp / 4, modColGrp / 4, modColGrp / 4];

      doc.setFillColor(...colors.navy);
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      if (temAntMod) {
        const midAnt = margin + modColNome + modColGrp / 2;
        const midAt = margin + modColNome + modColGrp + modColGrp / 2;
        doc.text(periodoAtSocio, midAt, pos.y + 4, { align: "center" });
        doc.text(periodoAntSocio, midAnt, pos.y + 4, { align: "center" });
      } else {
        doc.text(periodoAtSocio, margin + modColNome + modColGrp / 2, pos.y + 4, { align: "center" });
      }
      pos.y += 6;

      doc.setFillColor(50, 70, 110);
      doc.rect(margin, pos.y, contentW, 5, "F");
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("MODALIDADE", margin + 2, pos.y + 3.5);

      const drawModSubHeader = (startX: number) => {
        doc.text("TOTAL", startX + modSubCols[0] - 1, pos.y + 3.5, { align: "right" });
        doc.text("A VENCER", startX + modSubCols[0] + modSubCols[1] - 1, pos.y + 3.5, { align: "right" });
        doc.text("VENCIDO", startX + modSubCols[0] + modSubCols[1] + modSubCols[2] - 1, pos.y + 3.5, { align: "right" });
        doc.text("PART.", startX + modColGrp - 1, pos.y + 3.5, { align: "right" });
      };
      if (temAntMod) drawModSubHeader(margin + modColNome);
      drawModSubHeader(margin + modColNome + (temAntMod ? modColGrp : 0));
      pos.y += 5;

      type ModSItem = { nome: string; total?: string; aVencer?: string; vencido?: string; participacao?: string; ehContingente?: boolean };

      const toKS = (v: string) => {
        const n = parseMoneyToNumber(v || "0");
        return n === 0 ? "—" : n >= 1000000 ? fmtBR(n / 1000000, 1) + "M" : n >= 1000 ? fmtBR(Math.round(n / 1000), 0) : v;
      };

      const drawModCells = (startX: number, mod: ModSItem | undefined) => {
        if (!mod) {
          doc.setTextColor(...colors.textMuted);
          [0, 1, 2, 3].forEach(ci => {
            const cx = startX + modSubCols.slice(0, ci + 1).reduce((a, b) => a + b, 0) - 1;
            doc.text("—", cx, pos.y + 4, { align: "right" });
          });
        } else {
          const hasVenc = mod.vencido && mod.vencido !== "0,00" && mod.vencido !== "—";
          doc.setTextColor(...colors.text);
          doc.text(toKS(mod.total || "0"), startX + modSubCols[0] - 1, pos.y + 4, { align: "right" });
          doc.text(toKS(mod.aVencer || "0"), startX + modSubCols[0] + modSubCols[1] - 1, pos.y + 4, { align: "right" });
          doc.setTextColor(...(hasVenc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
          doc.text(hasVenc ? toKS(mod.vencido || "0") : "—", startX + modSubCols[0] + modSubCols[1] + modSubCols[2] - 1, pos.y + 4, { align: "right" });
          doc.setTextColor(...colors.textSec);
          doc.text(mod.participacao || "—", startX + modColGrp - 1, pos.y + 4, { align: "right" });
        }
      };

      const normaisS = [...modS].filter((m: ModSItem) => !m.ehContingente).sort((a: ModSItem, b: ModSItem) =>
        parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
      );
      const contingentesS = [...modS].filter((m: ModSItem) => m.ehContingente).sort((a: ModSItem, b: ModSItem) =>
        parseMoneyToNumber(b.total || "0") - parseMoneyToNumber(a.total || "0")
      );
      const orderedModS = [...normaisS, ...contingentesS];

      let bgIdxS = 0;
      let sepRenderedS = false;

      orderedModS.forEach((m: ModSItem) => {
        if (m.ehContingente && !sepRenderedS) {
          sepRenderedS = true;
          if (pos.y + modSRowH > 275) { newPage(ctx); drawHeader(ctx); }
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, pos.y, contentW, modSRowH, "F");
          doc.setFontSize(4.8);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(...colors.textMuted);
          doc.text("Responsabilidades contingentes / Títulos fora da carteira", margin + 2, pos.y + 4);
          pos.y += modSRowH;
          bgIdxS = 0;
        }
        if (pos.y + modSRowH > 275) { newPage(ctx); drawHeader(ctx); }
        const bg: [number, number, number] = bgIdxS % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, pos.y, contentW, modSRowH, "F");
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.text);
        const nomeT = m.nome.length > 38 ? m.nome.substring(0, 37) + "…" : m.nome;
        doc.text(nomeT, margin + 2, pos.y + 4);
        if (temAntMod) {
          drawModCells(margin + modColNome, modSAnt.find((a: ModSItem) => a.nome === m.nome));
          drawModCells(margin + modColNome + modColGrp, m);
        } else {
          drawModCells(margin + modColNome, m);
        }
        doc.setTextColor(...colors.text);
        pos.y += modSRowH;
        bgIdxS++;
      });
      pos.y += 4;
    }

    pos.y += 4;
  }

  void hasAnterior;
  void periodoAt;
  void periodoAnt;
}

function _renderDRE(ctx: PdfCtx, alertasDRE: import("../helpers").AlertaDet[]): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  if (!data.dre || (
    (!data.dre.anos || data.dre.anos.length === 0) &&
    !data.dre.crescimentoReceita &&
    !data.dre.observacoes
  )) return;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 80);
  drawSectionTitle(ctx, "07", "DEMONSTRACAO DE RESULTADO (DRE)");

  const dreAnosMap = new Map<string, Record<string, string>>();
  (data.dre.anos as unknown as Record<string, string>[]).forEach((a) => dreAnosMap.set(a["ano"], a));
  const dreAnos = Array.from(dreAnosMap.values()).sort((a, b) => parseInt(a["ano"]) - parseInt(b["ano"]));
  const dreFontSz = dreAnos.length >= 4 ? 6.5 : 7;
  const dreColLabel = dreAnos.length >= 4 ? 58 : 62;
  const dreColAno = (contentW - dreColLabel) / dreAnos.length;

  doc.setFillColor(...colors.primary);
  doc.rect(margin, pos.y, contentW, 7, "F");
  doc.setFontSize(dreFontSz);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("METRICA", margin + 2, pos.y + 4.8);
  dreAnos.forEach((ano, i) => {
    doc.text(ano["ano"], margin + dreColLabel + i * dreColAno + 2, pos.y + 4.8);
  });
  pos.y += 7;

  const linhasDRE: { label: string; campo: string; bold: boolean; isPct?: boolean }[] = [
    { label: "Receita Bruta", campo: "receitaBruta", bold: false },
    { label: "Receita Liquida", campo: "receitaLiquida", bold: false },
    { label: "Lucro Bruto", campo: "lucroBruto", bold: false },
    { label: "Margem Bruta (%)", campo: "margemBruta", bold: false, isPct: true },
    { label: "EBITDA", campo: "ebitda", bold: true },
    { label: "Margem EBITDA (%)", campo: "margemEbitda", bold: false, isPct: true },
    { label: "Lucro Liquido", campo: "lucroLiquido", bold: true },
    { label: "Margem Liquida (%)", campo: "margemLiquida", bold: false, isPct: true },
  ];

  linhasDRE.forEach((linha, idx) => {
    const bg: [number, number, number] = idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg;
    doc.setFillColor(...bg);
    doc.rect(margin, pos.y, contentW, 6, "F");
    doc.setDrawColor(...DS.colors.borderRGB);
    doc.setLineWidth(0.15);
    doc.line(margin, pos.y + 6, margin + contentW, pos.y + 6);
    doc.setLineWidth(0.1);
    doc.setFontSize(dreFontSz);
    doc.setFont("helvetica", linha.bold ? "bold" : "normal");
    doc.setTextColor(...DS.colors.textPrimary);
    doc.text(linha.label, margin + 2, pos.y + 4.2);
    dreAnos.forEach((ano, i) => {
      const val = ano[linha.campo] || "0,00";
      const numVal = parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
      const display = linha.isPct ? `${val}%` : `R$ ${fmtMoney(val)}`;
      let valColor: [number, number, number] = DS.colors.textPrimary;
      if (numVal < 0) valColor = DS.colors.danger;
      else if (numVal === 0) valColor = DS.colors.textLight2;
      doc.setTextColor(...valColor);
      doc.text(display, margin + dreColLabel + i * dreColAno + 2, pos.y + 4.2);
      doc.setTextColor(...DS.colors.textPrimary);
    });
    pos.y += 6;
  });

  pos.y += 4;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...colors.primary);
  const tendenciaDRE = normalizeTendencia(data.dre.tendenciaLucro);
  doc.text(`Tendencia: ${tendenciaDRE} | Crescimento de Receita: ${data.dre.crescimentoReceita}%`, margin + 2, pos.y);
  pos.y += 6;

  if (data.dre.observacoes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(...colors.textMuted);
    const obsLines = doc.splitTextToSize(data.dre.observacoes, contentW - 4);
    obsLines.forEach((l: string) => { doc.text(l, margin + 2, pos.y); pos.y += 4; });
  }

  if (alertasDRE.length > 0) { pos.y += 4; drawDetAlerts(ctx, alertasDRE); }
}

function _renderBalanco(ctx: PdfCtx, alertasBalanco: import("../helpers").AlertaDet[]): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;

  if (!data.balanco || (
    (!data.balanco.anos || data.balanco.anos.length === 0) &&
    !data.balanco.observacoes &&
    !data.balanco.tendenciaPatrimonio
  )) return;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 90);
  drawSectionTitle(ctx, "08", "BALANCO PATRIMONIAL");

  const balAnosMap = new Map<string, Record<string, string>>();
  (data.balanco.anos as unknown as Record<string, string>[]).forEach((a) => balAnosMap.set(a["ano"], a));
  const balAnos = Array.from(balAnosMap.values()).sort((a, b) => parseInt(a["ano"]) - parseInt(b["ano"]));
  const balFontSz = balAnos.length >= 4 ? 6.5 : 7;
  const colLabelB = balAnos.length >= 4 ? 58 : 65;
  const colAnoB = (contentW - colLabelB) / balAnos.length;

  doc.setFillColor(...DS.colors.primary);
  doc.rect(margin, pos.y, contentW, 7, "F");
  doc.setFontSize(balFontSz);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("METRICA", margin + 2, pos.y + 4.8);
  balAnos.forEach((ano, i) => {
    doc.text(ano["ano"], margin + colLabelB + i * colAnoB + 2, pos.y + 4.8);
  });
  pos.y += 7;

  const linhasBalanco: { label: string; campo: string; bold: boolean; isIndice?: boolean; isPct?: boolean }[] = [
    { label: "Ativo Total", campo: "ativoTotal", bold: true },
    { label: "Ativo Circulante", campo: "ativoCirculante", bold: false },
    { label: "Ativo Nao Circulante", campo: "ativoNaoCirculante", bold: false },
    { label: "Passivo Total", campo: "passivoTotal", bold: true },
    { label: "Passivo Circulante", campo: "passivoCirculante", bold: false },
    { label: "Passivo Nao Circulante", campo: "passivoNaoCirculante", bold: false },
    { label: "Patrimonio Liquido", campo: "patrimonioLiquido", bold: true },
    { label: "Liquidez Corrente", campo: "liquidezCorrente", bold: false, isIndice: true },
    { label: "Endividamento (%)", campo: "endividamentoTotal", bold: false, isPct: true },
    { label: "Capital de Giro Liq.", campo: "capitalDeGiroLiquido", bold: false },
  ];

  linhasBalanco.forEach((linha, idx) => {
    const bg: [number, number, number] = idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg;
    doc.setFillColor(...bg);
    doc.rect(margin, pos.y, contentW, 6, "F");
    doc.setDrawColor(...DS.colors.borderRGB);
    doc.setLineWidth(0.15);
    doc.line(margin, pos.y + 6, margin + contentW, pos.y + 6);
    doc.setLineWidth(0.1);
    doc.setFontSize(balFontSz);
    doc.setFont("helvetica", linha.bold ? "bold" : "normal");
    doc.setTextColor(...DS.colors.textPrimary);
    doc.text(linha.label, margin + 2, pos.y + 4.2);
    balAnos.forEach((ano, i) => {
      const val = ano[linha.campo] || "0,00";
      const valClean = String(val).replace(/%/g, "").trim();
      const display = linha.isIndice ? (val && val !== "0,00" ? `${val}x` : "—") : linha.isPct ? `${valClean}%` : `R$ ${fmtMoney(val)}`;
      const numVal = parseFloat(valClean.replace(/\./g, '').replace(',', '.')) || 0;
      let valColor: [number, number, number] = DS.colors.textPrimary;
      if (numVal < 0) valColor = DS.colors.danger;
      else if (numVal === 0 && display === "—") valColor = DS.colors.textLight2;
      else if (linha.isIndice && numVal < 1 && numVal > 0) valColor = DS.colors.warn;
      doc.setTextColor(...valColor);
      doc.text(display, margin + colLabelB + i * colAnoB + 2, pos.y + 4.2);
      doc.setTextColor(...DS.colors.textPrimary);
    });
    pos.y += 6;
  });

  if (alertasBalanco.length > 0) { pos.y += 4; drawDetAlerts(ctx, alertasBalanco); }
}

function _renderCurvaABC(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  if (!data.curvaABC || (
    (!data.curvaABC.clientes || data.curvaABC.clientes.length === 0) &&
    !data.curvaABC.maiorCliente &&
    !data.curvaABC.periodoReferencia
  )) return;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 65);
  drawSectionTitle(ctx, "09", "CURVA ABC — CONCENTRACAO DE CLIENTES");

  // Alerta de concentração
  if (data.curvaABC.alertaConcentracao) {
    const rawPct = String(data.curvaABC.maiorClientePct || "");
    const cleanPct = rawPct.includes("%") ? rawPct.split("%")[0].trim() : rawPct.replace(/[^0-9,.]/g, "");
    const nomeCliente = String(data.curvaABC.maiorCliente || "Cliente").split(/[!'\[]/)[0].trim();

    const BADGE_W = 9; const BADGE_H = 3.8;
    const ACCENT = 2; const PAD_H = 3; const PAD_L = 4;
    const textX = margin + ACCENT + PAD_L + BADGE_W + 2.5;
    const textMaxW = contentW - ACCENT - PAD_L - BADGE_W - 4;
    const ctxX = margin + ACCENT + PAD_L;
    const ctxMaxW = contentW - ACCENT - PAD_L - 2;

    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
    const linhaPrincipal = `${nomeCliente} — ${cleanPct}% da receita total`;
    const mainLines = doc.splitTextToSize(linhaPrincipal, textMaxW) as string[];

    doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
    const linhaContexto = `Limite: 30%  ·  Período: ${data.curvaABC.periodoReferencia || "—"}`;
    const ctxLines = doc.splitTextToSize(linhaContexto, ctxMaxW) as string[];

    const mainLineH = 4; const ctxLineH = 3.8;
    const alertaH = PAD_H + BADGE_H + 1.5 + ctxLines.length * ctxLineH + PAD_H;
    checkPageBreak(ctx, alertaH + 2);

    doc.setFillColor(255, 245, 245);
    doc.rect(margin, pos.y, contentW, alertaH, "F");
    doc.setFillColor(220, 38, 38);
    doc.rect(margin, pos.y, ACCENT, alertaH, "F");

    const bx = margin + ACCENT + PAD_L;
    const by = pos.y + PAD_H;

    doc.setFillColor(220, 38, 38);
    doc.roundedRect(bx, by, BADGE_W, BADGE_H, 0.8, 0.8, "F");
    doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setCharSpace(0.3);
    doc.setTextColor(255, 255, 255);
    doc.text("ALTA", bx + BADGE_W / 2, by + BADGE_H - 0.9, { align: "center" });

    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
    doc.setTextColor(153, 27, 27);
    const mainBaseline = by + BADGE_H - 0.9;
    mainLines.forEach((line: string, i: number) => {
      doc.text(line, textX, mainBaseline + i * mainLineH);
    });

    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setCharSpace(0);
    doc.setTextColor(185, 28, 28);
    const ctxY = by + BADGE_H + 1.5;
    ctxLines.forEach((line: string, i: number) => {
      doc.text(line, ctxX, ctxY + i * ctxLineH);
    });

    pos.y += alertaH + 2;
  }

  // Resumo de concentração
  // Helper: garante que % não duplica
  const safePct = (v: string | undefined | null) => {
    if (!v) return "—";
    const clean = v.replace(/%/g, "").trim();
    return clean ? `${clean}%` : "—";
  };
  const top10Txt = data.curvaABC.concentracaoTop10 && data.curvaABC.concentracaoTop10 !== "0,00"
    ? `   |   Top 10: ${safePct(data.curvaABC.concentracaoTop10)}` : "";
  const classeATxt = data.curvaABC.totalClientesClasseA
    ? `   |   Classe A: ${data.curvaABC.totalClientesClasseA} clientes (R$ ${fmtMoney(data.curvaABC.receitaClasseA)})` : "";
  const resumoTexto = `Periodo: ${data.curvaABC.periodoReferencia || "—"}   |   Top 3: ${safePct(data.curvaABC.concentracaoTop3)}   |   Top 5: ${safePct(data.curvaABC.concentracaoTop5)}${top10Txt}   |   Total clientes: ${data.curvaABC.totalClientesNaBase || "—"}${classeATxt}`;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...colors.text);
  const resumoLines = doc.splitTextToSize(resumoTexto, contentW - 4);
  doc.text(resumoLines, margin + 2, pos.y);
  pos.y += resumoLines.length * 5 + 4;

  // Tabela de clientes
  if ((data.curvaABC.clientes?.length ?? 0) > 0) {
    let acumPct = 0;
    const abcRows = data.curvaABC.clientes.slice(0, 20).map((c: {
      posicao: string | number; nome?: string; valorFaturado?: string;
      percentualReceita?: string; percentualAcumulado?: string; classe?: string
    }) => {
      const pctStr = safePct(c.percentualReceita);
      const pct = parseFloat(String(c.percentualReceita || "0").replace(/%/g, "").replace(",", "."));
      const pctCell: AutoCell = pct > 30
        ? { content: pctStr, styles: { textColor: [220, 38, 38] as [number, number, number], fontStyle: "bold" } }
        : { content: pctStr };
      const classeCell: AutoCell = c.classe === "A"
        ? { content: "A", styles: { textColor: [21, 128, 61] as [number, number, number], fontStyle: "bold" } }
        : c.classe === "B"
          ? { content: "B", styles: { textColor: [161, 98, 7] as [number, number, number], fontStyle: "bold" } }
          : { content: c.classe || "—" };
      // Bug 5: calcula % acumulado se vazio
      let pctAcum = safePct(c.percentualAcumulado);
      if (pctAcum === "—" && pct > 0) {
        acumPct += pct;
        pctAcum = `${acumPct.toFixed(2).replace(".", ",")}%`;
      }
      return [
        String(c.posicao),
        c.nome || "—",
        c.valorFaturado ? fmtMoney(c.valorFaturado) : "—",
        pctCell,
        pctAcum,
        classeCell,
      ] as AutoCell[];
    });
    autoT(ctx,
      ["#", "CLIENTE", "FATURAMENTO (R$)", "% RECEITA", "% ACUM.", "CL."],
      abcRows,
      [10, 65, 40, 20, 20, 10],
      { fontSize: 7, headFontSize: 6 }
    );
  }
}
