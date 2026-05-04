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

// ─── Pilar 2 — Saúde Financeira (calibrado) ──────────────────────────────────
const PILAR_SAUDE_FINANCEIRA: PilarPolitica = {
  id: "saude_financeira",
  nome: "Saúde Financeira",
  pontos_totais: 20,
  status_calibracao: "calibrado",
  criterios: [
    {
      id: "qualidade_faturamento",
      nome: "Faturamento (qualidade e consistência)",
      pontos_maximos: 7,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Avaliar série histórica extraída dos documentos — regularidade, tendência e sazonalidade.",
      opcoes: [
        { label: "Crescimento consistente", descricao: "Faturamento crescendo de forma comprovada", pontos: 7 },
        { label: "Estável", descricao: "Faturamento regular, sem tendência clara", pontos: 5 },
        { label: "Oscilação moderada", descricao: "Variação < 20% entre períodos", pontos: 3 },
        { label: "Queda recente", descricao: "Queda perceptível nos últimos meses ou inconsistências", pontos: 1 },
        { label: "Queda severa ou não comprovado", descricao: "Faturamento zerado, ausente ou incompatível", pontos: 0 },
      ],
    },
    {
      id: "analise_financeira",
      nome: "Análise Financeira (DRE / Balanço)",
      pontos_maximos: 8,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Priorizar DRE mais recente. Na ausência, utilizar extratos bancários como proxy.",
      opcoes: [
        { label: "Lucrativo — margens saudáveis", descricao: "Lucro líquido consistente, margens crescentes", pontos: 8 },
        { label: "Lucrativo — margens apertadas", descricao: "Resultado positivo, mas pressão nas margens", pontos: 6 },
        { label: "Break-even / margem mínima", descricao: "Operação no limite, sem folga financeira", pontos: 3 },
        { label: "Prejuízo pontual", descricao: "Resultado negativo isolado com justificativa", pontos: 1 },
        { label: "Prejuízo crônico ou ausência de demonstrativo", descricao: "Sem dados confiáveis ou perdas recorrentes", pontos: 0 },
      ],
    },
    {
      id: "alavancagem",
      nome: "Alavancagem (SCR / FMM)",
      pontos_maximos: 5,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Calcular como: Total de dívidas SCR ÷ FMM dos últimos 12 meses.",
      opcoes: [
        { label: "Baixa — < 2x FMM", descricao: "Empresa pouco endividada em relação ao faturamento", pontos: 5 },
        { label: "Moderada — 2x a 3,5x FMM", descricao: "Endividamento dentro do parâmetro saudável", pontos: 3 },
        { label: "Alta — 3,5x a 5x FMM", descricao: "Próximo ao limite máximo definido pela política", pontos: 1 },
        { label: "Muito alta — > 5x FMM", descricao: "Acima do limite máximo da política", pontos: 0 },
      ],
    },
  ],
};

// ─── Pilar 3 — Risco e Compliance (calibrado) ────────────────────────────────
const PILAR_RISCO_COMPLIANCE: PilarPolitica = {
  id: "risco_compliance",
  nome: "Risco e Compliance",
  pontos_totais: 20,
  status_calibracao: "calibrado",
  criterios: [
    {
      id: "situacao_juridica",
      nome: "Situação Jurídica (RJ, falência, execuções)",
      pontos_maximos: 5,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Verificar processos no polo passivo com foco em execuções fiscais e RJ.",
      opcoes: [
        { label: "Sem restrições", descricao: "Nenhum processo jurídico relevante identificado", pontos: 5 },
        { label: "Restrições leves", descricao: "Processos trabalhistas antigos ou baixo valor", pontos: 3 },
        { label: "Restrições moderadas", descricao: "Ações cíveis ou execuções em andamento, valor relevante", pontos: 1 },
        { label: "Risco crítico", descricao: "Recuperação judicial ativa ou falência decretada", pontos: 0 },
      ],
    },
    {
      id: "protestos",
      nome: "Protestos Vigentes",
      pontos_maximos: 4,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Considerar número e valor total dos protestos cartorários vigentes.",
      opcoes: [
        { label: "Zero protestos", descricao: "Nenhum protesto vigente", pontos: 4 },
        { label: "1–2 protestos de baixo valor", descricao: "Protestos pontuais e de valor reduzido", pontos: 2 },
        { label: "3+ protestos ou valor relevante", descricao: "Múltiplos protestos ou montante expressivo", pontos: 0 },
      ],
    },
    {
      id: "scr_endividamento",
      nome: "SCR — Endividamento e Vencidos",
      pontos_maximos: 5,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Avaliar classificação de risco SCR e percentual de operações vencidas.",
      opcoes: [
        { label: "A–B, sem vencidos", descricao: "Classificação excelente, carteira saudável", pontos: 5 },
        { label: "C, vencidos < 5%", descricao: "Risco moderado, inadimplência controlada", pontos: 3 },
        { label: "D ou vencidos 5–15%", descricao: "Risco elevado, inadimplência relevante", pontos: 1 },
        { label: "E–F ou vencidos > 15%", descricao: "Carteira comprometida ou classificação crítica", pontos: 0 },
      ],
    },
    {
      id: "pefin_refin",
      nome: "Negativações (Pefin / Refin / SPC)",
      pontos_maximos: 3,
      obrigatorio: true,
      status_calibracao: "calibrado",
      opcoes: [
        { label: "Sem negativações", descricao: "Empresa sem registros negativos", pontos: 3 },
        { label: "Negativações antigas ou baixo valor", descricao: "Registros > 2 anos ou valores residuais", pontos: 1 },
        { label: "Negativações recentes ou valor relevante", descricao: "Registros recentes ou montante expressivo", pontos: 0 },
      ],
    },
    {
      id: "processos_judiciais",
      nome: "Processos Judiciais (polo passivo)",
      pontos_maximos: 3,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Foco em processos ativos com risco de impacto financeiro.",
      opcoes: [
        { label: "Sem processos relevantes", descricao: "Nenhum processo de impacto identificado", pontos: 3 },
        { label: "Processos de baixo impacto", descricao: "1–3 trabalhistas ou cíveis de baixo valor", pontos: 2 },
        { label: "Processos relevantes em andamento", descricao: "Ações com risco de impacto significativo", pontos: 1 },
        { label: "Múltiplos ou execuções fiscais expressivas", descricao: "Passivo judicial elevado ou risco de bloqueio", pontos: 0 },
      ],
    },
  ],
};

// ─── Pilar 4 — Sócios e Governança (calibrado) ───────────────────────────────
const PILAR_SOCIOS_GOVERNANCA: PilarPolitica = {
  id: "socios_governanca",
  nome: "Sócios e Governança",
  pontos_totais: 20,
  status_calibracao: "calibrado",
  criterios: [
    {
      id: "endividamento_socios",
      nome: "Endividamento dos Sócios",
      pontos_maximos: 6,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Verificar CPF dos sócios principais (≥ 20% de participação) no bureau.",
      opcoes: [
        { label: "Sem restrições", descricao: "Sócios sem negativações ou endividamento elevado", pontos: 6 },
        { label: "Restrições leves ou antigas", descricao: "Registros antigos ou de baixo valor", pontos: 3 },
        { label: "Dívidas relevantes ou negativações ativas", descricao: "Sócios com passivos expressivos ou inadimplência recente", pontos: 0 },
      ],
    },
    {
      id: "tempo_empresa",
      nome: "Tempo dos Sócios na Empresa",
      pontos_maximos: 5,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Considerar contrato social e histórico de alterações societárias.",
      opcoes: [
        { label: "Sócios-fundadores há > 5 anos", descricao: "Alta estabilidade e comprometimento", pontos: 5 },
        { label: "Sócios há 2–5 anos", descricao: "Estabilidade razoável", pontos: 3 },
        { label: "Sócios há 1–2 anos", descricao: "Incorporação relativamente recente", pontos: 1 },
        { label: "Sócio incorporado há < 1 ano", descricao: "Mudança societária recente — risco de sucessão ou reestruturação", pontos: 0 },
      ],
    },
    {
      id: "patrimonio_socios",
      nome: "Patrimônio Declarado dos Sócios",
      pontos_maximos: 5,
      obrigatorio: false,
      status_calibracao: "calibrado",
      observacao: "Verificar IR e declarações de bens quando disponíveis.",
      opcoes: [
        { label: "Patrimônio relevante e confirmado", descricao: "Imóveis, veículos ou investimentos comprovados", pontos: 5 },
        { label: "Patrimônio moderado", descricao: "Bens declarados de valor médio", pontos: 3 },
        { label: "Patrimônio limitado", descricao: "Poucos bens ou informação parcial", pontos: 1 },
        { label: "Sem patrimônio declarado", descricao: "Sócios sem bens identificados", pontos: 0 },
      ],
    },
    {
      id: "risco_sucessao",
      nome: "Risco de Sucessão / Dependência Operacional",
      pontos_maximos: 4,
      obrigatorio: false,
      status_calibracao: "calibrado",
      observacao: "Avaliar se a operação depende criticamente de uma única pessoa.",
      opcoes: [
        { label: "Estrutura com múltiplos gestores", descricao: "Empresa não depende de uma pessoa-chave", pontos: 4 },
        { label: "Dependência moderada", descricao: "Sócio principal relevante, mas há suporte", pontos: 2 },
        { label: "Alta dependência de uma pessoa", descricao: "Empresa operacionalmente atrelada ao fundador", pontos: 0 },
      ],
    },
  ],
};

// ─── Pilar 5 — Estrutura da Operação (calibrado) ─────────────────────────────
const PILAR_ESTRUTURA_OPERACAO: PilarPolitica = {
  id: "estrutura_operacao",
  nome: "Estrutura da Operação",
  pontos_totais: 20,
  status_calibracao: "calibrado",
  criterios: [
    {
      id: "confirmacao_lastro",
      nome: "Confirmação de Lastro",
      pontos_maximos: 6,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Verificar nota fiscal, contrato ou pedido de compra que confirme o crédito.",
      opcoes: [
        { label: "Lastro 100% confirmado", descricao: "Toda a operação com lastro documentado e confirmado", pontos: 6 },
        { label: "Lastro > 80% confirmado", descricao: "Maioria confirmada, divergências residuais", pontos: 4 },
        { label: "Lastro 60–80% confirmado", descricao: "Parte relevante sem confirmação formal", pontos: 2 },
        { label: "Lastro < 60% ou sem confirmação", descricao: "Operação sem evidência suficiente de lastro", pontos: 0 },
      ],
    },
    {
      id: "perfil_sacados",
      nome: "Perfil e Qualidade dos Sacados",
      pontos_maximos: 5,
      obrigatorio: true,
      status_calibracao: "calibrado",
      observacao: "Avaliar solidez e histórico de pagamento dos sacados da carteira.",
      opcoes: [
        { label: "Grandes corporações ou governo", descricao: "Sacados com alta capacidade de pagamento", pontos: 5 },
        { label: "Empresas médias com histórico positivo", descricao: "Sacados conhecidos e com boa reputação", pontos: 4 },
        { label: "Sacados variados / mistos", descricao: "Carteira diversificada com perfis heterogêneos", pontos: 2 },
        { label: "PMEs frágeis ou em concentração", descricao: "Sacados com maior risco de inadimplência", pontos: 1 },
        { label: "Sacados desconhecidos ou alto risco", descricao: "Sem histórico verificável ou sinais de fraude", pontos: 0 },
      ],
    },
    {
      id: "tipo_operacao",
      nome: "Tipo de Operação (performado / a performar)",
      pontos_maximos: 4,
      obrigatorio: true,
      status_calibracao: "calibrado",
      opcoes: [
        { label: "Performado e confirmado", descricao: "Serviço entregue ou produto embarcado e confirmado", pontos: 4 },
        { label: "A performar com confirmação de entrega", descricao: "Pedido em andamento com evidência de entrega prevista", pontos: 2 },
        { label: "A performar sem confirmação prévia", descricao: "Crédito sobre operação sem entrega confirmada", pontos: 0 },
      ],
    },
    {
      id: "garantias",
      nome: "Garantias Adicionais",
      pontos_maximos: 3,
      obrigatorio: false,
      status_calibracao: "calibrado",
      opcoes: [
        { label: "Garantias reais", descricao: "Imóveis, equipamentos ou ativos com valor comprovado", pontos: 3 },
        { label: "Aval dos sócios com patrimônio", descricao: "Fidejussória com comprovação de bens", pontos: 2 },
        { label: "Garantias limitadas", descricao: "Aval sem comprovação de patrimônio suficiente", pontos: 1 },
        { label: "Sem garantias adicionais", descricao: "Operação sem cobertura adicional", pontos: 0 },
      ],
    },
    {
      id: "quantidade_fundos",
      nome: "Relacionamento com Outros Fundos",
      pontos_maximos: 2,
      obrigatorio: false,
      status_calibracao: "calibrado",
      observacao: "Múltiplos fundos simultâneos podem indicar dependência excessiva de capital externo.",
      opcoes: [
        { label: "Exclusivo neste fundo", descricao: "Empresa opera apenas com este FIDC", pontos: 2 },
        { label: "2–3 fundos simultaneamente", descricao: "Relacionamento moderado com outros fundos", pontos: 1 },
        { label: "4 ou mais fundos", descricao: "Alta dependência de múltiplos FIDCs", pontos: 0 },
      ],
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

// ─── Merge dados do banco com defaults calibrados ────────────────────────────
// Pilares salvos antes da calibração têm opcoes: []. Esta função substitui
// qualquer pilar sem opções pelo pilar default correspondente, preservando
// customizações do usuário em pilares que já tenham sido editados.
export function mergeComDefaults(dbData: Record<string, unknown>): import("@/types/politica-credito").ConfiguracaoPolitica {
  const defaults = {
    versao: "V2",
    status: "rascunho" as const,
    parametros_elegibilidade: {
      tempo_constituicao_minimo_anos: 3,
      fmm_minimo: 300000,
      aceita_com_debitos_outros_fundos: false,
      aceita_recuperacao_judicial_homologada: false,
      alavancagem_saudavel: 3.5,
      alavancagem_maxima: 5.0,
      scr_vencidos_max_pct: 10,
      protestos_max: 2,
      processos_passivos_max: 15,
      prazo_maximo_aprovado: 90,
      prazo_maximo_condicional: 60,
      concentracao_max_sacado: 20,
      fator_limite_base: 0.5,
      revisao_aprovado_dias: 90,
      revisao_condicional_dias: 60,
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
    faixas_rating: DEFAULT_FAIXAS_RATING,
    alertas: DEFAULT_ALERTAS,
  };

  const dbPilares = (dbData.pilares as import("@/types/politica-credito").PilarPolitica[] | null | undefined) ?? [];
  const pilaresDefault = [
    PILAR_PERFIL_EMPRESA,
    PILAR_SAUDE_FINANCEIRA,
    PILAR_RISCO_COMPLIANCE,
    PILAR_SOCIOS_GOVERNANCA,
    PILAR_ESTRUTURA_OPERACAO,
  ];

  const pilaresMerged = pilaresDefault.map(defaultPilar => {
    const dbPilar = dbPilares.find(p => p.id === defaultPilar.id);
    const todosVazios = dbPilar?.criterios.every(c => (c.opcoes?.length ?? 0) === 0);
    return !dbPilar || todosVazios ? defaultPilar : dbPilar;
  });

  return {
    id: dbData.id as string | undefined,
    user_id: dbData.user_id as string | undefined,
    versao: (dbData.versao as string | undefined) ?? defaults.versao,
    status: (dbData.status as import("@/types/politica-credito").ConfiguracaoPolitica["status"] | undefined) ?? defaults.status,
    parametros_elegibilidade: {
      ...defaults.parametros_elegibilidade,
      ...((dbData.parametros_elegibilidade as Record<string, unknown>) ?? {}),
    },
    pesos_pilares: (dbData.pesos_pilares as import("@/types/politica-credito").PesosPilares | undefined) ?? defaults.pesos_pilares,
    pilares: pilaresMerged,
    faixas_rating: (dbData.faixas_rating as import("@/types/politica-credito").FaixaRating[] | undefined) ?? defaults.faixas_rating,
    alertas: (dbData.alertas as import("@/types/politica-credito").AlertaPolitica[] | undefined) ?? defaults.alertas,
    criado_em: dbData.criado_em as string | undefined,
    atualizado_em: dbData.atualizado_em as string | undefined,
    criado_por: dbData.criado_por as string | undefined,
  };
}

// ─── Política completa default (V2) ──────────────────────────────────────────
export const DEFAULT_POLITICA_V2: ConfiguracaoPolitica = {
  versao: "V2",
  status: "rascunho",
  parametros_elegibilidade: {
    tempo_constituicao_minimo_anos: 3,
    fmm_minimo: 300000,
    aceita_com_debitos_outros_fundos: false,
    aceita_recuperacao_judicial_homologada: false,
    alavancagem_saudavel: 3.5,
    alavancagem_maxima: 5.0,
    scr_vencidos_max_pct: 10,
    protestos_max: 2,
    processos_passivos_max: 15,
    prazo_maximo_aprovado: 90,
    prazo_maximo_condicional: 60,
    concentracao_max_sacado: 20,
    fator_limite_base: 0.5,
    revisao_aprovado_dias: 90,
    revisao_condicional_dias: 60,
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
