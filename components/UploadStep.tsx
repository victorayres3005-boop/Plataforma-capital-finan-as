"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, Info, GitCompareArrows, Receipt, Scale, PieChart, FileKey, ClipboardList, Loader2 } from "lucide-react";
import UploadArea from "./UploadArea";
import OnboardingTooltip from "./OnboardingTooltip";
import { useTooltips } from "@/lib/useTooltips";
import { CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData, SCRSocioData, ProtestosData, ProcessosData, GrupoEconomicoData, ExtractedData, IRSocioData, CollectionDocument } from "@/types";
import { upload } from "@vercel/blob/client";

// ─── Types ───

type DocKey = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'scrAnterior' | 'scr_socio' | 'scr_socio_anterior' | 'dre' | 'balanco' | 'curva_abc' | 'ir_socio' | 'relatorio_visita';

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

function mergeData(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
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
  { key: 'cnpj',        title: 'Cartão CNPJ',                       description: 'Comprovante de inscrição emitido pela Receita Federal',           icon: <Building2 size={19} />,        stepNumber: '1', required: true },
  { key: 'qsa',         title: 'QSA',                               description: 'Quadro de Sócios e Administradores',                              icon: <Users size={19} />,            stepNumber: '2', required: true },
  { key: 'contrato',    title: 'Contrato Social',                   description: 'Contrato ou Estatuto Social — consolidado ou última alteração',   icon: <ScrollText size={19} />,       stepNumber: '3', required: true },
  { key: 'faturamento', title: 'Faturamento',                       description: 'Relatório de faturamento mensal — PDF ou planilha Excel (.xlsx)', icon: <TrendingUp size={19} />,       stepNumber: '4', required: true },
  { key: 'scr',         title: 'SCR / Bacen — Atual',               description: 'Relatório SCR do período mais recente',                           icon: <BarChart3 size={19} />,        stepNumber: '5', required: true },
  { key: 'scrAnterior',      title: 'SCR / Bacen — Anterior (opcional)', description: 'Relatório SCR do período anterior para comparativo',              icon: <GitCompareArrows size={19} />, stepNumber: '▿', required: false },
  { key: 'scr_socio',        title: 'SCR dos Sócios — Atual',             description: 'Relatório SCR dos sócios (PF) — período mais recente',            icon: <Users size={19} />,            stepNumber: '▿', required: false },
  { key: 'scr_socio_anterior', title: 'SCR dos Sócios — Anterior',         description: 'Relatório SCR dos sócios (PF) — período anterior para comparativo', icon: <GitCompareArrows size={19} />, stepNumber: '▿', required: false },
  { key: 'dre',              title: 'DRE — Demonstração de Resultado',   description: 'Demonstração de resultado dos últimos 2-3 anos',                 icon: <Receipt size={19} />,          stepNumber: '▿', required: false },
  { key: 'balanco',          title: 'Balanço Patrimonial',               description: 'Balanço dos últimos 2-3 anos',                                   icon: <Scale size={19} />,            stepNumber: '▿', required: false },
  { key: 'curva_abc',        title: 'Curva ABC — Top Clientes',          description: 'Carteira de clientes com concentração de receita',               icon: <PieChart size={19} />,         stepNumber: '▿', required: false },
  { key: 'ir_socio',         title: 'IR dos Sócios (opcional)',          description: 'Declaração de imposto de renda dos sócios',                      icon: <FileKey size={19} />,          stepNumber: '▿', required: false },
  { key: 'relatorio_visita', title: 'Relatório de Visita',               description: 'Relatório da visita presencial à empresa',                       icon: <ClipboardList size={19} />,    stepNumber: '▿', required: false },
];

const REQUIRED_KEYS: DocKey[] = ['cnpj', 'qsa', 'contrato', 'faturamento', 'scr'];

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

// Mapa de tipo de CollectionDocument para DocKey do UploadStep
const DOC_TYPE_TO_KEY: Record<string, DocKey | null> = {
  cnpj: 'cnpj', qsa: 'qsa', contrato_social: 'contrato', faturamento: 'faturamento',
  scr_bacen: 'scr', scr_socio: 'scr_socio', scr_socio_anterior: 'scr_socio_anterior', dre: 'dre', balanco: 'balanco', curva_abc: 'curva_abc',
  ir_socio: 'ir_socio', relatorio_visita: 'relatorio_visita',
  protestos: null, processos: null, grupo_economico: null, outro: null,
};

function buildInitialSections(resumedDocs: CollectionDocument[]): Record<DocKey, SectionState> {
  const empty = (): SectionState => ({ files: [], processing: false, processedCount: 0, errorCount: 0 });
  const sections: Record<DocKey, SectionState> = {
    cnpj: empty(), qsa: empty(), contrato: empty(), faturamento: empty(),
    scr: empty(), scrAnterior: empty(), scr_socio: empty(), scr_socio_anterior: empty(), dre: empty(), balanco: empty(),
    curva_abc: empty(), ir_socio: empty(), relatorio_visita: empty(),
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
  }

  // SCR empresa (PJ): primeiro → scr, segundo → scrAnterior
  if (scrPJ.length >= 1) {
    sections.scr.processedCount = 1;
    sections.scr.resumedFilenames = [scrPJ[0].filename];
  }
  if (scrPJ.length >= 2) {
    sections.scrAnterior.processedCount = 1;
    sections.scrAnterior.resumedFilenames = [scrPJ[1].filename];
  }

  // SCR sócios (PF): um slot por tipo, pode ter múltiplos arquivos
  if (scrPF_atual.length > 0) {
    sections.scr_socio.processedCount = scrPF_atual.length;
    sections.scr_socio.resumedFilenames = scrPF_atual.map(d => d.filename);
  }
  if (scrPF_anterior.length > 0) {
    sections.scr_socio_anterior.processedCount = scrPF_anterior.length;
    sections.scr_socio_anterior.resumedFilenames = scrPF_anterior.map(d => d.filename);
  }

  return sections;
}

export default function UploadStep({
  onComplete,
  resumedDocs,
  initialData,
  onDataChange,
}: {
  onComplete: (data: ExtractedData, files: OriginalFiles) => void;
  resumedDocs?: CollectionDocument[];
  initialData?: ExtractedData;
  onDataChange?: (data: ExtractedData) => void;
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
  const bureauTriggered = useRef(false);

  // Auto-trigger bureaus when CNPJ is extracted
  useEffect(() => {
    const cnpj = extracted.cnpj?.cnpj;
    if (!cnpj || bureauTriggered.current) return;
    bureauTriggered.current = true;
    setBureauStatus("loading");

    (async () => {
      try {
        // 1. Fetch CreditHub DIRECTLY from browser com RETRY POLLING
        // A API do CreditHub é assíncrona: retorna 500+402 com push=true até os dados estarem prontos
        const cnpjNum = cnpj.replace(/\D/g, "");
        const CREDITHUB_KEY = "9d3b1f096fe2b4c5ba9855d286c92d38";
        const CH_URL = `https://irql.credithub.com.br/simples/${CREDITHUB_KEY}/${cnpjNum}`;
        const MAX_ATTEMPTS = 15;
        const RETRY_DELAY_MS = 2000;
        let creditHubRaw: unknown = null;
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        console.log(`[credithub] iniciando polling (${MAX_ATTEMPTS} tentativas, ${RETRY_DELAY_MS}ms entre)`);
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const chRes = await fetch(CH_URL);
            const text = await chRes.text();
            const ct = chRes.headers.get("content-type") || "";
            // Tenta parsear JSON mesmo se status não for 2xx
            // (CreditHub usa 500 para avisar "em processamento" com push=true)
            if (text.trim().startsWith("{") || ct.includes("json")) {
              try {
                const parsed = JSON.parse(text);
                // Sucesso: JSON válido com dados
                if (parsed && (parsed.data || parsed.cnpj || parsed.razaoSocial || parsed.protestos || parsed.processos || parsed.completed !== undefined)) {
                  creditHubRaw = parsed;
                  console.log(`[credithub] ✓ tentativa ${attempt}: JSON recebido | completed=${parsed.completed ?? parsed.data?.completed} | keys=${Object.keys(parsed).slice(0, 10).join(",")}`);
                  // Se a consulta está completa, para o polling
                  if (parsed.completed === true || parsed.data?.completed === true) {
                    console.log("[credithub] ✓ consulta COMPLETED — parando polling");
                    break;
                  }
                }
              } catch {
                // JSON parse falhou — continua polling
              }
            }
            // Se recebeu XML com push=true → consulta em processamento, tenta de novo
            if (text.includes("push=\"true\"")) {
              if (attempt < MAX_ATTEMPTS) {
                console.log(`[credithub] tentativa ${attempt}/${MAX_ATTEMPTS}: consulta em processamento, aguardando ${RETRY_DELAY_MS}ms...`);
                await sleep(RETRY_DELAY_MS);
                continue;
              }
            }
            // Status 500 sem push=true = erro real, para de tentar
            if (!chRes.ok && !text.includes("push=\"true\"")) {
              console.error(`[credithub] erro definitivo status=${chRes.status}:`, text.substring(0, 200));
              break;
            }
            // Se chegou aqui sem creditHubRaw definido ainda, continua tentando
            if (!creditHubRaw && attempt < MAX_ATTEMPTS) {
              await sleep(RETRY_DELAY_MS);
            }
          } catch (fetchErr) {
            console.warn(`[credithub] tentativa ${attempt} exception:`, fetchErr);
            if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
          }
        }

        if (!creditHubRaw) {
          console.warn("[credithub] ⚠ nenhum dado retornado após", MAX_ATTEMPTS, "tentativas");
        }

        // 2. Send everything to bureaus endpoint (server parses + merges)
        console.log("[bureaus] iniciando consulta BDC + Assertiva + demais bureaus...");
        const res = await fetch("/api/bureaus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj, data: extractedRef.current, creditHubRaw }),
        });
        if (!res.ok) {
          console.warn(`[bureaus] HTTP ${res.status} — resposta não-JSON`);
          setBureauStatus("error");
          return;
        }
        const json = await res.json();
        console.log(`[bureaus] resposta: success=${json.success} | bureaus=${Object.keys(json.bureaus ?? {}).join(",")} | mock=${Object.entries(json.bureaus ?? {}).filter(([,v]: any) => v?.mock).map(([k]) => k).join(",") || "nenhum"}`);
        if (json.success && json.merged) {
          setExtracted(prev => ({ ...prev, ...json.merged }));
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
    if (!section || section.files.length === 0) return;

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
        };
        const field = (fieldMap[type] ?? type) as keyof ExtractedData;
        (cleared as unknown as Record<string, unknown>)[field] = undefined;
      }
      return cleared;
    });

    // Reseta contadores e re-roda processFiles com os arquivos existentes
    const filesToReprocess = [...section.files];
    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], files: [], processedCount: 0, errorCount: 0, errorType: undefined, errorMessage: undefined, lastFailedFile: undefined },
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
          const defaults: Record<string, unknown> = {
            cnpj: defaultCNPJ,
            qsa: defaultQSA,
            contrato: defaultContrato,
            faturamento: defaultFaturamento,
            scr: defaultSCR,
          };
          if (defaults[type]) {
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
  const scrAnteriorDone = sections.scrAnterior.processedCount > 0;
  const totalRequired = 5;
  const [forcarAvancar, setForcarAvancar] = useState(false);

  const canProceed = (allRequiredDone || forcarAvancar) && !anyProcessing && !anyRetrying && bureauStatus !== "loading";

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
    };
    onComplete(extracted, files);
  };

  const requiredSections = SECTIONS.filter(s => s.required);
  const optionalSections = SECTIONS.filter(s => !s.required);
  const optionalDoneCount = optionalSections.filter(s => sections[s.key].processedCount > 0).length;

  return (
    <div className="animate-slide-up">

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
            Envie os 5 documentos obrigatórios. Os complementares são opcionais e enriquecem o relatório. Aceita PDF, Word, Excel e imagens — extração automática.
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
              {scrAnteriorDone && <span className="text-blue-400 ml-1">+ comparativo</span>}
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

      {/* ── Document cards ── */}
      <div className="space-y-6 pb-20">

        {/* Group 1 — Obrigatórios */}
        <div>
          <OnboardingTooltip
            id="upload-docs-obrigatorios"
            message="Envie pelo menos os 3 documentos obrigatórios: Cartão CNPJ, Contrato Social e SCR/Bacen. A plataforma extrai os dados automaticamente via IA — sem digitação manual."
            position="right"
            isSeen={isSeen("upload-docs-obrigatorios")}
            onSeen={() => markSeen("upload-docs-obrigatorios")}
          >
            <GroupHeader label="Documentos Obrigatórios" count={requiredDoneCount} total={totalRequired} />
          </OnboardingTooltip>
          <div className="space-y-2">
            {requiredSections.map(section => (
              <UploadArea
                key={section.key}
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
              />
            ))}
          </div>
        </div>

        {/* Group 2 — Complementares */}
        <div>
          <GroupHeader label="Documentos Complementares" count={optionalDoneCount} optional />
          <div className="space-y-2">
            {optionalSections.map(section => (
              <UploadArea
                key={section.key}
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
              />
            ))}
          </div>
        </div>

      </div>

      {/* ── Sticky footer ── */}
      <div
        className="sticky bottom-0 z-20 bg-white border-t border-cf-border"
        style={{ boxShadow: "0 -4px 16px rgba(32,59,136,0.07)" }}
      >
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
              <div className={`h-1.5 w-3 rounded-full ml-1 transition-all duration-300 ${scrAnteriorDone ? "bg-blue-400" : "bg-cf-border/40"}`} />
            </div>
            {(anyProcessing || anyRetrying) && (() => {
              const pc = Object.values(sections).filter(s => s.processing || s.retrying).length;
              const tw = Object.values(sections).filter(s => s.files.length > 0).length;
              return <p className="text-[10px] text-cf-text-4">Extraindo {pc} de {tw} documento{tw !== 1 ? "s" : ""}...</p>;
            })()}
            {bureauStatus === "done" && Object.keys(bureauDetail).length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {(["credithub", "serasa", "spc", "quod", "bigdatacorp", "brasilapi", "sancoes"] as const).map(key => {
                  const b = bureauDetail[key];
                  if (!b) return null;
                  const lbl = key === "credithub" ? "Credit Hub"
                    : key === "bigdatacorp" ? "BigDataCorp"
                    : key === "brasilapi"   ? "BrasilAPI"
                    : key === "sancoes"     ? "Sanções"
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
