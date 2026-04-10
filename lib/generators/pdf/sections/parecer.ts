/**
 * Seção 08 — PARECER PRELIMINAR
 * Wrapper que adapta o novo PdfCtx para o renderParecer existente em pdf-parecer.ts
 */
import type { PdfCtx as NewPdfCtx } from "../context";
import type { PdfCtx as LegacyPdfCtx } from "../../pdf-ctx";
import { renderParecer } from "../../sections/pdf-parecer";
import {
  newPage as _newPage,
  drawHeader as _drawHeader,
  checkPageBreak as _checkPageBreak,
  drawSectionTitle,
  dsMiniHeader as _dsMiniHeader,
  autoT as _autoT,
} from "../helpers";
import { parseMoneyToNumber } from "../helpers";

export function renderParecerSection(ctx: NewPdfCtx): void {
  const { doc, DS, pos, params, data, aiAnalysis, W, margin, contentW, autoTable } = ctx;

  // Pre-compute validMeses for fmmNum
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

  const fmmNum = data.faturamento?.fmm12m
    ? parseMoneyToNumber(data.faturamento.fmm12m)
    : validMeses.slice(-12).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / Math.max(validMeses.slice(-12).length, 1);

  // Build legacy ctx from new ctx
  const legacyCtx: LegacyPdfCtx = {
    doc,
    pos,
    W,
    margin,
    contentW,
    colors: DS.colors as unknown as LegacyPdfCtx["colors"],
    DS: { colors: DS.colors },
    newPage: () => _newPage(ctx),
    drawHeader: () => _drawHeader(ctx),
    checkPageBreak: (needed: number) => _checkPageBreak(ctx, needed),
    dsSectionHeader: (num: string, title: string) => drawSectionTitle(ctx, num, title),
    dsMiniHeader: (startY: number, title: string) => {
      ctx.pos.y = startY;
      return _dsMiniHeader(ctx, title);
    },
    autoT: (headers, rows, colWidths, opts) => _autoT(ctx, headers, rows, colWidths, opts),
  };

  void autoTable; // used via ctx.autoTable internally

  renderParecer(legacyCtx, {
    aiAnalysis,
    decision: params.decision,
    finalRating: params.finalRating,
    resumoExecutivo: params.resumoExecutivo,
    pontosFortes: params.pontosFortes,
    pontosFracos: params.pontosFracos,
    perguntasVisita: params.perguntasVisita,
    observacoes: params.observacoes,
    data,
    vencidosSCR: params.vencidosSCR,
    fmmNum,
    protestosVigentes: params.protestosVigentes,
    alavancagem: params.alavancagem,
    validMeses,
  });
}
