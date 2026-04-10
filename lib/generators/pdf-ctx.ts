/**
 * Shared types for the PDF generator and its section modules.
 * Extracted from pdf.ts to enable modular section rendering.
 */
import type { jsPDF } from "jspdf";

// ─── AutoTable cell type ──────────────────────────────────────────────────────
export type AutoCell = string | { content: string; styles?: Record<string, unknown> };

// ─── Colors object shape ──────────────────────────────────────────────────────
export type RGB = [number, number, number];
export type PdfColors = Record<string, RGB>;
// Flexible DS colors — supports both hex strings and RGB tuples (new design system)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DSColors = Record<string, any>;

// ─── Shared context passed to every section renderer ─────────────────────────
export interface PdfCtx {
  /** jsPDF document instance */
  doc: jsPDF;
  /** Mutable position — shared by reference across all helpers and sections */
  pos: { y: number };
  /** Page width (210 mm A4) */
  W: number;
  margin: number;
  contentW: number;
  colors: PdfColors;
  DS: { colors: DSColors };
  // ── Core helpers ──────────────────────────────────────────────────────────
  newPage: () => void;
  drawHeader: () => void;
  checkPageBreak: (needed: number) => void;
  dsSectionHeader: (num: string, title: string) => void;
  /** Takes explicit startY, returns new Y (does not read/write pos) */
  dsMiniHeader: (startY: number, title: string) => number;
  /** Renders an autotable starting at pos.y, updates pos.y after */
  autoT: (
    headers: string[],
    rows: AutoCell[][],
    colWidths: number[],
    opts?: {
      headFill?: RGB;
      headTextColor?: RGB;
      fontSize?: number;
      headFontSize?: number;
      gap?: number;
      minCellHeight?: number;
    }
  ) => void;
}
