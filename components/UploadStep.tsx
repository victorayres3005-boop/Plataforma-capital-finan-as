"use client";

import { useState, useCallback, useRef } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, AlertCircle, Info, GitCompareArrows, Receipt, Scale, PieChart, FileKey, ClipboardList } from "lucide-react";
import UploadArea from "./UploadArea";
import { CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData, ProtestosData, ProcessosData, GrupoEconomicoData, ExtractedData, IRSocioData } from "@/types";

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

export default function UploadStep({ onComplete }: { onComplete: (data: ExtractedData, files: OriginalFiles) => void }) {
  const [sections, setSections] = useState<Record<DocKey, SectionState>>({
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
  });

  const [extracted, setExtracted] = useState<ExtractedData>({
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
        clearTimeout(timeout);
        const json = await res.json();

        if (!res.ok || !json.success || json.meta?.aiError) {
          setSections(prev => ({
            ...prev,
            [type]: {
              ...prev[type],
              errorCount: prev[type].errorCount + 1,
              errorType: json.meta?.errorType || (res.ok ? "unknown" : "quota"),
              errorMessage: json.meta?.errorMessage || json.error || "",
              lastFailedFile: file,
            },
          }));
          continue;
        }

        // Merge the incoming data
        setExtracted(prev => {
          if (type === 'scrAnterior') {
            const currentData = prev.scrAnterior;
            if (currentData === null) return { ...prev, scrAnterior: json.data };
            return { ...prev, scrAnterior: mergeData(currentData as unknown as Record<string, unknown>, json.data) as unknown as SCRData };
          }
          if (type === 'ir_socio') {
            return { ...prev, irSocios: [...(prev.irSocios || []), json.data as IRSocioData] };
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
          [type]: { ...prev[type], processedCount: prev[type].processedCount + 1 },
        }));
      } catch {
        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], errorCount: prev[type].errorCount + 1, lastFailedFile: file },
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();

      if (!res.ok || !json.success || json.meta?.aiError) {
        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], retrying: false, errorCount: 1, errorType: json.meta?.errorType || "unknown", errorMessage: json.meta?.errorMessage || "" },
        }));
        return;
      }

      // Success — merge data
      setExtracted(prev => {
        if (type === "scrAnterior") {
          return { ...prev, scrAnterior: json.data };
        }
        if (type === "ir_socio") {
          return { ...prev, irSocios: [...(prev.irSocios || []), json.data as IRSocioData] };
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
    } catch {
      setSections(prev => ({
        ...prev,
        [type]: { ...prev[type], retrying: false, errorCount: 1, errorType: "unknown" },
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
      <div className="flex items-start gap-3 bg-cf-navy/5 border border-cf-navy/15 rounded-xl px-4 py-3">
        <Info size={15} className="text-cf-navy flex-shrink-0 mt-0.5" />
        <p className="text-xs text-cf-text-2 leading-relaxed">
          Envie os 5 documentos obrigatórios + o SCR anterior (opcional, para comparativo).
          Cada seção aceita múltiplos arquivos. Aceita PDF, Word, Excel (.xlsx) e imagens. A extração é automática.
        </p>
      </div>

      {/* Upload areas */}
      <div className="card p-5 space-y-4">
        {SECTIONS.map((section, idx) => (
          <div key={section.key}>
            {idx > 0 && (
              <div className={`border-t ${section.required ? 'border-cf-border' : 'border-cf-border border-dashed'} mb-4`} />
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
