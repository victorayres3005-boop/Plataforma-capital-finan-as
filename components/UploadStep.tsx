"use client";

import { useState } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, AlertCircle, Info } from "lucide-react";
import UploadArea from "./UploadArea";
import { DocStatus, ExtractedData, CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData } from "@/types";

interface DocMeta { filledFields: number; isScanned: boolean; }
interface DocState { file: File | null; status: DocStatus; error?: string; meta?: DocMeta; }

const defaultCNPJ: CNPJData = { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" };
const defaultQSA: QSAData = { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] };
const defaultContrato: ContratoSocialData = { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" };
const defaultFaturamento: FaturamentoData = { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" };
const defaultSCR: SCRData = { carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" };

export interface OriginalFiles { cnpj?: File; qsa?: File; contrato?: File; faturamento?: File; scr?: File; }

type DocKey = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr';

const DOC_DEFAULTS: Record<DocKey, CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData> = {
  cnpj: defaultCNPJ, qsa: defaultQSA, contrato: defaultContrato, faturamento: defaultFaturamento, scr: defaultSCR,
};

export default function UploadStep({ onComplete }: { onComplete: (data: ExtractedData, files: OriginalFiles) => void }) {
  const [docs, setDocs] = useState<Record<DocKey, DocState>>({
    cnpj:       { file: null, status: "idle" },
    qsa:        { file: null, status: "idle" },
    contrato:   { file: null, status: "idle" },
    faturamento:{ file: null, status: "idle" },
    scr:        { file: null, status: "idle" },
  });
  const [extracted, setExtracted] = useState<ExtractedData>({
    cnpj: defaultCNPJ, qsa: defaultQSA, contrato: defaultContrato, faturamento: defaultFaturamento, scr: defaultSCR, resumoRisco: "",
  });

  const updateDoc = (type: DocKey, p: Partial<DocState>) => setDocs(prev => ({ ...prev, [type]: { ...prev[type], ...p } }));

  const processFile = async (type: DocKey, file: File) => {
    updateDoc(type, { file, status: "processing", error: undefined });
    const fd = new FormData();
    fd.append("file", file); fd.append("type", type);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      if (!res.ok || !json.success) { updateDoc(type, { status: "error", error: json.error || "Erro ao processar." }); return; }
      if (json.meta?.aiError) {
        updateDoc(type, { status: "error", error: "Não foi possível extrair dados do documento. Tente enviar em outro formato (ex: JPG/PNG para documentos escaneados)." });
        return;
      }
      setExtracted(prev => ({ ...prev, [type]: json.data }));
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
    setExtracted(prev => ({ ...prev, [type]: DOC_DEFAULTS[type] }));
  };

  const allDone = Object.values(docs).every(d => d.status === "done");
  const anyProcessing = Object.values(docs).some(d => d.status === "processing");
  const errors = Object.entries(docs).filter(([, d]) => d.status === "error");
  const doneCount = Object.values(docs).filter(d => d.status === "done").length;
  const totalDocs = 5;

  return (
    <div className="animate-slide-up space-y-4">

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-cf-navy/5 border border-cf-navy/15 rounded-xl px-4 py-3">
        <Info size={15} className="text-cf-navy flex-shrink-0 mt-0.5" />
        <p className="text-xs text-cf-text-2 leading-relaxed">
          Envie os 5 documentos obrigatórios: Cartão CNPJ, QSA, Contrato Social, Faturamento e SCR.
          Aceita PDF, Word, Excel (.xlsx) e imagens. A extração é automática — você poderá revisar todos os campos.
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
          stepNumber="5" title="SCR / Bacen" description="Relatório do Sistema de Informações de Crédito do Banco Central"
          status={docs.scr.status} fileName={docs.scr.file?.name} meta={docs.scr.meta}
          onFileSelect={f => processFile("scr", f)} onRemove={() => removeDoc("scr")}
          icon={<BarChart3 size={19} />}
        />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-cf-danger-bg border border-cf-danger/20 rounded-xl p-3 space-y-1">
          {errors.map(([k, d]) => (
            <p key={k} className="text-xs text-cf-danger flex items-center gap-2 font-medium">
              <AlertCircle size={13} />{k.toUpperCase()}: {d.error}
            </p>
          ))}
        </div>
      )}

      {/* Progress + CTA */}
      <div className="card p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalDocs }).map((_, i) => (
              <div key={i} className={`h-1.5 w-8 rounded-full transition-all duration-300 ${i < doneCount ? "bg-cf-green" : i === doneCount && anyProcessing ? "bg-cf-navy animate-pulse" : "bg-cf-border"}`} />
            ))}
          </div>
          <span className="text-xs text-cf-text-3 font-medium">{doneCount}/{totalDocs} documentos</span>
        </div>

        <button
          onClick={() => allDone && onComplete(extracted, {
              cnpj: docs.cnpj.file || undefined,
              qsa: docs.qsa.file || undefined,
              contrato: docs.contrato.file || undefined,
              faturamento: docs.faturamento.file || undefined,
              scr: docs.scr.file || undefined,
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
