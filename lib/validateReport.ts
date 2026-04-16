import type { ExtractedData } from "@/types";

/**
 * Valida gaps críticos antes da geração do relatório final.
 * Retorna lista agrupada por seção com os campos faltantes. O front-end decide
 * se bloqueia ou só alerta — a recomendação é bloquear quando `criticalCount > 0`
 * e apenas avisar quando só houver `warningCount` (campos recomendados).
 */

export type GapSeverity = "critical" | "warning";

export interface ReportGap {
  section: string;
  label: string;
  severity: GapSeverity;
  fields: string[];
}

export interface ReportValidation {
  gaps: ReportGap[];
  criticalCount: number;
  warningCount: number;
  canGenerate: boolean;
}

const isEmpty = (v: unknown): boolean => {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  if (typeof v === "string") return !v.trim() || v.trim() === "—" || v.trim() === "0,00" || v.trim() === "0";
  return false;
};

export function validateReport(data: ExtractedData): ReportValidation {
  const gaps: ReportGap[] = [];

  // ─── CNPJ (crítico: razão social + CNPJ são obrigatórios) ───
  const cnpjMissing: string[] = [];
  if (isEmpty(data.cnpj?.razaoSocial)) cnpjMissing.push("Razão social");
  if (isEmpty(data.cnpj?.cnpj)) cnpjMissing.push("CNPJ");
  if (isEmpty(data.cnpj?.endereco)) cnpjMissing.push("Endereço");
  if (isEmpty(data.cnpj?.cnaePrincipal)) cnpjMissing.push("CNAE principal");
  if (cnpjMissing.length > 0) {
    gaps.push({
      section: "cnpj",
      label: "Cartão CNPJ",
      severity: cnpjMissing.some(f => f === "Razão social" || f === "CNPJ") ? "critical" : "warning",
      fields: cnpjMissing,
    });
  }

  // ─── QSA (crítico: precisa ter ao menos 1 sócio) ───
  const socios = data.qsa?.quadroSocietario ?? [];
  const sociosComNome = socios.filter(s => !isEmpty(s.nome));
  if (sociosComNome.length === 0) {
    gaps.push({
      section: "qsa",
      label: "Quadro Societário",
      severity: "critical",
      fields: ["Nenhum sócio extraído"],
    });
  }

  // ─── Faturamento (crítico: precisa ter meses) ───
  if ((data.faturamento?.meses?.length ?? 0) < 3) {
    gaps.push({
      section: "faturamento",
      label: "Faturamento",
      severity: "critical",
      fields: [`Apenas ${data.faturamento?.meses?.length ?? 0} meses extraídos (recomendado 6-12)`],
    });
  }

  // ─── SCR (crítico: precisa ter totalDividasAtivas OU confirmar sem histórico) ───
  const scrMissing: string[] = [];
  const scr = data.scr;
  if (!scr || (isEmpty(scr.totalDividasAtivas) && isEmpty(scr.carteiraAVencer) && !scr.semHistorico)) {
    scrMissing.push("SCR da empresa ausente ou incompleto");
  }
  if (scr && isEmpty(scr.carteiraCurtoPrazo) && !isEmpty(scr.carteiraAVencer)) {
    scrMissing.push("Curto prazo vazio (será derivado de carteiraAVencer)");
  }
  if (scrMissing.length > 0) {
    gaps.push({
      section: "scr",
      label: "SCR — Banco Central",
      severity: scrMissing[0].includes("ausente") ? "critical" : "warning",
      fields: scrMissing,
    });
  }

  // ─── Protestos / Processos (warning se não tiver) ───
  // Usa === "" porque "0" significa "consultado e sem ocorrências" (≠ não consultado)
  if (!data.protestos || data.protestos.vigentesQtd === "") {
    gaps.push({
      section: "protestos",
      label: "Protestos",
      severity: "warning",
      fields: ["Certidão de protestos não consultada"],
    });
  }
  if (!data.processos || data.processos.passivosTotal === "") {
    gaps.push({
      section: "processos",
      label: "Processos",
      severity: "warning",
      fields: ["Certidão de processos não consultada"],
    });
  }

  // ─── Relatório de Visita / Pleito (warning) ───
  const rv = data.relatorioVisita;
  const pleitoMissing: string[] = [];
  if (!rv) {
    pleitoMissing.push("Relatório de visita não enviado");
  } else {
    if (isEmpty(rv.responsavelVisita)) pleitoMissing.push("Gerente / Responsável");
    if (isEmpty(rv.limiteTotal)) pleitoMissing.push("Limite Global");
    if (isEmpty(rv.taxaConvencional) && isEmpty(rv.taxaComissaria)) pleitoMissing.push("Taxa Convencional/Comissária");
    if (isEmpty(rv.prazoMaximoOp)) pleitoMissing.push("Prazo Máximo");
  }
  if (pleitoMissing.length > 0) {
    gaps.push({
      section: "pleito",
      label: "Pleito / Visita",
      severity: "warning",
      fields: pleitoMissing,
    });
  }

  // ─── IR dos Sócios (warning: deveria ter pelo menos 1 IR) ───
  if (sociosComNome.length > 0 && (data.irSocios?.length ?? 0) === 0) {
    gaps.push({
      section: "ir",
      label: "IR dos Sócios",
      severity: "warning",
      fields: [`${sociosComNome.length} sócio(s) sem IR anexado`],
    });
  }

  const criticalCount = gaps.filter(g => g.severity === "critical").length;
  const warningCount = gaps.filter(g => g.severity === "warning").length;

  return {
    gaps,
    criticalCount,
    warningCount,
    canGenerate: criticalCount === 0,
  };
}
