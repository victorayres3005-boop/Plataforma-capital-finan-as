"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import UploadStep, { OriginalFiles } from "@/components/UploadStep";
import ReviewStep from "@/components/ReviewStep";
import { useOnboarding } from "@/lib/useOnboarding";
import WelcomeModal from "@/components/WelcomeModal";
import OnboardingTooltip from "@/components/OnboardingTooltip";
import FirstCollectionChecklist from "@/components/FirstCollectionChecklist";
import GenerateStep from "@/components/GenerateStep";
import { ScoreSection } from "@/components/score/ScoreSection";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { AppStep, ExtractedData, DocumentCollection, Notification, CollectionDocument } from "@/types";
import { hydrateFromCollection, defaultData } from "@/lib/hydrateFromCollection";
import { buildCollectionDocs } from "@/lib/buildCollectionDocs";
import { DRAFT_KEY } from "@/components/ReviewStep";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from "next/link";
import { LogOut, User, Menu, X, Clock, Shield, Plus, Building2, ArrowRight, ArrowLeft, Calendar, Home, Bell, Search, Loader2, Settings, HelpCircle, ChevronDown, FileText, Hash, DollarSign, RefreshCw, CheckCircle2, XCircle, AlertCircle, RotateCcw, BarChart3 } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { timeAgo } from "@/lib/formatters";
import Logo from "@/components/Logo";

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


// Logo local foi removido — usar `<Logo />` de @/components/Logo
// (variante padrão "full"; passe `light` para fundo navy/escuro).

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
  // Rastreia quais tipos de documento foram confirmados (upload ou retomada).
  // Impede que buildCollectionDocs descarte docs com extração vazia no auto-save.
  const confirmedDocsRef = useRef<CollectionDocument[]>([]);

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
        const freshDocs = buildCollectionDocs(data);
        // Nunca descarta tipos confirmados (extrações vazias não devem apagar o registro do doc)
        const confirmed = confirmedDocsRef.current;
        const MULTI_INSTANCE = new Set(["scr_bacen", "ir_socio"]);
        const freshTypeSet = new Set(freshDocs.map(d => d.type));
        const freshKeySet  = new Set(freshDocs.map(d => `${d.type}:${d.filename}`));
        const extra: CollectionDocument[] = [];
        const seenSingle = new Set<string>();
        for (const c of confirmed) {
          if (MULTI_INSTANCE.has(c.type)) {
            if (!freshKeySet.has(`${c.type}:${c.filename}`)) extra.push(c);
          } else {
            if (!freshTypeSet.has(c.type) && !seenSingle.has(c.type)) {
              seenSingle.add(c.type);
              extra.push(c);
            }
          }
        }
        const documents = [...freshDocs, ...extra];
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
    // UPDATE path (collection already exists): salva rápido para não perder ao navegar
    // INSERT path (sem collectionId ainda): debounce maior para acumular docs suficientes
    const delay = collectionIdRef.current ? 100 : 800;
    autoSaveTimer.current = setTimeout(() => { performSave(); }, delay);
  }, [performSave]);

  // Salva rascunho emergencial no localStorage ao fechar/recarregar a aba.
  // Na próxima visita, se o collectionId ainda bater, aplica o UPDATE via Supabase.
  const EMERGENCY_DRAFT_KEY = "cf_emergency_draft_v1";
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!dirtyData.current || !collectionIdRef.current) return;
      try {
        const docs = buildCollectionDocs(dirtyData.current);
        if (docs.length === 0) return;
        localStorage.setItem(EMERGENCY_DRAFT_KEY, JSON.stringify({
          collectionId: collectionIdRef.current,
          documents: docs,
          label: dirtyData.current.cnpj?.razaoSocial || null,
          savedAt: new Date().toISOString(),
        }));
      } catch { /* storage full */ }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aplica rascunho emergencial se encontrado e dentro de 48h
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(EMERGENCY_DRAFT_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { collectionId: string; documents: unknown[]; label: string | null; savedAt: string };
        if (!parsed?.collectionId || !parsed?.documents?.length) { localStorage.removeItem(EMERGENCY_DRAFT_KEY); return; }
        const age = Date.now() - new Date(parsed.savedAt).getTime();
        if (age > 48 * 3600 * 1000) { localStorage.removeItem(EMERGENCY_DRAFT_KEY); return; }
        localStorage.removeItem(EMERGENCY_DRAFT_KEY);
        const supabase = createClient();
        const { data: session } = await supabase.auth.getUser();
        if (!session.user) return;
        await supabase.from("document_collections")
          .update({ documents: parsed.documents, label: parsed.label })
          .eq("id", parsed.collectionId)
          .eq("user_id", session.user.id);
        console.log(`[emergencyDraft] Rascunho aplicado à coleta ${parsed.collectionId}`);
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Detecta ?nova=true vindo do botão "Nova Coleta" da sidebar
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("nova") === "true") {
        url.searchParams.delete("nova");
        window.history.replaceState({}, "", url.toString());
        setShowDashboard(false);
        setStep("upload");
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [decisaoFilter, setDecisaoFilter] = useState<"all" | "APROVADO" | "APROVACAO_CONDICIONAL" | "PENDENTE" | "REPROVADO" | "QUESTIONAMENTO">("all");
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
      setResumedDocs(docs as CollectionDocument[]);
      confirmedDocsRef.current = docs as CollectionDocument[];
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

  const [goalfyHighlight, setGoalfyHighlight] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    const forceStep = params.get("step") as AppStep | null;
    const highlight = params.get("highlight");
    if (highlight) setGoalfyHighlight(highlight.split(",").filter(Boolean));
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
    // Se auth ainda está carregando, preserva o skeleton — não marca loading=false prematuramente
    if (!user?.id) { if (!authLoading) setLoadingCollections(false); return; }
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("document_collections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      // Não sobrescreve dados existentes se a query falhou (RLS, rede, token ainda propagando)
      if (error) return;
      const cols = (data as DocumentCollection[]) || [];
      setCollections(cols);
      saveCachedCollections(cols);
    } catch { /* silent */ }
    finally { setLoadingCollections(false); }
  // user?.id em vez de user — evita re-fetch quando o objeto muda mas o ID é o mesmo (refresh de token)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

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
          HERO — gradient completo no dashboard,
          barra compacta nas etapas internas
          ══════════════════════════════════════════════ */}
      {showDashboard ? (
        /* Hero compacto — dashboard */
        <div style={{
          background: "linear-gradient(135deg, #0f1f5c 0%, #203b88 55%, #1a4fa8 100%)",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Glows decorativos */}
          <div aria-hidden style={{
            position: "absolute", top: "-45%", right: "-10%",
            width: 620, height: 620, pointerEvents: "none",
            background: "radial-gradient(circle, rgba(115,184,21,0.18) 0%, rgba(115,184,21,0) 60%)",
          }} />
          <div aria-hidden style={{
            position: "absolute", bottom: "-55%", left: "-15%",
            width: 720, height: 720, pointerEvents: "none",
            background: "radial-gradient(circle, rgba(168,217,107,0.10) 0%, rgba(168,217,107,0) 65%)",
          }} />

          <div style={{ position: "relative", maxWidth: 1152, margin: "0 auto", padding: "48px 32px 56px", textAlign: "center" }}>
            {/* Badge CVM */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(115,184,21,0.14)", border: "1px solid rgba(168,217,107,0.35)", borderRadius: 999, padding: "6px 16px", marginBottom: 22, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
              <Shield size={12} style={{ color: "#a8d96b", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#a8d96b", letterSpacing: "0.1em", textTransform: "uppercase" }}>FIDC Regulado pela CVM</span>
            </div>

            {/* Título */}
            <h1 style={{ fontSize: 44, fontWeight: 900, color: "#ffffff", margin: "0 0 16px", lineHeight: 1.1, letterSpacing: "-0.8px" }}>
              Plataforma de{" "}
              <span style={{ background: "linear-gradient(90deg, #a8d96b, #73b815)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Análise de Crédito
              </span>
            </h1>

            {/* Subtítulo */}
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, margin: "0 auto 36px", maxWidth: 520, fontWeight: 400 }}>
              Transforme documentos cadastrais e fiscais em pareceres de crédito completos, com dados consolidados em minutos.
            </p>

            {/* 3 feature pills */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {[
                { icon: <FileText size={12} />, label: "Extração automática com IA" },
                { icon: <BarChart3 size={12} />, label: "Score de crédito V2" },
                { icon: <Shield size={12} />, label: "Política de fundo configurável" },
              ].map(f => (
                <div key={f.label} style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 999, padding: "8px 18px",
                  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                }}>
                  <span style={{ color: "#a8d96b" }}>{f.icon}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* transição suave para o fundo da página */}
          <div style={{ height: 32, background: "linear-gradient(to bottom, transparent, #f5f7fb)", marginBottom: "-1px" }} />
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
          const filteredByDecisao = decisaoFilter !== "all"
            ? filteredByStatus.filter(c => c.decisao === decisaoFilter)
            : filteredByStatus;
          // "Últimas Coletas" só mostra coletas com mais de 4 arquivos analisados
          // (critério pedido para esconder coletas de teste/rascunho da tela principal).
          // O /historico continua mostrando todas.
          const filtered = filteredByDecisao.filter(c => (c.documents?.length ?? 0) > 4);
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

            {/* ══ NOVO DESIGN — CABEÇALHO + KPIs ══ */}
            {(() => {
              const heroName = user ? (user.user_metadata?.full_name || user.email?.split("@")[0] || "").split(" ")[0] : "";
              const totalColetas2 = filtered.length;
              const finalizadasFilt2 = filtered.filter(c => c.status === "finished").length;
              const empresas2 = new Set(filtered.map(c => c.company_name || c.label).filter(Boolean)).size;
              const handleNovaColeta = () => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setCollectionId(null); try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} };

              const kpis = [
                {
                  value: loadingCollections ? "—" : String(totalColetas2),
                  label: "Coletas no período",
                  sub: `${empresas2} empresa${empresas2 !== 1 ? "s" : ""}`,
                  accent: "#203b88",
                },
                {
                  value: loadingCollections ? "—" : String(finalizadasFilt2),
                  label: "Análises concluídas",
                  sub: `${metricas.porDecisao.aprovado} aprovadas`,
                  accent: "#5a9110",
                },
                {
                  value: loadingCollections ? "—" : metricas.totalFinalizadas === 0 ? "—" : `${metricas.taxaAprovacao}%`,
                  label: "Taxa de aprovação",
                  sub: `${metricas.porDecisao.reprovado} recusadas`,
                  accent: metricas.taxaAprovacao >= 60 ? "#5a9110" : metricas.taxaAprovacao >= 30 ? "#d97706" : "#dc2626",
                },
                ...(metricas.totalComRating > 0 ? [{
                  value: loadingCollections ? "—" : `${metricas.ratingMedio.toFixed(1).replace(".", ",")}`,
                  label: "Rating médio",
                  sub: `${metricas.totalComRating} com score`,
                  accent: metricas.ratingMedio >= 8 ? "#5a9110" : metricas.ratingMedio >= 5 ? "#d97706" : "#dc2626",
                }] : []),
              ];

              return (
                <>
                  {/* Cabeçalho limpo */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.3px" }}>
                        {heroName ? `Olá, ${heroName}` : "Olá"}
                      </h1>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0", fontWeight: 500 }}>
                        {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                        {metricas.emAnalise > 0 && <span style={{ color: "#d97706", fontWeight: 600 }}> · {metricas.emAnalise} em andamento</span>}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* filtro de data */}
                      <div style={{ display: "flex", gap: 1, background: "#f1f5f9", borderRadius: 7, padding: 2 }}>
                        {([
                          { key: "hoje", label: "Hoje" },
                          { key: "7dias", label: "7d" },
                          { key: "30dias", label: "30d" },
                          { key: "custom", label: "" },
                        ] as { key: typeof dateFilter; label: string }[]).map(f =>
                          f.key === "custom" ? (
                            <button key="custom" onClick={() => setDateFilter("custom")} style={{
                              display: "flex", alignItems: "center", padding: "5px 9px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.12s",
                              background: dateFilter === "custom" ? "white" : "transparent",
                              color: dateFilter === "custom" ? "#0f172a" : "#64748b", minHeight: "auto",
                              boxShadow: dateFilter === "custom" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                            }}><Calendar size={11} /></button>
                          ) : (
                            <button key={f.key} onClick={() => setDateFilter(f.key)} style={{
                              padding: "5px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all 0.12s",
                              background: dateFilter === f.key ? "white" : "transparent",
                              color: dateFilter === f.key ? "#0f172a" : "#64748b", minHeight: "auto",
                              boxShadow: dateFilter === f.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                            }}>{f.label}</button>
                          )
                        )}
                      </div>
                      {dateFilter === "custom" && (
                        <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                          style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #e2e8f0", background: "white", color: "#0f172a", fontSize: 11 }} />
                      )}
                      <div style={{ position: "relative" }}>
                        <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                        <input type="text" value={searchQuery}
                          onChange={e => { setSearchQuery(e.target.value); setListaLimit(10); }}
                          placeholder="Buscar empresa..."
                          style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7, borderRadius: 7, border: "1px solid #e2e8f0", background: "white", color: "#0f172a", fontSize: 11, width: 150, outline: "none" }}
                        />
                      </div>
                      <button onClick={handleNovaColeta} style={{
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px",
                        borderRadius: 7, border: "none", cursor: "pointer", background: "#203b88",
                        color: "white", fontSize: 12, fontWeight: 700, minHeight: "auto",
                      }}>
                        <Plus size={13} /> Nova Coleta
                      </button>
                    </div>
                  </div>

                  {/* KPIs */}
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, gap: 10, marginBottom: 20 }}>
                    {kpis.map((k, i) => (
                      <div key={i} style={{
                        background: "white", borderRadius: 8, padding: "16px 20px",
                        border: "1px solid #e2e8f0", borderBottom: `3px solid ${k.accent}`,
                      }}>
                        {loadingCollections
                          ? <div style={{ width: 48, height: 30, background: "#f1f5f9", borderRadius: 4, marginBottom: 8 }} />
                          : <p style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", margin: "0 0 4px", lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>{k.value}</p>
                        }
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.label}</p>
                        <p style={{ fontSize: 10, color: "#94a3b8", margin: "3px 0 0" }}>{k.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Decisões — linha horizontal única */}
                  {metricas.totalFinalizadas > 0 && (
                    <div style={{ background: "white", borderRadius: 8, border: "1px solid #e2e8f0", padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 20, whiteSpace: "nowrap" }}>Decisões</span>
                      {[
                        { label: "Aprovadas",    value: metricas.porDecisao.aprovado,                      color: "#16a34a" },
                        { label: "Condicionais", value: metricas.porDecisao.condicional,                   color: "#7c3aed" },
                        { label: "Em Análise",   value: metricas.porDecisao.pendente + metricas.emAnalise, color: "#d97706" },
                        { label: "Recusadas",    value: metricas.porDecisao.reprovado,                     color: "#dc2626" },
                      ].map((d, i, arr) => (
                        <div key={d.label} style={{
                          display: "flex", alignItems: "center", gap: 8, flex: 1,
                          paddingLeft: i > 0 ? 20 : 0,
                          borderLeft: i > 0 ? "1px solid #f1f5f9" : "none",
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{d.value}</span>
                          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{d.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Dashboard de gráficos */}
            {collections.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 3, height: 16, background: "#203b88", borderRadius: 2 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Painel de Crédito</span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>— período selecionado</span>
                  </div>
                  <div style={{ display: "flex", gap: 2, background: "#f1f5f9", borderRadius: 8, padding: 2 }}>
                    {(["7d", "30d", "90d"] as const).map(pp => (
                      <button key={pp} onClick={() => setDashPeriodo(pp)} style={{
                        padding: "4px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all 0.15s", minHeight: "auto",
                        background: dashPeriodo === pp ? "#0a1232" : "transparent",
                        color: dashPeriodo === pp ? "white" : "#6b7280",
                      }}>
                        {pp}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                  {/* Área: evolução de coletas */}
                  <div className="lg:col-span-2 bg-white rounded-lg border border-[#e2e8f0] p-5" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-[12px] font-bold text-[#0f172a]">Evolução de Coletas</p>
                        <p className="text-[10px] text-cf-text-4">Últimos 30 dias</p>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={190}>
                      <AreaChart data={metricas.serieTemporal} margin={{ top: 5, right: 8, left: -28, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradColetas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#203b88" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="#203b88" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
                        <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                          formatter={(v) => [v, "Coletas"]}
                        />
                        <Area type="monotone" dataKey="coletas" stroke="#203b88" strokeWidth={2.5} fill="url(#gradColetas)" dot={false} activeDot={{ r: 4, fill: "#203b88", strokeWidth: 2, stroke: "#fff" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Donut: distribuição de decisões */}
                  <div className="bg-white rounded-lg border border-[#e2e8f0] p-5" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}>
                    <p className="text-[12px] font-bold text-[#0f172a] mb-0.5">Decisões</p>
                    <p className="text-[10px] text-cf-text-4 mb-2">Distribuição das finalizadas</p>
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
                <div className="bg-white rounded-lg border border-[#e2e8f0] p-5" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[12px] font-bold text-[#0f172a]">Coletas por Semana</p>
                      <p className="text-[10px] text-cf-text-4">Total vs aprovadas</p>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-semibold text-cf-text-4">
                      <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#203b88]" />Total</div>
                      <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#73b815]" />Aprovadas</div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={metricas.semanas} margin={{ top: 5, right: 8, left: -28, bottom: 0 }} barCategoryGap="32%">
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                        cursor={{ fill: "rgba(32,59,136,0.04)" }}
                      />
                      <Bar dataKey="total" name="Total" fill="#203b88" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="aprovadas" name="Aprovadas" fill="#73b815" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Distribuição de Rating */}
                {metricas.totalComRating > 0 && (
                  <div className="bg-white rounded-lg border border-[#e2e8f0] p-5" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}>
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-[12px] font-bold text-[#0f172a]">Distribuição de Rating</p>
                        <p className="text-[10px] text-cf-text-4">{metricas.totalComRating} análise{metricas.totalComRating !== 1 ? "s" : ""} com rating</p>
                      </div>
                      <span className="text-[12px] font-bold px-3 py-1.5 rounded-xl" style={{
                        color: metricas.ratingMedio >= 8 ? "#166534" : metricas.ratingMedio >= 5 ? "#92400e" : "#991b1b",
                        background: metricas.ratingMedio >= 8 ? "#dcfce7" : metricas.ratingMedio >= 5 ? "#fef3c7" : "#fee2e2",
                        border: `1px solid ${metricas.ratingMedio >= 8 ? "#bbf7d0" : metricas.ratingMedio >= 5 ? "#fde68a" : "#fecaca"}`,
                      }}>
                        Média {metricas.ratingMedio.toFixed(1).replace(".", ",")}/10
                      </span>
                    </div>
                    <div className="space-y-3">
                      {metricas.ratingDistribuicao.map(f => (
                        <div key={f.label} className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: f.color }}>
                            <span className="text-[9px] font-black text-white">{f.label}</span>
                          </div>
                          <div className="w-14 flex-shrink-0">
                            <span className="text-[9px] text-cf-text-4">{f.faixa} pts</span>
                          </div>
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.round((f.count / metricas.totalComRating) * 100)}%`, backgroundColor: f.color }}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 w-16 justify-end">
                            <span className="text-[12px] font-bold" style={{ color: f.color }}>{f.count}</span>
                            <span className="text-[10px] text-cf-text-4">{Math.round((f.count / metricas.totalComRating) * 100)}%</span>
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
                    <div className="bg-white rounded-lg border border-[#e2e8f0] mt-4" style={{ padding: "18px 18px 14px" }}>
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
              <div className="flex items-center gap-1 flex-wrap bg-white border border-[#E5E7EB] rounded-xl px-3 py-2" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
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
                  { key: "QUESTIONAMENTO", label: "Questionamento" },
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
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 28px", borderRadius: "8px", background: "#203b88", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "none", marginBottom: "32px", width: "100%" }}
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
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 3, height: 20, background: "#203b88", borderRadius: 2 }} />
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                        {dateFilter === "hoje" ? "Coletas de Hoje" : dateFilter === "7dias" ? "Últimos 7 dias" : dateFilter === "custom" ? "Data selecionada" : "Últimas Coletas"}
                      </h3>
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{groups.length} empresa{groups.length !== 1 ? "s" : ""}{filtered.length !== groups.length ? `, ${filtered.length} coleta${filtered.length !== 1 ? "s" : ""}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a href="/historico" className="text-xs font-semibold text-cf-navy hover:underline">Ver histórico</a>
                    <OnboardingTooltip id="nova-coleta" message="Clique aqui para iniciar a analise de um novo cedente." position="bottom" isSeen={isTooltipSeen("nova-coleta")} onSeen={() => markTooltipSeen("nova-coleta")}>
                      <button
                        onClick={() => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setCollectionId(null); try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} }}
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "8px", background: "#203b88", color: "white", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "none", minHeight: "auto" }}
                      >
                        <Plus size={13} /> Nova Coleta
                      </button>
                    </OnboardingTooltip>
                  </div>
                </div>
                {/* Tabela */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "white" }}>
                  {/* Cabeçalho da tabela */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 60px 100px 110px 80px", gap: 0, padding: "8px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Empresa", "CNPJ", "Data", "Docs", "FMM/mês", "Decisão", ""].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: i >= 2 ? "center" : "left" }}>{h}</div>
                    ))}
                  </div>
                <div>
                  {visibleGroups.map((group, rowIdx) => {
                    const col = group.best;
                    const isMulti = group.items.length > 1;
                    const isExpanded = expandedGroups.has(group.key);
                    const toggleGroup = () => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                      return next;
                    });
                    const decisaoColor = col.decisao === "APROVADO" ? "#16a34a"
                      : col.decisao === "REPROVADO" ? "#dc2626"
                      : col.decisao === "APROVACAO_CONDICIONAL" ? "#7c3aed"
                      : col.status === "in_progress" ? "#d97706" : "#94a3b8";
                    const decisaoLabel = col.decisao === "APROVACAO_CONDICIONAL" ? "Condicional"
                      : col.decisao === "APROVADO" ? "Aprovado"
                      : col.decisao === "REPROVADO" ? "Recusado"
                      : "Em andamento";
                    const companyInitial = (col.company_name || col.label || "?").charAt(0).toUpperCase();
                    const fmmFmt = col.fmm_12m ? `R$ ${Number(col.fmm_12m).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "—";
                    const cnpjFmt = col.cnpj ? col.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—";
                    return (
                      <div key={group.key} style={{ borderBottom: rowIdx < visibleGroups.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        {/* Linha principal */}
                        <div style={{
                          display: "grid", gridTemplateColumns: "2fr 1fr 80px 60px 100px 110px 80px",
                          gap: 0, padding: "10px 16px", alignItems: "center",
                          background: rowIdx % 2 === 1 ? "#fafbfc" : "white",
                          borderLeft: `3px solid ${decisaoColor}`,
                          transition: "background 0.1s",
                        }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                          onMouseLeave={e => (e.currentTarget.style.background = rowIdx % 2 === 1 ? "#fafbfc" : "white")}
                        >
                          {/* Empresa */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 5, background: "#0a1232", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{companyInitial}</span>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {col.company_name || col.label || "Sem identificação"}
                              </p>
                              {col.observacoes && <p style={{ fontSize: 10, color: "#94a3b8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.observacoes}</p>}
                            </div>
                            {isMulti && <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b", flexShrink: 0 }}>{group.items.length}×</span>}
                          </div>
                          {/* CNPJ */}
                          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap" }}>{cnpjFmt}</div>
                          {/* Data */}
                          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>{group.date}</div>
                          {/* Docs */}
                          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>{col.documents?.length || 0}</div>
                          {/* FMM */}
                          <div style={{ fontSize: 11, fontWeight: col.fmm_12m ? 600 : 400, color: col.fmm_12m ? "#0f172a" : "#cbd5e1", textAlign: "center", fontFamily: "monospace" }}>{fmmFmt}</div>
                          {/* Decisão */}
                          <div style={{ textAlign: "center" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, color: decisaoColor, background: `${decisaoColor}12`, border: `1px solid ${decisaoColor}30` }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: decisaoColor, flexShrink: 0 }} />
                              {decisaoLabel}
                            </span>
                          </div>

                          {/* Ações */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            {col.status === "in_progress" && (
                              <button onClick={() => handleResumeCollection(col.id)} style={{
                                display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700,
                                padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer",
                                background: "#0a1232", color: "white", minHeight: "auto",
                              }}>
                                <RefreshCw size={9} /> Retomar
                              </button>
                            )}
                            <a href={`/historico?highlight=${col.id}`} style={{
                              width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#94a3b8", textDecoration: "none", border: "1px solid #e2e8f0",
                            }}
                              onMouseEnter={e => { e.currentTarget.style.color = "#203b88"; e.currentTarget.style.borderColor = "#203b88"; }}
                              onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                            >
                              <ArrowRight size={11} />
                            </a>
                            {isMulti && (
                              <button onClick={toggleGroup} style={{
                                width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#94a3b8", background: "transparent", border: "1px solid #e2e8f0", cursor: "pointer", minHeight: "auto",
                              }}>
                                <ChevronDown size={11} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded sub-attempts */}
                        {isMulti && isExpanded && (
                          <div style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                            {group.items.map((attempt, j) => (
                              <div key={attempt.id} style={{ padding: "10px 16px 10px 19px", display: "flex", alignItems: "center", gap: 10, borderTop: j > 0 ? "1px solid #f1f5f9" : "none" }}>
                                <div style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #e2e8f0" }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>{group.items.length - j}</span>
                                </div>
                                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748b" }}>
                                    <Clock size={9} /> {new Date(attempt.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  <span style={{ color: "#cbd5e1", fontSize: 10 }}>·</span>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748b" }}>
                                    <FileText size={9} /> {attempt.documents?.length || 0} docs
                                  </span>
                                </div>
                                {attempt.decisao ? (
                                  <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700,
                                    padding: "2px 8px", borderRadius: 99, flexShrink: 0,
                                    ...(attempt.decisao === "APROVADO" ? { color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0" }
                                      : attempt.decisao === "REPROVADO" ? { color: "#dc2626", background: "#fff1f2", border: "1px solid #fecaca" }
                                      : { color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe" })
                                  }}>
                                    {attempt.decisao === "APROVACAO_CONDICIONAL" ? "Condicional" : attempt.decisao === "APROVADO" ? "Aprovado" : "Recusado"}
                                  </span>
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "#d97706", flexShrink: 0 }}>
                                    <Clock size={9} /> Em andamento
                                  </span>
                                )}
                                {attempt.status === "in_progress" && (
                                  <button onClick={() => handleResumeCollection(attempt.id)} style={{
                                    display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                                    padding: "3px 9px", borderRadius: 6, border: "none", cursor: "pointer",
                                    background: "#192f5d", color: "white", flexShrink: 0, minHeight: "auto",
                                  }}>
                                    <RefreshCw size={9} /> Retomar
                                  </button>
                                )}
                                <a href={`/historico?highlight=${attempt.id}`} style={{
                                  width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                                  color: "#94a3b8", textDecoration: "none", flexShrink: 0,
                                }}
                                  onMouseEnter={e => { e.currentTarget.style.color = "#203b88"; e.currentTarget.style.background = "#eff6ff"; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "transparent"; }}
                                >
                                  <ArrowRight size={11} />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>{/* fim rows */}
                </div>{/* fim tabela */}
                {hasMore && (
                  <button
                    onClick={() => setListaLimit(prev => prev + 10)}
                    className="mt-2 w-full text-xs font-semibold text-cf-navy hover:text-cf-green py-2.5 border border-cf-border rounded-lg bg-white hover:bg-cf-bg transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    Carregar mais ({groups.length - listaLimit} restantes)
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
          <GenerateStep data={extractedData} originalFiles={originalFiles} collectionId={collectionId} onCollectionIdChange={setCollectionId} onBack={() => setStep("review")} onReset={() => { setShowDashboard(true); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setCollectionId(null); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); }} onNotify={handleNotify} onFirstCollection={markFirstCollectionDone} onAbrirScoreForm={() => { setStep("review"); setTimeout(() => { document.getElementById("score-section")?.scrollIntoView({ behavior: "smooth" }); }, 300); }} />
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
              onComplete={(d, files, processedDocs) => {
                setExtractedData(d);
                setOriginalFiles(files);
                // Salva quais seções tinham arquivos para restaurar corretamente ao voltar de review.
                // Não usa buildCollectionDocs aqui pois ele pula docs com extração vazia/parcial.
                if (processedDocs && processedDocs.length > 0) {
                  setResumedDocs(processedDocs);
                  confirmedDocsRef.current = processedDocs;
                }
                setLocalDraft(null);
                try { localStorage.removeItem(DRAFT_KEY); } catch {/**/}
                setStep("review");
              }}
              onDataChange={(d) => { setExtractedData(d); autoSaveCollection(d); }}
              resumedDocs={resumedDocs}
              initialData={extractedData}
              highlightKeys={goalfyHighlight.length > 0 ? goalfyHighlight : undefined}
            />
          )}
          {step === "review" && collectionId && (
            <ScoreSection collectionId={collectionId} extractedData={extractedData} />
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
      <footer style={{ background: "#f1f5f9", borderTop: "1px solid #e2e8f0", marginTop: 40 }}>
        <div style={{ height: 3, background: "linear-gradient(90deg, #73b815, #a8d96b 60%, transparent)" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <Logo height={22} />
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, letterSpacing: "0.01em" }}>
            © {new Date().getFullYear()} Capital Finanças · Uso interno e confidencial
          </p>
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
