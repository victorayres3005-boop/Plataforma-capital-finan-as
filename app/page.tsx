"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import UploadStep, { OriginalFiles } from "@/components/UploadStep";
import ReviewStep from "@/components/ReviewStep";
import { useOnboarding } from "@/lib/useOnboarding";
import WelcomeModal from "@/components/WelcomeModal";
import OnboardingTooltip from "@/components/OnboardingTooltip";
import FirstCollectionChecklist from "@/components/FirstCollectionChecklist";
import GenerateStep from "@/components/GenerateStep";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { AppStep, ExtractedData, DocumentCollection, Notification } from "@/types";
import { hydrateFromCollection, defaultData } from "@/lib/hydrateFromCollection";
import { buildCollectionDocs } from "@/lib/buildCollectionDocs";
import { DRAFT_KEY } from "@/components/ReviewStep";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from "next/link";
import { LogOut, User, Menu, X, Clock, Shield, Plus, Building2, ArrowRight, ArrowLeft, Calendar, Home, Bell, Search, Loader2, Settings, HelpCircle, TrendingUp, TrendingDown, Minus, ChevronDown, FileText, Hash, DollarSign, RefreshCw, CheckCircle2, XCircle, AlertCircle, RotateCcw } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

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

function calcularMetricasDashboard(collections: DocumentCollection[], periodoAnterior?: DocumentCollection[]) {
  const finalizadas = collections.filter(c => c.status === "finished");
  const porDecisao = {
    aprovado: finalizadas.filter(c => c.decisao === "APROVADO").length,
    condicional: finalizadas.filter(c => c.decisao === "APROVACAO_CONDICIONAL").length,
    pendente: finalizadas.filter(c => c.decisao === "PENDENTE").length,
    reprovado: finalizadas.filter(c => c.decisao === "REPROVADO").length,
  };
  const aprovadas = finalizadas.filter(c => (c.decisao === "APROVADO" || c.decisao === "APROVACAO_CONDICIONAL") && c.fmm_12m && c.fmm_12m > 0);
  const fmmMedio = aprovadas.length > 0 ? aprovadas.reduce((s, c) => s + (c.fmm_12m || 0), 0) / aprovadas.length : 0;
  const fmmTotal = aprovadas.reduce((s, c) => s + (c.fmm_12m || 0), 0);

  // Dados de série temporal — agrupa por dia nos últimos N dias
  const agora = Date.now();
  const diasSerie = 30;
  const serieTemporal = Array.from({ length: diasSerie }, (_, i) => {
    const dia = new Date(agora - (diasSerie - 1 - i) * 24 * 3600 * 1000);
    dia.setHours(0, 0, 0, 0);
    const proximoDia = new Date(dia.getTime() + 24 * 3600 * 1000);
    const count = collections.filter(c => {
      const t = new Date(c.created_at).getTime();
      return t >= dia.getTime() && t < proximoDia.getTime();
    }).length;
    return {
      label: dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      coletas: count,
    };
  });

  // Semanas para bar chart
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const inicio = agora - (i + 1) * 7 * 24 * 3600 * 1000;
    const fim = agora - i * 7 * 24 * 3600 * 1000;
    const label = i === 0 ? "Essa sem." : i === 1 ? "Sem. ant." : `S-${i + 1}`;
    const total = collections.filter(c => { const t = new Date(c.created_at).getTime(); return t >= inicio && t < fim; }).length;
    const aprovCount = collections.filter(c => { const t = new Date(c.created_at).getTime(); return t >= inicio && t < fim && (c.decisao === "APROVADO" || c.decisao === "APROVACAO_CONDICIONAL"); }).length;
    return { label, total, aprovadas: aprovCount };
  }).reverse();

  const taxaAprovacao = finalizadas.length > 0 ? Math.round(((porDecisao.aprovado + porDecisao.condicional) / finalizadas.length) * 100) : 0;

  // Comparação com período anterior
  const antFinalizadas = periodoAnterior?.filter(c => c.status === "finished") ?? [];
  const antTaxaAprovacao = antFinalizadas.length > 0
    ? Math.round(((antFinalizadas.filter(c => c.decisao === "APROVADO").length + antFinalizadas.filter(c => c.decisao === "APROVACAO_CONDICIONAL").length) / antFinalizadas.length) * 100)
    : 0;
  const deltaColetas = periodoAnterior ? collections.length - periodoAnterior.length : null;
  const deltaTaxa = periodoAnterior ? taxaAprovacao - antTaxaAprovacao : null;

  // Rating médio
  const comRating = finalizadas.filter(c => c.rating != null && c.rating > 0);
  const ratingMedio = comRating.length > 0 ? comRating.reduce((s, c) => s + (c.rating || 0), 0) / comRating.length : 0;
  const antComRating = antFinalizadas.filter(c => c.rating != null && c.rating > 0);
  const antRatingMedio = antComRating.length > 0 ? antComRating.reduce((s, c) => s + (c.rating || 0), 0) / antComRating.length : 0;
  const deltaRating = periodoAnterior && comRating.length > 0 && antComRating.length > 0
    ? Math.round((ratingMedio - antRatingMedio) * 10) / 10
    : null;
  const totalComRating = comRating.length;
  const ratingDistribuicao = [
    { label: "Excelente", faixa: "8 – 10",  min: 8,   max: 10,    color: "#22c55e" },
    { label: "Bom",       faixa: "6 – 7,9", min: 6,   max: 7.999, color: "#73b815" },
    { label: "Regular",   faixa: "4 – 5,9", min: 4,   max: 5.999, color: "#f59e0b" },
    { label: "Crítico",   faixa: "0 – 3,9", min: 0,   max: 3.999, color: "#ef4444" },
  ].map(f => ({
    ...f,
    count: comRating.filter(c => (c.rating || 0) >= f.min && (c.rating || 0) <= f.max).length,
  }));

  // Funil de aprovação
  const totalRecebidas = collections.length;
  const emAnalise = collections.filter(c => c.status === "in_progress").length;
  const preAprovadas = porDecisao.aprovado + porDecisao.condicional;
  const funil = [
    { label: "Empresas Recebidas", value: totalRecebidas, color: "#203b88", sub: "coletas iniciadas no período" },
    { label: "Documentos Analisados", value: finalizadas.length, color: "#2d5cce", sub: "análise concluída" },
    { label: "Pré-aprovadas", value: preAprovadas, color: "#73b815", sub: "aprovado ou condicional" },
    { label: "Aprovação Total", value: porDecisao.aprovado, color: "#22c55e", sub: "aprovado sem restrições" },
  ];

  return { porDecisao, fmmMedio, fmmTotal, semanas, serieTemporal, taxaAprovacao, totalFinalizadas: finalizadas.length, deltaColetas, deltaTaxa, ratingMedio, totalComRating, deltaRating, ratingDistribuicao, funil, totalRecebidas, emAnalise };
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

// ── Helpers para persistir estado de navegação ──
const NAV_STATE_KEY = "cf_nav_state";
const COLLECTIONS_CACHE_KEY = "cf_collections_cache";

function loadNavState(): { step: AppStep; showDashboard: boolean } | null {
  try {
    const raw = sessionStorage.getItem(NAV_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.step === "string" && typeof parsed.showDashboard === "boolean") {
      return parsed as { step: AppStep; showDashboard: boolean };
    }
  } catch { /* ignore */ }
  return null;
}

function saveNavState(step: AppStep, showDashboard: boolean) {
  // Se voltou ao dashboard, limpa o state para evitar reload em step sem collection
  if (showDashboard) {
    try { sessionStorage.removeItem(NAV_STATE_KEY); } catch { /* ignore */ }
    return;
  }
  try { sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify({ step, showDashboard })); } catch { /* ignore */ }
}

function loadCachedCollections(): DocumentCollection[] {
  try {
    const raw = sessionStorage.getItem(COLLECTIONS_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DocumentCollection[];
  } catch { return []; }
}

function saveCachedCollections(cols: DocumentCollection[]) {
  try { sessionStorage.setItem(COLLECTIONS_CACHE_KEY, JSON.stringify(cols.slice(0, 50))); } catch { /* ignore */ }
}

export default function HomePage() {
  const savedNav = loadNavState();
  const [step, setStep] = useState<AppStep>(savedNav?.step || "upload");
  const [extractedData, setExtractedData] = useState<ExtractedData>(defaultData);
  const [originalFiles, setOriginalFiles] = useState<OriginalFiles>({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] });
  const [resumedDocs, setResumedDocs] = useState<import("@/types").CollectionDocument[] | undefined>(undefined);
  // ── Auto-save no Supabase ──
  // Estrategia anti-bug:
  //  - collectionIdRef: leitura sempre fresca dentro do timer (evita stale closure)
  //  - insertInFlight: serializa o PRIMEIRO insert (impede 2 inserts paralelos = duplicacao)
  //  - dirtyData: ultima versao que precisa ser salva. Se chegar update durante save,
  //    nao descarta — fica marcada e dispara um novo save assim que terminar.
  const [collectionId, setCollectionIdState] = useState<string | null>(null);
  const collectionIdRef = useRef<string | null>(null);
  const setCollectionId = useCallback((id: string | null) => {
    collectionIdRef.current = id;
    setCollectionIdState(id);
  }, []);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertInFlight = useRef(false);
  const dirtyData = useRef<ExtractedData | null>(null);
  const autoSaveRunning = useRef(false);

  // Mínimo de documentos (tipos distintos) para criar uma coleta no banco.
  // Evita poluir o histórico com coletas abandonadas de 1-2 docs (testes,
  // cliques acidentais, uploads incompletos). Updates em coletas que JÁ
  // existem continuam normalmente — a regra é só pra INSERT.
  const MIN_DOCS_TO_SAVE = 3;

  const performSave = useCallback(async () => {
    if (autoSaveRunning.current) return;
    autoSaveRunning.current = true;
    try {
      while (dirtyData.current) {
        const data = dirtyData.current;
        dirtyData.current = null;
        const documents = buildCollectionDocs(data);
        if (documents.length === 0) continue;
        try {
          const supabase = createClient();
          const { data: session } = await supabase.auth.getUser();
          if (!session.user) continue;
          const meta = {
            company_name: data.cnpj.razaoSocial || null,
            cnpj: data.cnpj.cnpj || null,
            fmm_12m: parseFloat((data.faturamento.mediaAno || "0").replace(/\./g, "").replace(",", ".")) || null,
          };
          const currentId = collectionIdRef.current;
          if (currentId) {
            await supabase.from("document_collections")
              .update({ documents, label: data.cnpj.razaoSocial || null, ...meta })
              .eq("id", currentId);
            // Supabase virou fonte de verdade — apaga o draft local
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
          } else if (!insertInFlight.current) {
            // ── Gate: só cria coleta no banco quando houver ao menos MIN_DOCS_TO_SAVE
            // tipos de documento extraídos. Antes disso, o draft fica só em
            // localStorage (DRAFT_KEY) e não polui o histórico.
            if (documents.length < MIN_DOCS_TO_SAVE) {
              console.log(`[autoSave] aguardando: ${documents.length}/${MIN_DOCS_TO_SAVE} documentos (draft salvo em localStorage)`);
              continue;
            }
            insertInFlight.current = true;
            try {
              const { data: row, error } = await supabase.from("document_collections").insert({
                user_id: session.user.id,
                status: "in_progress",
                label: data.cnpj.razaoSocial || null,
                documents,
                ...meta,
              }).select("id").single();
              if (error) throw error;
              setCollectionId(row.id);
              try {
                const url = new URL(window.location.href);
                url.searchParams.set("resume", row.id);
                window.history.replaceState({}, "", url.toString());
              } catch { /* ignore */ }
              // Supabase virou fonte de verdade — apaga o draft local
              try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
            } finally {
              insertInFlight.current = false;
            }
          } else {
            // Insert ja em voo de outro tick — re-enfilera para tentar como UPDATE
            dirtyData.current = data;
            await new Promise(r => setTimeout(r, 100));
          }
        } catch (err) {
          console.warn("[autoSave] falhou:", err instanceof Error ? err.message : err);
        }
      }
    } finally {
      autoSaveRunning.current = false;
    }
  }, [setCollectionId]);

  const autoSaveCollection = useCallback((data: ExtractedData) => {
    dirtyData.current = data;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { performSave(); }, 800);
  }, [performSave]);
  const { user, loading: authLoading, signOut } = useAuth();
  const { welcomeSeen, firstCollectionDone, loaded: onboardingLoaded, markWelcomeSeen, markTooltipSeen, markFirstCollectionDone, isTooltipSeen } = useOnboarding(user?.id);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(savedNav?.showDashboard ?? true);

  // Volta ao dashboard limpando ?resume= e ?step= da URL para evitar que
  // o F5 releia o param e redirecione para a coleta anterior.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const goToDashboard = useCallback(() => {
    setShowDashboard(true);
    setStep("upload");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      url.searchParams.delete("step");
      window.history.replaceState({}, "", url.toString());
    } catch { /* ignore */ }
  }, []);

  // Persistir estado de navegação sempre que mudar
  useEffect(() => {
    saveNavState(step, showDashboard);
  }, [step, showDashboard]);

  // Scroll to top ao trocar de step ou sair do dashboard
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step, showDashboard]);
  const cachedCols = loadCachedCollections();
  const [collections, setCollections] = useState<DocumentCollection[]>(cachedCols);
  const [loadingCollections, setLoadingCollections] = useState(cachedCols.length === 0);
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const dashCollections = useMemo(() => {
    const dias = dashPeriodo === "7d" ? 7 : dashPeriodo === "30d" ? 30 : 90;
    const corte = Date.now() - dias * 24 * 3600 * 1000;
    return collections.filter(c => new Date(c.created_at).getTime() >= corte);
  }, [collections, dashPeriodo]);

  const dashAnterior = useMemo(() => {
    const dias = dashPeriodo === "7d" ? 7 : dashPeriodo === "30d" ? 30 : 90;
    const fim = Date.now() - dias * 24 * 3600 * 1000;
    const inicio = fim - dias * 24 * 3600 * 1000;
    return collections.filter(c => {
      const t = new Date(c.created_at).getTime();
      return t >= inicio && t < fim;
    });
  }, [collections, dashPeriodo]);

  const metricas = useMemo(() => calcularMetricasDashboard(dashCollections, dashAnterior), [dashCollections, dashAnterior]);

  // ── Resume collection from URL param ──
  const handleResumeCollection = useCallback(async (collectionId: string, forceStep?: AppStep) => {
    setResumingCollection(true);
    try {
      const supabase = createClient();
      const { data: col, error } = await supabase
        .from("document_collections")
        .select("*")
        .eq("id", collectionId)
        .single();

      if (error || !col) {
        toast.error("Coleta nao encontrada ou sem acesso.");
        setResumingCollection(false);
        // Limpa a URL e volta pro dashboard em vez de deixar o usuario travado
        // num estado de erro com ?resume= invalido (F5 repetia o erro).
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("resume");
          url.searchParams.delete("step");
          window.history.replaceState({}, "", url.toString());
        } catch { /* ignore */ }
        setShowDashboard(true);
        return;
      }

      const docs = (col.documents || []) as { type: string; extracted_data: Record<string, unknown> }[];
      // Debug temporário: logar quando os documents da coleta chegam vazios ou o hydrate parece ter perdido dados.
      // Remove isto depois que o bug "dados zerados ao voltar de /parecer" for diagnosticado.
      if (!docs.length) {
        console.warn(`[resume] Coleta ${collectionId} retornou documents=[] — dados ficarão zerados. ai_analysis presente: ${!!col.ai_analysis}`);
      } else {
        console.log(`[resume] Coleta ${collectionId} — ${docs.length} documentos, tipos:`, docs.map(d => d.type));
      }
      const hydrated = hydrateFromCollection(docs);
      if (!hydrated.cnpj?.razaoSocial && !hydrated.faturamento?.meses?.length) {
        console.warn(`[resume] Hydrate resultou em cnpj.razaoSocial vazio E faturamento.meses vazio — investigar`, {
          docsTypes: docs.map(d => d.type),
          docsKeys: docs.map(d => Object.keys(d.extracted_data ?? {}).length),
        });
      }

      // Load resumoRisco from the parecer if it was saved
      if (col.documents?.some((d: { extracted_data?: { parecer?: string } }) => d.extracted_data?.parecer)) {
        const parecerDoc = col.documents.find((d: { type: string }) => d.type === "parecer");
        if (parecerDoc?.extracted_data?.parecer) {
          hydrated.resumoRisco = String(parecerDoc.extracted_data.parecer);
        }
      }

      setExtractedData(hydrated);
      setResumedDocs(docs as import("@/types").CollectionDocument[]);
      setCollectionId(collectionId); // setter unificado: atualiza state E ref
      setShowDashboard(false);
      // Se um step foi forçado (ex: voltar do parecer), usa ele; senão usa lógica padrão
      setStep(forceStep || (col.status === "finished" ? "generate" : "upload"));

      // Mantem ?resume= na URL para suportar reload subsequente
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("resume", collectionId);
        window.history.replaceState({}, "", url.toString());
      } catch { /* ignore */ }
    } catch {
      toast.error("Erro ao carregar coleta.");
    } finally {
      setResumingCollection(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    const forceStep = params.get("step") as AppStep | null;
    if (resumeId) {
      handleResumeCollection(resumeId, forceStep || undefined);
    }
  }, [handleResumeCollection]);

  // ── Sincroniza ?step= na URL sempre que o step mudar ──
  // Sem isso, F5 na aba de analise/review volta pro upload porque o forceStep
  // lido no mount fica null. Agora toda troca de step atualiza a URL via
  // replaceState (sem navegar), e o reload respeita o step correto.
  useEffect(() => {
    if (showDashboard) return; // dashboard nao tem step
    try {
      const url = new URL(window.location.href);
      const hasResume = url.searchParams.get("resume");
      if (!hasResume) return; // sem coleta, sem step na URL
      const currentInUrl = url.searchParams.get("step");
      if (currentInUrl !== step) {
        url.searchParams.set("step", step);
        window.history.replaceState({}, "", url.toString());
      }
    } catch { /* ignore */ }
  }, [step, showDashboard]);

  // ── Draft localStorage: hoje o Supabase é fonte de verdade. So mostra o
  // draft local quando NAO ha ?resume= na URL (Supabase ja cuidaria) e quando
  // nao existe coleta in_progress recente do usuario (que tambem cuidaria). ──
  useEffect(() => {
    try {
      // Se tem resume na URL, Supabase manda — ignora draft local
      const params = new URLSearchParams(window.location.search);
      if (params.get("resume")) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { form: ExtractedData; savedAt: string };
      if (!parsed?.form || !parsed?.savedAt) return;
      const age = Date.now() - new Date(parsed.savedAt).getTime();
      if (age > 48 * 3600 * 1000) { localStorage.removeItem(DRAFT_KEY); return; }
      setLocalDraft(parsed);
    } catch { /* ignore */ }
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
      const cols = (data as DocumentCollection[]) || [];
      setCollections(cols);
      saveCachedCollections(cols);
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
        className="sticky top-0 z-50"
        style={{ backgroundColor: "#ffffff", borderBottom: "1px solid #F1F5F9", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", height: "56px" }}
      >
        <div className={`mx-auto px-6 ${step === "generate" && !showDashboard ? "max-w-[1720px]" : "max-w-6xl"}`} style={{ height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>

          {/* ── Left: Logo ── */}
          <div>
            <a href="#" onClick={e => { e.preventDefault(); goToDashboard(); }} style={{ cursor: "pointer" }}><Logo height={24} /></a>
          </div>

          {/* ── Right: nav actions ── */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>

            {/* Histórico */}
            <a
              href="/historico"
              className="hidden sm:flex items-center gap-1.5"
              style={{ fontSize: "13px", fontWeight: 500, color: "#64748B", padding: "5px 10px", borderRadius: "6px", minHeight: "auto", textDecoration: "none", transition: "background 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Clock size={14} style={{ flexShrink: 0 }} />
              Histórico
            </a>

            {/* Ajuda */}
            <a
              href="/ajuda"
              className="hidden sm:flex items-center justify-center"
              style={{ color: "#94A3B8", padding: "6px", borderRadius: "6px", minHeight: "auto", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#475569"; (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <HelpCircle size={18} />
            </a>

            {/* Configurações */}
            <a
              href="/configuracoes"
              className="hidden sm:flex items-center justify-center"
              style={{ color: "#94A3B8", padding: "6px", borderRadius: "6px", minHeight: "auto", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#475569"; (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Settings size={18} />
            </a>

            {!authLoading && user ? (
              <>
                {/* Notificações */}
                <div className="relative" style={{ marginLeft: "4px" }}>
                  <button
                    onClick={() => setShowNotifications(p => !p)}
                    style={{ position: "relative", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", padding: 0, minHeight: "auto", transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; (e.currentTarget as HTMLElement).style.color = "#475569"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <span style={{ position: "absolute", top: "-2px", right: "-2px", minWidth: "16px", height: "16px", borderRadius: "99px", background: "#22c55e", color: "white", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {showNotifications && (
                    <div className="absolute right-0 bg-white rounded-xl border border-cf-border shadow-lg z-50 overflow-hidden" style={{ top: "40px", width: "320px" }}>
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
                        <button onClick={markAllRead} className="w-full text-xs font-semibold text-cf-navy py-2.5 hover:bg-cf-bg transition-colors border-t border-cf-border" style={{ minHeight: "auto" }}>
                          Marcar todas como lidas
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Avatar + nome + chevron */}
                <a
                  href="/perfil"
                  className="hidden sm:flex items-center gap-2"
                  style={{ padding: "4px 8px", borderRadius: "8px", textDecoration: "none", minHeight: "auto", marginLeft: "4px", transition: "background 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{ width: "26px", height: "26px", borderRadius: "99px", background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "white" }}>
                      {(user.user_metadata?.full_name || user.email?.split("@")[0] || "U").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#374151", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.user_metadata?.full_name || user.email?.split("@")[0]}
                  </span>
                  <ChevronDown size={12} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                </a>

                {/* Sair */}
                <button
                  onClick={signOut}
                  className="hidden sm:flex items-center gap-1.5"
                  style={{ fontSize: "13px", fontWeight: 400, color: "#94A3B8", background: "transparent", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: "6px", minHeight: "auto", transition: "color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
                >
                  <LogOut size={14} /> Sair
                </button>
              </>
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
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ color: "#64748B", background: "transparent", border: "none", cursor: "pointer", minHeight: "auto", transition: "background 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          className="lg:hidden overflow-hidden transition-all duration-300"
          style={{ maxHeight: mobileMenuOpen ? 200 : 0, opacity: mobileMenuOpen ? 1 : 0, borderTop: mobileMenuOpen ? "1px solid #F1F5F9" : "none", background: "#ffffff" }}
        >
          <div className="px-5 py-3 space-y-1">
            <a
              href="/historico"
              className="block px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{ color: "#374151", minHeight: "auto" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              onClick={() => setMobileMenuOpen(false)}
            >
              Histórico
            </a>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          HERO — gradient completo no dashboard,
          barra compacta nas etapas internas
          ══════════════════════════════════════════════ */}
      {showDashboard ? (
        /* Hero gradient — sempre visível no dashboard */
        <div style={{ background: "linear-gradient(135deg, #1a2f6b 0%, #2a4db5 100%)", position: "relative", overflow: "hidden" }}>
          {/* Dot pattern */}
          <div
            style={{
              position: "absolute", inset: 0, opacity: 0.05,
              backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          {/* Decorative circles */}
          <div style={{ position: "absolute", top: "-80px", right: "-80px", width: "260px", height: "260px", borderRadius: "50%", background: "rgba(255,255,255,0.1)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "-64px", left: "-64px", width: "200px", height: "200px", borderRadius: "50%", background: "rgba(255,255,255,0.1)", pointerEvents: "none" }} />

          <div className="relative max-w-6xl mx-auto px-5 sm:px-8" style={{ paddingTop: "48px", paddingBottom: "64px", textAlign: "center" }}>
            {/* Badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "999px", padding: "6px 14px", marginBottom: "16px" }}>
              <Shield size={13} style={{ color: "#73b815", flexShrink: 0 }} />
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#ffffff" }}>FIDC REGULADO PELA CVM</span>
            </div>

            {/* Título */}
            <h1 style={{ fontSize: "36px", fontWeight: 700, color: "#ffffff", margin: "0 0 12px", lineHeight: 1.2, textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              Plataforma de Análise de Crédito
            </h1>

            {/* Subtítulo */}
            <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: "0 auto 28px", maxWidth: "520px" }}>
              Transforme documentos cadastrais e fiscais em pareceres<br />
              de crédito completos, com dados consolidados em minutos.
            </p>

            {/* Stepper */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0", background: "rgba(255,255,255,0.1)", borderRadius: "12px", padding: "16px 32px" }}>
              {(["upload", "review", "generate"] as AppStep[]).map((s, i) => {
                const stepIdx = ["upload", "review", "generate"].indexOf(step);
                const done = i < stepIdx;
                const active = i === stepIdx;
                const labels = ["Upload", "Revisão", "Relatório"];
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {i > 0 && (
                      <div style={{ width: "40px", height: "1px", borderTop: "1.5px dashed rgba(255,255,255,0.3)", margin: "0 8px" }} />
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: 700, flexShrink: 0, transition: "all 0.2s",
                        background: done ? "#73b815" : active ? "#1a2f6b" : "transparent",
                        border: done ? "2px solid #73b815" : active ? "2px solid #ffffff" : "2px solid rgba(255,255,255,0.3)",
                        color: done ? "#ffffff" : active ? "#ffffff" : "rgba(255,255,255,0.5)",
                      }}>
                        {done ? "✓" : i + 1}
                      </div>
                      <span style={{
                        fontSize: "13px", fontWeight: active ? 700 : 400,
                        color: active ? "#ffffff" : done ? "#a8d96b" : "rgba(255,255,255,0.5)",
                        transition: "all 0.2s",
                      }} className="hidden sm:block">
                        {labels[i]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Wave */}
          <div style={{ position: "relative", height: "40px", marginBottom: "-1px" }}>
            <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", bottom: 0, width: "100%" }} preserveAspectRatio="none">
              <path d="M0,20 C240,40 480,0 720,20 C960,40 1200,0 1440,20 L1440,40 L0,40 Z" fill="#f5f7fb" />
            </svg>
          </div>
        </div>
      ) : (
        /* Barra compacta — etapas upload/review/generate */
        <div className="bg-white border-b border-[#E5E7EB]" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div className={`mx-auto px-5 sm:px-8 h-14 flex items-center justify-between ${step === "generate" ? "max-w-[1720px]" : "max-w-6xl"}`}>
            <div className="flex items-center gap-2 sm:gap-4">
              {(["upload", "review", "generate"] as AppStep[]).map((s, i) => {
                const idx = ["upload", "review", "generate"].indexOf(step);
                const done = i < idx;
                const active = s === step;
                const labels = ["Upload", "Revisão", "Relatório"];
                return (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <div className="w-5 h-px bg-[#E5E7EB] hidden sm:block" />}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all flex-shrink-0"
                      style={{
                        background: done ? "#73b815" : active ? "#203b88" : "transparent",
                        borderColor: done ? "#73b815" : active ? "#203b88" : "#D1D5DB",
                        color: done || active ? "white" : "#9CA3AF",
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span className="text-xs font-medium hidden sm:block" style={{ color: active ? "#111827" : done ? "#73b815" : "#9CA3AF" }}>
                      {labels[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
          ══════════════════════════════════════════════ */}
      <main className={`flex-1 w-full mx-auto px-5 sm:px-8 py-8 ${step === "generate" && !showDashboard ? "max-w-[1720px]" : "max-w-6xl"}`}>

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

          // ── Group by CNPJ + date (day) ─────────────────────────────────────
          type ColGroup = { key: string; cnpj: string; date: string; items: typeof filtered; best: typeof filtered[0] };
          const groupMap = new Map<string, ColGroup>();
          for (const col of filtered) {
            const cnpjKey = (col.cnpj || col.company_name || col.label || col.id).trim();
            const dayKey = new Date(col.created_at).toLocaleDateString("pt-BR");
            const groupKey = `${cnpjKey}||${dayKey}`;
            if (!groupMap.has(groupKey)) {
              groupMap.set(groupKey, { key: groupKey, cnpj: cnpjKey, date: dayKey, items: [], best: col });
            }
            groupMap.get(groupKey)!.items.push(col);
          }
          // Within each group, sort newest first and pick best (prefer in_progress, then most recent)
          const groups = Array.from(groupMap.values());
          for (const g of groups) {
            g.items.sort((a: DocumentCollection, b: DocumentCollection) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            g.best = g.items.find((c: DocumentCollection) => c.status === "in_progress") ?? g.items[0];
          }
          const visibleGroups = groups.slice(0, listaLimit);
          const hasMore = groups.length > listaLimit;
          const companies = Array.from(new Set(collections.map(c => c.company_name || c.label).filter((l): l is string => !!l)));

          return (
          <div key="dashboard" className="max-w-4xl mx-auto animate-fade-in">

            {/* ── Rascunho em andamento ── */}
            {localDraft && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Loader2 size={15} className="text-amber-600 animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      {localDraft.form.cnpj?.razaoSocial || "Empresa não identificada"}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Em andamento — Etapa 2: Revisão dos Dados · salvo {timeAgo(localDraft.savedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => {
                      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
                      setLocalDraft(null);
                    }}
                    style={{ fontSize: "12px", fontWeight: 500, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: "0", minHeight: "auto" }}
                  >
                    Descartar
                  </button>
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
                    Continuar análise →
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

            {/* ── KPI Cards ── */}
            {(() => {
              const totalColetas = filtered.length;
              const finalizadasFilt = filtered.filter(c => c.status === "finished").length;
              const emAndamento = filtered.filter(c => c.status === "in_progress").length;
              const empresas = new Set(filtered.map(c => c.company_name || c.label).filter(Boolean)).size;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const fmmTotalFilt = filtered.filter(c => c.fmm_12m && c.fmm_12m > 0 && (c.decisao === "APROVADO" || c.decisao === "APROVACAO_CONDICIONAL")).reduce((s, c) => s + (c.fmm_12m || 0), 0);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const fmtFmm = (v: number) => v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi` : v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}K` : `R$ ${v.toLocaleString("pt-BR")}`;
              const deltaLabel = (delta: number | null) => {
                if (delta === null) return null;
                if (delta > 0) return { icon: <TrendingUp size={11} />, text: `+${delta} vs período ant.`, cls: "text-green-600" };
                if (delta < 0) return { icon: <TrendingDown size={11} />, text: `${delta} vs período ant.`, cls: "text-red-500" };
                return { icon: <Minus size={11} />, text: "igual ao período ant.", cls: "text-cf-text-4" };
              };
              const ratingClr = metricas.ratingMedio >= 7 ? "#22c55e" : metricas.ratingMedio >= 5 ? "#f59e0b" : "#ef4444";
              const kpis = [
                { label: "Total de Coletas",  value: totalColetas,           sub: `${empresas} empresa(s) únicas`,                                                                             delta: metricas.deltaColetas, accent: "#203b88", fmt: (v: number) => String(v),                                                                                             emptyLabel: null,                                                 bar: undefined },
                { label: "Finalizadas",       value: finalizadasFilt,        sub: finalizadasFilt === 0 ? "Nenhuma análise concluída" : `${emAndamento} em andamento`,                         delta: null,                  accent: "#73b815", fmt: (v: number) => String(v),                                                                                             emptyLabel: finalizadasFilt === 0 ? "Nenhuma análise concluída" : null, bar: undefined },
                { label: "Taxa de Aprovação", value: metricas.taxaAprovacao, sub: metricas.totalFinalizadas === 0 ? "Sem dados suficientes" : `de ${metricas.totalFinalizadas} finalizadas`,  delta: metricas.deltaTaxa,    accent: "#0ea5e9", fmt: (v: number) => metricas.totalFinalizadas === 0 ? "—" : `${v}%`,                                                           emptyLabel: metricas.totalFinalizadas === 0 ? "Sem dados suficientes" : null, bar: undefined },
                { label: "Rating Médio",      value: metricas.ratingMedio,   sub: metricas.totalComRating === 0 ? "Sem análises com rating" : `de ${metricas.totalComRating} análise(s)`,     delta: metricas.deltaRating,  accent: ratingClr, fmt: (v: number) => metricas.totalComRating === 0 ? "—" : v.toFixed(1).replace(".", ",") + "/10",                             emptyLabel: metricas.totalComRating === 0 ? "Sem análises com rating" : null, bar: metricas.totalComRating > 0 ? (metricas.ratingMedio / 10) * 100 : undefined },
              ];
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                  {kpis.map((k, i) => {
                    const dl = deltaLabel(k.delta ?? null);
                    return (
                      <div key={k.label} className={`bg-white border border-cf-border rounded-2xl px-5 py-4 animate-stagger-${i + 1} relative overflow-hidden`}>
                        <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: k.accent }} />
                        <p className="text-[10px] font-bold text-cf-text-4 uppercase tracking-widest mb-2 pl-2">{k.label}</p>
                        {loadingCollections ? (
                          <div className="pl-2 space-y-1.5 mt-1">
                            <div className="skeleton h-7 w-20 rounded" />
                            <div className="skeleton h-3 w-28 rounded" />
                          </div>
                        ) : (
                          <>
                            <p className="text-2xl sm:text-3xl font-bold pl-2" style={{ color: k.bar !== undefined ? k.accent : undefined }}>{k.fmt(k.value)}</p>
                            <p className={`text-[11px] mt-1 pl-2 ${k.emptyLabel ? "text-orange-500 font-semibold" : "text-cf-text-4"}`}>{k.sub}</p>
                            {k.bar !== undefined && (
                              <div className="pl-2 pr-1 mt-2">
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${k.bar}%`, backgroundColor: k.accent }} />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {dl && (
                          <div className={`flex items-center gap-1 mt-2 pl-2 text-[10px] font-semibold ${dl.cls}`}>
                            {dl.icon}{dl.text}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Breakdown de Decisões ── */}
            {metricas.totalFinalizadas > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                {[
                  { label: "Aprovadas",    value: metricas.porDecisao.aprovado,                       sub: "sem restrições",       accent: "#16a34a" },
                  { label: "Condicionais", value: metricas.porDecisao.condicional,                    sub: "aprovação condicional", accent: "#7c3aed" },
                  { label: "Em Análise",   value: metricas.porDecisao.pendente + metricas.emAnalise,  sub: "aguardando parecer",    accent: "#d97706" },
                  { label: "Recusadas",    value: metricas.porDecisao.reprovado,                      sub: "não aprovadas",         accent: "#dc2626" },
                ].map((item, i) => (
                  <div key={i} className={`bg-white border border-cf-border rounded-2xl px-5 py-4 animate-stagger-${i + 1} relative overflow-hidden`}>
                    <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: item.accent }} />
                    <p className="text-[10px] font-bold text-cf-text-4 uppercase tracking-widest mb-2 pl-2">{item.label}</p>
                    {loadingCollections ? (
                      <div className="pl-2 space-y-1.5 mt-1">
                        <div className="skeleton h-7 w-20 rounded" />
                        <div className="skeleton h-3 w-28 rounded" />
                      </div>
                    ) : (
                      <>
                        <p className="text-2xl sm:text-3xl font-bold pl-2">{item.value}</p>
                        <p className="text-[11px] mt-1 pl-2 text-cf-text-4">{item.sub}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Dashboard de gráficos */}
            {collections.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-cf-text-1">Visão Geral</h3>
                  <div className="flex gap-1 bg-white border border-cf-border rounded-xl p-1">
                    {(["7d", "30d", "90d"] as const).map(pp => (
                      <button key={pp} onClick={() => setDashPeriodo(pp)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${dashPeriodo === pp ? "bg-cf-navy text-white" : "text-cf-text-3 hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        {pp === "7d" ? "7 dias" : pp === "30d" ? "30 dias" : "90 dias"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                  {/* Área: evolução de coletas */}
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e5e7eb] p-5">
                    <p className="text-[11px] text-cf-text-4 uppercase tracking-wider font-bold mb-4">Evolução de Coletas — últimos 30 dias</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={metricas.serieTemporal} margin={{ top: 5, right: 8, left: -28, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradColetas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#203b88" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#203b88" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
                        <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                          formatter={(v) => [v, "Coletas"]}
                        />
                        <Area type="monotone" dataKey="coletas" stroke="#203b88" strokeWidth={2} fill="url(#gradColetas)" dot={false} activeDot={{ r: 4, fill: "#203b88" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Donut: distribuição de decisões */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                    <p className="text-[11px] text-cf-text-4 uppercase tracking-wider font-bold mb-2">Distribuição de Decisões</p>
                    {metricas.totalFinalizadas > 0 ? (() => {
                      const pieData = [
                        { name: "Aprovado", value: metricas.porDecisao.aprovado, color: "#22c55e" },
                        { name: "Condicional", value: metricas.porDecisao.condicional, color: "#f59e0b" },
                        { name: "Pendente", value: metricas.porDecisao.pendente, color: "#94a3b8" },
                        { name: "Reprovado", value: metricas.porDecisao.reprovado, color: "#ef4444" },
                      ].filter(d => d.value > 0);
                      return (
                        <>
                          <div className="flex items-center justify-center">
                            <ResponsiveContainer width="100%" height={130}>
                              <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value" strokeWidth={0}>
                                  {pieData.map((entry, index) => (
                                    <Cell key={index} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 8 }}
                                  formatter={(v) => [`${v} coleta(s)`, ""]}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-1.5 mt-1">
                            {pieData.map(d => (
                              <div key={d.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                  <span className="text-[11px] text-cf-text-3">{d.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-semibold text-cf-text-1">{d.value}</span>
                                  <span className="text-[10px] text-cf-text-4 w-8 text-right">{Math.round((d.value / metricas.totalFinalizadas) * 100)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })() : (
                      <div className="flex flex-col items-center justify-center" style={{ height: "185px" }}>
                        <ResponsiveContainer width="100%" height={130}>
                          <PieChart>
                            <Pie data={[{ value: 1 }]} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" strokeWidth={0}>
                              <Cell fill="#E5E7EB" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <p style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>Sem dados ainda</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bar chart: coletas por semana (aprovadas vs total) */}
                <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] text-cf-text-4 uppercase tracking-wider font-bold">Coletas por Semana — Total vs Aprovadas</p>
                    <div className="flex items-center gap-4 text-[10px] text-cf-text-4">
                      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#203b88]" />Total</div>
                      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#73b815]" />Aprovadas</div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={metricas.semanas} margin={{ top: 5, right: 8, left: -28, bottom: 0 }} barCategoryGap="30%">
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                        cursor={{ fill: "rgba(32,59,136,0.04)" }}
                      />
                      <Bar dataKey="total" name="Total" fill="#203b88" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="aprovadas" name="Aprovadas" fill="#73b815" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Distribuição de Rating */}
                {metricas.totalComRating > 0 && (
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[11px] text-cf-text-4 uppercase tracking-wider font-bold">Distribuição de Rating</p>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{
                        color: metricas.ratingMedio >= 7 ? "#166534" : metricas.ratingMedio >= 5 ? "#92400e" : "#991b1b",
                        background: metricas.ratingMedio >= 7 ? "#dcfce7" : metricas.ratingMedio >= 5 ? "#fef3c7" : "#fee2e2",
                      }}>
                        Média {metricas.ratingMedio.toFixed(1).replace(".", ",")}/10
                      </span>
                    </div>
                    <div className="space-y-3">
                      {metricas.ratingDistribuicao.map(f => (
                        <div key={f.label} className="flex items-center gap-3">
                          <div className="w-16 flex-shrink-0">
                            <span className="text-[11px] font-bold text-cf-text-2">{f.label}</span>
                          </div>
                          <div className="w-12 flex-shrink-0">
                            <span className="text-[10px] text-cf-text-4">{f.faixa}</span>
                          </div>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.round((f.count / metricas.totalComRating) * 100)}%`, backgroundColor: f.color }}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 w-14 justify-end">
                            <span className="text-[11px] font-bold" style={{ color: f.color }}>{f.count}</span>
                            <span className="text-[10px] text-cf-text-4">({Math.round((f.count / metricas.totalComRating) * 100)}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Funil de Aprovação */}
                {metricas.totalRecebidas > 0 && (() => {
                  const stageColors = [
                    { bar: "#1E3A5F", track: "#e8edf4", text: "#1E3A5F", dot: "#1E3A5F" },
                    { bar: "#2563eb", track: "#dbeafe", text: "#1d4ed8", dot: "#2563eb" },
                    { bar: "#0891b2", track: "#cffafe", text: "#0e7490", dot: "#0891b2" },
                    { bar: "#16a34a", track: "#dcfce7", text: "#15803d", dot: "#16a34a" },
                  ];
                  const taxaColor = metricas.taxaAprovacao >= 60
                    ? { fg: "#166534", bg: "#dcfce7", border: "#bbf7d0" }
                    : metricas.taxaAprovacao >= 30
                    ? { fg: "#92400e", bg: "#fef3c7", border: "#fde68a" }
                    : { fg: "#991b1b", bg: "#fee2e2", border: "#fecaca" };
                  return (
                    <div className="bg-white rounded-2xl border border-[#e5e7eb] mt-4" style={{ padding: "18px 18px 14px" }}>
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div style={{ width: 3, height: 14, background: "#22c55e", borderRadius: 2 }} />
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: "#6b7280", textTransform: "uppercase" }}>Funil de Aprovação</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: taxaColor.fg, background: taxaColor.bg, border: `1px solid ${taxaColor.border}` }}>
                          {metricas.taxaAprovacao}% aprovação
                        </span>
                      </div>

                      {/* Etapas */}
                      <div className="space-y-2">
                        {metricas.funil.map((etapa, i) => {
                          const pctDoTotal = metricas.funil[0].value > 0
                            ? Math.round((etapa.value / metricas.funil[0].value) * 100) : 0;
                          const convPct = i > 0 && metricas.funil[i - 1].value > 0
                            ? Math.round((etapa.value / metricas.funil[i - 1].value) * 100) : null;
                          const cfg = stageColors[i] ?? stageColors[stageColors.length - 1];
                          return (
                            <div key={etapa.label}>
                              {/* Seta de conversão */}
                              {i > 0 && (
                                <div className="flex items-center gap-2 py-1 pl-1">
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path d="M5 1v8M2 6l3 3 3-3" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span style={{
                                    fontSize: 10, fontWeight: 600,
                                    color: convPct !== null && convPct >= 70 ? "#16a34a" : convPct !== null && convPct >= 40 ? "#d97706" : "#dc2626"
                                  }}>
                                    {convPct !== null ? `${convPct}% avançaram` : "—"}
                                  </span>
                                </div>
                              )}
                              {/* Linha da etapa */}
                              <div className="flex items-center gap-3">
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{etapa.label}</span>
                                    <div className="flex items-baseline gap-1">
                                      <span style={{ fontSize: 15, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{etapa.value}</span>
                                      <span style={{ fontSize: 10, fontWeight: 500, color: "#9ca3af" }}>{pctDoTotal}%</span>
                                    </div>
                                  </div>
                                  {/* Track */}
                                  <div style={{ height: 8, background: cfg.track, borderRadius: 99, overflow: "hidden" }}>
                                    <div style={{
                                      width: `${Math.max(pctDoTotal, etapa.value > 0 ? 8 : 0)}%`,
                                      height: "100%",
                                      background: cfg.bar,
                                      borderRadius: 99,
                                      transition: "width 0.5s ease",
                                    }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer stats */}
                      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #f3f4f6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, textAlign: "center" }}>
                        {[
                          { label: "Em Análise", value: String(metricas.emAnalise), color: "#1E3A5F" },
                          { label: "Taxa Aprovação", value: `${metricas.taxaAprovacao}%`, color: metricas.taxaAprovacao >= 60 ? "#16a34a" : metricas.taxaAprovacao >= 30 ? "#d97706" : "#dc2626" },
                          { label: "Reprovadas", value: String(metricas.porDecisao.reprovado), color: "#dc2626" },
                        ].map((s, si) => (
                          <div key={s.label} style={{ borderRight: si < 2 ? "1px solid #f3f4f6" : "none" }}>
                            <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{s.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Barra de filtros unificada ── */}
            <div className="mb-6">
              <div className="flex items-center gap-1 flex-wrap bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl px-3 py-2">
                {/* Status */}
                {([
                  { key: "all", label: "Todos" },
                  { key: "finished", label: "Finalizadas" },
                  { key: "in_progress", label: "Em andamento" },
                ] as { key: typeof statusFilter; label: string }[]).map(f => (
                  <button key={f.key} onClick={() => { setStatusFilter(f.key); setListaLimit(10); }}
                    style={{
                      padding: "5px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.15s",
                      background: statusFilter === f.key ? "#1E3A5F" : "transparent",
                      color: statusFilter === f.key ? "white" : "#6B7280",
                      minHeight: "auto",
                    }}>
                    {f.label}
                  </button>
                ))}

                {/* Separador */}
                <div style={{ width: "1px", height: "18px", background: "#D1D5DB", margin: "0 4px", flexShrink: 0 }} />

                {/* Decisão */}
                {([
                  { key: "all", label: "Todas" },
                  { key: "APROVADO", label: "Aprovado" },
                  { key: "APROVACAO_CONDICIONAL", label: "Condicional" },
                  { key: "PENDENTE", label: "Pendente" },
                  { key: "REPROVADO", label: "Reprovado" },
                ] as { key: typeof decisaoFilter; label: string }[]).map(f => (
                  <button key={f.key} onClick={() => { setDecisaoFilter(f.key); setListaLimit(10); }}
                    style={{
                      padding: "5px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.15s",
                      background: decisaoFilter === f.key ? "#1E3A5F" : "transparent",
                      color: decisaoFilter === f.key ? "white" : "#6B7280",
                      minHeight: "auto",
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Empresa + Limpar */}
              {(companies.length > 1 || hasActiveFilters) && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {companies.length > 1 && (
                    <>
                      <button onClick={() => { setSelectedCompany(null); setListaLimit(10); }}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border ${!selectedCompany ? "bg-cf-navy text-white border-cf-navy" : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        Todas as empresas
                      </button>
                      {companies.map(c => (
                        <button key={c} onClick={() => { setSelectedCompany(selectedCompany === c ? null : c); setListaLimit(10); }}
                          className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border flex items-center gap-1 ${selectedCompany === c ? "bg-cf-navy text-white border-cf-navy" : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                          style={{ minHeight: "auto" }}>
                          <Building2 size={10} />{c}
                        </button>
                      ))}
                    </>
                  )}
                  {hasActiveFilters && (
                    <button
                      onClick={() => { setSearchQuery(""); setStatusFilter("all"); setDecisaoFilter("all"); setSelectedCompany(null); setListaLimit(10); }}
                      className="text-[11px] font-semibold text-cf-navy hover:underline ml-auto"
                      style={{ minHeight: "auto" }}>
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* CTA: Nova coleta — only shown when no collections */}
            {collections.length === 0 && (
              <OnboardingTooltip id="nova-coleta" message="Clique aqui para iniciar a analise de um novo cedente. Voce vai fazer upload dos documentos e a IA cuida do resto." position="bottom" isSeen={isTooltipSeen("nova-coleta")} onSeen={() => markTooltipSeen("nova-coleta")}>
                <button
                  onClick={() => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setCollectionId(null); try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 28px", borderRadius: "12px", background: "linear-gradient(135deg, #192f5d 0%, #203b88 100%)", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(32,59,136,0.3)", marginBottom: "32px", width: "100%" }}
                >
                  <Plus size={18} /> Nova Coleta de Documentos
                </button>
              </OnboardingTooltip>
            )}

            {/* Skeleton loader enquanto carrega */}
            {loadingCollections && (
              <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden divide-y divide-[#f1f5f9]">
                {[0,1,2,3].map(i => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-4 w-48 rounded" />
                      <div className="skeleton h-3 w-64 rounded" />
                    </div>
                    <div className="skeleton h-4 w-16 rounded" />
                    <div className="skeleton h-4 w-4 rounded" />
                  </div>
                ))}
              </div>
            )}

            {/* Últimas coletas (filtradas) */}
            {!loadingCollections && filtered.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-cf-text-1">
                    {dateFilter === "hoje" ? "Coletas de Hoje" : dateFilter === "7dias" ? "Últimos 7 dias" : dateFilter === "custom" ? "Data selecionada" : "Últimas Coletas"}
                    <span className="ml-2 text-xs font-normal text-cf-text-3">({groups.length}{filtered.length !== groups.length ? ` empresa${groups.length !== 1 ? "s" : ""}, ${filtered.length} coleta${filtered.length !== 1 ? "s" : ""}` : ""})</span>
                  </h3>
                  <div className="flex items-center gap-3">
                    <a href="/historico" className="text-xs font-semibold text-cf-navy hover:underline">Ver histórico</a>
                    <OnboardingTooltip id="nova-coleta" message="Clique aqui para iniciar a analise de um novo cedente." position="bottom" isSeen={isTooltipSeen("nova-coleta")} onSeen={() => markTooltipSeen("nova-coleta")}>
                      <button
                        onClick={() => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setCollectionId(null); try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} }}
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "8px", background: "linear-gradient(135deg, #192f5d 0%, #203b88 100%)", color: "white", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 2px 8px rgba(32,59,136,0.25)", minHeight: "auto" }}
                      >
                        <Plus size={13} /> Nova Coleta
                      </button>
                    </OnboardingTooltip>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden divide-y divide-[#f1f5f9]" style={{ animationDelay: "0.4s", animationFillMode: "both" }}>
                  {visibleGroups.map((group, i) => {
                    const col = group.best;
                    const isMulti = group.items.length > 1;
                    const isExpanded = expandedGroups.has(group.key);
                    const toggleGroup = () => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                      return next;
                    });
                    return (
                      <div key={group.key} className={`animate-stagger-${Math.min(i + 1, 8)}`}>
                        {/* Main row */}
                        <div className="px-5 py-4 flex items-center gap-3 hover:bg-[#f8fafc] transition-colors duration-150 group">
                          {/* Ícone empresa */}
                          <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#f1f5f9" }}>
                            <Building2 size={16} style={{ color: "#203b88" }} />
                          </div>

                          {/* Info principal */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-[#0f172a] truncate">{col.company_name || col.label || "Sem identificação"}</p>
                              {isMulti && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-600 px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#64748b] flex-shrink-0">
                                  <RotateCcw size={9} /> {group.items.length} tentativas
                                </span>
                              )}
                              {col.fund_status && (() => {
                                const fs = col.fund_status;
                                const fsColor = fs.status === "ok" ? "#16a34a" : fs.status === "warning" ? "#d97706" : "#dc2626";
                                const fsBg = fs.status === "ok" ? "#f0fdf4" : fs.status === "warning" ? "#fffbeb" : "#fff1f2";
                                const fsBorder = fs.status === "ok" ? "#bbf7d0" : fs.status === "warning" ? "#fde68a" : "#fecaca";
                                const FsIcon = fs.status === "ok" ? CheckCircle2 : fs.status === "warning" ? AlertCircle : XCircle;
                                const fsLabel = fs.status === "ok" ? `${fs.pass_count}/${fs.total} ok` : fs.status === "warning" ? `${fs.warn_count} atenção` : `${fs.fail_count} reprov.`;
                                return (
                                  <span title={`Política do Fundo${fs.preset_name ? ` (${fs.preset_name})` : ""}: ${fs.pass_count} aprovados, ${fs.warn_count} atenção, ${fs.fail_count} reprovados`}
                                    style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px", background: fsBg, color: fsColor, border: `1px solid ${fsBorder}`, flexShrink: 0, whiteSpace: "nowrap", cursor: "default" }}>
                                    <FsIcon size={9} /> {fsLabel}
                                  </span>
                                );
                              })()}
                            </div>

                            {/* Metadados com ícones */}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              {col.cnpj && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8]">
                                  <Hash size={10} /> <span className="font-mono">{col.cnpj}</span>
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8]">
                                <Calendar size={10} /> {group.date}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8]">
                                <FileText size={10} /> {col.documents?.length || 0} docs
                              </span>
                              {col.fmm_12m && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[#94a3b8]">
                                  <DollarSign size={10} /> FMM R$ {Number(col.fmm_12m).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}/mês
                                </span>
                              )}
                            </div>

                            {col.observacoes && (
                              <p className="text-[11px] text-[#94a3b8] mt-1 italic line-clamp-1">&ldquo;{col.observacoes}&rdquo;</p>
                            )}
                          </div>

                          {/* Status + decisão */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {col.decisao ? (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                col.decisao === "APROVADO" ? "text-green-700 bg-green-50 border-green-200"
                                : col.decisao === "REPROVADO" ? "text-red-600 bg-red-50 border-red-200"
                                : "text-amber-600 bg-amber-50 border-amber-200"
                              }`}>
                                {col.decisao === "APROVADO" ? <CheckCircle2 size={9} /> : col.decisao === "REPROVADO" ? <XCircle size={9} /> : <AlertCircle size={9} />}
                                {col.decisao === "APROVACAO_CONDICIONAL" ? "CONDICIONAL" : col.decisao}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#f59e0b]">
                                <Clock size={10} /> Em andamento
                              </span>
                            )}
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {col.status === "in_progress" && (
                              <button
                                onClick={() => handleResumeCollection(col.id)}
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg text-white transition-colors"
                                style={{ backgroundColor: "#203b88", minHeight: "auto" }}
                              >
                                <RefreshCw size={10} /> Retomar
                              </button>
                            )}
                            <a href={`/historico?highlight=${col.id}`}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#203b88] hover:bg-[#eff6ff] transition-colors"
                              style={{ minHeight: "auto" }}>
                              <ArrowRight size={14} />
                            </a>
                            {isMulti && (
                              <button onClick={toggleGroup}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#203b88] hover:bg-[#eff6ff] transition-colors"
                                style={{ minHeight: "auto" }}>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded sub-attempts */}
                        {isMulti && isExpanded && (
                          <div className="border-t border-[#f1f5f9] bg-[#f8fafc]">
                            {group.items.map((attempt, j) => (
                              <div key={attempt.id} className={`px-5 py-3 flex items-center gap-3 ${j > 0 ? "border-t border-[#f1f5f9]" : ""}`}>
                                <div className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center bg-white border border-[#e2e8f0]">
                                  <span className="text-[10px] font-bold text-[#94a3b8]">{group.items.length - j}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 text-[11px] text-[#64748b]">
                                      <Clock size={10} /> {new Date(attempt.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-[#64748b]">
                                      <FileText size={10} /> {attempt.documents?.length || 0} docs
                                    </span>
                                  </div>
                                </div>
                                {attempt.decisao ? (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                                    attempt.decisao === "APROVADO" ? "text-green-700 bg-green-50 border-green-200"
                                    : attempt.decisao === "REPROVADO" ? "text-red-600 bg-red-50 border-red-200"
                                    : "text-amber-600 bg-amber-50 border-amber-200"
                                  }`}>
                                    {attempt.decisao === "APROVACAO_CONDICIONAL" ? "CONDICIONAL" : attempt.decisao}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#f59e0b] flex-shrink-0">
                                    <Clock size={9} /> Em andamento
                                  </span>
                                )}
                                {attempt.status === "in_progress" && (
                                  <button
                                    onClick={() => handleResumeCollection(attempt.id)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white flex-shrink-0"
                                    style={{ backgroundColor: "#203b88", minHeight: "auto" }}
                                  >
                                    <RefreshCw size={9} /> Retomar
                                  </button>
                                )}
                                <a href={`/historico?highlight=${attempt.id}`}
                                  className="w-6 h-6 rounded-md flex items-center justify-center text-[#94a3b8] hover:text-[#203b88] hover:bg-[#eff6ff] transition-colors flex-shrink-0"
                                  style={{ minHeight: "auto" }}>
                                  <ArrowRight size={12} />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {hasMore && (
                  <button
                    onClick={() => setListaLimit(prev => prev + 10)}
                    className="mt-3 w-full text-xs font-semibold text-cf-navy hover:text-cf-green py-2.5 border border-cf-border rounded-xl bg-white hover:bg-cf-bg transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    Ver mais ({groups.length - listaLimit} restantes)
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
        })() : step === "generate" ? (

        <div key="generate" className="w-full animate-slide-up">
          <GenerateStep data={extractedData} originalFiles={originalFiles} collectionId={collectionId} onCollectionIdChange={setCollectionId} onBack={() => setStep("review")} onReset={() => { setShowDashboard(true); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setCollectionId(null); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); }} onNotify={handleNotify} onFirstCollection={markFirstCollectionDone} />
        </div>

        ) : (

        <div key={step} className="max-w-2xl mx-auto animate-slide-up">
          {/* Botão voltar + Step header */}
          <div className="mb-6">
            <button onClick={() => {
              if (step === "upload") { goToDashboard(); }
              else { setStep("upload"); }
            }} className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-navy mb-4 transition-colors" style={{ minHeight: "auto" }}>
              {step === "upload" ? <><Home size={13} /> Voltar ao painel</> : <><ArrowLeft size={13} /> Voltar</>}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cf-navy flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {step === "upload" ? "1" : "2"}
              </div>
              <div>
                <h2 className="text-lg font-bold text-cf-text-1">{stepLabels[step]}</h2>
                <p className="text-xs text-cf-text-3">{stepDescriptions[step]}</p>
              </div>
            </div>
          </div>

          {step === "upload" && (
            <UploadStep
              onComplete={(d, files) => { setExtractedData(d); setOriginalFiles(files); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setStep("review"); }}
              onDataChange={(d) => { setExtractedData(d); autoSaveCollection(d); }}
              // Quando voltamos pra upload vindo de review/generate, reconstroi a
              // lista de docs a partir do extractedData atual (mesma funcao usada
              // no save) para repovoar as sections. Evita "arquivos zerados".
              resumedDocs={resumedDocs && resumedDocs.length > 0 ? resumedDocs : (buildCollectionDocs(extractedData) as import("@/types").CollectionDocument[])}
              initialData={extractedData}
            />
          )}
          {step === "review" && (
            <ReviewStep
              data={extractedData}
              onComplete={(d) => { setExtractedData(d); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setLocalDraft(null); setStep("generate"); }}
              onBack={() => setStep("upload")}
              onDataChange={(d) => { setExtractedData(d); autoSaveCollection(d); }}
            />
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
