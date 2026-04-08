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
  passivosTotal: string;
  ativosTotal: string;
  valorTotalEstimado: string;
  temRJ: boolean;
  distribuicao: ProcessoDistribuicao[];
  bancarios: ProcessoBancario[];
  fiscais: ProcessoFiscal[];
  fornecedores: ProcessoFornecedor[];
  outros: ProcessoOutro[];
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
