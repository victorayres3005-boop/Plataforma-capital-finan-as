// ─── Opção de critério ─────────────────────────────────────────────────────────
export interface OpcaoCriterio {
  label: string;
  descricao: string;
  pontos: number;
}

// ─── Modificador por tipo de validação (ex: tipo de visita) ──────────────────
export interface ModificadorCriterio {
  label: string;
  multiplicador: number;
}

// ─── Critério de um pilar ──────────────────────────────────────────────────────
export interface CriterioPilar {
  id: string;
  nome: string;
  pontos_maximos: number;
  opcoes: OpcaoCriterio[];
  obrigatorio: boolean;
  observacao?: string;
  modificadores?: ModificadorCriterio[];
  status_calibracao: "calibrado" | "pendente_calibracao";
}

// ─── Pilar da política ────────────────────────────────────────────────────────
export interface PilarPolitica {
  id: "perfil_empresa" | "saude_financeira" | "risco_compliance" | "socios_governanca" | "estrutura_operacao";
  nome: string;
  pontos_totais: number;
  criterios: CriterioPilar[];
  status_calibracao: "calibrado" | "pendente_calibracao";
}

// ─── Pesos dos pilares (soma deve ser 100) ───────────────────────────────────
export interface PesosPilares {
  estrutura_operacao: number;
  risco_compliance: number;
  perfil_empresa: number;
  saude_financeira: number;
  socios_governanca: number;
}

// ─── Parâmetros de elegibilidade ──────────────────────────────────────────────
export interface ParametrosElegibilidade {
  // Critérios eliminatórios
  tempo_constituicao_minimo_anos: number;
  fmm_minimo: number;
  aceita_com_debitos_outros_fundos: boolean;
  aceita_recuperacao_judicial_homologada: boolean;
  // Alavancagem
  alavancagem_saudavel: number;
  alavancagem_maxima: number;
  // SCR
  scr_vencidos_max_pct: number;
  // Restrições bureau
  protestos_max: number;
  processos_passivos_max: number;
  // Parâmetros operacionais
  prazo_maximo_aprovado: number;
  prazo_maximo_condicional: number;
  concentracao_max_sacado: number;
  fator_limite_base: number;
  revisao_aprovado_dias: number;
  revisao_condicional_dias: number;
  // Meta
  versao: string;
  ultima_atualizacao: string;
  atualizado_por: string;
}

// ─── Faixa de rating ─────────────────────────────────────────────────────────
export interface FaixaRating {
  rating: "A" | "B" | "C" | "D" | "E" | "F";
  score_minimo: number;
  score_maximo: number;
  cor: string;
  label: string;
  interpretacao: string;
  leitura_risco: string;
  periodicidade_reanalise_dias: number;
}

// ─── Alerta da política ───────────────────────────────────────────────────────
export interface AlertaPolitica {
  id: string;
  nivel: "critico" | "moderado" | "operacional";
  descricao: string;
  acao_automatica?: "bloquear_operacao" | "reduzir_limite" | "notificar_comite";
  ativo: boolean;
}

// ─── Configuração completa da política ───────────────────────────────────────
export interface ConfiguracaoPolitica {
  id?: string;
  user_id?: string;
  versao: string;
  status: "rascunho" | "ativo" | "arquivado";
  parametros_elegibilidade: ParametrosElegibilidade;
  pesos_pilares: PesosPilares;
  pilares: PilarPolitica[];
  faixas_rating: FaixaRating[];
  alertas: AlertaPolitica[];
  criado_em?: string;
  atualizado_em?: string;
  criado_por?: string;
}

// ─── Resposta de critério preenchida pelo analista ───────────────────────────
export interface RespostaCriterio {
  criterio_id: string;
  pilar_id: string;
  opcao_label: string;
  pontos_base: number;
  modificador_label?: string;
  modificador_multiplicador?: number;
  pontos_final: number;
  observacao?: string;
  fonte_preenchimento?: 'auto' | 'manual';
}

// ─── Resultado calculado do score ─────────────────────────────────────────────
export interface ScoreResult {
  pontos_brutos: Record<string, number>;
  pontuacao_ponderada: Record<string, number>;
  score_final: number;
  rating: "A" | "B" | "C" | "D" | "E" | "F";
  versao_politica: string;
  data_calculo: string;
  pilares_pendentes: string[];
  confianca_score: "alta" | "parcial" | "baixa";
}

// ─── Score de uma operação/coleta ─────────────────────────────────────────────
export interface ScoreOperacao {
  id?: string;
  collection_id: string;
  cedente_cnpj?: string;
  versao_politica: string;
  score_result: ScoreResult;
  respostas: RespostaCriterio[];
  preenchido_por?: string;
  preenchido_em: string;
  observacoes?: string;
}
