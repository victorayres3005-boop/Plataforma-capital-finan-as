// ─── Sócio (usado em QSA e Contrato Social) ───
export interface Socio {
  nome: string;
  cpf: string;
  participacao: string;
  qualificacao: string; // ex: Sócio-Administrador, Sócio, Procurador
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
  mes: string;     // "01/2025", "02/2025"
  valor: string;   // "1.234.567,89"
}

export interface FaturamentoData {
  meses: FaturamentoMensal[];
  somatoriaAno: string;
  mediaAno: string;
  faturamentoZerado: boolean;
  dadosAtualizados: boolean;     // false = últimos 60 dias sem dados
  ultimoMesComDados: string;     // "01/2026"
}

// ─── SCR Detalhado ───
export interface SCRModalidade {
  nome: string;
  total: string;
  aVencer: string;
  vencido: string;
  participacao: string; // "86,1%"
}

export interface SCRInstituicao {
  nome: string;
  valor: string;
}

export interface SCRData {
  // Período de referência (ex: "02/2026")
  periodoReferencia: string;
  // Resumo principal (campos do relatório)
  carteiraAVencer: string;
  vencidos: string;
  prejuizos: string;
  limiteCredito: string;
  qtdeInstituicoes: string;
  qtdeOperacoes: string;
  // Detalhamento
  totalDividasAtivas: string;
  operacoesAVencer: string;
  operacoesEmAtraso: string;
  operacoesVencidas: string;
  tempoAtraso: string;
  coobrigacoes: string;
  classificacaoRisco: string;
  // Curto/Longo prazo
  carteiraCurtoPrazo: string;
  carteiraLongoPrazo: string;
  // Tabelas
  modalidades: SCRModalidade[];
  instituicoes: SCRInstituicao[];
  // Outros
  valoresMoedaEstrangeira: string;
  historicoInadimplencia: string;
}

// ─── Dados extraídos consolidados ───
export interface ExtractedData {
  cnpj: CNPJData;
  qsa: QSAData;
  contrato: ContratoSocialData;
  faturamento: FaturamentoData;
  scr: SCRData;
  scrAnterior: SCRData | null;  // SCR do período anterior para comparativo
  resumoRisco: string;
}

// ─── App types ───
export type DocumentType = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr';
export type DocStatus = 'idle' | 'processing' | 'done' | 'error';
export type AppStep = 'upload' | 'review' | 'generate';

// ─── Supabase — Histórico de coletas ───
export interface CollectionDocument {
  type: 'cnpj' | 'qsa' | 'contrato_social' | 'faturamento' | 'scr_bacen' | 'outro';
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
}
