/**
 * lib/generators/pdf.ts — Re-export shim
 *
 * The PDF generator has been refactored into a modular structure under
 * lib/generators/pdf/. This file preserves backward compatibility by
 * re-exporting the public API from the new entry point.
 *
 * Do NOT add logic here — put it in the appropriate section module.
 */
export { buildPDFReport } from "./pdf/index";
export type { PDFReportParams } from "./pdf/index";
