import type { jsPDF } from "jspdf";
import type { ExtractedData, AIAnalysis, FundValidationResult, CreditLimitResult, Operacao } from "@/types";
import type { DS } from "./design-system";

export type PdfDS = typeof DS;

export type AlertSeverity = "ALTA" | "MODERADA" | "INFO";

export interface Alert {
  message: string;
  severity: AlertSeverity;
  impacto?: string;
}

export interface PDFReportParams {
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  decision: string;
  finalRating: number;
  alerts: Alert[];
  alertsHigh: Alert[];
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: { pergunta: string; contexto: string }[];
  resumoExecutivo: string;
  companyAge: string;
  protestosVigentes: number;
  vencidosSCR: number;
  vencidas: number;
  prejuizosVal: number;
  dividaAtiva: number;
  atraso: number;
  riskScore: "alto" | "medio" | "baixo";
  decisionColor: string;
  decisionBg: string;
  decisionBorder: string;
  alavancagem?: number;
  observacoes?: string;
  streetViewBase64?: string;
  mapStaticBase64?: string;
  fundValidation?: FundValidationResult;
  creditLimit?: CreditLimitResult;
  histOperacoes?: Operacao[];
  committeMembers?: string;
}

export type AutoCell = string | { content: string; styles?: Record<string, unknown> };

export type RGB = [number, number, number];

/** Shared context passed to every section renderer */
export interface PdfCtx {
  doc: jsPDF;
  DS: PdfDS;
  params: PDFReportParams;
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  pos: { y: number };
  pageCount: { n: number };
  totalPages: { n: number };
  autoTable: (doc: jsPDF, opts: object) => void;
  // Computed layout constants
  W: number;
  margin: number;
  contentW: number;
  footerDateStr: string;
}
