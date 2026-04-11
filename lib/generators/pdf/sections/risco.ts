/**
 * Seções 05, 06, CCF, HISTÓRICO DE CONSULTAS
 * Protestos (KPIs + distribuição + tabelas detalhadas)
 * Processos Judiciais (KPIs + distribuição + tops)
 * CCF — Cheques sem Fundo
 * Histórico de Consultas ao Mercado
 */
import type { PdfCtx } from "../context";
import {
  newPage, drawHeader, checkPageBreak, drawSectionTitle, drawSpacer,
  drawAlertDeduped, dsMiniHeader, dsMetricCard, autoT,
  fmtMoney, fmtBR, parseMoneyToNumber,
} from "../helpers";

export function renderRisco(ctx: PdfCtx): void {
  _renderProtestos(ctx);
  _renderProcessos(ctx);
  _renderCCF(ctx);
  _renderHistoricoConsultas(ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTESTOS
// ─────────────────────────────────────────────────────────────────────────────

function _renderProtestos(ctx: PdfCtx): void {
  const { doc, DS, pos, data, params, margin, contentW } = ctx;
  const colors = DS.colors;
  const { protestosVigentes } = params;
  const protestosNaoConsultados = !data.protestos;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 50);
  drawSectionTitle(ctx, "05", "PROTESTOS");

  // ── KPI Cards ──
  {
    checkPageBreak(ctx, 22);
    const kpiGapP = 3;
    const kpiWP = (contentW - kpiGapP * 3) / 4;
    const kpiHP = 20;
    const vigQtdP = parseInt(data.protestos?.vigentesQtd || '0');
    const regQtdP = parseInt(data.protestos?.regularizadosQtd || '0');
    const kpiDataP = [
      { label: 'Vigentes Qtd', value: protestosNaoConsultados ? 'N/C' : String(vigQtdP), border: vigQtdP > 0 ? DS.colors.danger : DS.colors.success, valColor: vigQtdP > 0 ? DS.colors.danger : DS.colors.textPrimary },
      { label: 'Vigentes R$', value: protestosNaoConsultados ? 'N/C' : (vigQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.vigentesValor)}` : '—'), border: vigQtdP > 0 ? DS.colors.danger : DS.colors.success, valColor: vigQtdP > 0 ? DS.colors.danger : DS.colors.textLight2 },
      { label: 'Regularizados Qtd', value: protestosNaoConsultados ? 'N/C' : String(regQtdP), border: regQtdP > 0 ? DS.colors.success : DS.colors.borderRGB, valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textPrimary },
      { label: 'Regularizados R$', value: protestosNaoConsultados ? 'N/C' : (regQtdP > 0 ? `R$ ${fmtMoney(data.protestos?.regularizadosValor)}` : '—'), border: regQtdP > 0 ? DS.colors.success : DS.colors.borderRGB, valColor: regQtdP > 0 ? DS.colors.success : DS.colors.textLight2 },
    ];
    kpiDataP.forEach((k, i) => {
      dsMetricCard(ctx, margin + i * (kpiWP + kpiGapP), pos.y, kpiWP, kpiHP, k.label, k.value, undefined, k.border, k.valColor);
    });
    pos.y += kpiHP + 4;
  }

  // ── Processos como contexto de risco ──
  {
    const procTotalSint = parseInt(data.processos?.passivosTotal || "0");
    const poloAtivoSint = parseInt(data.processos?.poloAtivoQtd || "0");
    const poloPassivoSint = parseInt(data.processos?.poloPassivoQtd || "0");
    const temFalSint = !!data.processos?.temFalencia;
    if (procTotalSint > 0 || temFalSint) {
      checkPageBreak(ctx, 22);
      const kpiGapP2 = 3;
      const kpiWP2 = (contentW - kpiGapP2 * 3) / 4;
      const kpiHP2 = 20;
      const procKpis = [
        { label: "Processos Judiciais", value: String(procTotalSint), border: procTotalSint > 0 ? ([217, 119, 6] as [number, number, number]) : DS.colors.borderRGB, valColor: procTotalSint > 0 ? ([217, 119, 6] as [number, number, number]) : DS.colors.textPrimary },
        { label: "Polo Ativo (Autor)", value: poloAtivoSint > 0 ? String(poloAtivoSint) : "—", border: [59, 130, 246] as [number, number, number], valColor: [29, 78, 216] as [number, number, number] },
        { label: "Polo Passivo (Réu)", value: poloPassivoSint > 0 ? String(poloPassivoSint) : "—", border: poloPassivoSint > 0 ? DS.colors.danger : DS.colors.borderRGB, valColor: poloPassivoSint > 0 ? DS.colors.danger : DS.colors.textPrimary },
        { label: "Falência / RJ", value: temFalSint ? "ALERTA" : (data.processos?.temRJ ? "RJ" : "—"), border: (temFalSint || data.processos?.temRJ) ? DS.colors.danger : DS.colors.borderRGB, valColor: (temFalSint || data.processos?.temRJ) ? DS.colors.danger : DS.colors.textLight2 },
      ];
      procKpis.forEach((k, i) => {
        dsMetricCard(ctx, margin + i * (kpiWP2 + kpiGapP2), pos.y, kpiWP2, kpiHP2, k.label, k.value, undefined, k.border, k.valColor);
      });
      pos.y += kpiHP2 + 4;
    }
  }

  if (protestosNaoConsultados) {
    drawSpacer(ctx, 4);
    _drawBannerNaoConsultadoLocal(ctx, "Protestos");
  } else if (protestosVigentes > 0) {
    const valorProt = parseMoneyToNumber(data.protestos?.vigentesValor || "0");
    const msgProt = valorProt > 0
      ? `${protestosVigentes} protesto(s) vigente(s) — R$ ${fmtMoney(data.protestos?.vigentesValor)}`
      : `${protestosVigentes} protesto(s) vigente(s) — valor não disponível no bureau (confirmar junto ao cartório)`;
    drawAlertDeduped(ctx, msgProt, "ALTA");
  }

  const protestoDetalhes = data.protestos?.detalhes || [];

  if (!protestosNaoConsultados && protestoDetalhes.length === 0) {
    drawSpacer(ctx, 4);
    checkPageBreak(ctx, 12);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, pos.y, contentW, 10, 1, 1, "F");
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(margin, pos.y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74);
    doc.text("Nenhum protesto identificado", margin + 8, pos.y + 6.5);
    pos.y += 14;
  } else if (!protestosNaoConsultados) {
    const parseDate = (d: string): Date | null => {
      if (!d) return null;
      const parts = d.split("/");
      if (parts.length !== 3) return null;
      const [dd, mm, aaaa] = parts.map(Number);
      if (!dd || !mm || !aaaa) return null;
      return new Date(aaaa, mm - 1, dd);
    };
    const parseProt = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
    const fmtProt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const now = new Date();
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    const ms90 = 90 * 24 * 60 * 60 * 1000;
    const ms365 = 365 * 24 * 60 * 60 * 1000;

    type TempBucket = { label: string; qtd: number; valor: number };
    const tempBuckets: TempBucket[] = [
      { label: "Ultimo mes (30 dias)", qtd: 0, valor: 0 },
      { label: "Ultimos 3 meses", qtd: 0, valor: 0 },
      { label: "Ultimos 12 meses", qtd: 0, valor: 0 },
      { label: "Mais de 12 meses", qtd: 0, valor: 0 },
    ];
    protestoDetalhes.forEach((p: { data?: string; valor?: string }) => {
      const dt = parseDate(p.data || "");
      const val = parseProt(p.valor || "0");
      if (!dt) return;
      const age = now.getTime() - dt.getTime();
      if (age <= ms30) { tempBuckets[0].qtd++; tempBuckets[0].valor += val; }
      if (age <= ms90) { tempBuckets[1].qtd++; tempBuckets[1].valor += val; }
      if (age <= ms365) { tempBuckets[2].qtd++; tempBuckets[2].valor += val; }
      else { tempBuckets[3].qtd++; tempBuckets[3].valor += val; }
    });

    type ValBucket = { label: string; min: number; max: number; qtd: number; valor: number };
    const valBuckets: ValBucket[] = [
      { label: "Abaixo de R$ 1.000", min: 0, max: 1000, qtd: 0, valor: 0 },
      { label: "R$ 1.000 a R$ 10.000", min: 1000, max: 10000, qtd: 0, valor: 0 },
      { label: "R$ 10.000 a R$ 50.000", min: 10000, max: 50000, qtd: 0, valor: 0 },
      { label: "R$ 50.000 a R$ 100.000", min: 50000, max: 100000, qtd: 0, valor: 0 },
      { label: "Acima de R$ 100.000", min: 100000, max: Infinity, qtd: 0, valor: 0 },
    ];
    protestoDetalhes.forEach((p: { valor?: string }) => {
      const val = parseProt(p.valor || "0");
      const bucket = valBuckets.find(b => val >= b.min && val < b.max);
      if (bucket) { bucket.qtd++; bucket.valor += val; }
    });

    // Dois blocos lado a lado: distribuição temporal + faixas
    {
      const colGapD = 4;
      const colWD = (contentW - colGapD) / 2;
      const rowHD = 6;
      const maxRowsD = Math.max(tempBuckets.length, valBuckets.length);
      const neededD = 7 + maxRowsD * rowHD + 8;
      drawSpacer(ctx, 4);
      checkPageBreak(ctx, neededD);

      const yDistStart = pos.y;

      // Headers
      _dsMiniHeaderAt(ctx, margin, yDistStart, colWD, 'DISTRIBUICAO TEMPORAL', DS.colors.headerBg);
      _dsMiniHeaderAt(ctx, margin + colWD + colGapD, yDistStart, colWD, 'DISTRIBUICAO POR FAIXA', DS.colors.headerBg);

      let yL = yDistStart + 7;
      let yR = yDistStart + 7;

      const drawSubHeader2 = (cx: number, startY: number, cw: number, c1: string, c2: string, c3: string) => {
        doc.setFillColor(50, 70, 110);
        doc.rect(cx, startY, cw, 5.5, 'F');
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(c1, cx + 2, startY + 4);
        doc.text(c2, cx + cw * 0.72, startY + 4, { align: 'right' });
        doc.text(c3, cx + cw - 1, startY + 4, { align: 'right' });
        return startY + 5.5;
      };
      yL = drawSubHeader2(margin, yL, colWD, 'PERIODO', 'QTD', 'VALOR');
      yR = drawSubHeader2(margin + colWD + colGapD, yR, colWD, 'FAIXA', 'QTD', 'VALOR');

      tempBuckets.forEach((b, idx) => {
        doc.setFillColor(...(idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg));
        doc.rect(margin, yL, colWD, rowHD, 'F');
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DS.colors.textPrimary);
        const labTrunc = b.label.length > 22 ? b.label.substring(0, 21) + '…' : b.label;
        doc.text(labTrunc, margin + 2, yL + 4);
        doc.text(String(b.qtd), margin + colWD * 0.72, yL + 4, { align: 'right' });
        doc.setTextColor(...(b.qtd > 0 ? DS.colors.danger : DS.colors.textLight2));
        doc.text(b.qtd > 0 ? fmtProt(b.valor) : '—', margin + colWD - 1, yL + 4, { align: 'right' });
        doc.setDrawColor(...DS.colors.borderRGB);
        doc.line(margin, yL + rowHD, margin + colWD, yL + rowHD);
        yL += rowHD;
      });

      valBuckets.forEach((b, idx) => {
        const cx2 = margin + colWD + colGapD;
        doc.setFillColor(...(idx % 2 === 0 ? DS.colors.zebraRow : DS.colors.cardBg));
        doc.rect(cx2, yR, colWD, rowHD, 'F');
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DS.colors.textPrimary);
        const labTrunc2 = b.label.length > 20 ? b.label.substring(0, 19) + '…' : b.label;
        doc.text(labTrunc2, cx2 + 2, yR + 4);
        doc.text(String(b.qtd), cx2 + colWD * 0.72, yR + 4, { align: 'right' });
        doc.setTextColor(...(b.qtd > 0 ? DS.colors.textPrimary : DS.colors.textLight2));
        doc.text(b.qtd > 0 ? fmtProt(b.valor) : '—', cx2 + colWD - 1, yR + 4, { align: 'right' });
        doc.setDrawColor(...DS.colors.borderRGB);
        doc.line(cx2, yR + rowHD, cx2 + colWD, yR + rowHD);
        yR += rowHD;
      });

      pos.y = Math.max(yL, yR) + 4;
    }

    const protWidths = [28, contentW - 28 - 38 - 22, 38, 22];
    const drawProtTable = (rows: typeof protestoDetalhes) => {
      checkPageBreak(ctx, 6.5 + rows.length * 6 + 2);
      autoT(ctx,
        ["Data", "Credor / Apresentante", "Valor (R$)", "Regularizado"],
        rows.map((p: { data?: string; credor?: string; apresentante?: string; especie?: string; valor?: string; regularizado?: boolean }) => {
          const regLabel = p.regularizado ? "Sim" : "Não";
          const valColor: [number, number, number] = p.regularizado ? DS.colors.successText : DS.colors.danger;
          const regColor: [number, number, number] = p.regularizado ? DS.colors.successText : DS.colors.danger;
          return [
            p.data || "—",
            [p.credor || p.apresentante || "—", p.especie ? ` (${p.especie})` : ""].join(""),
            { content: p.valor || "—", styles: { textColor: valColor } },
            { content: regLabel, styles: { textColor: regColor } },
          ];
        }),
        protWidths,
      );
    };

    const semDetalhesReais = protestoDetalhes.every((p: { data?: string; apresentante?: string; valor?: string }) => !p.data && !p.apresentante && parseProt(p.valor || "0") === 0);

    if (semDetalhesReais) {
      drawSpacer(ctx, 4);
      checkPageBreak(ctx, 16);
      dsMiniHeader(ctx, 'LOCAIS DOS PROTESTOS');
      drawProtTable(protestoDetalhes.slice(0, 10));
      checkPageBreak(ctx, 10);
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text("* Detalhes (valor, data, apresentante) nao disponiveis no plano atual do Credit Hub — confirmar diretamente nos cartorios.", margin, pos.y);
      pos.y += 7;
    } else {
      drawSpacer(ctx, 4);
      checkPageBreak(ctx, 16);
      dsMiniHeader(ctx, 'TOP 10 MAIS RECENTES');
      const top10Recentes = [...protestoDetalhes]
        .sort((a: { data?: string }, b: { data?: string }) => {
          const da = parseDate(a.data || "");
          const db = parseDate(b.data || "");
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return db.getTime() - da.getTime();
        })
        .slice(0, 10);
      drawProtTable(top10Recentes);

      drawSpacer(ctx, 4);
      checkPageBreak(ctx, 16);
      dsMiniHeader(ctx, 'TOP 10 POR VALOR');
      const top10Valor = [...protestoDetalhes]
        .sort((a: { valor?: string }, b: { valor?: string }) => parseProt(b.valor || "0") - parseProt(a.valor || "0"))
        .slice(0, 10);
      drawProtTable(top10Valor);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSOS JUDICIAIS
// ─────────────────────────────────────────────────────────────────────────────

function _renderProcessos(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;
  const processosNaoConsultados = !data.processos;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 50);
  drawSectionTitle(ctx, "06", "PROCESSOS JUDICIAIS");

  // KPI Cards
  {
    checkPageBreak(ctx, 52);
    const kpiGapQ = 3;
    const kpiWQ = (contentW - kpiGapQ * 2) / 3;
    const kpiHQ = 20;
    const passivosN = parseInt(data.processos?.passivosTotal || '0');
    const poloAtivoN = parseInt(data.processos?.poloAtivoQtd || '0');
    const poloPassN = parseInt(data.processos?.poloPassivoQtd || '0');
    const temRJN = !!data.processos?.temRJ;
    const temFalN = !!data.processos?.temFalencia;
    const dividasQN = parseInt(data.processos?.dividasQtd || '0');

    const nc = processosNaoConsultados ? 'N/C' : null;
    const kpiRowsQ = [
      [
        { label: 'Total Processos', value: nc ?? String(passivosN), border: passivosN > 0 ? DS.colors.warn : DS.colors.borderRGB, valColor: passivosN > 0 ? DS.colors.warn : DS.colors.textPrimary },
        { label: 'Polo Ativo (Autor)', value: nc ?? (poloAtivoN > 0 ? String(poloAtivoN) : '—'), border: DS.colors.info, valColor: [59, 130, 246] as [number, number, number] },
        { label: 'Polo Passivo (Reu)', value: nc ?? (poloPassN > 0 ? String(poloPassN) : '—'), border: poloPassN > 0 ? DS.colors.warn : DS.colors.borderRGB, valColor: poloPassN > 0 ? DS.colors.warn : DS.colors.textPrimary },
      ],
      [
        { label: 'Rec. Judicial / Falencia', value: nc ?? (temFalN ? 'FALENCIA' : temRJN ? 'RJ' : 'Nao'), border: (temFalN || temRJN) ? DS.colors.danger : DS.colors.success, valColor: (temFalN || temRJN) ? DS.colors.danger : DS.colors.success },
        { label: 'Dividas Qtd', value: nc ?? String(dividasQN), border: dividasQN > 0 ? DS.colors.danger : DS.colors.borderRGB, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textPrimary },
        { label: 'Dividas R$', value: nc ?? (dividasQN > 0 ? `R$ ${fmtMoney(data.processos?.dividasValor)}` : '—'), border: dividasQN > 0 ? DS.colors.danger : DS.colors.borderRGB, valColor: dividasQN > 0 ? DS.colors.danger : DS.colors.textLight2 },
      ],
    ];
    kpiRowsQ.forEach((row, ri) => {
      row.forEach((k, ci) => {
        dsMetricCard(ctx, margin + ci * (kpiWQ + kpiGapQ), pos.y + ri * (kpiHQ + kpiGapQ), kpiWQ, kpiHQ, k.label, k.value, undefined, k.border, k.valColor);
      });
    });
    pos.y += kpiHQ * 2 + kpiGapQ * 2 + 4;
  }

  if (processosNaoConsultados) {
    drawSpacer(ctx, 4);
    _drawBannerNaoConsultadoLocal(ctx, "Processos judiciais");
  } else if (data.processos?.temFalencia) {
    drawAlertDeduped(ctx, "PEDIDO DE FALENCIA identificado nos processos judiciais", "ALTA");
  } else if (data.processos?.temRJ) {
    drawAlertDeduped(ctx, "RECUPERACAO JUDICIAL identificada", "ALTA");
  }

  const proc = data.processos;
  const distribuicao = proc?.distribuicao || [];
  const bancarios = proc?.bancarios || [];
  const fiscais = proc?.fiscais || [];
  const fornecedores = proc?.fornecedores || [];
  const outrosProc = proc?.outros || [];

  const semDados = !proc
    || (parseInt(proc.passivosTotal || "0") === 0
      && parseInt(proc.ativosTotal || "0") === 0
      && distribuicao.length === 0
      && bancarios.length === 0
      && fiscais.length === 0
      && fornecedores.length === 0
      && outrosProc.length === 0
      && (proc.top10Valor?.length ?? 0) === 0
      && (proc.top10Recentes?.length ?? 0) === 0);

  if (!processosNaoConsultados && semDados) {
    drawSpacer(ctx, 4);
    checkPageBreak(ctx, 12);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, pos.y, contentW, 10, 1, 1, "F");
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(margin, pos.y, 3, 10, 0.5, 0.5, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74);
    doc.text("Nenhum processo judicial identificado", margin + 8, pos.y + 6.5);
    pos.y += 14;
  } else if (!processosNaoConsultados) {
    const drawProcLabel = (title: string) => {
      drawSpacer(ctx, 4);
      checkPageBreak(ctx, 14);
      dsMiniHeader(ctx, title);
    };

    const statusColor = (s: string): [number, number, number] =>
      /arquivado/i.test(s) ? [22, 163, 74] : colors.warning;

    type ProcCell = { text: string; color?: [number, number, number]; bold?: boolean; align?: "left" | "right" };

    const drawProcAutoTable = (headers: string[], cellRows: ProcCell[][], colWidths: number[]) => {
      checkPageBreak(ctx, 6.5 + cellRows.length * 6 + 2);
      autoT(ctx,
        headers,
        cellRows.map(row =>
          row.map(cell =>
            cell.color || cell.bold
              ? { content: cell.text, styles: { textColor: cell.color, fontStyle: cell.bold ? "bold" : "normal" } as Record<string, unknown> }
              : cell.text
          )
        ),
        colWidths,
      );
    };

    if (distribuicao.length > 0) {
      drawProcLabel("DISTRIBUICAO POR TIPO");
      const distCW = [contentW * 0.55, contentW * 0.20, contentW * 0.25];
      const totalQtd = distribuicao.reduce((s: number, d: { qtd?: string }) => s + (parseInt(d.qtd || "0") || 0), 0);
      drawProcAutoTable(
        ["TIPO", "QTD", "%"],
        [
          ...distribuicao.map((d: { tipo?: string; qtd?: string; pct?: string }) => {
            const qtdN = parseInt(d.qtd || "0") || 0;
            const isHigh = qtdN > 10;
            return [
              { text: d.tipo || "—", color: isHigh ? colors.danger : colors.text, bold: isHigh },
              { text: String(qtdN), color: isHigh ? colors.danger : colors.text, bold: isHigh },
              { text: d.pct ? `${d.pct}%` : "—" },
            ] as ProcCell[];
          }),
          [{ text: "TOTAL", bold: true }, { text: String(totalQtd), bold: true }, { text: "100%", bold: true }] as ProcCell[],
        ],
        distCW,
      );
    }

    if (bancarios.length > 0) {
      drawProcLabel(`PROCESSOS BANCARIOS (${bancarios.length})`);
      drawProcAutoTable(
        ["BANCO", "ASSUNTO", "VALOR", "STATUS", "DATA"],
        bancarios.map((b: { banco?: string; assunto?: string; valor?: string; status?: string; data?: string }) => [
          { text: b.banco || "—" },
          { text: b.assunto || "—" },
          { text: b.valor || "—" },
          { text: b.status || "—", color: statusColor(b.status || "") },
          { text: b.data || "—" },
        ]),
        [0.22, 0.28, 0.18, 0.18, 0.14].map(r => contentW * r),
      );
    }

    if (fiscais.length > 0) {
      const fiscalQtdDist = distribuicao.find((d: { tipo?: string }) => /fiscal/i.test(d.tipo || ""))?.qtd || String(fiscais.length);
      const fiscaisShow = fiscais.slice(0, 3);
      drawProcLabel(`TOP ${fiscaisShow.length} FISCAIS (de ${fiscalQtdDist} total)`);
      drawProcAutoTable(
        ["CONTRAPARTE", "VALOR", "STATUS", "DATA"],
        fiscaisShow.map((f: { contraparte?: string; valor?: string; status?: string; data?: string }) => [
          { text: f.contraparte || "—" },
          { text: f.valor || "—" },
          { text: f.status || "—", color: statusColor(f.status || "") },
          { text: f.data || "—" },
        ]),
        [0.38, 0.22, 0.20, 0.20].map(r => contentW * r),
      );
    }

    if (fornecedores.length > 0) {
      drawProcLabel(`PROCESSOS FORNECEDORES (${fornecedores.length})`);
      drawProcAutoTable(
        ["CONTRAPARTE", "ASSUNTO", "VALOR", "STATUS", "DATA"],
        fornecedores.map((f: { contraparte?: string; assunto?: string; valor?: string; status?: string; data?: string }) => [
          { text: f.contraparte || "—" },
          { text: f.assunto || "—" },
          { text: f.valor || "—" },
          { text: f.status || "—", color: statusColor(f.status || "") },
          { text: f.data || "—" },
        ]),
        [0.28, 0.24, 0.16, 0.18, 0.14].map(r => contentW * r),
      );
    }

    if (outrosProc.length > 0) {
      drawProcLabel("TOP 5 OUTROS");
      drawProcAutoTable(
        ["CONTRAPARTE", "ASSUNTO", "VALOR", "STATUS", "DATA"],
        outrosProc.slice(0, 5).map((o: { contraparte?: string; assunto?: string; valor?: string; status?: string; data?: string }) => [
          { text: o.contraparte || "—" },
          { text: o.assunto || "—" },
          { text: o.valor || "—" },
          { text: o.status || "—", color: statusColor(o.status || "") },
          { text: o.data || "—" },
        ]),
        [0.28, 0.24, 0.16, 0.18, 0.14].map(r => contentW * r),
      );
    }

    if ((proc?.distribuicaoTemporal?.length ?? 0) > 0) {
      drawProcLabel("DISTRIBUIÇÃO TEMPORAL");
      drawProcAutoTable(
        ["PERÍODO", "QTD", "VALOR ESTIMADO"],
        proc!.distribuicaoTemporal!.map((dt: { periodo: string; qtd: string; valor?: string }) => [
          { text: dt.periodo },
          { text: dt.qtd, align: "right" as const },
          { text: `R$ ${fmtMoney(dt.valor)}`, align: "right" as const },
        ]),
        [0.40, 0.25, 0.35].map(r => contentW * r),
      );
    }

    const procSemDetalhesReais = (proc?.top10Valor ?? []).every((p: { valorNum?: number; data?: string; partes?: string; assunto?: string }) => p.valorNum === 0 && !p.data && !p.partes && !p.assunto);

    const faixaTemValor = (proc?.distribuicaoPorFaixa ?? []).some((f: { valor?: string }) => parseFloat((f.valor || "0").replace(/\./g, "").replace(",", ".")) > 0);
    if ((proc?.distribuicaoPorFaixa?.length ?? 0) > 0 && faixaTemValor) {
      drawProcLabel("DISTRIBUIÇÃO POR FAIXA DE VALOR");
      const totalFaixaQtd = proc!.distribuicaoPorFaixa!.reduce((s: number, f: { qtd?: string }) => s + parseInt(f.qtd || "0"), 0);
      drawProcAutoTable(
        ["FAIXA", "QTD", "VALOR TOTAL", "%"],
        proc!.distribuicaoPorFaixa!.map((f: { faixa: string; qtd: string; valor?: string }) => {
          const pctN = totalFaixaQtd > 0 ? fmtBR((parseInt(f.qtd) / totalFaixaQtd) * 100, 0) : "0";
          const isHigh = parseInt(f.qtd) > 0 && (f.faixa === "> R$1M" || f.faixa === "R$200k-1M");
          return [
            { text: f.faixa, color: isHigh ? colors.danger : colors.text, bold: isHigh },
            { text: f.qtd, align: "right" as const, color: isHigh ? colors.danger : colors.text },
            { text: `R$ ${fmtMoney(f.valor)}`, align: "right" as const },
            { text: `${pctN}%`, align: "right" as const, color: colors.textMuted },
          ] as ProcCell[];
        }),
        [0.35, 0.18, 0.32, 0.15].map(r => contentW * r),
      );
    }

    if ((proc?.top10Recentes?.length ?? 0) > 0 && !procSemDetalhesReais) {
      drawProcLabel(`TOP ${proc!.top10Recentes!.length} MAIS RECENTES`);
      drawProcAutoTable(
        ["TIPO", "DISTRIB.", "ULT.MOVTO.", "ASSUNTO / PARTES", "VALOR", "STATUS", "FASE / UF"],
        proc!.top10Recentes!.map((p: { tipo?: string; data?: string; dataUltimoAndamento?: string; assunto?: string; partes?: string; valor?: string; status?: string; fase?: string; uf?: string }) => {
          const descTxt = [p.assunto, p.partes].filter(Boolean).join(" · ");
          const faseTxt = [p.fase, p.uf].filter(Boolean).join(" · ") || "—";
          return [
            { text: p.tipo || "—" },
            { text: p.data || "—" },
            { text: p.dataUltimoAndamento || "—" },
            { text: descTxt || "—" },
            { text: `R$ ${fmtMoney(p.valor)}`, align: "right" as const },
            { text: p.status || "—", color: statusColor(p.status || "") },
            { text: faseTxt },
          ] as ProcCell[];
        }),
        [0.10, 0.10, 0.10, 0.28, 0.13, 0.14, 0.15].map(r => contentW * r),
      );
    }

    if ((proc?.top10Valor?.length ?? 0) > 0 && !procSemDetalhesReais) {
      drawProcLabel(`TOP ${proc!.top10Valor!.length} POR VALOR`);
      drawProcAutoTable(
        ["TIPO", "POLO ATIVO", "POLO PASSIVO", "ASSUNTO / Nº", "VALOR", "STATUS", "UF/COMARCA"],
        proc!.top10Valor!.map((p: { tipo?: string; partes?: string; polo_passivo?: string; assunto?: string; numero?: string; valor?: string; status?: string; uf?: string; comarca?: string; tribunal?: string }) => {
          const assuntoTxt = p.numero ? `${p.assunto || "—"} · ${p.numero}` : (p.assunto || "—");
          const localTxt = [p.uf, p.comarca].filter(Boolean).join(" · ") || p.tribunal || "—";
          const vencido = /venc|inadimp|atraso/i.test(p.status || "");
          return [
            { text: p.tipo || "—" },
            { text: p.partes || "—" },
            { text: p.polo_passivo || "—" },
            { text: assuntoTxt },
            { text: `R$ ${fmtMoney(p.valor)}`, align: "right" as const, color: vencido ? colors.danger : colors.text, bold: vencido },
            { text: p.status || "—", color: statusColor(p.status || "") },
            { text: localTxt },
          ] as ProcCell[];
        }),
        [0.11, 0.16, 0.16, 0.20, 0.13, 0.12, 0.12].map(r => contentW * r),
      );
    }

    if (parseInt(proc?.passivosTotal || "0") > 0 && procSemDetalhesReais) {
      drawSpacer(ctx, 4);
      drawAlertDeduped(ctx,
        `${proc?.passivosTotal} processo(s) identificado(s) — valores e partes não disponíveis no plano atual`,
        "MODERADA",
        "O Credit Hub retornou apenas a contagem e UF dos processos. Solicitar relatório detalhado ou consultar diretamente."
      );
    } else if (parseInt(proc?.passivosTotal || "0") > 0
      && (proc?.top10Valor?.length ?? 0) === 0
      && (proc?.top10Recentes?.length ?? 0) === 0
      && distribuicao.length === 0) {
      drawSpacer(ctx, 4);
      drawAlertDeduped(ctx,
        `${proc?.passivosTotal} processo(s) identificado(s) — detalhamento não disponível`,
        "MODERADA",
        "Consultar diretamente nos tribunais competentes."
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CCF
// ─────────────────────────────────────────────────────────────────────────────

function _renderCCF(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  const ccf = data.ccf;
  const ccfConsultado = !!ccf;
  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 40);
  drawSectionTitle(ctx, "07", "CCF — CHEQUES SEM FUNDO");

  if (!ccfConsultado) {
    drawSpacer(ctx, 4);
    _drawBannerNaoConsultadoLocal(ctx, "CCF (Cheques sem Fundo)");
  } else {
    const temCCF = ccf.qtdRegistros > 0 || ccf.bancos.length > 0;

    // Field row
    checkPageBreak(ctx, 12);
    const rowH = 8;
    const fieldCols = [
      { label: "Ocorrências (Total)", value: String(ccf.qtdRegistros) },
      { label: "Bancos com Registro", value: String(ccf.bancos.length) },
      { label: "Situação", value: temCCF ? "POSSUI REGISTROS" : "Sem ocorrências" },
    ];
    const fieldW = (contentW - 6) / fieldCols.length;
    fieldCols.forEach((f, i) => {
      const fx = margin + i * (fieldW + 2);
      doc.setFillColor(...DS.colors.surface2);
      doc.rect(fx, pos.y, fieldW, rowH, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DS.colors.textMuted);
      doc.text(f.label, fx + 2, pos.y + 3.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DS.colors.textPrimary);
      doc.text(f.value, fx + 2, pos.y + 7);
    });
    pos.y += rowH + 4;

    if (temCCF) {
      drawAlertDeduped(ctx, `[ALTA] CCF: ${ccf.qtdRegistros} ocorrência(s) de Cheque sem Fundo — indicativo grave de inadimplência bancária`, "ALTA");
      if (ccf.tendenciaLabel === "crescimento" && (ccf.tendenciaVariacao ?? 0) > 10) {
        drawAlertDeduped(ctx, `[ALTA] Tendência CCF: crescimento de ${ccf.tendenciaVariacao}% nas ocorrências — deterioração bancária em curso`, "ALTA");
      }
    }

    if (temCCF && ccf.bancos.length > 0) {
      drawSpacer(ctx, 4);
      checkPageBreak(ctx, 14);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.textMuted);
      doc.text("OCORRÊNCIAS POR BANCO", margin, pos.y + 4);
      pos.y += 7;

      const temMotivo = ccf.bancos.some((b: { motivo?: string }) => b.motivo);
      autoT(ctx,
        temMotivo ? ["BANCO / INSTITUIÇÃO", "QTD", "ÚLTIMA OCORR.", "MOTIVO"] : ["BANCO / INSTITUIÇÃO", "QTD", "ÚLTIMA OCORRÊNCIA"],
        ccf.bancos.map((b: { banco: string; quantidade: number; dataUltimo?: string; motivo?: string }) => temMotivo
          ? [
            { content: b.banco, styles: { textColor: colors.danger } },
            String(b.quantidade),
            { content: b.dataUltimo || "—", styles: { textColor: colors.textMuted } },
            b.motivo || "—",
          ]
          : [
            { content: b.banco, styles: { textColor: colors.danger } },
            String(b.quantidade),
            { content: b.dataUltimo || "—", styles: { textColor: colors.textMuted } },
          ]
        ),
        temMotivo
          ? [0.32, 0.10, 0.18, 0.40].map(r => contentW * r)
          : [0.50, 0.20, 0.30].map(r => contentW * r),
        { fontSize: 6.5 },
      );
    } else if (!temCCF) {
      drawSpacer(ctx, 4);
      checkPageBreak(ctx, 12);
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(margin, pos.y, contentW, 10, 1, 1, "F");
      doc.setFillColor(22, 163, 74);
      doc.roundedRect(margin, pos.y, 3, 10, 0.5, 0.5, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 163, 74);
      doc.text("Nenhuma ocorrência de Cheque sem Fundo identificada", margin + 8, pos.y + 6.5);
      pos.y += 14;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO DE CONSULTAS
// ─────────────────────────────────────────────────────────────────────────────

function _renderHistoricoConsultas(ctx: PdfCtx): void {
  const { doc, DS, pos, data, margin, contentW } = ctx;
  const colors = DS.colors;

  const hist = data.historicoConsultas;
  if (!hist || hist.length === 0) return;

  drawSpacer(ctx, 10);
  checkPageBreak(ctx, 40);
  drawSectionTitle(ctx, "08", "HISTORICO DE CONSULTAS AO MERCADO");

  drawSpacer(ctx, 4);
  checkPageBreak(ctx, 8 + Math.min(hist.length, 15) * 6 + 4);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...colors.textMuted);
  doc.text(`${hist.length} consulta(s) registrada(s) — mostrando as mais recentes`, margin, pos.y + 4);
  pos.y += 7;

  autoT(ctx,
    ["INSTITUIÇÃO / USUÁRIO", "DATA DA CONSULTA"],
    hist.slice(0, 15).map((h: { usuario: string; ultimaConsulta?: string }) => [
      h.usuario,
      { content: h.ultimaConsulta ? new Date(h.ultimaConsulta).toLocaleDateString("pt-BR") : "—", styles: { textColor: colors.textMuted } },
    ]),
    [contentW * 0.70, contentW * 0.30],
    { fontSize: 6.5 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers locais
// ─────────────────────────────────────────────────────────────────────────────

function _dsMiniHeaderAt(ctx: PdfCtx, cx: number, cy: number, cw: number, title: string, fillColor: [number, number, number]): void {
  const { doc } = ctx;
  doc.setFillColor(...fillColor);
  doc.rect(cx, cy, cw, 7, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), cx + 3, cy + 4.8);
}

function _drawBannerNaoConsultadoLocal(ctx: PdfCtx, secao: string): void {
  const { doc, DS, pos, margin, contentW } = ctx;
  const padV = 10; const padH = 14;
  const textW = contentW - padH * 2 - 3;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const descText = `${secao}: consulta não realizada nesta análise — dado não disponível no momento da geração do relatório.`;
  const descLines = doc.splitTextToSize(descText, textW);
  const bannerH = padV + 8 + descLines.length * 4 + padV;
  checkPageBreak(ctx, bannerH + 4);
  doc.setFillColor(255, 251, 235);
  doc.roundedRect(margin, pos.y, contentW, bannerH, 1.5, 1.5, "F");
  doc.setFillColor(...DS.colors.warn);
  doc.roundedRect(margin, pos.y, 3, bannerH, 0.5, 0.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DS.colors.warn);
  doc.text("Consulta não realizada", margin + padH, pos.y + padV);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 80, 0);
  descLines.forEach((l: string, i: number) => {
    doc.text(l, margin + padH, pos.y + padV + 7 + i * 4);
  });
  pos.y += bannerH + 4;
}
