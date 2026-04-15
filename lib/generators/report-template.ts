/**
 * lib/generators/report-template.ts
 *
 * Gera o HTML completo do relatório de análise de crédito.
 * Re-exporta gerarHtmlRelatorio de lib/pdf/template.ts (template aprovado, ~2k linhas).
 *
 * Uso:
 *   const { html } = generateReportHTML(params);
 *   // Mesmo HTML para preview no browser e para Puppeteer → PDF
 */
export { gerarHtmlRelatorio as generateReportHTML } from "@/lib/pdf/template";
