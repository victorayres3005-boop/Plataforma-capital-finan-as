import type { ExtractedData, CoberturaAnalise, DocumentoCobertura } from "@/types";
import type { AIAnalysis, Alert, AlertSeverity, GeneratorContext } from "./types";

export function calcularCobertura(data: ExtractedData): CoberturaAnalise {
  const bureaus = data.bureausConsultados || [];
  const temBureau = bureaus.length > 0;

  const temSCR = !!(data.scr?.periodoReferencia && data.scr.periodoReferencia !== "");
  const temFat = !!(data.faturamento && !data.faturamento.faturamentoZerado && (data.faturamento.meses?.length ?? 0) > 0);
  const temDRE = (data.dre?.anos?.length ?? 0) > 0;
  const temBalanco = (data.balanco?.anos?.length ?? 0) > 0;
  const temIR = (data.irSocios?.length ?? 0) > 0;
  const temCurvaABC = (data.curvaABC?.clientes?.length ?? 0) > 0;

  const documentos: DocumentoCobertura[] = [
    { tipo: "scr",       label: "SCR / Bacen",       presente: temSCR,      obrigatorio: true,  automatico: false, peso: 25 },
    { tipo: "faturamento", label: "Faturamento",      presente: temFat,      obrigatorio: true,  automatico: false, peso: 20 },
    { tipo: "ccf",       label: "CCF",                presente: temBureau,   obrigatorio: false, automatico: true,  peso: 15 },
    { tipo: "protestos", label: "Protestos",          presente: temBureau,   obrigatorio: false, automatico: true,  peso: 15 },
    { tipo: "processos", label: "Processos",          presente: temBureau,   obrigatorio: false, automatico: true,  peso: 10 },
    { tipo: "dre",       label: "DRE",                presente: temDRE,      obrigatorio: false, automatico: false, peso: 5  },
    { tipo: "balanco",   label: "Balanço",            presente: temBalanco,  obrigatorio: false, automatico: false, peso: 5  },
    { tipo: "ir_socios", label: "IR dos Sócios",      presente: temIR,       obrigatorio: false, automatico: false, peso: 3  },
    { tipo: "curva_abc", label: "Curva ABC",          presente: temCurvaABC, obrigatorio: false, automatico: false, peso: 2  },
  ];

  const totalPresentes = documentos.filter(d => d.presente).length;
  const totalPossivel  = documentos.length;
  const percentual     = Math.round((totalPresentes / totalPossivel) * 100);
  const pesoAtingido   = documentos.filter(d => d.presente).reduce((s, d) => s + d.peso, 0);
  const nivel: CoberturaAnalise["nivel"] = percentual >= 78 ? "completa" : percentual >= 45 ? "parcial" : "minima";

  return { documentos, totalPresentes, totalPossivel, percentual, pesoAtingido, nivel };
}

export function parseMoneyToNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildContext(data: ExtractedData, aiAnalysis: AIAnalysis | null): GeneratorContext {
  const safeName = (data.cnpj.cnpj || "relatorio").replace(/[\/\\.:]/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);

  const dividaAtiva = parseMoneyToNumber(data.scr.totalDividasAtivas);
  const atraso = parseMoneyToNumber(data.scr.operacoesEmAtraso);
  const prejuizosVal = parseMoneyToNumber(data.scr.prejuizos);
  const vencidas = parseMoneyToNumber(data.scr.operacoesVencidas);
  const vencidosSCR = parseMoneyToNumber(data.scr.vencidos);
  const protestosVigentes = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;

  // Rating local
  const ratingScore = (() => {
    let s = 0;
    if (data.cnpj.situacaoCadastral?.toUpperCase().includes("ATIVA")) s += 1;
    if (data.cnpj.dataAbertura) {
      const parts = data.cnpj.dataAbertura.split("/");
      if (parts.length >= 3) {
        const year = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(year) && new Date().getFullYear() - year > 5) s += 1;
      }
    }
    if (!data.faturamento.faturamentoZerado) s += 1.5;
    if (data.faturamento.dadosAtualizados) s += 0.5;
    if (vencidosSCR === 0 && vencidas === 0) s += 1.5;
    if (prejuizosVal === 0) s += 1.5;
    const cl = data.scr.classificacaoRisco?.toUpperCase().trim();
    if (cl && ["A", "AA", "B", "C"].includes(cl)) s += 1;
    if (protestosVigentes === 0) s += 1;
    if (!data.processos?.temRJ) s += 0.5;
    s += 0.5;
    return Math.min(10, Math.round(s * 10) / 10);
  })();

  const finalRating = aiAnalysis ? aiAnalysis.rating : ratingScore;
  const decision: string = aiAnalysis ? aiAnalysis.decisao : (finalRating >= 7 ? "APROVADO" : finalRating >= 4 ? "PENDENTE" : "REPROVADO");
  const decisionColor = decision === "APROVADO" ? "#16A34A" : decision === "REPROVADO" ? "#DC2626" : "#D97706";
  const decisionBg = decision === "APROVADO" ? "#F0FDF4" : decision === "PENDENTE" ? "#FFFBEB" : "#FEF2F2";
  const decisionBorder = decision === "APROVADO" ? "#BBF7D0" : decision === "PENDENTE" ? "#FDE68A" : "#FECACA";

  const alerts: Alert[] = (() => {
    if (aiAnalysis && aiAnalysis.alertas.length > 0) {
      return aiAnalysis.alertas.map(a => ({ message: a.descricao, severity: a.severidade as AlertSeverity, impacto: a.impacto }));
    }
    const a: Alert[] = [];
    if (vencidosSCR > 0 || vencidas > 0) a.push({ message: "SCR com operações vencidas", severity: "ALTA" });
    if (prejuizosVal > 0) a.push({ message: "SCR com prejuízos registrados", severity: "ALTA" });
    if (data.faturamento.faturamentoZerado) a.push({ message: "Faturamento zerado no período", severity: "ALTA" });
    if (!data.faturamento.dadosAtualizados) a.push({ message: "Faturamento desatualizado", severity: "MODERADA" });
    const rl = data.scr.classificacaoRisco?.toUpperCase();
    if (rl && ["D", "E", "F", "G", "H"].includes(rl)) a.push({ message: `Classificação de risco ${rl}`, severity: "MODERADA" });
    if (atraso > 0) a.push({ message: "Operações em atraso no SCR", severity: "MODERADA" });
    return a;
  })();

  const alertsHigh = alerts.filter(a => a.severity === "ALTA");
  const alertsMod = alerts.filter(a => a.severity === "MODERADA" || a.severity === "INFO");
  const pontosFortes = aiAnalysis?.pontosFortes || [];
  const pontosFracos = aiAnalysis?.pontosFracos || [];
  const perguntasVisita = aiAnalysis?.perguntasVisita || [];
  const resumoExecutivo = aiAnalysis?.resumoExecutivo || "";

  const riskScore: "alto" | "medio" | "baixo" = alertsHigh.length > 0 ? "alto" : alertsMod.length > 0 ? "medio" : "baixo";

  const companyAge = (() => {
    const raw = data.cnpj?.dataAbertura;
    if (!raw) return "";
    // Suporta DD/MM/YYYY (CreditHub/BDC) e YYYY-MM-DD (BrasilAPI)
    const parts = raw.split(/[\/\-]/);
    if (parts.length < 3) return "";
    const year = parseInt(parts[0].length === 4 ? parts[0] : parts[parts.length - 1], 10);
    if (isNaN(year) || year < 1900) return "";
    const age = new Date().getFullYear() - year;
    return `${age} ano${age !== 1 ? "s" : ""}`;
  })();

  return {
    data, aiAnalysis, safeName, dateStr,
    finalRating, decision, decisionColor, decisionBg, decisionBorder,
    alerts, alertsHigh, alertsMod,
    pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
    riskScore, companyAge,
    dividaAtiva, atraso, prejuizosVal, vencidas, vencidosSCR, protestosVigentes,
  };
}
