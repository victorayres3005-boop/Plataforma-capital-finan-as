// ─── Sócio (usado em QSA e Contrato Social) ───
export interface Socio {
  nome: string;
  cpf: string;
  participacao: string;
  qualificacao: string;
}

// ─── Cartão CNPJ ───
export interface CNPJData {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  dataAbertura: string;
  situacaoCadastral: string;
  dataSituacaoCadastral: string;
  motivoSituacao: string;
  naturezaJuridica: string;
  cnaePrincipal: string;
  cnaeSecundarios: string;
  porte: string;
  capitalSocialCNPJ: string;
  endereco: string;
  telefone: string;
  email: string;
  // Campos enriquecidos pelo Credit Hub
  tipoEmpresa?: string;
  funcionarios?: string;
  regimeTributario?: string;
  site?: string;
  enderecos?: string[];
}

// ─── QSA (Quadro de Sócios e Administradores) ───
export interface QSASocio {
  nome: string;
  cpfCnpj: string;
  qualificacao: string;
  participacao: string;
  dataEntrada?: string;
  dataSaida?: string;
}

export interface QSAData {
  capitalSocial: string;
  quadroSocietario: QSASocio[];
}

// ─── Contrato Social ───
export interface ContratoSocialData {
  socios: Socio[];
  capitalSocial: string;
  objetoSocial: string;
  dataConstituicao: string;
  temAlteracoes: boolean;
  prazoDuracao: string;
  administracao: string;
  foro: string;
}

// ─── Faturamento ───
export interface FaturamentoMensal {
  mes: string;
  valor: string;
}

export interface FaturamentoData {
  meses: FaturamentoMensal[];
  somatoriaAno: string;
  mediaAno: string;
  faturamentoZerado: boolean;
  dadosAtualizados: boolean;
  ultimoMesComDados: string;
  mesesZerados?: { mes: string; motivo: string }[];
  quantidadeMesesZerados?: number;
  temMesesZerados?: boolean;
  fmm12m?: string;
  fmmAnual?: Record<string, string>;
  fmmMedio?: string;
  tendencia?: "crescimento" | "estavel" | "queda" | "indefinido";
}

// ─── SCR Detalhado ───
export interface SCRModalidade {
  nome: string;
  total: string;
  aVencer: string;
  vencido: string;
  participacao: string;
  ehContingente?: boolean;
}

export interface SCRInstituicao {
  nome: string;
  valor: string;
}

export interface SCRFaixas {
  ate30d: string;
  d31_60: string;
  d61_90: string;
  d91_180: string;
  d181_360: string;
  acima360d: string;
  prazoIndeterminado?: string;
  total: string;
}

export interface SCRData {
  periodoReferencia: string;
  carteiraAVencer: string;
  vencidos: string;
  prejuizos: string;
  limiteCredito: string;
  qtdeInstituicoes: string;
  qtdeOperacoes: string;
  totalDividasAtivas: string;
  operacoesAVencer: string;
  operacoesEmAtraso: string;
  operacoesVencidas: string;
  tempoAtraso: string;
  coobrigacoes: string;
  classificacaoRisco: string;
  carteiraCurtoPrazo: string;
  carteiraLongoPrazo: string;
  modalidades: SCRModalidade[];
  instituicoes: SCRInstituicao[];
  valoresMoedaEstrangeira: string;
  historicoInadimplencia: string;
  // Campos detalhados (novo prompt SCR)
  nomeCliente?: string;
  cpfSCR?: string;
  cnpjSCR?: string;
  pctDocumentosProcessados?: string;
  pctVolumeProcessado?: string;
  faixasAVencer?: SCRFaixas;
  faixasVencidos?: Omit<SCRFaixas, "prazoIndeterminado">;
  faixasPrejuizos?: { ate12m: string; acima12m: string; total: string };
  faixasLimite?: { ate360d: string; acima360d: string; total: string };
  outrosValores?: {
    carteiraCredito: string;
    responsabilidadeTotal: string;
    riscoTotal: string;
    coobrigacaoAssumida: string;
    coobrigacaoRecebida: string;
    creditosALiberar: string;
  };
  emDia?: string;
  semHistorico?: boolean;
  numeroIfs?: string;
  tipoPessoa?: "PF" | "PJ";
}

// ─── Protestos ───
export interface ProtestoDetalhe {
  data: string;
  credor: string;       // cartório / apresentante
  valor: string;
  regularizado: boolean;
  especie?: string;     // tipo do título (DUPLICATA, NP, etc.)
  numero?: string;      // número do protocolo no cartório
  apresentante?: string; // credor original / cedente
  municipio?: string;
  uf?: string;
  dataVencimento?: string;
}

export interface ProtestosData {
  vigentesQtd: string;
  vigentesValor: string;
  regularizadosQtd: string;
  regularizadosValor: string;
  detalhes: ProtestoDetalhe[];
}

// ─── Processos Judiciais ───
export interface ProcessoDistribuicao {
  tipo: string;   // TRABALHISTA, BANCO, FISCAL, FORNECEDOR, OUTROS
  qtd: string;
  pct: string;
}

export interface ProcessoBancario {
  banco: string;
  assunto: string;
  status: string;  // ARQUIVADO, EM ANDAMENTO, DISTRIBUIDO, etc.
  data: string;
  valor: string;
}

export interface ProcessoFiscal {
  contraparte: string;
  valor: string;
  status: string;
  data: string;
}

export interface ProcessoFornecedor {
  contraparte: string;
  assunto: string;
  valor: string;
  status: string;
  data: string;
}

export interface ProcessoOutro {
  contraparte: string;
  assunto: string;
  valor: string;
  status: string;
  data: string;
}

// Processo individual normalizado (Credit Hub)
export interface ProcessoItem {
  numero: string;
  tipo: string;
  assunto: string;
  data: string;
  valor: string;
  valorNum: number;
  status: string;
  partes: string;       // polo ativo / autor / credor
  tribunal: string;
  polo_passivo?: string; // réu / devedor
  fase?: string;         // fase processual (conhecimento, execução, etc.)
  uf?: string;
  comarca?: string;
  dataUltimoAndamento?: string;
}

export interface DistribuicaoTemporal {
  periodo: string;   // "< 1 ano", "1-3 anos", "3-5 anos", "> 5 anos"
  qtd: string;
  valor: string;
}

export interface DistribuicaoPorFaixa {
  faixa: string;    // "< R$10k", "R$10k-50k", etc.
  qtd: string;
  valor: string;
  pct: string;      // % da quantidade total
}

export interface ProcessosData {
  passivosTotal: string;   // total de processos (todos os polos)
  ativosTotal: string;     // processos em andamento (por status)
  valorTotalEstimado: string;
  temRJ: boolean;
  distribuicao: ProcessoDistribuicao[];
  bancarios: ProcessoBancario[];
  fiscais: ProcessoFiscal[];
  fornecedores: ProcessoFornecedor[];
  outros: ProcessoOutro[];
  // Polo processual (Credit Hub — quem processa quem)
  poloAtivoQtd?: string;   // empresa no polo ATIVO (autora/exequente)
  poloPassivoQtd?: string; // empresa no polo PASSIVO (ré/executada)
  temFalencia?: boolean;   // pedido de falência identificado
  // Análise analítica (Credit Hub)
  dividasQtd?: string;
  dividasValor?: string;
  distribuicaoTemporal?: DistribuicaoTemporal[];
  distribuicaoPorFaixa?: DistribuicaoPorFaixa[];
  top10Valor?: ProcessoItem[];
  top10Recentes?: ProcessoItem[];
}

// ─── Relatório de Visita ───
export interface RelatorioVisitaData {
  dataVisita: string;
  responsavelVisita: string;
  localVisita: string;
  duracaoVisita: string;
  estruturaFisicaConfirmada: boolean;
  funcionariosObservados: number;
  estoqueVisivel: boolean;
  estimativaEstoque: string;
  operacaoCompativelFaturamento: boolean;
  maquinasEquipamentos: boolean;
  descricaoEstrutura: string;
  pontosPositivos: string[];
  pontosAtencao: string[];
  recomendacaoVisitante: "aprovado" | "condicional" | "reprovado";
  nivelConfiancaVisita: "alto" | "medio" | "baixo";
  presencaSocios: boolean;
  sociosPresentes: string[];
  documentosVerificados: string[];
  observacoesLivres: string;
  pleito?: string;
  modalidade?: "comissaria" | "convencional" | "hibrida" | "outra";

  // ─── Parâmetros Operacionais ───
  taxaConvencional?: string;         // taxa para modalidade convencional (%)
  taxaComissaria?: string;           // taxa para modalidade comissária (%)
  limiteTotal?: string;              // limite total (R$)
  limiteConvencional?: string;       // limite convencional (R$)
  limiteComissaria?: string;         // limite comissária (R$)
  limitePorSacado?: string;          // limite por sacado (R$)
  ticketMedio?: string;              // ticket médio por duplicata (R$)
  valorCobrancaBoleto?: string;      // valor cobrado por cobrança de boleto (R$)
  prazoRecompraCedente?: string;     // condição: prazo de recompra pelo cedente (dias)
  prazoEnvioCartorio?: string;       // condição: envio para cartório em X dias
  prazoMaximoOp?: string;            // prazo máximo da operação (dias)
  cobrancaTAC?: string;              // cobrança de TAC (valor ou "Sim"/"Não")
  tranche?: string;                  // valor da tranche (R$)
  prazoTranche?: string;             // prazo da tranche (dias)

  // ─── Dados da Empresa (coletados na visita) ───
  folhaPagamento?: string;           // folha de pagamento mensal (R$)
  endividamentoBanco?: string;       // endividamento com bancos (R$)
  endividamentoFactoring?: string;   // endividamento com factoring/FIDC (R$)
  vendasCheque?: string;             // % vendas via cheque
  vendasDuplicata?: string;          // % vendas via duplicata
  vendasOutras?: string;             // % outras formas de venda
  prazoMedioFaturamento?: string;    // prazo médio de faturamento (dias)
  prazoMedioEntrega?: string;        // prazo médio de entrega das mercadorias (dias)
  referenciasFornecedores?: string;  // referências comerciais / fornecedores (texto livre)
}

// ─── IR dos Sócios ───
export interface SociedadeIR {
  razaoSocial: string;
  cnpj: string;
  participacao: string;
}

export interface IRSocioData {
  nomeSocio: string;
  cpf: string;
  anoBase: string;
  tipoDocumento?: "recibo" | "declaracao" | "extrato";
  numeroRecibo?: string;
  dataEntrega?: string;
  situacaoMalhas?: boolean;
  debitosEmAberto?: boolean;
  descricaoDebitos?: string;
  rendimentosTributaveis: string;
  rendimentosIsentos: string;
  rendimentoTotal: string;
  bensImoveis: string;
  bensVeiculos: string;
  aplicacoesFinanceiras: string;
  outrosBens: string;
  totalBensDireitos: string;
  dividasOnus: string;
  patrimonioLiquido: string;
  impostoDefinido?: string;
  valorQuota?: string;
  impostoPago: string;
  impostoRestituir: string;
  temSociedades: boolean;
  sociedades: SociedadeIR[];
  coerenciaComEmpresa: boolean;
  observacoes: string;
}

// ─── Balanço Patrimonial ───
export interface BalancoAno {
  ano: string;
  ativoTotal: string;
  ativoCirculante: string;
  caixaEquivalentes: string;
  contasAReceber: string;
  estoques: string;
  outrosAtivosCirculantes: string;
  ativoNaoCirculante: string;
  imobilizado: string;
  intangivel: string;
  outrosAtivosNaoCirculantes: string;
  passivoTotal: string;
  passivoCirculante: string;
  fornecedores: string;
  emprestimosCP: string;
  outrosPassivosCirculantes: string;
  passivoNaoCirculante: string;
  emprestimosLP: string;
  outrosPassivosNaoCirculantes: string;
  patrimonioLiquido: string;
  capitalSocial: string;
  reservas: string;
  lucrosAcumulados: string;
  liquidezCorrente: string;
  liquidezGeral: string;
  endividamentoTotal: string;
  capitalDeGiroLiquido: string;
}

export interface BalancoData {
  anos: BalancoAno[];
  periodoMaisRecente: string;
  tendenciaPatrimonio: "crescimento" | "estavel" | "queda";
  observacoes: string;
}

// ─── DRE (Demonstração de Resultado do Exercício) ───
export interface DREAno {
  ano: string;
  receitaBruta: string;
  deducoes: string;
  receitaLiquida: string;
  custoProdutosServicos: string;
  lucroBruto: string;
  margemBruta: string;
  despesasOperacionais: string;
  ebitda: string;
  margemEbitda: string;
  depreciacaoAmortizacao: string;
  resultadoFinanceiro: string;
  lucroAntesIR: string;
  impostoRenda: string;
  lucroLiquido: string;
  margemLiquida: string;
}

export interface DREData {
  anos: DREAno[];
  crescimentoReceita: string;
  tendenciaLucro: "crescimento" | "estavel" | "queda";
  periodoMaisRecente: string;
  observacoes: string;
}

// ─── Curva ABC / Carteira de Clientes ───
export interface ClienteCurvaABC {
  posicao: number;
  nome: string;
  cnpjCpf: string;
  valorFaturado: string;
  percentualReceita: string;
  percentualAcumulado: string;
  classe: string; // "A" | "B" | "C"
}

export interface CurvaABCData {
  clientes: ClienteCurvaABC[];
  totalClientesNaBase: number;
  totalClientesExtraidos: number;
  periodoReferencia: string;
  receitaTotalBase: string;
  concentracaoTop3: string;
  concentracaoTop5: string;
  concentracaoTop10: string;
  totalClientesClasseA: number;
  receitaClasseA: string;
  maiorCliente: string;
  maiorClientePct: string;
  alertaConcentracao: boolean;
  segmentos?: string[];
}

// ─── Grupo Econômico ───
export interface EmpresaGrupo {
  razaoSocial: string;
  cnpj: string;
  relacao: string;  // "via Sócio", "Controlada", "Coligada"
  scrTotal: string;
  protestos: string;
  processos: string;
  socioOrigem?: string;   // nome do sócio que vincula esta empresa
  cpfSocio?: string;
  participacao?: string;
  situacao?: string;      // "ATIVA" | "BAIXADA" | "SUSPENSA"
}

export interface ParentescoDetectado {
  socio1: string;
  socio2: string;
  sobrenomeComum: string;
}

export interface GrupoEconomicoData {
  empresas: EmpresaGrupo[];
  alertaParentesco?: boolean;
  parentescosDetectados?: ParentescoDetectado[];
}

export interface SCRSocioData {
  nomeSocio: string;
  cpfSocio: string;
  tipoPessoa: "PF";
  periodoAtual: SCRData;
  periodoAnterior?: SCRData;
}

// ─── CCF (Cheque Sem Fundo) ───
export interface CCFBanco {
  banco: string;
  agencia?: string;
  quantidade: number;
  dataUltimo?: string;
  motivo?: string;
}

export interface CCFHistoricoItem {
  quantidade: number;
  dataConsulta: string;
}

export interface CCFData {
  qtdRegistros: number;
  bancos: CCFBanco[];
  historico: CCFHistoricoItem[];
  tendenciaVariacao?: number;   // % de variação vs 6 meses atrás (positivo = piora)
  tendenciaLabel?: string;      // "crescimento", "estavel", "queda"
}

// ─── Histórico de Consultas ao Mercado ───
export interface HistoricoConsultaItem {
  usuario: string;
  ultimaConsulta: string;
}

// ─── Bureau Score (birôs de crédito) ───
export interface BureauScore {
  serasa?: {
    score: number;
    faixa: string;
    inadimplente: boolean;
    consultadoEm: string;
  };
  spc?: {
    score: number;
    pendencias: number;
    inadimplente: boolean;
    consultadoEm: string;
  };
  quod?: {
    score: number;
    faixa: string;
    consultadoEm: string;
  };
  credithub?: {
    consultadoEm: string;
    protestosIntegrados: boolean;
    processosIntegrados: boolean;
  };
}

// ─── Dados extraídos consolidados ───
export interface ExtractedData {
  cnpj: CNPJData;
  qsa: QSAData;
  contrato: ContratoSocialData;
  faturamento: FaturamentoData;
  scr: SCRData;
  scrAnterior: SCRData | null;
  protestos: ProtestosData;
  processos: ProcessosData;
  grupoEconomico: GrupoEconomicoData;
  curvaABC?: CurvaABCData;
  dre?: DREData;
  balanco?: BalancoData;
  irSocios?: IRSocioData[];
  relatorioVisita?: RelatorioVisitaData;
  scrSocios?: SCRSocioData[];
  score?: BureauScore;
  bureausConsultados?: string[];
  resumoRisco: string;
  ccf?: CCFData;
  historicoConsultas?: HistoricoConsultaItem[];
}

// ─── Histórico de Operações ───
export type OperacaoStatus = 'ativa' | 'liquidada' | 'inadimplente' | 'prorrogada';
export type OperacaoModalidade = 'duplicata' | 'CCB' | 'CRI' | 'NF' | 'LC' | 'outros';

export interface Operacao {
  id: string;
  user_id: string;
  cnpj: string;
  company_name: string;
  collection_id?: string | null;
  numero_operacao?: string | null;
  data_operacao: string;         // ISO date
  data_vencimento?: string | null;
  valor: number;
  taxa_mensal?: number | null;   // % a.m.
  prazo?: number | null;         // dias
  modalidade: OperacaoModalidade;
  status: OperacaoStatus;
  sacado?: string | null;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── App types ───
export type DocumentType = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'protestos' | 'processos' | 'grupoEconomico';
export type DocStatus = 'idle' | 'processing' | 'done' | 'error';
export type AppStep = 'upload' | 'review' | 'generate';

// ─── Supabase — Histórico de coletas ───
export interface CollectionDocument {
  type: 'cnpj' | 'qsa' | 'contrato_social' | 'faturamento' | 'scr_bacen' | 'protestos' | 'processos' | 'grupo_economico' | 'dre' | 'balanco' | 'curva_abc' | 'ir_socio' | 'relatorio_visita' | 'outro';
  filename: string;
  extracted_data: Record<string, unknown>;
  uploaded_at: string;
}

export interface DocumentCollection {
  id: string;
  user_id: string;
  created_at: string;
  finished_at: string | null;
  status: 'in_progress' | 'finished';
  label: string | null;
  documents: CollectionDocument[];
  company_name: string | null;
  cnpj: string | null;
  rating: number | null;
  decisao: 'APROVADO' | 'APROVACAO_CONDICIONAL' | 'PENDENTE' | 'REPROVADO' | null;
  fmm_12m: number | null;
  ai_analysis?: Record<string, unknown> | null;
  observacoes?: string | null;
  fund_status?: {
    status: "ok" | "warning" | "error";
    pass_count: number;
    fail_count: number;
    warn_count: number;
    total: number;
    preset_name?: string;
    preset_color?: string;
    validated_at: string;
  } | null;
}

// ─── Análise de IA ───
export interface DocumentoCobertura {
  tipo: string;
  label: string;
  presente: boolean;
  obrigatorio: boolean;
  automatico: boolean;
  peso: number; // % do score total
}

export interface CoberturaAnalise {
  documentos: DocumentoCobertura[];
  totalPresentes: number;
  totalPossivel: number;
  percentual: number;       // 0-100
  pesoAtingido: number;     // % do score coberto por dados reais
  nivel: "completa" | "parcial" | "minima";
}

export interface AIAnalysis {
  rating: number;
  ratingMax: number;
  decisao: "APROVADO" | "APROVACAO_CONDICIONAL" | "PENDENTE" | "REPROVADO";
  coberturaAnalise?: CoberturaAnalise;
  alertas: Array<{
    severidade: "ALTA" | "MODERADA" | "INFO";
    descricao: string;
    impacto: string;
    mitigacao: string;
  }>;
  indicadores: {
    idadeEmpresa: string;
    alavancagem: string;
    fmm: string;
    comprometimentoFaturamento: string;
    concentracaoCredito: string;
  };
  parecer: {
    resumoExecutivo: string;
    pontosFortes: string[];
    pontosNegativosOuFracos: string[];
    perguntasVisita: Array<{ pergunta: string; contexto: string }>;
    textoCompleto: string;
  } | string;
  parametrosOperacionais: {
    limiteAproximado: string;
    prazoMaximo: string;
    concentracaoSacado: string;
    garantias: string;
    revisao: string;
  };
  variacoes: {
    emDia: string;
    carteiraCurtoPrazo: string;
    carteiraLongoPrazo: string;
    totalDividasAtivas: string;
    vencidos: string;
    prejuizos: string;
    limiteCredito: string;
    numeroIfs: string;
  };
  // campos top-level para backward compat
  resumoExecutivo?: string;
  pontosFortes?: string[];
  pontosFracos?: string[];
  perguntasVisita?: Array<{ pergunta: string; contexto: string }>;
  motivoPreRequisito?: string[];
  sinteseExecutiva?: string;
}

// ─── Notificações ───
export interface Notification {
  id: string;
  user_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

// ─── Configurações do Fundo ───
export interface FundSettings {
  id?: string;
  user_id?: string;
  fmm_minimo: number;
  idade_minima_anos: number;
  alavancagem_saudavel: number;
  alavancagem_maxima: number;
  prazo_maximo_aprovado: number;
  prazo_maximo_condicional: number;
  concentracao_max_sacado: number;
  fator_limite_base: number;
  revisao_aprovado_dias: number;
  revisao_condicional_dias: number;
  // Restrições adicionais (eliminatórias configuráveis)
  protestos_max: number;
  processos_passivos_max: number;
  scr_vencidos_max_pct: number;
}

export const DEFAULT_FUND_SETTINGS: FundSettings = {
  fmm_minimo: 300000,
  idade_minima_anos: 3,
  alavancagem_saudavel: 3.5,
  alavancagem_maxima: 5.0,
  prazo_maximo_aprovado: 90,
  prazo_maximo_condicional: 60,
  concentracao_max_sacado: 20,
  fator_limite_base: 0.5,
  revisao_aprovado_dias: 90,
  revisao_condicional_dias: 60,
  protestos_max: 2,
  processos_passivos_max: 15,
  scr_vencidos_max_pct: 10,
};

// ── Credit Limit Result ────────────────────────────────────────────────────────
export interface CreditLimitResult {
  classificacao: "APROVADO" | "CONDICIONAL" | "REPROVADO";
  limiteAjustado: number;
  limiteBase: number;
  fmmBase: number;
  fatorBase: number;
  fatorReducao: number;
  prazo: number;
  revisaoDias: number;
  dataRevisao: string; // ISO string
  concentracaoMaxPct: number;
  limiteConcentracao: number;
  presetName: string;
}

// ── Fund Presets ───────────────────────────────────────────────────────────────
export interface FundPreset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color: string;
  fmm_minimo: number;
  idade_minima_anos: number;
  alavancagem_saudavel: number;
  alavancagem_maxima: number;
  prazo_maximo_aprovado: number;
  prazo_maximo_condicional: number;
  concentracao_max_sacado: number;
  fator_limite_base: number;
  revisao_aprovado_dias: number;
  revisao_condicional_dias: number;
  protestos_max: number;
  processos_passivos_max: number;
  scr_vencidos_max_pct: number;
  created_at?: string;
  updated_at?: string;
}

export const PRESET_COLORS = ["#203b88", "#73b815", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#0f766e", "#be185d"];

export const PRESET_TEMPLATES: Array<Omit<FundPreset, "id" | "user_id">> = [
  {
    name: "Conservador", description: "Critérios rigorosos — menor risco", color: "#203b88",
    fmm_minimo: 500000, idade_minima_anos: 5, alavancagem_saudavel: 2, alavancagem_maxima: 3.5,
    prazo_maximo_aprovado: 60, prazo_maximo_condicional: 30, concentracao_max_sacado: 15,
    fator_limite_base: 0.3, revisao_aprovado_dias: 60, revisao_condicional_dias: 30,
    protestos_max: 0, processos_passivos_max: 5, scr_vencidos_max_pct: 3,
  },
  {
    name: "Moderado", description: "Equilíbrio entre risco e rentabilidade", color: "#73b815",
    fmm_minimo: 300000, idade_minima_anos: 3, alavancagem_saudavel: 3.5, alavancagem_maxima: 5,
    prazo_maximo_aprovado: 90, prazo_maximo_condicional: 60, concentracao_max_sacado: 20,
    fator_limite_base: 0.5, revisao_aprovado_dias: 90, revisao_condicional_dias: 60,
    protestos_max: 2, processos_passivos_max: 15, scr_vencidos_max_pct: 10,
  },
  {
    name: "Agressivo", description: "Maior tolerância — mais oportunidades", color: "#d97706",
    fmm_minimo: 100000, idade_minima_anos: 1, alavancagem_saudavel: 5, alavancagem_maxima: 8,
    prazo_maximo_aprovado: 180, prazo_maximo_condicional: 120, concentracao_max_sacado: 30,
    fator_limite_base: 0.8, revisao_aprovado_dias: 180, revisao_condicional_dias: 90,
    protestos_max: 5, processos_passivos_max: 30, scr_vencidos_max_pct: 20,
  },
];

// ── Fund Validation Result ─────────────────────────────────────────────────────
export type CriterionStatus = "ok" | "warning" | "error" | "unknown";

export interface FundCriterion {
  id: string;
  label: string;
  threshold: string;
  actual: string;
  status: CriterionStatus;
  eliminatoria: boolean;
  detail?: string;
}

export interface FundValidationResult {
  criteria: FundCriterion[];
  passCount: number;
  warnCount: number;
  failCount: number;
  unknownCount: number;
  hasEliminatoria: boolean;
}
