"use client";
// v2
import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, ArrowLeft, AlertTriangle, AlertCircle, RefreshCw } from "lucide-react";
import { ExtractedData, Socio, QSASocio, FaturamentoMensal, SCRModalidade, SCRInstituicao, SCRData, IRSocioData } from "@/types";
import { avaliarQualidade, podeAvancar, getAvisos } from "./review/shared";
import { SectionCNPJ } from "./review/SectionCNPJ";
import { SectionQSA } from "./review/SectionQSA";
import { SectionContrato } from "./review/SectionContrato";
import { SectionFaturamento } from "./review/SectionFaturamento";
import { SectionSCR } from "./review/SectionSCR";
import { SectionDRE } from "./review/SectionDRE";
import { SectionBalanco } from "./review/SectionBalanco";
import { SectionCurvaABC } from "./review/SectionCurvaABC";
import { SectionIRSocios } from "./review/SectionIRSocios";
import { SectionRelatorioVisita } from "./review/SectionRelatorioVisita";

export const DRAFT_KEY = "cf_review_draft_v2";

interface ReviewStepProps {
  data: ExtractedData;
  onComplete: (data: ExtractedData) => void;
  onBack: () => void;
}

export default function ReviewStep({ data, onComplete, onBack }: ReviewStepProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [form, setForm] = useState<ExtractedData>(() => {
    const d: ExtractedData = JSON.parse(JSON.stringify(data));
    if (!d.dre) d.dre = { anos: [], crescimentoReceita: "", tendenciaLucro: "estavel", periodoMaisRecente: "", observacoes: "" };
    if (!d.balanco) d.balanco = { anos: [], periodoMaisRecente: "", tendenciaPatrimonio: "estavel", observacoes: "" };
    if (!d.curvaABC) d.curvaABC = { clientes: [], totalClientesNaBase: 0, totalClientesExtraidos: 0, periodoReferencia: "", receitaTotalBase: "", concentracaoTop3: "", concentracaoTop5: "", concentracaoTop10: "", totalClientesClasseA: 0, receitaClasseA: "", maiorCliente: "", maiorClientePct: "", alertaConcentracao: false };
    if (!d.irSocios) d.irSocios = [];
    if (!d.relatorioVisita) d.relatorioVisita = { dataVisita: "", responsavelVisita: "", localVisita: "", duracaoVisita: "", estruturaFisicaConfirmada: false, funcionariosObservados: 0, estoqueVisivel: false, estimativaEstoque: "", operacaoCompativelFaturamento: false, maquinasEquipamentos: false, descricaoEstrutura: "", pontosPositivos: [], pontosAtencao: [], recomendacaoVisitante: "aprovado", nivelConfiancaVisita: "medio", presencaSocios: false, sociosPresentes: [], documentosVerificados: [], observacoesLivres: "" };
    return d;
  });

  const [open, setOpen] = useState(() => {
    const qFat = avaliarQualidade("faturamento", data.faturamento as unknown as Record<string, unknown>);
    const qScr = avaliarQualidade("scr", data.scr as unknown as Record<string, unknown>);
    const qContrato = avaliarQualidade("contrato", data.contrato as unknown as Record<string, unknown>);
    return {
      cnpj: true, qsa: true,
      contrato: qContrato.score !== "good",
      faturamento: true,
      scr: qScr.score !== "good" || qFat.score === "error",
      dre: false, balanco: false, curvaABC: false, irSocios: false, relatorioVisita: false,
    };
  });

  const [showSCRDetails, setShowSCRDetails] = useState(false);
  const [bureauStatus, setBureauStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [bureauMsg, setBureauMsg] = useState("");
  const [forcarAvancar, setForcarAvancar] = useState(false);
  const isFirstRender = useRef(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, savedAt: new Date().toISOString() }));
        setSavedAt(new Date());
        isFirstRender.current = false;
      } catch { /* storage may be full */ }
    }, isFirstRender.current ? 1500 : 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // ── Bureau re-query ────────────────────────────────────────────────────────
  const reconsultarBuros = useCallback(async () => {
    const cnpj = form.cnpj?.cnpj;
    if (!cnpj) { setBureauMsg("CNPJ não encontrado nos dados."); setBureauStatus("error"); return; }
    setBureauStatus("loading"); setBureauMsg("");
    try {
      const res = await fetch("/api/bureaus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj, data: form }),
      });
      const json = await res.json();
      if (json.success && json.merged) {
        setForm(prev => ({ ...prev, ...json.merged }));
        const consultados: string[] = json.merged?.bureausConsultados || [];
        setBureauMsg(consultados.length > 0 ? `Consultado: ${consultados.join(", ")}` : "Consulta concluída.");
        setBureauStatus("done");
      } else {
        setBureauMsg(json.error || "Erro na consulta.");
        setBureauStatus("error");
      }
    } catch {
      setBureauMsg("Erro de rede ao consultar birôs.");
      setBureauStatus("error");
    }
  }, [form]);

  const toggle = (k: keyof typeof open) => setOpen(p => ({ ...p, [k]: !p[k] }));

  // ── CNPJ setters ──────────────────────────────────────────────────────────
  const setCNPJ = (k: keyof typeof form.cnpj, v: string) =>
    setForm(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));

  // ── QSA setters ──────────────────────────────────────────────────────────
  const setQSAField = (k: "capitalSocial", v: string) => setForm(p => ({ ...p, qsa: { ...p.qsa, [k]: v } }));
  const setQSASocio = (i: number, k: keyof QSASocio, v: string) =>
    setForm(p => { const q = [...p.qsa.quadroSocietario]; q[i] = { ...q[i], [k]: v }; return { ...p, qsa: { ...p.qsa, quadroSocietario: q } }; });
  const addQSASocio = () => setForm(p => ({ ...p, qsa: { ...p.qsa, quadroSocietario: [...p.qsa.quadroSocietario, { nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }] } }));
  const removeQSASocio = (i: number) => setForm(p => {
    const q = p.qsa.quadroSocietario.filter((_, idx) => idx !== i);
    return { ...p, qsa: { ...p.qsa, quadroSocietario: q.length > 0 ? q : [{ nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }] } };
  });

  // ── Contrato setters ──────────────────────────────────────────────────────
  const setContrato = (k: keyof typeof form.contrato, v: string | boolean) => setForm(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSocio = (i: number, k: keyof Socio, v: string) =>
    setForm(p => { const s = [...p.contrato.socios]; s[i] = { ...s[i], [k]: v }; return { ...p, contrato: { ...p.contrato, socios: s } }; });
  const addSocio = () => setForm(p => ({ ...p, contrato: { ...p.contrato, socios: [...p.contrato.socios, { nome: "", cpf: "", participacao: "", qualificacao: "" }] } }));
  const removeSocio = (i: number) => setForm(p => {
    const s = p.contrato.socios.filter((_, idx) => idx !== i);
    return { ...p, contrato: { ...p.contrato, socios: s.length > 0 ? s : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }] } };
  });

  // ── Faturamento setters ───────────────────────────────────────────────────
  const setFatMes = (i: number, k: keyof FaturamentoMensal, v: string) =>
    setForm(p => { const m = [...p.faturamento.meses]; m[i] = { ...m[i], [k]: v }; return { ...p, faturamento: { ...p.faturamento, meses: m } }; });
  const addFatMes = () => setForm(p => ({ ...p, faturamento: { ...p.faturamento, meses: [...p.faturamento.meses, { mes: "", valor: "" }] } }));
  const removeFatMes = (i: number) => setForm(p => ({ ...p, faturamento: { ...p.faturamento, meses: p.faturamento.meses.filter((_, idx) => idx !== i) } }));

  // ── SCR setters ───────────────────────────────────────────────────────────
  const setSCR = (k: keyof SCRData, v: string) => setForm(p => ({ ...p, scr: { ...p.scr, [k]: v } }));
  const setSCRMod = (i: number, k: keyof SCRModalidade, v: string) =>
    setForm(p => { const m = [...p.scr.modalidades]; m[i] = { ...m[i], [k]: v }; return { ...p, scr: { ...p.scr, modalidades: m } }; });
  const addSCRMod = () => setForm(p => ({ ...p, scr: { ...p.scr, modalidades: [...p.scr.modalidades, { nome: "", total: "", aVencer: "", vencido: "", participacao: "" }] } }));
  const removeSCRMod = (i: number) => setForm(p => ({ ...p, scr: { ...p.scr, modalidades: p.scr.modalidades.filter((_, idx) => idx !== i) } }));
  const setSCRInst = (i: number, k: keyof SCRInstituicao, v: string) =>
    setForm(p => { const inst = [...p.scr.instituicoes]; inst[i] = { ...inst[i], [k]: v }; return { ...p, scr: { ...p.scr, instituicoes: inst } }; });
  const addSCRInst = () => setForm(p => ({ ...p, scr: { ...p.scr, instituicoes: [...p.scr.instituicoes, { nome: "", valor: "" }] } }));
  const removeSCRInst = (i: number) => setForm(p => ({ ...p, scr: { ...p.scr, instituicoes: p.scr.instituicoes.filter((_, idx) => idx !== i) } }));

  // ── DRE setters ───────────────────────────────────────────────────────────
  const setDRE = (k: string, v: string) => setForm(p => ({ ...p, dre: p.dre ? { ...p.dre, [k]: v } : p.dre }));
  const setDREAno = (anoIdx: number, k: string, v: string) =>
    setForm(p => {
      if (!p.dre) return p;
      const anos = [...p.dre.anos];
      anos[anoIdx] = { ...anos[anoIdx], [k]: v } as typeof anos[0];
      return { ...p, dre: { ...p.dre, anos } };
    });

  // ── Balanço setters ───────────────────────────────────────────────────────
  const setBalanco = (k: string, v: string) => setForm(p => ({ ...p, balanco: p.balanco ? { ...p.balanco, [k]: v } : p.balanco }));
  const setBalancoAno = (anoIdx: number, k: string, v: string) =>
    setForm(p => {
      if (!p.balanco) return p;
      const anos = [...p.balanco.anos];
      anos[anoIdx] = { ...anos[anoIdx], [k]: v } as typeof anos[0];
      return { ...p, balanco: { ...p.balanco, anos } };
    });

  // ── Curva ABC setters ─────────────────────────────────────────────────────
  const setCurvaABCField = (k: string, v: string | number | boolean) =>
    setForm(p => ({ ...p, curvaABC: p.curvaABC ? { ...p.curvaABC, [k]: v } : p.curvaABC }));
  const setCurvaABCCliente = (idx: number, k: string, v: string) =>
    setForm(p => {
      if (!p.curvaABC) return p;
      const clientes = [...p.curvaABC.clientes];
      clientes[idx] = { ...clientes[idx], [k]: v } as typeof clientes[0];
      return { ...p, curvaABC: { ...p.curvaABC, clientes } };
    });
  const addCurvaABCCliente = () =>
    setForm(p => ({ ...p, curvaABC: p.curvaABC ? { ...p.curvaABC, clientes: [...p.curvaABC.clientes, { posicao: p.curvaABC.clientes.length + 1, nome: "", cnpjCpf: "", valorFaturado: "", percentualReceita: "", percentualAcumulado: "", classe: "" }] } : p.curvaABC }));
  const removeCurvaABCCliente = (idx: number) =>
    setForm(p => ({ ...p, curvaABC: p.curvaABC ? { ...p.curvaABC, clientes: p.curvaABC.clientes.filter((_, i) => i !== idx) } : p.curvaABC }));

  // ── IR setters ────────────────────────────────────────────────────────────
  const setIRSocio = (idx: number, k: keyof IRSocioData, v: string | boolean) =>
    setForm(p => { if (!p.irSocios) return p; const arr = [...p.irSocios]; arr[idx] = { ...arr[idx], [k]: v }; return { ...p, irSocios: arr }; });
  const addIRSocio = () =>
    setForm(p => ({ ...p, irSocios: [...(p.irSocios || []), { nomeSocio: "", cpf: "", anoBase: "", tipoDocumento: "recibo" as const, numeroRecibo: "", dataEntrega: "", situacaoMalhas: false, debitosEmAberto: false, descricaoDebitos: "", rendimentosTributaveis: "", rendimentosIsentos: "", rendimentoTotal: "", impostoDefinido: "", valorQuota: "", bensImoveis: "", bensVeiculos: "", aplicacoesFinanceiras: "", outrosBens: "", totalBensDireitos: "", dividasOnus: "", patrimonioLiquido: "", impostoPago: "", impostoRestituir: "", temSociedades: false, sociedades: [], coerenciaComEmpresa: true, observacoes: "" }] }));
  const removeIRSocio = (idx: number) =>
    setForm(p => ({ ...p, irSocios: p.irSocios!.filter((_, i) => i !== idx) }));

  // ── Relatório de Visita setters ───────────────────────────────────────────
  const setVisita = (k: string, v: string | boolean) => setForm(p => ({ ...p, relatorioVisita: p.relatorioVisita ? { ...p.relatorioVisita, [k]: v } : p.relatorioVisita }));
  const setVisitaLista = (k: "pontosPositivos" | "pontosAtencao", idx: number, v: string) =>
    setForm(p => { if (!p.relatorioVisita) return p; const arr = [...p.relatorioVisita[k]]; arr[idx] = v; return { ...p, relatorioVisita: { ...p.relatorioVisita, [k]: arr } }; });
  const addVisitaLista = (k: "pontosPositivos" | "pontosAtencao") =>
    setForm(p => ({ ...p, relatorioVisita: p.relatorioVisita ? { ...p.relatorioVisita, [k]: [...p.relatorioVisita[k], ""] } : p.relatorioVisita }));
  const removeVisitaLista = (k: "pontosPositivos" | "pontosAtencao", idx: number) =>
    setForm(p => ({ ...p, relatorioVisita: p.relatorioVisita ? { ...p.relatorioVisita, [k]: p.relatorioVisita[k].filter((_, i) => i !== idx) } : p.relatorioVisita }));

  // ── Quality ───────────────────────────────────────────────────────────────
  const qualityMap = {
    cnpj:       avaliarQualidade("cnpj",       form.cnpj       as unknown as Record<string, unknown>),
    qsa:        avaliarQualidade("qsa",        form.qsa        as unknown as Record<string, unknown>),
    contrato:   avaliarQualidade("contrato",   form.contrato   as unknown as Record<string, unknown>),
    faturamento:avaliarQualidade("faturamento",form.faturamento as unknown as Record<string, unknown>),
    scr:        avaliarQualidade("scr",        form.scr        as unknown as Record<string, unknown>),
  };
  const goodCount    = Object.values(qualityMap).filter(q => q.score === "good").length;
  const warningCount = Object.values(qualityMap).filter(q => q.score === "warning").length;
  const errorCount   = Object.values(qualityMap).filter(q => q.score === "error").length;
  const { pode, motivos } = podeAvancar(qualityMap);
  const avisos = getAvisos(qualityMap);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-slide-up space-y-4">
      {savedAt && (
        <div className="flex items-center justify-end gap-1.5 text-[10px] text-cf-text-3">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Rascunho salvo às {savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {/* Quality banner */}
      {!pode && !forcarAvancar ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">Nao e possivel prosseguir</p>
              <ul className="space-y-1">{motivos.map((m, i) => <li key={i} className="text-xs text-red-600 flex items-start gap-1"><span className="mt-0.5">→</span>{m}</li>)}</ul>
              <p className="text-[10px] text-red-400 mt-2">Corrija os campos destacados em vermelho ou reenvie os documentos com problema.</p>
            </div>
          </div>
        </div>
      ) : pode && avisos.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 mb-1">Dados incompletos — revise antes de prosseguir</p>
              <ul className="space-y-1">{avisos.map((a, i) => <li key={i} className="text-xs text-amber-600 flex items-start gap-1"><span className="mt-0.5">→</span>{a}</li>)}</ul>
              <p className="text-[10px] text-amber-400 mt-2">Voce pode prosseguir, mas o relatorio pode ficar incompleto.</p>
            </div>
          </div>
        </div>
      ) : errorCount === 0 && warningCount === 0 ? (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-green-700">Todos os {goodCount} documentos foram extraidos com boa qualidade</p>
            <p className="text-[10px] text-green-500 mt-0.5">Revise os dados e prossiga para gerar o relatorio</p>
          </div>
        </div>
      ) : null}

      {/* Sections */}
      <SectionCNPJ data={form.cnpj} set={setCNPJ} expanded={open.cnpj} onToggle={() => toggle("cnpj")} quality={qualityMap.cnpj} />
      <SectionQSA data={form.qsa} setField={setQSAField} setSocio={setQSASocio} addSocio={addQSASocio} removeSocio={removeQSASocio} expanded={open.qsa} onToggle={() => toggle("qsa")} quality={qualityMap.qsa} />
      <SectionContrato data={form.contrato} set={setContrato} setSocio={setSocio} addSocio={addSocio} removeSocio={removeSocio} expanded={open.contrato} onToggle={() => toggle("contrato")} quality={qualityMap.contrato} />
      <SectionFaturamento data={form.faturamento} setMes={setFatMes} addMes={addFatMes} removeMes={removeFatMes} expanded={open.faturamento} onToggle={() => toggle("faturamento")} quality={qualityMap.faturamento} />
      <SectionSCR data={form.scr} anterior={form.scrAnterior ?? undefined} set={setSCR} setMod={setSCRMod} addMod={addSCRMod} removeMod={removeSCRMod} setInst={setSCRInst} addInst={addSCRInst} removeInst={removeSCRInst} showDetails={showSCRDetails} setShowDetails={setShowSCRDetails} expanded={open.scr} onToggle={() => toggle("scr")} quality={qualityMap.scr} />
      {form.dre && <SectionDRE data={form.dre} set={setDRE} setAno={setDREAno} expanded={open.dre} onToggle={() => toggle("dre")} />}
      {form.balanco && <SectionBalanco data={form.balanco} set={setBalanco} setAno={setBalancoAno} expanded={open.balanco} onToggle={() => toggle("balanco")} />}
      {form.curvaABC && <SectionCurvaABC data={form.curvaABC} setField={setCurvaABCField} setCliente={setCurvaABCCliente} addCliente={addCurvaABCCliente} removeCliente={removeCurvaABCCliente} expanded={open.curvaABC} onToggle={() => toggle("curvaABC")} />}
      {form.irSocios !== undefined && <SectionIRSocios data={form.irSocios!} set={setIRSocio} add={addIRSocio} remove={removeIRSocio} expanded={open.irSocios} onToggle={() => toggle("irSocios")} />}
      {form.relatorioVisita && <SectionRelatorioVisita data={form.relatorioVisita} set={setVisita} setLista={setVisitaLista} addLista={addVisitaLista} removeLista={removeVisitaLista} expanded={open.relatorioVisita} onToggle={() => toggle("relatorioVisita")} />}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="btn-secondary"><ArrowLeft size={15} /> Voltar</button>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <button onClick={reconsultarBuros} disabled={bureauStatus === "loading"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${bureauStatus === "loading" ? "border-cf-border text-cf-text-3 cursor-not-allowed" : bureauStatus === "done" ? "border-green-300 text-green-700 bg-green-50 hover:bg-green-100" : bureauStatus === "error" ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100" : "border-cf-border text-cf-text-2 bg-white hover:bg-cf-surface"}`}>
              <RefreshCw size={13} className={bureauStatus === "loading" ? "animate-spin" : ""} />
              {bureauStatus === "loading" ? "Consultando..." : "Re-consultar Birôs"}
            </button>
            {bureauMsg && <span className={`text-[10px] ${bureauStatus === "error" ? "text-red-500" : "text-green-600"}`}>{bureauMsg}</span>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <button onClick={() => onComplete(form)} disabled={!pode && !forcarAvancar}
              title={!pode && !forcarAvancar ? "Corrija os erros criticos antes de prosseguir" : undefined}
              className={`btn-primary ${!pode && !forcarAvancar ? "opacity-50 cursor-not-allowed" : ""}`}>
              {pode || forcarAvancar ? "Gerar Relatorio" : "Corrija os erros primeiro"} <ArrowRight size={15} />
            </button>
            {!pode && !forcarAvancar && (
              <button onClick={() => setForcarAvancar(true)} className="text-[10px] text-cf-text-4 hover:text-cf-text-2 underline transition-colors" style={{ minHeight: "auto" }}>
                Prosseguir mesmo assim
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
