"use client";
// v2
import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, ArrowLeft, AlertTriangle, AlertCircle, RefreshCw, CheckCircle2, ShieldCheck, ClipboardList } from "lucide-react";
import { ExtractedData, Socio, QSASocio, FaturamentoMensal, SCRModalidade, SCRInstituicao, SCRData, IRSocioData } from "@/types";
import { avaliarQualidade, podeAvancar, getAvisos } from "./review/shared";
import { SectionCNPJ } from "./review/SectionCNPJ";
import { SectionQSA } from "./review/SectionQSA";
import { SectionContrato } from "./review/SectionContrato";
import { SectionFaturamento } from "./review/SectionFaturamento";
import { SectionSCR } from "./review/SectionSCR";
import { SectionSCRSocios } from "./review/SectionSCRSocios";
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
  onDataChange?: (data: ExtractedData) => void;
}

// Computa diff raso entre duas versoes do ExtractedData, retornando os campos
// alterados no formato { "cnpj.razaoSocial": { old, new }, ... }.
// Usado para telemetria: capturar quais campos o analista corrige com mais frequencia.
function computeDiff(initial: Record<string, unknown>, current: Record<string, unknown>, prefix = ""): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  const keysArr = Array.from(new Set<string>([...Object.keys(initial || {}), ...Object.keys(current || {})]));
  for (const k of keysArr) {
    const path = prefix ? `${prefix}.${k}` : k;
    const a = (initial as Record<string, unknown>)?.[k];
    const b = (current as Record<string, unknown>)?.[k];
    if (a === b) continue;
    if (typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b) && a !== null && b !== null) {
      Object.assign(out, computeDiff(a as Record<string, unknown>, b as Record<string, unknown>, path));
      continue;
    }
    // Arrays e primitivos sao logados como um diff unico
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out[path] = { old: a, new: b };
    }
  }
  return out;
}

export default function ReviewStep({ data, onComplete, onBack, onDataChange }: ReviewStepProps) {
  // Snapshot inicial para capturar correcoes do analista (telemetria observability)
  const initialDataRef = useRef<ExtractedData>(data);
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

  // Estado de abertura das sub-abas. Na primeira vez, aplica a regra automática
  // (abre seções cuja qualidade dos dados está ruim); depois disso, preserva as
  // escolhas manuais do analista via localStorage — senão as sub-abas "Contrato
  // Social" e "SCR dos Sócios" abriam toda vez que o usuário entrava na Revisão.
  // Contrato só abre automaticamente em caso de erro crítico (score === "error"),
  // não mais em qualquer qualidade abaixo de "good".
  const OPEN_KEY = "cf_review_open_v1";
  const [open, setOpen] = useState(() => {
    const qFat = avaliarQualidade("faturamento", data.faturamento as unknown as Record<string, unknown>);
    const qScr = avaliarQualidade("scr", data.scr as unknown as Record<string, unknown>);
    const qContrato = avaliarQualidade("contrato", data.contrato as unknown as Record<string, unknown>);
    const qCnpj = avaliarQualidade("cnpj", data.cnpj as unknown as Record<string, unknown>);
    const qQsa  = avaliarQualidade("qsa",  data.qsa  as unknown as Record<string, unknown>);
    const defaults = {
      cnpj: qCnpj.score === "error",
      qsa:  qQsa.score  === "error",
      contrato: qContrato.score === "error",
      faturamento: qFat.score !== "good",
      scr: qScr.score !== "good" || qFat.score === "error",
      dre: false, balanco: false, curvaABC: false, irSocios: false, relatorioVisita: false,
      scrSocios: false,
    };
    if (typeof window === "undefined") return defaults;
    try {
      const saved = localStorage.getItem(OPEN_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<typeof defaults>;
        return { ...defaults, ...parsed };
      }
    } catch { /* ignore */ }
    return defaults;
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
      // Notifica o pai para auto-save no Supabase
      onDataChange?.(form);
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
      console.log("[bureaus] reconsulta BDC + Assertiva + demais bureaus...");
      const res = await fetch("/api/bureaus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj, data: form }),
      });
      const json = await res.json();
      console.log(`[bureaus] resposta: success=${json.success} | bureaus=${Object.keys(json.bureaus ?? {}).join(",")} | mock=${Object.entries(json.bureaus ?? {}).filter(([,v]: any) => v?.mock).map(([k]) => k).join(",") || "nenhum"}`);
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

  const toggle = (k: keyof typeof open) => setOpen(p => {
    const next = { ...p, [k]: !p[k] };
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

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
    return { ...p, contrato: { ...p.contrato, socios: s } };
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

  // Empresa nova: se idadeAnos < 2, a análise vai reprovar no pré-requisito de idade
  // independentemente do faturamento — não bloquear o botão por faturamento ausente.
  const idadeAnosReview = (() => {
    const da = form.cnpj?.dataAbertura ?? "";
    let ms = 0;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(da)) {
      const [d, m, a] = da.split("/").map(Number);
      ms = Date.now() - new Date(a, m - 1, d).getTime();
    } else if (/^\d{2}\/\d{4}$/.test(da)) {
      const [m, a] = da.split("/").map(Number);
      ms = Date.now() - new Date(a, m - 1, 1).getTime();
    } else if (/^\d{4}$/.test(da)) {
      ms = Date.now() - new Date(Number(da), 0, 1).getTime();
    }
    return ms > 0 ? ms / (1000 * 60 * 60 * 24 * 365.25) : null;
  })();
  const empresaNova = idadeAnosReview !== null && idadeAnosReview < 2;

  // Se empresa nova, rebaixa faturamento de "error" → "warning" para desbloqueio
  const qualityMapEfetivo = empresaNova && qualityMap.faturamento.score === "error"
    ? { ...qualityMap, faturamento: { ...qualityMap.faturamento, score: "warning" as const } }
    : qualityMap;

  const goodCount    = Object.values(qualityMap).filter(q => q.score === "good").length;
  const warningCount = Object.values(qualityMap).filter(q => q.score === "warning").length;
  const errorCount   = Object.values(qualityMap).filter(q => q.score === "error").length;
  const { pode, motivos } = podeAvancar(qualityMapEfetivo);
  const avisos = getAvisos(qualityMap);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-slide-up" style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "80px" }}>

      {/* ── Cabeçalho unificado: identidade + qualidade ── */}
      <div style={{ background: "white", borderRadius: "14px", overflow: "hidden", border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(32,59,136,0.09)" }}>
        {/* Faixa principal navy */}
        <div style={{ padding: "24px", background: "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <ClipboardList size={12} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                <p style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>Revisão de Dados</p>
              </div>
              <p style={{ fontSize: "18px", fontWeight: 600, color: "white", margin: 0, lineHeight: 1.3 }} className="truncate">
                {form.cnpj?.razaoSocial || "Empresa"}
              </p>
              {form.cnpj?.cnpj && (
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", fontFamily: "monospace", margin: "4px 0 0" }}>{form.cnpj.cnpj}</p>
              )}
            </div>
            {savedAt && (
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", flexShrink: 0, marginTop: "2px" }}>
                Salvo {savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          {/* Chips de qualidade */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px" }}>
            {goodCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 700, padding: "5px 12px", borderRadius: "99px", background: "#22c55e", color: "white" }}>
                <CheckCircle2 size={11} /> {goodCount} OK
              </span>
            )}
            {warningCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 700, padding: "5px 12px", borderRadius: "99px", background: "rgba(245,158,11,0.25)", color: "#fcd34d", border: "1px solid rgba(245,158,11,0.3)" }}>
                <AlertTriangle size={11} /> {warningCount} Atenção
              </span>
            )}
            {errorCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 700, padding: "5px 12px", borderRadius: "99px", background: "rgba(239,68,68,0.25)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" }}>
                <AlertCircle size={11} /> {errorCount} Erro
              </span>
            )}
          </div>
        </div>

        {/* Barra de status */}
        {empresaNova && qualityMap.faturamento.score === "error" && (
          <div style={{ padding: "10px 24px", background: "#eff6ff", borderTop: "1px solid #bfdbfe" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle size={13} style={{ color: "#2563eb", flexShrink: 0 }} />
              <p style={{ fontSize: "11px", fontWeight: 600, color: "#1d4ed8", margin: 0 }}>
                Empresa com menos de 2 anos — faturamento ausente não bloqueia. A análise irá reprovar no critério de idade mínima.
              </p>
            </div>
          </div>
        )}
        {!pode && !forcarAvancar ? (
          <div style={{ padding: "12px 24px", background: "#fef2f2", borderTop: "1px solid #fecaca" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "1px" }} />
              <div>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "#991b1b", margin: "0 0 4px" }}>Não é possível prosseguir</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {motivos.map((m, i) => (
                    <li key={i} style={{ fontSize: "11px", color: "#dc2626", display: "flex", alignItems: "flex-start", gap: "4px" }}>
                      <span style={{ flexShrink: 0 }}>→</span><span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : pode && avisos.length > 0 ? (
          <div style={{ padding: "12px 24px", background: "#fffbeb", borderTop: "1px solid #fde68a" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <AlertTriangle size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "1px" }} />
              <div>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "#92400e", margin: "0 0 4px" }}>Dados incompletos — revise antes de prosseguir</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {avisos.map((a, i) => (
                    <li key={i} style={{ fontSize: "11px", color: "#b45309", display: "flex", alignItems: "flex-start", gap: "4px" }}>
                      <span style={{ flexShrink: 0 }}>→</span><span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : errorCount === 0 && warningCount === 0 ? (
          <div style={{ padding: "10px 24px", background: "#f0fdf4", borderTop: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: "10px" }}>
            <ShieldCheck size={14} style={{ color: "#16a34a", flexShrink: 0 }} />
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#15803d", margin: 0 }}>
              {goodCount} documentos extraídos com boa qualidade — revise e prossiga
            </p>
          </div>
        ) : null}
      </div>

      {/* Sections */}
      <SectionCNPJ data={form.cnpj} set={setCNPJ} expanded={open.cnpj} onToggle={() => toggle("cnpj")} quality={qualityMap.cnpj} />
      <SectionQSA data={form.qsa} setField={setQSAField} setSocio={setQSASocio} addSocio={addQSASocio} removeSocio={removeQSASocio} expanded={open.qsa} onToggle={() => toggle("qsa")} quality={qualityMap.qsa} />
      <SectionContrato data={form.contrato} set={setContrato} setSocio={setSocio} addSocio={addSocio} removeSocio={removeSocio} expanded={open.contrato} onToggle={() => toggle("contrato")} quality={qualityMap.contrato} />
      <SectionFaturamento data={form.faturamento} setMes={setFatMes} addMes={addFatMes} removeMes={removeFatMes} expanded={open.faturamento} onToggle={() => toggle("faturamento")} quality={qualityMap.faturamento} />
      <SectionSCR data={form.scr} anterior={form.scrAnterior ?? undefined} set={setSCR} setMod={setSCRMod} addMod={addSCRMod} removeMod={removeSCRMod} setInst={setSCRInst} addInst={addSCRInst} removeInst={removeSCRInst} showDetails={showSCRDetails} setShowDetails={setShowSCRDetails} expanded={open.scr} onToggle={() => toggle("scr")} quality={qualityMap.scr} />
      <SectionSCRSocios socios={form.scrSocios || []} expanded={open.scrSocios} onToggle={() => toggle("scrSocios")} quality={qualityMap.scr} />
      {form.dre && <SectionDRE data={form.dre} set={setDRE} setAno={setDREAno} expanded={open.dre} onToggle={() => toggle("dre")} />}
      {form.balanco && <SectionBalanco data={form.balanco} set={setBalanco} setAno={setBalancoAno} expanded={open.balanco} onToggle={() => toggle("balanco")} />}
      {form.curvaABC && <SectionCurvaABC data={form.curvaABC} setField={setCurvaABCField} setCliente={setCurvaABCCliente} addCliente={addCurvaABCCliente} removeCliente={removeCurvaABCCliente} expanded={open.curvaABC} onToggle={() => toggle("curvaABC")} />}
      {form.irSocios !== undefined && <SectionIRSocios data={form.irSocios!} set={setIRSocio} add={addIRSocio} remove={removeIRSocio} expanded={open.irSocios} onToggle={() => toggle("irSocios")} />}
      {form.relatorioVisita && <SectionRelatorioVisita data={form.relatorioVisita} set={setVisita} setLista={setVisitaLista} addLista={addVisitaLista} removeLista={removeVisitaLista} expanded={open.relatorioVisita} onToggle={() => toggle("relatorioVisita")} />}

      {/* Spacer sections já estão com pb-20 no container */}

      {/* ── Barra fixa inferior ── */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(32,59,136,0.1)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.08)",
          padding: "12px 24px",
        }}
      >
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          {/* Esquerda */}
          <button
            onClick={onBack}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 18px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, color: "#374151", background: "white", border: "1px solid #E5E7EB", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#203b88"; (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "white"; }}
          >
            <ArrowLeft size={14} /> Voltar
          </button>

          {/* Direita */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Re-consultar */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
              <button
                onClick={reconsultarBuros}
                disabled={bureauStatus === "loading"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "9px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  border: bureauStatus === "done" ? "1px solid #86efac" : bureauStatus === "error" ? "1px solid #fca5a5" : "1px solid #E5E7EB",
                  color: bureauStatus === "done" ? "#15803d" : bureauStatus === "error" ? "#991b1b" : "#374151",
                  background: bureauStatus === "done" ? "#f0fdf4" : bureauStatus === "error" ? "#fef2f2" : "white",
                  opacity: bureauStatus === "loading" ? 0.6 : 1,
                  transition: "all 0.15s",
                }}
              >
                <RefreshCw size={13} className={bureauStatus === "loading" ? "animate-spin" : ""} />
                {bureauStatus === "loading" ? "Consultando..." : "Re-consultar Birôs"}
              </button>
              {bureauMsg && (
                <span style={{ fontSize: "10px", fontWeight: 500, color: bureauStatus === "error" ? "#ef4444" : "#16a34a" }}>
                  {bureauMsg}
                </span>
              )}
            </div>

            {/* Gerar Relatório */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
              <button
                onClick={() => {
                  // Captura diff de correcoes do analista (fire-and-forget, nao bloqueia)
                  try {
                    const diff = computeDiff(
                      initialDataRef.current as unknown as Record<string, unknown>,
                      form as unknown as Record<string, unknown>,
                    );
                    const correctedFields = Object.keys(diff);
                    if (correctedFields.length > 0) {
                      console.log(`[review] ${correctedFields.length} campo(s) corrigido(s):`, correctedFields);
                      (async () => {
                        try {
                          const { createClient } = await import("@/lib/supabase/client");
                          const supabase = createClient();
                          const { data: userData } = await supabase.auth.getUser();
                          if (userData.user) {
                            await supabase.from("extraction_corrections").insert({
                              user_id: userData.user.id,
                              cnpj: form.cnpj?.cnpj || null,
                              corrected_fields: correctedFields,
                              diff: diff,
                              corrections_count: correctedFields.length,
                            });
                          }
                        } catch { /* nunca bloqueia */ }
                      })();
                    }
                  } catch { /* ignore */ }
                  onComplete(form);
                }}
                disabled={!pode && !forcarAvancar}
                title={!pode && !forcarAvancar ? "Corrija os erros críticos antes de prosseguir" : undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  padding: "10px 22px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, color: "white",
                  background: pode || forcarAvancar ? "linear-gradient(135deg, #192f5d 0%, #1e3a7a 100%)" : "#9CA3AF",
                  boxShadow: pode || forcarAvancar ? "0 4px 16px rgba(32,59,136,0.35)" : "none",
                  opacity: !pode && !forcarAvancar ? 0.7 : 1,
                  cursor: !pode && !forcarAvancar ? "not-allowed" : "pointer",
                  border: "none", transition: "all 0.15s",
                }}
              >
                {pode || forcarAvancar ? "Gerar Relatório" : "Corrija os erros"}
                <ArrowRight size={16} />
              </button>
              {!pode && !forcarAvancar && (
                <button
                  onClick={() => setForcarAvancar(true)}
                  style={{ fontSize: "10px", color: "#9CA3AF", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
                >
                  Prosseguir mesmo assim
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
