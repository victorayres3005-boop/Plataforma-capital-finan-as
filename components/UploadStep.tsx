"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, AlertCircle, Info, GitCompareArrows, Receipt, Scale, PieChart, FileKey, ClipboardList, Loader2, CheckCircle2 } from "lucide-react";
import UploadArea from "./UploadArea";
import { CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData, SCRSocioData, ProtestosData, ProcessosData, GrupoEconomicoData, ExtractedData, IRSocioData, CollectionDocument } from "@/types";

// ─── Types ───

type DocKey = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'scrAnterior' | 'dre' | 'balanco' | 'curva_abc' | 'ir_socio' | 'relatorio_visita';

interface SectionState {
  files: File[];
  processing: boolean;
  processedCount: number;
  errorCount: number;
  errorType?: "quota" | "parse" | "empty" | "unknown";
  errorMessage?: string;
  retrying?: boolean;
  lastFailedFile?: File;
  resumedFilenames?: string[]; // filenames from a resumed collection
}

// ─── Fila global de extração — evita estouro de quota (RPM) no Gemini ───
const EXTRACT_DELAY_MS = 8000; // 8s entre cada chamada — evita estouro de RPM no Gemini free tier
let extractQueue: Promise<unknown> = Promise.resolve();

function enqueueExtract(fn: () => Promise<unknown>): Promise<unknown> {
  const prev = extractQueue;
  const next = prev.then(async () => {
    await new Promise(r => setTimeout(r, EXTRACT_DELAY_MS));
    return fn();
  });
  extractQueue = next.catch(() => {}); // evita rejeição não tratada propagar
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

function getErrorFeedback(errorType?: string, docLabel?: string): { title: string; detail: string; action: string } {
  switch (errorType) {
    case "quota":
      return {
        title: `${docLabel}: falha na extracao`,
        detail: "API temporariamente indisponivel (limite de uso atingido).",
        action: "Tente novamente em alguns minutos.",
      };
    case "parse":
      return {
        title: `${docLabel}: falha na leitura`,
        detail: "Nao foi possivel interpretar o conteudo do documento.",
        action: "Verifique se o arquivo nao esta corrompido e tente novamente.",
      };
    case "empty":
      return {
        title: `${docLabel}: documento sem conteudo`,
        detail: "O arquivo parece estar vazio ou ilegivel.",
        action: "Envie um arquivo com conteudo valido.",
      };
    default:
      return {
        title: `${docLabel}: erro na extracao`,
        detail: "Ocorreu um erro inesperado ao processar o documento.",
        action: "Tente novamente ou envie um formato diferente (PDF, DOCX).",
      };
  }
}

export interface OriginalFiles {
  cnpj: File[];
  qsa: File[];
  contrato: File[];
  faturamento: File[];
  scr: File[];
  scrAnterior: File[];
  dre: File[];
  balanco: File[];
  curva_abc: File[];
  ir_socio: File[];
  relatorio_visita: File[];
}

// ─── Defaults ───

const defaultCNPJ: CNPJData = { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" };
const defaultQSA: QSAData = { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] };
const defaultContrato: ContratoSocialData = { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" };
const defaultFaturamento: FaturamentoData = { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" };
const defaultSCR: SCRData = { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" };
const defaultProtestos: ProtestosData = { vigentesQtd:"",vigentesValor:"",regularizadosQtd:"",regularizadosValor:"",detalhes:[] };
const defaultProcessos: ProcessosData = { passivosTotal:"",ativosTotal:"",valorTotalEstimado:"",temRJ:false,distribuicao:[],bancarios:[],fiscais:[],fornecedores:[],outros:[] };
const defaultGrupoEconomico: GrupoEconomicoData = { empresas:[] };

// ─── Merge logic ───

function mergeData(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value) && Array.isArray(result[key])) {
      result[key] = [...(result[key] as unknown[]), ...value];
    } else if (typeof value === 'string' && value.length > 0) {
      result[key] = value;
    } else if (typeof value === 'boolean' && value === true) {
      result[key] = true;
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
  { key: 'dre',              title: 'DRE — Demonstração de Resultado',   description: 'Demonstração de resultado dos últimos 2-3 anos',                 icon: <Receipt size={19} />,          stepNumber: '▿', required: false },
  { key: 'balanco',          title: 'Balanço Patrimonial',               description: 'Balanço dos últimos 2-3 anos',                                   icon: <Scale size={19} />,            stepNumber: '▿', required: false },
  { key: 'curva_abc',        title: 'Curva ABC — Top Clientes',          description: 'Carteira de clientes com concentração de receita',               icon: <PieChart size={19} />,         stepNumber: '▿', required: false },
  { key: 'ir_socio',         title: 'IR dos Sócios (opcional)',          description: 'Declaração de imposto de renda dos sócios',                      icon: <FileKey size={19} />,          stepNumber: '▿', required: false },
  { key: 'relatorio_visita', title: 'Relatório de Visita',               description: 'Relatório da visita presencial à empresa',                       icon: <ClipboardList size={19} />,    stepNumber: '▿', required: false },
];

const REQUIRED_KEYS: DocKey[] = ['cnpj', 'qsa', 'contrato', 'faturamento', 'scr'];

// ─── Component ───

// Mapa de tipo de CollectionDocument para DocKey do UploadStep
const DOC_TYPE_TO_KEY: Record<string, DocKey | null> = {
  cnpj: 'cnpj', qsa: 'qsa', contrato_social: 'contrato', faturamento: 'faturamento',
  scr_bacen: 'scr', dre: 'dre', balanco: 'balanco', curva_abc: 'curva_abc',
  ir_socio: 'ir_socio', relatorio_visita: 'relatorio_visita',
  protestos: null, processos: null, grupo_economico: null, outro: null,
};

function buildInitialSections(resumedDocs: CollectionDocument[]): Record<DocKey, SectionState> {
  const empty = (): SectionState => ({ files: [], processing: false, processedCount: 0, errorCount: 0 });
  const sections: Record<DocKey, SectionState> = {
    cnpj: empty(), qsa: empty(), contrato: empty(), faturamento: empty(),
    scr: empty(), scrAnterior: empty(), dre: empty(), balanco: empty(),
    curva_abc: empty(), ir_socio: empty(), relatorio_visita: empty(),
  };

  const scrDocs = resumedDocs.filter(d => d.type === 'scr_bacen');

  for (const doc of resumedDocs) {
    if (doc.type === 'scr_bacen') continue; // handle separately
    const key = DOC_TYPE_TO_KEY[doc.type];
    if (!key) continue;
    sections[key].processedCount += 1;
    sections[key].resumedFilenames = [...(sections[key].resumedFilenames || []), doc.filename];
  }

  // SCR: primeiro (mais recente) → scr, segundo → scrAnterior
  if (scrDocs.length >= 1) {
    sections.scr.processedCount = 1;
    sections.scr.resumedFilenames = [scrDocs[0].filename];
  }
  if (scrDocs.length >= 2) {
    sections.scrAnterior.processedCount = 1;
    sections.scrAnterior.resumedFilenames = [scrDocs[1].filename];
  }

  return sections;
}

export default function UploadStep({
  onComplete,
  resumedDocs,
  initialData,
}: {
  onComplete: (data: ExtractedData, files: OriginalFiles) => void;
  resumedDocs?: CollectionDocument[];
  initialData?: ExtractedData;
}) {
  const [sections, setSections] = useState<Record<DocKey, SectionState>>(() =>
    resumedDocs && resumedDocs.length > 0 ? buildInitialSections(resumedDocs) : {
      cnpj:        { files: [], processing: false, processedCount: 0, errorCount: 0 },
      qsa:         { files: [], processing: false, processedCount: 0, errorCount: 0 },
      contrato:    { files: [], processing: false, processedCount: 0, errorCount: 0 },
      faturamento: { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scr:              { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scrAnterior:      { files: [], processing: false, processedCount: 0, errorCount: 0 },
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

  // ── Bureau state ──
  const [bureauStatus, setBureauStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const bureauTriggered = useRef(false);

  // Auto-trigger bureaus when CNPJ is extracted
  useEffect(() => {
    const cnpj = extracted.cnpj?.cnpj;
    if (!cnpj || bureauTriggered.current) return;
    bureauTriggered.current = true;
    setBureauStatus("loading");

    fetch("/api/bureaus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj, data: extractedRef.current }),
    })
      .then(r => {
        console.log("[upload] bureau response status:", r.status);
        return r.json();
      })
      .then(json => {
        console.log("[upload] bureau response:", JSON.stringify({ success: json.success, bureaus: json.bureaus, hasMerged: !!json.merged, protestos: !!json.merged?.protestos, processos: !!json.merged?.processos }).substring(0, 500));
        if (json.success && json.merged) {
          setExtracted(prev => ({ ...prev, ...json.merged }));
        }
        setBureauStatus(json.success ? "done" : "error");
      })
      .catch(err => {
        console.warn("[upload] erro ao consultar birôs:", err);
        setBureauStatus("error");
      });
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

    const apiType = type === 'scrAnterior' ? 'scr' : type;

    for (const file of newFiles) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", apiType);

      try {
        const json = await enqueueExtract(async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120000);
          const res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
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

        if (!resOk || !json.success || meta?.aiError) {
          setSections(prev => ({
            ...prev,
            [type]: {
              ...prev[type],
              errorCount: prev[type].errorCount + 1,
              errorType: meta?.errorType as string || (resOk ? "unknown" : "quota"),
              errorMessage: meta?.errorMessage as string || json.error as string || "",
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
          return {
            ...prev,
            [field]: currentData
              ? mergeData(currentData as unknown as Record<string, unknown>, json.data as Record<string, unknown>)
              : json.data,
          };
        });

        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], processedCount: prev[type].processedCount + 1 },
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

  const handleRetry = useCallback(async (type: DocKey) => {
    const section = sections[type];
    if (!section?.lastFailedFile) return;

    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], retrying: true, errorCount: 0, errorType: undefined, errorMessage: undefined },
    }));

    const apiType = type === "scrAnterior" ? "scr" : type;
    const fd = new FormData();
    fd.append("file", section.lastFailedFile);
    fd.append("type", apiType);

    try {
      const json = await enqueueExtract(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
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

  const canProceed = (allRequiredDone || forcarAvancar) && !anyProcessing && !anyRetrying;

  const handleSubmit = () => {
    if (!canProceed) return;
    const files: OriginalFiles = {
      cnpj: sections.cnpj.files,
      qsa: sections.qsa.files,
      contrato: sections.contrato.files,
      faturamento: sections.faturamento.files,
      scr: sections.scr.files,
      scrAnterior: sections.scrAnterior.files,
      dre: sections.dre.files,
      balanco: sections.balanco.files,
      curva_abc: sections.curva_abc.files,
      ir_socio: sections.ir_socio.files,
      relatorio_visita: sections.relatorio_visita.files,
    };
    onComplete(extracted, files);
  };

  return (
    <div className="animate-slide-up space-y-4">

      {/* Info banner */}
      {resumedDocs && resumedDocs.length > 0 ? (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Info size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Coleta retomada — os documentos enviados anteriormente estão listados abaixo. Você pode adicionar novos documentos ou prosseguir para revisão.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-cf-navy/5 border border-cf-navy/15 rounded-xl px-4 py-3">
          <Info size={15} className="text-cf-navy flex-shrink-0 mt-0.5" />
          <p className="text-xs text-cf-text-2 leading-relaxed">
            Envie os 5 documentos obrigatórios + o SCR anterior (opcional, para comparativo).
            Cada seção aceita múltiplos arquivos. Aceita PDF, Word, Excel (.xlsx) e imagens. A extração é automática.
          </p>
        </div>
      )}

      {/* Upload areas */}
      <div className="card p-5 space-y-4">
        {SECTIONS.map((section, idx) => (
          <div key={section.key}>
            {idx > 0 && (
              <div className={`border-t ${section.required ? 'border-cf-border' : 'border-cf-border border-dashed'} mb-4`} />
            )}
            {sections[section.key].resumedFilenames && sections[section.key].resumedFilenames!.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {sections[section.key].resumedFilenames!.map((name, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-cf-green/10 text-cf-green border border-cf-green/20 rounded-lg px-2.5 py-1 font-medium">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="currentColor" opacity=".3"/><path d="M3 5l1.5 1.5L7 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {name}
                  </span>
                ))}
              </div>
            )}
            <UploadArea
              stepNumber={section.stepNumber}
              title={section.title}
              description={section.description}
              files={sections[section.key].files}
              onAddFiles={handleAddFiles(section.key)}
              onRemoveFile={handleRemoveFile(section.key)}
              processing={sections[section.key].processing}
              doneCount={sections[section.key].processedCount}
              errorCount={sections[section.key].errorCount}
              icon={section.icon}
              docKey={section.key}
            />
          </div>
        ))}
      </div>

      {/* Errors summary */}
      {Object.entries(sections).some(([, s]) => s.errorCount > 0) && (
        <div className="space-y-2">
          {Object.entries(sections)
            .filter(([, s]) => s.errorCount > 0)
            .map(([k, s]) => {
              const label = k === "scrAnterior" ? "SCR Anterior" : SECTIONS.find(sec => sec.key === k)?.title || k.toUpperCase();
              const feedback = getErrorFeedback(s.errorType, label);
              return (
                <div key={k} className="bg-cf-danger-bg border border-cf-danger/20 rounded-xl p-3">
                  <p className="text-sm font-medium text-cf-danger flex items-center gap-2">
                    <AlertCircle size={14} />
                    {feedback.title}
                  </p>
                  <p className="text-xs text-cf-danger/80 mt-1 ml-[22px]">{feedback.detail}</p>
                  <p className="text-xs text-cf-danger/60 mt-0.5 ml-[22px]">{feedback.action}</p>
                  {s.errorMessage && <p className="text-xs text-cf-danger/50 mt-0.5 ml-[22px] font-mono break-all">[debug] {s.errorMessage}</p>}
                  {s.lastFailedFile && s.errorType !== "empty" && (
                    <button
                      onClick={() => handleRetry(k as DocKey)}
                      disabled={s.retrying}
                      className="mt-2 ml-[22px] flex items-center gap-1.5 text-xs font-semibold text-cf-danger border border-cf-danger/30 rounded-lg px-3 py-1.5 hover:bg-cf-danger/5 transition-colors disabled:opacity-50"
                      style={{ minHeight: "auto" }}
                    >
                      {s.retrying ? <><span className="animate-spin inline-block">↻</span> Tentando novamente...</> : <><span>↻</span> Tentar novamente</>}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Progress + CTA */}
      <div className="card p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalRequired }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-8 rounded-full transition-all duration-300 ${
                  i < requiredDoneCount
                    ? "bg-cf-green"
                    : i === requiredDoneCount && anyProcessing
                      ? "bg-cf-navy animate-pulse"
                      : "bg-cf-border"
                }`}
              />
            ))}
            {/* SCR Anterior indicator (optional) */}
            <div className={`h-1.5 w-4 rounded-full transition-all duration-300 ml-1 ${scrAnteriorDone ? "bg-blue-400" : "bg-cf-border/50"}`} />
          </div>
          <span className="text-xs text-cf-text-3 font-medium">
            {requiredDoneCount}/{totalRequired}
            {scrAnteriorDone && " + comparativo"}
          </span>
        </div>

        <div className="flex flex-col items-end gap-1">
          {bureauStatus === "loading" && (
            <div className="flex items-center gap-1.5 text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
              <Loader2 size={11} className="animate-spin" />
              Consultando birôs de crédito...
            </div>
          )}
          {bureauStatus === "done" && extracted.bureausConsultados && extracted.bureausConsultados.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1">
              <CheckCircle2 size={11} />
              {extracted.bureausConsultados.join(", ")} integrados
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canProceed}
            title={!canProceed && !forcarAvancar ? "Aguarde a extracao ou corrija os erros" : undefined}
            className={`btn-primary ${!canProceed ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {canProceed ? "Prosseguir para Revisao" : anyProcessing || anyRetrying ? "Extraindo..." : "Corrija os erros primeiro"}
            <ArrowRight size={15} />
          </button>
          {(anyProcessing || anyRetrying) && (() => {
            const processingCount = Object.values(sections).filter(s => s.processing || s.retrying).length;
            const totalWithFiles = Object.values(sections).filter(s => s.files.length > 0).length;
            const estSec = processingCount * 15;
            return (
              <p className="text-[10px] text-cf-text-4">
                Processando {processingCount} de {totalWithFiles} documento{totalWithFiles !== 1 ? "s" : ""} • ~{estSec} seg restantes
              </p>
            );
          })()}
          {!allRequiredDone && !anyProcessing && !anyRetrying && !forcarAvancar && (
            <button
              onClick={() => setForcarAvancar(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors"
              style={{ minHeight: "auto" }}
            >
              <AlertCircle size={13} />
              Prosseguir com dados incompletos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
