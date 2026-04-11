/**
 * Seção 00 — SÍNTESE PRELIMINAR + PARÂMETROS DO FUNDO + LIMITE DE CRÉDITO + CARTÃO CNPJ + QSA + GESTÃO
 * Contém toda a lógica do bloco sintético inicial do relatório.
 */
import type { PdfCtx } from "../context";
import {
  newPage, drawHeader, drawHeaderCompact, checkPageBreak, drawSectionTitle, drawSpacer,
  drawAlertDeduped, drawDetAlerts, drawTable, autoT, dsMiniHeader,
  dsMetricCard, fmtMoney, fmtBR, parseMoneyToNumber,
  gerarAlertasQSA,
} from "../helpers";
export function renderSintese(ctx: PdfCtx): void {
  const { doc, DS, pos, params, data, margin, contentW } = ctx;
  const {
    decision, finalRating, alerts, alertsHigh: _alertsHigh, riskScore,
    resumoExecutivo, alavancagem: alavParam,
    vencidosSCR, protestosVigentes,
  } = params;

  void _alertsHigh;

  newPage(ctx);
  drawHeader(ctx);
  drawSectionTitle(ctx, "00", "SINTESE PRELIMINAR");

  const colors = DS.colors;

  // Pre-compute values
  const validMeses = [...(data.faturamento?.meses || [])]
    .filter(m => m?.mes && m?.valor)
    .sort((a, b) => {
      const parseDK = (s: string): number => {
        if (!s) return 0;
        const parts = s.split("/");
        if (parts.length !== 2) return 0;
        const [p1, p2] = parts;
        const mm: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
        const month = isNaN(Number(p1)) ? (mm[p1.toLowerCase()] || 0) : Number(p1);
        const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
        return year * 100 + month;
      };
      return parseDK(a.mes) - parseDK(b.mes);
    });

  const fmmNum = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : validMeses.slice(-12).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / 12;

  const scrNum = parseMoneyToNumber(data.scr?.totalDividasAtivas || "0");
  const alavancagem = alavParam ?? (fmmNum > 0 ? scrNum / fmmNum : 0);

  const vermelho:   [number,number,number] = [...DS.colors.danger] as [number,number,number];
  const amarelo:    [number,number,number] = [...DS.colors.warning] as [number,number,number];
  const verde:      [number,number,number] = [...DS.colors.success] as [number,number,number];
  const scoreColor: [number,number,number] = finalRating >= 7.5 ? verde : finalRating >= 6 ? amarelo : vermelho;

  // BLOCO 1 — Hero Score + Decisão
  {
    checkPageBreak(ctx, 35);
    const bloco1H = 30;
    const bloco1Y = pos.y;

    // Navy gradient background
    const gSteps = 6;
    const gStepW  = contentW / gSteps;
    for (let s = 0; s < gSteps; s++) {
      const t = s / (gSteps - 1);
      doc.setFillColor(
        Math.round(27 + t * 10),
        Math.round(47 + t * 12),
        Math.round(78 + t * 20)
      );
      doc.rect(margin + s * gStepW, bloco1Y, gStepW + 0.5, bloco1H, "F");
    }
    doc.setFillColor(...scoreColor);
    doc.rect(margin, bloco1Y, 4, bloco1H, "F");
    doc.setFillColor(...amarelo);
    doc.rect(margin, bloco1Y + bloco1H - 1.5, contentW, 1.5, "F");

    // Score (left)
    const scoreX = margin + 8;
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textOnDark);
    doc.text("SCORE DE RISCO", scoreX, bloco1Y + 7);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...scoreColor);
    const scoreStr = String(finalRating);
    doc.text(scoreStr, scoreX, bloco1Y + 22);
    const scoreNumW = doc.getTextWidth(scoreStr);
    doc.setFontSize(DS.font.h2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textOnDark);
    doc.text("/10", scoreX + scoreNumW + 1, bloco1Y + 22);

    const ratingLabel = finalRating >= 8 ? "EXCELENTE" : finalRating >= 6.5 ? "SATISFATORIO" : finalRating >= 5 ? "MODERADO" : "ALTO RISCO";
    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...scoreColor);
    doc.text(ratingLabel, scoreX, bloco1Y + 27);

    // Progress bar
    const barX = scoreX + scoreNumW + 14;
    const barY = bloco1Y + 19;
    const barW = 40; const barH = 2;
    doc.setFillColor(50, 70, 100);
    doc.roundedRect(barX, barY, barW, barH, 0.8, 0.8, "F");
    const fillW = Math.min(barW, (finalRating / 10) * barW);
    if (fillW > 0) { doc.setFillColor(...scoreColor); doc.roundedRect(barX, barY, fillW, barH, 0.8, 0.8, "F"); }

    // Vertical divider
    const divX = margin + 90;
    doc.setDrawColor(60, 85, 125);
    doc.setLineWidth(0.25);
    doc.line(divX, bloco1Y + 5, divX, bloco1Y + bloco1H - 5);
    doc.setLineWidth(0.1);

    // Decisão (right)
    const decC: [number,number,number] = decision === "APROVADO" ? verde : decision === "REPROVADO" ? vermelho : amarelo;
    const rightX = divX + 6;
    const rightW = contentW - (divX - margin) - 10;
    doc.setFontSize(DS.font.caption);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textOnDark);
    doc.text("DECISAO", rightX, bloco1Y + 7);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...decC);
    const decLabel = decision.replace(/_/g, " ");
    const decLabelLines = doc.splitTextToSize(decLabel, rightW) as string[];
    doc.text(decLabelLines[0], rightX, bloco1Y + 19);

    const decSubtitle = decision === "APROVADO" ? "Operacao recomendada pelo sistema" :
      decision === "REPROVADO" ? "Operacao nao recomendada" :
      decision === "APROVACAO_CONDICIONAL" ? "Aprovacao mediante condicoes" :
      "Pendente de informacoes adicionais";
    doc.setFontSize(DS.font.bodySmall);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DS.colors.textOnDark);
    doc.text(decSubtitle, rightX, bloco1Y + 26);

    // Risk badge
    const riscoBg: [number,number,number] = riskScore === "baixo" ? verde : riskScore === "medio" ? amarelo : vermelho;
    const riscoBw = 30; const riscoBh = 8;
    const riscoBx = margin + contentW - riscoBw - 4;
    const riscoBy = bloco1Y + 4;
    doc.setFillColor(...riscoBg);
    doc.roundedRect(riscoBx, riscoBy, riscoBw, riscoBh, DS.radius.sm, DS.radius.sm, "F");
    doc.setFontSize(DS.font.micro);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`RISCO ${riskScore.toUpperCase()}`, riscoBx + riscoBw / 2, riscoBy + 5.5, { align: "center" });

    pos.y = bloco1Y + bloco1H + 5;
  }

  // Green accent separator
  doc.setFillColor(...colors.accent);
  doc.rect(margin, pos.y, contentW, 0.8, "F");
  pos.y += 5;

  // 3 Metric Cards
  {
    const mcGap = 4;
    const mcW   = (contentW - mcGap * 2) / 3;
    const mcH   = DS.space.kpiCardH;
    checkPageBreak(ctx, mcH + DS.space.md);

    const ratingBorderC: [number,number,number] = finalRating >= 7.5 ? DS.colors.success : finalRating >= 6 ? DS.colors.warning : DS.colors.danger;
    dsMetricCard(ctx, margin, pos.y, mcW, mcH, "Rating de Crédito", `${finalRating}/10`,
      finalRating >= 7.5 ? "Excelente" : finalRating >= 6 ? "Satisfatório" : "Atenção",
      ratingBorderC, ratingBorderC);

    const decBorderC: [number,number,number] = decision === "APROVADO" ? DS.colors.success : decision === "REPROVADO" ? DS.colors.danger : DS.colors.warning;
    dsMetricCard(ctx, margin + mcW + mcGap, pos.y, mcW, mcH, "Decisão", decision.replace(/_/g, " "),
      decision === "APROVADO" ? "Operação recomendada" : decision === "REPROVADO" ? "Não recomendada" : "Mediante condições",
      decBorderC, decBorderC);

    const riscoBorderC: [number,number,number] = riskScore === "baixo" ? DS.colors.success : riskScore === "medio" ? DS.colors.warning : DS.colors.danger;
    dsMetricCard(ctx, margin + (mcW + mcGap) * 2, pos.y, mcW, mcH, "Nível de Risco", riskScore.toUpperCase(),
      riskScore === "baixo" ? "Perfil conservador" : riskScore === "medio" ? "Perfil moderado" : "Perfil agressivo",
      riscoBorderC, riscoBorderC);

    pos.y += mcH + DS.space.md;
  }

  // Two-column data layout
  {
    const IR_PAD_TOP = 3.5; const IR_LABEL_H = 3; const IR_LV_GAP = 2;
    const IR_VAL_H = 6; const IR_DET_H = 4.5; const IR_FIELD_GAP = 5.0; const IR_PAD_BOT = 4.0;

    const calcRowH = (value: string, rw: number, isLast: boolean, primarySize: number = DS.font.kpiValue): number => {
      const segs = value.split("\n");
      const scaledValH = (primarySize / DS.font.kpiValue) * IR_VAL_H;
      doc.setFontSize(primarySize); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
      const primCount = (doc.splitTextToSize(segs[0].trim(), rw - 10) as string[]).length;
      let detCount = 0;
      if (segs.length > 1) {
        doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal");
        segs.slice(1).forEach(s => { detCount += (doc.splitTextToSize(s.trim(), rw - 10) as string[]).length; });
      }
      const bot = isLast ? IR_PAD_BOT : IR_FIELD_GAP;
      return Math.max(DS.space.infoRowMinH, IR_PAD_TOP + IR_LABEL_H + IR_LV_GAP + primCount * scaledValH + detCount * IR_DET_H + bot);
    };

    const renderInfoRow = (
      rx: number, ry: number, rw: number,
      label: string, value: string,
      isLast = false, overrideH?: number,
      valueColor?: [number, number, number], primarySize: number = DS.font.kpiValue
    ): number => {
      const segs = value.split("\n");
      const scaledValH = (primarySize / DS.font.kpiValue) * IR_VAL_H;
      doc.setFontSize(primarySize); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
      const primLines = doc.splitTextToSize(segs[0].trim(), rw - 10) as string[];
      const detSegs: string[][] = [];
      if (segs.length > 1) {
        doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal");
        segs.slice(1).forEach(s => detSegs.push(doc.splitTextToSize(s.trim(), rw - 10) as string[]));
      }
      const totalDet = detSegs.reduce((a, b) => a + b.length, 0);
      const bot = isLast ? IR_PAD_BOT : IR_FIELD_GAP;
      const naturalH = Math.max(DS.space.infoRowMinH, IR_PAD_TOP + IR_LABEL_H + IR_LV_GAP + primLines.length * scaledValH + totalDet * IR_DET_H + bot);
      const rH = overrideH ?? naturalH;

      doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setCharSpace(0.4);
      doc.setTextColor(...DS.colors.textMuted);
      doc.text(label.toUpperCase(), rx + 5, ry + IR_PAD_TOP + IR_LABEL_H);
      doc.setCharSpace(0);

      doc.setFontSize(primarySize); doc.setFont("helvetica", "bold"); doc.setCharSpace(0);
      doc.setTextColor(...(valueColor ?? ([...DS.colors.textPrimary] as [number, number, number])));
      const valBaseY = ry + IR_PAD_TOP + IR_LABEL_H + IR_LV_GAP + scaledValH * 0.82;
      primLines.forEach((line, i) => doc.text(line, rx + 5, valBaseY + i * scaledValH));

      if (detSegs.length > 0) {
        doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setCharSpace(0);
        doc.setTextColor(...DS.colors.textSecondary);
        let dY = valBaseY + primLines.length * scaledValH;
        detSegs.forEach(seg => seg.forEach(line => { doc.text(line, rx + 5, dY); dY += IR_DET_H; }));
      }

      if (!isLast) {
        doc.setDrawColor(...DS.colors.border); doc.setLineWidth(0.25);
        doc.line(rx + 5, ry + rH, rx + rw - 5, ry + rH);
        doc.setLineWidth(0.1);
      }
      doc.setCharSpace(0);
      return ry + rH;
    };

    // Data preparation
    const anoAbSint = data.cnpj?.dataAbertura ? new Date(data.cnpj.dataAbertura).getFullYear() : null;
    const idadeEmpSint = anoAbSint && !isNaN(anoAbSint) ? `${new Date().getFullYear() - anoAbSint} anos` : "—";
    const fmmSint = data.faturamento?.fmm12m ? `R$ ${fmtMoney(data.faturamento.fmm12m)}` : data.faturamento?.mediaAno ? `R$ ${fmtMoney(data.faturamento.mediaAno)}` : "—";
    const pleitoSint = data.relatorioVisita?.pleito ? `R$ ${fmtMoney(data.relatorioVisita.pleito)}` : "—";
    const grupoQtdSint = data.grupoEconomico?.empresas?.length ?? 0;
    const grupoSint = grupoQtdSint > 0 ? `Sim — ${grupoQtdSint} empresa(s)` : "Não identificado";
    const refComSint = (data.relatorioVisita as { referenciaComercial?: string } | undefined)?.referenciaComercial || "—";
    const modalSint = data.relatorioVisita?.modalidade
      ? ({ comissaria: "Comissária", convencional: "Convencional", hibrida: "Comissária e Convencional", outra: "Outra" } as Record<string, string>)[data.relatorioVisita.modalidade] ?? "—"
      : "—";
    const concTop3Val = data.curvaABC?.concentracaoTop3 ? parseFloat(String(data.curvaABC.concentracaoTop3)) : 0;
    const concTop3Sint = concTop3Val > 0 ? `${data.curvaABC!.concentracaoTop3}%` : "—";

    const vigQtdSint = parseInt(data.protestos?.vigentesQtd || "0");
    const vigValSint = data.protestos?.vigentesValor || "0";
    const protOrdSint = [...(data.protestos?.detalhes ?? [])].filter(d => d.data).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
    const protRecenteSint = protOrdSint[0]?.data ?? null;
    const protestoSint = vigQtdSint > 0
      ? `${vigQtdSint} reg. | R$ ${fmtMoney(vigValSint)}${protRecenteSint ? ` | Rec: ${protRecenteSint}` : ""}`
      : "Nenhum registro";

    const totalOcorrSint = data.ccf?.qtdRegistros || 0;
    const ccfBancosSint = (data.ccf?.bancos ?? []);
    const ccfBancosStr = ccfBancosSint.length > 0
      ? ccfBancosSint.slice(0, 4).map(b => `${b.banco}${b.quantidade > 1 ? ` (${b.quantidade})` : ""}`).join(" · ")
        + (ccfBancosSint.length > 4 ? ` +${ccfBancosSint.length - 4}` : "")
      : "";
    const ccfSint = totalOcorrSint > 0
      ? [`${totalOcorrSint} registro(s)`, ccfBancosStr].filter(Boolean).join("\n")
      : "Nenhuma ocorrência";

    const passivostSint  = parseInt(data.processos?.passivosTotal  || "0");
    const poloAtivoSint  = parseInt(data.processos?.poloAtivoQtd   || "0");
    const poloPassSint   = parseInt(data.processos?.poloPassivoQtd  || "0");
    const processoSint = passivostSint > 0
      ? [`${passivostSint} total`, [poloAtivoSint > 0 ? `Ativo: ${poloAtivoSint}` : "", poloPassSint > 0 ? `Passivo: ${poloPassSint}` : ""].filter(Boolean).join("  |  ")].filter(Boolean).join("\n")
      : "Nenhum processo";

    const scrVencSint = vencidosSCR > 0 ? (data.scr?.vencidos || "Sim") : "Nenhum";
    const alavSint = alavancagem > 0 ? `${fmtBR(alavancagem, 2)}x` : "—";

    checkPageBreak(ctx, 150);
    const colGapSint = 3;
    const col1WSint = (contentW - colGapSint) * 0.44;
    const col2WSint = contentW - col1WSint - colGapSint;
    const col2XSint = margin + col1WSint + colGapSint;
    const hdrH = 14;
    const blockYSint = pos.y;

    type SintRow = { label: string; value: string; color?: [number, number, number]; primarySize?: number };
    const c1Rows: SintRow[] = [
      { label: "Idade da Empresa",         value: idadeEmpSint  },
      { label: "Faturamento Médio (12M)",  value: fmmSint       },
      { label: "Pleito",                   value: pleitoSint    },
      { label: "Grupo Econômico",          value: grupoSint     },
      { label: "Referência Comercial",     value: refComSint    },
      { label: "Modalidade",               value: modalSint     },
      { label: "ABC — Concentração Top 3", value: concTop3Sint, color: concTop3Val > 80 ? [220, 38, 38] : concTop3Val > 60 ? [217, 119, 6] : undefined },
    ];
    const c2Rows: SintRow[] = [
      { label: "Protestos",              value: protestoSint,   color: vigQtdSint > 0 ? [220, 38, 38] : undefined },
      { label: "CCF — Cheques Sem Fundo", value: ccfSint,       color: totalOcorrSint > 0 ? [220, 38, 38] : undefined },
      { label: "Processos Judiciais",    value: processoSint,   color: passivostSint > 0 ? [217, 119, 6] : undefined, primarySize: 13 },
      { label: "SCR — Vencido",          value: scrVencSint,    color: vencidosSCR > 0 ? [220, 38, 38] : undefined },
      { label: "Alavancagem",            value: alavSint,       color: alavancagem > 4 ? [220, 38, 38] : alavancagem > 2 ? [217, 119, 6] : undefined },
    ];

    const c1H = c1Rows.map((r, i) => calcRowH(r.value, col1WSint, i === c1Rows.length - 1, r.primarySize));
    const c2H = c2Rows.map((r, i) => calcRowH(r.value, col2WSint, i === c2Rows.length - 1, r.primarySize));
    const c1Tot = c1H.reduce((a, b) => a + b, 0);
    const c2Tot = c2H.reduce((a, b) => a + b, 0);
    if (c1Tot < c2Tot) c1H[c1H.length - 1] += c2Tot - c1Tot;
    else if (c2Tot < c1Tot) c2H[c2H.length - 1] += c1Tot - c2Tot;
    const bodyH = c1H.reduce((a, b) => a + b, 0);

    doc.setFillColor(...DS.colors.pageBg);
    doc.rect(margin, blockYSint + hdrH, contentW, bodyH, "F");

    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(margin, blockYSint, col1WSint, hdrH, "F");
    doc.setFillColor(...DS.colors.accent);
    doc.rect(margin, blockYSint, 3, hdrH, "F");
    doc.setFontSize(DS.font.bodySmall); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("PERFIL & OPERACIONAL", margin + 7, blockYSint + 6);
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textOnDark);
    doc.text("Cadastro e operações", margin + 7, blockYSint + 10.5);

    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(col2XSint, blockYSint, col2WSint, hdrH, "F");
    doc.setFillColor(...DS.colors.accent);
    doc.rect(col2XSint, blockYSint, 3, hdrH, "F");
    doc.setFontSize(DS.font.bodySmall); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("INDICADORES DE RISCO", col2XSint + 7, blockYSint + 6);
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textOnDark);
    doc.text("Exposição a riscos", col2XSint + 7, blockYSint + 10.5);

    const divX = margin + col1WSint + colGapSint / 2;
    doc.setDrawColor(...DS.colors.border); doc.setLineWidth(0.3);
    doc.line(divX, blockYSint + hdrH, divX, blockYSint + hdrH + bodyH);
    doc.setLineWidth(0.1);

    doc.setDrawColor(...DS.colors.border); doc.setLineWidth(0.3);
    doc.roundedRect(margin, blockYSint, contentW, hdrH + bodyH, DS.radius.md, DS.radius.md, "S");
    doc.setLineWidth(0.1);

    let y1Sint = blockYSint + hdrH;
    let y2Sint = blockYSint + hdrH;

    c1Rows.forEach((r, i) => { y1Sint = renderInfoRow(margin, y1Sint, col1WSint, r.label, r.value, i === c1Rows.length - 1, c1H[i], r.color, r.primarySize); });
    c2Rows.forEach((r, i) => { y2Sint = renderInfoRow(col2XSint, y2Sint, col2WSint, r.label, r.value, i === c2Rows.length - 1, c2H[i], r.color, r.primarySize); });

    pos.y = Math.max(y1Sint, y2Sint) + 6;
  }

  // AI alerts
  if (alerts.length > 0) {
    alerts.forEach(alert => { drawAlertDeduped(ctx, alert.message, alert.severity); });
    drawSpacer(ctx, 4);
  }

  // Síntese executiva text was moved to Parecer section (renders right after this)

  void resumoExecutivo;
  void protestosVigentes;

  // Seção Parâmetros do Fundo
  if (params.fundValidation && params.fundValidation.criteria.length > 0) {
    renderParametrosFundo(ctx, fmmNum);
  }

  // Seção Limite de Crédito
  if (params.creditLimit) {
    renderLimiteCredito(ctx);
  }

  // Seção CNPJ
  renderCNPJ(ctx);

  // Seção QSA + Contrato + Gestão
  renderQSAGestao(ctx);
}

function renderParametrosFundo(ctx: PdfCtx, fmmNum: number): void {
  void fmmNum;
  const { doc, DS, pos, params, margin, contentW } = ctx;
  const fv = params.fundValidation!;

  const normalizeThreshold = (t: string) => t.replace(/≥/g, ">=").replace(/≤/g, "<=");

  drawSpacer(ctx, 10);

  const fsRowH = 15;
  const fsSummaryH = 18;
  const fsHasAnyElim = fv.criteria.some(c => c.eliminatoria);
  const fsAlturaTotal = 13 + fsSummaryH + 4 + 8 + fv.criteria.length * (fsRowH + 1) + 18 + (fsHasAnyElim ? 8 : 0);
  if (pos.y + fsAlturaTotal > 265) { newPage(ctx); drawHeaderCompact(ctx); }

  drawSectionTitle(ctx, "FS", "CONFORMIDADE COM PARAMETROS DO FUNDO");

  // 3 pills summary
  {
    const pillW = (contentW - 8) / 3;
    const pillH = fsSummaryH;
    const pillGap = 4;
    const pills = [
      { label: "Aprovados",  value: fv.passCount, bg: [220,252,231] as [number,number,number], txt: [22,101,52]  as [number,number,number], bar: [22,163,74]  as [number,number,number] },
      { label: "Em Atencao", value: fv.warnCount, bg: [254,243,199] as [number,number,number], txt: [133,77,14]  as [number,number,number], bar: [217,119,6]  as [number,number,number] },
      { label: "Reprovados", value: fv.failCount, bg: [254,226,226] as [number,number,number], txt: [220,38,38]  as [number,number,number], bar: [220,38,38]  as [number,number,number] },
    ];
    pills.forEach((pill, i) => {
      const px = margin + i * (pillW + pillGap);
      const pct = fv.criteria.length > 0 ? pill.value / fv.criteria.length : 0;
      doc.setFillColor(...pill.bg);
      doc.roundedRect(px, pos.y, pillW, pillH, 2, 2, "F");
      if (pct > 0) {
        doc.setFillColor(...pill.bar);
        doc.setGState(doc.GState({ opacity: 0.15 }));
        doc.roundedRect(px, pos.y + pillH - 4, pillW * pct, 4, 1, 1, "F");
        doc.setGState(doc.GState({ opacity: 1 }));
      }
      doc.setFontSize(DS.font.h1); doc.setFont("helvetica", "bold"); doc.setTextColor(...pill.txt);
      doc.text(String(pill.value), px + pillW / 2, pos.y + 11, { align: "center" });
      doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setTextColor(...pill.txt);
      doc.text(pill.label.toUpperCase(), px + pillW / 2, pos.y + 15.5, { align: "center" });
    });
    pos.y += pillH + 5;
  }

  // Column header
  const fsColBadge = margin + 4;
  const fsColCrit  = margin + 14;
  const fsColLim   = margin + 68;
  const fsColApur  = margin + 112;
  const fsColStat  = margin + 144;

  doc.setFillColor(...DS.colors.pageBg);
  doc.roundedRect(margin, pos.y, contentW, 8, DS.radius.md, DS.radius.md, "F");
  doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "bold"); doc.setTextColor(...DS.colors.textSecondary);
  doc.text("CRITERIO DE ELEGIBILIDADE", fsColCrit, pos.y + 5.5);
  doc.text("LIMITE DO FUNDO",           fsColLim,  pos.y + 5.5);
  doc.text("APURADO",                   fsColApur, pos.y + 5.5);
  doc.text("STATUS",                    fsColStat, pos.y + 5.5);
  pos.y += 9;

  // Criteria rows
  fv.criteria.forEach((cr, idx) => {
    const isOk   = cr.status === "ok";
    const isErr  = cr.status === "error";
    const isWarn = cr.status === "warning";
    const isElim = cr.eliminatoria;
    const hasDetail = !!cr.detail;
    const rowH = hasDetail ? fsRowH + 5 : fsRowH;
    checkPageBreak(ctx, rowH + 1);

    const rowBg: [number,number,number] = (isErr && isElim) ? [255, 235, 235] : isErr ? [255, 245, 245] : isWarn ? [255, 251, 235] : idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
    doc.setFillColor(...rowBg);
    doc.rect(margin, pos.y, contentW, rowH, "F");

    const stripC: [number,number,number] = isErr ? [220,38,38] : isWarn ? [217,119,6] : isOk ? [16,185,129] : [156,163,175];
    doc.setFillColor(...stripC);
    doc.rect(margin, pos.y, 4, rowH, "F");

    const iconLabel = isOk ? "OK" : isErr ? "FAIL" : isWarn ? "AVS" : "—";
    const iconBg:  [number,number,number] = isOk ? [220,252,231] : isErr ? [254,226,226] : isWarn ? [254,243,199] : [243,244,246];
    const iconTxt: [number,number,number] = isOk ? [21,128,61]   : isErr ? [220,38,38]   : isWarn ? [133,77,14]   : [107,114,128];
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "bold");
    const iconW = doc.getTextWidth(iconLabel) + 5;
    doc.setFillColor(...iconBg);
    doc.roundedRect(fsColBadge, pos.y + (rowH - 6) / 2, iconW, 6, DS.radius.md, DS.radius.md, "F");
    doc.setTextColor(...iconTxt);
    doc.text(iconLabel, fsColBadge + iconW / 2, pos.y + (rowH - 6) / 2 + 4.2, { align: "center" });

    const labelText = (isElim ? "* " : "") + cr.label;
    doc.setFontSize(isErr ? DS.font.h3 : DS.font.body); doc.setFont("helvetica", isErr ? "bold" : "normal");
    doc.setTextColor(...((isErr && isElim) ? DS.colors.dangerText : isErr ? DS.colors.danger : DS.colors.textPrimary));
    const labelLines = doc.splitTextToSize(labelText, fsColLim - fsColCrit - 3) as string[];
    doc.text(labelLines[0], fsColCrit, pos.y + rowH / 2 + 1.5);
    if (labelLines[1]) { doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.text(labelLines[1], fsColCrit, pos.y + rowH / 2 + 5.5); }

    if (hasDetail) {
      doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "italic"); doc.setTextColor(...DS.colors.textSecondary);
      const detailLines = doc.splitTextToSize(cr.detail!, fsColLim - fsColCrit - 3) as string[];
      doc.text(detailLines[0], fsColCrit, pos.y + rowH - 4);
    }

    doc.setFontSize(DS.font.bodySmall); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textSecondary);
    const threshNorm = normalizeThreshold(cr.threshold);
    const threshLines = doc.splitTextToSize(threshNorm, fsColApur - fsColLim - 4) as string[];
    doc.text(threshLines[0], fsColLim, pos.y + rowH / 2 + 1.5);

    doc.setFontSize(DS.font.h3); doc.setFont("helvetica", "bold"); doc.setTextColor(...stripC);
    doc.text(cr.actual, fsColApur, pos.y + rowH / 2 + 1.5);

    const sLabel = isOk ? "APROVADO" : isWarn ? "ATENCAO" : isErr ? "REPROVADO" : "S/DADO";
    const sBg:  [number,number,number] = isOk ? DS.colors.successBg : isWarn ? DS.colors.warningBg : isErr ? DS.colors.dangerBg : [243,244,246];
    const sTxt: [number,number,number] = isOk ? DS.colors.successText : isWarn ? DS.colors.warningText : isErr ? DS.colors.danger : DS.colors.textSecondary;
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "bold");
    const sPw = doc.getTextWidth(sLabel) + 10;
    doc.setFillColor(...sBg);
    doc.roundedRect(fsColStat, pos.y + (rowH - 7) / 2, sPw, 7, DS.radius.md, DS.radius.md, "F");
    doc.setTextColor(...sTxt);
    doc.text(sLabel, fsColStat + 5, pos.y + rowH / 2 + 1.5);

    doc.setDrawColor(...DS.colors.border); doc.setLineWidth(0.2);
    doc.line(margin, pos.y + rowH, margin + contentW, pos.y + rowH);
    pos.y += rowH + 1;
  });

  // Final verdict
  const fsElimFails = fv.criteria.filter(c => c.eliminatoria && c.status === "error").length;
  const fsFinalStatus = (fv.hasEliminatoria && fv.failCount > 0) ? "EMPRESA NAO ELEGIVEL — CRITERIO ELIMINATORIO"
    : fv.failCount > 0 ? "REPROVADO PELOS PARAMETROS DO FUNDO"
    : fv.warnCount > 0 ? "APROVACAO CONDICIONAL"
    : "EMPRESA ELEGIVEL — TODOS OS CRITERIOS ATENDIDOS";
  const fsFinalBg:  [number,number,number] = (fv.failCount > 0) ? [254,226,226] : fv.warnCount > 0 ? [254,243,199] : [220,252,231];
  const fsFinalTxt: [number,number,number] = (fv.failCount > 0) ? [153,27,27]   : fv.warnCount > 0 ? [133,77,14]   : [22,101,52];
  const fsFinalBrd: [number,number,number] = (fv.failCount > 0) ? [220,38,38]   : fv.warnCount > 0 ? [217,119,6]   : [22,163,74];

  checkPageBreak(ctx, 18);
  doc.setDrawColor(...fsFinalBrd); doc.setLineWidth(0.8);
  doc.line(margin, pos.y, margin + contentW, pos.y); doc.setLineWidth(0.1);
  pos.y += 1;

  doc.setFillColor(...fsFinalBg);
  doc.roundedRect(margin, pos.y, contentW, 14, 2, 2, "F");
  doc.setFillColor(...fsFinalBrd);
  doc.rect(margin, pos.y, 4, 14, "F");

  doc.setFontSize(DS.font.caption); doc.setFont("helvetica", "normal"); doc.setTextColor(...fsFinalTxt);
  doc.text(`${fv.passCount}/${fv.criteria.length} criterios aprovados${fsElimFails > 0 ? ` · ${fsElimFails} eliminatorio(s) reprovado(s)` : ""}`, margin + 9, pos.y + 5.5);
  doc.setFontSize(DS.font.h3); doc.setFont("helvetica", "bold");
  doc.text(fsFinalStatus, margin + 9, pos.y + 11);
  pos.y += 15;

  if (fsHasAnyElim) {
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "italic"); doc.setTextColor(...DS.colors.textMuted);
    doc.text("* Criterio eliminatorio: nao atendimento impede aprovacao independente dos demais resultados.", margin + 4, pos.y + 4);
    pos.y += 8;
  }
  pos.y += 4;
  void DS;
}

function renderLimiteCredito(ctx: PdfCtx): void {
  const { doc, DS, pos, params, margin, contentW } = ctx;
  const lc = params.creditLimit!;
  const lcColor = lc.classificacao === "APROVADO" ? [22, 101, 52] as [number,number,number]
    : lc.classificacao === "CONDICIONAL" ? [120, 53, 15] as [number,number,number]
    : [127, 29, 29] as [number,number,number];
  const fmtM = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 55);
  drawSectionTitle(ctx, "LC", "LIMITE DE CREDITO SUGERIDO");
  pos.y += 4;
  checkPageBreak(ctx, 40);

  const bannerBg = lc.classificacao === "APROVADO" ? [220, 252, 231] as [number,number,number]
    : lc.classificacao === "CONDICIONAL" ? [254, 243, 199] as [number,number,number]
    : [254, 226, 226] as [number,number,number];
  doc.setFillColor(...bannerBg);
  doc.rect(margin, pos.y, contentW, 10, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...lcColor);
  const bannerText = lc.classificacao === "REPROVADO"
    ? "NAO ELEGIVEL — Criterio eliminatorio nao atendido"
    : lc.classificacao === "CONDICIONAL"
      ? `APROVACAO CONDICIONAL — Limite de ${fmtM(lc.limiteAjustado)} (reduzido 30%)`
      : `APROVADO — Limite de ${fmtM(lc.limiteAjustado)}`;
  doc.text(bannerText, margin + 4, pos.y + 6.5);
  pos.y += 14;

  if (lc.classificacao !== "REPROVADO") {
    const cols = [
      { label: "PRAZO MAXIMO", value: lc.prazo + " dias" },
      { label: "REVISAO EM", value: new Date(lc.dataRevisao).toLocaleDateString("pt-BR") },
      { label: "CONC. MAX/SACADO", value: fmtM(lc.limiteConcentracao) },
      { label: "BASE (FMM x FATOR)", value: `${fmtM(lc.fmmBase)} x ${lc.fatorBase}` },
    ];
    const cellW = contentW / 4;
    cols.forEach((col, i) => {
      const cx = margin + i * cellW;
      doc.setFillColor(...DS.colors.pageBg);
      doc.rect(cx, pos.y, cellW - 1, 16, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(DS.font.micro); doc.setTextColor(...DS.colors.textMuted);
      doc.text(col.label, cx + 3, pos.y + 5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(DS.font.md); doc.setTextColor(...lcColor);
      doc.text(col.value, cx + 3, pos.y + 12);
    });
    pos.y += 20;
  }

  doc.setFont("helvetica", "italic"); doc.setFontSize(DS.font.bodySmall); doc.setTextColor(...DS.colors.textSecondary);
  const noteText = lc.classificacao === "REPROVADO"
    ? `Perfil: ${lc.presetName} — revise os criterios eliminatorios antes de prosseguir.`
    : `Perfil: ${lc.presetName} | Base: FMM ${fmtM(lc.fmmBase)} x ${lc.fatorBase} = ${fmtM(lc.limiteBase)}${lc.fatorReducao < 1 ? ` | Fator reducao: ${Math.round((1 - lc.fatorReducao) * 100)}%` : ""}`;
  doc.text(noteText, margin + 2, pos.y + 3);
  pos.y += 8;
  void DS;
}

function renderCNPJ(ctx: PdfCtx): void {
  const { doc, DS, pos, params, data, margin, contentW } = ctx;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 120);
  drawSectionTitle(ctx, "01", "CARTAO CNPJ");

  // Hero: Razão Social + CNPJ + Badge Situação
  {
    const heroH = 24;
    const situ = (data.cnpj?.situacaoCadastral || "").toUpperCase();
    const situOk = situ.includes("ATIVA");
    const situColor: [number,number,number] = situOk ? [22,163,74] : [220,38,38];
    const situBg:    [number,number,number] = situOk ? [220,252,231] : [254,226,226];

    doc.setFillColor(...DS.colors.headerBg);
    doc.rect(margin, pos.y, contentW, heroH, "F");
    doc.setFillColor(...situColor);
    doc.rect(margin, pos.y, 3.5, heroH, "F");

    doc.setFontSize(DS.font.lg); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    const rzStr = data.cnpj?.razaoSocial || "—";
    const rzLines = doc.splitTextToSize(rzStr, contentW - 68) as string[];
    doc.text(rzLines[0], margin + 8, pos.y + 10);
    if (rzLines[1]) { doc.setFontSize(DS.font.h3); doc.text(rzLines[1], margin + 8, pos.y + 17); }

    const nf = data.cnpj?.nomeFantasia;
    if (nf && nf.toLowerCase() !== (data.cnpj?.razaoSocial || "").toLowerCase()) {
      doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "italic"); doc.setTextColor(...DS.colors.textOnDark);
      doc.text(`"${nf}"`, margin + 8, pos.y + 21);
    }
    doc.setFontSize(DS.font.micro); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textOnDark);
    doc.text("CNPJ: " + (data.cnpj?.cnpj || "—"), margin + 8, pos.y + (nf ? 21 : 20));

    const bw = 44; const bh = 11;
    const bx = margin + contentW - bw - 5;
    const by = pos.y + (heroH - bh) / 2;
    doc.setFillColor(...situBg);
    doc.roundedRect(bx, by, bw, bh, DS.radius.lg, DS.radius.lg, "F");
    doc.setFontSize(DS.font.caption); doc.setFont("helvetica", "bold"); doc.setTextColor(...situColor);
    const situLabel = situ || "N/D";
    doc.text(situLabel.length > 12 ? situLabel.substring(0, 12) + "…" : situLabel, bx + bw / 2, by + 7.5, { align: "center" });
    pos.y += heroH + 5;
  }

  // Metric cards row 1
  {
    const mgGap = 3;
    const mgW = (contentW - mgGap * 3) / 4;
    const mgH = 19;
    checkPageBreak(ctx, mgH + 4);
    const capitalSocial = data.qsa?.capitalSocial || "";
    const mg1 = [
      { label: "Data de Abertura",  value: data.cnpj?.dataAbertura || "—",    border: DS.colors.info },
      { label: "Natureza Jurídica", value: data.cnpj?.naturezaJuridica || "—", border: DS.colors.borderStrong },
      { label: "Porte",             value: data.cnpj?.porte || "—",            border: DS.colors.borderStrong },
      { label: "Capital Social",    value: capitalSocial ? `R$ ${fmtMoney(capitalSocial)}` : "—", border: DS.colors.success },
    ];
    mg1.forEach((item, i) => {
      dsMetricCard(ctx, margin + i * (mgW + mgGap), pos.y, mgW, mgH, item.label, item.value, undefined, item.border);
    });
    pos.y += mgH + 4;
  }

  // Metric cards row 2
  {
    const items2 = [
      data.cnpj?.tipoEmpresa   ? { label: "Tipo Empresa",     value: data.cnpj.tipoEmpresa }   : null,
      data.cnpj?.funcionarios  ? { label: "Funcionários",     value: data.cnpj.funcionarios }  : null,
      data.cnpj?.regimeTributario ? { label: "Regime Tributário", value: data.cnpj.regimeTributario } : null,
      data.cnpj?.telefone      ? { label: "Telefone",         value: data.cnpj.telefone }      : null,
      data.cnpj?.email         ? { label: "E-mail",           value: data.cnpj.email }         : null,
      data.cnpj?.dataSituacaoCadastral ? { label: "Data da Situação", value: data.cnpj.dataSituacaoCadastral } : null,
    ].filter(Boolean) as { label: string; value: string }[];
    if (items2.length > 0) {
      const n = Math.min(items2.length, 4);
      const mgGap2 = 3;
      const mgW2 = (contentW - mgGap2 * (n - 1)) / n;
      const mgH2 = 17;
      checkPageBreak(ctx, mgH2 + 4);
      items2.slice(0, n).forEach((item, i) => {
        dsMetricCard(ctx, margin + i * (mgW2 + mgGap2), pos.y, mgW2, mgH2, item.label, item.value, undefined, DS.colors.borderStrong);
      });
      pos.y += mgH2 + 4;
    }
  }

  // Address + StreetView
  {
    const hasStreetView = !!params.streetViewBase64;
    const svW   = hasStreetView ? 58 : 0;
    const svGap = hasStreetView ? 4 : 0;
    const endW  = contentW - svW - svGap;
    const endVal = data.cnpj?.endereco || "—";
    const endMinH = hasStreetView ? 46 : 18;
    checkPageBreak(ctx, endMinH + 6);

    const endLines = doc.splitTextToSize(endVal, endW - 10) as string[];
    const endBoxH  = Math.max(endMinH, endLines.length * 4.5 + 14);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, pos.y, endW, endBoxH, 2, 2, "F");
    doc.setDrawColor(...DS.colors.borderRGB);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, pos.y, endW, endBoxH, 2, 2, "D");
    doc.setLineWidth(0.1);
    doc.setFillColor(...DS.colors.accentRGB);
    doc.rect(margin, pos.y, 3, endBoxH, "F");

    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textMuted);
    doc.text("ENDEREÇO PRINCIPAL", margin + 7, pos.y + 5.5);
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...DS.colors.textPrimary);
    endLines.forEach((line, i) => doc.text(line, margin + 7, pos.y + 11 + i * 5));

    if (hasStreetView) {
      const svX = margin + endW + svGap;
      doc.setFillColor(26, 46, 74);
      doc.rect(svX, pos.y, svW, 8, "F");
      doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("ESTABELECIMENTO — STREET VIEW", svX + svW / 2, pos.y + 5.2, { align: "center" });
      doc.addImage(params.streetViewBase64!, "JPEG", svX, pos.y + 8, svW, endBoxH - 8);
    }
    pos.y += endBoxH + 4;
  }

  // Additional addresses
  const endExtras: string[] = data.cnpj?.enderecos || [];
  if (endExtras.length > 1) {
    endExtras.slice(1).forEach((end, idx) => {
      checkPageBreak(ctx, 10);
      const el = doc.splitTextToSize(end, contentW - 8) as string[];
      const eh = Math.max(9, el.length * 4.5 + 6);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, pos.y, contentW, eh, 1, 1, "F");
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textMuted);
      doc.text(`ENDEREÇO ${idx + 2}`, margin + 4, pos.y + 3.5);
      doc.setFontSize(7); doc.setTextColor(...DS.colors.textPrimary);
      doc.text(el, margin + 4, pos.y + 7);
      pos.y += eh + 2;
    });
  }

  // CNAEs secundários
  const cnaesRaw = data.cnpj?.cnaeSecundarios || "";
  const cnaesStr = Array.isArray(cnaesRaw) ? (cnaesRaw as string[]).join("; ") : String(cnaesRaw);
  if (cnaesStr.trim() !== "") {
    const cl = doc.splitTextToSize(cnaesStr, contentW - 8) as string[];
    const ch = cl.length * 4 + 14;
    checkPageBreak(ctx, ch + 2);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, pos.y, contentW, ch, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...DS.colors.textMuted);
    doc.text("CNAES SECUNDÁRIOS", margin + 4, pos.y + 5);
    doc.setFontSize(7); doc.setTextColor(...DS.colors.textPrimary);
    cl.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + 10 + i * 4));
    pos.y += ch + 2;
  }
}

function renderQSAGestao(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  const alertasQSA = gerarAlertasQSA(data.qsa, data.contrato);

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 60);
  drawSectionTitle(ctx, "02", "QUADRO SOCIETARIO (QSA)");

  if (data.qsa?.capitalSocial) {
    checkPageBreak(ctx, 16);
    const fieldW = contentW;
    const textMaxW = fieldW - 8;
    const lineH = 4.5;
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(data.qsa.capitalSocial, textMaxW);
    const boxH = Math.max(12, 6 + lines.length * lineH + 3);
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, fieldW, boxH, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
    doc.text("CAPITAL SOCIAL", margin + 4, pos.y + 4.5);
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + 9 + i * lineH));
    pos.y += boxH + 2;
  }

  const validQSA = data.qsa?.quadroSocietario?.filter(s => s.nome) || [];
  if (validQSA.length > 0) {
    const temDatas = validQSA.some(s => s.dataEntrada || s.dataSaida);
    if (temDatas) {
      const qsaColW = [contentW * 0.26, contentW * 0.18, contentW * 0.22, contentW * 0.14, contentW * 0.10, contentW * 0.10];
      drawTable(ctx, ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART.", "ENTRADA", "SAIDA"],
        validQSA.map(s => {
          const part = s.participacao ? (String(s.participacao).includes("%") ? s.participacao : s.participacao + "%") : "—";
          return [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", part, s.dataEntrada || "—", s.dataSaida || "—"];
        }), qsaColW);
    } else {
      const qsaColW = [contentW * 0.30, contentW * 0.22, contentW * 0.28, contentW * 0.20];
      drawTable(ctx, ["NOME", "CPF/CNPJ", "QUALIFICACAO", "PART."],
        validQSA.map(s => {
          const part = s.participacao ? (String(s.participacao).includes("%") ? s.participacao : s.participacao + "%") : "—";
          return [s.nome, s.cpfCnpj || "—", s.qualificacao || "—", part];
        }), qsaColW);
    }
  }

  if (alertasQSA.length > 0) { drawSpacer(ctx, 4); drawDetAlerts(ctx, alertasQSA); }

  drawSpacer(ctx, 8);
  drawSectionTitle(ctx, "03", "CONTRATO SOCIAL");

  if (data.contrato?.temAlteracoes) {
    drawAlertDeduped(ctx, "Contrato Social com alterações societárias recentes — verificar impacto na estrutura de controle", "MODERADA");
  }

  if (data.contrato?.objetoSocial) {
    const lineH = 5; const paddingTop = 10; const paddingBot = 4;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.contrato.objetoSocial, contentW - 8) as string[];
    const boxH = paddingTop + lines.length * lineH + paddingBot;
    checkPageBreak(ctx, boxH + 4);
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, contentW, boxH, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
    doc.text("OBJETO SOCIAL", margin + 4, pos.y + 5);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + paddingTop + 3 + i * lineH));
    pos.y += boxH + 4;
  }

  if (data.contrato?.administracao) {
    const lineH = 5; const paddingV = 6; const textMaxW = contentW - 8;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.contrato.administracao, textMaxW) as string[];
    const boxH = lines.length * lineH + paddingV * 2 + 6;
    checkPageBreak(ctx, Math.min(boxH + 4, 60));
    doc.setFillColor(...colors.surface);
    doc.roundedRect(margin, pos.y, contentW, boxH, 1, 1, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
    doc.text("ADMINISTRACAO E PODERES", margin + 4, pos.y + 5);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.text);
    lines.forEach((line: string, i: number) => doc.text(line, margin + 4, pos.y + paddingV + 5 + i * lineH));
    pos.y += boxH + 4;
  }

  // Field rows
  const drawFieldRow = (fields: Array<{ label: string; value: string }>) => {
    const validFields = fields.filter(f => f.value);
    if (validFields.length === 0) return;
    const fieldW = contentW / validFields.length - 2;
    const textMaxW = fieldW - 8;
    const lineH = 4.5;
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const allLines = validFields.map(f => doc.splitTextToSize(f.value, textMaxW) as string[]);
    const maxLineCount = Math.max(...allLines.map(l => l.length));
    const boxH = Math.max(12, 6 + maxLineCount * lineH + 3);
    checkPageBreak(ctx, boxH + 2);
    let x = margin;
    validFields.forEach((field, idx) => {
      doc.setFillColor(...colors.surface);
      doc.roundedRect(x, pos.y, fieldW, boxH, 1, 1, "F");
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.textMuted);
      doc.text(field.label.toUpperCase(), x + 4, pos.y + 4.5);
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
      allLines[idx].forEach((line: string, i: number) => doc.text(line, x + 4, pos.y + 9 + i * lineH));
      x += fieldW + 4;
    });
    pos.y += boxH + 2;
  };

  drawFieldRow([
    { label: "Capital Social", value: data.contrato?.capitalSocial || "" },
    { label: "Data de Constituicao", value: data.contrato?.dataConstituicao || "" },
  ]);
  drawFieldRow([
    { label: "Prazo de Duracao", value: data.contrato?.prazoDuracao || "" },
    { label: "Foro", value: data.contrato?.foro || "" },
  ]);

  // Gestão e Grupo Econômico
  drawSpacer(ctx, 6);
  if (pos.y > 215) { newPage(ctx); drawHeaderCompact(ctx); }
  drawSectionTitle(ctx, "04", "GESTAO E GRUPO ECONOMICO");

  // Tabela de Sócios
  {
    type SocioEntry = { nome: string; cpfCnpj: string; qualificacao: string; participacao: string };
    const sociosList: SocioEntry[] = (data.qsa?.quadroSocietario || []).map(s => ({
      nome: s.nome || "",
      cpfCnpj: s.cpfCnpj || "",
      qualificacao: s.qualificacao || "",
      participacao: s.participacao || "",
    }));
    if (sociosList.length === 0 && data.contrato?.socios) {
      data.contrato.socios.forEach(s => sociosList.push({ nome: s.nome || "", cpfCnpj: s.cpf || "", qualificacao: s.qualificacao || "", participacao: s.participacao || "" }));
    }

    if (sociosList.length > 0) {
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
      doc.text("QUADRO SOCIETÁRIO", margin, pos.y + 4);
      pos.y += 8;

      const gColNome = contentW * 0.24; const gColCpf = contentW * 0.15; const gColPart = contentW * 0.09;
      const gColScr = contentW * 0.13; const gColVenc = contentW * 0.10; const gColPrej = contentW * 0.10;
      const gColProt = contentW * 0.10; const gColProc = contentW * 0.09;
      const gRowH = 6.5;

      doc.setFillColor(...colors.navy);
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(4.8); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      let gx = margin;
      doc.text("NOME / RAZÃO SOCIAL", gx + 2, pos.y + 4); gx += gColNome;
      doc.text("CPF/CNPJ", gx + 2, pos.y + 4); gx += gColCpf;
      doc.text("PART.", gx + gColPart - 1, pos.y + 4, { align: "right" }); gx += gColPart;
      doc.text("SCR TOTAL", gx + gColScr - 1, pos.y + 4, { align: "right" }); gx += gColScr;
      doc.text("VENCIDO", gx + gColVenc - 1, pos.y + 4, { align: "right" }); gx += gColVenc;
      doc.text("PREJUÍZO", gx + gColPrej - 1, pos.y + 4, { align: "right" }); gx += gColPrej;
      doc.text("PROT.", gx + gColProt - 1, pos.y + 4, { align: "right" }); gx += gColProt;
      doc.text("PROC.", gx + gColProc - 1, pos.y + 4, { align: "right" });
      pos.y += 6;

      const toAbbrev = (v: string | undefined) => {
        if (!v || v === "0,00" || v === "") return "—";
        const n = parseMoneyToNumber(v);
        if (n === 0) return "—";
        if (n >= 1000000) return fmtBR(n / 1000000, 1) + "M";
        if (n >= 1000) return fmtBR(Math.round(n / 1000), 0) + "K";
        return v;
      };

      sociosList.forEach((s, idx) => {
        if (pos.y + gRowH > DS.space.pageBreakY) { newPage(ctx); drawHeaderCompact(ctx); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, pos.y, contentW, gRowH, "F");

        const scrSocio = data.scrSocios?.find(sc =>
          sc.cpfSocio === s.cpfCnpj || sc.nomeSocio?.toLowerCase() === s.nome.toLowerCase()
        );
        const scrTotal    = scrSocio?.periodoAtual?.totalDividasAtivas;
        const scrVencido  = scrSocio?.periodoAtual?.vencidos;
        const scrPrejuizo = scrSocio?.periodoAtual?.prejuizos;
        const hasVenc = scrVencido && scrVencido !== "0,00";
        const hasPrej = scrPrejuizo && scrPrejuizo !== "0,00";

        doc.setFontSize(5); doc.setFont("helvetica", "normal");
        let gxR = margin;
        const nomeT = s.nome.length > 30 ? s.nome.substring(0, 29) + "…" : s.nome;
        doc.setTextColor(...colors.text);
        doc.text(nomeT, gxR + 2, pos.y + 4.5); gxR += gColNome;
        doc.setTextColor(...colors.textSec);
        doc.text(s.cpfCnpj || "—", gxR + 2, pos.y + 4.5); gxR += gColCpf;
        doc.setTextColor(...colors.text);
        doc.text(s.participacao || "—", gxR + gColPart - 1, pos.y + 4.5, { align: "right" }); gxR += gColPart;
        doc.text(toAbbrev(scrTotal), gxR + gColScr - 1, pos.y + 4.5, { align: "right" }); gxR += gColScr;
        doc.setTextColor(...(hasVenc ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrVencido), gxR + gColVenc - 1, pos.y + 4.5, { align: "right" }); gxR += gColVenc;
        doc.setTextColor(...(hasPrej ? [185, 28, 28] as [number, number, number] : colors.textMuted));
        doc.text(toAbbrev(scrPrejuizo), gxR + gColPrej - 1, pos.y + 4.5, { align: "right" }); gxR += gColPrej;
        doc.setTextColor(...colors.textMuted);
        doc.text("—", gxR + gColProt - 1, pos.y + 4.5, { align: "right" }); gxR += gColProt;
        doc.text("—", gxR + gColProc - 1, pos.y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);
        pos.y += gRowH;
      });
      pos.y += 6;
    }
  }

  // Tabela Empresas Vinculadas
  {
    const empresasGrupo = data.grupoEconomico?.empresas || [];
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.text);
    doc.text("EMPRESAS VINCULADAS (GRUPO ECONÔMICO)", margin, pos.y + 4);
    pos.y += 8;

    if (empresasGrupo.length === 0) {
      checkPageBreak(ctx, 10);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, pos.y, contentW, 8, "F");
      doc.setFontSize(6.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...colors.textMuted);
      doc.text("Nenhuma empresa vinculada identificada", margin + 4, pos.y + 5.5);
      pos.y += 10;
    } else {
      const geNome = contentW * 0.30; const geCnpj = contentW * 0.18; const geSit = contentW * 0.12;
      const geVia  = contentW * 0.22; const gePart = contentW * 0.10;
      const geRowH = 7;
      checkPageBreak(ctx, 6 + empresasGrupo.length * geRowH + 8);

      doc.setFillColor(...colors.navy);
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFontSize(4.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      let ex = margin;
      doc.text("RAZÃO SOCIAL", ex + 2, pos.y + 4); ex += geNome;
      doc.text("CNPJ", ex + 2, pos.y + 4); ex += geCnpj;
      doc.text("SITUAÇÃO", ex + 2, pos.y + 4); ex += geSit;
      doc.text("VIA SÓCIO", ex + 2, pos.y + 4); ex += geVia;
      doc.text("PARTICIPAÇÃO", ex + gePart - 1, pos.y + 4, { align: "right" }); ex += gePart;
      doc.text("RELAÇÃO", margin + contentW - 1, pos.y + 4, { align: "right" });
      pos.y += 6;

      empresasGrupo.forEach((emp, idx) => {
        if (pos.y + geRowH > DS.space.pageBreakY) { newPage(ctx); drawHeaderCompact(ctx); }
        const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, pos.y, contentW, geRowH, "F");

        let ex2 = margin;
        doc.setFontSize(4.8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.text);
        const nomeLines = doc.splitTextToSize(emp.razaoSocial || "—", geNome - 4) as string[];
        doc.text(nomeLines[0] + (nomeLines.length > 1 ? "…" : ""), ex2 + 2, pos.y + 4.5); ex2 += geNome;

        doc.setTextColor(...colors.textSec);
        doc.text(emp.cnpj || "—", ex2 + 2, pos.y + 4.5); ex2 += geCnpj;

        const sit = (emp.situacao || "—").toUpperCase();
        const sitColor: [number, number, number] = sit === "ATIVA" ? [22,163,74] : sit === "BAIXADA" ? [220,38,38] : [217,119,6];
        doc.setTextColor(...sitColor); doc.setFont("helvetica", "bold");
        doc.text(sit, ex2 + 2, pos.y + 4.5); ex2 += geSit;

        doc.setFont("helvetica", "normal"); doc.setFontSize(4.3); doc.setTextColor(...colors.textSec);
        const viaLines = doc.splitTextToSize(emp.socioOrigem || "—", geVia - 4) as string[];
        doc.text(viaLines[0] + (viaLines.length > 1 ? "…" : ""), ex2 + 2, pos.y + 4.5); ex2 += geVia;

        doc.setFontSize(4.8); doc.setTextColor(...colors.text);
        doc.text(emp.participacao || "—", ex2 + gePart - 1, pos.y + 4.5, { align: "right" }); ex2 += gePart;
        doc.setTextColor(...colors.textMuted);
        doc.text(emp.relacao || "—", margin + contentW - 1, pos.y + 4.5, { align: "right" });
        doc.setTextColor(...colors.text);
        pos.y += geRowH;
      });
      pos.y += 4;
    }

    // Parentesco alerts
    const geParentescos = data.grupoEconomico?.parentescosDetectados || [];
    geParentescos.forEach(pt => {
      drawAlertDeduped(ctx, `Possível parentesco entre sócios: ${pt.socio1} e ${pt.socio2}`, "MODERADA", `Sobrenome em comum: ${pt.sobrenomeComum}`);
    });
  }

  void autoT;
  void dsMiniHeader;
}
