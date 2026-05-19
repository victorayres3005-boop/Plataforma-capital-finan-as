"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, Info, GitCompareArrows, Receipt, Scale, PieChart, FileKey, ClipboardList, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import UploadArea from "./UploadArea";
import OnboardingTooltip from "./OnboardingTooltip";
import { useTooltips } from "@/lib/useTooltips";
import { CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData, SCRSocioData, ProtestosData, ProcessosData, GrupoEconomicoData, ExtractedData, IRSocioData, CollectionDocument, CenprotData } from "@/types";
import { upload } from "@vercel/blob/client";
import { mergeQsaWithContrato } from "@/lib/mergeQsaWithContrato";
import { toast } from "sonner";

// ─── Types ───

export type DocKey = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'scrAnterior' | 'scr_socio' | 'scr_socio_anterior' | 'dre' | 'balanco' | 'curva_abc' | 'ir_socio' | 'relatorio_visita' | 'divida_ativa' | 'cenprot' | 'gefip';

interface SectionState {
  files: File[];
  processing: boolean;
  processedCount: number;
  errorCount: number;
  errorType?: "quota" | "parse" | "empty" | "unknown";
  errorMessage?: string;
  retrying?: boolean;
  lastFailedFile?: File;
  lastSuccessFile?: File;
  fromCache?: boolean;
  resumedFilenames?: string[]; // filenames from a resumed collection
  // URLs do Vercel Blob dos arquivos originais (paralelo a resumedFilenames).
  // Permite "Reprocessar extração" em coletas retomadas — sem File em memória,
  // baixamos o blob e re-disparamos a extração.
  resumedBlobUrls?: string[];
}

// ─── Fila global de extração — evita estouro de quota (RPM) no Gemini ───
// Flash free tier: 15 RPM → 4s entre chamadas suficiente.
// Backend já trata 429 com backoff — delay aqui só previne rajadas.
// Primeira chamada da fila é imediata; as demais esperam EXTRACT_DELAY_MS.
const EXTRACT_DELAY_MS = 4000;
let extractQueue: Promise<unknown> = Promise.resolve();
let extractPending = 0;

function enqueueExtract(fn: () => Promise<unknown>): Promise<unknown> {
  const needsDelay = extractPending > 0;
  extractPending++;
  const prev = extractQueue;
  const next = prev.then(async () => {
    if (needsDelay) await new Promise(r => setTimeout(r, EXTRACT_DELAY_MS));
    try {
      return await fn();
    } finally {
      extractPending = Math.max(0, extractPending - 1);
    }
  });
  extractQueue = next.catch(() => {});
  return next;
}

// Lê resposta SSE do /api/extract e retorna o payload do evento "result"
async function readExtractSSE(res: Response): Promise<Record<string, unknown>> {
  if (!res.body) throw new Error("Sem corpo na resposta");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.split("\n");
        let event = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (event === "status" && data) {
          try { console.log(`[extract][SSE] status:`, JSON.parse(data)); } catch { /* ignore */ }
        }
        if ((event === "result" || event === "error") && data) {
          try { reader.cancel(); } catch { /* ignore */ }
          return JSON.parse(data) as Record<string, unknown>;
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
  }
  throw new Error("Stream encerrado sem resultado");
}


export interface OriginalFiles {
  cnpj: File[];
  qsa: File[];
  contrato: File[];
  faturamento: File[];
  scr: File[];
  scrAnterior: File[];
  scr_socio: File[];
  scr_socio_anterior: File[];
  dre: File[];
  balanco: File[];
  curva_abc: File[];
  ir_socio: File[];
  relatorio_visita: File[];
  divida_ativa: File[];
  cenprot: File[];
  gefip: File[];
}

// ─── Defaults ───

const defaultCNPJ: CNPJData = { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" };
const defaultQSA: QSAData = { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] };
const defaultContrato: ContratoSocialData = { socios:[],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" };
const defaultFaturamento: FaturamentoData = { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" };
const defaultSCR: SCRData = { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" };
const defaultProtestos: ProtestosData = { vigentesQtd:"",vigentesValor:"",regularizadosQtd:"",regularizadosValor:"",detalhes:[] };
const defaultProcessos: ProcessosData = { passivosTotal:"",ativosTotal:"",valorTotalEstimado:"",temRJ:false,distribuicao:[],bancarios:[],fiscais:[],fornecedores:[],outros:[] };
const defaultGrupoEconomico: GrupoEconomicoData = { empresas:[] };

// ─── Merge logic ───

// Chaves naturais para dedupe de arrays em merge (evita duplicar socios/clientes/empresas)
const ARRAY_DEDUPE_KEYS: Record<string, string[]> = {
  quadroSocietario: ["cpfCnpj", "nome"],
  socios: ["cpf", "nome"],
  meses: ["mes"],
  empresas: ["cnpj", "razaoSocial"],
  detalhes: ["numero", "data"],
  distribuicao: ["tipo"],
  clientes: ["cnpj", "nome"],
  anos: ["ano"],
  top10Recentes: ["numero"],
  bancarios: ["nome", "numero"],
  modalidades: ["nome"],
  instituicoes: ["nome"],
};

function dedupeArray(key: string, arr: unknown[]): unknown[] {
  const idKeys = ARRAY_DEDUPE_KEYS[key];
  if (!idKeys) return arr; // sem chave natural — retorna como esta
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") { out.push(item); continue; }
    const obj = item as Record<string, unknown>;
    const id = idKeys.map(k => String(obj[k] || "")).join("|").trim();
    if (!id || id === new Array(idKeys.length).fill("").join("|")) { out.push(item); continue; }
    if (seen.has(id)) continue; // duplicata
    seen.add(id);
    out.push(item);
  }
  return out;
}

export function mergeData(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value) && Array.isArray(result[key])) {
      // Arrays: concatena + deduplica por chave natural quando existe
      const combined = [...(result[key] as unknown[]), ...value];
      result[key] = dedupeArray(key, combined);
    } else if (Array.isArray(value)) {
      // Novo array sobrescreve — aplica dedupe mesmo assim
      result[key] = dedupeArray(key, value);
    } else if (typeof value === "string") {
      // String: incoming ganha SEMPRE, exceto quando incoming vazio E existing tem algo
      const existingStr = typeof result[key] === "string" ? (result[key] as string) : "";
      if (value.length > 0 || existingStr.length === 0) {
        result[key] = value;
      }
    } else if (typeof value === "boolean") {
      // Boolean: incoming sempre ganha (inclui false como informacao valida)
      result[key] = value;
    } else if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

// ─── Section config ───

interface SectionConfig {
  key: DocKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  stepNumber: string;
  required: boolean;
}

const SECTIONS: SectionConfig[] = [
  { key: 'cnpj',        title: 'Cartão CNPJ',                       description: 'Dados obtidos automaticamente via API — upload opcional para nome fantasia e CNAEs secundários', icon: <Building2 size={19} />, stepNumber: '▿', required: false },
  { key: 'qsa',         title: 'QSA',                               description: 'Obtido automaticamente via API — upload opcional para enriquecer dados dos sócios',            icon: <Users size={19} />,            stepNumber: '▿', required: false },
  { key: 'contrato',    title: 'Contrato Social',                   description: 'Contrato ou Estatuto Social — consolidado ou última alteração',   icon: <ScrollText size={19} />,       stepNumber: '3', required: true },
  { key: 'faturamento', title: 'Faturamento',                       description: 'Relatório de faturamento mensal — PDF ou planilha Excel (.xlsx)', icon: <TrendingUp size={19} />,       stepNumber: '4', required: true },
  // SCR removido: consultado automaticamente via DataBox360 (API BCB)
  { key: 'dre',              title: 'DRE — Demonstração de Resultado',   description: 'Demonstração de resultado dos últimos 2-3 anos',                 icon: <Receipt size={19} />,          stepNumber: '▿', required: false },
  { key: 'balanco',          title: 'Balanço Patrimonial',               description: 'Balanço dos últimos 2-3 anos',                                   icon: <Scale size={19} />,            stepNumber: '▿', required: false },
  { key: 'curva_abc',        title: 'Curva ABC — Top Clientes',          description: 'Carteira de clientes com concentração de receita',               icon: <PieChart size={19} />,         stepNumber: '▿', required: false },
  { key: 'ir_socio',         title: 'IR dos Sócios (opcional)',          description: 'Declaração de imposto de renda dos sócios',                      icon: <FileKey size={19} />,          stepNumber: '▿', required: false },
  { key: 'relatorio_visita', title: 'Relatório de Visita',               description: 'Relatório da visita presencial à empresa',                       icon: <ClipboardList size={19} />,    stepNumber: '▿', required: false },
  // Dívida Ativa re-adicionada 2026-05-12: BDC government_debtors continua
  // sendo consultado, mas o upload de PGFN/print do listadevedores vira fonte
  // autoritativa e gera comparativo cruzado no relatório (ver tipo dividaAtivaBDC).
  { key: 'divida_ativa',     title: 'Dívida Ativa — PGFN',               description: 'Certidão ou print do listadevedores.pgfn.gov.br (PGFN é fonte oficial — cruza com BDC)', icon: <FileKey size={19} />, stepNumber: '▿', required: false },
  { key: 'cenprot',          title: 'CENPROT — Central de Protestos',    description: 'Certidão oficial do IEPTB-BR',                                  icon: <FileKey size={19} />,          stepNumber: '▿', required: false },
  { key: 'gefip',            title: 'GEFIP / FGTS / INSS',               description: 'Recolhimentos previdenciários e trabalhistas',                  icon: <Receipt size={19} />,          stepNumber: '▿', required: false },
];

const REQUIRED_KEYS: DocKey[] = ['contrato', 'faturamento'];

// ─── GroupHeader ───

function GroupHeader({ label, count, total, optional }: { label: string; count?: number; total?: number; optional?: boolean }) {
  const done = count ?? 0;
  const all  = total ?? 0;
  const allDone = !optional && done === all && all > 0;
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div className="flex-1 h-px bg-cf-border" />
      {!optional ? (
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 10px", borderRadius: "99px", flexShrink: 0,
          background: allDone ? "#dcfce7" : "#F1F5F9",
          color: allDone ? "#15803d" : "#64748B",
          transition: "background 0.3s, color 0.3s",
        }}>
          {done}/{all} enviados
        </span>
      ) : (
        <span style={{ fontSize: "10px", fontWeight: 500, color: "#94A3B8", flexShrink: 0 }}>opcional</span>
      )}
    </div>
  );
}

// ─── Component ───

// Goalfy doc_type → DocKey (para highlight via URL param)
const GOALFY_TYPE_TO_KEY: Partial<Record<string, DocKey>> = {
  contrato_social: 'contrato', faturamento: 'faturamento',
  scr: 'scr', dre: 'dre', balanco: 'balanco', curva_abc: 'curva_abc',
  qsa: 'qsa', ir_socio: 'ir_socio', relatorio_visita: 'relatorio_visita',
  contrato: 'contrato',
};

// Mapa de tipo de CollectionDocument para DocKey do UploadStep
const DOC_TYPE_TO_KEY: Record<string, DocKey | null> = {
  cnpj: 'cnpj', qsa: 'qsa', contrato_social: 'contrato', faturamento: 'faturamento',
  scr_bacen: 'scr', scr_socio: 'scr_socio', scr_socio_anterior: 'scr_socio_anterior', dre: 'dre', balanco: 'balanco', curva_abc: 'curva_abc',
  ir_socio: 'ir_socio', relatorio_visita: 'relatorio_visita',
  divida_ativa: 'divida_ativa', cenprot: 'cenprot', gefip: 'gefip',
  protestos: null, processos: null, grupo_economico: null, outro: null,
};

function buildInitialSections(resumedDocs: CollectionDocument[]): Record<DocKey, SectionState> {
  const empty = (): SectionState => ({ files: [], processing: false, processedCount: 0, errorCount: 0 });
  const sections: Record<DocKey, SectionState> = {
    cnpj: empty(), qsa: empty(), contrato: empty(), faturamento: empty(),
    scr: empty(), scrAnterior: empty(), scr_socio: empty(), scr_socio_anterior: empty(), dre: empty(), balanco: empty(),
    curva_abc: empty(), ir_socio: empty(), relatorio_visita: empty(),
    divida_ativa: empty(), cenprot: empty(), gefip: empty(),
  };

  const scrDocs = resumedDocs.filter(d => d.type === 'scr_bacen');

  // Separa SCR da empresa (PJ) dos SCR de sócios (PF).
  // tipoPessoa é definido em buildCollectionDocs.ts; fallback pelo filename para registros antigos.
  const scrPJ = scrDocs.filter(d => {
    const tp = (d.extracted_data as Record<string, unknown>)?.tipoPessoa;
    if (tp === 'PJ') return true;
    if (tp === 'PF') return false;
    // Registros antigos sem tipoPessoa: se filename contém "socio" é PF, caso contrário PJ
    return !String(d.filename ?? '').includes('socio');
  });
  const scrPF_atual = scrDocs.filter(d => {
    const tp = (d.extracted_data as Record<string, unknown>)?.tipoPessoa;
    if (tp !== 'PF' && !String(d.filename ?? '').includes('socio')) return false;
    return !String(d.filename ?? '').includes('anterior');
  });
  const scrPF_anterior = scrDocs.filter(d => {
    const tp = (d.extracted_data as Record<string, unknown>)?.tipoPessoa;
    if (tp !== 'PF' && !String(d.filename ?? '').includes('socio')) return false;
    return String(d.filename ?? '').includes('anterior');
  });

  for (const doc of resumedDocs) {
    if (doc.type === 'scr_bacen') continue; // handle separately
    const key = DOC_TYPE_TO_KEY[doc.type];
    if (!key) continue;
    sections[key].processedCount += 1;
    sections[key].resumedFilenames = [...(sections[key].resumedFilenames || []), doc.filename];
    sections[key].resumedBlobUrls  = [...(sections[key].resumedBlobUrls  || []), doc.blob_url || ""];
  }

  // SCR empresa (PJ): primeiro → scr, segundo → scrAnterior
  if (scrPJ.length >= 1) {
    sections.scr.processedCount = 1;
    sections.scr.resumedFilenames = [scrPJ[0].filename];
    sections.scr.resumedBlobUrls  = [scrPJ[0].blob_url || ""];
  }
  if (scrPJ.length >= 2) {
    sections.scrAnterior.processedCount = 1;
    sections.scrAnterior.resumedFilenames = [scrPJ[1].filename];
    sections.scrAnterior.resumedBlobUrls  = [scrPJ[1].blob_url || ""];
  }

  // SCR sócios (PF): um slot por tipo, pode ter múltiplos arquivos
  if (scrPF_atual.length > 0) {
    sections.scr_socio.processedCount = scrPF_atual.length;
    sections.scr_socio.resumedFilenames = scrPF_atual.map(d => d.filename);
    sections.scr_socio.resumedBlobUrls  = scrPF_atual.map(d => d.blob_url || "");
  }
  if (scrPF_anterior.length > 0) {
    sections.scr_socio_anterior.processedCount = scrPF_anterior.length;
    sections.scr_socio_anterior.resumedFilenames = scrPF_anterior.map(d => d.filename);
    sections.scr_socio_anterior.resumedBlobUrls  = scrPF_anterior.map(d => d.blob_url || "");
  }

  return sections;
}

function formatarCNPJ(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

export default function UploadStep({
  onComplete,
  resumedDocs,
  initialData,
  onDataChange,
  highlightKeys,
  onRemoveResumedFile,
}: {
  onComplete: (data: ExtractedData, files: OriginalFiles, processedDocs?: CollectionDocument[]) => void;
  resumedDocs?: CollectionDocument[];
  initialData?: ExtractedData;
  onDataChange?: (data: ExtractedData) => void;
  highlightKeys?: string[];
  /**
   * Excluir definitivamente um arquivo já persistido (retomado) — recebe
   * tipo lógico (DocKey) e nome do arquivo. Implementado pelo page.tsx,
   * que faz UPDATE no document_collections removendo a entrada do array
   * `documents` e ajusta confirmedDocsRef pra evitar reaparição.
   * Retorna `true` se removeu com sucesso.
   */
  onRemoveResumedFile?: (type: DocKey, filename: string) => Promise<boolean>;
}) {
  const [sections, setSections] = useState<Record<DocKey, SectionState>>(() =>
    resumedDocs && resumedDocs.length > 0 ? buildInitialSections(resumedDocs) : {
      cnpj:        { files: [], processing: false, processedCount: 0, errorCount: 0 },
      qsa:         { files: [], processing: false, processedCount: 0, errorCount: 0 },
      contrato:    { files: [], processing: false, processedCount: 0, errorCount: 0 },
      faturamento: { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scr:              { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scrAnterior:      { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scr_socio:        { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scr_socio_anterior: { files: [], processing: false, processedCount: 0, errorCount: 0 },
      dre:              { files: [], processing: false, processedCount: 0, errorCount: 0 },
      balanco:          { files: [], processing: false, processedCount: 0, errorCount: 0 },
      curva_abc:        { files: [], processing: false, processedCount: 0, errorCount: 0 },
      ir_socio:         { files: [], processing: false, processedCount: 0, errorCount: 0 },
      relatorio_visita: { files: [], processing: false, processedCount: 0, errorCount: 0 },
      divida_ativa:     { files: [], processing: false, processedCount: 0, errorCount: 0 },
      cenprot:          { files: [], processing: false, processedCount: 0, errorCount: 0 },
      gefip:            { files: [], processing: false, processedCount: 0, errorCount: 0 },
    }
  );

  const [extracted, setExtracted] = useState<ExtractedData>(initialData ? { ...initialData } : {
    cnpj: defaultCNPJ,
    qsa: defaultQSA,
    contrato: defaultContrato,
    faturamento: defaultFaturamento,
    scr: defaultSCR,
    scrAnterior: null,
    protestos: defaultProtestos,
    processos: defaultProcessos,
    grupoEconomico: defaultGrupoEconomico,
    resumoRisco: "",
  });

  // Use a ref so the processing function always sees the latest extracted data
  const extractedRef = useRef(extracted);
  extractedRef.current = extracted;

  // Notifica o pai a cada mudanca em `extracted` para auto-save no Supabase.
  // Pulamos a primeira execucao quando initialData ja foi passado (evita
  // re-salvar imediatamente uma coleta retomada).
  const skipFirstDataChange = useRef(!!initialData);
  useEffect(() => {
    if (skipFirstDataChange.current) { skipFirstDataChange.current = false; return; }
    onDataChange?.(extracted);
  }, [extracted, onDataChange]);

  const { isSeen, markSeen } = useTooltips();

  // ── Bureau state ──
  const [bureauStatus, setBureauStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [bureauDetail, setBureauDetail] = useState<Record<string, { success: boolean; mock: boolean; error?: string }>>({});

  const highlightedSet = useMemo(() => {
    if (!highlightKeys || highlightKeys.length === 0) return new Set<DocKey>();
    return new Set(highlightKeys.map(k => GOALFY_TYPE_TO_KEY[k]).filter(Boolean) as DocKey[]);
  }, [highlightKeys]);

  const sectionRefs = useRef<Partial<Record<DocKey, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (highlightedSet.size === 0) return;
    const timer = setTimeout(() => {
      const firstKey = SECTIONS.find(s => highlightedSet.has(s.key))?.key;
      if (firstKey) sectionRefs.current[firstKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bureauTriggered = useRef(false);
  const qsaBureauTriggered = useRef(false);

  // CNPJ input manual — dispara bureaus sem precisar fazer upload do Cartão CNPJ
  const [cnpjInput, setCnpjInput] = useState(() =>
    formatarCNPJ((initialData?.cnpj?.cnpj || "").replace(/\D/g, ""))
  );
  const cnpjConfirmado = extracted.cnpj?.cnpj?.replace(/\D/g, "").length === 14;

  const handleCnpjConfirm = useCallback(() => {
    const digits = cnpjInput.replace(/\D/g, "");
    if (digits.length !== 14) return;
    setExtracted(e => ({ ...e, cnpj: { ...e.cnpj, cnpj: digits } }));
  }, [cnpjInput]);

  // Auto-trigger bureaus when CNPJ is extracted
  useEffect(() => {
    const cnpj = extracted.cnpj?.cnpj;
    if (!cnpj || bureauTriggered.current) return;
    bureauTriggered.current = true;
    setBureauStatus("loading");

    (async () => {
      try {
        // CreditHub é consultado server-side via CREDITHUB_API_KEY (env var).
        // O servidor já tem loop de retry em lib/bureaus/credithub.ts.
        console.log("[bureaus] iniciando consulta BDC + CreditHub + demais bureaus...");
        const res = await fetch("/api/bureaus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj, data: extractedRef.current }),
        });
        if (!res.ok) {
          console.warn(`[bureaus] HTTP ${res.status} — resposta não-JSON`);
          setBureauStatus("error");
          return;
        }
        const json = await res.json();
        console.log(`[bureaus] resposta: success=${json.success} | bureaus=${Object.keys(json.bureaus ?? {}).join(",")} | mock=${Object.entries(json.bureaus ?? {}).filter(([,v]: any) => v?.mock).map(([k]) => k).join(",") || "nenhum"}`);
        if (json.success && json.merged) {
          setExtracted(prev => mergeData(prev as unknown as Record<string, unknown>, json.merged as Record<string, unknown>) as unknown as ExtractedData);
        }
        if (json.bureaus) setBureauDetail(json.bureaus);
        setBureauStatus(json.success ? "done" : "error");
      } catch (err) {
        console.warn("[upload] erro ao consultar birôs:", err);
        setBureauStatus("error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extracted.cnpj?.cnpj]);

  // Merge QSA ← Contrato Social: sempre que ambos estão presentes, contrato
  // sobrescreve cpfCnpj/qualificacao/participacao/capitalInvestido nos sócios
  // do QSA. Sócios extras do contrato são adicionados ao QSA. Decisão tomada
  // com Victor 2026-05-04 — contrato é fonte mais confiável que Receita.
  useEffect(() => {
    const qsa = extracted.qsa;
    const contrato = extracted.contrato;
    if (!qsa || !contrato || !contrato.socios || contrato.socios.length === 0) return;
    const { qsa: mergedQsa, mergeMap } = mergeQsaWithContrato(qsa, contrato);
    // Idempotente: só atualiza state se realmente mudou (evita loop infinito).
    const changed =
      JSON.stringify(mergedQsa.quadroSocietario) !== JSON.stringify(qsa.quadroSocietario) ||
      JSON.stringify(mergeMap) !== JSON.stringify(extracted._qsaMergeMap || {});
    if (!changed) return;
    setExtracted(prev => ({ ...prev, qsa: mergedQsa, _qsaMergeMap: mergeMap }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extracted.qsa?.quadroSocietario, extracted.contrato?.socios]);

  // Re-call bureaus after QSA is extracted — SCR dos sócios precisa dos CPFs do QSA,
  // que não estão disponíveis no momento do primeiro disparo (CNPJ extraído antes do QSA).
  useEffect(() => {
    if (qsaBureauTriggered.current) return;
    if (bureauStatus !== "done") return;

    const socios = extracted.qsa?.quadroSocietario ?? [];
    const pfSocios = socios.filter(s => s.cpfCnpj?.replace(/\D/g, "").length === 11);
    if (pfSocios.length === 0) return;

    const scrJaPopulado = (extracted.scrSocios ?? []).length > 0;
    if (scrJaPopulado) return;

    qsaBureauTriggered.current = true;
    const cnpj = extracted.cnpj?.cnpj;
    if (!cnpj) return;

    console.log(`[bureaus-qsa] QSA disponível (${pfSocios.length} sócios PF) após bureau inicial — re-consultando para SCR dos sócios`);

    // Volta o status para "loading" enquanto a re-consulta roda. Sem isto, o usuário
    // poderia clicar "Prosseguir" antes de esta promise resolver, desmontar o UploadStep
    // e perder o setExtracted({ scrSocios }) que vem depois.
    setBureauStatus("loading");

    (async () => {
      try {
        const res = await fetch("/api/bureaus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj, data: extractedRef.current }),
        });
        if (!res.ok) {
          console.warn(`[bureaus-qsa] HTTP ${res.status}`);
          return;
        }
        const json = await res.json();
        console.log(`[bureaus-qsa] resposta: success=${json.success} | scrSocios=${json.merged?.scrSocios?.length ?? 0}`);
        if (json.success && json.merged?.scrSocios?.length > 0) {
          setExtracted(prev => ({ ...prev, scrSocios: json.merged.scrSocios }));
        }
        if (json.bureaus) setBureauDetail(prev => ({ ...prev, ...json.bureaus }));
      } catch (err) {
        console.warn("[bureaus-qsa] erro na re-consulta:", err);
      } finally {
        setBureauStatus("done");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bureauStatus, extracted.qsa?.quadroSocietario]);

  const processFiles = useCallback(async (type: DocKey, newFiles: File[]) => {
    // Add files to state and mark processing
    setSections(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        files: [...prev[type].files, ...newFiles],
        processing: true,
      },
    }));

    const apiType = type === 'scrAnterior' || type === 'scr_socio' || type === 'scr_socio_anterior' ? 'scr' : type;

    const BLOB_THRESHOLD = 4 * 1024 * 1024; // 4 MB
    // Vercel Blob rejeita pathnames com caracteres fora de a-z/0-9/-/_/./.
    // Contratos sociais frequentemente têm nomes como "Contrato Social - 3ª Alteração.pdf".
    const sanitizeBlobName = (name: string): string => {
      const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
      const base = name.slice(0, name.length - ext.length)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove acentos
        .replace(/[^a-zA-Z0-9._-]+/g, "_")                  // substitui especiais por _
        .replace(/_+/g, "_").replace(/^_|_$/g, "");         // limpa underscores extras
      const safeBase = base || "file";
      // Prefixo com timestamp para evitar colisões
      return `${Date.now()}-${safeBase}${ext.toLowerCase()}`;
    };

    for (const file of newFiles) {
      try {
        const json = await enqueueExtract(async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120000);

          let res: Response;
          if (file.size > BLOB_THRESHOLD) {
            const blob = await upload(sanitizeBlobName(file.name), file, {
              access: "public",
              handleUploadUrl: "/api/upload-blob",
            });
            res = await fetch("/api/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ blobUrl: blob.url, type: apiType, slot: type, fileName: file.name }),
              signal: controller.signal,
            });
          } else {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("type", apiType);
            // Hint de slot — servidor usa pra forcar tipoPessoa='PF' em SCR de socio
            fd.append("slot", type);
            res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
          }
          clearTimeout(timeout);
          const isSSE = res.headers.get("content-type")?.includes("text/event-stream");
          const result = isSSE ? await readExtractSSE(res) : await res.json();
          // Anexa status HTTP para checagem posterior
          (result as Record<string, unknown>).__resOk = res.ok;
          const _m = result.meta as Record<string,unknown> | undefined;
          console.log(`[extract][${apiType}] status=${res.status} isSSE=${isSSE} success=${result.success} aiError=${_m?.aiError} filledFields=${_m?.filledFields} errorType=${_m?.errorType} errorMsg=${_m?.errorMessage} isScanned=${_m?.isScanned} textLen=${_m?.rawTextLength}`);
          console.log(`[extract][${apiType}] data keys:`, result.data ? Object.keys(result.data as object).slice(0, 10) : "NO DATA");
          return result;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any;
        const resOk = json.__resOk !== false;
        const meta = json.meta as Record<string, unknown> | undefined;
        // Extração "silenciosa": Gemini respondeu sem erro mas não preencheu nada
        // (PDF mal parseado, scan ruim, página em branco). Trata como erro visível.
        const filledFields = (meta?.filledFields as number | undefined) ?? -1;
        const isEmptyExtraction = filledFields === 0;

        const isScanned = meta?.isScanned === true || (json.error as string || "").includes("escaneado");
        if (!resOk || !json.success || meta?.aiError || isEmptyExtraction) {
          const errMsg = isScanned
            ? "PDF escaneado (sem texto selecionável). Envie a versão digital ou converta com OCR antes de enviar."
            : isEmptyExtraction
              ? "Nenhum campo foi extraído do documento. Verifique se o PDF está legível ou tente outro arquivo."
              : (meta?.errorMessage as string || json.error as string || "");
          setSections(prev => ({
            ...prev,
            [type]: {
              ...prev[type],
              errorCount: prev[type].errorCount + 1,
              errorType: isScanned ? "scanned" : (meta?.errorType as string || (isEmptyExtraction ? "empty" : (resOk ? "unknown" : "quota"))),
              errorMessage: errMsg,
              lastFailedFile: file,
            },
          }));
          continue;
        }

        // Merge the incoming data
        setExtracted(prev => {
          if (type === 'scrAnterior') {
            const currentData = prev.scrAnterior;
            if (currentData === null) return { ...prev, scrAnterior: json.data as SCRData };
            return { ...prev, scrAnterior: mergeData(currentData as unknown as Record<string, unknown>, json.data as Record<string, unknown>) as unknown as SCRData };
          }
          if (type === 'scr_socio') {
            const scrData = json.data as SCRData;
            const novoSocio: SCRSocioData = {
              nomeSocio: scrData.nomeCliente || scrData.cpfSCR || 'Socio',
              cpfSocio: scrData.cpfSCR || '',
              tipoPessoa: 'PF',
              periodoAtual: scrData,
            };
            return { ...prev, scrSocios: [...(prev.scrSocios || []), novoSocio] };
          }
          if (type === 'scr_socio_anterior') {
            const scrData = json.data as SCRData;
            // Route anterior data to the matching socio's periodoAnterior
            const socios = [...(prev.scrSocios || [])];
            const cpf = scrData.cpfSCR || '';
            const nome = scrData.nomeCliente || '';
            const idx = socios.findIndex(s =>
              (cpf && s.cpfSocio === cpf) || (nome && s.nomeSocio === nome)
            );
            if (idx >= 0) {
              socios[idx] = { ...socios[idx], periodoAnterior: scrData };
            } else {
              // No matching socio found — create a new entry with only periodoAnterior
              socios.push({
                nomeSocio: nome || cpf || 'Socio',
                cpfSocio: cpf,
                tipoPessoa: 'PF',
                periodoAtual: {} as SCRData,
                periodoAnterior: scrData,
              });
            }
            return { ...prev, scrSocios: socios };
          }
          if (type === 'ir_socio') {
            return { ...prev, irSocios: [...(prev.irSocios || []), json.data as IRSocioData] };
          }

          // ── SCR: rotear PF → scrSocios[], PJ → scr ──
          if (type === 'scr') {
            const scrData = json.data as SCRData;
            const isPF = scrData.tipoPessoa === 'PF' ||
              (!scrData.tipoPessoa && !!scrData.cpfSCR && !scrData.cnpjSCR);
            if (isPF) {
              const novoSocio: SCRSocioData = {
                nomeSocio: scrData.nomeCliente || scrData.cpfSCR || 'Sócio',
                cpfSocio: scrData.cpfSCR || '',
                tipoPessoa: 'PF',
                periodoAtual: scrData,
                ...(json.scrAnterior ? { periodoAnterior: json.scrAnterior as SCRData } : {}),
              };
              return { ...prev, scrSocios: [...(prev.scrSocios || []), novoSocio] };
            }
            const scrAtualizado = prev.scr
              ? mergeData(prev.scr as unknown as Record<string, unknown>, scrData as unknown as Record<string, unknown>) as unknown as SCRData
              : scrData;
            const extra: Partial<ExtractedData> = json.scrAnterior
              ? { scrAnterior: json.scrAnterior as SCRData }
              : {};
            return { ...prev, scr: scrAtualizado, ...extra };
          }

          const fieldMap: Partial<Record<DocKey, keyof ExtractedData>> = {
            curva_abc: 'curvaABC',
            relatorio_visita: 'relatorioVisita',
          };
          const field = (fieldMap[type] ?? type) as keyof ExtractedData;
          const currentData = prev[field];
          const updated: Record<string, unknown> = {
            ...prev,
            [field]: currentData
              ? mergeData(currentData as unknown as Record<string, unknown>, json.data as Record<string, unknown>)
              : json.data,
          };
          // QSA auto-detectado no Cartão CNPJ: popula o QSA se ainda vazio
          if (type === 'cnpj' && json.qsaDetectado) {
            const qsaDetectado = json.qsaDetectado as QSAData;
            const qsaAtual = prev.qsa;
            const temQsa = qsaAtual && Array.isArray(qsaAtual.quadroSocietario) && qsaAtual.quadroSocietario.filter((s) => s.nome).length > 0;
            if (!temQsa) {
              updated.qsa = qsaDetectado;
              console.log('[upload] QSA auto-detectado no Cartão CNPJ:', qsaDetectado.quadroSocietario.length, 'sócios');
            }
          }
          // CENPROT é autoritativo para protestos: sobrepõe qualquer dado de bureau
          // que tenha chegado antes (bureau pode reportar número diferente do oficial).
          if (type === 'cenprot' && json.data) {
            const cen = json.data as CenprotData;
            if (cen.qtdRegistros > 0 || cen.certidaoNegativa) {
              updated.protestos = {
                vigentesQtd: String(cen.qtdRegistros),
                vigentesValor: cen.valorTotal || "R$ 0,00",
                regularizadosQtd: "",
                regularizadosValor: "",
                detalhes: (cen.registros ?? []).map(r => ({
                  data: r.data || "",
                  credor: r.cartorio || r.cedente || "",
                  valor: r.valor || "",
                  regularizado: ["regularizado", "cancelado", "pago"].includes((r.status ?? "").toLowerCase()),
                  especie: r.tipoTitulo,
                  numero: r.protocolo,
                  apresentante: r.cedente,
                  municipio: r.cidade,
                  uf: r.uf,
                })),
              } as ProtestosData;
              console.log('[upload] CENPROT → protestos sincronizado:', cen.qtdRegistros, 'registro(s)');
            }
          }
          return updated as unknown as typeof prev;
        });

        setSections(prev => ({
          ...prev,
          [type]: {
            ...prev[type],
            processedCount: prev[type].processedCount + 1,
            lastSuccessFile: file,
            fromCache: meta?.cached === true,
          },
        }));
      } catch (catchErr) {
        const catchMsg = catchErr instanceof Error ? catchErr.message : String(catchErr);
        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], errorCount: prev[type].errorCount + 1, lastFailedFile: file, errorType: "unknown", errorMessage: catchMsg },
        }));
      }
    }

    // Done processing all files in this batch
    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], processing: false },
    }));
  }, []);

  const handleReprocess = useCallback(async (type: DocKey) => {
    const section = sections[type];
    if (!section) return;

    let filesToReprocess: File[] = [...section.files];

    // Caso de retomada: arquivos não estão em memória — baixa do Vercel Blob
    // usando a URL salva em CollectionDocument.blob_url. Se a coleta foi
    // criada antes do blob_url existir, os URLs vêm vazios e o reprocessar
    // falha com mensagem clara em vez de silenciosamente não fazer nada.
    if (filesToReprocess.length === 0) {
      const urls = (section.resumedBlobUrls || []).filter(u => !!u);
      if (urls.length === 0) {
        toast.error("Não há arquivo original disponível para reprocessar (coleta antiga sem blob).");
        return;
      }
      setSections(prev => ({ ...prev, [type]: { ...prev[type], processing: true } }));
      try {
        filesToReprocess = await Promise.all(
          urls.map(async (url, i) => {
            const filename = section.resumedFilenames?.[i] ?? `${type}-${i + 1}.pdf`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Falha ao baixar ${filename}: HTTP ${res.status}`);
            const blob = await res.blob();
            return new File([blob], filename, { type: blob.type || "application/pdf" });
          })
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Não foi possível recuperar arquivo original: ${msg}`);
        setSections(prev => ({ ...prev, [type]: { ...prev[type], processing: false } }));
        return;
      }
    }

    if (filesToReprocess.length === 0) {
      toast.error("Nenhum arquivo para reprocessar.");
      return;
    }

    // Limpa dados antigos do tipo correspondente para evitar duplicação no merge
    setExtracted(prev => {
      const cleared = { ...prev };
      if (type === 'scrAnterior') cleared.scrAnterior = null;
      else if (type === 'scr_socio') cleared.scrSocios = [];
      else if (type === 'scr_socio_anterior') {
        cleared.scrSocios = (cleared.scrSocios || []).map(s => {
          const { periodoAnterior: _u, ...rest } = s; void _u;
          return rest as SCRSocioData;
        });
      }
      else if (type === 'ir_socio') cleared.irSocios = [];
      else if (type === 'scr') {
        cleared.scr = {} as SCRData;
        cleared.scrAnterior = null;
      }
      else {
        const fieldMap: Partial<Record<DocKey, keyof ExtractedData>> = {
          curva_abc: 'curvaABC',
          relatorio_visita: 'relatorioVisita',
          divida_ativa: 'dividaAtiva',
          cenprot: 'cenprot',
          gefip: 'gefip',
        };
        const field = (fieldMap[type] ?? type) as keyof ExtractedData;
        (cleared as unknown as Record<string, unknown>)[field] = undefined;
      }
      return cleared;
    });

    // Reseta contadores e re-roda processFiles com os arquivos
    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], files: [], processedCount: 0, errorCount: 0, errorType: undefined, errorMessage: undefined, lastFailedFile: undefined, resumedFilenames: undefined, resumedBlobUrls: undefined },
    }));
    await processFiles(type, filesToReprocess);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const handleRetry = useCallback(async (type: DocKey) => {
    const section = sections[type];
    if (!section?.lastFailedFile) return;

    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], retrying: true, errorCount: 0, errorType: undefined, errorMessage: undefined },
    }));

    const apiType = type === "scrAnterior" || type === "scr_socio" || type === "scr_socio_anterior" ? "scr" : type;
    const retryFile = section.lastFailedFile;

    try {
      const json = await enqueueExtract(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        let res: Response;
        const sanitizeBlob = (name: string): string => {
          const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
          const base = name.slice(0, name.length - ext.length)
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]+/g, "_")
            .replace(/_+/g, "_").replace(/^_|_$/g, "");
          return `${Date.now()}-${base || "file"}${ext.toLowerCase()}`;
        };
        if (retryFile.size > 4 * 1024 * 1024) {
          const blob = await upload(sanitizeBlob(retryFile.name), retryFile, {
            access: "public",
            handleUploadUrl: "/api/upload-blob",
          });
          res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blobUrl: blob.url, type: apiType, slot: type, fileName: retryFile.name }),
            signal: controller.signal,
          });
        } else {
          const fd = new FormData();
          fd.append("file", retryFile);
          fd.append("type", apiType);
          fd.append("slot", type);
          res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
        }
        clearTimeout(timeout);
        const isSSE = res.headers.get("content-type")?.includes("text/event-stream");
        const result = isSSE ? await readExtractSSE(res) : await res.json();
        (result as Record<string, unknown>).__resOk = res.ok;
        return result;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
      const retryMeta = json.meta as Record<string, unknown> | undefined;

      if (!json.__resOk || !json.success || retryMeta?.aiError) {
        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], retrying: false, errorCount: 1, errorType: retryMeta?.errorType as string || "unknown", errorMessage: retryMeta?.errorMessage as string || "" },
        }));
        return;
      }

      // Success — merge data (retry)
      setExtracted(prev => {
        if (type === "scrAnterior") {
          return { ...prev, scrAnterior: json.data };
        }
        if (type === "scr_socio") {
          const scrData = json.data as SCRData;
          const novoSocio: SCRSocioData = {
            nomeSocio: scrData.nomeCliente || scrData.cpfSCR || 'Socio',
            cpfSocio: scrData.cpfSCR || '',
            tipoPessoa: 'PF',
            periodoAtual: scrData,
          };
          return { ...prev, scrSocios: [...(prev.scrSocios || []), novoSocio] };
        }
        if (type === "scr_socio_anterior") {
          const scrData = json.data as SCRData;
          const socios = [...(prev.scrSocios || [])];
          const cpf = scrData.cpfSCR || '';
          const nome = scrData.nomeCliente || '';
          const idx = socios.findIndex(s =>
            (cpf && s.cpfSocio === cpf) || (nome && s.nomeSocio === nome)
          );
          if (idx >= 0) {
            socios[idx] = { ...socios[idx], periodoAnterior: scrData };
          } else {
            socios.push({
              nomeSocio: nome || cpf || 'Socio',
              cpfSocio: cpf,
              tipoPessoa: 'PF',
              periodoAtual: {} as SCRData,
              periodoAnterior: scrData,
            });
          }
          return { ...prev, scrSocios: socios };
        }
        if (type === "ir_socio") {
          return { ...prev, irSocios: [...(prev.irSocios || []), json.data as IRSocioData] };
        }
        if (type === "scr") {
          const scrData = json.data as SCRData;
          const isPF = scrData.tipoPessoa === 'PF' ||
            (!scrData.tipoPessoa && !!scrData.cpfSCR && !scrData.cnpjSCR);
          if (isPF) {
            const novoSocio: SCRSocioData = {
              nomeSocio: scrData.nomeCliente || scrData.cpfSCR || 'Sócio',
              cpfSocio: scrData.cpfSCR || '',
              tipoPessoa: 'PF',
              periodoAtual: scrData,
              ...(json.scrAnterior ? { periodoAnterior: json.scrAnterior as SCRData } : {}),
            };
            return { ...prev, scrSocios: [...(prev.scrSocios || []), novoSocio] };
          }
          const scrAtualizado = prev.scr
            ? mergeData(prev.scr as unknown as Record<string, unknown>, scrData as unknown as Record<string, unknown>) as unknown as SCRData
            : scrData;
          const extra: Partial<ExtractedData> = json.scrAnterior ? { scrAnterior: json.scrAnterior as SCRData } : {};
          return { ...prev, scr: scrAtualizado, ...extra };
        }
        const fieldMap: Partial<Record<DocKey, keyof ExtractedData>> = {
          curva_abc: 'curvaABC',
          relatorio_visita: 'relatorioVisita',
          divida_ativa: 'dividaAtiva',
          cenprot: 'cenprot',
          gefip: 'gefip',
        };
        const field = (fieldMap[type] ?? type) as keyof ExtractedData;
        const currentData = prev[field];
        return {
          ...prev,
          [field]: currentData
            ? mergeData(currentData as unknown as Record<string, unknown>, json.data)
            : json.data,
        };
      });

      setSections(prev => ({
        ...prev,
        [type]: { ...prev[type], retrying: false, errorCount: 0, processedCount: prev[type].processedCount + 1, lastFailedFile: undefined },
      }));
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      setSections(prev => ({
        ...prev,
        [type]: { ...prev[type], retrying: false, errorCount: 1, errorType: "unknown", errorMessage: retryMsg },
      }));
    }
  }, [sections]);

  // Força nova extração ignorando o cache — útil quando prompt foi atualizado
  // ou quando a extração cacheada está incorreta.
  const handleForceReextract = useCallback(async (type: DocKey) => {
    const section = sections[type];
    const file = section.lastSuccessFile;
    if (!file) return;

    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], processing: true, fromCache: false, errorCount: 0, errorType: undefined },
    }));

    const apiType = type === "scrAnterior" || type === "scr_socio" || type === "scr_socio_anterior" ? "scr" : type;

    try {
      const json = await enqueueExtract(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        let res: Response;
        if (file.size > 4 * 1024 * 1024) {
          const sanitize = (name: string) => {
            const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
            const base = name.slice(0, name.length - ext.length)
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
            return `${Date.now()}-${base || "file"}${ext.toLowerCase()}`;
          };
          const blob = await upload(sanitize(file.name), file, { access: "public", handleUploadUrl: "/api/upload-blob" });
          res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blobUrl: blob.url, type: apiType, slot: type, fileName: file.name, bypass_cache: true }),
            signal: controller.signal,
          });
        } else {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("type", apiType);
          fd.append("slot", type);
          fd.append("bypass_cache", "true");
          res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
        }
        clearTimeout(timeout);
        const isSSE = res.headers.get("content-type")?.includes("text/event-stream");
        const result = isSSE ? await readExtractSSE(res) : await res.json();
        (result as Record<string, unknown>).__resOk = res.ok;
        return result;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      if (!json.__resOk || !json.success) {
        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], processing: false, errorCount: 1, errorType: "unknown", errorMessage: json.error || "Falha na reextração." },
        }));
        return;
      }

      setExtracted(prev => {
        const fieldMap: Partial<Record<DocKey, keyof ExtractedData>> = { curva_abc: "curvaABC", relatorio_visita: "relatorioVisita" };
        const field = (fieldMap[type] ?? type) as keyof ExtractedData;
        return { ...prev, [field]: json.data };
      });

      setSections(prev => ({
        ...prev,
        [type]: { ...prev[type], processing: false, fromCache: false, lastSuccessFile: file },
      }));
    } catch (e) {
      setSections(prev => ({
        ...prev,
        [type]: { ...prev[type], processing: false, errorCount: 1, errorType: "unknown", errorMessage: e instanceof Error ? e.message : "Erro" },
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const handleAddFiles = useCallback((type: DocKey) => (files: File[]) => {
    processFiles(type, files);
  }, [processFiles]);

  // Remove um arquivo RETOMADO (já persistido no banco) via callback do pai
  // que faz UPDATE no document_collections. Retorna sucesso/falha pro
  // UploadArea, que controla o estado de confirmação.
  const handleRemoveResumed = useCallback((type: DocKey) => async (index: number): Promise<boolean> => {
    const section = sections[type];
    const filename = section.resumedFilenames?.[index];
    if (!filename || !onRemoveResumedFile) return false;

    const ok = await onRemoveResumedFile(type, filename);
    if (!ok) return false;

    // Sucesso: atualiza state local — remove o nome do array e, se foi o
    // último, limpa também a extração daquele tipo pra refletir o "vazio".
    setSections(prev => {
      const s = prev[type];
      const remaining = (s.resumedFilenames ?? []).filter((_, i) => i !== index);
      const remainingBlobs = (s.resumedBlobUrls ?? []).filter((_, i) => i !== index);
      if (remaining.length === 0) {
        return {
          ...prev,
          [type]: { files: [], processing: false, processedCount: 0, errorCount: 0 },
        };
      }
      return {
        ...prev,
        [type]: { ...s, resumedFilenames: remaining, resumedBlobUrls: remainingBlobs },
      };
    });

    // Se foi o último arquivo do tipo, zera a extração daquele campo
    // (caso contrário, mantém — a extração é compartilhada entre arquivos
    // do mesmo tipo e não dá pra fatiar de quem veio o que).
    const remaining = (section.resumedFilenames ?? []).filter((_, i) => i !== index);
    if (remaining.length === 0) {
      if (type === 'scrAnterior') {
        setExtracted(e => ({ ...e, scrAnterior: null }));
      } else if (type === 'scr_socio') {
        setExtracted(e => ({ ...e, scrSocios: [] }));
      } else if (type === 'scr_socio_anterior') {
        setExtracted(e => ({
          ...e,
          scrSocios: (e.scrSocios || []).map(s => {
            const { periodoAnterior: _u, ...rest } = s; void _u;
            return rest as SCRSocioData;
          }),
        }));
      } else {
        const defaults: Record<string, unknown> = {
          cnpj: defaultCNPJ,
          qsa: defaultQSA,
          contrato: defaultContrato,
          faturamento: defaultFaturamento,
          scr: defaultSCR,
        };
        const fieldMap: Partial<Record<DocKey, keyof ExtractedData>> = {
          curva_abc: 'curvaABC',
          relatorio_visita: 'relatorioVisita',
          divida_ativa: 'dividaAtiva',
          cenprot: 'cenprot',
          gefip: 'gefip',
        };
        const field = (fieldMap[type] ?? type) as keyof ExtractedData;
        if (defaults[type]) {
          setExtracted(e => ({ ...e, [field]: defaults[type] }));
        } else {
          setExtracted(e => ({ ...e, [field]: undefined }));
        }
      }
    }

    return true;
  }, [sections, onRemoveResumedFile]);

  const handleRemoveFile = useCallback((type: DocKey) => (index: number) => {
    setSections(prev => {
      const section = prev[type];
      const newFiles = section.files.filter((_, i) => i !== index);
      // If all files are removed, reset section completely
      if (newFiles.length === 0) {
        return {
          ...prev,
          [type]: { files: [], processing: false, processedCount: 0, errorCount: 0 },
        };
      }
      return {
        ...prev,
        [type]: { ...section, files: newFiles },
      };
    });

    // If all files removed, reset extracted data for this section
    setSections(prev => {
      if (prev[type].files.length === 0) {
        if (type === 'scrAnterior') {
          setExtracted(e => ({ ...e, scrAnterior: null }));
        } else if (type === 'scr_socio') {
          setExtracted(e => ({ ...e, scrSocios: [] }));
        } else if (type === 'scr_socio_anterior') {
          // Remove periodoAnterior from all socios
          setExtracted(e => ({
            ...e,
            scrSocios: (e.scrSocios || []).map(s => {
              const { periodoAnterior: _unused, ...rest } = s; void _unused;
              return rest as SCRSocioData;
            }),
          }));
        } else {
          // DocKey == campo em ExtractedData
          const defaults: Record<string, unknown> = {
            cnpj: defaultCNPJ,
            qsa: defaultQSA,
            contrato: defaultContrato,
            faturamento: defaultFaturamento,
            scr: defaultSCR,
            dre: { anos: [], crescimentoReceita: "0,00", tendenciaLucro: "estavel", periodoMaisRecente: "", observacoes: "" },
            balanco: { anos: [], periodoMaisRecente: "", tendenciaPatrimonio: "estavel", observacoes: "" },
            cenprot: { qtdRegistros: 0, valorTotal: "", registros: [], certidaoNegativa: false, dataConsulta: "" },
            gefip: { competenciaInicio: "", competenciaFim: "", totalFuncionarios: 0, valorFgtsTotal: "", valorInssTotal: "", competenciasEmAtraso: 0, competencias: [] },
          };
          // DocKey difere do campo em ExtractedData
          const remapped: Record<string, [string, unknown]> = {
            divida_ativa:     ["dividaAtiva",     { qtdRegistros: 0, valorTotal: "", registros: [], certidaoNegativa: false, dataConsulta: "" }],
            curva_abc:        ["curvaABC",        { clientes: [], totalClientesNaBase: 0, totalClientesExtraidos: 0, periodoReferencia: "", receitaTotalBase: "0,00", concentracaoTop3: "0.00", concentracaoTop5: "0.00", concentracaoTop10: "0.00", totalClientesClasseA: 0, receitaClasseA: "0,00", maiorCliente: "", maiorClientePct: "0.00", alertaConcentracao: false }],
            ir_socio:         ["irSocios",        []],
            relatorio_visita: ["relatorioVisita", undefined],
          };
          if (remapped[type]) {
            const [field, val] = remapped[type];
            setExtracted(e => ({ ...e, [field]: val }));
          } else if (defaults[type] !== undefined) {
            setExtracted(e => ({ ...e, [type]: defaults[type] }));
          }
        }
      }
      return prev;
    });
  }, []);

  // Derived state
  const anyProcessing = Object.values(sections).some(s => s.processing);
  const anyRetrying = Object.values(sections).some(s => s.retrying);
  const requiredDoneCount = REQUIRED_KEYS.filter(k => sections[k].processedCount > 0).length;
  const allRequiredDone = REQUIRED_KEYS.every(k => sections[k].processedCount > 0);
  const totalRequired = REQUIRED_KEYS.length;
  const [forcarAvancar, setForcarAvancar] = useState(false);

  const canProceed = (allRequiredDone || forcarAvancar) && !anyProcessing && !anyRetrying && bureauStatus !== "loading";

  // Seções com arquivo enviado mas extração falhou (processedCount=0 apesar de ter arquivo).
  // Usado para exibir aviso antes de prosseguir — dados dessas seções não entrarão na análise.
  const sectionsComFalha = SECTIONS.filter(s => {
    const sec = sections[s.key];
    return sec.processedCount === 0 && (sec.files.length > 0 || (sec.resumedFilenames?.length ?? 0) > 0);
  });

  const handleSubmit = () => {
    if (!canProceed) return;
    const files: OriginalFiles = {
      cnpj: sections.cnpj.files,
      qsa: sections.qsa.files,
      contrato: sections.contrato.files,
      faturamento: sections.faturamento.files,
      scr: sections.scr.files,
      scrAnterior: sections.scrAnterior.files,
      scr_socio: sections.scr_socio.files,
      scr_socio_anterior: sections.scr_socio_anterior.files,
      dre: sections.dre.files,
      balanco: sections.balanco.files,
      curva_abc: sections.curva_abc.files,
      ir_socio: sections.ir_socio.files,
      relatorio_visita: sections.relatorio_visita.files,
      divida_ativa: sections.divida_ativa.files,
      cenprot: sections.cenprot.files,
      gefip: sections.gefip.files,
    };

    // Registra quais seções tinham arquivos extraídos para que page.tsx possa
    // restaurar o estado correto ao voltar de review (sem depender de buildCollectionDocs
    // que pula docs com extração vazia).
    const DOC_KEY_TO_TYPE: Partial<Record<DocKey, CollectionDocument["type"]>> = {
      cnpj: 'cnpj', qsa: 'qsa', contrato: 'contrato_social', faturamento: 'faturamento',
      scr: 'scr_bacen', scrAnterior: 'scr_bacen', scr_socio: 'scr_bacen', scr_socio_anterior: 'scr_bacen',
      dre: 'dre' as CollectionDocument["type"], balanco: 'balanco' as CollectionDocument["type"],
      curva_abc: 'curva_abc' as CollectionDocument["type"], ir_socio: 'ir_socio' as CollectionDocument["type"],
      relatorio_visita: 'relatorio_visita' as CollectionDocument["type"],
      divida_ativa: 'divida_ativa' as CollectionDocument["type"],
      cenprot: 'cenprot' as CollectionDocument["type"],
      gefip: 'gefip' as CollectionDocument["type"],
    };
    const now = new Date().toISOString();
    const processedDocs: CollectionDocument[] = [];
    for (const [key, section] of Object.entries(sections) as [DocKey, SectionState][]) {
      if (section.processedCount === 0) continue;
      const type = DOC_KEY_TO_TYPE[key];
      if (!type) continue;
      for (let i = 0; i < section.processedCount; i++) {
        const filename = section.resumedFilenames?.[i] ?? section.files[i]?.name ?? `${key}.pdf`;
        processedDocs.push({ type, filename, extracted_data: {}, uploaded_at: now });
      }
    }

    onComplete(extracted, files, processedDocs);
  };

  const requiredSections = SECTIONS.filter(s => s.required);
  const optionalSections = SECTIONS.filter(s => !s.required);
  const optionalDoneCount = optionalSections.filter(s => sections[s.key].processedCount > 0).length;

  return (
    <div className="animate-fade-in">

      {/* ── Info banner ── */}
      {resumedDocs && resumedDocs.length > 0 ? (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <Info size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Coleta retomada — os documentos enviados anteriormente estão listados abaixo. Adicione novos ou prossiga.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-cf-navy/5 border border-cf-navy/15 rounded-xl px-4 py-3 mb-4">
          <Info size={15} className="text-cf-navy flex-shrink-0 mt-0.5" />
          <p className="text-xs text-cf-text-2 leading-relaxed">
            Informe o CNPJ para iniciar as consultas automáticas. Envie os 2 documentos obrigatórios (Contrato Social e Faturamento). Cartão CNPJ, QSA e SCR são obtidos via API.
          </p>
        </div>
      )}

      {/* ── Sticky progress bar ── */}
      <div
        className="sticky top-16 z-20 bg-white border-b border-cf-border mb-4 rounded-b-xl"
        style={{ boxShadow: "0 2px 8px rgba(32,59,136,0.06)" }}
      >
        <div className="px-4 py-2.5 flex items-center gap-4">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <div className="flex-1 h-1.5 rounded-full bg-cf-border overflow-hidden">
              <div
                style={{ width: `${(requiredDoneCount / totalRequired) * 100}%`, transition: "width 0.5s ease-out" }}
                className={`h-full rounded-full ${requiredDoneCount === totalRequired ? "bg-cf-green" : "bg-cf-navy"}`}
              />
            </div>
            <span className="text-[11px] font-semibold text-cf-text-3 whitespace-nowrap">
              {requiredDoneCount}/{totalRequired} obrigatórios
              
            </span>
          </div>
          {bureauStatus === "loading" && (
            <div className="flex items-center gap-1.5 text-[10px] text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1 border border-blue-200 flex-shrink-0">
              <Loader2 size={10} className="animate-spin" />
              Consultando birôs...
            </div>
          )}
        </div>
      </div>

      {/* ── Banner Goalfy highlight ── */}
      {highlightedSet.size > 0 && (
        <div style={{ margin: "16px 16px 0", padding: "12px 16px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📋</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", margin: 0 }}>
              Este card tinha {highlightedSet.size} documento{highlightedSet.size !== 1 ? "s" : ""} identificado{highlightedSet.size !== 1 ? "s" : ""} no Goalfy
            </p>
            <p style={{ fontSize: 12, color: "#3b82f6", margin: 0 }}>
              Faça o upload dos arquivos com borda azul abaixo
            </p>
          </div>
        </div>
      )}

      {/* ── CNPJ da empresa ── */}
      <div style={{ background: cnpjConfirmado ? "#f0fdf4" : "#fff", border: `1px solid ${cnpjConfirmado ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Building2 size={15} color={cnpjConfirmado ? "#16a34a" : "#1a2744"} />
          <span style={{ fontSize: 12, fontWeight: 700, color: cnpjConfirmado ? "#15803d" : "#1a2744", textTransform: "uppercase", letterSpacing: ".05em" }}>
            CNPJ da Empresa
          </span>
          {cnpjConfirmado && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#16a34a", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle size={12} /> Consultas iniciadas
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={cnpjInput}
            onChange={e => {
              const formatted = formatarCNPJ(e.target.value);
              setCnpjInput(formatted);
              const digits = formatted.replace(/\D/g, "");
              if (digits.length === 14 && !bureauTriggered.current) {
                setExtracted(prev => ({ ...prev, cnpj: { ...prev.cnpj, cnpj: digits } }));
              }
            }}
            onKeyDown={e => { if (e.key === "Enter") handleCnpjConfirm(); }}
            placeholder="00.000.000/0000-00"
            disabled={cnpjConfirmado}
            style={{
              flex: 1, padding: "8px 12px", border: `1px solid ${cnpjConfirmado ? "#bbf7d0" : "#e2e8f0"}`,
              borderRadius: 8, fontSize: 14, fontFamily: "monospace", letterSpacing: ".05em",
              background: cnpjConfirmado ? "#f0fdf4" : "#fafbfc", color: "#1e293b", outline: "none",
            }}
          />
          {!cnpjConfirmado && (
            <button
              onClick={handleCnpjConfirm}
              disabled={cnpjInput.replace(/\D/g, "").length !== 14}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a2744",
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                opacity: cnpjInput.replace(/\D/g, "").length !== 14 ? 0.4 : 1,
              }}
            >
              Confirmar
            </button>
          )}
        </div>
        {!cnpjConfirmado && (
          <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
            Informe o CNPJ para iniciar as consultas automáticas nos birôs de crédito
          </p>
        )}
      </div>

      {/* ── Document cards ── */}
      <div className="space-y-6 pb-20">

        {/* Group 1 — Obrigatórios */}
        <div>
          <OnboardingTooltip
            id="upload-docs-obrigatorios"
            message="Informe o CNPJ no campo acima para iniciar as consultas nos birôs. Depois envie os 2 documentos obrigatórios: Contrato Social e Faturamento. Cartão CNPJ, QSA e SCR chegam via API."
            position="right"
            isSeen={isSeen("upload-docs-obrigatorios")}
            onSeen={() => markSeen("upload-docs-obrigatorios")}
          >
            <GroupHeader label="Documentos Obrigatórios" count={requiredDoneCount} total={totalRequired} />
          </OnboardingTooltip>
          <div className="space-y-2">
            {requiredSections.map(section => {
              const isH = highlightedSet.has(section.key);
              return (
                <div key={section.key} ref={el => { sectionRefs.current[section.key] = el; }}
                  style={isH ? { border: "2px solid #3b82f6", borderRadius: 12, position: "relative" } : undefined}>
                  {isH && <span style={{ position: "absolute", top: -9, right: 12, zIndex: 1, background: "#3b82f6", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>Identificado no Goalfy</span>}
                  <UploadArea
                    title={section.title}
                    description={section.description}
                    icon={section.icon}
                    docKey={section.key}
                    files={sections[section.key].files}
                    onAddFiles={handleAddFiles(section.key)}
                    onRemoveFile={handleRemoveFile(section.key)}
                    processing={sections[section.key].processing}
                    doneCount={sections[section.key].processedCount}
                    errorCount={sections[section.key].errorCount}
                    errorType={sections[section.key].errorType}
                    onRetry={sections[section.key].lastFailedFile ? () => handleRetry(section.key) : undefined}
                    onReprocess={() => handleReprocess(section.key)}
                    reprocessing={sections[section.key].processing && sections[section.key].processedCount === 0 && sections[section.key].files.length > 0 && sections[section.key].errorCount === 0}
                    resumedFilenames={sections[section.key].resumedFilenames}
                    fromCache={sections[section.key].fromCache}
                    onForceReextract={sections[section.key].lastSuccessFile ? () => handleForceReextract(section.key) : undefined}
                    onRemoveResumed={onRemoveResumedFile ? handleRemoveResumed(section.key) : undefined}
                  />
                </div>
              );
            })}
            {/* SCR — coletado via API DataBox360 (não requer upload) */}
            {(() => {
              const db360 = bureauDetail["databox360"] as { empresa?: boolean; socios?: number; mock?: boolean } | undefined;
              const isLoading = bureauStatus === "loading";
              const isOk = db360 && !db360.mock && db360.empresa;
              return (
                <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  isOk ? "border-green-200 bg-green-50" : isLoading ? "border-blue-200 bg-blue-50" : "border-cf-border bg-white"
                }`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    isOk ? "bg-green-100 text-green-600" : isLoading ? "bg-blue-100 text-blue-500" : "bg-cf-border/30 text-cf-text-4"
                  }`}>
                    <BarChart3 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-cf-text-1">SCR / Bacen</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">API automática</span>
                    </div>
                    <p className="text-[11px] text-cf-text-4 mt-0.5">
                      {isOk
                        ? `Coletado via DataBox360 — empresa${(db360?.socios ?? 0) > 0 ? ` + ${db360?.socios} sócio(s)` : ""}`
                        : isLoading
                          ? "Consultando DataBox360 (SCR)..."
                          : "Será consultado automaticamente ao prosseguir"}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isOk && <span className="text-[11px] font-semibold text-green-600">✓ Coletado</span>}
                    {isLoading && <Loader2 size={14} className="animate-spin text-blue-500" />}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Group 2 — Complementares */}
        <div>
          <GroupHeader label="Documentos Complementares" count={optionalDoneCount} optional />
          <div className="space-y-2">
            {optionalSections.map(section => {
              const isH = highlightedSet.has(section.key);
              return (
                <div key={section.key} ref={el => { sectionRefs.current[section.key] = el; }}
                  style={isH ? { border: "2px solid #3b82f6", borderRadius: 12, position: "relative" } : undefined}>
                  {isH && <span style={{ position: "absolute", top: -9, right: 12, zIndex: 1, background: "#3b82f6", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>Identificado no Goalfy</span>}
                  <UploadArea
                    title={section.title}
                    description={section.description}
                    icon={section.icon}
                    docKey={section.key}
                    files={sections[section.key].files}
                    onAddFiles={handleAddFiles(section.key)}
                    onRemoveFile={handleRemoveFile(section.key)}
                    processing={sections[section.key].processing}
                    doneCount={sections[section.key].processedCount}
                    errorCount={sections[section.key].errorCount}
                    errorType={sections[section.key].errorType}
                    onRetry={sections[section.key].lastFailedFile ? () => handleRetry(section.key) : undefined}
                    onReprocess={() => handleReprocess(section.key)}
                    reprocessing={sections[section.key].processing && sections[section.key].processedCount === 0 && sections[section.key].files.length > 0 && sections[section.key].errorCount === 0}
                    resumedFilenames={sections[section.key].resumedFilenames}
                    fromCache={sections[section.key].fromCache}
                    onForceReextract={sections[section.key].lastSuccessFile ? () => handleForceReextract(section.key) : undefined}
                    onRemoveResumed={onRemoveResumedFile ? handleRemoveResumed(section.key) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Sticky footer ── */}
      <div
        className="sticky bottom-0 z-20 bg-white border-t border-cf-border"
        style={{ boxShadow: "0 -4px 16px rgba(32,59,136,0.07)" }}
      >
        {canProceed && sectionsComFalha.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", background: "#fffbeb", borderBottom: "1px solid #fcd34d", fontSize: 12 }}>
            <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: "#92400e", lineHeight: 1.5 }}>
              <strong>Extração incompleta:</strong>{" "}
              {sectionsComFalha.map(s => s.title).join(", ")}.{" "}
              {sectionsComFalha.length === 1 ? "Esse documento" : "Esses documentos"} não entrar{sectionsComFalha.length === 1 ? "á" : "ão"} na análise — verifique o arquivo ou remova antes de prosseguir.
            </span>
          </div>
        )}
        <div className="px-4 py-3 flex items-center justify-between gap-4">

          {/* Left: dots + bureau badges */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              {Array.from({ length: totalRequired }).map((_, i) => (
                <div key={i} className={`h-1.5 w-7 rounded-full transition-all duration-300 ${
                  i < requiredDoneCount
                    ? "bg-cf-green"
                    : i === requiredDoneCount && anyProcessing
                      ? "bg-cf-navy animate-pulse"
                      : "bg-cf-border"
                }`} />
              ))}

            </div>
            {(anyProcessing || anyRetrying) && (() => {
              const pc = Object.values(sections).filter(s => s.processing || s.retrying).length;
              const tw = Object.values(sections).filter(s => s.files.length > 0).length;
              return <p className="text-[10px] text-cf-text-4">Extraindo {pc} de {tw} documento{tw !== 1 ? "s" : ""}...</p>;
            })()}
            {bureauStatus === "done" && Object.keys(bureauDetail).length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {(["credithub", "serasa", "spc", "quod", "bigdatacorp", "sancoes", "databox360"] as const).map(key => {
                  const b = bureauDetail[key];
                  if (!b) return null;
                  const lbl = key === "credithub"  ? "Credit Hub"
                    : key === "bigdatacorp"         ? "BigDataCorp"
                    : key === "sancoes"              ? "Sanções"
                    : key === "databox360"           ? "SCR (DataBox360)"
                    : key.toUpperCase();
                  return (
                    <div key={key} title={b.error} className={`flex items-center gap-1 text-[10px] rounded-md px-2 py-0.5 border ${
                      b.mock || !b.success ? "text-amber-700 bg-amber-50 border-amber-200" : "text-green-700 bg-green-50 border-green-200"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${b.mock || !b.success ? "bg-amber-400" : "bg-green-500"}`} />
                      {lbl}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: CTA */}
          <div className="flex flex-col items-end gap-1.5">
            <OnboardingTooltip
              id="upload-prosseguir"
              message="Após enviar os documentos obrigatórios, prossiga para revisar os dados extraídos. Você poderá corrigir campos antes de gerar o relatório."
              position="top"
              isSeen={isSeen("upload-prosseguir")}
              onSeen={() => markSeen("upload-prosseguir")}
            >
              <button
                data-testid="upload-prosseguir-btn"
                data-state={anyProcessing || anyRetrying ? "processing" : canProceed ? "ready" : "waiting"}
                onClick={handleSubmit}
                disabled={!canProceed}
                className={`btn-primary ${!canProceed ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {anyProcessing || anyRetrying ? "Extraindo..." : canProceed ? "Prosseguir para Revisão" : "Aguardando documentos"}
                <ArrowRight size={15} />
              </button>
            </OnboardingTooltip>
            {!allRequiredDone && !anyProcessing && !anyRetrying && !forcarAvancar && requiredDoneCount >= 1 && (
              <button
                data-testid="upload-prosseguir-incompletos"
                onClick={() => setForcarAvancar(true)}
                className="text-[11px] text-cf-text-4 hover:text-amber-600 transition-colors"
                style={{ minHeight: "auto" }}
              >
                Prosseguir com dados incompletos
              </button>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
