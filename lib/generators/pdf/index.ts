/**
 * lib/generators/pdf/index.ts
 * Entry point — builds the complete Due Diligence PDF report.
 * Public signature: buildPDFReport(params: PDFReportParams): Promise<Blob>
 *
 * Rendering order:
 *  1. Capa
 *  2. Índice
 *  3. Síntese Preliminar (+ Parâmetros do Fundo + Limite de Crédito + CNPJ + QSA)
 *  4. Faturamento / SCR (+ DRE + Balanço + Curva ABC)
 *  5. Risco (Protestos + Processos + CCF + Histórico Consultas)
 *  6. IR dos Sócios
 *  7. Relatório de Visita
 *  8. Parecer Preliminar
 *  → Footer em todas as páginas (exceto capa)
 */
import type { PDFReportParams } from "./context";
import type { PdfCtx } from "./context";
import { DS } from "./design-system";
import { clearAlertDedup, drawFooterAllPages, parseMoneyToNumber } from "./helpers";
import { renderCapa } from "./sections/capa";
import { renderIndice } from "./sections/indice";
import { renderSintese } from "./sections/sintese";
import { renderFaturamento } from "./sections/faturamento";
import { renderRisco } from "./sections/risco";
import { renderSocios } from "./sections/socios";
import { renderVisita } from "./sections/visita";
import { renderParecerSection } from "./sections/parecer";

export type { PDFReportParams };

export async function buildPDFReport(params: PDFReportParams): Promise<Blob> {
  // ── Dynamic imports ──
  const { jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTableFn = (autoTableMod.default ?? autoTableMod) as (doc: InstanceType<typeof jsPDF>, opts: object) => void;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Shared mutable state ──
  const pos = { y: 0 };
  const pageCount = { n: 0 };
  const totalPages = { n: 0 };
  const W = 210;
  const margin = 14;
  const contentW = W - margin * 2;
  const footerDateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  // ── Clear dedup set for this run ──
  clearAlertDedup();

  // ── Pre-compute derived params ──
  const { data } = params;
  const validMesesForFmm = [...(data.faturamento?.meses || [])]
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
    : validMesesForFmm.slice(-12).reduce((s, m) => s + parseMoneyToNumber(m.valor), 0) / Math.max(validMesesForFmm.slice(-12).length, 1);

  // Enrich params with computed values if not already set
  const enrichedParams: PDFReportParams = {
    ...params,
    alavancagem: params.alavancagem ??
      (fmmNum > 0 ? parseMoneyToNumber(data.scr?.totalDividasAtivas || "0") / fmmNum : 0),
  };

  // ── Build PdfCtx ──
  const ctx: PdfCtx = {
    doc,
    DS,
    params: enrichedParams,
    data,
    aiAnalysis: params.aiAnalysis,
    pos,
    pageCount,
    totalPages,
    autoTable: autoTableFn,
    W,
    margin,
    contentW,
    footerDateStr,
  };

  // ── Render sections ──
  renderCapa(ctx);
  renderSintese(ctx);
  renderParecerSection(ctx);
  renderFaturamento(ctx);
  renderRisco(ctx);
  renderSocios(ctx);
  renderVisita(ctx);
  renderIndice(ctx);

  // ── Footer on all pages (except cover = page 1) ──
  drawFooterAllPages(ctx);

  const pdfBlob = doc.output("blob");
  return new Blob([pdfBlob], { type: "application/pdf" });
}
