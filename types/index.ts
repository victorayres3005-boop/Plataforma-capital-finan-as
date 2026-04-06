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
}

// ─── QSA (Quadro de Sócios e Administradores) ───
export interface QSASocio {
  nome: string;
  cpfCnpj: string;
  qualificacao: string;
  participacao: string;
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
  credor: string;
  valor: string;
  regularizado: boolean;
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

export interface ProcessosData {
  passivosTotal: string;
  ativosTotal: string;
  valorTotalEstimado: string;
  temRJ: boolean;
  distribuicao: ProcessoDistribuicao[];
  bancarios: ProcessoBancario[];
  fiscais: ProcessoFiscal[];
  fornecedores: ProcessoFornecedor[];
  outros: ProcessoOutro[];
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
  tipoDocumento?: "recibo" | "declaracao";
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
  segmento: string;
}

export interface CurvaABCData {
  clientes: ClienteCurvaABC[];
  totalClientesNaBase: number;
  totalClientesExtraidos: number;
  periodoReferencia: string;
  receitaTotalBase: string;
  concentracaoTop3: string;
  concentracaoTop5: string;
  maiorCliente: string;
  maiorClientePct: string;
  alertaConcentracao: boolean;
}

// ─── Grupo Econômico ───
export interface EmpresaGrupo {
  razaoSocial: string;
  cnpj: string;
  relacao: string;  // "via Sócio", "Controlada", "Coligada"
  scrTotal: string;
  protestos: string;
  processos: string;
}

export interface GrupoEconomicoData {
  empresas: EmpresaGrupo[];
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
  resumoRisco: string;
}

// ─── App types ───
export type DocumentType = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'protestos' | 'processos' | 'grupoEconomico';
export type DocStatus = 'idle' | 'processing' | 'done' | 'error';
export type AppStep = 'upload' | 'review' | 'generate';

// ─── Supabase — Histórico de coletas ───
export interface CollectionDocument {
  type: 'cnpj' | 'qsa' | 'contrato_social' | 'faturamento' | 'scr_bacen' | 'protestos' | 'processos' | 'grupo_economico' | 'outro';
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
}

// ─── Análise de IA ───
export interface AIAnalysis {
  rating: number;
  ratingMax: number;
  decisao: "APROVADO" | "APROVACAO_CONDICIONAL" | "PENDENTE" | "REPROVADO";
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
};
