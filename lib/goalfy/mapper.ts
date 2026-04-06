/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GoalfyPayload {
  // Identificação
  razaoSocial: string;
  cnpj: string;
  nomeFantasia: string;
  endereco: string;
  telefone: string;
  email: string;
  dataAbertura: string;
  porte: string;
  naturezaJuridica: string;
  cnaePrincipal: string;

  // Quadro societário
  capitalSocial: string;
  socios: { nome: string; participacao: string; qualificacao: string }[];

  // Resultado da análise
  decisao: "APROVADO" | "CONDICIONAL" | "REPROVADO";
  rating: number;
  fmm12m: string;
  fmmMedio: string;
  tendencia: string;
  alavancagem: string;

  // SCR
  scrPeriodoAtual: string;
  scrPeriodoAnterior: string;
  scrTotalDividas: string;
  scrVencidos: string;
  scrPrejuizos: string;
  scrQtdeIfs: string;
  scrPctDocsProcessados: string;

  // Protestos
  totalProtestos: number;
  valorTotalProtestos: string;

  // Processos
  totalProcessos: number;
  processosBancarios: number;
  processosFiscais: number;
  processosOutros: number;

  // Alertas
  alertasCriticos: { descricao: string; mitigacao: string }[];
  alertasModerados: { descricao: string; mitigacao: string }[];

  // Parâmetros operacionais
  limiteCredito: string;
  prazoMaximo: string;
  concentracaoMaxSacado: string;
  prazoRevisao: string;

  // Metadados
  geradoEm: string;
  urlRelatorio: string;
}

export function mapToGoalfyPayload(
  data: any,
  aiAnalysis: any,
  settings: any
): GoalfyPayload {
  const fmm = data.faturamento?.fmm12m || data.faturamento?.mediaAno || "0,00";
  const fmmNum = parseFloat(fmm.replace(/\./g, "").replace(",", ".")) || 0;
  const fatorLimite = settings?.fator_limite_base || 1;

  const alertasCriticos = (aiAnalysis?.alertas || [])
    .filter((a: any) => a.severidade === "critico" || a.severidade === "alto")
    .map((a: any) => ({ descricao: a.descricao, mitigacao: a.mitigacao || "" }));

  const alertasModerados = (aiAnalysis?.alertas || [])
    .filter((a: any) => a.severidade === "moderado" || a.severidade === "medio")
    .map((a: any) => ({ descricao: a.descricao, mitigacao: a.mitigacao || "" }));

  return {
    razaoSocial: data.cnpj?.razaoSocial || "",
    cnpj: data.cnpj?.cnpj || "",
    nomeFantasia: data.cnpj?.nomeFantasia || "",
    endereco: data.cnpj?.endereco || "",
    telefone: data.cnpj?.telefone || "",
    email: data.cnpj?.email || "",
    dataAbertura: data.cnpj?.dataAbertura || "",
    porte: data.cnpj?.porte || "",
    naturezaJuridica: data.cnpj?.naturezaJuridica || "",
    cnaePrincipal: data.cnpj?.cnaePrincipal || "",

    capitalSocial: data.qsa?.capitalSocial || data.contrato?.capitalSocial || "",
    socios: (data.qsa?.quadroSocietario || data.contrato?.socios || []).map((s: any) => ({
      nome: s.nome || "",
      participacao: s.participacao || "",
      qualificacao: s.qualificacao || "",
    })),

    decisao: aiAnalysis?.decisao || "REPROVADO",
    rating: aiAnalysis?.rating || 0,
    fmm12m: fmm,
    fmmMedio: data.faturamento?.fmmMedio || "—",
    tendencia: data.faturamento?.tendencia || "indefinido",
    alavancagem: aiAnalysis?.indicadores?.alavancagem || "0x",

    scrPeriodoAtual: data.scr?.periodoReferencia || "",
    scrPeriodoAnterior: data.scrAnterior?.periodoReferencia || "",
    scrTotalDividas: data.scr?.totalDividasAtivas || "0,00",
    scrVencidos: data.scr?.vencidos || "0,00",
    scrPrejuizos: data.scr?.prejuizos || "0,00",
    scrQtdeIfs: data.scr?.qtdeInstituicoes || "0",
    scrPctDocsProcessados: data.scr?.pctDocumentosProcessados || "",

    totalProtestos: data.protestos?.totalProtestos || 0,
    valorTotalProtestos: data.protestos?.valorTotal || "0,00",

    totalProcessos: data.processos?.totalProcessos || 0,
    processosBancarios: data.processos?.processosBancarios || 0,
    processosFiscais: data.processos?.processosFiscais || 0,
    processosOutros: data.processos?.processosOutros || 0,

    alertasCriticos,
    alertasModerados,

    limiteCredito: `R$ ${(fmmNum * fatorLimite).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    prazoMaximo: `${settings?.prazo_maximo_aprovado || 90} dias`,
    concentracaoMaxSacado: `${settings?.concentracao_max_sacado || 30}%`,
    prazoRevisao: `${settings?.revisao_aprovado_dias || 180} dias`,

    geradoEm: new Date().toISOString(),
    urlRelatorio: "",
  };
}
