/**
 * Seção 08 — PARECER PRELIMINAR
 * Extraída de pdf.ts para reduzir o tamanho do módulo principal.
 * Todos os helpers (newPage, checkPageBreak, etc.) são passados via PdfCtx e
 * capturam `pos` por referência, então pos.y permanece sincronizado.
 */
import type { PdfCtx } from "../pdf-ctx";
import type { AIAnalysis, ExtractedData } from "@/types";

export interface ParecerParams {
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  resumoExecutivo: string;
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: { pergunta: string; contexto: string }[];
  observacoes?: string;
  coberturaAnalise?: AIAnalysis["coberturaAnalise"];
  // Dados para breakdown do score
  data?: ExtractedData;
  vencidosSCR?: number;
  fmmNum?: number;
  protestosVigentes?: number;
  alavancagem?: number;
  validMeses?: { mes: string; valor: string }[];
}

// Helper: safely cast DS.colors value to RGB tuple
function dsRGB(val: unknown): [number, number, number] {
  if (Array.isArray(val) && val.length === 3) return val as [number, number, number];
  return [107, 114, 128]; // fallback gray
}


export function renderParecer(ctx: PdfCtx, params: ParecerParams): void {
  const { doc, pos, margin, contentW, colors, DS, newPage, drawHeader, checkPageBreak, dsSectionHeader, dsMiniHeader, autoT } = ctx;
  const { aiAnalysis, decision, finalRating, resumoExecutivo, pontosFortes, pontosFracos, perguntasVisita, observacoes, coberturaAnalise,
          data, vencidosSCR = 0, fmmNum = 0, protestosVigentes = 0, alavancagem = 0, validMeses = [] } = params;

  newPage();
  drawHeader();

  // Normaliza parecer (pode chegar como string ou objeto do Supabase)
  const normParecer = (raw: unknown): { resumoExecutivo?: string; pontosFortes?: string[]; pontosNegativosOuFracos?: string[] } => {
    if (typeof raw === "string") return { resumoExecutivo: raw };
    if (raw && typeof raw === "object") return raw as { resumoExecutivo?: string; pontosFortes?: string[] };
    return {};
  };
  const parecerNorm = normParecer(aiAnalysis?.parecer);
  const resumoFinal = resumoExecutivo || parecerNorm.resumoExecutivo || "";
  const pontosFortesFinal = pontosFortes.length > 0 ? pontosFortes : (parecerNorm.pontosFortes || []);
  const pontosFracosFinal = pontosFracos.length > 0 ? pontosFracos : (parecerNorm.pontosNegativosOuFracos || []);

  // Section header bar
  dsSectionHeader("08", "PARECER PRELIMINAR");

  // ── BLOCO 1 — Decisão + Rating + Resumo (Hero block) ──
  checkPageBreak(36);
  const decisionColors: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
    APROVADO: { bg: [240, 253, 244], text: [22, 163, 74] },
    APROVACAO_CONDICIONAL: { bg: [254, 249, 195], text: [161, 98, 7] },
    PENDENTE: { bg: [255, 247, 237], text: [194, 65, 12] },
    REPROVADO: { bg: [254, 242, 242], text: [220, 38, 38] },
  };
  const dc = decisionColors[decision] ?? decisionColors.PENDENTE;
  const heroH = 32;
  const heroY = pos.y;

  // Hero card background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, heroY, contentW, heroH, 2, 2, "F");
  doc.setDrawColor(...dsRGB(DS.colors.borderRGB ?? DS.colors.border));
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, heroY, contentW, heroH, 2, 2, "D");
  doc.setLineWidth(0.1);

  // Amber accent line at bottom of hero
  doc.setFillColor(...dsRGB(DS.colors.accentRGB ?? DS.colors.accent));
  doc.rect(margin, heroY + heroH - 1.5, contentW, 1.5, "F");

  // Left side — Score large
  const pareScoreC: [number, number, number] = finalRating >= 7.5 ? [22, 163, 74] : finalRating >= 6 ? [217, 119, 6] : [220, 38, 38];
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...pareScoreC);
  const pareScoreStr = String(finalRating);
  doc.text(pareScoreStr, margin + 5, heroY + 21);
  const pareScoreW = doc.getTextWidth(pareScoreStr);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dsRGB(DS.colors.textMuted));
  doc.text("/10", margin + 5 + pareScoreW + 1, heroY + 21);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dsRGB(DS.colors.textMuted));
  doc.text("SCORE DE RISCO", margin + 5, heroY + 27);
  // Progress bar under score
  const pBarX = margin + 5;
  const pBarY = heroY + 28.5;
  const pBarW = 55;
  const pBarH = 2;
  doc.setFillColor(...dsRGB(DS.colors.borderRGB ?? DS.colors.border));
  doc.roundedRect(pBarX, pBarY, pBarW, pBarH, 0.8, 0.8, "F");
  const pFillW = Math.min(pBarW, (finalRating / 10) * pBarW);
  if (pFillW > 0) {
    doc.setFillColor(...pareScoreC);
    doc.roundedRect(pBarX, pBarY, pFillW, pBarH, 0.8, 0.8, "F");
  }

  // Right side — Decision pill
  const bW2p = 95;
  const bH2p = 22;
  const bX2p = margin + contentW - bW2p - 4;
  const bY2p = heroY + (heroH - bH2p) / 2;
  doc.setFillColor(...dc.bg);
  doc.roundedRect(bX2p, bY2p, bW2p, bH2p, 3, 3, "F");
  doc.setDrawColor(...dc.text);
  doc.setLineWidth(0.5);
  doc.roundedRect(bX2p, bY2p, bW2p, bH2p, 3, 3, "D");
  doc.setLineWidth(0.1);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dc.text);
  doc.text(decision.replace(/_/g, " "), bX2p + bW2p / 2, bY2p + bH2p / 2 + 2, { align: "center" });
  // Subtitle under decision
  const decSubtitle =
    decision === "APROVADO" ? "Operação recomendada" : decision === "REPROVADO" ? "Operação não recomendada" : "Sujeito a condições";
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dc.text);
  doc.text(decSubtitle, bX2p + bW2p / 2, bY2p + bH2p / 2 + 6.5, { align: "center" });

  pos.y = heroY + heroH + 6;

  // ── Badge de Análise Parcial ──
  const cobertura = coberturaAnalise ?? aiAnalysis?.coberturaAnalise;
  if (cobertura && cobertura.nivel !== "completa") {
    const ausentes = cobertura.documentos
      .filter((d) => !d.presente && !d.automatico)
      .map((d) => d.label);
    const ausentesAuto = cobertura.documentos
      .filter((d) => !d.presente && d.automatico)
      .map((d) => d.label);
    const todosAusentes = [...ausentes, ...ausentesAuto];

    if (todosAusentes.length > 0) {
      checkPageBreak(16);
      const badgeH = 12;
      const badgeY = pos.y;
      // Fundo laranja-claro
      doc.setFillColor(255, 247, 230);
      doc.roundedRect(margin, badgeY, contentW, badgeH, 1.5, 1.5, "F");
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(0.4);
      doc.roundedRect(margin, badgeY, contentW, badgeH, 1.5, 1.5, "D");
      doc.setLineWidth(0.1);
      // Barra lateral laranja
      doc.setFillColor(217, 119, 6);
      doc.roundedRect(margin, badgeY, 3, badgeH, 0.5, 0.5, "F");
      // Texto
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(161, 98, 7);
      doc.text("ANÁLISE PARCIAL", margin + 6, badgeY + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(120, 70, 0);
      const ausentesStr = `Documentos ausentes: ${todosAusentes.join(", ")}. Score reflete apenas dados disponíveis — solicitar documentação antes de decisão final.`;
      const ausentesLines = doc.splitTextToSize(ausentesStr, contentW - 10) as string[];
      doc.text(ausentesLines[0] || "", margin + 6, badgeY + 9.5);
      pos.y = badgeY + badgeH + 4;
    }
  }

  // ── COMPOSIÇÃO DO SCORE — tabela visual por componente ──────────────────
  {
    type CompRow = {
      label: string;
      peso: number;
      status: "OK" | "MODERADO" | "ALERTA" | "RISCO" | "N/A";
      detalhe: string;
    };

    const fmtK = (n: number) => n >= 1000000 ? (n/1000000).toFixed(1)+"M" : n >= 1000 ? Math.round(n/1000)+"k" : String(Math.round(n));
    const qtdMeses = validMeses.length;
    const ccfQtd   = data?.ccf?.qtdRegistros || 0;
    const procTotal = parseInt(data?.processos?.passivosTotal || "0");
    const temDRE    = !!data?.dre;
    const temBalanco = !!data?.balanco;
    const irSocios  = data?.irSocios || [];
    const temSCR    = !!data?.scr?.periodoReferencia;

    const scrStatus: CompRow["status"] = !temSCR ? "N/A"
      : vencidosSCR > 0 ? "RISCO"
      : alavancagem > 4 ? "ALERTA"
      : alavancagem > 2 ? "MODERADO"
      : "OK";
    const scrDetalhe = !temSCR ? "Documento não informado"
      : vencidosSCR > 0 ? `R$ ${fmtK(vencidosSCR)} em vencidos`
      : alavancagem > 0 ? `Alavancagem ${alavancagem.toFixed(2)}x`
      : "Sem dívida bancária vencida";

    const fatStatus: CompRow["status"] = qtdMeses === 0 ? "N/A"
      : qtdMeses < 6 ? "ALERTA"
      : fmmNum === 0 ? "RISCO"
      : "OK";
    const fatDetalhe = qtdMeses === 0 ? "Faturamento não informado"
      : `FMM R$ ${fmtK(fmmNum)} | ${qtdMeses} meses`;

    const ccfStatus: CompRow["status"] = ccfQtd > 5 ? "RISCO" : ccfQtd > 0 ? "ALERTA" : "OK";
    const ccfDetalhe = ccfQtd > 0 ? `${ccfQtd} ocorrência(s)` : "Sem ocorrências";

    const protStatus: CompRow["status"] = protestosVigentes > 5 ? "RISCO" : protestosVigentes > 0 ? "ALERTA" : "OK";
    const protDetalhe = protestosVigentes > 0 ? `${protestosVigentes} protesto(s) vigente(s)` : "Nenhum protesto vigente";

    const procStatus: CompRow["status"] = procTotal > 10 ? "RISCO" : procTotal > 0 ? "MODERADO" : "OK";
    const procDetalhe = procTotal > 0 ? `${procTotal} processo(s)` : "Sem passivo relevante";

    const dreStatus: CompRow["status"] = (!temDRE && !temBalanco) ? "N/A" : "OK";
    const dreDetalhe = (!temDRE && !temBalanco) ? "Documentos não informados"
      : [temDRE ? "DRE" : null, temBalanco ? "Balanço" : null].filter(Boolean).join(" + ") + " disponíveis";

    const irDebitosAbertos = irSocios.some((ir: { debitosEmAberto?: boolean }) => ir.debitosEmAberto);
    const irStatus: CompRow["status"] = irSocios.length === 0 ? "N/A" : irDebitosAbertos ? "RISCO" : "OK";
    const irDetalhe = irSocios.length === 0 ? "Não informado" : irDebitosAbertos ? "Débitos em aberto (Receita)" : `${irSocios.length} sócio(s) verificado(s)`;

    const components: CompRow[] = [
      { label: "SCR / Bacen",      peso: 25, status: scrStatus,  detalhe: scrDetalhe  },
      { label: "Faturamento",      peso: 20, status: fatStatus,  detalhe: fatDetalhe  },
      { label: "CCF",              peso: 15, status: ccfStatus,  detalhe: ccfDetalhe  },
      { label: "Protestos",        peso: 15, status: protStatus, detalhe: protDetalhe },
      { label: "Processos Jud.",   peso: 10, status: procStatus, detalhe: procDetalhe },
      { label: "DRE / Balanço",    peso: 10, status: dreStatus,  detalhe: dreDetalhe  },
      { label: "IR Sócios",        peso:  5, status: irStatus,   detalhe: irDetalhe   },
    ];

    const rowH   = 8;
    const hdrH   = 7;
    const tableH = hdrH + components.length * rowH + 6;
    checkPageBreak(tableH + 10);

    pos.y += 4;
    // Título
    doc.setFillColor(...dsRGB(DS.colors.headerBg));
    doc.rect(margin, pos.y, contentW, hdrH, "F");
    doc.setFillColor(...dsRGB(DS.colors.accentRGB));
    doc.rect(margin, pos.y, 3.5, hdrH, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("COMPOSICAO DO SCORE — POR COMPONENTE", margin + 7, pos.y + 4.8);

    // Col widths: label | peso | status badge | barra | detalhe
    const cLabel = 38;
    const cPeso  = 12;
    const cBadge = 20;
    const cBarra = 40;
    const cDet   = contentW - cLabel - cPeso - cBadge - cBarra - 4;

    // Sub-header
    pos.y += hdrH;
    doc.setFillColor(45, 65, 100);
    doc.rect(margin, pos.y, contentW, 5.5, "F");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 200, 240);
    let hx = margin + 2;
    doc.text("COMPONENTE",    hx, pos.y + 3.9); hx += cLabel;
    doc.text("PESO",          hx, pos.y + 3.9); hx += cPeso;
    doc.text("STATUS",        hx, pos.y + 3.9); hx += cBadge;
    doc.text("RELEVÂNCIA",    hx, pos.y + 3.9); hx += cBarra;
    doc.text("DIAGNÓSTICO",   hx, pos.y + 3.9);
    pos.y += 5.5;

    components.forEach((comp, idx) => {
      const isZebra = idx % 2 === 0;
      doc.setFillColor(...(isZebra ? [255,255,255] as [number,number,number] : [248,250,253] as [number,number,number]));
      doc.rect(margin, pos.y, contentW, rowH, "F");

      // Separator line
      doc.setDrawColor(220, 228, 242);
      doc.setLineWidth(0.15);
      doc.line(margin, pos.y + rowH, margin + contentW, pos.y + rowH);
      doc.setLineWidth(0.1);

      let cx = margin + 2;

      // Label
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...dsRGB(DS.colors.textPrimary));
      doc.text(comp.label, cx, pos.y + 5.2);
      cx += cLabel;

      // Peso
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...dsRGB(DS.colors.textMuted));
      doc.text(`${comp.peso}%`, cx, pos.y + 5.2);
      cx += cPeso;

      // Status badge
      const sBg: [number,number,number] = comp.status === "OK"       ? [220,252,231]
        : comp.status === "MODERADO" ? [219,234,254]
        : comp.status === "ALERTA"   ? [254,243,199]
        : comp.status === "RISCO"    ? [254,226,226]
        :                              [241,245,249]; // N/A
      const sFg: [number,number,number] = comp.status === "OK"       ? [22,101,52]
        : comp.status === "MODERADO" ? [29,78,216]
        : comp.status === "ALERTA"   ? [133,77,14]
        : comp.status === "RISCO"    ? [153,27,27]
        :                              [107,114,128];
      const bw = 18; const bh = 5;
      doc.setFillColor(...sBg);
      doc.roundedRect(cx, pos.y + (rowH - bh) / 2, bw, bh, 1, 1, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...sFg);
      doc.text(comp.status, cx + bw / 2, pos.y + (rowH - bh) / 2 + 3.6, { align: "center" });
      cx += cBadge;

      // Barra de peso visual
      const barBg: [number,number,number] = [225,232,245];
      const barFg: [number,number,number] = comp.status === "OK" ? [34,197,94] : comp.status === "RISCO" ? [220,38,38] : comp.status === "ALERTA" ? [217,119,6] : [99,155,214];
      const bBarH = 3.5; const bBarW = cBarra - 6;
      const bBarY = pos.y + (rowH - bBarH) / 2;
      doc.setFillColor(...barBg);
      doc.roundedRect(cx, bBarY, bBarW, bBarH, 1, 1, "F");
      const fill = (comp.peso / 25) * bBarW; // proporcional ao peso max (25%)
      doc.setFillColor(...barFg);
      doc.roundedRect(cx, bBarY, fill, bBarH, 1, 1, "F");
      // Percentual
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...dsRGB(DS.colors.textMuted));
      doc.text(`${comp.peso}%`, cx + bBarW + 2, pos.y + 5.2);
      cx += cBarra;

      // Detalhe
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...dsRGB(DS.colors.textMuted));
      const dLines = doc.splitTextToSize(comp.detalhe, cDet - 2) as string[];
      doc.text(dLines[0] || "", cx, pos.y + 5.2);

      pos.y += rowH;
    });

    // Linha totalizadora
    doc.setFillColor(228, 238, 252);
    doc.rect(margin, pos.y, contentW, 7, "F");
    doc.setFillColor(...dsRGB(DS.colors.accentRGB));
    doc.rect(margin, pos.y, 3.5, 7, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...dsRGB(DS.colors.headerBg));
    doc.text("SCORE FINAL", margin + 7, pos.y + 4.8);
    const scoreC: [number,number,number] = finalRating >= 7.5 ? [22,163,74] : finalRating >= 6 ? [217,119,6] : [220,38,38];
    doc.setTextColor(...scoreC);
    doc.text(`${finalRating}/10  —  ${decision.replace(/_/g, " ")}`, margin + 50, pos.y + 4.8);
    pos.y += 10;
  }

  if (resumoFinal) {
    checkPageBreak(14);
    doc.setFillColor(...dsRGB(DS.colors.accentRGB ?? DS.colors.accent));
    doc.rect(margin, pos.y, contentW, 0.8, "F");
    pos.y += 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...dsRGB(DS.colors.accentRGB ?? DS.colors.accent));
    doc.text("RESUMO EXECUTIVO", margin, pos.y + 5);
    pos.y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...colors.text);
    const rLines = doc.splitTextToSize(resumoFinal, contentW - 4) as string[];
    rLines.forEach((line: string) => {
      checkPageBreak(6.5);
      doc.text(line, margin + 2, pos.y);
      pos.y += 5.5;
    });
    pos.y += 4;
  }

  // ── BLOCO 2 — Pontos Fortes e Pontos Fracos ──
  if (pontosFortesFinal.length > 0 || pontosFracosFinal.length > 0) {
    const renderBulletListDS = (title: string, items: string[], accentC: [number, number, number], bulletColor: [number, number, number]) => {
      if (items.length === 0) return;
      checkPageBreak(14);
      doc.setFillColor(...accentC);
      doc.rect(margin, pos.y, contentW, 0.8, "F");
      pos.y += 3;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...accentC);
      doc.text(title.toUpperCase(), margin, pos.y + 5);
      pos.y += 10;

      items.forEach((item: string) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        const lines = doc.splitTextToSize(item, contentW - 10) as string[];
        checkPageBreak(lines.length * 5 + 3);
        doc.setFillColor(255, 255, 255);
        const itemH = lines.length * 5 + 5;
        doc.rect(margin, pos.y, contentW, itemH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...bulletColor);
        doc.text("—", margin + 2, pos.y + 5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...dsRGB(DS.colors.textPrimary));
        lines.forEach((line: string, li: number) => {
          doc.text(line, margin + 9, pos.y + 5 + li * 5);
        });
        pos.y += itemH + 2;
      });
      pos.y += 4;
    };

    renderBulletListDS("Pontos Fortes", pontosFortesFinal, dsRGB(DS.colors.success), dsRGB(DS.colors.success));
    renderBulletListDS("Pontos Fracos / Riscos", pontosFracosFinal, dsRGB(DS.colors.danger), dsRGB(DS.colors.danger));
  }

  // ── BLOCO 3 — Tabela de Alertas ──
  const aiAlertas = aiAnalysis?.alertas ?? [];
  if (aiAlertas.length > 0) {
    checkPageBreak(16);
    pos.y = dsMiniHeader(pos.y, "ALERTAS");

    autoT(
      ["TIPO", "DESCRIÇÃO", "IMPACTO", "MITIGAÇÃO"],
      aiAlertas.map((a) => {
        const sevStr = (a.severidade || "INFO").toUpperCase();
        const sevColor: [number, number, number] = sevStr === "ALTA" ? colors.danger : sevStr === "MODERADA" ? colors.warning : [37, 99, 235];
        return [
          { content: sevStr, styles: { textColor: sevColor, fontStyle: "bold" } },
          a.descricao || "—",
          { content: a.impacto || "—", styles: { textColor: colors.textMuted } },
          { content: a.mitigacao || "—", styles: { textColor: colors.primary } },
        ];
      }),
      [0.15, 0.3, 0.25, 0.3].map((r) => contentW * r),
      { fontSize: 6.5, headFontSize: 5.5, minCellHeight: 8 },
    );
  }

  // ── BLOCO 4 — Perguntas para Visita ──
  if (perguntasVisita.length > 0) {
    checkPageBreak(14);
    pos.y = dsMiniHeader(pos.y, "PERGUNTAS PARA A VISITA");

    perguntasVisita.forEach((q, i) => {
      // Seta fonte antes do split para garantir cálculo de largura correto
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const qLines = doc.splitTextToSize(`${i + 1}. ${q.pergunta}`, contentW - 4) as string[];
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      const cLines = q.contexto ? (doc.splitTextToSize("Contexto: " + q.contexto, contentW - 8) as string[]) : [];
      const needed = qLines.length * 4 + cLines.length * 3.5 + 5;
      checkPageBreak(needed);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...colors.text);
      qLines.forEach((line: string) => {
        doc.text(line, margin + 2, pos.y);
        pos.y += 4;
      });
      if (cLines.length > 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.textMuted);
        cLines.forEach((line: string) => {
          doc.text(line, margin + 4, pos.y);
          pos.y += 3.5;
        });
      }
      pos.y += 3;
    });
    pos.y += 2;
  }

  // ── BLOCO 5 — Parâmetros Operacionais Orientativos ──
  const paramOp = aiAnalysis?.parametrosOperacionais;
  const hasParamOp = paramOp && Object.values(paramOp).some((v) => v && v.trim() !== "");
  if (hasParamOp) {
    checkPageBreak(16);
    pos.y = dsMiniHeader(pos.y, "PARAMETROS OPERACIONAIS ORIENTATIVOS");

    const paramCW = [contentW * 0.3, contentW * 0.35, contentW * 0.35];

    doc.setFillColor(50, 70, 110);
    doc.rect(margin, pos.y, contentW, 5.5, "F");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("PARAMETRO", margin + 2, pos.y + 4);
    doc.text("VALOR SUGERIDO", margin + paramCW[0] + 2, pos.y + 4);
    doc.text("BASE DE CALCULO", margin + paramCW[0] + paramCW[1] + 2, pos.y + 4);
    pos.y += 5.5;

    const paramRows: Array<{ label: string; key: string; base: string }> = [
      { label: "Limite aproximado", key: "limiteAproximado", base: "FMM × fatores de score e risco" },
      { label: "Prazo maximo", key: "prazoMaximo", base: "Baseado no rating" },
      { label: "Concentracao/sacado", key: "concentracaoSacado", base: "Perfil de risco" },
      { label: "Garantias", key: "garantias", base: "Estrutura societaria" },
      { label: "Revisao", key: "revisao", base: "Alertas ativos" },
    ];

    paramRows.forEach((row, idx) => {
      const val = (paramOp as Record<string, string>)[row.key] || "—";
      checkPageBreak(7);
      doc.setFillColor(...(idx % 2 === 0 ? colors.surface : colors.surface2));
      doc.rect(margin, pos.y, contentW, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...colors.text);
      doc.text(row.label, margin + 2, pos.y + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...colors.primary);
      doc.text(val, margin + paramCW[0] + 2, pos.y + 4);
      doc.setTextColor(...colors.textMuted);
      doc.text(row.base, margin + paramCW[0] + paramCW[1] + 2, pos.y + 4);
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, pos.y + 6, margin + contentW, pos.y + 6);
      pos.y += 6;
    });

    pos.y += 3;
    checkPageBreak(8);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...colors.textMuted);
    doc.text("Parametros indicativos. Limite e condicoes formais definidos pelo Comite.", margin, pos.y);
    pos.y += 6;
  }

  // ── Observações do analista ──
  if (observacoes && observacoes.trim()) {
    // Define fonte ANTES do splitTextToSize para que a largura seja calculada corretamente
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const noteLines = doc.splitTextToSize(observacoes.trim(), contentW - 8) as string[];
    const titleH = 10;
    const lineH = 5;

    pos.y += 4;
    checkPageBreak(titleH + 4 + lineH + 4);

    doc.setFillColor(...colors.surface2);
    doc.roundedRect(margin, pos.y, contentW, titleH, 1.5, 1.5, "F");
    doc.setFillColor(...colors.navy);
    doc.roundedRect(margin, pos.y, 3, titleH, 0.5, 0.5, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...colors.navy);
    doc.text("OBS", margin + 7, pos.y + 6.5);
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.text);
    doc.text("OBSERVACOES DO ANALISTA", margin + 14, pos.y + 6.5);
    pos.y += titleH + 4;

    noteLines.forEach((line) => {
      checkPageBreak(lineH + 1);
      doc.setFillColor(...colors.surface);
      doc.rect(margin, pos.y, contentW, lineH, "F");
      doc.setFillColor(...colors.accent);
      doc.rect(margin, pos.y, 2.5, lineH, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...colors.text);
      doc.text(line, margin + 6, pos.y + lineH - 1.2);
      pos.y += lineH;
    });
    pos.y += 6;
  }
}
