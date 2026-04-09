/**
 * Seção 08 — PARECER PRELIMINAR
 * Extraída de pdf.ts para reduzir o tamanho do módulo principal.
 * Todos os helpers (newPage, checkPageBreak, etc.) são passados via PdfCtx e
 * capturam `pos` por referência, então pos.y permanece sincronizado.
 */
import type { PdfCtx } from "../pdf-ctx";
import type { AIAnalysis } from "@/types";

export interface ParecerParams {
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  resumoExecutivo: string;
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: { pergunta: string; contexto: string }[];
  observacoes?: string;
}

export function renderParecer(ctx: PdfCtx, params: ParecerParams): void {
  const { doc, pos, margin, contentW, colors, DS, newPage, drawHeader, checkPageBreak, dsSectionHeader, dsMiniHeader, autoT } = ctx;
  const { aiAnalysis, decision, finalRating, resumoExecutivo, pontosFortes, pontosFracos, perguntasVisita, observacoes } = params;

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
  doc.setDrawColor(...DS.colors.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, heroY, contentW, heroH, 2, 2, "D");
  doc.setLineWidth(0.1);

  // Amber accent line at bottom of hero
  doc.setFillColor(...DS.colors.accent);
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
  doc.setTextColor(...DS.colors.textMuted);
  doc.text("/10", margin + 5 + pareScoreW + 1, heroY + 21);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DS.colors.textMuted);
  doc.text("SCORE DE RISCO", margin + 5, heroY + 27);
  // Progress bar under score
  const pBarX = margin + 5;
  const pBarY = heroY + 28.5;
  const pBarW = 55;
  const pBarH = 2;
  doc.setFillColor(...DS.colors.border);
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

  if (resumoFinal) {
    checkPageBreak(14);
    doc.setFillColor(...DS.colors.accent);
    doc.rect(margin, pos.y, contentW, 0.8, "F");
    pos.y += 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DS.colors.accent);
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
        doc.setTextColor(...DS.colors.textPrimary);
        lines.forEach((line: string, li: number) => {
          doc.text(line, margin + 9, pos.y + 5 + li * 5);
        });
        pos.y += itemH + 2;
      });
      pos.y += 4;
    };

    renderBulletListDS("Pontos Fortes", pontosFortesFinal, DS.colors.success, DS.colors.success);
    renderBulletListDS("Pontos Fracos / Riscos", pontosFracosFinal, DS.colors.danger, DS.colors.danger);
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
