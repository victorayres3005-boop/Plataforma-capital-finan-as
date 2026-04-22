import type { ConfiguracaoPolitica, RespostaCriterio, ScoreResult } from "@/types/politica-credito";

const PILAR_IDS = ["perfil_empresa", "saude_financeira", "risco_compliance", "socios_governanca", "estrutura_operacao"] as const;

export function calcularScore(
  config: ConfiguracaoPolitica,
  respostas: RespostaCriterio[],
): ScoreResult {
  const pontos_brutos: Record<string, number> = {};
  const pontos_max: Record<string, number> = {};
  const pontuacao_ponderada: Record<string, number> = {};

  for (const pilar of config.pilares) {
    pontos_brutos[pilar.id] = 0;
    pontos_max[pilar.id] = pilar.pontos_totais;
    pontuacao_ponderada[pilar.id] = 0;
  }

  // Sum pontos from each response
  for (const resp of respostas) {
    if (resp.pilar_id in pontos_brutos) {
      pontos_brutos[resp.pilar_id] = (pontos_brutos[resp.pilar_id] ?? 0) + resp.pontos_final;
    }
  }

  // Clamp brutos to pilar max
  for (const id of PILAR_IDS) {
    pontos_brutos[id] = Math.min(pontos_brutos[id] ?? 0, pontos_max[id] ?? 20);
  }

  // Calc ponderada and score_final
  // score_final = Σ (pontos_brutos / pontos_max * peso%)
  let score_final = 0;
  const pesoMap: Record<string, number> = {
    perfil_empresa: config.pesos_pilares.perfil_empresa,
    saude_financeira: config.pesos_pilares.saude_financeira,
    risco_compliance: config.pesos_pilares.risco_compliance,
    socios_governanca: config.pesos_pilares.socios_governanca,
    estrutura_operacao: config.pesos_pilares.estrutura_operacao,
  };

  for (const id of PILAR_IDS) {
    const peso = pesoMap[id] ?? 0;
    const pMax = pontos_max[id] ?? 20;
    const pBruto = pontos_brutos[id] ?? 0;
    const ponderado = pMax > 0 ? (pBruto / pMax) * peso : 0;
    pontuacao_ponderada[id] = Math.round(ponderado * 100) / 100;
    score_final += ponderado;
  }

  score_final = Math.round(Math.max(0, Math.min(100, score_final)) * 100) / 100;

  const rating = determinarRating(score_final, config);
  const pilares_pendentes = config.pilares
    .filter(p => p.status_calibracao === "pendente_calibracao")
    .map(p => p.nome);

  const confianca_score: ScoreResult["confianca_score"] =
    pilares_pendentes.length === 0 ? "alta" :
    pilares_pendentes.length <= 2 ? "parcial" : "baixa";

  return {
    pontos_brutos,
    pontuacao_ponderada,
    score_final,
    rating,
    versao_politica: config.versao,
    data_calculo: new Date().toISOString(),
    pilares_pendentes,
    confianca_score,
  };
}

function determinarRating(score: number, config: ConfiguracaoPolitica): ScoreResult["rating"] {
  for (const faixa of config.faixas_rating) {
    if (score >= faixa.score_minimo && score <= faixa.score_maximo) {
      return faixa.rating;
    }
  }
  return "F";
}

export function getRatingFaixa(rating: string, config: ConfiguracaoPolitica) {
  return config.faixas_rating.find(f => f.rating === rating);
}

export function calcularPontosCriterio(
  pontos_base: number,
  modificador_multiplicador?: number,
): number {
  const mult = modificador_multiplicador ?? 1.0;
  return Math.round(pontos_base * mult * 100) / 100;
}
