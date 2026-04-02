"use client";

import { useState } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, AlertCircle, Info, GitCompareArrows, AlertTriangle, Scale, Network } from "lucide-react";
import UploadArea from "./UploadArea";
import { DocStatus, ExtractedData, CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData, ProtestosData, ProcessosData, GrupoEconomicoData } from "@/types";

interface DocMeta { filledFields: number; isScanned: boolean; }
interface DocState { file: File | null; status: DocStatus; error?: string; meta?: DocMeta; }

const defaultCNPJ: CNPJData = { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" };
const defaultQSA: QSAData = { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] };
const defaultContrato: ContratoSocialData = { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" };
const defaultFaturamento: FaturamentoData = { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" };
const defaultSCR: SCRData = { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" };
const defaultProtestos: ProtestosData = { vigentesQtd:"",vigentesValor:"",regularizadosQtd:"",regularizadosValor:"",detalhes:[] };
const defaultProcessos: ProcessosData = { passivosTotal:"",ativosTotal:"",valorTotalEstimado:"",temRJ:false,distribuicao:[],bancarios:[] };
const defaultGrupoEconomico: GrupoEconomicoData = { empresas:[] };

export interface OriginalFiles { cnpj?: File; qsa?: File; contrato?: File; faturamento?: File; scr?: File; protestos?: File; processos?: File; grupoEconomico?: File; scrAnterior?: File; }

type DocKey = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'protestos' | 'processos' | 'grupoEconomico' | 'scrAnterior';

const DOC_DEFAULTS: Record<string, CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData> = {
  cnpj: defaultCNPJ, qsa: defaultQSA, contrato: defaultContrato, faturamento: defaultFaturamento, scr: defaultSCR, protestos: defaultProtestos, processos: defaultProcessos, grupoEconomico: defaultGrupoEconomico, scrAnterior: defaultSCR,
};

export default function UploadStep({ onComplete }: { onComplete: (data: ExtractedData, files: OriginalFiles) => void }) {
  const [docs, setDocs] = useState<Record<DocKey, DocState>>({
    cnpj:            { file: null, status: "idle" },
    qsa:             { file: null, status: "idle" },
    contrato:        { file: null, status: "idle" },
    faturamento:     { file: null, status: "idle" },
    scr:             { file: null, status: "idle" },
    protestos:       { file: null, status: "idle" },
    processos:       { file: null, status: "idle" },
    grupoEconomico:  { file: null, status: "idle" },
    scrAnterior:     { file: null, status: "idle" },
  });
  const [extracted, setExtracted] = useState<ExtractedData>({
    cnpj: defaultCNPJ, qsa: defaultQSA, contrato: defaultContrato, faturamento: defaultFaturamento, scr: defaultSCR, protestos: defaultProtestos, processos: defaultProcessos, grupoEconomico: defaultGrupoEconomico, scrAnterior: null, resumoRisco: "",
  });

  const updateDoc = (type: DocKey, p: Partial<DocState>) => setDocs(prev => ({ ...prev, [type]: { ...prev[type], ...p } }));

  const processFile = async (type: DocKey, file: File) => {
    updateDoc(type, { file, status: "processing", error: undefined });
    const fd = new FormData();
    fd.append("file", file);
    // Tanto scr quanto scrAnterior usam o mesmo tipo de extração "scr"
    const apiType = type === "scrAnterior" ? "scr" : type;
    fd.append("type", apiType);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      if (!res.ok || !json.success) { updateDoc(type, { status: "error", error: json.error || "Erro ao processar." }); return; }
      if (json.meta?.aiError) {
        updateDoc(type, { status: "error", error: "Não foi possível extrair dados do documento. Tente enviar em outro formato." });
        return;
      }
      // Mapear scrAnterior para o campo correto no ExtractedData
      if (type === "scrAnterior") {
        setExtracted(prev => ({ ...prev, scrAnterior: json.data }));
      } else {
        setExtracted(prev => ({ ...prev, [type]: json.data }));
      }
      updateDoc(type, { status: "done", meta: json.meta ?? undefined });
    } catch (err) {
      const msg = err instanceof Error && err.name === "AbortError"
        ? "Processamento demorou demais. Tente novamente."
        : "Falha na conexão. Verifique sua internet.";
      updateDoc(type, { status: "error", error: msg });
    }
  };

  const removeDoc = (type: DocKey) => {
    updateDoc(type, { file: null, status: "idle", error: undefined });
    if (type === "scrAnterior") {
      setExtracted(prev => ({ ...prev, scrAnterior: null }));
    } else {
      setExtracted(prev => ({ ...prev, [type]: DOC_DEFAULTS[type] }));
    }
  };

  // SCR Anterior é opcional, os outros 8 são obrigatórios
  const requiredKeys: DocKey[] = ['cnpj', 'qsa', 'contrato', 'faturamento', 'scr', 'protestos', 'processos', 'grupoEconomico'];
  const allDone = requiredKeys.every(k => docs[k].status === "done");
  const anyProcessing = Object.values(docs).some(d => d.status === "processing");
  const errors = Object.entries(docs).filter(([, d]) => d.status === "error");
  const doneCount = requiredKeys.filter(k => docs[k].status === "done").length;
  const scrAnteriorDone = docs.scrAnterior.status === "done";
  const totalRequired = 8;

  return (
    <div className="animate-slide-up space-y-4">

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-cf-navy/5 border border-cf-navy/15 rounded-xl px-4 py-3">
        <Info size={15} className="text-cf-navy flex-shrink-0 mt-0.5" />
        <p className="text-xs text-cf-text-2 leading-relaxed">
          Envie os 8 documentos obrigatórios + o SCR anterior (opcional, para comparativo).
          Aceita PDF, Word, Excel (.xlsx) e imagens. A extração é automática.
        </p>
      </div>

      {/* Upload areas */}
      <div className="card p-5 space-y-4">
        <UploadArea
          stepNumber="1" title="Cartão CNPJ" description="Comprovante de inscrição emitido pela Receita Federal"
          status={docs.cnpj.status} fileName={docs.cnpj.file?.name} meta={docs.cnpj.meta}
          onFileSelect={f => processFile("cnpj", f)} onRemove={() => removeDoc("cnpj")}
          icon={<Building2 size={19} />}
        />
        <div className="border-t border-cf-border" />
        <UploadArea
          stepNumber="2" title="QSA" description="Quadro de Sócios e Administradores"
          status={docs.qsa.status} fileName={docs.qsa.file?.name} meta={docs.qsa.meta}
          onFileSelect={f => processFile("qsa", f)} onRemove={() => removeDoc("qsa")}
          icon={<Users size={19} />}
        />
        <div className="border-t border-cf-border" />
        <UploadArea
          stepNumber="3" title="Contrato Social" description="Contrato ou Estatuto Social — consolidado ou última alteração"
          status={docs.contrato.status} fileName={docs.contrato.file?.name} meta={docs.contrato.meta}
          onFileSelect={f => processFile("contrato", f)} onRemove={() => removeDoc("contrato")}
          icon={<ScrollText size={19} />}
        />
        <div className="border-t border-cf-border" />
        <UploadArea
          stepNumber="4" title="Faturamento" description="Relatório de faturamento mensal — PDF ou planilha Excel (.xlsx)"
          status={docs.faturamento.status} fileName={docs.faturamento.file?.name} meta={docs.faturamento.meta}
          onFileSelect={f => processFile("faturamento", f)} onRemove={() => removeDoc("faturamento")}
          icon={<TrendingUp size={19} />}
        />
        <div className="border-t border-cf-border" />
        <UploadArea
          stepNumber="5" title="SCR / Bacen — Atual" description="Relatório SCR do período mais recente"
          status={docs.scr.status} fileName={docs.scr.file?.name} meta={docs.scr.meta}
          onFileSelect={f => processFile("scr", f)} onRemove={() => removeDoc("scr")}
          icon={<BarChart3 size={19} />}
        />
        <div className="border-t border-cf-border" />
        <UploadArea
          stepNumber="6" title="Protestos" description="Certidão de protestos da empresa"
          status={docs.protestos.status} fileName={docs.protestos.file?.name} meta={docs.protestos.meta}
          onFileSelect={f => processFile("protestos", f)} onRemove={() => removeDoc("protestos")}
          icon={<AlertTriangle size={19} />}
        />
        <div className="border-t border-cf-border" />
        <UploadArea
          stepNumber="7" title="Processos Judiciais" description="Relatório de processos judiciais"
          status={docs.processos.status} fileName={docs.processos.file?.name} meta={docs.processos.meta}
          onFileSelect={f => processFile("processos", f)} onRemove={() => removeDoc("processos")}
          icon={<Scale size={19} />}
        />
        <div className="border-t border-cf-border" />
        <UploadArea
          stepNumber="8" title="Grupo Econômico" description="Relatório de empresas do grupo econômico"
          status={docs.grupoEconomico.status} fileName={docs.grupoEconomico.file?.name} meta={docs.grupoEconomico.meta}
          onFileSelect={f => processFile("grupoEconomico", f)} onRemove={() => removeDoc("grupoEconomico")}
          icon={<Network size={19} />}
        />
        <div className="border-t border-cf-border border-dashed" />
        <UploadArea
          stepNumber="▿" title="SCR / Bacen — Anterior (opcional)" description="Relatório SCR do período anterior para comparativo"
          status={docs.scrAnterior.status} fileName={docs.scrAnterior.file?.name} meta={docs.scrAnterior.meta}
          onFileSelect={f => processFile("scrAnterior", f)} onRemove={() => removeDoc("scrAnterior")}
          icon={<GitCompareArrows size={19} />}
        />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-cf-danger-bg border border-cf-danger/20 rounded-xl p-3 space-y-1">
          {errors.map(([k, d]) => (
            <p key={k} className="text-xs text-cf-danger flex items-center gap-2 font-medium">
              <AlertCircle size={13} />{k === "scrAnterior" ? "SCR ANTERIOR" : k.toUpperCase()}: {d.error}
            </p>
          ))}
        </div>
      )}

      {/* Progress + CTA */}
      <div className="card p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalRequired }).map((_, i) => (
              <div key={i} className={`h-1.5 w-8 rounded-full transition-all duration-300 ${i < doneCount ? "bg-cf-green" : i === doneCount && anyProcessing ? "bg-cf-navy animate-pulse" : "bg-cf-border"}`} />
            ))}
            {/* Indicador SCR anterior (opcional) */}
            <div className={`h-1.5 w-4 rounded-full transition-all duration-300 ml-1 ${scrAnteriorDone ? "bg-blue-400" : "bg-cf-border/50"}`} />
          </div>
          <span className="text-xs text-cf-text-3 font-medium">
            {doneCount}/{totalRequired}
            {scrAnteriorDone && " + comparativo"}
          </span>
        </div>

        <button
          onClick={() => allDone && onComplete(extracted, {
              cnpj: docs.cnpj.file || undefined,
              qsa: docs.qsa.file || undefined,
              contrato: docs.contrato.file || undefined,
              faturamento: docs.faturamento.file || undefined,
              scr: docs.scr.file || undefined,
              protestos: docs.protestos.file || undefined,
              processos: docs.processos.file || undefined,
              grupoEconomico: docs.grupoEconomico.file || undefined,
              scrAnterior: docs.scrAnterior.file || undefined,
            })}
          disabled={!allDone || anyProcessing}
          className="btn-primary"
        >
          Prosseguir para Revisão
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
