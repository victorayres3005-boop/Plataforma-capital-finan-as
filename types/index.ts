export interface Socio {
  nome: string;
  cpf: string;
  participacao: string;
  qualificacao: string; // ex: Sócio-Administrador, Sócio, Procurador
}

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

export interface ContratoSocialData {
  socios: Socio[];
  capitalSocial: string;
  objetoSocial: string;
  dataConstituicao: string;
  temAlteracoes: boolean;
  prazoDuracao: string;        // determinado/indeterminado
  administracao: string;       // quem administra e poderes
  foro: string;                // comarca/foro eleito
}

export interface SCRData {
  totalDividasAtivas: string;
  operacoesAVencer: string;    // operações a vencer (adimplentes)
  operacoesEmAtraso: string;
  operacoesVencidas: string;   // vencidas há mais de 15 dias
  tempoAtraso: string;
  prejuizo: string;            // créditos baixados como prejuízo
  coobrigacoes: string;        // garantias prestadas
  classificacaoRisco: string;  // rating A-H do Bacen
  modalidadesCredito: string;
  instituicoesCredoras: string;
  concentracaoCredito: string; // % maior credor
  historicoInadimplencia: string;
}

export interface ExtractedData {
  cnpj: CNPJData;
  contrato: ContratoSocialData;
  scr: SCRData;
  resumoRisco: string;
}

export type DocumentType = 'cnpj' | 'contrato' | 'scr';
export type DocStatus = 'idle' | 'processing' | 'done' | 'error';
export type AppStep = 'upload' | 'review' | 'generate';

// Supabase — Histórico de coletas
export interface CollectionDocument {
  type: 'cnpj' | 'scr_bacen' | 'contrato_social' | 'outro';
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
