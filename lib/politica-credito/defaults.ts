import type {
  ConfiguracaoPolitica,
  PilarPolitica,
  FaixaRating,
  AlertaPolitica,
} from "@/types/politica-credito";

// ─── Pilar 1 — Perfil da Empresa (calibrado) ─────────────────────────────────
const PILAR_PERFIL_EMPRESA: PilarPolitica = {
  id: "perfil_empresa",
  nome: "Perfil da Empresa",
  pontos_totais: 20,
  status_calibracao: "calibrado",
  criterios: [
    {
      id: "segmento",
      nome: "Segmento de Atuação",
      pontos_maximos: 4,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Classificação deverá seguir tabela interna padronizada, evitando subjetividade na análise.",
      opcoes: [
        { label: "Baixo risco", descricao: "Receita recorrente, essencial", pontos: 4 },
        { label: "Médio", descricao: "Estável, mas sensível a ciclo", pontos: 3 },
        { label: "Médio-alto", descricao: "Alguma volatilidade", pontos: 2 },
        { label: "Alto risco", descricao: "Margem baixa / alta volatilidade (ex: transporte)", pontos: 1 },
        { label: "Crítico", descricao: "Histórico de fraude ou instabilidade extrema", pontos: 0 },
      ],
    },
    {
      id: "localizacao",
      nome: "Localização",
      pontos_maximos: 4,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Considerar histórico interno e análise de mercado.",
      opcoes: [
        { label: "Baixo risco", descricao: "Regiões sem histórico negativo", pontos: 4 },
        { label: "Médio", descricao: "Regiões neutras", pontos: 3 },
        { label: "Médio-alto", descricao: "Algum histórico de problema", pontos: 2 },
        { label: "Alto risco", descricao: "Histórico de inadimplência/perdas", pontos: 1 },
        { label: "Crítico", descricao: "Região bloqueada", pontos: 0 },
      ],
    },
    {
      id: "capacidade_operacional",
      nome: "Capacidade Operacional Estimada (Porte x Faturamento)",
      pontos_maximos: 5,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Penalizar faturamentos inconsistentes ou incompatíveis com capacidade operacional.",
      opcoes: [
        { label: "Excelente", descricao: "Totalmente coerente com mercado", pontos: 5 },
        { label: "Boa", descricao: "Pequenas variações", pontos: 4 },
        { label: "Regular", descricao: "Alguma distorção", pontos: 3 },
        { label: "Ruim", descricao: "Muito fora do esperado", pontos: 2 },
        { label: "Crítico", descricao: "Incompatível com realidade", pontos: 0 },
      ],
    },
    {
      id: "estrutura_fisica",
      nome: "Estrutura Física",
      pontos_maximos: 4,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Pontuação ajustada conforme tipo de validação realizada.",
      modificadores: [
        { label: "Visita presencial", multiplicador: 1.0 },
        { label: "Visita remota (vídeo/fotos)", multiplicador: 0.8 },
        { label: "Sem visita", multiplicador: 0.6 },
      ],
      opcoes: [
        { label: "Excelente", descricao: "Estrutura robusta e compatível", pontos: 4 },
        { label: "Boa", descricao: "Estrutura adequada", pontos: 3 },
        { label: "Regular", descricao: "Estrutura simples", pontos: 2 },
        { label: "Ruim", descricao: "Estrutura limitada", pontos: 1 },
        { label: "Crítico", descricao: "Incompatível com operação", pontos: 0 },
      ],
    },
    {
      id: "patrimonio_empresa",
      nome: "Patrimônio da Empresa",
      pontos_maximos: 3,
      obrigatorio: false,
      status_calibracao: "calibrado",
      opcoes: [
        { label: "Alto", descricao: "Patrimônio relevante (imóveis, ativos)", pontos: 3 },
        { label: "Bom", descricao: "Patrimônio compatível", pontos: 2 },
        { label: "Médio", descricao: "Patrimônio limitado", pontos: 1 },
        { label: "Baixo", descricao: "Pouco ou sem patrimônio", pontos: 0 },
      ],
    },
  ],
};

// ─── Pilar 2 — Saúde Financeira (pendente calibração) ────────────────────────
const PILAR_SAUDE_FINANCEIRA: PilarPolitica = {
  id: "saude_financeira",
  nome: "Saúde Financeira",
  pontos_totais: 20,
  status_calibracao: "pendente_calibracao",
  criterios: [
    {
      id: "qualidade_faturamento",
      nome: "Faturamento (qualidade e consistência)",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "analise_financeira",
      nome: "Análise Financeira (DRE/Balanço)",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "alavancagem",
      nome: "Alavancagem",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
  ],
};

// ─── Pilar 3 — Risco e Compliance (pendente calibração) ──────────────────────
const PILAR_RISCO_COMPLIANCE: PilarPolitica = {
  id: "risco_compliance",
  nome: "Risco e Compliance",
  pontos_totais: 20,
  status_calibracao: "pendente_calibracao",
  criterios: [
    {
      id: "situacao_juridica",
      nome: "Situação (RJ, falência, etc.)",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "protestos",
      nome: "Protestos",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "scr_endividamento",
      nome: "SCR (endividamento)",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "pefin_refin",
      nome: "Pefin/Refin",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "processos_judiciais",
      nome: "Processos Judiciais",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
  ],
};

// ─── Pilar 4 — Sócios e Governança (pendente calibração) ─────────────────────
const PILAR_SOCIOS_GOVERNANCA: PilarPolitica = {
  id: "socios_governanca",
  nome: "Sócios e Governança",
  pontos_totais: 20,
  status_calibracao: "pendente_calibracao",
  criterios: [
    {
      id: "endividamento_socios",
      nome: "Endividamento dos Sócios",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "tempo_empresa",
      nome: "Tempo na Empresa",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "patrimonio_socios",
      nome: "Patrimônio dos Sócios",
      pontos_maximos: 0,
      obrigatorio: false,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "risco_sucessao",
      nome: "Risco de Sucessão",
      pontos_maximos: 0,
      obrigatorio: false,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
  ],
};

// ─── Pilar 5 — Estrutura da Operação (pendente calibração) ───────────────────
const PILAR_ESTRUTURA_OPERACAO: PilarPolitica = {
  id: "estrutura_operacao",
  nome: "Estrutura da Operação",
  pontos_totais: 20,
  status_calibracao: "pendente_calibracao",
  criterios: [
    {
      id: "confirmacao_lastro",
      nome: "Confirmação de Lastro",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "perfil_sacados",
      nome: "Perfil dos Sacados",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "tipo_operacao",
      nome: "Tipo de Operação (performado/a performar)",
      pontos_maximos: 0,
      obrigatorio: true,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "garantias",
      nome: "Garantias",
      pontos_maximos: 0,
      obrigatorio: false,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
    {
      id: "quantidade_fundos",
      nome: "Quantidade de Fundos",
      pontos_maximos: 0,
      obrigatorio: false,
      status_calibracao: "pendente_calibracao",
      opcoes: [],
    },
  ],
};

// ─── Faixas de rating default ─────────────────────────────────────────────────
export const DEFAULT_FAIXAS_RATING: FaixaRating[] = [
  { rating: "A", score_minimo: 90, score_maximo: 100, cor: "#22c55e", label: "A", interpretacao: "Excelente", leitura_risco: "Risco mínimo", periodicidade_reanalise_dias: 180 },
  { rating: "B", score_minimo: 80, score_maximo: 89, cor: "#86efac", label: "B", interpretacao: "Muito bom", leitura_risco: "Baixo risco", periodicidade_reanalise_dias: 120 },
  { rating: "C", score_minimo: 70, score_maximo: 79, cor: "#fde047", label: "C", interpretacao: "Bom", leitura_risco: "Risco moderado", periodicidade_reanalise_dias: 120 },
  { rating: "D", score_minimo: 60, score_maximo: 69, cor: "#fb923c", label: "D", interpretacao: "Atenção", leitura_risco: "Risco elevado", periodicidade_reanalise_dias: 120 },
  { rating: "E", score_minimo: 50, score_maximo: 59, cor: "#f97316", label: "E", interpretacao: "Ruim", leitura_risco: "Alto risco", periodicidade_reanalise_dias: 90 },
  { rating: "F", score_minimo: 0, score_maximo: 49, cor: "#ef4444", label: "F", interpretacao: "Muito ruim", leitura_risco: "Risco crítico", periodicidade_reanalise_dias: 45 },
];

// ─── Alertas default ──────────────────────────────────────────────────────────
export const DEFAULT_ALERTAS: AlertaPolitica[] = [
  // Críticos
  { id: "atraso_recorrente", nivel: "critico", descricao: "Atraso recorrente ou aumento de atraso", acao_automatica: "bloquear_operacao", ativo: true },
  { id: "nao_confirmacao_lastro", nivel: "critico", descricao: "Não confirmação de lastro", acao_automatica: "bloquear_operacao", ativo: true },
  { id: "divergencia_documental", nivel: "critico", descricao: "Divergência documental", ativo: true },
  { id: "indicio_fraude", nivel: "critico", descricao: "Indício de fraude", acao_automatica: "bloquear_operacao", ativo: true },
  { id: "recuperacao_judicial", nivel: "critico", descricao: "Pedido de recuperação judicial", acao_automatica: "bloquear_operacao", ativo: true },
  { id: "protestos_relevantes", nivel: "critico", descricao: "Inclusão relevante em protestos / restrições", ativo: true },
  // Moderados
  { id: "novos_fundos", nivel: "moderado", descricao: "Entrada em novos fundos (endividamento oculto)", ativo: true },
  { id: "mudanca_sacados", nivel: "moderado", descricao: "Mudança de padrão de sacados", ativo: true },
  { id: "aumento_concentracao", nivel: "moderado", descricao: "Aumento de concentração", ativo: true },
  { id: "queda_faturamento", nivel: "moderado", descricao: "Queda de faturamento percebida", ativo: true },
  { id: "alteracao_societaria", nivel: "moderado", descricao: "Alteração societária relevante", ativo: true },
  // Operacionais
  { id: "oscilacao_atraso", nivel: "operacional", descricao: "Oscilação leve de atraso", ativo: true },
  { id: "mudanca_comportamento", nivel: "operacional", descricao: "Mudança de comportamento de pagamento", ativo: true },
  { id: "inconsistencias_cadastrais", nivel: "operacional", descricao: "Pequenas inconsistências cadastrais", ativo: true },
];

// ─── Política completa default (V2) ──────────────────────────────────────────
export const DEFAULT_POLITICA_V2: ConfiguracaoPolitica = {
  versao: "V2",
  status: "rascunho",
  parametros_elegibilidade: {
    tempo_constituicao_minimo_anos: 3,
    fmm_minimo: 300000,
    aceita_com_debitos_outros_fundos: false,
    aceita_recuperacao_judicial_homologada: false,
    versao: "V2",
    ultima_atualizacao: new Date().toISOString().split("T")[0],
    atualizado_por: "",
  },
  pesos_pilares: {
    estrutura_operacao: 35,
    risco_compliance: 25,
    perfil_empresa: 15,
    saude_financeira: 15,
    socios_governanca: 10,
  },
  pilares: [
    PILAR_PERFIL_EMPRESA,
    PILAR_SAUDE_FINANCEIRA,
    PILAR_RISCO_COMPLIANCE,
    PILAR_SOCIOS_GOVERNANCA,
    PILAR_ESTRUTURA_OPERACAO,
  ],
  faixas_rating: DEFAULT_FAIXAS_RATING,
  alertas: DEFAULT_ALERTAS,
};
