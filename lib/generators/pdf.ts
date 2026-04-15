/**
 * lib/generators/pdf.ts
 *
 * Geração de PDF via Puppeteer (rota /api/generate-pdf).
 * Fallback: jsPDF via lib/generators/pdf/index.ts.
 *
 * Exports principais:
 *   generatePDF(params)         → chama a API, retorna Blob
 *   generateHTMLPreview(params) → retorna string HTML para preview no browser
 *   buildPDFReport(params)      → fallback jsPDF (mantido para compatibilidade)
 */

export { buildPDFReport } from "./pdf/index";
export type { PDFReportParams } from "./pdf/index";

import type { PDFReportParams } from "./pdf/index";

/**
 * Gera PDF via Puppeteer (API server-side).
 * Funciona local (puppeteer full) e em produção (sparticuz/chromium).
 */
export async function generatePDF(params: PDFReportParams): Promise<Blob> {
  const res = await fetch("/api/generate-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let details = "Erro desconhecido";
    try {
      const json = await res.json();
      details = json.details || json.error || details;
    } catch { /* ignora */ }
    throw new Error(`Erro ao gerar PDF: ${details}`);
  }

  return res.blob();
}

/**
 * Retorna o HTML completo do relatório para preview no browser.
 * Mesmo HTML usado pelo Puppeteer — garante consistência visual.
 */
export async function generateHTMLPreview(params: PDFReportParams): Promise<string> {
  const { generateReportHTML } = await import("./report-template");
  const result = generateReportHTML(params);
  // gerarHtmlRelatorio retorna { html, headerTemplate, footerTemplate }
  return typeof result === "string" ? result : result.html;
}
