import type { jsPDF } from "jspdf";
import type { ExtractedData, AIAnalysis, FundValidationResult, CreditLimitResult, Operacao } from "@/types";
import type { DS } from "./design-system";
import type { ScoreResult, RespostaCriterio } from "@/types/politica-credito";

export type PdfDS = typeof DS;

export type AlertSeverity = "CRÍTICO" | "RESTRITIVO" | "OBSERVAÇÃO";

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
  streetViewBase64?: string;        // heading 0° (frente)
  streetView90Base64?: string;      // heading 90° (direita)
  streetView180Base64?: string;     // heading 180° (atrás)
  streetView270Base64?: string;     // heading 270° (esquerda)
  mapStaticBase64?: string;
  mapEmbedUrl?: string;
  streetViewInteractiveUrl?: string; // link pro Google Maps com Street View
  fundValidation?: FundValidationResult;
  creditLimit?: CreditLimitResult;
  histOperacoes?: Operacao[];
  committeMembers?: string;
  capitalLogoB64?: string;
  scoreV2?: ScoreResult;
  scoreV2Respostas?: RespostaCriterio[];
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
  logoB64: string | null;
}
