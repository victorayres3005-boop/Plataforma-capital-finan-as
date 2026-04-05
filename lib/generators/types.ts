import type { ExtractedData, SCRData, AIAnalysis } from "@/types";

export type AlertSeverity = "ALTA" | "MODERADA" | "INFO";

export interface Alert {
  message: string;
  severity: AlertSeverity;
  impacto?: string;
}

export type { AIAnalysis };

export interface GeneratorContext {
  data: ExtractedData;
  aiAnalysis: AIAnalysis | null;
  safeName: string;
  dateStr: string;
  // Computed values
  finalRating: number;
  decision: string;
  decisionColor: string;
  decisionBg: string;
  decisionBorder: string;
  alerts: Alert[];
  alertsHigh: Alert[];
  alertsMod: Alert[];
  pontosFortes: string[];
  pontosFracos: string[];
  perguntasVisita: Array<{ pergunta: string; contexto: string }>;
  resumoExecutivo: string;
  riskScore: "alto" | "medio" | "baixo";
  companyAge: string;
  // SCR numbers
  dividaAtiva: number;
  atraso: number;
  prejuizosVal: number;
  vencidas: number;
  vencidosSCR: number;
  protestosVigentes: number;
}

export type { ExtractedData, SCRData };
