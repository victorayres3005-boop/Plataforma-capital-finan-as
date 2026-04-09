"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import UploadStep, { OriginalFiles } from "@/components/UploadStep";
import ReviewStep from "@/components/ReviewStep";
import { useAnimatedCounter } from "@/lib/useAnimatedCounter";
import { useOnboarding } from "@/lib/useOnboarding";
import WelcomeModal from "@/components/WelcomeModal";
import OnboardingTooltip from "@/components/OnboardingTooltip";
import FirstCollectionChecklist from "@/components/FirstCollectionChecklist";
import GenerateStep from "@/components/GenerateStep";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { AppStep, ExtractedData, DocumentCollection, Notification, SCRData } from "@/types";
import { DRAFT_KEY } from "@/components/ReviewStep";
import Link from "next/link";
import { LogOut, User, Menu, X, Clock, Shield, Plus, Building2, ArrowRight, ArrowLeft, Calendar, Home, Bell, Search, Loader2, Settings, HelpCircle } from "lucide-react";

const defaultData: ExtractedData = {
  cnpj: { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" },
  qsa: { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] },
  contrato: { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" },
  faturamento: { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" },
  scr: { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" },
  scrAnterior: null,
  protestos: { vigentesQtd:"",vigentesValor:"",regularizadosQtd:"",regularizadosValor:"",detalhes:[] },
  processos: { passivosTotal:"",ativosTotal:"",valorTotalEstimado:"",temRJ:false,distribuicao:[],bancarios:[],fiscais:[],fornecedores:[],outros:[] },
  grupoEconomico: { empresas:[] },
  resumoRisco: "",
};

// ── Hydrate ExtractedData from saved CollectionDocuments ──
function hydrateFromCollection(docs: { type: string; extracted_data: Record<string, unknown> }[]): ExtractedData {
  const result: ExtractedData = JSON.parse(JSON.stringify(defaultData));
  const typeMap: Record<string, keyof ExtractedData> = {
    cnpj: "cnpj",
    qsa: "qsa",
    contrato_social: "contrato",
    faturamento: "faturamento",
    scr_bacen: "scr",
    protestos: "protestos",
    processos: "processos",
    grupo_economico: "grupoEconomico",
    curva_abc: "curvaABC",
    dre: "dre",
    balanco: "balanco",
    ir_socio: "irSocios",
    relatorio_visita: "relatorioVisita",
  };

  for (const doc of docs) {
    if (doc.type === "scr_bacen") continue; // handled separately below
    const field = typeMap[doc.type];
    if (!field || !doc.extracted_data) continue;
    // Remove internal flags before hydrating
    const { _editedManually, ...data } = doc.extracted_data;
    void _editedManually;
    // irSocios is an array — push each doc as a new entry instead of object spread
    if (field === "irSocios") {
      const arr = ((result as unknown as Record<string, unknown>)[field] as unknown[]) || [];
      (result as unknown as Record<string, unknown>)[field] = [...arr, data];
      continue;
    }
    (result as unknown as Record<string, unknown>)[field] = {
      ...(result as unknown as Record<string, unknown>)[field] as object,
      ...data,
    };
  }

  const scrDocs = docs.filter(d => d.type === "scr_bacen");

  // Separa PJ (empresa) de PF (sócios)
  const scrEmpresa = scrDocs.filter(d =>
    (d.extracted_data?.tipoPessoa as string) === "PJ" ||
    !(d.extracted_data?.tipoPessoa) // fallback para docs antigos sem tipoPessoa
  );
  const scrSociosDocs = scrDocs.filter(d =>
    (d.extracted_data?.tipoPessoa as string) === "PF"
  );

  // SCR da empresa — lógica existente de sort por período
  if (scrEmpresa.length === 1) {
    const { _editedManually: _em1, ...data1 } = scrEmpresa[0].extracted_data!;
    void _em1;
    result.scr = { ...result.scr, ...data1 } as ExtractedData["scr"];
  } else if (scrEmpresa.length >= 2) {
    const sorted = [...scrEmpresa].sort((a, b) => {
      const periodoA = String(a.extracted_data?.periodoReferencia || "00/0000");
      const periodoB = String(b.extracted_data?.periodoReferencia || "00/0000");
      const [mA, yA] = periodoA.split("/").map(s => parseInt(s, 10) || 0);
      const [mB, yB] = periodoB.split("/").map(s => parseInt(s, 10) || 0);
      if (yB !== yA) return yB - yA;
      return mB - mA;
    });
    const { _editedManually: _em1, ...data1 } = sorted[0].extracted_data!;
    void _em1;
    const { _editedManually: _em2, ...data2 } = sorted[1].extracted_data!;
    void _em2;
    result.scr = { ...result.scr, ...data1 } as ExtractedData["scr"];
    result.scrAnterior = { ...result.scrAnterior, ...data2 } as ExtractedData["scr"];
  }

  // SCR dos sócios PF — agrupa por CPF e ordena períodos
  if (scrSociosDocs.length > 0) {
    const porCpf: Record<string, typeof scrSociosDocs> = {};
    for (const doc of scrSociosDocs) {
      const cpf = String(doc.extracted_data?.cnpjSCR || doc.extracted_data?.cpfSCR || "desconhecido");
      if (!porCpf[cpf]) porCpf[cpf] = [];
      porCpf[cpf].push(doc);
    }

    result.scrSocios = Object.entries(porCpf).map(([cpf, docs]) => {
      const sorted = [...docs].sort((a, b) => {
        const periodoA = String(a.extracted_data?.periodoReferencia || "00/0000");
        const periodoB = String(b.extracted_data?.periodoReferencia || "00/0000");
        const [mA, yA] = periodoA.split("/").map(s => parseInt(s, 10) || 0);
        const [mB, yB] = periodoB.split("/").map(s => parseInt(s, 10) || 0);
        if (yB !== yA) return yB - yA;
        return mB - mA;
      });
      const atual = sorted[0].extracted_data as unknown as SCRData;
      const anterior = sorted[1]?.extracted_data as unknown as SCRData | undefined;
      return {
        nomeSocio: String(atual?.nomeCliente || cpf),
        cpfSocio: cpf,
        tipoPessoa: "PF" as const,
        periodoAtual: atual,
        periodoAnterior: anterior,
      };
    });
  }

  return result;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "agora";
  if (mins < 60) return `ha ${mins} min`;
  if (hours < 24) return `ha ${hours}h`;
  if (days === 1) return "ontem";
  return `ha ${days} dias`;
}

function calcularMetricasDashboard(collections: DocumentCollection[]) {
  const finalizadas = collections.filter(c => c.status === "finished");
  const porDecisao = {
    aprovado: finalizadas.filter(c => c.decisao === "APROVADO").length,
    condicional: finalizadas.filter(c => c.decisao === "APROVACAO_CONDICIONAL").length,
    pendente: finalizadas.filter(c => c.decisao === "PENDENTE").length,
    reprovado: finalizadas.filter(c => c.decisao === "REPROVADO").length,
  };
  const aprovadas = finalizadas.filter(c => (c.decisao === "APROVADO" || c.decisao === "APROVACAO_CONDICIONAL") && c.fmm_12m && c.fmm_12m > 0);
  const fmmMedio = aprovadas.length > 0 ? aprovadas.reduce((s, c) => s + (c.fmm_12m || 0), 0) / aprovadas.length : 0;
  const agora = Date.now();
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const inicio = agora - (i + 1) * 7 * 24 * 3600 * 1000;
    const fim = agora - i * 7 * 24 * 3600 * 1000;
    const label = i === 0 ? "Essa sem." : i === 1 ? "Sem. passada" : `${i + 1} sem.`;
    const count = collections.filter(c => { const t = new Date(c.created_at).getTime(); return t >= inicio && t < fim; }).length;
    return { label, count };
  }).reverse();
  const taxaAprovacao = finalizadas.length > 0 ? Math.round(((porDecisao.aprovado + porDecisao.condicional) / finalizadas.length) * 100) : 0;
  return { porDecisao, fmmMedio, semanas, taxaAprovacao, totalFinalizadas: finalizadas.length };
}

function AnimatedNumber({ value, loading, delay = 0 }: { value: number; loading: boolean; delay?: number }) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const animated = useAnimatedCounter(inView && !loading ? value : 0, 1200, delay);
  return <span ref={ref}>{loading ? "—" : animated}</span>;
}

function Logo({ light = false, height = 27 }: { light?: boolean; height?: number }) {
  const blue = light ? "#ffffff" : "#203b88";
  const green = light ? "#a8d96b" : "#73b815";
  const w = Math.round(height * 7.26);
  return (
    <svg width={w} height={height} viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke={blue} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={blue} />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill={blue}>capital</tspan>
        <tspan fill={green}>finanças</tspan>
      </text>
    </svg>
  );
}

const stepLabels: Record<AppStep, string> = {
  upload: "Envio de Documentos",
  review: "Revisão dos Dados",
  generate: "Gerar Relatório",
};

const stepDescriptions: Record<AppStep, string> = {
  upload: "Envie os documentos para iniciar a extração automática",
  review: "Revise os campos extraídos e corrija se necessário",
  generate: "Adicione o parecer e escolha o formato do relatório",
};

export default function HomePage() {
  const [step, setStep] = useState<AppStep>("upload");
  const [extractedData, setExtractedData] = useState<ExtractedData>(defaultData);
  const [originalFiles, setOriginalFiles] = useState<OriginalFiles>({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] });
  const [resumedDocs, setResumedDocs] = useState<import("@/types").CollectionDocument[] | undefined>(undefined);
  const { user, loading: authLoading, signOut } = useAuth();
  const { welcomeSeen, firstCollectionDone, loaded: onboardingLoaded, markWelcomeSeen, markTooltipSeen, markFirstCollectionDone, isTooltipSeen } = useOnboarding(user?.id);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [dateFilter, setDateFilter] = useState<"hoje" | "7dias" | "30dias" | "custom">("30dias");
  const [customDate, setCustomDate] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "finished" | "in_progress">("all");
  const [decisaoFilter, setDecisaoFilter] = useState<"all" | "APROVADO" | "APROVACAO_CONDICIONAL" | "PENDENTE" | "REPROVADO">("all");
  const [resumingCollection, setResumingCollection] = useState(false);
  const [dashPeriodo, setDashPeriodo] = useState<"7d" | "30d" | "90d">("30d");
  const [localDraft, setLocalDraft] = useState<{ form: ExtractedData; savedAt: string } | null>(null);
  const [listaLimit, setListaLimit] = useState(10);

  const dashCollections = useMemo(() => {
    const dias = dashPeriodo === "7d" ? 7 : dashPeriodo === "30d" ? 30 : 90;
    const corte = Date.now() - dias * 24 * 3600 * 1000;
    return collections.filter(c => new Date(c.created_at).getTime() >= corte);
  }, [collections, dashPeriodo]);

  const metricas = useMemo(() => calcularMetricasDashboard(dashCollections), [dashCollections]);

  // ── Resume collection from URL param ──
  const handleResumeCollection = useCallback(async (collectionId: string) => {
    setResumingCollection(true);
    try {
      const supabase = createClient();
      const { data: col, error } = await supabase
        .from("document_collections")
        .select("*")
        .eq("id", collectionId)
        .single();

      if (error || !col) {
        toast.error("Coleta não encontrada.");
        setResumingCollection(false);
        return;
      }

      const docs = (col.documents || []) as { type: string; extracted_data: Record<string, unknown> }[];
      const hydrated = hydrateFromCollection(docs);

      // Load resumoRisco from the parecer if it was saved
      if (col.documents?.some((d: { extracted_data?: { parecer?: string } }) => d.extracted_data?.parecer)) {
        const parecerDoc = col.documents.find((d: { type: string }) => d.type === "parecer");
        if (parecerDoc?.extracted_data?.parecer) {
          hydrated.resumoRisco = String(parecerDoc.extracted_data.parecer);
        }
      }

      setExtractedData(hydrated);
      setResumedDocs(docs as import("@/types").CollectionDocument[]);
      setShowDashboard(false);
      setStep(col.status === "finished" ? "generate" : "upload");

      // Clean URL
      window.history.replaceState({}, "", "/");
    } catch {
      toast.error("Erro ao carregar coleta.");
    } finally {
      setResumingCollection(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    if (resumeId) {
      handleResumeCollection(resumeId);
    }
  }, [handleResumeCollection]);

  // ── Check localStorage for a draft in progress ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { form: ExtractedData; savedAt: string };
      if (!parsed?.form || !parsed?.savedAt) return;
      // Only show draft if less than 48h old
      const age = Date.now() - new Date(parsed.savedAt).getTime();
      if (age > 48 * 3600 * 1000) { localStorage.removeItem(DRAFT_KEY); return; }
      setLocalDraft(parsed);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Busca e realtime de coletas ──
  const fetchCollections = useCallback(async () => {
    if (!user) { setLoadingCollections(false); return; }
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("document_collections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setCollections((data as DocumentCollection[]) || []);
    } catch { /* silent */ }
    finally { setLoadingCollections(false); }
  }, [user]);

  // Carrega na montagem e quando volta ao dashboard
  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  useEffect(() => {
    if (showDashboard) fetchCollections();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDashboard]);

  // Realtime: atualiza ao vivo quando coleta é criada/alterada
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel("collections_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "document_collections", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setCollections(prev => {
            const exists = prev.some(c => c.id === (payload.new as DocumentCollection).id);
            if (exists) return prev;
            return [payload.new as DocumentCollection, ...prev].slice(0, 50);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "document_collections", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setCollections(prev =>
            prev.map(c => c.id === (payload.new as DocumentCollection).id ? payload.new as DocumentCollection : c)
          );
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Notificações persistentes ──
  useEffect(() => {
    if (!user) return;
    const loadNotifications = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setNotifications(data as Notification[]);
    };
    loadNotifications();

    // Realtime subscription
    const supabase = createClient();
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev].slice(0, 20));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleNotify = useCallback(async (message: string) => {
    if (!user) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .insert({ user_id: user.id, message })
      .select()
      .single();
    if (data && !error) {
      setNotifications(prev => [data as Notification, ...prev].slice(0, 20));
    }
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [user, notifications]);

  const clearAllNotifications = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
    setShowNotifications(false);
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-cf-bg flex flex-col">

      {/* ══════════════════════════════════════════════
          NAVBAR — Identity Visual Capital Finanças
          ══════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled ? "#ffffff" : "#ffffff",
          boxShadow: scrolled
            ? "0 2px 20px rgba(32,59,136,0.08)"
            : "0 1px 3px rgba(32,59,136,0.04)",
        }}
      >
        {/* Desktop navbar */}
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="h-16 sm:h-[72px] flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex items-center gap-4">
              <Link href="/"><Logo height={26} /></Link>
              <div className="hidden md:block h-6 w-px bg-cf-border" />
              <span className="hidden md:block text-xs font-semibold text-cf-navy/60 uppercase tracking-wider">
                Consolidador
              </span>
            </div>

            {/* Right: User area + CTAs */}
            <div className="flex items-center gap-3">
              <a
                href="/historico"
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full transition-all duration-200 border"
                style={{
                  color: "#203b88",
                  borderColor: "rgba(32,59,136,0.2)",
                  minHeight: "auto",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#203b88";
                  e.currentTarget.style.backgroundColor = "rgba(32,59,136,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(32,59,136,0.2)";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Clock size={13} />
                Histórico
              </a>
              <a
                href="/ajuda"
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full transition-all duration-200 text-cf-text-3 hover:text-cf-navy hover:bg-cf-bg"
                style={{ minHeight: "auto" }}
              >
                <HelpCircle size={13} />
              </a>
              <a
                href="/configuracoes"
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full transition-all duration-200 text-cf-text-3 hover:text-cf-navy hover:bg-cf-bg"
                style={{ minHeight: "auto" }}
              >
                <Settings size={13} />
              </a>

              {!authLoading && user ? (
                <div className="flex items-center gap-2">
                  {/* Notificações */}
                  <div className="relative">
                    <button
                      onClick={() => setShowNotifications(p => !p)}
                      className="relative w-9 h-9 rounded-full flex items-center justify-center text-cf-text-3 hover:bg-cf-surface transition-colors"
                      style={{ minHeight: "auto" }}
                    >
                      <Bell size={16} />
                      {unreadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full bg-cf-green text-white text-[9px] font-bold flex items-center justify-center px-1">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                    {showNotifications && (
                      <div className="absolute right-0 top-11 w-80 bg-white rounded-xl border border-cf-border shadow-lg z-50 overflow-hidden">
                        <div className="px-4 py-3 bg-cf-bg border-b border-cf-border flex items-center justify-between">
                          <p className="text-xs font-bold text-cf-text-1">Notificacoes {unreadCount > 0 && `(${unreadCount})`}</p>
                          {notifications.length > 0 && (
                            <button onClick={clearAllNotifications} className="text-[10px] text-cf-text-4 hover:text-cf-danger transition-colors" style={{ minHeight: "auto" }}>
                              Limpar todas
                            </button>
                          )}
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <p className="text-xs text-cf-text-3 text-center py-8">Nenhuma notificacao</p>
                          ) : notifications.map(n => (
                            <div key={n.id} className={`px-4 py-3 border-b border-cf-border/50 last:border-0 ${n.read ? "" : "bg-cf-navy/[0.03]"}`}>
                              <p className="text-xs text-cf-text-1">{n.message}</p>
                              <p className="text-[10px] text-cf-text-4 mt-1">{timeAgo(n.created_at)}</p>
                            </div>
                          ))}
                        </div>
                        {unreadCount > 0 && (
                          <button onClick={markAllRead}
                            className="w-full text-xs font-semibold text-cf-navy py-2.5 hover:bg-cf-bg transition-colors border-t border-cf-border" style={{ minHeight: "auto" }}>
                            Marcar todas como lidas
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Perfil link */}
                  <a href="/perfil" className="hidden sm:flex items-center gap-2 bg-cf-surface px-3 py-1.5 rounded-full hover:bg-cf-surface-2 transition-colors" style={{ minHeight: "auto" }}>
                    <div className="w-6 h-6 rounded-full bg-cf-navy flex items-center justify-center">
                      <User size={12} className="text-white" />
                    </div>
                    <span className="text-xs font-semibold text-cf-text-2 truncate max-w-[100px]">
                      {user.user_metadata?.full_name || user.email?.split("@")[0]}
                    </span>
                  </a>
                  <button
                    onClick={signOut}
                    className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-danger px-3 py-2 rounded-full border border-cf-border hover:border-cf-danger/30 transition-all"
                    style={{ minHeight: "auto" }}
                  >
                    <LogOut size={13} /> Sair
                  </button>
                </div>
              ) : !authLoading && !user ? (
                <a
                  href="/login"
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-full text-white transition-opacity duration-200 hover:opacity-80"
                  style={{ backgroundColor: "#73b815", minHeight: "auto" }}
                >
                  <User size={13} /> Entrar
                </a>
              ) : (
                <div className="flex items-center gap-1.5 bg-cf-green/10 border border-cf-green/25 rounded-full px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-green inline-block animate-pulse" />
                  <span className="text-xs font-semibold text-cf-green tracking-wide">Online</span>
                </div>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-cf-navy hover:bg-cf-surface transition-colors"
                style={{ minHeight: "auto" }}
                aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          className="lg:hidden overflow-hidden transition-all duration-300"
          style={{
            maxHeight: mobileMenuOpen ? 200 : 0,
            opacity: mobileMenuOpen ? 1 : 0,
            borderTop: mobileMenuOpen ? "1px solid #edf2fb" : "none",
          }}
        >
          <div className="px-5 py-3 space-y-1">
            <a
              href="/historico"
              className="block px-4 py-3 rounded-xl text-sm font-medium text-cf-navy hover:bg-cf-surface transition-colors"
              style={{ minHeight: "auto" }}
              onClick={() => setMobileMenuOpen(false)}
            >
              Histórico
            </a>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          HERO — Brand gradient header
          ══════════════════════════════════════════════ */}
      <div className="bg-hero-gradient relative overflow-hidden">
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/[0.03]" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-[#73b815]/[0.06]" />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-5">
              <Shield size={13} className="text-[#73b815]" />
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                FIDC regulado pela CVM
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              Consolidador de Documentos
            </h1>
            <p className="text-blue-200/90 mt-3 text-lg max-w-lg mx-auto leading-relaxed">
              Envie seus documentos, extraia os dados automaticamente e gere relatórios consolidados em minutos.
            </p>
          </div>

          {/* Step indicator */}
          <div className="mt-8 max-w-md mx-auto">
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 px-6 py-4">
              {(["upload", "review", "generate"] as AppStep[]).map((s, i) => {
                const idx = ["upload", "review", "generate"].indexOf(step);
                const done = i < idx;
                const active = s === step;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                      ${done
                        ? "bg-[#73b815] border-[#73b815] text-white"
                        : active
                          ? "bg-white border-white text-cf-navy"
                          : "border-white/30 text-white/40"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:block transition-all
                      ${active ? "text-white" : done ? "text-[#a8d96b]" : "text-white/40"}`}
                    >
                      {stepLabels[s]}
                    </span>
                    {i < 2 && <div className="w-8 h-px bg-white/20 mx-1 hidden sm:block" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Wave */}
        <div className="relative h-10 -mb-px">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,20 C240,40 480,0 720,20 C960,40 1200,0 1440,20 L1440,40 L0,40 Z" fill="#f5f7fb" />
          </svg>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
          ══════════════════════════════════════════════ */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-8 py-8">

        {resumingCollection ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 animate-fade-in">
            <Loader2 size={24} className="text-cf-navy animate-spin" />
            <p className="text-sm text-cf-text-3">Carregando coleta...</p>
          </div>
        ) : showDashboard ? (() => {
          // Filtro de data
          const now = new Date();
          const filterStart = (() => {
            if (dateFilter === "hoje") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
            if (dateFilter === "7dias") { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
            if (dateFilter === "30dias") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
            if (dateFilter === "custom" && customDate) return new Date(customDate);
            return new Date(0);
          })();
          const filterEnd = (() => {
            if (dateFilter === "custom" && customDate) { const d = new Date(customDate); d.setHours(23,59,59,999); return d; }
            return new Date();
          })();
          const filteredByDate = collections.filter(c => {
            const d = new Date(c.created_at);
            return d >= filterStart && d <= filterEnd;
          });
          const filteredBySearch = searchQuery.trim()
            ? filteredByDate.filter(c => {
                const q = searchQuery.toLowerCase();
                return (c.company_name || c.label || "").toLowerCase().includes(q)
                  || (c.cnpj || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
                  || (c.cnpj || "").toLowerCase().includes(q);
              })
            : filteredByDate;
          const filteredByCompany = selectedCompany
            ? filteredBySearch.filter(c => (c.company_name || c.label) === selectedCompany)
            : filteredBySearch;
          const filteredByStatus = statusFilter !== "all"
            ? filteredByCompany.filter(c => c.status === statusFilter)
            : filteredByCompany;
          const filtered = decisaoFilter !== "all"
            ? filteredByStatus.filter(c => c.decisao === decisaoFilter)
            : filteredByStatus;
          const hasActiveFilters = searchQuery.trim() || selectedCompany || statusFilter !== "all" || decisaoFilter !== "all";
          const visibleItems = filtered.slice(0, listaLimit);
          const hasMore = filtered.length > listaLimit;
          const companies = Array.from(new Set(collections.map(c => c.company_name || c.label).filter((l): l is string => !!l)));

          return (
          <div className="max-w-4xl mx-auto animate-fade-in">

            {/* ── Rascunho em andamento ── */}
            {localDraft && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Clock size={15} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Análise em andamento</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {localDraft.form.cnpj?.razaoSocial || "Empresa não identificada"} — salvo {timeAgo(localDraft.savedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setExtractedData(localDraft.form);
                      setLocalDraft(null);
                      setShowDashboard(false);
                      setStep("review");
                    }}
                    className="text-xs font-semibold px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    Continuar análise
                  </button>
                  <button
                    onClick={() => {
                      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
                      setLocalDraft(null);
                    }}
                    className="text-xs font-semibold px-3 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {/* Header + Filtro de data */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <h2 className="text-[28px] font-bold text-[#0f172a]">
                  {user ? `Olá, ${(user.user_metadata?.full_name || user.email?.split("@")[0] || "").split(" ")[0]}` : "Bem-vindo"}
                </h2>
                <p className="text-sm text-cf-text-3 mt-1">Painel do Consolidador de Documentos</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-white border border-cf-border rounded-xl p-1">
                  {([
                    { key: "hoje", label: "Hoje" },
                    { key: "7dias", label: "7 dias" },
                    { key: "30dias", label: "30 dias" },
                    { key: "custom", label: "" },
                  ] as { key: typeof dateFilter; label: string }[]).map(f => (
                    f.key === "custom" ? (
                      <button key="custom" onClick={() => setDateFilter("custom")}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${dateFilter === "custom" ? "bg-cf-navy text-white" : "text-cf-text-3 hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        <Calendar size={12} />
                      </button>
                    ) : (
                      <button key={f.key} onClick={() => setDateFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dateFilter === f.key ? "bg-cf-navy text-white" : "text-cf-text-3 hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        {f.label}
                      </button>
                    )
                  ))}
                </div>
                {dateFilter === "custom" && (
                  <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                    className="input-field py-1.5 px-3 text-xs w-[140px]" />
                )}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-cf-text-4" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setListaLimit(10); }}
                    placeholder="Buscar empresa ou CNPJ..."
                    className="input-field py-1.5 pl-8 pr-3 text-xs w-[200px]"
                  />
                </div>
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Coletas", value: filtered.length, accent: "border-l-cf-navy" },
                { label: "Finalizadas", value: filtered.filter(c => c.status === "finished").length, accent: "border-l-cf-green" },
                { label: "Em andamento", value: filtered.filter(c => c.status === "in_progress").length, accent: "border-l-[#d97706]" },
                { label: "Empresas", value: new Set(filtered.map(c => c.company_name || c.label).filter(Boolean)).size, accent: "border-l-cf-navy" },
              ].map((m, i) => (
                <div key={m.label} className={`bg-white border border-cf-border ${m.accent} border-l-[3px] rounded-lg px-4 py-4 animate-stagger-${i + 1}`}>
                  <p className="text-[11px] font-medium text-cf-text-3 uppercase tracking-wider mb-1">{m.label}</p>
                  <p className="text-2xl font-bold text-cf-text-1">
                    <AnimatedNumber value={m.value} loading={loadingCollections} delay={i * 100} />
                  </p>
                </div>
              ))}
            </div>

            {/* Dashboard de métricas */}
            {collections.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-cf-text-2">Visao geral</h3>
                  <div className="flex gap-1">
                    {(["7d", "30d", "90d"] as const).map(pp => (
                      <button key={pp} onClick={() => setDashPeriodo(pp)}
                        className={`px-3 py-1 text-xs rounded-full transition-colors ${dashPeriodo === pp ? "bg-cf-navy text-white" : "text-cf-text-3 hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        {pp === "7d" ? "7 dias" : pp === "30d" ? "30 dias" : "90 dias"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Taxa de aprovação */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                    <p className="text-[11px] text-cf-text-4 uppercase tracking-wider mb-3">Taxa de aprovacao</p>
                    <div className="flex items-end gap-2 mb-3">
                      <span className="text-3xl font-bold text-cf-text-1">{metricas.taxaAprovacao}%</span>
                      <span className="text-xs text-cf-text-4 mb-1">de {metricas.totalFinalizadas} finalizadas</span>
                    </div>
                    {metricas.totalFinalizadas > 0 && (
                      <div className="space-y-1.5">
                        {[
                          { label: "Aprovado", count: metricas.porDecisao.aprovado, color: "bg-green-500" },
                          { label: "Condicional", count: metricas.porDecisao.condicional, color: "bg-amber-400" },
                          { label: "Pendente", count: metricas.porDecisao.pendente, color: "bg-gray-300" },
                          { label: "Reprovado", count: metricas.porDecisao.reprovado, color: "bg-red-400" },
                        ].map(dd => (
                          <div key={dd.label} className="flex items-center gap-2">
                            <span className="text-[10px] text-cf-text-3 w-20 flex-shrink-0">{dd.label}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${dd.color} transition-all duration-500`} style={{ width: metricas.totalFinalizadas > 0 ? `${(dd.count / metricas.totalFinalizadas) * 100}%` : "0%" }} />
                            </div>
                            <span className="text-xs font-medium text-cf-text-2 w-4 text-right">{dd.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Coletas por semana */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                    <p className="text-[11px] text-cf-text-4 uppercase tracking-wider mb-3">Coletas por semana</p>
                    <div className="flex items-end gap-1 h-16 mb-2">
                      {metricas.semanas.map((ss, i) => {
                        const maxC = Math.max(...metricas.semanas.map(x => x.count), 1);
                        const pct = (ss.count / maxC) * 100;
                        const isLast = i === metricas.semanas.length - 1;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                            {ss.count > 0 && <span className="text-[9px] text-cf-text-4">{ss.count}</span>}
                            <div className={`w-full rounded-t transition-all duration-500 ${isLast ? "bg-cf-navy" : "bg-gray-200"}`} style={{ height: `${Math.max(pct, ss.count > 0 ? 8 : 2)}%` }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-cf-text-4">{metricas.semanas[0]?.label}</span>
                      <span className="text-[9px] text-cf-text-4">{metricas.semanas[metricas.semanas.length - 1]?.label}</span>
                    </div>
                  </div>

                  {/* FMM médio */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                    <p className="text-[11px] text-cf-text-4 uppercase tracking-wider mb-3">FMM medio (aprovadas)</p>
                    <p className="text-3xl font-bold text-cf-text-1 mb-3">{metricas.fmmMedio > 0 ? `R$ ${(metricas.fmmMedio / 1000).toFixed(0)}K` : "—"}</p>
                    <p className="text-[10px] text-cf-text-4 leading-relaxed">Media das empresas aprovadas ou condicionais no periodo</p>
                    {metricas.fmmMedio > 0 && (
                      <div className="mt-3 pt-3 border-t border-cf-border">
                        <p className="text-[10px] text-cf-text-3">Baseado em {dashCollections.filter(c => c.status === "finished" && (c.decisao === "APROVADO" || c.decisao === "APROVACAO_CONDICIONAL") && c.fmm_12m && c.fmm_12m > 0).length} empresa(s)</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Barra de filtros ── */}
            <div className="mb-6 space-y-3">
              {/* Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-cf-text-4 uppercase tracking-widest w-16 flex-shrink-0">Status</span>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: "all", label: "Todos" },
                    { key: "finished", label: "Finalizadas" },
                    { key: "in_progress", label: "Em andamento" },
                  ] as { key: typeof statusFilter; label: string }[]).map(f => (
                    <button key={f.key} onClick={() => { setStatusFilter(f.key); setListaLimit(10); }}
                      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border ${statusFilter === f.key ? "bg-cf-navy text-white border-cf-navy" : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                      style={{ minHeight: "auto" }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Decisão */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-cf-text-4 uppercase tracking-widest w-16 flex-shrink-0">Decisão</span>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: "all", label: "Todas" },
                    { key: "APROVADO", label: "Aprovado", color: "text-green-700 bg-green-50 border-green-200" },
                    { key: "APROVACAO_CONDICIONAL", label: "Condicional", color: "text-amber-600 bg-amber-50 border-amber-200" },
                    { key: "PENDENTE", label: "Pendente", color: "text-gray-600 bg-gray-50 border-gray-200" },
                    { key: "REPROVADO", label: "Reprovado", color: "text-red-600 bg-red-50 border-red-200" },
                  ] as { key: typeof decisaoFilter; label: string; color?: string }[]).map(f => (
                    <button key={f.key} onClick={() => { setDecisaoFilter(f.key); setListaLimit(10); }}
                      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border ${decisaoFilter === f.key ? (f.color || "bg-cf-navy text-white border-cf-navy") : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                      style={{ minHeight: "auto" }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Empresa (só se houver mais de uma) */}
              {companies.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-cf-text-4 uppercase tracking-widest w-16 flex-shrink-0">Empresa</span>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => { setSelectedCompany(null); setListaLimit(10); }}
                      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border ${!selectedCompany ? "bg-cf-navy text-white border-cf-navy" : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                      style={{ minHeight: "auto" }}>
                      Todas
                    </button>
                    {companies.map(c => (
                      <button key={c} onClick={() => { setSelectedCompany(selectedCompany === c ? null : c); setListaLimit(10); }}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border flex items-center gap-1 ${selectedCompany === c ? "bg-cf-navy text-white border-cf-navy" : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        <Building2 size={10} />{c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Limpar filtros */}
              {hasActiveFilters && (
                <button
                  onClick={() => { setSearchQuery(""); setStatusFilter("all"); setDecisaoFilter("all"); setSelectedCompany(null); setListaLimit(10); }}
                  className="text-[11px] font-semibold text-cf-navy hover:underline"
                  style={{ minHeight: "auto" }}>
                  Limpar filtros
                </button>
              )}
            </div>

            {/* CTA: Nova coleta */}
            <OnboardingTooltip id="nova-coleta" message="Clique aqui para iniciar a analise de um novo cedente. Voce vai fazer upload dos documentos e a IA cuida do resto." position="bottom" isSeen={isTooltipSeen("nova-coleta")} onSeen={() => markTooltipSeen("nova-coleta")}>
            <button
              onClick={() => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); }}
              className="btn-green w-full sm:w-auto h-12 text-sm px-8 mb-8 animate-stagger-5"
            >
              <Plus size={18} /> Nova Coleta de Documentos
            </button>
            </OnboardingTooltip>

            {/* Últimas coletas (filtradas) */}
            {filtered.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-cf-text-1">
                    {dateFilter === "hoje" ? "Coletas de Hoje" : dateFilter === "7dias" ? "Últimos 7 dias" : dateFilter === "custom" ? "Data selecionada" : "Últimas Coletas"}
                    <span className="ml-2 text-xs font-normal text-cf-text-3">({filtered.length})</span>
                  </h3>
                  <a href="/historico" className="text-xs font-semibold text-cf-navy hover:underline">Ver histórico completo</a>
                </div>
                <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden divide-y divide-[#f1f5f9]" style={{ animationDelay: "0.4s", animationFillMode: "both" }}>
                  {visibleItems.map((col, i) => (
                    <div key={col.id} className={`px-5 py-4 flex items-center gap-4 hover:bg-[#f8fafc] transition-colors duration-150 animate-stagger-${Math.min(i + 1, 8)}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0f172a] truncate">{col.company_name || col.label || "Sem identificacao"}</p>
                        <p className="text-xs text-[#94a3b8] mt-0.5">
                          {col.cnpj && <span className="font-mono">{col.cnpj} · </span>}
                          {new Date(col.created_at).toLocaleDateString("pt-BR")} · {col.documents?.length || 0} doc(s)
                          {col.fmm_12m ? ` · FMM R$ ${Number(col.fmm_12m).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}/mes` : ""}
                        </p>
                        {col.observacoes && (
                          <p className="text-[11px] text-[#64748b] mt-1 italic line-clamp-1">&ldquo;{col.observacoes}&rdquo;</p>
                        )}
                      </div>
                      <span className={`text-[11px] font-semibold flex-shrink-0 ${col.status === "finished" ? "text-[#22c55e]" : "text-[#f59e0b]"}`}>
                        {col.status === "finished" ? "Finalizada" : "Em andamento"}
                      </span>
                      {col.decisao && (
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 animate-scale-in ${
                          col.decisao === "APROVADO" ? "text-green-700 bg-green-50 border-green-200"
                          : col.decisao === "REPROVADO" ? "text-red-600 bg-red-50 border-red-200"
                          : "text-amber-600 bg-amber-50 border-amber-200"
                        }`}>
                          {col.decisao === "APROVACAO_CONDICIONAL" ? "CONDICIONAL" : col.decisao}
                        </span>
                      )}
                      {col.status === "in_progress" && (
                        <button
                          onClick={() => handleResumeCollection(col.id)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex-shrink-0 transition-colors"
                          style={{ backgroundColor: "#203b88", minHeight: "auto" }}
                        >
                          Retomar
                        </button>
                      )}
                      <a href={`/historico?highlight=${col.id}`} className="text-cf-navy hover:text-cf-green transition-colors flex-shrink-0" style={{ minHeight: "auto" }}>
                        <ArrowRight size={16} />
                      </a>
                    </div>
                  ))}
                </div>
                {hasMore && (
                  <button
                    onClick={() => setListaLimit(prev => prev + 10)}
                    className="mt-3 w-full text-xs font-semibold text-cf-navy hover:text-cf-green py-2.5 border border-cf-border rounded-xl bg-white hover:bg-cf-bg transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    Ver mais ({filtered.length - listaLimit} restantes)
                  </button>
                )}
              </div>
            )}
            {filtered.length === 0 && !loadingCollections && (
              <div className="text-center py-12 text-cf-text-3">
                <p className="text-sm">Nenhuma coleta encontrada para o período selecionado.</p>
              </div>
            )}
          </div>
          );
        })() : (

        <div className="max-w-2xl mx-auto">

          {/* Botão voltar + Step header */}
          <div className="mb-6">
            <button onClick={() => {
              if (step === "upload") { setShowDashboard(true); }
              else if (step === "review") { setStep("upload"); }
              else { setStep("review"); }
            }} className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-navy mb-4 transition-colors" style={{ minHeight: "auto" }}>
              {step === "upload" ? <><Home size={13} /> Voltar ao painel</> : <><ArrowLeft size={13} /> Voltar</>}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cf-navy flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {step === "upload" ? "1" : step === "review" ? "2" : "3"}
              </div>
              <div>
                <h2 className="text-lg font-bold text-cf-text-1">{stepLabels[step]}</h2>
                <p className="text-xs text-cf-text-3">{stepDescriptions[step]}</p>
              </div>
            </div>
          </div>

          {step === "upload" && (
            <UploadStep
              onComplete={(d, files) => { setExtractedData(d); setOriginalFiles(files); setResumedDocs(undefined); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setStep("review"); }}
              resumedDocs={resumedDocs}
              initialData={resumedDocs && resumedDocs.length > 0 ? extractedData : undefined}
            />
          )}
          {step === "review" && (
            <ReviewStep data={extractedData} onComplete={(d) => { setExtractedData(d); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setLocalDraft(null); setStep("generate"); }} onBack={() => setStep("upload")} />
          )}
          {step === "generate" && (
            <GenerateStep data={extractedData} originalFiles={originalFiles} onBack={() => setStep("review")} onReset={() => { setShowDashboard(true); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); }} onNotify={handleNotify} onFirstCollection={markFirstCollectionDone} />
          )}
        </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════
          FOOTER — Brand footer
          ══════════════════════════════════════════════ */}
      <footer className="mt-12" style={{ background: "linear-gradient(180deg, #162d6e 0%, #0f1f5c 100%)" }}>
        {/* Green accent line */}
        <div className="h-1 bg-gradient-to-r from-[#73b815] via-[#73b815] to-[#a8d96b]" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo light height={24} />
          <div className="text-center sm:text-right">
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} Capital Finanças. Todos os direitos reservados.
            </p>
            <p className="text-xs text-white/25 mt-0.5">
              Documentos processados localmente com segurança
            </p>
          </div>
        </div>
      </footer>

      {/* First collection checklist */}
      {onboardingLoaded && !showDashboard && user && !firstCollectionDone && (
        <FirstCollectionChecklist
          currentStep={step === "upload" ? 1 : step === "review" ? 2 : 3}
          onDismiss={markFirstCollectionDone}
        />
      )}

      {/* Welcome Modal — first time only */}
      {onboardingLoaded && !welcomeSeen && user && (
        <WelcomeModal onClose={markWelcomeSeen} />
      )}
    </div>
  );
}
