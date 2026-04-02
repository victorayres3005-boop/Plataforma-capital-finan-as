"use client";

import { useState, useCallback, useRef } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, AlertCircle, Info, GitCompareArrows } from "lucide-react";
import UploadArea from "./UploadArea";
import { CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData, ProtestosData, ProcessosData, GrupoEconomicoData, ExtractedData } from "@/types";

// ─── Types ───

type DocKey = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'scrAnterior';

interface SectionState {
  files: File[];
  processing: boolean;
  processedCount: number;
  errorCount: number;
}

export interface OriginalFiles {
  cnpj: File[];
  qsa: File[];
  contrato: File[];
  faturamento: File[];
  scr: File[];
  scrAnterior: File[];
}

// ─── Defaults ───

const defaultCNPJ: CNPJData = { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" };
const defaultQSA: QSAData = { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] };
const defaultContrato: ContratoSocialData = { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" };
const defaultFaturamento: FaturamentoData = { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" };
const defaultSCR: SCRData = { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" };
const defaultProtestos: ProtestosData = { vigentesQtd:"",vigentesValor:"",regularizadosQtd:"",regularizadosValor:"",detalhes:[] };
const defaultProcessos: ProcessosData = { passivosTotal:"",ativosTotal:"",valorTotalEstimado:"",temRJ:false,distribuicao:[],bancarios:[] };
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
  { key: 'scrAnterior', title: 'SCR / Bacen — Anterior (opcional)', description: 'Relatório SCR do período anterior para comparativo',              icon: <GitCompareArrows size={19} />, stepNumber: '▿', required: false },
];

const REQUIRED_KEYS: DocKey[] = ['cnpj', 'qsa', 'contrato', 'faturamento', 'scr'];

// ─── Component ───

export default function UploadStep({ onComplete }: { onComplete: (data: ExtractedData, files: OriginalFiles) => void }) {
  const [sections, setSections] = useState<Record<DocKey, SectionState>>({
    cnpj:        { files: [], processing: false, processedCount: 0, errorCount: 0 },
    qsa:         { files: [], processing: false, processedCount: 0, errorCount: 0 },
    contrato:    { files: [], processing: false, processedCount: 0, errorCount: 0 },
    faturamento: { files: [], processing: false, processedCount: 0, errorCount: 0 },
    scr:         { files: [], processing: false, processedCount: 0, errorCount: 0 },
    scrAnterior: { files: [], processing: false, processedCount: 0, errorCount: 0 },
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
        const timeout = setTimeout(() => controller.abort(), 180000);
        const res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
        clearTimeout(timeout);
        const json = await res.json();

        if (!res.ok || !json.success) {
          setSections(prev => ({
            ...prev,
            [type]: { ...prev[type], errorCount: prev[type].errorCount + 1 },
          }));
          continue;
        }

        // Se aiError mas tem dados (estrutura vazia), aceitar como parcial
        // O usuário pode preencher manualmente na revisão

        // Merge the incoming data
        setExtracted(prev => {
          const field = type === 'scrAnterior' ? 'scrAnterior' : type;
          const currentData = prev[field];

          if (type === 'scrAnterior') {
            if (currentData === null) {
              return { ...prev, scrAnterior: json.data };
            }
            return { ...prev, scrAnterior: mergeData(currentData as unknown as Record<string, unknown>, json.data) as unknown as SCRData };
          }

          return {
            ...prev,
            [field]: mergeData(currentData as unknown as Record<string, unknown>, json.data),
          };
        });

        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], processedCount: prev[type].processedCount + 1 },
        }));
      } catch {
        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], errorCount: prev[type].errorCount + 1 },
        }));
      }
    }

    // Done processing all files in this batch
    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], processing: false },
    }));
  }, []);

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
  const requiredDoneCount = REQUIRED_KEYS.filter(k => sections[k].processedCount > 0).length;
  const allRequiredDone = REQUIRED_KEYS.every(k => sections[k].processedCount > 0);
  const scrAnteriorDone = sections.scrAnterior.processedCount > 0;
  const totalRequired = 5;

  const handleSubmit = () => {
    if (!allRequiredDone || anyProcessing) return;
    const files: OriginalFiles = {
      cnpj: sections.cnpj.files,
      qsa: sections.qsa.files,
      contrato: sections.contrato.files,
      faturamento: sections.faturamento.files,
      scr: sections.scr.files,
      scrAnterior: sections.scrAnterior.files,
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
            />
          </div>
        ))}
      </div>

      {/* Errors summary */}
      {Object.entries(sections).some(([, s]) => s.errorCount > 0) && (
        <div className="bg-cf-danger-bg border border-cf-danger/20 rounded-xl p-3 space-y-1">
          {Object.entries(sections)
            .filter(([, s]) => s.errorCount > 0)
            .map(([k, s]) => (
              <p key={k} className="text-xs text-cf-danger flex items-center gap-2 font-medium">
                <AlertCircle size={13} />
                {k === "scrAnterior" ? "SCR ANTERIOR" : k.toUpperCase()}: {s.errorCount} arquivo{s.errorCount !== 1 ? "s" : ""} com erro
              </p>
            ))}
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

        <button
          onClick={handleSubmit}
          disabled={!allRequiredDone || anyProcessing}
          className="btn-primary"
        >
          Prosseguir para Revisão
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
