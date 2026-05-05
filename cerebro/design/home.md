# Aba: Nova Análise (Home)

Tela principal da plataforma — fluxo de 3 passos: Upload → Revisão → Geração de relatório.

**Fluxo do usuário:**
1. **UploadStep:** analista faz upload dos documentos (CNPJ, QSA, contrato social, faturamento, SCR, balanço, DRE, etc.). Pipeline extrai via Gemini.
2. **ReviewStep:** analista revisa os campos extraídos antes da análise final, dividido em ~12 sub-seções (uma por tipo de documento).
3. **GenerateStep:** dispara análise de IA, mostra parecer + score, exporta relatório PDF/HTML.

Gerado em 2026-05-05T12:26:17.755Z

---

## Sumário
- `app/page.tsx`
- `components/UploadStep.tsx`
- `components/ReviewStep.tsx`
- `components/GenerateStep.tsx`
- `components/UploadArea.tsx`
- `components/AlertList.tsx`
- `components/ProgressBar.tsx`
- `components/WelcomeModal.tsx`
- `components/FirstCollectionChecklist.tsx`
- `components/GoalfyButton.tsx`
- `components\review\SectionBalanco.tsx`
- `components\review\SectionCNPJ.tsx`
- `components\review\SectionContrato.tsx`
- `components\review\SectionCurvaABC.tsx`
- `components\review\SectionDRE.tsx`
- `components\review\SectionFaturamento.tsx`
- `components\review\SectionGrupoEconomico.tsx`
- `components\review\SectionIRSocios.tsx`
- `components\review\SectionProcessos.tsx`
- `components\review\SectionProtestos.tsx`
- `components\review\SectionQSA.tsx`
- `components\review\SectionRelatorioVisita.tsx`
- `components\review\SectionSCR.tsx`
- `components\review\SectionSCRSocios.tsx`
- `components\review\shared.tsx`
- `components\generate\ExportSection.tsx`
- `components\generate\NotasSection.tsx`
- `components\generate\VisitaSection.tsx`
- `components\report\ReportComponents.tsx`
- `components\score\ScoreForm.tsx`
- `components\score\ScoreSection.tsx`
- `components\score\ScoreSummaryCard.tsx`

---

## app/page.tsx

```tsx
﻿"use client";

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
        // Nunca descarta tipos confirmados (extrações vazias não devem apagar o registro do doc).
        //
        // Match por TYPE, não por filename: confirmedDocsRef tem filenames de upload
        // ("SCR-BB-2024-11.pdf"), enquanto buildCollectionDocs gera nomes canônicos
        // ("scr-bacen.pdf", "scr-bacen-1.pdf"). Se compararmos por filename, nenhum bate
        // e geramos placeholders extras a cada autosave — para multi-instance isso virava
        // SCR anterior fantasma.
        const confirmed = confirmedDocsRef.current;
        const MULTI_INSTANCE = new Set(["scr_bacen", "ir_socio"]);
        const freshTypeSet = new Set(freshDocs.map(d => d.type));
        const freshTypeCount: Record<string, number> = {};
        for (const d of freshDocs) freshTypeCount[d.type] = (freshTypeCount[d.type] ?? 0) + 1;
        const confirmedTypeCount: Record<string, number> = {};
        for (const c of confirmed) confirmedTypeCount[c.type] = (confirmedTypeCount[c.type] ?? 0) + 1;
        const extra: CollectionDocument[] = [];
        const seenSingle = new Set<string>();
        const usedMulti: Record<string, number> = {};
        for (const c of confirmed) {
          if (MULTI_INSTANCE.has(c.type)) {
            // Adiciona apenas o déficit: se temos N confirmed e M < N freshDocs, faltam N-M.
            const deficit = (confirmedTypeCount[c.type] ?? 0) - (freshTypeCount[c.type] ?? 0);
            const used = usedMulti[c.type] ?? 0;
            if (used < deficit) {
              extra.push(c);
              usedMulti[c.type] = used + 1;
            }
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

  // Listener: quando o usuário clica em "Visão Geral" ou na logo estando em "/",
  // o LayoutShell dispara este evento para resetarmos o state local (showDashboard,
  // step etc). Sem isso, ficaríamos presos na Nova Coleta porque router.refresh()
  // não remonta o componente client.
  useEffect(() => {
    const handler = () => {
      setShowDashboard(true);
      setStep("upload");
      setResumedDocs(undefined);
      setExtractedData(defaultData);
      setCollectionId(null);
      setLocalDraft(null);
      setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    };
    window.addEventListener("cf:go-to-dashboard", handler);
    return () => window.removeEventListener("cf:go-to-dashboard", handler);
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
              const handleNovaColeta = () => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setCollectionId(null); confirmedDocsRef.current = []; try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} };

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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
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
                    <div style={{ background: "white", borderRadius: 8, border: "1px solid #e2e8f0", padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 0" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 20, whiteSpace: "nowrap" }}>Decisões</span>
                      {[
                        { label: "Aprovadas",    value: metricas.porDecisao.aprovado,                      color: "#16a34a" },
                        { label: "Condicionais", value: metricas.porDecisao.condicional,                   color: "#7c3aed" },
                        { label: "Em Análise",   value: metricas.porDecisao.pendente + metricas.emAnalise, color: "#d97706" },
                        { label: "Recusadas",    value: metricas.porDecisao.reprovado,                     color: "#dc2626" },
                      ].map((d, i, arr) => (
                        <div key={d.label} style={{
                          display: "flex", alignItems: "center", gap: 8, flex: "1 1 130px",
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

              {/* Empresa (dropdown compacto) + Limpar.
                  Antes era pill por empresa — com 15+ empresas, poluía o
                  dashboard. Agora é um <select> simples + chip indicando
                  o filtro ativo. */}
              {(companies.length > 1 || hasActiveFilters) && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {companies.length > 1 && (
                    <div className="relative inline-flex items-center">
                      <Building2 size={12} className="absolute left-2.5 text-cf-text-3 pointer-events-none" />
                      <select
                        value={selectedCompany ?? ""}
                        onChange={e => { setSelectedCompany(e.target.value || null); setListaLimit(10); }}
                        aria-label="Filtrar por empresa"
                        className="appearance-none pl-7 pr-8 py-1 rounded-full text-[11px] font-medium border border-cf-border bg-white text-cf-text-2 hover:bg-cf-bg cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-cf-navy/20"
                        style={{ minHeight: "auto" }}
                      >
                        <option value="">Todas as empresas ({companies.length})</option>
                        {companies.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-2.5 text-cf-text-3 pointer-events-none" />
                    </div>
                  )}
                  {selectedCompany && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cf-navy text-white text-[11px] font-medium">
                      {selectedCompany}
                      <button
                        onClick={() => { setSelectedCompany(null); setListaLimit(10); }}
                        aria-label="Remover filtro de empresa"
                        className="hover:bg-white/15 rounded-full leading-none px-1"
                        style={{ minHeight: "auto" }}
                      >
                        ×
                      </button>
                    </span>
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
                  onClick={() => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setCollectionId(null); confirmedDocsRef.current = []; try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} }}
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
                        onClick={() => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} setCollectionId(null); confirmedDocsRef.current = []; try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} }}
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "8px", background: "#203b88", color: "white", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "none", minHeight: "auto" }}
                      >
                        <Plus size={13} /> Nova Coleta
                      </button>
                    </OnboardingTooltip>
                  </div>
                </div>
                {/* Tabela */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "white" }}>
                  {/* Cabeçalho da tabela */}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) 160px 90px 60px 120px 120px 100px", gap: 12, padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", alignItems: "center" }}>
                    {["Empresa", "CNPJ", "Data", "Docs", "FMM/mês", "Decisão", ""].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: i >= 2 && i <= 5 ? "center" : i === 6 ? "right" : "left" }}>{h}</div>
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
                          display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) 160px 90px 60px 120px 120px 100px",
                          gap: 12, padding: "10px 16px", alignItems: "center",
                          background: rowIdx % 2 === 1 ? "#fafbfc" : "white",
                          borderLeft: `3px solid ${decisaoColor}`,
                          transition: "background 0.1s",
                          minHeight: 56,
                        }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                          onMouseLeave={e => (e.currentTarget.style.background = rowIdx % 2 === 1 ? "#fafbfc" : "white")}
                        >
                          {/* Empresa */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 5, background: "#0a1232", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{companyInitial}</span>
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                                  {col.company_name || col.label || "Sem identificação"}
                                </p>
                                {isMulti && (
                                  <span title={`${group.items.length} coletas desta empresa`} style={{
                                    fontSize: 9, fontWeight: 700, color: "#64748b",
                                    background: "#f1f5f9", padding: "1px 5px", borderRadius: 3,
                                    flexShrink: 0, lineHeight: 1.4,
                                  }}>
                                    {group.items.length}×
                                  </span>
                                )}
                              </div>
                              {col.observacoes && (
                                <p title={col.observacoes} style={{
                                  fontSize: 10, color: "#94a3b8", margin: "1px 0 0",
                                  display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
                                  overflow: "hidden", textOverflow: "ellipsis",
                                }}>
                                  {col.observacoes}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* CNPJ */}
                          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cnpjFmt}</div>
                          {/* Data */}
                          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", whiteSpace: "nowrap" }}>{group.date}</div>
                          {/* Docs */}
                          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>{col.documents?.length || 0}</div>
                          {/* FMM */}
                          <div style={{ fontSize: 11, fontWeight: col.fmm_12m ? 600 : 400, color: col.fmm_12m ? "#0f172a" : "#cbd5e1", textAlign: "center", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmmFmt}</div>
                          {/* Decisão — altura padronizada com botões de ação (26px) */}
                          <div style={{ textAlign: "center" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              fontSize: 10.5, fontWeight: 700, height: 26, padding: "0 10px",
                              borderRadius: 6, color: decisaoColor, background: `${decisaoColor}12`,
                              border: `1px solid ${decisaoColor}30`, whiteSpace: "nowrap",
                              boxSizing: "border-box",
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: decisaoColor, flexShrink: 0 }} />
                              {decisaoLabel}
                            </span>
                          </div>

                          {/* Ações — todos os elementos com height: 26 para alinhar com Decisão */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                            {col.status === "in_progress" && (
                              <button onClick={() => handleResumeCollection(col.id)} style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                fontSize: 10.5, fontWeight: 700, height: 26, padding: "0 11px",
                                borderRadius: 6, border: "none", cursor: "pointer",
                                background: "#0a1232", color: "white", minHeight: "auto",
                                boxSizing: "border-box",
                              }}>
                                <RefreshCw size={11} /> Retomar
                              </button>
                            )}
                            <a href={`/historico?highlight=${col.id}`} style={{
                              width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#94a3b8", textDecoration: "none", border: "1px solid #e2e8f0",
                              boxSizing: "border-box",
                            }}
                              onMouseEnter={e => { e.currentTarget.style.color = "#203b88"; e.currentTarget.style.borderColor = "#203b88"; }}
                              onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                            >
                              <ArrowRight size={12} />
                            </a>
                            {isMulti && (
                              <button onClick={toggleGroup} style={{
                                width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#94a3b8", background: "transparent", border: "1px solid #e2e8f0", cursor: "pointer", minHeight: "auto",
                                boxSizing: "border-box",
                              }}>
                                <ChevronDown size={12} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded sub-attempts */}
                        {isMulti && isExpanded && (
                          <div style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                            {group.items.map((attempt, j) => (
                              <div key={attempt.id} style={{ padding: "8px 16px 8px 60px", display: "flex", alignItems: "center", gap: 12, borderTop: j > 0 ? "1px solid #eef2f7" : "none", minHeight: 40 }}>
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

        <div key="generate" className="w-full animate-fade-in">
          <GenerateStep data={extractedData} originalFiles={originalFiles} collectionId={collectionId} onCollectionIdChange={setCollectionId} onBack={() => setStep("review")} onReset={() => { setShowDashboard(true); setStep("upload"); setExtractedData(defaultData); setResumedDocs(undefined); setCollectionId(null); confirmedDocsRef.current = []; setLocalDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch {/**/} try { const url = new URL(window.location.href); url.searchParams.delete("resume"); url.searchParams.delete("step"); window.history.replaceState({}, "", url.toString()); } catch {/**/} setOriginalFiles({ cnpj: [], qsa: [], contrato: [], faturamento: [], scr: [], scrAnterior: [], scr_socio: [], scr_socio_anterior: [], dre: [], balanco: [], curva_abc: [], ir_socio: [], relatorio_visita: [] }); }} onNotify={handleNotify} onFirstCollection={markFirstCollectionDone} onAbrirScoreForm={() => { setStep("review"); setTimeout(() => { document.getElementById("score-section")?.scrollIntoView({ behavior: "smooth" }); }, 300); }} />
        </div>

        ) : (

        <div key={step} className="max-w-2xl mx-auto animate-fade-in">
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

```

## components/UploadStep.tsx

```tsx
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, Info, GitCompareArrows, Receipt, Scale, PieChart, FileKey, ClipboardList, Loader2 } from "lucide-react";
import UploadArea from "./UploadArea";
import OnboardingTooltip from "./OnboardingTooltip";
import { useTooltips } from "@/lib/useTooltips";
import { CNPJData, QSAData, ContratoSocialData, FaturamentoData, SCRData, SCRSocioData, ProtestosData, ProcessosData, GrupoEconomicoData, ExtractedData, IRSocioData, CollectionDocument } from "@/types";
import { upload } from "@vercel/blob/client";
import { mergeQsaWithContrato } from "@/lib/mergeQsaWithContrato";
import { toast } from "sonner";

// ─── Types ───

type DocKey = 'cnpj' | 'qsa' | 'contrato' | 'faturamento' | 'scr' | 'scrAnterior' | 'scr_socio' | 'scr_socio_anterior' | 'dre' | 'balanco' | 'curva_abc' | 'ir_socio' | 'relatorio_visita';

interface SectionState {
  files: File[];
  processing: boolean;
  processedCount: number;
  errorCount: number;
  errorType?: "quota" | "parse" | "empty" | "unknown";
  errorMessage?: string;
  retrying?: boolean;
  lastFailedFile?: File;
  lastSuccessFile?: File;
  fromCache?: boolean;
  resumedFilenames?: string[]; // filenames from a resumed collection
  // URLs do Vercel Blob dos arquivos originais (paralelo a resumedFilenames).
  // Permite "Reprocessar extração" em coletas retomadas — sem File em memória,
  // baixamos o blob e re-disparamos a extração.
  resumedBlobUrls?: string[];
}

// ─── Fila global de extração — evita estouro de quota (RPM) no Gemini ───
// Flash free tier: 15 RPM → 4s entre chamadas suficiente.
// Backend já trata 429 com backoff — delay aqui só previne rajadas.
// Primeira chamada da fila é imediata; as demais esperam EXTRACT_DELAY_MS.
const EXTRACT_DELAY_MS = 4000;
let extractQueue: Promise<unknown> = Promise.resolve();
let extractPending = 0;

function enqueueExtract(fn: () => Promise<unknown>): Promise<unknown> {
  const needsDelay = extractPending > 0;
  extractPending++;
  const prev = extractQueue;
  const next = prev.then(async () => {
    if (needsDelay) await new Promise(r => setTimeout(r, EXTRACT_DELAY_MS));
    try {
      return await fn();
    } finally {
      extractPending = Math.max(0, extractPending - 1);
    }
  });
  extractQueue = next.catch(() => {});
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


export interface OriginalFiles {
  cnpj: File[];
  qsa: File[];
  contrato: File[];
  faturamento: File[];
  scr: File[];
  scrAnterior: File[];
  scr_socio: File[];
  scr_socio_anterior: File[];
  dre: File[];
  balanco: File[];
  curva_abc: File[];
  ir_socio: File[];
  relatorio_visita: File[];
}

// ─── Defaults ───

const defaultCNPJ: CNPJData = { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" };
const defaultQSA: QSAData = { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] };
const defaultContrato: ContratoSocialData = { socios:[],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" };
const defaultFaturamento: FaturamentoData = { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" };
const defaultSCR: SCRData = { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" };
const defaultProtestos: ProtestosData = { vigentesQtd:"",vigentesValor:"",regularizadosQtd:"",regularizadosValor:"",detalhes:[] };
const defaultProcessos: ProcessosData = { passivosTotal:"",ativosTotal:"",valorTotalEstimado:"",temRJ:false,distribuicao:[],bancarios:[],fiscais:[],fornecedores:[],outros:[] };
const defaultGrupoEconomico: GrupoEconomicoData = { empresas:[] };

// ─── Merge logic ───

// Chaves naturais para dedupe de arrays em merge (evita duplicar socios/clientes/empresas)
const ARRAY_DEDUPE_KEYS: Record<string, string[]> = {
  quadroSocietario: ["cpfCnpj", "nome"],
  socios: ["cpf", "nome"],
  meses: ["mes"],
  empresas: ["cnpj", "razaoSocial"],
  detalhes: ["numero", "data"],
  distribuicao: ["tipo"],
  clientes: ["cnpj", "nome"],
  anos: ["ano"],
  top10Recentes: ["numero"],
  bancarios: ["nome", "numero"],
  modalidades: ["nome"],
  instituicoes: ["nome"],
};

function dedupeArray(key: string, arr: unknown[]): unknown[] {
  const idKeys = ARRAY_DEDUPE_KEYS[key];
  if (!idKeys) return arr; // sem chave natural — retorna como esta
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") { out.push(item); continue; }
    const obj = item as Record<string, unknown>;
    const id = idKeys.map(k => String(obj[k] || "")).join("|").trim();
    if (!id || id === new Array(idKeys.length).fill("").join("|")) { out.push(item); continue; }
    if (seen.has(id)) continue; // duplicata
    seen.add(id);
    out.push(item);
  }
  return out;
}

function mergeData(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value) && Array.isArray(result[key])) {
      // Arrays: concatena + deduplica por chave natural quando existe
      const combined = [...(result[key] as unknown[]), ...value];
      result[key] = dedupeArray(key, combined);
    } else if (Array.isArray(value)) {
      // Novo array sobrescreve — aplica dedupe mesmo assim
      result[key] = dedupeArray(key, value);
    } else if (typeof value === "string") {
      // String: incoming ganha SEMPRE, exceto quando incoming vazio E existing tem algo
      const existingStr = typeof result[key] === "string" ? (result[key] as string) : "";
      if (value.length > 0 || existingStr.length === 0) {
        result[key] = value;
      }
    } else if (typeof value === "boolean") {
      // Boolean: incoming sempre ganha (inclui false como informacao valida)
      result[key] = value;
    } else if (value !== undefined && value !== null) {
      result[key] = value;
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
  // SCR removido: consultado automaticamente via DataBox360 (API BCB)
  { key: 'dre',              title: 'DRE — Demonstração de Resultado',   description: 'Demonstração de resultado dos últimos 2-3 anos',                 icon: <Receipt size={19} />,          stepNumber: '▿', required: false },
  { key: 'balanco',          title: 'Balanço Patrimonial',               description: 'Balanço dos últimos 2-3 anos',                                   icon: <Scale size={19} />,            stepNumber: '▿', required: false },
  { key: 'curva_abc',        title: 'Curva ABC — Top Clientes',          description: 'Carteira de clientes com concentração de receita',               icon: <PieChart size={19} />,         stepNumber: '▿', required: false },
  { key: 'ir_socio',         title: 'IR dos Sócios (opcional)',          description: 'Declaração de imposto de renda dos sócios',                      icon: <FileKey size={19} />,          stepNumber: '▿', required: false },
  { key: 'relatorio_visita', title: 'Relatório de Visita',               description: 'Relatório da visita presencial à empresa',                       icon: <ClipboardList size={19} />,    stepNumber: '▿', required: false },
];

const REQUIRED_KEYS: DocKey[] = ['cnpj', 'qsa', 'contrato', 'faturamento'];

// ─── GroupHeader ───

function GroupHeader({ label, count, total, optional }: { label: string; count?: number; total?: number; optional?: boolean }) {
  const done = count ?? 0;
  const all  = total ?? 0;
  const allDone = !optional && done === all && all > 0;
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div className="flex-1 h-px bg-cf-border" />
      {!optional ? (
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 10px", borderRadius: "99px", flexShrink: 0,
          background: allDone ? "#dcfce7" : "#F1F5F9",
          color: allDone ? "#15803d" : "#64748B",
          transition: "background 0.3s, color 0.3s",
        }}>
          {done}/{all} enviados
        </span>
      ) : (
        <span style={{ fontSize: "10px", fontWeight: 500, color: "#94A3B8", flexShrink: 0 }}>opcional</span>
      )}
    </div>
  );
}

// ─── Component ───

// Goalfy doc_type → DocKey (para highlight via URL param)
const GOALFY_TYPE_TO_KEY: Partial<Record<string, DocKey>> = {
  contrato_social: 'contrato', faturamento: 'faturamento',
  scr: 'scr', dre: 'dre', balanco: 'balanco', curva_abc: 'curva_abc',
  qsa: 'qsa', ir_socio: 'ir_socio', relatorio_visita: 'relatorio_visita',
  contrato: 'contrato',
};

// Mapa de tipo de CollectionDocument para DocKey do UploadStep
const DOC_TYPE_TO_KEY: Record<string, DocKey | null> = {
  cnpj: 'cnpj', qsa: 'qsa', contrato_social: 'contrato', faturamento: 'faturamento',
  scr_bacen: 'scr', scr_socio: 'scr_socio', scr_socio_anterior: 'scr_socio_anterior', dre: 'dre', balanco: 'balanco', curva_abc: 'curva_abc',
  ir_socio: 'ir_socio', relatorio_visita: 'relatorio_visita',
  protestos: null, processos: null, grupo_economico: null, outro: null,
};

function buildInitialSections(resumedDocs: CollectionDocument[]): Record<DocKey, SectionState> {
  const empty = (): SectionState => ({ files: [], processing: false, processedCount: 0, errorCount: 0 });
  const sections: Record<DocKey, SectionState> = {
    cnpj: empty(), qsa: empty(), contrato: empty(), faturamento: empty(),
    scr: empty(), scrAnterior: empty(), scr_socio: empty(), scr_socio_anterior: empty(), dre: empty(), balanco: empty(),
    curva_abc: empty(), ir_socio: empty(), relatorio_visita: empty(),
  };

  const scrDocs = resumedDocs.filter(d => d.type === 'scr_bacen');

  // Separa SCR da empresa (PJ) dos SCR de sócios (PF).
  // tipoPessoa é definido em buildCollectionDocs.ts; fallback pelo filename para registros antigos.
  const scrPJ = scrDocs.filter(d => {
    const tp = (d.extracted_data as Record<string, unknown>)?.tipoPessoa;
    if (tp === 'PJ') return true;
    if (tp === 'PF') return false;
    // Registros antigos sem tipoPessoa: se filename contém "socio" é PF, caso contrário PJ
    return !String(d.filename ?? '').includes('socio');
  });
  const scrPF_atual = scrDocs.filter(d => {
    const tp = (d.extracted_data as Record<string, unknown>)?.tipoPessoa;
    if (tp !== 'PF' && !String(d.filename ?? '').includes('socio')) return false;
    return !String(d.filename ?? '').includes('anterior');
  });
  const scrPF_anterior = scrDocs.filter(d => {
    const tp = (d.extracted_data as Record<string, unknown>)?.tipoPessoa;
    if (tp !== 'PF' && !String(d.filename ?? '').includes('socio')) return false;
    return String(d.filename ?? '').includes('anterior');
  });

  for (const doc of resumedDocs) {
    if (doc.type === 'scr_bacen') continue; // handle separately
    const key = DOC_TYPE_TO_KEY[doc.type];
    if (!key) continue;
    sections[key].processedCount += 1;
    sections[key].resumedFilenames = [...(sections[key].resumedFilenames || []), doc.filename];
    sections[key].resumedBlobUrls  = [...(sections[key].resumedBlobUrls  || []), doc.blob_url || ""];
  }

  // SCR empresa (PJ): primeiro → scr, segundo → scrAnterior
  if (scrPJ.length >= 1) {
    sections.scr.processedCount = 1;
    sections.scr.resumedFilenames = [scrPJ[0].filename];
    sections.scr.resumedBlobUrls  = [scrPJ[0].blob_url || ""];
  }
  if (scrPJ.length >= 2) {
    sections.scrAnterior.processedCount = 1;
    sections.scrAnterior.resumedFilenames = [scrPJ[1].filename];
    sections.scrAnterior.resumedBlobUrls  = [scrPJ[1].blob_url || ""];
  }

  // SCR sócios (PF): um slot por tipo, pode ter múltiplos arquivos
  if (scrPF_atual.length > 0) {
    sections.scr_socio.processedCount = scrPF_atual.length;
    sections.scr_socio.resumedFilenames = scrPF_atual.map(d => d.filename);
    sections.scr_socio.resumedBlobUrls  = scrPF_atual.map(d => d.blob_url || "");
  }
  if (scrPF_anterior.length > 0) {
    sections.scr_socio_anterior.processedCount = scrPF_anterior.length;
    sections.scr_socio_anterior.resumedFilenames = scrPF_anterior.map(d => d.filename);
    sections.scr_socio_anterior.resumedBlobUrls  = scrPF_anterior.map(d => d.blob_url || "");
  }

  return sections;
}

export default function UploadStep({
  onComplete,
  resumedDocs,
  initialData,
  onDataChange,
  highlightKeys,
}: {
  onComplete: (data: ExtractedData, files: OriginalFiles, processedDocs?: CollectionDocument[]) => void;
  resumedDocs?: CollectionDocument[];
  initialData?: ExtractedData;
  onDataChange?: (data: ExtractedData) => void;
  highlightKeys?: string[];
}) {
  const [sections, setSections] = useState<Record<DocKey, SectionState>>(() =>
    resumedDocs && resumedDocs.length > 0 ? buildInitialSections(resumedDocs) : {
      cnpj:        { files: [], processing: false, processedCount: 0, errorCount: 0 },
      qsa:         { files: [], processing: false, processedCount: 0, errorCount: 0 },
      contrato:    { files: [], processing: false, processedCount: 0, errorCount: 0 },
      faturamento: { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scr:              { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scrAnterior:      { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scr_socio:        { files: [], processing: false, processedCount: 0, errorCount: 0 },
      scr_socio_anterior: { files: [], processing: false, processedCount: 0, errorCount: 0 },
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

  // Notifica o pai a cada mudanca em `extracted` para auto-save no Supabase.
  // Pulamos a primeira execucao quando initialData ja foi passado (evita
  // re-salvar imediatamente uma coleta retomada).
  const skipFirstDataChange = useRef(!!initialData);
  useEffect(() => {
    if (skipFirstDataChange.current) { skipFirstDataChange.current = false; return; }
    onDataChange?.(extracted);
  }, [extracted, onDataChange]);

  const { isSeen, markSeen } = useTooltips();

  // ── Bureau state ──
  const [bureauStatus, setBureauStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [bureauDetail, setBureauDetail] = useState<Record<string, { success: boolean; mock: boolean; error?: string }>>({});

  const highlightedSet = useMemo(() => {
    if (!highlightKeys || highlightKeys.length === 0) return new Set<DocKey>();
    return new Set(highlightKeys.map(k => GOALFY_TYPE_TO_KEY[k]).filter(Boolean) as DocKey[]);
  }, [highlightKeys]);

  const sectionRefs = useRef<Partial<Record<DocKey, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (highlightedSet.size === 0) return;
    const timer = setTimeout(() => {
      const firstKey = SECTIONS.find(s => highlightedSet.has(s.key))?.key;
      if (firstKey) sectionRefs.current[firstKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bureauTriggered = useRef(false);
  const qsaBureauTriggered = useRef(false);

  // Auto-trigger bureaus when CNPJ is extracted
  useEffect(() => {
    const cnpj = extracted.cnpj?.cnpj;
    if (!cnpj || bureauTriggered.current) return;
    bureauTriggered.current = true;
    setBureauStatus("loading");

    (async () => {
      try {
        // 1. Fetch CreditHub DIRECTLY from browser com RETRY POLLING
        // A API do CreditHub é assíncrona: retorna 500+402 com push=true até os dados estarem prontos
        const cnpjNum = cnpj.replace(/\D/g, "");
        const CREDITHUB_KEY = "9d3b1f096fe2b4c5ba9855d286c92d38";
        const CH_URL = `https://irql.credithub.com.br/simples/${CREDITHUB_KEY}/${cnpjNum}`;
        const MAX_ATTEMPTS = 15;
        const RETRY_DELAY_MS = 2000;
        let creditHubRaw: unknown = null;
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        console.log(`[credithub] iniciando polling (${MAX_ATTEMPTS} tentativas, ${RETRY_DELAY_MS}ms entre)`);
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const chRes = await fetch(CH_URL);
            const text = await chRes.text();
            const ct = chRes.headers.get("content-type") || "";
            // Tenta parsear JSON mesmo se status não for 2xx
            // (CreditHub usa 500 para avisar "em processamento" com push=true)
            if (text.trim().startsWith("{") || ct.includes("json")) {
              try {
                const parsed = JSON.parse(text);
                // Sucesso: JSON válido com dados
                if (parsed && (parsed.data || parsed.cnpj || parsed.razaoSocial || parsed.protestos || parsed.processos || parsed.completed !== undefined)) {
                  creditHubRaw = parsed;
                  console.log(`[credithub] ✓ tentativa ${attempt}: JSON recebido | completed=${parsed.completed ?? parsed.data?.completed} | keys=${Object.keys(parsed).slice(0, 10).join(",")}`);
                  // Se a consulta está completa, para o polling
                  if (parsed.completed === true || parsed.data?.completed === true) {
                    console.log("[credithub] ✓ consulta COMPLETED — parando polling");
                    break;
                  }
                }
              } catch {
                // JSON parse falhou — continua polling
              }
            }
            // Se recebeu XML com push=true → consulta em processamento, tenta de novo
            if (text.includes("push=\"true\"")) {
              if (attempt < MAX_ATTEMPTS) {
                console.log(`[credithub] tentativa ${attempt}/${MAX_ATTEMPTS}: consulta em processamento, aguardando ${RETRY_DELAY_MS}ms...`);
                await sleep(RETRY_DELAY_MS);
                continue;
              }
            }
            // Status 500 sem push=true = erro real, para de tentar
            if (!chRes.ok && !text.includes("push=\"true\"")) {
              console.error(`[credithub] erro definitivo status=${chRes.status}:`, text.substring(0, 200));
              break;
            }
            // Se chegou aqui sem creditHubRaw definido ainda, continua tentando
            if (!creditHubRaw && attempt < MAX_ATTEMPTS) {
              await sleep(RETRY_DELAY_MS);
            }
          } catch (fetchErr) {
            console.warn(`[credithub] tentativa ${attempt} exception:`, fetchErr);
            if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
          }
        }

        if (!creditHubRaw) {
          console.warn("[credithub] ⚠ nenhum dado retornado após", MAX_ATTEMPTS, "tentativas");
        }

        // 2. Send everything to bureaus endpoint (server parses + merges)
        console.log("[bureaus] iniciando consulta BDC + Assertiva + demais bureaus...");
        const res = await fetch("/api/bureaus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj, data: extractedRef.current, creditHubRaw }),
        });
        if (!res.ok) {
          console.warn(`[bureaus] HTTP ${res.status} — resposta não-JSON`);
          setBureauStatus("error");
          return;
        }
        const json = await res.json();
        console.log(`[bureaus] resposta: success=${json.success} | bureaus=${Object.keys(json.bureaus ?? {}).join(",")} | mock=${Object.entries(json.bureaus ?? {}).filter(([,v]: any) => v?.mock).map(([k]) => k).join(",") || "nenhum"}`);
        if (json.success && json.merged) {
          setExtracted(prev => ({ ...prev, ...json.merged }));
        }
        if (json.bureaus) setBureauDetail(json.bureaus);
        setBureauStatus(json.success ? "done" : "error");
      } catch (err) {
        console.warn("[upload] erro ao consultar birôs:", err);
        setBureauStatus("error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extracted.cnpj?.cnpj]);

  // Merge QSA ← Contrato Social: sempre que ambos estão presentes, contrato
  // sobrescreve cpfCnpj/qualificacao/participacao/capitalInvestido nos sócios
  // do QSA. Sócios extras do contrato são adicionados ao QSA. Decisão tomada
  // com Victor 2026-05-04 — contrato é fonte mais confiável que Receita.
  useEffect(() => {
    const qsa = extracted.qsa;
    const contrato = extracted.contrato;
    if (!qsa || !contrato || !contrato.socios || contrato.socios.length === 0) return;
    const { qsa: mergedQsa, mergeMap } = mergeQsaWithContrato(qsa, contrato);
    // Idempotente: só atualiza state se realmente mudou (evita loop infinito).
    const changed =
      JSON.stringify(mergedQsa.quadroSocietario) !== JSON.stringify(qsa.quadroSocietario) ||
      JSON.stringify(mergeMap) !== JSON.stringify(extracted._qsaMergeMap || {});
    if (!changed) return;
    setExtracted(prev => ({ ...prev, qsa: mergedQsa, _qsaMergeMap: mergeMap }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extracted.qsa?.quadroSocietario, extracted.contrato?.socios]);

  // Re-call bureaus after QSA is extracted — SCR dos sócios precisa dos CPFs do QSA,
  // que não estão disponíveis no momento do primeiro disparo (CNPJ extraído antes do QSA).
  useEffect(() => {
    if (qsaBureauTriggered.current) return;
    if (bureauStatus !== "done") return;

    const socios = extracted.qsa?.quadroSocietario ?? [];
    const pfSocios = socios.filter(s => s.cpfCnpj?.replace(/\D/g, "").length === 11);
    if (pfSocios.length === 0) return;

    const scrJaPopulado = (extracted.scrSocios ?? []).length > 0;
    if (scrJaPopulado) return;

    qsaBureauTriggered.current = true;
    const cnpj = extracted.cnpj?.cnpj;
    if (!cnpj) return;

    console.log(`[bureaus-qsa] QSA disponível (${pfSocios.length} sócios PF) após bureau inicial — re-consultando para SCR dos sócios`);

    // Volta o status para "loading" enquanto a re-consulta roda. Sem isto, o usuário
    // poderia clicar "Prosseguir" antes de esta promise resolver, desmontar o UploadStep
    // e perder o setExtracted({ scrSocios }) que vem depois.
    setBureauStatus("loading");

    (async () => {
      try {
        const res = await fetch("/api/bureaus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj, data: extractedRef.current }),
        });
        if (!res.ok) {
          console.warn(`[bureaus-qsa] HTTP ${res.status}`);
          return;
        }
        const json = await res.json();
        console.log(`[bureaus-qsa] resposta: success=${json.success} | scrSocios=${json.merged?.scrSocios?.length ?? 0}`);
        if (json.success && json.merged?.scrSocios?.length > 0) {
          setExtracted(prev => ({ ...prev, scrSocios: json.merged.scrSocios }));
        }
        if (json.bureaus) setBureauDetail(prev => ({ ...prev, ...json.bureaus }));
      } catch (err) {
        console.warn("[bureaus-qsa] erro na re-consulta:", err);
      } finally {
        setBureauStatus("done");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bureauStatus, extracted.qsa?.quadroSocietario]);

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

    const apiType = type === 'scrAnterior' || type === 'scr_socio' || type === 'scr_socio_anterior' ? 'scr' : type;

    const BLOB_THRESHOLD = 4 * 1024 * 1024; // 4 MB
    // Vercel Blob rejeita pathnames com caracteres fora de a-z/0-9/-/_/./.
    // Contratos sociais frequentemente têm nomes como "Contrato Social - 3ª Alteração.pdf".
    const sanitizeBlobName = (name: string): string => {
      const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
      const base = name.slice(0, name.length - ext.length)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove acentos
        .replace(/[^a-zA-Z0-9._-]+/g, "_")                  // substitui especiais por _
        .replace(/_+/g, "_").replace(/^_|_$/g, "");         // limpa underscores extras
      const safeBase = base || "file";
      // Prefixo com timestamp para evitar colisões
      return `${Date.now()}-${safeBase}${ext.toLowerCase()}`;
    };

    for (const file of newFiles) {
      try {
        const json = await enqueueExtract(async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120000);

          let res: Response;
          if (file.size > BLOB_THRESHOLD) {
            const blob = await upload(sanitizeBlobName(file.name), file, {
              access: "public",
              handleUploadUrl: "/api/upload-blob",
            });
            res = await fetch("/api/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ blobUrl: blob.url, type: apiType, slot: type, fileName: file.name }),
              signal: controller.signal,
            });
          } else {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("type", apiType);
            // Hint de slot — servidor usa pra forcar tipoPessoa='PF' em SCR de socio
            fd.append("slot", type);
            res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
          }
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
        // Extração "silenciosa": Gemini respondeu sem erro mas não preencheu nada
        // (PDF mal parseado, scan ruim, página em branco). Trata como erro visível.
        const filledFields = (meta?.filledFields as number | undefined) ?? -1;
        const isEmptyExtraction = filledFields === 0;

        const isScanned = meta?.isScanned === true || (json.error as string || "").includes("escaneado");
        if (!resOk || !json.success || meta?.aiError || isEmptyExtraction) {
          const errMsg = isScanned
            ? "PDF escaneado (sem texto selecionável). Envie a versão digital ou converta com OCR antes de enviar."
            : isEmptyExtraction
              ? "Nenhum campo foi extraído do documento. Verifique se o PDF está legível ou tente outro arquivo."
              : (meta?.errorMessage as string || json.error as string || "");
          setSections(prev => ({
            ...prev,
            [type]: {
              ...prev[type],
              errorCount: prev[type].errorCount + 1,
              errorType: isScanned ? "scanned" : (meta?.errorType as string || (isEmptyExtraction ? "empty" : (resOk ? "unknown" : "quota"))),
              errorMessage: errMsg,
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
          if (type === 'scr_socio') {
            const scrData = json.data as SCRData;
            const novoSocio: SCRSocioData = {
              nomeSocio: scrData.nomeCliente || scrData.cpfSCR || 'Socio',
              cpfSocio: scrData.cpfSCR || '',
              tipoPessoa: 'PF',
              periodoAtual: scrData,
            };
            return { ...prev, scrSocios: [...(prev.scrSocios || []), novoSocio] };
          }
          if (type === 'scr_socio_anterior') {
            const scrData = json.data as SCRData;
            // Route anterior data to the matching socio's periodoAnterior
            const socios = [...(prev.scrSocios || [])];
            const cpf = scrData.cpfSCR || '';
            const nome = scrData.nomeCliente || '';
            const idx = socios.findIndex(s =>
              (cpf && s.cpfSocio === cpf) || (nome && s.nomeSocio === nome)
            );
            if (idx >= 0) {
              socios[idx] = { ...socios[idx], periodoAnterior: scrData };
            } else {
              // No matching socio found — create a new entry with only periodoAnterior
              socios.push({
                nomeSocio: nome || cpf || 'Socio',
                cpfSocio: cpf,
                tipoPessoa: 'PF',
                periodoAtual: {} as SCRData,
                periodoAnterior: scrData,
              });
            }
            return { ...prev, scrSocios: socios };
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
          const updated: Record<string, unknown> = {
            ...prev,
            [field]: currentData
              ? mergeData(currentData as unknown as Record<string, unknown>, json.data as Record<string, unknown>)
              : json.data,
          };
          // QSA auto-detectado no Cartão CNPJ: popula o QSA se ainda vazio
          if (type === 'cnpj' && json.qsaDetectado) {
            const qsaDetectado = json.qsaDetectado as QSAData;
            const qsaAtual = prev.qsa;
            const temQsa = qsaAtual && Array.isArray(qsaAtual.quadroSocietario) && qsaAtual.quadroSocietario.filter((s) => s.nome).length > 0;
            if (!temQsa) {
              updated.qsa = qsaDetectado;
              console.log('[upload] QSA auto-detectado no Cartão CNPJ:', qsaDetectado.quadroSocietario.length, 'sócios');
            }
          }
          return updated as unknown as typeof prev;
        });

        setSections(prev => ({
          ...prev,
          [type]: {
            ...prev[type],
            processedCount: prev[type].processedCount + 1,
            lastSuccessFile: file,
            fromCache: meta?.cached === true,
          },
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

  const handleReprocess = useCallback(async (type: DocKey) => {
    const section = sections[type];
    if (!section) return;

    let filesToReprocess: File[] = [...section.files];

    // Caso de retomada: arquivos não estão em memória — baixa do Vercel Blob
    // usando a URL salva em CollectionDocument.blob_url. Se a coleta foi
    // criada antes do blob_url existir, os URLs vêm vazios e o reprocessar
    // falha com mensagem clara em vez de silenciosamente não fazer nada.
    if (filesToReprocess.length === 0) {
      const urls = (section.resumedBlobUrls || []).filter(u => !!u);
      if (urls.length === 0) {
        toast.error("Não há arquivo original disponível para reprocessar (coleta antiga sem blob).");
        return;
      }
      setSections(prev => ({ ...prev, [type]: { ...prev[type], processing: true } }));
      try {
        filesToReprocess = await Promise.all(
          urls.map(async (url, i) => {
            const filename = section.resumedFilenames?.[i] ?? `${type}-${i + 1}.pdf`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Falha ao baixar ${filename}: HTTP ${res.status}`);
            const blob = await res.blob();
            return new File([blob], filename, { type: blob.type || "application/pdf" });
          })
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Não foi possível recuperar arquivo original: ${msg}`);
        setSections(prev => ({ ...prev, [type]: { ...prev[type], processing: false } }));
        return;
      }
    }

    if (filesToReprocess.length === 0) {
      toast.error("Nenhum arquivo para reprocessar.");
      return;
    }

    // Limpa dados antigos do tipo correspondente para evitar duplicação no merge
    setExtracted(prev => {
      const cleared = { ...prev };
      if (type === 'scrAnterior') cleared.scrAnterior = null;
      else if (type === 'scr_socio') cleared.scrSocios = [];
      else if (type === 'scr_socio_anterior') {
        cleared.scrSocios = (cleared.scrSocios || []).map(s => {
          const { periodoAnterior: _u, ...rest } = s; void _u;
          return rest as SCRSocioData;
        });
      }
      else if (type === 'ir_socio') cleared.irSocios = [];
      else if (type === 'scr') {
        cleared.scr = {} as SCRData;
        cleared.scrAnterior = null;
      }
      else {
        const fieldMap: Partial<Record<DocKey, keyof ExtractedData>> = {
          curva_abc: 'curvaABC',
          relatorio_visita: 'relatorioVisita',
        };
        const field = (fieldMap[type] ?? type) as keyof ExtractedData;
        (cleared as unknown as Record<string, unknown>)[field] = undefined;
      }
      return cleared;
    });

    // Reseta contadores e re-roda processFiles com os arquivos
    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], files: [], processedCount: 0, errorCount: 0, errorType: undefined, errorMessage: undefined, lastFailedFile: undefined, resumedFilenames: undefined, resumedBlobUrls: undefined },
    }));
    await processFiles(type, filesToReprocess);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const handleRetry = useCallback(async (type: DocKey) => {
    const section = sections[type];
    if (!section?.lastFailedFile) return;

    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], retrying: true, errorCount: 0, errorType: undefined, errorMessage: undefined },
    }));

    const apiType = type === "scrAnterior" || type === "scr_socio" || type === "scr_socio_anterior" ? "scr" : type;
    const retryFile = section.lastFailedFile;

    try {
      const json = await enqueueExtract(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        let res: Response;
        const sanitizeBlob = (name: string): string => {
          const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
          const base = name.slice(0, name.length - ext.length)
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]+/g, "_")
            .replace(/_+/g, "_").replace(/^_|_$/g, "");
          return `${Date.now()}-${base || "file"}${ext.toLowerCase()}`;
        };
        if (retryFile.size > 4 * 1024 * 1024) {
          const blob = await upload(sanitizeBlob(retryFile.name), retryFile, {
            access: "public",
            handleUploadUrl: "/api/upload-blob",
          });
          res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blobUrl: blob.url, type: apiType, slot: type, fileName: retryFile.name }),
            signal: controller.signal,
          });
        } else {
          const fd = new FormData();
          fd.append("file", retryFile);
          fd.append("type", apiType);
          fd.append("slot", type);
          res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
        }
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
        if (type === "scr_socio") {
          const scrData = json.data as SCRData;
          const novoSocio: SCRSocioData = {
            nomeSocio: scrData.nomeCliente || scrData.cpfSCR || 'Socio',
            cpfSocio: scrData.cpfSCR || '',
            tipoPessoa: 'PF',
            periodoAtual: scrData,
          };
          return { ...prev, scrSocios: [...(prev.scrSocios || []), novoSocio] };
        }
        if (type === "scr_socio_anterior") {
          const scrData = json.data as SCRData;
          const socios = [...(prev.scrSocios || [])];
          const cpf = scrData.cpfSCR || '';
          const nome = scrData.nomeCliente || '';
          const idx = socios.findIndex(s =>
            (cpf && s.cpfSocio === cpf) || (nome && s.nomeSocio === nome)
          );
          if (idx >= 0) {
            socios[idx] = { ...socios[idx], periodoAnterior: scrData };
          } else {
            socios.push({
              nomeSocio: nome || cpf || 'Socio',
              cpfSocio: cpf,
              tipoPessoa: 'PF',
              periodoAtual: {} as SCRData,
              periodoAnterior: scrData,
            });
          }
          return { ...prev, scrSocios: socios };
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

  // Força nova extração ignorando o cache — útil quando prompt foi atualizado
  // ou quando a extração cacheada está incorreta.
  const handleForceReextract = useCallback(async (type: DocKey) => {
    const section = sections[type];
    const file = section.lastSuccessFile;
    if (!file) return;

    setSections(prev => ({
      ...prev,
      [type]: { ...prev[type], processing: true, fromCache: false, errorCount: 0, errorType: undefined },
    }));

    const apiType = type === "scrAnterior" || type === "scr_socio" || type === "scr_socio_anterior" ? "scr" : type;

    try {
      const json = await enqueueExtract(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        let res: Response;
        if (file.size > 4 * 1024 * 1024) {
          const sanitize = (name: string) => {
            const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
            const base = name.slice(0, name.length - ext.length)
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
            return `${Date.now()}-${base || "file"}${ext.toLowerCase()}`;
          };
          const blob = await upload(sanitize(file.name), file, { access: "public", handleUploadUrl: "/api/upload-blob" });
          res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blobUrl: blob.url, type: apiType, slot: type, fileName: file.name, bypass_cache: true }),
            signal: controller.signal,
          });
        } else {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("type", apiType);
          fd.append("slot", type);
          fd.append("bypass_cache", "true");
          res = await fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal });
        }
        clearTimeout(timeout);
        const isSSE = res.headers.get("content-type")?.includes("text/event-stream");
        const result = isSSE ? await readExtractSSE(res) : await res.json();
        (result as Record<string, unknown>).__resOk = res.ok;
        return result;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      if (!json.__resOk || !json.success) {
        setSections(prev => ({
          ...prev,
          [type]: { ...prev[type], processing: false, errorCount: 1, errorType: "unknown", errorMessage: json.error || "Falha na reextração." },
        }));
        return;
      }

      setExtracted(prev => {
        const fieldMap: Partial<Record<DocKey, keyof ExtractedData>> = { curva_abc: "curvaABC", relatorio_visita: "relatorioVisita" };
        const field = (fieldMap[type] ?? type) as keyof ExtractedData;
        return { ...prev, [field]: json.data };
      });

      setSections(prev => ({
        ...prev,
        [type]: { ...prev[type], processing: false, fromCache: false, lastSuccessFile: file },
      }));
    } catch (e) {
      setSections(prev => ({
        ...prev,
        [type]: { ...prev[type], processing: false, errorCount: 1, errorType: "unknown", errorMessage: e instanceof Error ? e.message : "Erro" },
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        } else if (type === 'scr_socio') {
          setExtracted(e => ({ ...e, scrSocios: [] }));
        } else if (type === 'scr_socio_anterior') {
          // Remove periodoAnterior from all socios
          setExtracted(e => ({
            ...e,
            scrSocios: (e.scrSocios || []).map(s => {
              const { periodoAnterior: _unused, ...rest } = s; void _unused;
              return rest as SCRSocioData;
            }),
          }));
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
  const totalRequired = REQUIRED_KEYS.length;
  const [forcarAvancar, setForcarAvancar] = useState(false);

  const canProceed = (allRequiredDone || forcarAvancar) && !anyProcessing && !anyRetrying && bureauStatus !== "loading";

  const handleSubmit = () => {
    if (!canProceed) return;
    const files: OriginalFiles = {
      cnpj: sections.cnpj.files,
      qsa: sections.qsa.files,
      contrato: sections.contrato.files,
      faturamento: sections.faturamento.files,
      scr: sections.scr.files,
      scrAnterior: sections.scrAnterior.files,
      scr_socio: sections.scr_socio.files,
      scr_socio_anterior: sections.scr_socio_anterior.files,
      dre: sections.dre.files,
      balanco: sections.balanco.files,
      curva_abc: sections.curva_abc.files,
      ir_socio: sections.ir_socio.files,
      relatorio_visita: sections.relatorio_visita.files,
    };

    // Registra quais seções tinham arquivos extraídos para que page.tsx possa
    // restaurar o estado correto ao voltar de review (sem depender de buildCollectionDocs
    // que pula docs com extração vazia).
    const DOC_KEY_TO_TYPE: Partial<Record<DocKey, CollectionDocument["type"]>> = {
      cnpj: 'cnpj', qsa: 'qsa', contrato: 'contrato_social', faturamento: 'faturamento',
      scr: 'scr_bacen', scrAnterior: 'scr_bacen', scr_socio: 'scr_bacen', scr_socio_anterior: 'scr_bacen',
      dre: 'dre' as CollectionDocument["type"], balanco: 'balanco' as CollectionDocument["type"],
      curva_abc: 'curva_abc' as CollectionDocument["type"], ir_socio: 'ir_socio' as CollectionDocument["type"],
      relatorio_visita: 'relatorio_visita' as CollectionDocument["type"],
    };
    const now = new Date().toISOString();
    const processedDocs: CollectionDocument[] = [];
    for (const [key, section] of Object.entries(sections) as [DocKey, SectionState][]) {
      if (section.processedCount === 0) continue;
      const type = DOC_KEY_TO_TYPE[key];
      if (!type) continue;
      for (let i = 0; i < section.processedCount; i++) {
        const filename = section.resumedFilenames?.[i] ?? section.files[i]?.name ?? `${key}.pdf`;
        processedDocs.push({ type, filename, extracted_data: {}, uploaded_at: now });
      }
    }

    onComplete(extracted, files, processedDocs);
  };

  const requiredSections = SECTIONS.filter(s => s.required);
  const optionalSections = SECTIONS.filter(s => !s.required);
  const optionalDoneCount = optionalSections.filter(s => sections[s.key].processedCount > 0).length;

  return (
    <div className="animate-fade-in">

      {/* ── Info banner ── */}
      {resumedDocs && resumedDocs.length > 0 ? (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <Info size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Coleta retomada — os documentos enviados anteriormente estão listados abaixo. Adicione novos ou prossiga.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-cf-navy/5 border border-cf-navy/15 rounded-xl px-4 py-3 mb-4">
          <Info size={15} className="text-cf-navy flex-shrink-0 mt-0.5" />
          <p className="text-xs text-cf-text-2 leading-relaxed">
            Envie os 4 documentos obrigatórios. O SCR é consultado automaticamente via API. Os complementares são opcionais e enriquecem o relatório.
          </p>
        </div>
      )}

      {/* ── Sticky progress bar ── */}
      <div
        className="sticky top-16 z-20 bg-white border-b border-cf-border mb-4 rounded-b-xl"
        style={{ boxShadow: "0 2px 8px rgba(32,59,136,0.06)" }}
      >
        <div className="px-4 py-2.5 flex items-center gap-4">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <div className="flex-1 h-1.5 rounded-full bg-cf-border overflow-hidden">
              <div
                style={{ width: `${(requiredDoneCount / totalRequired) * 100}%`, transition: "width 0.5s ease-out" }}
                className={`h-full rounded-full ${requiredDoneCount === totalRequired ? "bg-cf-green" : "bg-cf-navy"}`}
              />
            </div>
            <span className="text-[11px] font-semibold text-cf-text-3 whitespace-nowrap">
              {requiredDoneCount}/{totalRequired} obrigatórios
              
            </span>
          </div>
          {bureauStatus === "loading" && (
            <div className="flex items-center gap-1.5 text-[10px] text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1 border border-blue-200 flex-shrink-0">
              <Loader2 size={10} className="animate-spin" />
              Consultando birôs...
            </div>
          )}
        </div>
      </div>

      {/* ── Banner Goalfy highlight ── */}
      {highlightedSet.size > 0 && (
        <div style={{ margin: "16px 16px 0", padding: "12px 16px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📋</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", margin: 0 }}>
              Este card tinha {highlightedSet.size} documento{highlightedSet.size !== 1 ? "s" : ""} identificado{highlightedSet.size !== 1 ? "s" : ""} no Goalfy
            </p>
            <p style={{ fontSize: 12, color: "#3b82f6", margin: 0 }}>
              Faça o upload dos arquivos com borda azul abaixo
            </p>
          </div>
        </div>
      )}

      {/* ── Document cards ── */}
      <div className="space-y-6 pb-20">

        {/* Group 1 — Obrigatórios */}
        <div>
          <OnboardingTooltip
            id="upload-docs-obrigatorios"
            message="Envie os 4 documentos obrigatórios: Cartão CNPJ, QSA, Contrato Social e Faturamento. O SCR é consultado automaticamente via API do Banco Central — sem upload."
            position="right"
            isSeen={isSeen("upload-docs-obrigatorios")}
            onSeen={() => markSeen("upload-docs-obrigatorios")}
          >
            <GroupHeader label="Documentos Obrigatórios" count={requiredDoneCount} total={totalRequired} />
          </OnboardingTooltip>
          <div className="space-y-2">
            {requiredSections.map(section => {
              const isH = highlightedSet.has(section.key);
              return (
                <div key={section.key} ref={el => { sectionRefs.current[section.key] = el; }}
                  style={isH ? { border: "2px solid #3b82f6", borderRadius: 12, position: "relative" } : undefined}>
                  {isH && <span style={{ position: "absolute", top: -9, right: 12, zIndex: 1, background: "#3b82f6", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>Identificado no Goalfy</span>}
                  <UploadArea
                    title={section.title}
                    description={section.description}
                    icon={section.icon}
                    docKey={section.key}
                    files={sections[section.key].files}
                    onAddFiles={handleAddFiles(section.key)}
                    onRemoveFile={handleRemoveFile(section.key)}
                    processing={sections[section.key].processing}
                    doneCount={sections[section.key].processedCount}
                    errorCount={sections[section.key].errorCount}
                    errorType={sections[section.key].errorType}
                    onRetry={sections[section.key].lastFailedFile ? () => handleRetry(section.key) : undefined}
                    onReprocess={() => handleReprocess(section.key)}
                    reprocessing={sections[section.key].processing && sections[section.key].processedCount === 0 && sections[section.key].files.length > 0 && sections[section.key].errorCount === 0}
                    resumedFilenames={sections[section.key].resumedFilenames}
                    fromCache={sections[section.key].fromCache}
                    onForceReextract={sections[section.key].lastSuccessFile ? () => handleForceReextract(section.key) : undefined}
                  />
                </div>
              );
            })}
            {/* SCR — coletado via API DataBox360 (não requer upload) */}
            {(() => {
              const db360 = bureauDetail["databox360"] as { empresa?: boolean; socios?: number; mock?: boolean } | undefined;
              const isLoading = bureauStatus === "loading";
              const isOk = db360 && !db360.mock && db360.empresa;
              return (
                <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  isOk ? "border-green-200 bg-green-50" : isLoading ? "border-blue-200 bg-blue-50" : "border-cf-border bg-white"
                }`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    isOk ? "bg-green-100 text-green-600" : isLoading ? "bg-blue-100 text-blue-500" : "bg-cf-border/30 text-cf-text-4"
                  }`}>
                    <BarChart3 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-cf-text-1">SCR / Bacen</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">API automática</span>
                    </div>
                    <p className="text-[11px] text-cf-text-4 mt-0.5">
                      {isOk
                        ? `Coletado via DataBox360 — empresa${(db360?.socios ?? 0) > 0 ? ` + ${db360?.socios} sócio(s)` : ""}`
                        : isLoading
                          ? "Consultando DataBox360 (SCR)..."
                          : "Será consultado automaticamente ao prosseguir"}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isOk && <span className="text-[11px] font-semibold text-green-600">✓ Coletado</span>}
                    {isLoading && <Loader2 size={14} className="animate-spin text-blue-500" />}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Group 2 — Complementares */}
        <div>
          <GroupHeader label="Documentos Complementares" count={optionalDoneCount} optional />
          <div className="space-y-2">
            {optionalSections.map(section => {
              const isH = highlightedSet.has(section.key);
              return (
                <div key={section.key} ref={el => { sectionRefs.current[section.key] = el; }}
                  style={isH ? { border: "2px solid #3b82f6", borderRadius: 12, position: "relative" } : undefined}>
                  {isH && <span style={{ position: "absolute", top: -9, right: 12, zIndex: 1, background: "#3b82f6", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>Identificado no Goalfy</span>}
                  <UploadArea
                    title={section.title}
                    description={section.description}
                    icon={section.icon}
                    docKey={section.key}
                    files={sections[section.key].files}
                    onAddFiles={handleAddFiles(section.key)}
                    onRemoveFile={handleRemoveFile(section.key)}
                    processing={sections[section.key].processing}
                    doneCount={sections[section.key].processedCount}
                    errorCount={sections[section.key].errorCount}
                    errorType={sections[section.key].errorType}
                    onRetry={sections[section.key].lastFailedFile ? () => handleRetry(section.key) : undefined}
                    onReprocess={() => handleReprocess(section.key)}
                    reprocessing={sections[section.key].processing && sections[section.key].processedCount === 0 && sections[section.key].files.length > 0 && sections[section.key].errorCount === 0}
                    resumedFilenames={sections[section.key].resumedFilenames}
                    fromCache={sections[section.key].fromCache}
                    onForceReextract={sections[section.key].lastSuccessFile ? () => handleForceReextract(section.key) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Sticky footer ── */}
      <div
        className="sticky bottom-0 z-20 bg-white border-t border-cf-border"
        style={{ boxShadow: "0 -4px 16px rgba(32,59,136,0.07)" }}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-4">

          {/* Left: dots + bureau badges */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              {Array.from({ length: totalRequired }).map((_, i) => (
                <div key={i} className={`h-1.5 w-7 rounded-full transition-all duration-300 ${
                  i < requiredDoneCount
                    ? "bg-cf-green"
                    : i === requiredDoneCount && anyProcessing
                      ? "bg-cf-navy animate-pulse"
                      : "bg-cf-border"
                }`} />
              ))}

            </div>
            {(anyProcessing || anyRetrying) && (() => {
              const pc = Object.values(sections).filter(s => s.processing || s.retrying).length;
              const tw = Object.values(sections).filter(s => s.files.length > 0).length;
              return <p className="text-[10px] text-cf-text-4">Extraindo {pc} de {tw} documento{tw !== 1 ? "s" : ""}...</p>;
            })()}
            {bureauStatus === "done" && Object.keys(bureauDetail).length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {(["credithub", "serasa", "spc", "quod", "bigdatacorp", "brasilapi", "sancoes", "databox360"] as const).map(key => {
                  const b = bureauDetail[key];
                  if (!b) return null;
                  const lbl = key === "credithub"  ? "Credit Hub"
                    : key === "bigdatacorp"         ? "BigDataCorp"
                    : key === "brasilapi"            ? "BrasilAPI"
                    : key === "sancoes"              ? "Sanções"
                    : key === "databox360"           ? "SCR (DataBox360)"
                    : key.toUpperCase();
                  return (
                    <div key={key} title={b.error} className={`flex items-center gap-1 text-[10px] rounded-md px-2 py-0.5 border ${
                      b.mock || !b.success ? "text-amber-700 bg-amber-50 border-amber-200" : "text-green-700 bg-green-50 border-green-200"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${b.mock || !b.success ? "bg-amber-400" : "bg-green-500"}`} />
                      {lbl}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: CTA */}
          <div className="flex flex-col items-end gap-1.5">
            <OnboardingTooltip
              id="upload-prosseguir"
              message="Após enviar os documentos obrigatórios, prossiga para revisar os dados extraídos. Você poderá corrigir campos antes de gerar o relatório."
              position="top"
              isSeen={isSeen("upload-prosseguir")}
              onSeen={() => markSeen("upload-prosseguir")}
            >
              <button
                onClick={handleSubmit}
                disabled={!canProceed}
                className={`btn-primary ${!canProceed ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {anyProcessing || anyRetrying ? "Extraindo..." : canProceed ? "Prosseguir para Revisão" : "Aguardando documentos"}
                <ArrowRight size={15} />
              </button>
            </OnboardingTooltip>
            {!allRequiredDone && !anyProcessing && !anyRetrying && !forcarAvancar && requiredDoneCount >= 1 && (
              <button
                onClick={() => setForcarAvancar(true)}
                className="text-[11px] text-cf-text-4 hover:text-amber-600 transition-colors"
                style={{ minHeight: "auto" }}
              >
                Prosseguir com dados incompletos
              </button>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}

```

## components/ReviewStep.tsx

```tsx
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
import { SectionProtestos } from "./review/SectionProtestos";
import { SectionProcessos } from "./review/SectionProcessos";
import { SectionGrupoEconomico } from "./review/SectionGrupoEconomico";

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
      scrSocios: false, protestos: false, processos: false, grupoEconomico: false,
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
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "80px" }}>

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
      <SectionQSA data={form.qsa} setField={setQSAField} setSocio={setQSASocio} addSocio={addQSASocio} removeSocio={removeQSASocio} expanded={open.qsa} onToggle={() => toggle("qsa")} quality={qualityMap.qsa} mergeMap={(data as { _qsaMergeMap?: Record<string, { cpfCnpj?: boolean; qualificacao?: boolean; participacao?: boolean; capitalInvestido?: boolean }> })._qsaMergeMap} />
      <SectionContrato data={form.contrato} set={setContrato} setSocio={setSocio} addSocio={addSocio} removeSocio={removeSocio} expanded={open.contrato} onToggle={() => toggle("contrato")} quality={qualityMap.contrato} />
      <SectionFaturamento data={form.faturamento} setMes={setFatMes} addMes={addFatMes} removeMes={removeFatMes} expanded={open.faturamento} onToggle={() => toggle("faturamento")} quality={qualityMap.faturamento} />
      <SectionSCR data={form.scr} anterior={form.scrAnterior ?? undefined} set={setSCR} setMod={setSCRMod} addMod={addSCRMod} removeMod={removeSCRMod} setInst={setSCRInst} addInst={addSCRInst} removeInst={removeSCRInst} showDetails={showSCRDetails} setShowDetails={setShowSCRDetails} expanded={open.scr} onToggle={() => toggle("scr")} quality={qualityMap.scr} />
      <SectionSCRSocios socios={form.scrSocios || []} expanded={open.scrSocios} onToggle={() => toggle("scrSocios")} quality={qualityMap.scr} />
      {form.dre && <SectionDRE data={form.dre} set={setDRE} setAno={setDREAno} expanded={open.dre} onToggle={() => toggle("dre")} />}
      {form.balanco && <SectionBalanco data={form.balanco} set={setBalanco} setAno={setBalancoAno} expanded={open.balanco} onToggle={() => toggle("balanco")} />}
      {form.curvaABC && <SectionCurvaABC data={form.curvaABC} setField={setCurvaABCField} setCliente={setCurvaABCCliente} addCliente={addCurvaABCCliente} removeCliente={removeCurvaABCCliente} expanded={open.curvaABC} onToggle={() => toggle("curvaABC")} />}
      {form.irSocios !== undefined && <SectionIRSocios data={form.irSocios!} set={setIRSocio} add={addIRSocio} remove={removeIRSocio} expanded={open.irSocios} onToggle={() => toggle("irSocios")} />}
      {form.relatorioVisita && <SectionRelatorioVisita data={form.relatorioVisita} set={setVisita} setLista={setVisitaLista} addLista={addVisitaLista} removeLista={removeVisitaLista} expanded={open.relatorioVisita} onToggle={() => toggle("relatorioVisita")} />}
      <SectionProtestos data={form.protestos} expanded={open.protestos} onToggle={() => toggle("protestos")} />
      <SectionProcessos data={form.processos} expanded={open.processos} onToggle={() => toggle("processos")} />
      <SectionGrupoEconomico data={form.grupoEconomico} expanded={open.grupoEconomico} onToggle={() => toggle("grupoEconomico")} />

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

```

## components/GenerateStep.tsx

```tsx
﻿"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Pencil, RotateCcw, ArrowRight } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Image from "next/image";
import { buildHTMLReport } from "@/lib/generators/html";
import { buildDOCXReport } from "@/lib/generators/docx";
import { buildExcelReport } from "@/lib/generators/excel";
import { buildPDFReport, generatePDF as generatePDFViaAPI, generateHTMLPreview } from "@/lib/generators/pdf";
import { calcScrTotal } from "@/lib/scrTotal";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { buildCollectionDocs } from "@/lib/buildCollectionDocs";
import { validateReport, type ReportValidation } from "@/lib/validateReport";
import GoalfyButton from "@/components/GoalfyButton";
import AlertList from "@/components/AlertList";
import NotasSection from "@/components/generate/NotasSection";
import VisitaSection from "@/components/generate/VisitaSection";
import ExportSection from "@/components/generate/ExportSection";
import OnboardingTooltip from "@/components/OnboardingTooltip";
import { useTooltips } from "@/lib/useTooltips";
import { ExtractedData, CollectionDocument, DocumentCollection, FundSettings, AIAnalysis, FundCriterion, FundValidationResult, CriterionStatus, CreditLimitResult } from "@/types";
import { DEFAULT_POLITICA_V2 } from "@/lib/politica-credito/defaults";
import type { ParametrosElegibilidade, ScoreResult, RespostaCriterio } from "@/types/politica-credito";
import { autoPreencherScore } from "@/lib/politica-credito/auto-score";
import type { OriginalFiles } from "@/components/UploadStep";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SectionCard, KpiCard, StatusPill, CriteriaItem, MetricBarChart, ScrTable, AlertBanner, ResultadoBox } from "@/components/report/ReportComponents";

type Format = "pdf" | "docx" | "xlsx" | "html";

interface GenerateStepProps {
  data: ExtractedData;
  originalFiles?: OriginalFiles;
  onBack: () => void;
  onReset?: () => void;
  onNotify?: (msg: string) => void;
  onFirstCollection?: () => void;
  // Lift do collectionId para o parent — evita duplicacao quando o auto-save
  // do parent ja criou uma coleta antes do GenerateStep montar.
  collectionId?: string | null;
  onCollectionIdChange?: (id: string) => void;
  onAbrirScoreForm?: () => void;
}

const MANUAIS_OBRIGATORIOS = [
  { id: 'segmento',          label: 'Segmento de atuação'   },
  { id: 'estrutura_fisica',  label: 'Estrutura física'      },
  { id: 'garantias',         label: 'Garantias'             },
  { id: 'patrimonio_socios', label: 'Patrimônio dos sócios' },
  { id: 'risco_sucessao',    label: 'Risco de sucessão'     },
];

// Module-level refs for upload context (set by component)
let _uploadCtx: { userId: string; collectionId: string } | null = null;

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  // Also save to Supabase Storage if we have a collection context
  if (_uploadCtx) {
    uploadFile(_uploadCtx.userId, _uploadCtx.collectionId, "reports", fileName, blob).catch(() => {});
  }
}

// ── Alert & Analysis types ──
type AlertSeverity = "CRÍTICO" | "RESTRITIVO" | "OBSERVAÇÃO";
interface Alert {
  message: string;
  severity: AlertSeverity;
  impacto?: string;
}

// ── Data Validation ──
interface ValidationIssue {
  field: string;
  document: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  isValid: boolean;
  canProceed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  coverage: {
    total: number;
    filled: number;
    pct: number;
  };
}

// ── Fund Parameter Validation ──────────────────────────────────────────────

function parseMoney(v: string): number {
  return parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
}

function fmtMoney(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getAgeYears(dataAbertura: string): number | null {
  if (!dataAbertura) return null;
  const parts = dataAbertura.split("/");
  let year: number;
  if (parts.length === 3) {
    year = parseInt(parts[2], 10);
  } else {
    const dash = dataAbertura.split("-");
    year = parseInt(dash[0], 10);
  }
  if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) return null;
  return new Date().getFullYear() - year;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validarContraParametros(data: ExtractedData, settings: FundSettings): FundValidationResult {
  const criteria: FundCriterion[] = [];

  // ── 1. Situação Cadastral ─────────────────────────────────────────────────
  const situacao = data.cnpj.situacaoCadastral?.toUpperCase().trim() || "";
  const situacaoOk = situacao.includes("ATIVA");
  criteria.push({
    id: "situacao",
    label: "Situação Cadastral",
    threshold: "ATIVA",
    actual: situacao || "Não informada",
    status: !situacao ? "unknown" : situacaoOk ? "ok" : "error",
    eliminatoria: true,
    detail: !situacaoOk && situacao ? `Situação: ${situacao}` : undefined,
  });

  // ── 2. FMM Mínimo ──────────────────────────────────────────────────────────
  const fmmStr = data.faturamento.fmm12m || data.faturamento.mediaAno || "";
  const fmmVal = parseMoney(fmmStr);
  const fmmOk = fmmVal >= settings.fmm_minimo;
  criteria.push({
    id: "fmm",
    label: "Faturamento Médio Mensal (FMM)",
    threshold: `≥ ${fmtMoney(settings.fmm_minimo)}/mês`,
    actual: fmmVal > 0 ? `${fmtMoney(fmmVal)}/mês` : "Não informado",
    status: fmmVal === 0 ? "unknown" : fmmOk ? "ok" : "error",
    eliminatoria: true,
    detail: !fmmOk && fmmVal > 0 ? `Déficit: ${fmtMoney(settings.fmm_minimo - fmmVal)}` : undefined,
  });

  // ── 3. Idade Mínima ────────────────────────────────────────────────────────
  const ageYears = getAgeYears(data.cnpj.dataAbertura);
  const idadeOk = ageYears !== null && ageYears >= settings.idade_minima_anos;
  criteria.push({
    id: "idade",
    label: "Idade da Empresa",
    threshold: `≥ ${settings.idade_minima_anos} ano${settings.idade_minima_anos !== 1 ? "s" : ""}`,
    actual: ageYears !== null ? `${ageYears} ano${ageYears !== 1 ? "s" : ""}` : "Não informada",
    status: ageYears === null ? "unknown" : idadeOk ? "ok" : "error",
    eliminatoria: true,
    detail: ageYears !== null && !idadeOk ? `Faltam ${settings.idade_minima_anos - ageYears} ano(s)` : undefined,
  });

  // ── 4. Alavancagem ────────────────────────────────────────────────────────
  // Usa calcScrTotal (carteira+vencidos+prejuízos) — não confia no agregado
  // da fonte. Caso CRAVINFOODS evidenciou que totalDividasAtivas vem incompleto.
  const dividaTotal = calcScrTotal(data.scr);
  const alavancagem = fmmVal > 0 && dividaTotal > 0 ? dividaTotal / fmmVal : 0;
  const alavStr = fmmVal > 0 && dividaTotal > 0 ? `${alavancagem.toFixed(2)}x FMM` : dividaTotal === 0 ? "Sem dívida" : "Sem FMM";
  const alavStatus: CriterionStatus =
    fmmVal === 0 ? "unknown" :
    dividaTotal === 0 ? "ok" :
    alavancagem <= settings.alavancagem_saudavel ? "ok" :
    alavancagem <= settings.alavancagem_maxima ? "warning" : "error";
  criteria.push({
    id: "alavancagem",
    label: "Alavancagem (Dívida / FMM)",
    threshold: `Saudável ≤ ${settings.alavancagem_saudavel}x · Máx ≤ ${settings.alavancagem_maxima}x`,
    actual: alavStr,
    status: alavStatus,
    eliminatoria: alavStatus === "error",
    detail: alavStatus === "warning" ? "Acima do saudável, dentro do limite máximo" : undefined,
  });

  // ── 5. SCR Vencidos % ─────────────────────────────────────────────────────
  const vencidosVal = parseMoney(data.scr.vencidos);
  const carteira = parseMoney(data.scr.carteiraAVencer) || dividaTotal;
  const vencidosPct = carteira > 0 && vencidosVal > 0 ? (vencidosVal / carteira) * 100 : 0;
  const vencidosStr = carteira > 0
    ? (vencidosVal === 0 ? "0%" : `${vencidosPct.toFixed(1)}% (${fmtMoney(vencidosVal)})`)
    : dividaTotal === 0 ? "Sem dívida" : "Sem carteira";
  const vencidosStatus: CriterionStatus =
    carteira === 0 && dividaTotal === 0 ? "ok" :
    carteira === 0 ? "unknown" :
    vencidosPct <= settings.scr_vencidos_max_pct ? "ok" : "error";
  criteria.push({
    id: "scr_vencidos",
    label: "SCR — Vencidos",
    threshold: `≤ ${settings.scr_vencidos_max_pct}% da carteira`,
    actual: vencidosStr,
    status: vencidosStatus,
    eliminatoria: true,
  });

  // ── 6. Prejuízos SCR ──────────────────────────────────────────────────────
  const prejVal = parseMoney(data.scr.prejuizos);
  criteria.push({
    id: "prejuizos",
    label: "SCR — Prejuízos",
    threshold: "Ausentes (R$ 0)",
    actual: prejVal > 0 ? fmtMoney(prejVal) : "R$ 0",
    status: prejVal > 0 ? "error" : "ok",
    eliminatoria: false,
  });

  // ── 7. Protestos ─────────────────────────────────────────────────────────
  const protestosN = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  const protestosOk = protestosN <= settings.protestos_max;
  criteria.push({
    id: "protestos",
    label: "Protestos Vigentes",
    threshold: `≤ ${settings.protestos_max}`,
    actual: String(protestosN),
    status: protestosOk ? "ok" : "error",
    eliminatoria: true,
    detail: !protestosOk ? `Excede o limite em ${protestosN - settings.protestos_max} protesto(s)` : undefined,
  });

  // ── 8. Processos Passivos ─────────────────────────────────────────────────
  // poloPassivoQtd = processos onde a empresa é RÉ (polo passivo)
  // passivosTotal  = total de processos (qualquer polo) — usado como fallback quando polo não foi classificado
  const passivosN = parseInt(data.processos?.poloPassivoQtd || data.processos?.passivosTotal || "0", 10) || 0;
  const passivosOk = passivosN <= settings.processos_passivos_max;
  const passivosStatus: CriterionStatus = passivosN === 0 ? "ok" : passivosOk ? "warning" : "error";
  criteria.push({
    id: "processos",
    label: "Processos Passivos",
    threshold: `≤ ${settings.processos_passivos_max}`,
    actual: String(passivosN),
    status: passivosStatus,
    eliminatoria: false,
    detail: passivosN > 0 && passivosOk ? "Dentro do limite — monitorar" : !passivosOk ? `Excede em ${passivosN - settings.processos_passivos_max}` : undefined,
  });

  // ── 9. Recuperação Judicial ───────────────────────────────────────────────
  // Fallback 1: extrator setou temRJ
  // Fallback 2: distribuicao contém tipo com "recupera" (extrator extraiu mas não setou o flag)
  // Fallback 3: razaoSocial contém "recuperacao" (nome da empresa indica RJ)
  const temRJFlag = data.processos?.temRJ === true;
  const temRJDistrib = (data.processos?.distribuicao ?? []).some(
    (d: { tipo?: string }) => (d.tipo ?? "").toLowerCase().includes("recupera")
  );
  const temRJRazao = (data.cnpj?.razaoSocial ?? "").toLowerCase().includes("recupera");
  const temRJ = temRJFlag || temRJDistrib || temRJRazao;
  const rjFonte = temRJFlag ? "campo temRJ" : temRJDistrib ? "distribuição de processos" : temRJRazao ? "razão social" : "";
  criteria.push({
    id: "rj",
    label: "Recuperação Judicial",
    threshold: "Não homologada",
    actual: temRJ ? `ATIVA — Detectada via ${rjFonte}` : "Não detectada",
    status: temRJ ? "error" : "ok",
    eliminatoria: true,
  });

  const passCount   = criteria.filter(c => c.status === "ok").length;
  const warnCount   = criteria.filter(c => c.status === "warning").length;
  const failCount   = criteria.filter(c => c.status === "error").length;
  const unknownCount = criteria.filter(c => c.status === "unknown").length;
  const hasEliminatoria = criteria.some(c => c.eliminatoria && c.status === "error");

  return { criteria, passCount, warnCount, failCount, unknownCount, hasEliminatoria };
}

// Recomputa faturamentoZerado dos meses reais (nunca confia no flag armazenado)
function calcFaturamentoZerado(fat: ExtractedData["faturamento"]): boolean {
  if (!fat.meses || fat.meses.length === 0) return false; // sem meses = falta de doc, não zero
  const parseFat = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  return fat.meses.every(m => parseFat(m.valor) === 0);
}

function validateExtractedData(data: ExtractedData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const parseFatVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const now = new Date();
  const anoAtual = now.getFullYear();

  // ═══════════════════════════════════════════════════════════════════════════
  // DADOS OBRIGATÓRIOS (erros que impedem análise)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── CNPJ ──
  if (!data.cnpj.razaoSocial) {
    errors.push({ field: "razaoSocial", document: "cnpj", message: "Razão Social não extraída", severity: "error" });
  }
  if (!data.cnpj.cnpj) {
    errors.push({ field: "cnpj", document: "cnpj", message: "CNPJ não extraído", severity: "error" });
  }
  if (!data.cnpj.dataAbertura) {
    warnings.push({ field: "dataAbertura", document: "cnpj", message: "Data de abertura não encontrada", severity: "warning" });
  }
  if (!data.cnpj.cnaePrincipal) {
    warnings.push({ field: "cnaePrincipal", document: "cnpj", message: "CNAE principal não encontrado", severity: "warning" });
  }
  const situacao = data.cnpj.situacaoCadastral?.toUpperCase().trim() || "";
  if (situacao && !situacao.includes("ATIVA")) {
    errors.push({ field: "situacaoCadastral", document: "cnpj", message: `Situação cadastral: ${situacao} — empresa não está ativa`, severity: "error" });
  }

  // ── QSA ──
  const sociosQSA = data.qsa.quadroSocietario.filter(s => s.nome);
  if (sociosQSA.length === 0) {
    errors.push({ field: "quadroSocietario", document: "qsa", message: "Nenhum sócio encontrado no QSA", severity: "error" });
  } else {
    const semDoc = sociosQSA.filter(s => !s.cpfCnpj);
    if (semDoc.length > 0) {
      warnings.push({ field: "cpfCnpj", document: "qsa", message: `${semDoc.length} sócio(s) sem CPF/CNPJ`, severity: "warning" });
    }
  }

  // ── Contrato Social ──
  if (!data.contrato.dataConstituicao) {
    warnings.push({ field: "dataConstituicao", document: "contrato", message: "Data de constituição não encontrada", severity: "warning" });
  }
  const sociosContrato = data.contrato.socios.filter(s => s.nome);
  if (sociosContrato.length === 0) {
    warnings.push({ field: "socios", document: "contrato", message: "Nenhum sócio encontrado no contrato", severity: "warning" });
  }
  if (!data.contrato.administracao) {
    warnings.push({ field: "administracao", document: "contrato", message: "Administração não identificada", severity: "warning" });
  }

  // ── Faturamento ──
  if (data.faturamento.meses.length === 0) {
    errors.push({ field: "meses", document: "faturamento", message: "Nenhum mês de faturamento extraído", severity: "error" });
  }
  const mediaNum = parseFatVal(data.faturamento.mediaAno);
  if (data.faturamento.meses.length > 0 && mediaNum === 0) {
    errors.push({ field: "mediaAno", document: "faturamento", message: "Faturamento médio é zero", severity: "error" });
  }
  if (data.faturamento.meses.length > 0 && data.faturamento.meses.length < 6) {
    warnings.push({ field: "meses", document: "faturamento", message: `Apenas ${data.faturamento.meses.length} meses — ideal ter 6+`, severity: "warning" });
  }
  if (calcFaturamentoZerado(data.faturamento)) {
    warnings.push({ field: "faturamentoZerado", document: "faturamento", message: "Faturamento zerado no período", severity: "warning" });
  }

  // ── SCR ──
  const scrVazio = !data.scr.totalDividasAtivas && !data.scr.carteiraAVencer && !data.scr.periodoReferencia;
  if (scrVazio) {
    warnings.push({ field: "periodoReferencia", document: "scr", message: "SCR sem dados extraídos — verifique o documento", severity: "warning" });
  }

  // ── Protestos ──
  const protestosQtd = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  if (protestosQtd > 0) {
    warnings.push({ field: "vigentesQtd", document: "protestos", message: `${protestosQtd} protesto(s) vigente(s) encontrado(s)`, severity: "warning" });
  }

  // ── Processos ──
  if (data.processos?.temRJ) {
    errors.push({ field: "temRJ", document: "processos", message: "Recuperação Judicial detectada", severity: "error" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE VALIDADE TEMPORAL
  // ═══════════════════════════════════════════════════════════════════════════

  // IR dos sócios — ano-base desatualizado
  if (data.irSocios && data.irSocios.length > 0) {
    for (const ir of data.irSocios) {
      const anoBase = parseInt(ir.anoBase, 10);
      if (anoBase && anoBase < anoAtual - 1) {
        warnings.push({ field: "anoBase", document: "ir_socio", message: `IR de ${ir.nomeSocio || "sócio"}: ano-base ${anoBase} — desatualizado (esperado ${anoAtual - 1} ou ${anoAtual})`, severity: "warning" });
      }
    }
  }

  // SCR — período de referência antigo (> 90 dias)
  if (data.scr.periodoReferencia) {
    const parts = data.scr.periodoReferencia.match(/(\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const scrDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, 28);
      const diffDays = Math.floor((now.getTime() - scrDate.getTime()) / 86400000);
      if (diffDays > 90) {
        warnings.push({ field: "periodoReferencia", document: "scr", message: `SCR com data de referência ${data.scr.periodoReferencia} — ${diffDays} dias atrás (> 90 dias)`, severity: "warning" });
      }
    }
  }

  // Faturamento — último mês com dados defasado (> 3 meses)
  if (data.faturamento.ultimoMesComDados) {
    const parts = data.faturamento.ultimoMesComDados.match(/(\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const fatDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, 28);
      const diffMonths = (now.getFullYear() - fatDate.getFullYear()) * 12 + (now.getMonth() - fatDate.getMonth());
      if (diffMonths > 3) {
        warnings.push({ field: "ultimoMesComDados", document: "faturamento", message: `Faturamento defasado — último mês: ${data.faturamento.ultimoMesComDados} (${diffMonths} meses atrás)`, severity: "warning" });
      }
    }
  }

  // Balanço — ano mais recente desatualizado
  if (data.balanco?.anos && data.balanco.anos.length > 0) {
    const anosBalanco = data.balanco.anos.map(a => parseInt(a.ano, 10)).filter(a => !isNaN(a));
    const maxAno = Math.max(...anosBalanco);
    if (maxAno < anoAtual - 1) {
      warnings.push({ field: "anos", document: "balanco", message: `Balanço mais recente: ${maxAno} — desatualizado (esperado ${anoAtual - 1} ou ${anoAtual})`, severity: "warning" });
    }
  }

  // DRE — ano mais recente desatualizado
  if (data.dre?.anos && data.dre.anos.length > 0) {
    const anosDRE = data.dre.anos.map(a => parseInt(a.ano, 10)).filter(a => !isNaN(a));
    const maxAno = Math.max(...anosDRE);
    if (maxAno < anoAtual - 1) {
      warnings.push({ field: "anos", document: "dre", message: `DRE mais recente: ${maxAno} — desatualizado (esperado ${anoAtual - 1} ou ${anoAtual})`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE IR DOS SÓCIOS (risco pessoal)
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.irSocios && data.irSocios.length > 0) {
    for (const ir of data.irSocios) {
      const nome = ir.nomeSocio || "Sócio";
      if (ir.situacaoMalhas) {
        errors.push({ field: "situacaoMalhas", document: "ir_socio", message: `${nome}: retido em MALHA FINA na Receita Federal`, severity: "error" });
      }
      if (ir.debitosEmAberto) {
        warnings.push({ field: "debitosEmAberto", document: "ir_socio", message: `${nome}: possui débitos em aberto na Receita Federal${ir.descricaoDebitos ? ` (${ir.descricaoDebitos})` : ""}`, severity: "warning" });
      }
      const pl = parseFatVal(ir.patrimonioLiquido);
      if (ir.patrimonioLiquido && pl < 0) {
        warnings.push({ field: "patrimonioLiquido", document: "ir_socio", message: `${nome}: patrimônio líquido negativo (${ir.patrimonioLiquido})`, severity: "warning" });
      }
    }
  }

  // Sócios do QSA sem IR enviado
  if (sociosQSA.length > 0 && (!data.irSocios || data.irSocios.length === 0)) {
    warnings.push({ field: "irSocios", document: "ir_socio", message: "Nenhum IR de sócio enviado — impossível avaliar capacidade patrimonial", severity: "warning" });
  } else if (data.irSocios && sociosQSA.length > data.irSocios.length) {
    warnings.push({ field: "irSocios", document: "ir_socio", message: `IR enviado para ${data.irSocios.length} de ${sociosQSA.length} sócios — faltam ${sociosQSA.length - data.irSocios.length}`, severity: "warning" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS FINANCEIROS (saúde da empresa)
  // ═══════════════════════════════════════════════════════════════════════════

  // Faturamento em queda
  if (data.faturamento.tendencia === "queda") {
    warnings.push({ field: "tendencia", document: "faturamento", message: "Faturamento em tendência de queda", severity: "warning" });
  }

  // Meses zerados intercalados
  if (data.faturamento.meses.length >= 3) {
    const vals = data.faturamento.meses.map(m => parseFatVal(m.valor));
    const temZeroIntercalado = vals.some((v, i) => v === 0 && i > 0 && i < vals.length - 1 && vals[i - 1] > 0 && vals[i + 1] > 0);
    if (temZeroIntercalado) {
      warnings.push({ field: "mesesZerados", document: "faturamento", message: "Faturamento com meses zerados intercalados — possível irregularidade ou sazonalidade extrema", severity: "warning" });
    }
  }

  // Variação brusca entre meses (> 80%)
  if (data.faturamento.meses.length >= 2) {
    const vals = data.faturamento.meses.map(m => parseFatVal(m.valor)).filter(v => v > 0);
    for (let i = 1; i < vals.length; i++) {
      const variacao = Math.abs(vals[i] - vals[i - 1]) / vals[i - 1];
      if (variacao > 0.8) {
        warnings.push({ field: "variacaoBrusca", document: "faturamento", message: `Variação brusca de ${Math.round(variacao * 100)}% entre meses consecutivos no faturamento`, severity: "warning" });
        break; // só alerta uma vez
      }
    }
  }

  // Balanço — patrimônio líquido negativo
  if (data.balanco?.anos && data.balanco.anos.length > 0) {
    const maisRecente = data.balanco.anos[data.balanco.anos.length - 1];
    const plEmpresa = parseFatVal(maisRecente.patrimonioLiquido);
    if (maisRecente.patrimonioLiquido && plEmpresa < 0) {
      errors.push({ field: "patrimonioLiquido", document: "balanco", message: `Patrimônio líquido negativo no balanço (${maisRecente.ano}): ${maisRecente.patrimonioLiquido}`, severity: "error" });
    }
    // Liquidez corrente < 1
    const lc = parseFloat(maisRecente.liquidezCorrente?.replace(",", ".") || "0");
    if (lc > 0 && lc < 1) {
      warnings.push({ field: "liquidezCorrente", document: "balanco", message: `Liquidez corrente ${maisRecente.liquidezCorrente} (< 1.0) — passivo circulante supera ativo circulante`, severity: "warning" });
    }
  }

  // DRE — prejuízo no exercício mais recente
  if (data.dre?.anos && data.dre.anos.length > 0) {
    const maisRecente = data.dre.anos[data.dre.anos.length - 1];
    const lucro = parseFatVal(maisRecente.lucroLiquido);
    if (maisRecente.lucroLiquido && lucro < 0) {
      warnings.push({ field: "lucroLiquido", document: "dre", message: `Prejuízo líquido no exercício ${maisRecente.ano}: ${maisRecente.lucroLiquido}`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE CONCENTRAÇÃO (risco de carteira)
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.curvaABC) {
    const pctTop1 = parseFloat(data.curvaABC.maiorClientePct?.replace(",", ".").replace("%", "") || "0");
    if (pctTop1 > 30) {
      warnings.push({ field: "concentracaoTop1", document: "curva_abc", message: `Maior cliente concentra ${data.curvaABC.maiorClientePct} da receita (${data.curvaABC.maiorCliente || "N/I"}) — risco de dependência`, severity: "warning" });
    }
    const pctTop3 = parseFloat(data.curvaABC.concentracaoTop3?.replace(",", ".").replace("%", "") || "0");
    if (pctTop3 > 60) {
      warnings.push({ field: "concentracaoTop3", document: "curva_abc", message: `Top 3 clientes concentram ${data.curvaABC.concentracaoTop3} da receita — alta dependência`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE CRÉDITO (SCR / Endividamento)
  // ═══════════════════════════════════════════════════════════════════════════

  if (!scrVazio) {
    const emAtraso = parseFatVal(data.scr.operacoesEmAtraso);
    if (emAtraso > 0) {
      warnings.push({ field: "operacoesEmAtraso", document: "scr", message: `Operações em atraso no SCR: R$ ${data.scr.operacoesEmAtraso}`, severity: "warning" });
    }
    const vencidas = parseFatVal(data.scr.operacoesVencidas || data.scr.vencidos);
    if (vencidas > 0) {
      warnings.push({ field: "vencidos", document: "scr", message: `Operações vencidas no SCR: R$ ${data.scr.vencidos || data.scr.operacoesVencidas}`, severity: "warning" });
    }
    const prejuizos = parseFatVal(data.scr.prejuizos);
    if (prejuizos > 0) {
      errors.push({ field: "prejuizos", document: "scr", message: `Prejuízos registrados no SCR: R$ ${data.scr.prejuizos}`, severity: "error" });
    }
    const qtdeInst = parseInt(data.scr.qtdeInstituicoes || "0", 10);
    if (qtdeInst > 5) {
      warnings.push({ field: "qtdeInstituicoes", document: "scr", message: `${qtdeInst} instituições financeiras — possível busca excessiva por crédito`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS SOCIETÁRIOS (risco estrutural)
  // ═══════════════════════════════════════════════════════════════════════════

  // Sócio com participação > 95%
  if (sociosQSA.length > 0) {
    for (const s of sociosQSA) {
      const pctNum = parseFloat(s.participacao?.replace(",", ".").replace("%", "") || "0");
      if (pctNum > 95) {
        warnings.push({ field: "participacao", document: "qsa", message: `${s.nome}: participação de ${s.participacao} — empresa unipessoal de fato`, severity: "warning" });
        break;
      }
    }
  }

  // Capital social muito baixo vs faturamento
  const capitalStr = data.contrato.capitalSocial || data.cnpj.capitalSocialCNPJ || "";
  const capitalVal = parseFatVal(capitalStr);
  const fmmAnual = mediaNum * 12;
  if (capitalVal > 0 && fmmAnual > 0 && capitalVal < fmmAnual * 0.01) {
    warnings.push({ field: "capitalSocial", document: "contrato", message: `Capital social (${capitalStr}) inferior a 1% do faturamento anual — possível subcapitalização`, severity: "warning" });
  }

  // Divergência de sócios QSA vs Contrato
  if (sociosQSA.length > 0 && sociosContrato.length > 0) {
    const nomesQSA = new Set(sociosQSA.map(s => s.nome.toUpperCase().trim()));
    const nomesContrato = new Set(sociosContrato.map(s => s.nome.toUpperCase().trim()));
    const apenasQSA = sociosQSA.filter(s => !nomesContrato.has(s.nome.toUpperCase().trim()));
    const apenasContrato = sociosContrato.filter(s => !nomesQSA.has(s.nome.toUpperCase().trim()));
    if (apenasQSA.length > 0 || apenasContrato.length > 0) {
      warnings.push({ field: "divergenciaSocios", document: "qsa", message: `Divergência no quadro societário: ${apenasQSA.length} sócio(s) só no QSA, ${apenasContrato.length} só no Contrato — verificar alteração contratual`, severity: "warning" });
    }
  }

  // Óbito de sócio (BigDataCorp KYC)
  if ((data as any).sociosFalecidos?.length) {
    const nomes = ((data as any).sociosFalecidos as string[]).join(", ");
    warnings.push({ field: "socioFalecido", document: "qsa", message: `Sócio(s) com indicação de óbito: ${nomes} — verificar sucessão e situação jurídica`, severity: "error" });
  }

  // CPF irregular de sócio (BigDataCorp KYC)
  const sociosIrregulares = (data.qsa?.quadroSocietario ?? []).filter(s => (s as any).taxIdStatus && (s as any).taxIdStatus !== "REGULAR");
  if (sociosIrregulares.length > 0) {
    const lista = sociosIrregulares.map(s => `${s.nome} (${String((s as any).taxIdStatus).replace(/_/g, " ")})`).join(", ");
    warnings.push({ field: "cpfIrregular", document: "qsa", message: `CPF com situação irregular: ${lista}`, severity: "warning" });
  }

  // Grupo econômico com empresa em situação irregular
  if (data.grupoEconomico?.empresas && data.grupoEconomico.empresas.length > 0) {
    const irregulares = data.grupoEconomico.empresas.filter(e => e.situacao && !e.situacao.toUpperCase().includes("ATIVA"));
    if (irregulares.length > 0) {
      warnings.push({ field: "grupoIrregular", document: "grupo_economico", message: `${irregulares.length} empresa(s) do grupo econômico com situação irregular: ${irregulares.map(e => e.razaoSocial).join(", ")}`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE PROCESSOS (risco jurídico)
  // ═══════════════════════════════════════════════════════════════════════════

  if (data.processos) {
    // Processos bancários ativos
    const bancarios = data.processos.bancarios?.filter(p => p.status?.toUpperCase().includes("ANDAMENTO")) || [];
    if (bancarios.length > 0) {
      warnings.push({ field: "processosBancarios", document: "processos", message: `${bancarios.length} processo(s) bancário(s) em andamento — indica inadimplência com instituições financeiras`, severity: "warning" });
    }

    // Valor total de processos vs faturamento
    const valorEstimado = parseFatVal(data.processos.valorTotalEstimado);
    if (valorEstimado > 0 && fmmAnual > 0 && valorEstimado > fmmAnual * 0.5) {
      const pct = Math.round((valorEstimado / fmmAnual) * 100);
      warnings.push({ field: "valorTotalEstimado", document: "processos", message: `Valor estimado de processos (R$ ${data.processos.valorTotalEstimado}) representa ${pct}% do faturamento anual — risco jurídico elevado`, severity: "warning" });
    }

    // Muitos processos passivos (polo passivo = empresa é ré)
    const passivos = parseInt(data.processos.poloPassivoQtd || data.processos.passivosTotal || "0", 10) || 0;
    if (passivos > 10) {
      warnings.push({ field: "passivosTotal", document: "processos", message: `${passivos} processos no polo passivo — volume elevado`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTAS DE PROTESTOS (valor vs faturamento)
  // ═══════════════════════════════════════════════════════════════════════════

  if (protestosQtd > 0 && mediaNum > 0) {
    const protestosValor = parseFatVal(data.protestos?.vigentesValor || "0");
    if (protestosValor > 0 && protestosValor > mediaNum * 0.1) {
      const pct = Math.round((protestosValor / mediaNum) * 100);
      warnings.push({ field: "protestosValor", document: "protestos", message: `Valor de protestos (R$ ${data.protestos?.vigentesValor}) = ${pct}% do faturamento mensal`, severity: "warning" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTA DE VISITA
  // ═══════════════════════════════════════════════════════════════════════════

  if (!data.relatorioVisita || (!data.relatorioVisita.dataVisita && !data.relatorioVisita.descricaoEstrutura)) {
    warnings.push({ field: "relatorioVisita", document: "relatorio_visita", message: "Relatório de visita não enviado — recomendado para operações acima de R$ 100 mil", severity: "warning" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COBERTURA DE DADOS
  // ═══════════════════════════════════════════════════════════════════════════

  let total = 0;
  let filled = 0;
  function countFields(obj: unknown) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const v of Object.values(obj as Record<string, unknown>)) {
        countFields(v);
      }
    } else if (typeof obj === "string") {
      total++;
      if (obj !== "") filled++;
    }
  }
  countFields(data.cnpj);
  countFields(data.qsa);
  countFields(data.contrato);
  countFields(data.faturamento);
  countFields(data.scr);

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return {
    isValid: errors.length === 0,
    canProceed: errors.length === 0 && pct >= 40,
    errors,
    warnings,
    coverage: { total, filled, pct },
  };
}

export default function GenerateStep({ data: initialData, originalFiles, onBack, onReset, collectionId: collectionIdProp, onCollectionIdChange, onAbrirScoreForm, ...rest }: GenerateStepProps) {
  void rest; // onNotify e onFirstCollection substituídos pela página /parecer
  const [data, setData] = useState<ExtractedData>(() => JSON.parse(JSON.stringify(initialData)));
  const { isSeen, markSeen } = useTooltips();

  const [editing, setEditing] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState<Format | null>(null);
  const [generatedFormats, setGeneratedFormats] = useState<Set<Format>>(new Set());
  const [sharingReport, setSharingReport] = useState(false);
  const [sharedUrl, setSharedUrl] = useState<string | undefined>(undefined);

  const setCNPJ = (k: keyof typeof data.cnpj, v: string) => setData(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));
  const setContrato = (k: keyof typeof data.contrato, v: string | boolean) => setData(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSCR = (k: keyof typeof data.scr, v: string) => setData(p => ({ ...p, scr: { ...p.scr, [k]: v } }));
  const setResumoRisco = (v: string) => setData(p => ({ ...p, resumoRisco: v }));

  // ── Data Validation (mantido para uso interno, card removido da UI) ──
  void validateExtractedData(data);

  // ── Collection ID — fonte unica de verdade no parent ──
  // Usa a prop quando presente; cai num state local apenas quando o
  // GenerateStep cria a coleta antes do parent ter um id (caso legacy).
  const [collectionIdLocal, setCollectionIdLocal] = useState<string | null>(collectionIdProp ?? null);
  useEffect(() => { if (collectionIdProp) setCollectionIdLocal(collectionIdProp); }, [collectionIdProp]);
  const collectionId = collectionIdLocal;
  const setCollectionId = useCallback((id: string | null) => {
    setCollectionIdLocal(id);
    if (id) onCollectionIdChange?.(id);
  }, [onCollectionIdChange]);

  // ── Observações do analista ──
  const NOTES_KEY = "cf_analyst_notes_draft";
  const [analystNotes, setAnalystNotes] = useState<string>(() => {
    try { return localStorage.getItem(NOTES_KEY) || ""; } catch { return ""; }
  });
  const [savingNotes, setSavingNotes] = useState(false);

  // ── Integrantes do Comitê ──
  const COMMITTEE_KEY = "cf_committee_members";
  const [committeMembers, setCommitteMembers] = useState<string>(() => {
    try { return localStorage.getItem(COMMITTEE_KEY) || "Luiz Carlos, Débora Santos, Gleyson Azevedo"; } catch { return "Luiz Carlos, Débora Santos, Gleyson Azevedo"; }
  });
  useEffect(() => {
    try { localStorage.setItem(COMMITTEE_KEY, committeMembers); } catch { /* ignore */ }
  }, [committeMembers]);

  // Persiste no localStorage a cada mudança
  useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, analystNotes); } catch { /* ignore */ }
  }, [analystNotes]);

  // ── Fund Settings (carregados da Política de Crédito V2 + fund_settings) ──
  const [elegibilidade, setElegibilidade] = useState<ParametrosElegibilidade>(DEFAULT_POLITICA_V2.parametros_elegibilidade);
  const [fundSettings, setFundSettings] = useState<Partial<FundSettings>>({});
  const [scoreV2, setScoreV2] = useState<ScoreResult | null>(null);
  useEffect(() => {
    const loadPolicy = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [politicaRes, fundRes] = await Promise.all([
          supabase
            .from("politica_credito_config")
            .select("parametros_elegibilidade")
            .eq("user_id", user.id)
            .order("atualizado_em", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("fund_settings")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
        if (politicaRes.data?.parametros_elegibilidade) {
          setElegibilidade({ ...DEFAULT_POLITICA_V2.parametros_elegibilidade, ...politicaRes.data.parametros_elegibilidade });
        }
        if (fundRes.data) {
          setFundSettings(fundRes.data as Partial<FundSettings>);
        }
      } catch { /* use defaults */ }
    };
    loadPolicy();
  }, []);

  // Auto-score calculado a partir dos dados extraídos — usado como fallback quando scoreV2 manual está vazio
  const autoScoreResultado = useMemo(() => autoPreencherScore(data), [data]);

  const pendentesScore = MANUAIS_OBRIGATORIOS.filter(c =>
    autoScoreResultado.criterios_manuais.includes(c.id)
  );

  // ── Score V2 (carregado de score_operacoes) ──
  const [scoreV2Respostas, setScoreV2Respostas] = useState<RespostaCriterio[]>([]);
  useEffect(() => {
    if (!collectionId) return;
    const loadScore = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("score_operacoes")
          .select("score_result, respostas")
          .eq("collection_id", collectionId)
          .order("preenchido_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.score_result) setScoreV2(data.score_result as ScoreResult);
        if (data?.respostas) setScoreV2Respostas(data.respostas as RespostaCriterio[]);
      } catch { /* ignore */ }
    };
    loadScore();
  }, [collectionId]);

  const activeValidationSettings: FundSettings = {
    fmm_minimo: elegibilidade.fmm_minimo,
    idade_minima_anos: elegibilidade.tempo_constituicao_minimo_anos,
    alavancagem_saudavel: elegibilidade.alavancagem_saudavel,
    alavancagem_maxima: elegibilidade.alavancagem_maxima,
    prazo_maximo_aprovado: elegibilidade.prazo_maximo_aprovado,
    prazo_maximo_condicional: elegibilidade.prazo_maximo_condicional,
    concentracao_max_sacado: elegibilidade.concentracao_max_sacado,
    fator_limite_base: elegibilidade.fator_limite_base,
    revisao_aprovado_dias: elegibilidade.revisao_aprovado_dias,
    revisao_condicional_dias: elegibilidade.revisao_condicional_dias,
    protestos_max: elegibilidade.protestos_max,
    processos_passivos_max: elegibilidade.processos_passivos_max,
    scr_vencidos_max_pct: elegibilidade.scr_vencidos_max_pct,
    // fund_settings tem prioridade sobre elegibilidade para campos operacionais
    ...fundSettings,
  };
  const selectedPresetName = "Política de Crédito V2";
  const selectedPresetColor = "#203b88";

  const router = useRouter();

  // ── AI Analysis with cache ──
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [analysisFromCache, setAnalysisFromCache] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");
  const analysisFetched = useRef(false);

  const normalizeParecer = (parecer: unknown): Record<string, unknown> => {
    if (typeof parecer === "string") {
      return { resumoExecutivo: parecer };
    }
    if (typeof parecer === "object" && parecer !== null) {
      return parecer as Record<string, unknown>;
    }
    return { resumoExecutivo: "" };
  };

  const applyAnalysis = (analysis: AIAnalysis) => {
    const normalizedParecer = normalizeParecer(analysis.parecer);
    const normalizedAnalysis = { ...analysis, parecer: normalizedParecer };
    setAiAnalysis(normalizedAnalysis as AIAnalysis);
    const resumo = String(normalizedParecer.textoCompleto || normalizedParecer.resumoExecutivo || "");
    if (resumo) setResumoRisco(resumo);
  };

  const loadCachedAnalysis = async (colId: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { data: row, error } = await supabase
        .from("document_collections")
        .select("ai_analysis, rating, decisao")
        .eq("id", colId)
        .single();
      if (error || !row?.ai_analysis) return false;
      const cached = row.ai_analysis as Record<string, unknown>;
      // Aceita cache se tiver rating OU decisao — antes exigia tambem parametrosOperacionais
      // e alertas[0].mitigacao, o que fazia o cache ser REJEITADO com frequencia e forcava
      // nova chamada ao Gemini (com tempo 0.3, gerando rating diferente a cada retomada).
      // Agora qualquer cache minimamente utilizavel e aceito; campos ausentes recebem
      // defaults ou ficam undefined para o render decidir.
      if (cached.rating == null && !cached.decisao) return false;
      // IMPORTANTE: NÃO auto-copiamos mais `row.rating` → `parecerAnalista.ratingAnalista`.
      // O /parecer agora escreve os dois simultaneamente, então a coluna e o parecerAnalista
      // ficam sincronizados naturalmente. A auto-cópia antiga causava bug: a coluna era
      // atualizada automaticamente pela IA (e pelo trigger), e isso vazava para o
      // parecerAnalista.ratingAnalista como se fosse override manual do comitê,
      // "travando" o display no valor antigo quando a IA re-rodava com rating diferente.
      // Se parecerAnalista.ratingAnalista está vazio, a UI cai no aiAnalysis.rating — correto.
      const parecerNorm = normalizeParecer(cached.parecer);
      applyAnalysis({ ...cached, parecer: parecerNorm } as unknown as AIAnalysis);
      setAnalysisFromCache(true);
      return true;
    } catch {
      return false;
    }
  };

  const saveAnalysisCache = async (colId: string, analysis: AIAnalysis) => {
    try {
      const supabase = createClient();
      const analysisData = analysis as unknown as Record<string, unknown>;

      // Busca o estado atual para decidir se preserva rating/decisao do analista.
      // Se o analista ja definiu um rating manual em parecer/page, preserva SÓ quando
      // é um override REAL (diferente da ai_analysis.rating anterior).
      const { data: existing } = await supabase
        .from("document_collections")
        .select("ai_analysis, rating, decisao, status")
        .eq("id", colId)
        .maybeSingle();
      const existingAi = (existing?.ai_analysis as Record<string, unknown>) || {};
      const parecerAnalista = existingAi.parecerAnalista as { ratingAnalista?: number | null; decisaoComite?: string | null } | undefined;
      const rawAnalistaRating = parecerAnalista?.ratingAnalista;
      const analistaDecisao = parecerAnalista?.decisaoComite;
      const finished = existing?.status === "finished";

      // Detecta se o ratingAnalista é um override REAL do comitê ou só um resíduo
      // de auto-cópia antiga (bug anterior): se ele bate exatamente com o
      // ai_analysis.rating anterior, provavelmente foi auto-copiado — ignorar.
      const prevAiRating = existingAi.rating != null ? Number(existingAi.rating) : null;
      const analistaRatingNum = rawAnalistaRating != null && String(rawAnalistaRating) !== "" ? Number(rawAnalistaRating) : null;
      const isLegitimateOverride =
        analistaRatingNum != null &&
        !isNaN(analistaRatingNum) &&
        (prevAiRating == null || Math.abs(analistaRatingNum - prevAiRating) > 0.01);
      const analistaRating = isLegitimateOverride ? analistaRatingNum : null;

      // Merge do ai_analysis: preserva parecerAnalista SÓ se for override legítimo.
      // Caso contrário, remove o parecerAnalista.ratingAnalista para evitar
      // que o display pegue um valor fantasma.
      const mergedAi: Record<string, unknown> = { ...existingAi, ...analysisData };
      if (parecerAnalista) {
        if (isLegitimateOverride) {
          mergedAi.parecerAnalista = parecerAnalista;
        } else {
          // Remove o ratingAnalista fantasma mas preserva outros campos do parecerAnalista
          const cleanParecer = { ...parecerAnalista, ratingAnalista: null };
          mergedAi.parecerAnalista = cleanParecer;
          if (rawAnalistaRating != null) {
            console.log(`[saveAnalysisCache] ratingAnalista fantasma removido: ${rawAnalistaRating} (coincidia com ai_analysis.rating anterior)`);
          }
        }
      }

      // rating da coluna: se analista tem override legítimo, mantem; senão usa IA
      const ratingParaGravar = analistaRating != null ? analistaRating : (analysis.rating ?? null);
      // decisao: se analista setou decisaoComite, mantem a decisao atual (que ja reflete ele)
      const decisaoParaGravar = analistaDecisao
        ? (existing?.decisao as DocumentCollection["decisao"] ?? null)
        : ((analysis.decisao as DocumentCollection["decisao"]) ?? null);

      if (finished) {
        // Coleta finalizada: nao mexe em rating/decisao, so merge do JSONB
        await supabase
          .from("document_collections")
          .update({ ai_analysis: mergedAi })
          .eq("id", colId);
      } else {
        await supabase
          .from("document_collections")
          .update({
            ai_analysis: mergedAi,
            rating: ratingParaGravar,
            decisao: decisaoParaGravar,
          })
          .eq("id", colId);
      }
    } catch (err) {
      console.warn("[generate] Failed to cache analysis:", err);
    }
  };

  const handleReanalyze = async () => {
    analysisFetched.current = false;
    setAiAnalysis(null);
    setAnalysisFromCache(false);
    setAnalysisError(null);
    setAnalysisStatus("");
    if (collectionId) {
      try {
        const supabase = createClient();
        await supabase.from("document_collections").update({ ai_analysis: null }).eq("id", collectionId);
      } catch { /* ignore */ }
    }
    runAnalysisRef.current?.();
  };

  const runAnalysisRef = useRef<(() => void) | null>(null);

  // Feature 1 — Solicitar permissão de notificação no mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (analysisFetched.current) return;
    analysisFetched.current = true;

    const runAnalysis = async () => {
      // 1. Try cache first
      if (collectionId) {
        const hasCached = await loadCachedAnalysis(collectionId);
        if (hasCached) return;
      }

      // 2. Call AI analysis API (bureaus já foram consultados no UploadStep)
      setAnalyzingAI(true);
      setAnalysisError(null);
      setAnalysisStatus("Iniciando análise...");
      try {
        const supabase = createClient();
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, settings: activeValidationSettings, user_id: currentUser?.id, collection_id: collectionId ?? null, scoreV2: scoreV2 ?? autoScoreResultado.score, scoreV2Respostas: scoreV2Respostas.length ? scoreV2Respostas : autoScoreResultado.respostas }),
        });
        if (!res.ok) {
          throw new Error(res.status === 504 ? "Timeout (504) — tente novamente." : `Erro HTTP ${res.status}`);
        }

        // ── Lê SSE stream ou JSON ──
        let analysisJson: { success: boolean; analysis?: AIAnalysis; error?: string } | null = null;
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
              if (!part.trim()) continue;
              const lines = part.trim().split("\n");
              let ev = "message"; let rawData = "";
              for (const line of lines) {
                if (line.startsWith("event: ")) ev = line.slice(7).trim();
                if (line.startsWith("data: ")) rawData = line.slice(6).trim();
              }
              if (!rawData) continue;
              try {
                const payload = JSON.parse(rawData);
                if (ev === "status") setAnalysisStatus(payload.message || "");
                if (ev === "result") { analysisJson = payload; break outer; }
                if (ev === "error") throw new Error(payload.error || "Erro na análise");
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
            }
          }
        } else {
          analysisJson = await res.json().catch(() => ({ success: false, error: `Erro HTTP ${res.status}` }));
        }

        if (analysisJson?.success && analysisJson?.analysis) {
          // 3. Garantir coleta no Supabase antes de salvar o cache.
          // Usa _uploadCtx.collectionId como fonte de verdade (set sincronamente pelo handleSave/auto-save),
          // evitando race condition de criação duplicada com o auto-save useEffect.
          let idParaSalvar = collectionId || _uploadCtx?.collectionId || null;

          if (!idParaSalvar) {
            // Espera breve para o auto-save terminar (normalmente já completou)
            await new Promise(r => setTimeout(r, 500));
            idParaSalvar = _uploadCtx?.collectionId || null;
          }

          if (!idParaSalvar) {
            // Auto-save não criou — cria a coleta aqui como fallback
            try {
              const supabase = createClient();
              const { data: userData, error: userError } = await supabase.auth.getUser();
              if (userError) console.warn("[generate] getUser error:", userError.message);

              if (userData?.user?.id) {
                const documents = buildDocuments();
                const { data: row, error: insertError } = await supabase
                  .from("document_collections")
                  .insert({
                    user_id: userData.user.id,
                    status: "in_progress",
                    documents,
                    label: data.cnpj.razaoSocial || null,
                    company_name: data.cnpj?.razaoSocial || null,
                    cnpj: data.cnpj?.cnpj || null,
                  })
                  .select("id")
                  .single();

                if (insertError) {
                  console.error("[generate] Failed to insert collection:", insertError.message, insertError.details, insertError.hint);
                } else if (row?.id) {
                  setCollectionId(row.id);
                  _uploadCtx = { userId: userData.user.id, collectionId: row.id };
                  idParaSalvar = row.id;
                }
              } else {
                console.warn("[generate] No authenticated user found — cache will not be saved");
              }
            } catch (err) {
              console.warn("[generate] Failed to auto-create collection:", err);
            }
          }

          console.log("[generate] parecer raw:", JSON.stringify(analysisJson.analysis!.parecer));
          applyAnalysis(analysisJson.analysis!);

          if (idParaSalvar) {
            await saveAnalysisCache(idParaSalvar, { ...analysisJson.analysis!, parecer: normalizeParecer(analysisJson.analysis!.parecer) } as AIAnalysis);
          } else {
            console.warn("[generate] idParaSalvar is null — ai_analysis not saved to Supabase");
          }

          // Feature 1 — Notificação de conclusão da análise
          {
            const empresa = data.cnpj?.razaoSocial || data.cnpj?.nomeFantasia || "Empresa";
            const r = analysisJson.analysis!.rating;
            const dec = analysisJson.analysis!.decisao;
            const body = r != null ? `Rating ${r.toFixed(1)}/10 · ${dec || "Análise concluída"}` : "Análise concluída";
            toast.success("Análise IA concluída", { description: `${empresa} · ${body}`, duration: 7000 });
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try { new Notification(`✅ ${empresa}`, { body, icon: "/icon.svg" }); } catch { /* unsupported */ }
            }
          }

          // Auto-send to Goalfy (fire-and-forget)
          try {
            fetch("/api/goalfy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data, aiAnalysis: analysisJson.analysis, settings: activeValidationSettings }),
            }).then(r => r.json()).then(gj => {
              if (gj.mock) {
                console.log("[generate] Goalfy: webhook não configurado (mock)");
              } else if (gj.success) {
                console.log("[generate] Goalfy: dados enviados com sucesso");
              } else {
                console.warn("[generate] Goalfy: falha no envio:", gj.error);
              }
            }).catch(e => console.warn("[generate] Goalfy fetch error:", e));
          } catch {
            // non-blocking
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate] AI analysis failed:", msg);
        setAnalysisError(msg);
      } finally {
        setAnalyzingAI(false);
        setAnalysisStatus("");
      }
    };

    runAnalysisRef.current = runAnalysis;
    runAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── Supabase: Salvar / Finalizar coleta ──
  const [, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Helper: campos desnormalizados para a tabela
  // IMPORTANTE: só inclui rating/decisao quando aiAnalysis está disponível,
  // para não sobrescrever valores existentes no banco durante o auto-save inicial.
  // BUG FIX CRITICO: getCollectionMeta nao deve mais retornar rating/decisao.
  // A ownership dos campos rating e decisao fica com:
  //   - saveAnalysisCache (rating inicial da IA, apenas se analista ainda nao setou)
  //   - parecer/page.tsx doSave (override manual do analista, prioridade total)
  //   - parecer/page.tsx handleFinish (decisao final ao finalizar coleta)
  // Antes, handleSave rodando em auto-save reescrevia rating com aiAnalysis.rating
  // (valor em memoria, frequentemente stale) e sobrescrevia o rating do analista.
  const getCollectionMeta = () => {
    const mediaStr = data.faturamento.mediaAno || "0";
    const fmm = parseFloat(mediaStr.replace(/\./g, "").replace(",", ".")) || null;
    return {
      company_name: data.cnpj.razaoSocial || null,
      cnpj: data.cnpj.cnpj || null,
      fmm_12m: fmm,
    };
  };

  const buildDocuments = (): CollectionDocument[] => buildCollectionDocs(data);

  const handleSave = async (): Promise<string | null> => {
    setSaving(true);
    try {
      const supabase = createClient();
      const documents = buildDocuments();

      if (collectionId) {
        // Ensure upload context is set for report saves
        if (!_uploadCtx) {
          const { data: session } = await supabase.auth.getUser();
          _uploadCtx = { userId: session.user?.id ?? "anonymous", collectionId };
        }
        // Proteção crítica: se buildDocuments() retornar vazio enquanto a coleta
        // no banco já tem documents preenchidos, NÃO sobrescreve. Isso evita o
        // bug onde o auto-save dispara antes de `data` estar hidratado (ex: ao
        // voltar de /parecer, mudar de abas rapidamente, ou cliques duplos) e
        // apagaria os documentos salvos da coleta.
        const payload: Record<string, unknown> = { label: data.cnpj.razaoSocial || null, ...getCollectionMeta() };
        if (documents.length > 0) {
          payload.documents = documents;
        } else {
          console.warn(`[handleSave] buildDocuments() retornou [] — preservando documents atual da coleta ${collectionId}`);
        }
        const { error } = await supabase.from("document_collections").update(payload).eq("id", collectionId);
        if (error) throw error;
        setSavedFeedback(true);
        toast.success("Coleta salva no histórico!");
        setTimeout(() => setSavedFeedback(false), 2000);
        return collectionId;
      } else {
        const { data: session } = await supabase.auth.getUser();
        if (!session.user) {
          toast.error("Você precisa estar logado para salvar coletas.");
          return null;
        }
        const userId = session.user.id;
        const { data: row, error } = await supabase.from("document_collections").insert({
          user_id: userId,
          status: "in_progress",
          label: data.cnpj.razaoSocial || null,
          documents,
          ...getCollectionMeta(),
        }).select("id").single();
        if (error) throw error;
        setCollectionId(row.id);
        _uploadCtx = { userId, collectionId: row.id };

        // Upload original files to Supabase Storage (fire-and-forget)
        if (originalFiles) {
          const fileMap = {
            cnpj: "cartao-cnpj", qsa: "qsa", contrato: "contrato-social",
            faturamento: "faturamento", scr: "scr-bacen", scrAnterior: "scr-anterior",
          } as const;
          for (const [key, label] of Object.entries(fileMap)) {
            const filesArr = originalFiles[key as keyof typeof originalFiles];
            if (Array.isArray(filesArr)) {
              filesArr.forEach((file, i) => {
                const suffix = filesArr.length > 1 ? `-${i + 1}` : "";
                uploadFile(userId, row.id, "originals", `${label}${suffix}.${file.name.split(".").pop() || "pdf"}`, file)
                  .catch(() => {});
              });
            }
          }
        }

        setSavedFeedback(true);
        toast.success("Coleta salva no histórico!");
        setTimeout(() => setSavedFeedback(false), 2000);
        return row.id;
      }
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Verifique a conexão com o Supabase"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleGoToParecer = async () => {
    setFinishing(true);
    try {
      let id = collectionId;
      if (!id) {
        id = await handleSave();
      }
      if (!id) throw new Error("Não foi possível salvar a coleta");
      router.push(`/parecer?id=${id}`);
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Verifique a conexão"));
      setFinishing(false);
    }
  };

  // ── Auto-save: salva automaticamente ao entrar no step ──
  // Proteção contra duplicatas: verifica se já existe coleta recente com mesmo CNPJ
  const autoSaved = useRef(false);
  useEffect(() => {
    if (autoSaved.current) return;
    autoSaved.current = true;

    (async () => {
      // Se já tem collectionId (ex: retomou coleta), só atualiza
      if (collectionId) {
        handleSave();
        return;
      }

      // Verifica se já existe coleta in_progress recente com o mesmo CNPJ (últimos 5 min)
      // para evitar duplicatas por StrictMode ou re-renders
      try {
        const supabase = createClient();
        const { data: session } = await supabase.auth.getUser();
        if (!session.user) { handleSave(); return; }
        const cnpj = data.cnpj.cnpj;
        if (cnpj) {
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from("document_collections")
            .select("id")
            .eq("user_id", session.user.id)
            .eq("cnpj", cnpj)
            .eq("status", "in_progress")
            .gte("created_at", fiveMinAgo)
            .order("created_at", { ascending: false })
            .limit(1);
          if (existing && existing.length > 0) {
            // Já existe uma coleta recente para o mesmo CNPJ, reutiliza
            setCollectionId(existing[0].id);
            const documents = buildDocuments();
            const payload: Record<string, unknown> = { label: data.cnpj.razaoSocial || null, ...getCollectionMeta() };
            if (documents.length > 0) {
              payload.documents = documents;
            } else {
              console.warn(`[autoSave] buildDocuments() retornou [] — preservando documents da coleta reusada ${existing[0].id}`);
            }
            await supabase.from("document_collections").update(payload).eq("id", existing[0].id);
            setSavedFeedback(true);
            setTimeout(() => setSavedFeedback(false), 2000);
            return;
          }
        }
      } catch { /* continue com save normal */ }

      handleSave();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeName = (data.cnpj.cnpj || "relatorio").replace(/[\/\\.:]/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);

  // ── Helpers ──
  const parseMoneyToNumber = (val: string): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
  };

  // dividaAtiva agora usa calcScrTotal (soma componentes) em vez do campo
  // agregado da fonte que pode vir incompleto.
  const dividaAtiva = calcScrTotal(data.scr);
  const atraso = parseMoneyToNumber(data.scr.operacoesEmAtraso);
  const prejuizosVal = parseMoneyToNumber(data.scr.prejuizos);
  const vencidas = parseMoneyToNumber(data.scr.operacoesVencidas);
  const vencidosSCR = parseMoneyToNumber(data.scr.vencidos);
  const protestosVigentes = parseInt(data.protestos?.vigentesQtd || "0", 10) || 0;
  const processosBancariosAtivos = (data.processos?.bancarios || []).filter(b => b.status && /andamento|distribu/i.test(b.status)).length;

  // ── Rating local (0-10) — usado como fallback se IA não disponível ──
  const ratingScore = (() => {
    // Sem dados mínimos → rating 0 (ausência de documento não é mérito)
    const temDadosMinimos = !!(
      data.cnpj.razaoSocial ||
      (data.faturamento.meses?.length ?? 0) > 0 ||
      data.scr.totalDividasAtivas
    );
    if (!temDadosMinimos) return 0;

    let s = 0;
    // Situação ATIVA (+1)
    if (data.cnpj.situacaoCadastral?.toUpperCase().includes("ATIVA")) s += 1;
    // Empresa > 5 anos from dataAbertura (+1)
    if (data.cnpj.dataAbertura) {
      const parts = data.cnpj.dataAbertura.split("/");
      if (parts.length >= 3) {
        const year = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(year) && new Date().getFullYear() - year > 5) s += 1;
      }
    }
    // Faturamento consistente não-zerado (+1.5)
    if (!data.faturamento.faturamentoZerado) s += 1.5;
    // Faturamento atualizado (+0.5)
    if (data.faturamento.dadosAtualizados) s += 0.5;
    // SCR sem vencidos (+1.5)
    if (vencidosSCR === 0 && vencidas === 0) s += 1.5;
    // SCR sem prejuízos (+1.5)
    if (prejuizosVal === 0) s += 1.5;
    // Classificação risco A-C (+1)
    const cl = data.scr.classificacaoRisco?.toUpperCase().trim();
    if (cl && ["A", "AA", "B", "C"].includes(cl)) s += 1;
    // Sem protestos vigentes (+1)
    if (protestosVigentes === 0) s += 1;
    // Sem RJ e processos bancários ativos (+0.5)
    if (!data.processos?.temRJ && processosBancariosAtivos === 0) s += 0.5;
    // Base (+0.5)
    s += 0.5;
    return Math.min(10, Math.round(s * 10) / 10);
  })();

  // ── Decision (prioridade: override do analista > comite > IA > calculo local) ──
  // O analista pode sobrescrever o rating e a decisao na pagina /parecer.
  // O PDF deve respeitar esse override — senao mostra o rating cru da IA e
  // diverge do que aparece na plataforma.
  const parecerAnalistaOverride = (aiAnalysis as unknown as { parecerAnalista?: { ratingAnalista?: number | string | null; decisao?: string | null; decisaoComite?: string | null } } | null)?.parecerAnalista;
  const ratingOverrideRaw = parecerAnalistaOverride?.ratingAnalista;
  const ratingOverride = ratingOverrideRaw != null && ratingOverrideRaw !== "" ? Number(ratingOverrideRaw) : null;
  // Único-source-of-truth para saber se a análise já foi carregada (cache ou IA).
  // Enquanto não estiver pronta, NÃO mostramos ratingScore local — ele diverge
  // do rating da IA e causava o KPI de Rating piscar durante o carregamento.
  const analysisReady = aiAnalysis != null || analysisError != null;

  // Feature 5 — Alerta de vencimento de documentos (> 12 meses)
  const docAgeWarnings = useMemo(() => {
    const warnings: string[] = [];
    const now = new Date();
    function parsePeriodo(s: string): Date | null {
      if (!s) return null;
      const m1 = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
      if (m1) return new Date(parseInt(m1[2]), parseInt(m1[1]) - 1, 1);
      const m2 = s.match(/^(\d{4})[\/\-](\d{2})$/);
      if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, 1);
      const m3 = s.match(/(\d{4})/);
      if (m3) return new Date(parseInt(m3[1]), 11, 31);
      return null;
    }
    const scrRef = data.scr?.periodoReferencia;
    if (scrRef) {
      const d = parsePeriodo(scrRef);
      if (d) {
        const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
        if (months > 12) warnings.push(`SCR com ${months} meses de defasagem (ref.: ${scrRef})`);
      }
    }
    const balPeriodo = data.balanco?.periodoMaisRecente ?? data.balanco?.anos?.[0]?.ano;
    if (balPeriodo) {
      const d = parsePeriodo(balPeriodo);
      if (d) {
        const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
        if (months > 12) warnings.push(`Balanço patrimonial com ${months} meses de defasagem (ref.: ${balPeriodo})`);
      }
    }
    return warnings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Converter score V2 (0–100) para escala 0–10 para compatibilidade com o template
  const finalRatingFromV2 = autoScoreResultado?.score?.score_final != null
    ? autoScoreResultado.score.score_final / 10
    : null

  // Cascata atualizada — V2 tem prioridade máxima
  const finalRating: number | null =
    ratingOverride ??       // override manual do analista
    finalRatingFromV2 ??    // ← NOVO: score V2 convertido
    aiAnalysis?.rating ??   // Gemini (fallback)
    ratingScore ??          // heurística local
    null
  const decisaoOverride = parecerAnalistaOverride?.decisaoComite || parecerAnalistaOverride?.decisao || null;
  const decision: string =
    decisaoOverride ? String(decisaoOverride).toUpperCase() :
    aiAnalysis ? aiAnalysis.decisao :
    finalRating == null ? "" :
    // Faixas alinhadas à Política V2 (escala 0–10 = score V2 ÷ 10)
    // A/B (≥8) → APROVADO | C/D (6–7.9) → CONDICIONAL | E (5–5.9) → PENDENTE | F (<5) → REPROVADO
    (finalRating >= 8 ? "APROVADO" : finalRating >= 6 ? "APROVACAO_CONDICIONAL" : finalRating >= 5 ? "PENDENTE" : "REPROVADO");
  const decisionColor = decision === "APROVADO" ? "#16A34A" : decision === "REPROVADO" ? "#DC2626" : "#D97706";
  const decisionBg = decision === "APROVADO" ? "#F0FDF4" : decision === "PENDENTE" ? "#FFFBEB" : "#FEF2F2";
  const decisionBorder = decision === "APROVADO" ? "#BBF7D0" : decision === "PENDENTE" ? "#FDE68A" : "#FECACA";

  // ── Alerts (usa IA se disponível) ──
  const alerts: Alert[] = (() => {
    if (aiAnalysis && aiAnalysis.alertas.length > 0) {
      const mapSev = (s: string): AlertSeverity =>
        s === "ALTA" ? "CRÍTICO" : s === "MODERADA" ? "RESTRITIVO" : "OBSERVAÇÃO";
      return aiAnalysis.alertas.map(a => ({
        message: a.descricao,
        severity: mapSev(a.severidade),
        impacto: a.impacto,
      }));
    }
    const a: Alert[] = [];
    if (vencidosSCR > 0 || vencidas > 0) a.push({ message: "SCR com operações vencidas", severity: "CRÍTICO" });
    if (prejuizosVal > 0) a.push({ message: "SCR com prejuízos registrados", severity: "CRÍTICO" });
    if (calcFaturamentoZerado(data.faturamento)) a.push({ message: "Faturamento zerado no período", severity: "CRÍTICO" });
    if (data.faturamento.meses.length > 0 && !data.faturamento.dadosAtualizados) a.push({ message: "Faturamento desatualizado", severity: "RESTRITIVO" });
    const rl = data.scr.classificacaoRisco?.toUpperCase();
    if (rl && ["D", "E", "F", "G", "H"].includes(rl)) a.push({ message: `Classificação de risco ${rl}`, severity: "RESTRITIVO" });
    if (atraso > 0) a.push({ message: "Operações em atraso no SCR", severity: "RESTRITIVO" });
    return a;
  })();

  const alertsHigh = alerts.filter(a => a.severity === "CRÍTICO");
  const alertsMod = alerts.filter(a => a.severity === "RESTRITIVO" || a.severity === "OBSERVAÇÃO");

  // ── Pontos fortes/fracos e parecer da IA ──
  // parecer é string | objeto — narrowar antes de acessar propriedades
  const _parecerObj = (typeof aiAnalysis?.parecer === 'object' && aiAnalysis?.parecer !== null)
    ? aiAnalysis!.parecer as { resumoExecutivo?: string; textoCompleto?: string; pontosFortes?: string[]; pontosNegativosOuFracos?: string[]; perguntasVisita?: Array<{pergunta: string; contexto: string}> }
    : null;
  const pontosFortes   = (aiAnalysis?.pontosFortes   || _parecerObj?.pontosFortes              || []) as string[];
  const pontosFracos   = (aiAnalysis?.pontosFracos   || _parecerObj?.pontosNegativosOuFracos   || []) as string[];
  const perguntasVisita = (aiAnalysis?.perguntasVisita || _parecerObj?.perguntasVisita           || []) as Array<{pergunta: string; contexto: string}>;
  // textoCompleto = análise completa (3-4 parágrafos); resumoExecutivo = 1 parágrafo. Prioriza o completo no PDF.
  const resumoExecutivo = _parecerObj?.textoCompleto
    || aiAnalysis?.resumoExecutivo
    || (typeof aiAnalysis?.parecer === 'string' ? aiAnalysis.parecer : _parecerObj?.resumoExecutivo)
    || "";

  // ── Legacy risk for UI badge ──
  const riskScore = (() => {
    if (alertsHigh.length > 0) return "alto";
    if (alertsMod.length > 0) return "medio";
    return "baixo";
  })();

  const qsaCount = data.qsa.quadroSocietario.filter(s => s.nome).length;

  // Company age helper
  const companyAge = (() => {
    if (!data.cnpj.dataAbertura) return "";
    const parts = data.cnpj.dataAbertura.split("/");
    if (parts.length >= 3) {
      const year = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(year)) {
        const age = new Date().getFullYear() - year;
        return `${age} ano${age !== 1 ? "s" : ""}`;
      }
    }
    return "";
  })();

  // ── Fund parameter validation ──
  const fundValidation = validarContraParametros(data, activeValidationSettings);

  // ── Alavancagem (escopo do componente para passar ao relatório) ──
  const _alavFmm = parseMoney(data.faturamento?.fmm12m || data.faturamento?.mediaAno || "");
  const _alavDivida = calcScrTotal(data.scr);
  const alavancagem = _alavFmm > 0 && _alavDivida > 0 ? _alavDivida / _alavFmm : 0;

  // ── Credit Limit Result ──
  const creditLimit: CreditLimitResult = (() => {
    const s = activeValidationSettings;
    const fmmRaw = parseMoney(
      data?.faturamento?.fmm12m ??
      data?.faturamento?.mediaAno ??
      data?.faturamento?.somatoriaAno
    );

    // ── Usar rating V2 como fonte primária ──────────────────────────────
    const ratingV2     = autoScoreResultado?.score?.rating;   // 'A'|'B'|'C'|'D'|'E'|'F'
    const scoreV2Final = autoScoreResultado?.score?.score_final ?? 0;

    // Eliminatórios determinísticos
    const temEliminatoria = fundValidation?.hasEliminatoria ?? false;
    const failCount       = fundValidation?.failCount ?? 0;

    // ── Fator de limite por rating V2 ────────────────────────────────────
    const FATOR_POR_RATING: Record<string, number> = {
      A: 0.80, B: 0.65, C: 0.50, D: 0.30, E: 0.20, F: 0.00,
    };
    const PRAZO_POR_RATING: Record<string, number> = {
      A: s.prazo_maximo_aprovado    ?? 90,
      B: s.prazo_maximo_aprovado    ?? 90,
      C: s.prazo_maximo_condicional ?? 60,
      D: s.prazo_maximo_condicional ?? 60,
      E: 30,
      F: 0,
    };
    const REVISAO_POR_RATING: Record<string, number> = {
      A: s.reanalise_rating_a_dias ?? 180,
      B: s.reanalise_rating_b_dias ?? 120,
      C: s.reanalise_rating_c_dias ?? 120,
      D: s.reanalise_rating_d_dias ?? 120,
      E: s.reanalise_rating_e_dias ?? 90,
      F: s.reanalise_rating_f_dias ?? 45,
    };
    const CLASSIFICACAO_POR_RATING: Record<string, "APROVADO" | "CONDICIONAL" | "REPROVADO"> = {
      A: 'APROVADO',
      B: 'APROVADO',
      C: 'CONDICIONAL',
      D: 'CONDICIONAL',
      E: 'CONDICIONAL',
      F: 'REPROVADO',
    };

    // Eliminatório sobrescreve tudo
    const rating = (temEliminatoria || failCount > 0) ? 'F' : (ratingV2 ?? 'C');

    const fatorReducao   = FATOR_POR_RATING[rating]    ?? 0.50;
    const limiteBase     = fmmRaw * (s.fator_limite_base ?? 0.5);
    const limiteAjustado = limiteBase * (fatorReducao / 0.5); // normaliza pelo fator base
    const prazo          = PRAZO_POR_RATING[rating]    ?? 60;
    const revisaoDias    = REVISAO_POR_RATING[rating]  ?? 90;
    const classificacao  = CLASSIFICACAO_POR_RATING[rating] ?? 'CONDICIONAL';

    const dataRevisao = new Date();
    dataRevisao.setDate(dataRevisao.getDate() + revisaoDias);

    // ── Taxa sugerida por rating V2 ─────────────────────────────────────
    const TAXA_POR_RATING: Record<string, number> = {
      A: s.taxa_base_rating_a ?? 1.8,
      B: s.taxa_base_rating_b ?? 2.0,
      C: s.taxa_base_rating_c ?? 2.2,
      D: s.taxa_base_rating_d ?? 2.5,
      E: s.taxa_base_rating_e ?? 2.8,
      F: 0,
    };
    const taxaBase = TAXA_POR_RATING[rating] ?? 2.2;
    const taxaAjustes: string[] = [];
    let taxaFinal = taxaBase;

    // Ajuste por % de operação a performar
    const vendasDuplicataRaw = data?.relatorioVisita?.vendasDuplicata ?? '100';
    const pctPerformada = (() => {
      const n = parseFloat(String(vendasDuplicataRaw).replace(',', '.').replace('%', '').trim());
      return isNaN(n) ? 100 : n;
    })();
    if (pctPerformada < 70) {
      taxaFinal += 0.2;
      taxaAjustes.push('+0,2% operação a performar');
    }

    // Ajuste por modalidade comissária (sem confirmação de lastro)
    const temComissaria = data?.relatorioVisita?.modalidade === 'comissaria';
    if (temComissaria) {
      taxaFinal += 0.3;
      taxaAjustes.push('+0,3% operação comissária');
    }

    // Desconto por garantia real (imóvel ou investimento)
    const garantiasRaw = (data?.relatorioVisita as Record<string, unknown> | undefined)?.garantias;
    const garantiaReal = Array.isArray(garantiasRaw) && garantiasRaw.some(
      (g: unknown) => typeof g === 'string' && (g.toLowerCase().includes('imóvel') || g.toLowerCase().includes('investimento'))
    );
    if (garantiaReal) {
      taxaFinal -= 0.1;
      taxaAjustes.push('-0,1% garantia real');
    }

    // Rating F ou eliminatório → não opera
    if (rating === 'F' || temEliminatoria) {
      taxaFinal = 0;
      taxaAjustes.length = 0;
    }

    const taxaSugerida = Math.round(taxaFinal * 100) / 100;

    return {
      classificacao,
      limiteBase,
      limiteAjustado,
      fmmBase:     fmmRaw,
      fatorBase:   s.fator_limite_base,
      fatorReducao,
      prazo,
      revisaoDias,
      dataRevisao:        dataRevisao.toISOString(),
      concentracaoMaxPct: s.concentracao_max_sacado ?? 20,
      limiteConcentracao: limiteAjustado * ((s.concentracao_max_sacado ?? 20) / 100),
      presetName:         selectedPresetName,
      ratingV2:           rating,
      scoreV2:            scoreV2Final,
      taxaSugerida,
      taxaBase,
      taxaAjustes,
    };
  })();

  // ── Persist fund_status to collection ──
  useEffect(() => {
    if (!collectionId || fundValidation.criteria.length === 0) return;
    const status = fundValidation.hasEliminatoria || fundValidation.failCount > 0 ? "error"
      : fundValidation.warnCount > 0 ? "warning" : "ok";
    const payload = {
      status,
      pass_count: fundValidation.passCount,
      fail_count: fundValidation.failCount,
      warn_count: fundValidation.warnCount,
      total: fundValidation.criteria.length,
      preset_name: selectedPresetName,
      preset_color: selectedPresetColor,
      validated_at: new Date().toISOString(),
    };
    const save = async () => {
      try {
        const supabase = createClient();
        await supabase.from("document_collections").update({ fund_status: payload }).eq("id", collectionId);
      } catch { /* ignore */ }
    };
    save();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, fundValidation.passCount, fundValidation.failCount, fundValidation.warnCount]);

  // ═══════════════════════════════════════════════════
  // PDF Generation
  // ═══════════════════════════════════════════════════
  // Carrega notas salvas no Supabase quando collectionId muda.
  // IMPORTANTE: sempre reseta primeiro para evitar contaminação entre cedentes.
  useEffect(() => {
    if (!collectionId) return;
    setAnalystNotes("");
    const supabase = createClient();
    supabase.from("document_collections").select("observacoes").eq("id", collectionId).single()
      .then(({ data: row }) => {
        setAnalystNotes(row?.observacoes ?? "");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  const saveNotes = async (notes: string) => {
    if (!collectionId) return;
    setSavingNotes(true);
    try {
      const supabase = createClient();
      await supabase.from("document_collections").update({ observacoes: notes.trim() || null }).eq("id", collectionId);
    } catch { /* silently fail */ } finally { setSavingNotes(false); }
  };

  // Busca o rating/decisao MAIS RECENTES direto do Supabase antes de gerar
  // relatorios. Isso elimina race conditions onde aiAnalysis em memoria esta
  // stale (usuario editou no parecer em outra aba, autosave ainda nao propagou,
  // ou o mount do GenerateStep ainda nao completou loadCachedAnalysis).
  const getFreshFinalRating = async (): Promise<{ rating: number; decisao: string }> => {
    const localFallback = { rating: finalRating ?? ratingScore, decisao: decision || "PENDENTE" };
    if (!collectionId) return localFallback;
    try {
      const supabase = createClient();
      const { data: row } = await supabase
        .from("document_collections")
        .select("ai_analysis, rating, decisao")
        .eq("id", collectionId)
        .maybeSingle();
      if (!row) return localFallback;
      const aiA = row.ai_analysis as Record<string, unknown> | null;
      const pa = aiA?.parecerAnalista as { ratingAnalista?: number | string | null; decisaoComite?: string | null } | undefined;
      // Prioridade: override analista > coluna rating > ai_analysis.rating > local
      const analistaRaw = pa?.ratingAnalista;
      const analistaNum = analistaRaw != null && analistaRaw !== "" ? Number(analistaRaw) : null;
      let freshRating = finalRating ?? ratingScore;
      if (analistaNum != null && !isNaN(analistaNum)) freshRating = analistaNum;
      else if (row.rating != null) freshRating = Number(row.rating);
      else if (aiA && typeof aiA.rating === "number") freshRating = aiA.rating;
      const freshDecisao = pa?.decisaoComite
        ? String(pa.decisaoComite).toUpperCase()
        : (row.decisao ? String(row.decisao).toUpperCase() : (decision || "PENDENTE"));
      return { rating: freshRating, decisao: freshDecisao };
    } catch {
      return localFallback;
    }
  };

  const generatePDF = async () => {
    console.log("[generatePDF] ▶ iniciando");
    toast.info("Gerando PDF…");
    setGeneratingFormat("pdf");
    try {
      console.log("[generatePDF] buscando imagens…");
      const {
        streetViewBase64,
        streetView90Base64,
        streetView180Base64,
        streetView270Base64,
        mapStaticBase64,
        streetViewInteractiveUrl,
      } = await fetchGoogleMapsImages();

      // ── Busca histórico de operações do cedente ────────────────────────────
      let histOperacoes: import("@/types").Operacao[] = [];
      const cnpjCedente = data.cnpj?.cnpj;
      if (cnpjCedente) {
        try {
          const supabase = createClient();
          const { data: { user: u } } = await supabase.auth.getUser();
          if (u) {
            const { data: ops } = await supabase
              .from("operacoes")
              .select("*")
              .eq("user_id", u.id)
              .eq("cnpj", cnpjCedente.replace(/\D/g, ""))
              .order("data_operacao", { ascending: false });
            if (ops) histOperacoes = ops as import("@/types").Operacao[];
          }
        } catch { /* histórico indisponível — segue sem */ }
      }

      // Busca rating/decisao frescos do Supabase para evitar estado stale
      const fresh = await getFreshFinalRating();
      // ── Geração via Puppeteer (servidor) ──────────────────────────────────
      const payload = {
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
        dividaAtiva, atraso, riskScore: riskScore as "alto" | "medio" | "baixo", decisionColor, decisionBg, decisionBorder,
        alavancagem: alavancagem > 0 ? alavancagem : undefined,
        observacoes: analystNotes.trim() || undefined,
        streetViewBase64,
        streetView90Base64,
        streetView180Base64,
        streetView270Base64,
        streetViewInteractiveUrl,
        mapStaticBase64,
        fundValidation,
        creditLimit,
        histOperacoes: histOperacoes.length ? histOperacoes : undefined,
        committeMembers: committeMembers.trim() || undefined,
        scoreV2: scoreV2 ?? undefined,
        scoreV2Respostas: scoreV2Respostas.length ? scoreV2Respostas : undefined,
        settings: activeValidationSettings,
      };

      // Adiciona mapEmbedUrl para preview interativo (usado no HTML, ignorado no PDF)
      const endereco = data.cnpj?.endereco;
      const mapsEmbedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const mapEmbedUrl = endereco && mapsEmbedKey
        ? `https://www.google.com/maps/embed/v1/place?key=${mapsEmbedKey}&q=${encodeURIComponent(endereco)}`
        : undefined;
      Object.assign(payload, { mapEmbedUrl });

      console.log("[generatePDF] payload montado, chamando /api/generate-pdf");

      // Tenta nova API Puppeteer (funciona local + prod)
      let usedApi = false;
      try {
        const blob = await generatePDFViaAPI(payload);
        console.log(`[generatePDF] /api/generate-pdf OK — blob size=${blob.size}`);
        triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
        usedApi = true;
      } catch (apiErr) {
        const apiErrMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        console.warn("[generatePDF] /api/generate-pdf falhou:", apiErrMsg);
        // Fallback para rota legada (Vercel com CHROMIUM_URL)
        try {
          console.log("[generatePDF] tentando /api/exportar-pdf");
          const res = await fetch("/api/exportar-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const blob = await res.blob();
            console.log(`[generatePDF] /api/exportar-pdf OK — blob size=${blob.size}`);
            triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
            usedApi = true;
          } else {
            console.warn(`[generatePDF] /api/exportar-pdf HTTP ${res.status}`);
          }
        } catch (legacyErr) {
          console.warn("[generatePDF] /api/exportar-pdf falhou:", legacyErr instanceof Error ? legacyErr.message : legacyErr);
        }
      }

      // Fallback: jsPDF local (último recurso, sempre funciona)
      if (!usedApi) {
        console.warn("[generatePDF] APIs Puppeteer indisponíveis, usando jsPDF local");
        try {
          const blob = await buildPDFReport(payload);
          console.log(`[generatePDF] jsPDF OK — blob size=${blob.size}`);
          triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
          usedApi = true;
        } catch (jspdfErr) {
          console.error("[generatePDF] jsPDF falhou também:", jspdfErr);
          throw new Error(`Todas as rotas de geração falharam: ${jspdfErr instanceof Error ? jspdfErr.message : "erro desconhecido"}`);
        }
      }

      setGeneratedFormats(p => new Set(p).add("pdf"));
      toast.success("PDF gerado com sucesso");
      console.log("[generatePDF] ✔ concluído");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error(`Erro ao gerar PDF: ${err instanceof Error ? err.message : "tente novamente"}`);
      // Fallback final: jsPDF (tambem com fresh rating)
      try {
        const fresh2 = await getFreshFinalRating();
        const blob = await buildPDFReport({
          data, aiAnalysis, decision: fresh2.decisao, finalRating: fresh2.rating, alerts, alertsHigh,
          pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
          companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
          dividaAtiva, atraso, riskScore, decisionColor, decisionBg, decisionBorder,
          alavancagem: alavancagem > 0 ? alavancagem : undefined,
          observacoes: analystNotes.trim() || undefined,
          fundValidation, creditLimit,
          committeMembers: committeMembers.trim() || undefined,
          scoreV2: scoreV2 ?? undefined,
          scoreV2Respostas: scoreV2Respostas.length ? scoreV2Respostas : undefined,
          settings: activeValidationSettings,
        });
        triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.pdf`);
        setGeneratedFormats(p => new Set(p).add("pdf"));
        toast.success("PDF gerado via fallback (qualidade reduzida)");
      } catch (fallbackErr) {
        console.error("Fallback jsPDF também falhou:", fallbackErr);
      }
    } finally {
      setGeneratingFormat(null);
    }
  };

  // Helper: busca fotos via Places API (New) com validação Gemini, fallback Street View.
  // Compartilhado por generatePDF, generateHTMLView e shareReport.
  const fetchGoogleMapsImages = async (): Promise<{
    streetViewBase64?: string;
    streetView90Base64?: string;
    streetView180Base64?: string;
    streetView270Base64?: string;
    mapStaticBase64?: string;
    streetViewInteractiveUrl?: string;
  }> => {
    const endereco = data.cnpj?.endereco;
    if (!endereco) return {};

    const razaoSocial = data.cnpj?.razaoSocial ?? "";
    const cnae        = data.cnpj?.cnaePrincipal ?? "";
    const porte       = data.cnpj?.porte ?? "";

    const fetchMapProxy = async (type: "streetview" | "map", heading?: number): Promise<string | undefined> => {
      try {
        const qs = new URLSearchParams({ address: endereco, type });
        if (heading != null) qs.set("heading", String(heading));
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`/api/map-image?${qs.toString()}`, { signal: ctrl.signal });
        clearTimeout(timeoutId);
        if (!res.ok) return undefined;
        const json = await res.json();
        if (json.error || !json.base64) return undefined;
        return `data:image/${json.mime ?? "jpeg"};base64,${json.base64}`;
      } catch (e) {
        console.warn(`[fetchGoogleMapsImages] ${type}/${heading} falhou:`, e instanceof Error ? e.message : e);
        return undefined;
      }
    };

    let sv0: string | undefined, sv90: string | undefined, sv180: string | undefined, sv270: string | undefined;
    let interactiveUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
    let usedPlaces = false;

    // ── Tenta Places API primeiro ────────────────────────────────────────
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 10000);
      const qs   = new URLSearchParams({ type: "places", address: endereco, razaoSocial, cnae, porte });
      const res  = await fetch(`/api/map-image?${qs.toString()}`, { signal: ctrl.signal });
      clearTimeout(tid);

      if (res.ok) {
        const pj = await res.json() as {
          fotos: Array<{ base64: string; mime: string; tipo: string }>;
          place_id: string | null;
          nome_encontrado: string | null;
          fallback: boolean;
        };
        if (!pj.fallback && pj.fotos.length > 0) {
          const toUrl = (f?: { base64: string; mime: string }) =>
            f ? `data:image/${f.mime};base64,${f.base64}` : undefined;
          sv0   = toUrl(pj.fotos[0]);
          sv90  = toUrl(pj.fotos[1]);
          sv180 = toUrl(pj.fotos[2]);
          sv270 = toUrl(pj.fotos[3]);
          if (pj.place_id) interactiveUrl = `https://www.google.com/maps/place/?q=place_id:${pj.place_id}`;
          usedPlaces = true;
          console.log(`[fetchGoogleMapsImages] Places: ${pj.fotos.length} fotos, "${pj.nome_encontrado}", place_id=${pj.place_id}`);
        }
      }
    } catch (e) {
      console.warn("[fetchGoogleMapsImages] Places falhou/timeout:", e instanceof Error ? e.message : e);
    }

    // ── Fallback: Street View ────────────────────────────────────────────
    if (!usedPlaces) {
      console.log("[fetchGoogleMapsImages] Street View (Places sem resultado)");
      try {
        const [a, b, c, d] = await Promise.all([
          fetchMapProxy("streetview", 0),
          fetchMapProxy("streetview", 90),
          fetchMapProxy("streetview", 180),
          fetchMapProxy("streetview", 270),
        ]);
        sv0 = a; sv90 = b; sv180 = c; sv270 = d;
      } catch (e) {
        console.warn("[fetchGoogleMapsImages] Street View falhou:", e);
      }
    }

    // ── Mapa estático sempre busca ───────────────────────────────────────
    const mp = await fetchMapProxy("map").catch(() => undefined);
    console.log(`[fetchGoogleMapsImages] sv0=${!!sv0} sv90=${!!sv90} mp=${!!mp} source=${usedPlaces ? "places" : "streetview"}`);

    return {
      streetViewBase64: sv0,
      streetView90Base64: sv90,
      streetView180Base64: sv180,
      streetView270Base64: sv270,
      mapStaticBase64: mp,
      streetViewInteractiveUrl: interactiveUrl,
    };
  };

  // ═══════════════════════════════════════════════════
  // HTML View (abre relatório visual em nova aba)
  // ═══════════════════════════════════════════════════
  const generateHTMLView = async () => {
    console.log("[generateHTMLView] ▶ iniciando");
    // Abre a janela ANTES do async — único jeito de não ser bloqueada como popup
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup bloqueado pelo navegador. Permita popups desta página e tente novamente.");
      return;
    }
    w.document.write("<html><body style='font-family:sans-serif;padding:40px;color:#555'>Gerando preview, aguarde…</body></html>");
    toast.info("Gerando preview HTML…");
    setGeneratingFormat("html");
    try {
      console.log("[generateHTMLView] buscando mapas…");
      const maps = await fetchGoogleMapsImages();
      console.log("[generateHTMLView] mapas OK, buscando rating fresco…");
      const fresh = await getFreshFinalRating();
      console.log("[generateHTMLView] construindo payload…");
      const htmlEndereco = data.cnpj?.endereco;
      const htmlApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const payload = {
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
        dividaAtiva, atraso, riskScore: riskScore as "alto" | "medio" | "baixo", decisionColor, decisionBg, decisionBorder,
        observacoes: analystNotes.trim() || undefined,
        streetViewBase64: maps.streetViewBase64,
        streetView90Base64: maps.streetView90Base64,
        streetView180Base64: maps.streetView180Base64,
        streetView270Base64: maps.streetView270Base64,
        streetViewInteractiveUrl: maps.streetViewInteractiveUrl,
        mapStaticBase64: maps.mapStaticBase64,
        mapEmbedUrl: htmlEndereco && htmlApiKey
          ? `https://www.google.com/maps/embed/v1/place?key=${htmlApiKey}&q=${encodeURIComponent(htmlEndereco)}`
          : undefined,
        fundValidation,
        creditLimit,
        committeMembers: committeMembers.trim() || undefined,
        scoreV2: scoreV2 ?? undefined,
        scoreV2Respostas: scoreV2Respostas.length ? scoreV2Respostas : undefined,
        settings: activeValidationSettings,
      };
      const html = await generateHTMLPreview(payload);

      // Injeta a URL base para o botão "Salvar como PDF" funcionar do blob
      const htmlWithUrl = html.replace("__BASE_URL__", window.location.origin);
      // Navega a janela já aberta para o blob com o HTML final
      const blob = new Blob([htmlWithUrl], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      w.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setGeneratedFormats(p => new Set(p).add("html"));
      toast.success("Preview HTML aberto em nova aba");
    } catch (err) {
      w.close();
      const msg = err instanceof Error ? err.message : "Falha ao gerar preview HTML";
      console.error("HTML view error:", err);
      toast.error(`Erro ao gerar preview: ${msg}`);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // Share Report — gera link público via /r/{id}
  // ═══════════════════════════════════════════════════
  const shareReport = async () => {
    setSharingReport(true);
    toast.info("Gerando link público…");
    try {
      const maps = await fetchGoogleMapsImages();
      const fresh = await getFreshFinalRating();
      const htmlEndereco = data.cnpj?.endereco;
      const htmlApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const payload = {
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes, vencidosSCR, vencidas, prejuizosVal,
        dividaAtiva, atraso, riskScore: riskScore as "alto" | "medio" | "baixo", decisionColor, decisionBg, decisionBorder,
        observacoes: analystNotes.trim() || undefined,
        streetViewBase64: maps.streetViewBase64,
        streetView90Base64: maps.streetView90Base64,
        streetView180Base64: maps.streetView180Base64,
        streetView270Base64: maps.streetView270Base64,
        streetViewInteractiveUrl: maps.streetViewInteractiveUrl,
        mapStaticBase64: maps.mapStaticBase64,
        mapEmbedUrl: htmlEndereco && htmlApiKey
          ? `https://www.google.com/maps/embed/v1/place?key=${htmlApiKey}&q=${encodeURIComponent(htmlEndereco)}`
          : undefined,
        fundValidation,
        creditLimit,
        committeMembers: committeMembers.trim() || undefined,
        scoreV2: scoreV2 ?? undefined,
        scoreV2Respostas: scoreV2Respostas.length ? scoreV2Respostas : undefined,
        settings: activeValidationSettings,
      };
      const html = await generateHTMLPreview(payload);
      // Substitui __BASE_URL__ pelo domínio real antes de salvar
      const htmlFinal = html.replace("__BASE_URL__", window.location.origin);

      const res = await fetch("/api/share-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlFinal,
          cnpj: data.cnpj?.cnpj ?? undefined,
          company: data.cnpj?.razaoSocial ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json() as { url: string; id: string };
      const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
      setSharedUrl(fullUrl);
      await navigator.clipboard.writeText(fullUrl).catch(() => {});
      toast.success("Link copiado para a área de transferência!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gerar link";
      console.error("[shareReport] erro:", err);
      toast.error(`Erro ao compartilhar: ${msg}`);
    } finally {
      setSharingReport(false);
    }
  };

  // ═══════════════════════════════════════════════════
  // DOCX Generation
  // ═══════════════════════════════════════════════════
  const generateDOCX = async () => {
    setGeneratingFormat("docx");
    try {
      const fresh = await getFreshFinalRating();
      const blob = await buildDOCXReport({
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, protestosVigentes,
        fundValidation,
        creditLimit,
      });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.docx`);
      setGeneratedFormats(p => new Set(p).add("docx"));
    } catch (err) {
      console.error("DOCX generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // Excel Generation
  // ═══════════════════════════════════════════════════
  const generateExcel = async () => {
    setGeneratingFormat("xlsx");
    try {
      const fresh = await getFreshFinalRating();
      const blob = await buildExcelReport({
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts,
        pontosFortes, pontosFracos, companyAge, protestosVigentes,
        fundValidation,
        creditLimit,
      });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.xlsx`);
      setGeneratedFormats(p => new Set(p).add("xlsx"));
    } catch (err) {
      console.error("Excel generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  // ═══════════════════════════════════════════════════
  // HTML Generation (extracted to lib/generators/html.ts)
  // ═══════════════════════════════════════════════════
  const generateHTML = async () => {
    setGeneratingFormat("html");
    try {
      const fresh = await getFreshFinalRating();
      const htmlContent = buildHTMLReport({
        data, aiAnalysis, decision: fresh.decisao, finalRating: fresh.rating, alerts, alertsHigh,
        pontosFortes, pontosFracos, perguntasVisita, resumoExecutivo,
        companyAge, vencidosSCR, vencidas, prejuizosVal, protestosVigentes,
        alavancagem: alavancagem > 0 ? alavancagem : undefined,
      });
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      triggerDownload(blob, `capital-financas-${safeName}-${dateStr}.html`);
      setGeneratedFormats(p => new Set(p).add("html"));
    } catch (err) {
      console.error("HTML generation error:", err);
    } finally {
      setGeneratingFormat(null);
    }
  };

  /* old generateHTML body removed — see lib/generators/html.ts */

  // ═══════════════════════════════════════════════════
  // Validação pré-geração (Fase 3.2)
  // ═══════════════════════════════════════════════════
  const [pendingGenerator, setPendingGenerator] = useState<{ fn: () => Promise<void>; label: string } | null>(null);
  const [gateValidation, setGateValidation] = useState<ReportValidation | null>(null);

  // Guarda: antes de chamar qualquer gerador, valida gaps.
  // - Se tem crítico → bloqueia e força confirmação explícita
  // - Se tem só warning → ainda mostra modal mas permite "Gerar mesmo assim"
  // - Se está tudo OK → dispara direto (com error handling)
  const confirmAndGenerate = useCallback((fn: () => Promise<void>, label: string) => {
    let v: ReportValidation;
    try {
      v = validateReport(data);
    } catch (err) {
      // Se a validação em si quebrar, não bloqueia a geração — apenas dispara direto
      console.warn(`[confirmAndGenerate] validateReport falhou, disparando ${label} direto:`, err);
      v = { gaps: [], criticalCount: 0, warningCount: 0, canGenerate: true };
    }
    if (v.gaps.length === 0) {
      console.log(`[confirmAndGenerate] ${label} — sem gaps, gerando direto`);
      // CRÍTICO: envolver em try/catch pra erros não serem engolidos silenciosamente
      (async () => {
        try {
          await fn();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "erro desconhecido";
          console.error(`[generate-${label}] falha:`, err);
          toast.error(`Falha ao gerar ${label}: ${msg}`);
        }
      })();
      return;
    }
    console.log(`[confirmAndGenerate] ${label} — ${v.gaps.length} gap(s), abrindo modal`);
    setGateValidation(v);
    setPendingGenerator({ fn, label });
  }, [data]);

  const wrappedGeneratePDF      = useCallback(() => confirmAndGenerate(generatePDF,      "PDF"),      [confirmAndGenerate]);
  const wrappedGenerateDOCX     = useCallback(() => confirmAndGenerate(generateDOCX,     "DOCX"),     [confirmAndGenerate]);
  const wrappedGenerateExcel    = useCallback(() => confirmAndGenerate(generateExcel,    "Excel"),    [confirmAndGenerate]);
  const wrappedGenerateHTML     = useCallback(() => confirmAndGenerate(generateHTML,     "HTML"),     [confirmAndGenerate]);
  const wrappedGenerateHTMLView = useCallback(() => confirmAndGenerate(generateHTMLView, "Preview"),  [confirmAndGenerate]);

  // ═══════════════════════════════════════════════════
  // UI Render
  // ═══════════════════════════════════════════════════
  // Sidebar nav items
  const navItems = [
    { id: "sec-00", icon: "00", label: "Sumário Executivo" },
    { id: "sec-fs", icon: "FS", label: "Política do Fundo" },
    { id: "sec-05", icon: "05", label: "SCR / Bacen" },
    { id: "sec-07", icon: "07", label: "Processos Judiciais" },
    { id: "sec-op", icon: "OP", label: "Relatório de Visita" },
    { id: "sec-nt", icon: "✎", label: "Anotações" },
    { id: "sec-ex", icon: "⬇", label: "Exportar" },
  ];

  return (
    <div className="w-full flex gap-8 items-start">

      {/* ── Sidebar de navegação (desktop) ── */}
      <nav className="hidden lg:flex flex-col gap-1 w-[220px] flex-shrink-0 sticky self-start animate-fade-in" style={{ top: "80px" }}>
        <div style={{ background: "linear-gradient(135deg, #1a2f6b, #203b88)", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 2px" }}>Relatório</p>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#fff", margin: 0 }}>{initialData?.cnpj?.razaoSocial?.split(" ")[0] || "Empresa"}</p>
        </div>
        {navItems.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="flex items-center gap-3 py-2 px-3 rounded-xl text-[13px] font-medium text-cf-text-2 no-underline transition-all hover:bg-blue-50/80 hover:text-cf-navy"
            onClick={e => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          >
            <span className="w-8 h-8 rounded-lg bg-white border border-[#e8edf5] flex items-center justify-center text-[11px] font-bold text-cf-text-3 shrink-0 shadow-sm">
              {item.icon}
            </span>
            <span className="leading-snug text-[12px]">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* ── Conteúdo principal ──
          fade-stagger: cada SectionCard filho fade com delay incremental
          (50/100/150/200/240/280/320ms). Sensação de cascata sem ferir
          decisão estética 2026-05-04 (fade puro, sem slide-up). */}
      <div className="flex-1 min-w-0 pb-4 flex flex-col gap-7 fade-stagger">

        {/* ── Nav mobile (chips) — só aparece <lg, substitui a sidebar ── */}
        <nav className="lg:hidden flex flex-wrap gap-2">
          {navItems.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-white border border-[#e8edf5] text-[12px] font-medium text-cf-text-2 no-underline shadow-sm transition-colors active:bg-blue-50 hover:bg-blue-50"
              onClick={e => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            >
              <span className="w-5 h-5 rounded-md bg-cf-navy/5 flex items-center justify-center text-[10px] font-bold text-cf-text-3">
                {item.icon}
              </span>
              <span className="leading-none">{item.label}</span>
            </a>
          ))}
        </nav>

        {/* Feature 5 — Alerta de vencimento de documentos */}
        {docAgeWarnings.length > 0 && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertTriangle size={15} style={{ color: "#D97706", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#92400E", margin: "0 0 3px" }}>Documentos com defasagem — considere atualizar antes de decidir</p>
              {docAgeWarnings.map((w: string, i: number) => (
                <p key={i} style={{ fontSize: 11, color: "#B45309", margin: 0 }}>· {w}</p>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            SEÇÃO 00 — SUMÁRIO EXECUTIVO
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-00"
          badge="00"
          badgeVariant="navy"
          sectionLabel="Análise de Crédito"
          title="Sumário Executivo"
          headerRight={
            <StatusPill
              label={decision}
              variant={decision === "APROVADO" ? "green" : decision === "REPROVADO" ? "red" : "yellow"}
              dot
            />
          }
        >
          <div className="p-8 flex flex-col gap-6">

            {/* Alert banner: SCR vencidos ou prejuízos */}
            {(vencidosSCR > 0 || prejuizosVal > 0) && (
              <AlertBanner
                variant="danger"
                label="SCR"
                message={
                  vencidosSCR > 0 && prejuizosVal > 0
                    ? `Operações vencidas (R$ ${data.scr.vencidos}) e prejuízos (R$ ${data.scr.prejuizos}) detectados`
                    : vencidosSCR > 0
                    ? `Operações vencidas: R$ ${data.scr.vencidos}`
                    : `Prejuízos registrados: R$ ${data.scr.prejuizos}`
                }
              />
            )}

            {/* 4 KPI cards */}
            <div className="kpi-grid">
              {scoreV2 ? (
                <KpiCard
                  label="Rating V2"
                  value={`${scoreV2.rating} · ${scoreV2.score_final.toFixed(0)} pts`}
                  sub={finalRating != null
                    ? `IA: ${finalRating.toFixed(1)}/10 · ${aiAnalysis?.ratingConfianca ?? "—"}% conf.`
                    : `Score estruturado · ${scoreV2.confianca_score === "alta" ? "Alta confiança" : scoreV2.confianca_score === "parcial" ? "Confiança parcial" : "Confiança baixa"}`}
                  variant={scoreV2.rating === "A" || scoreV2.rating === "B" ? "success" : scoreV2.rating === "C" ? "warning" : "danger"}
                />
              ) : (
                <KpiCard
                  label="Rating IA"
                  value={finalRating == null ? "—" : `${finalRating}/10`}
                  sub={(() => {
                    if (!analysisReady) return "Carregando análise…";
                    const conf = aiAnalysis?.ratingConfianca;
                    const nivel = aiAnalysis?.nivelAnalise;
                    if (conf != null) {
                      const nivelLabel = nivel === "PRELIMINAR" ? "Preliminar" : nivel === "BASICO" ? "Básica" : nivel === "PADRAO" ? "Padrão" : nivel === "COMPLETO" ? "Completa" : "";
                      return `${nivelLabel ? `${nivelLabel} · ` : ""}${conf}% confiança`;
                    }
                    if (finalRating == null) return "—";
                    return finalRating >= 8 ? "Perfil saudável" : finalRating >= 6 ? "Atenção recomendada" : "Perfil crítico";
                  })()}
                  variant={!analysisReady ? "default" : decision === "APROVADO" ? "success" : decision === "REPROVADO" ? "danger" : "warning"}
                />
              )}
              <KpiCard
                label="Dívida Total"
                value={dividaAtiva > 0 ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
                sub="SCR / Bacen"
                variant={dividaAtiva > 1000000 ? "warning" : "default"}
              />
              <KpiCard
                label="Protestos"
                value={String(protestosVigentes)}
                sub="vigentes"
                variant={protestosVigentes > 0 ? "danger" : "success"}
              />
              <KpiCard
                label="Proc. Passivos"
                value={data.processos ? (parseInt(data.processos.poloPassivoQtd || "0") > 0 ? String(parseInt(data.processos.poloPassivoQtd || "0")) : "—") : "—"}
                sub="polo passivo"
                variant={data.processos && parseInt(data.processos.poloPassivoQtd || "0") > 0 ? "warning" : "default"}
              />
            </div>

            {/* Banner de cobertura parcial */}
            {aiAnalysis?.nivelAnalise && aiAnalysis.nivelAnalise !== "COMPLETO" && (
              <div className={`flex items-start gap-2.5 rounded-[10px] px-3.5 py-2.5 mt-1 border ${
                aiAnalysis.nivelAnalise === "PRELIMINAR" ? "bg-orange-50 border-orange-200" :
                aiAnalysis.nivelAnalise === "BASICO" ? "bg-amber-50 border-amber-200" : "bg-sky-50 border-sky-200"
              }`}>
                <span className="text-base shrink-0 mt-px">
                  {aiAnalysis.nivelAnalise === "PRELIMINAR" ? "⚠️" : aiAnalysis.nivelAnalise === "BASICO" ? "📋" : "📊"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900">
                    Análise {aiAnalysis.nivelAnalise === "PRELIMINAR" ? "Preliminar" : aiAnalysis.nivelAnalise === "BASICO" ? "Básica" : "Padrão"}
                    {" "}· {aiAnalysis.ratingConfianca}% de confiança
                    {(aiAnalysis.coberturaDocumental?.chBonus ?? 0) > 0 && (
                      <span className="font-normal text-sky-700 ml-1.5">
                        (+{aiAnalysis.coberturaDocumental!.chBonus}pts CreditHub)
                      </span>
                    )}
                  </p>
                  {aiAnalysis.impactoDocsFaltantes && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {aiAnalysis.impactoDocsFaltantes as string}
                    </p>
                  )}
                  {/* Sinais CreditHub que compensaram a falta de docs */}
                  {(aiAnalysis.coberturaDocumental?.chSinais?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {aiAnalysis.coberturaDocumental!.chSinais!.map((s, i) => (
                        <span key={i} className={`text-[10px] font-medium px-[7px] py-0.5 rounded-[10px] border ${
                          s.limpo ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"
                        }`}>
                          {s.limpo ? "✓" : "!"} {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Info row 1: Empresa, CNPJ, Situação, Idade, Sócios */}
            <div className="border-t border-gray-200 pt-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-200 rounded-xl overflow-hidden">
                <div className="bg-white px-6 py-5 col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Empresa</p>
                  <p className="text-lg font-bold text-gray-900">{data.cnpj.razaoSocial || "—"}</p>
                </div>
                <div className="bg-white px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">CNPJ</p>
                  <p className="text-base font-medium text-gray-900 font-mono tracking-wide">{data.cnpj.cnpj || "—"}</p>
                </div>
                <div className="bg-white px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Situação</p>
                  <p className="text-base font-medium text-gray-900">{data.cnpj.situacaoCadastral || "—"}</p>
                </div>
                <div className="bg-white px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Idade</p>
                  <p className="text-base font-medium text-gray-900">{companyAge || "—"}</p>
                </div>
              </div>
            </div>

            {/* Info row 2: Capital, Fat. Anual, Em Atraso, Prejuízos */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-200 rounded-xl overflow-hidden">
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Sócios (QSA)</p>
                <p className="text-base font-medium text-gray-900">{String(qsaCount)}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Capital Social</p>
                <p className="text-base font-medium text-gray-900 font-mono">{data.qsa.capitalSocial || data.contrato.capitalSocial || "—"}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Fat. Anual</p>
                <p className="text-base font-medium text-gray-900 font-mono">{data.faturamento.somatoriaAno ? `R$ ${data.faturamento.somatoriaAno}` : "—"}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Em Atraso</p>
                <p className={`text-base font-medium font-mono ${atraso > 0 ? "text-red-600" : "text-gray-900"}`}>{atraso > 0 ? `R$ ${data.scr.operacoesEmAtraso}` : "—"}</p>
              </div>
              <div className="bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">Prejuízos</p>
                <p className={`text-base font-medium font-mono ${prejuizosVal > 0 ? "text-red-600" : "text-gray-900"}`}>{prejuizosVal > 0 ? `R$ ${data.scr.prejuizos}` : "—"}</p>
              </div>
            </div>

            {/* IA: loading */}
            {analyzingAI && (
              <div className="flex items-center gap-2.5 px-3.5 py-3 bg-cf-surface-2 rounded-lg">
                <Loader2 size={14} className="animate-spin text-cf-navy shrink-0" />
                <div>
                  <p className="text-xs font-medium text-cf-text-2">Analisando com IA...</p>
                  {analysisStatus && <p className="text-[11px] text-cf-text-4 mt-0.5">{analysisStatus}</p>}
                </div>
              </div>
            )}

            {/* IA: erro */}
            {!analyzingAI && analysisError && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-600 shrink-0" />
                  <span className="text-xs text-red-600">{analysisError}</span>
                </div>
                <button
                  onClick={handleReanalyze}
                  className="text-xs font-semibold text-white bg-red-600 border-none rounded-md px-3 py-1.5 cursor-pointer shrink-0 hover:bg-red-700 transition-colors"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* IA: badges de contexto */}
            {aiAnalysis && !analyzingAI && (
              <>
                {aiAnalysis.coberturaAnalise && aiAnalysis.coberturaAnalise.nivel !== "completa" && (() => {
                  const ausentes = aiAnalysis.coberturaAnalise!.documentos.filter(d => !d.presente).map(d => d.label);
                  return ausentes.length > 0 ? (
                    <AlertBanner variant="warn" label="Análise Parcial" message={`Documentos ausentes: ${ausentes.join(", ")}. Score calculado com dados disponíveis.`} />
                  ) : null;
                })()}
                <div className="flex justify-end">
                  {analysisFromCache && (
                    <span className="text-[11px] text-cf-text-4 mr-3">Análise carregada do cache</span>
                  )}
                  <button onClick={handleReanalyze} disabled={analyzingAI} className="text-[11px] text-cf-text-4 bg-transparent border-none cursor-pointer underline hover:text-cf-text-2">
                    Reanalisar
                  </button>
                </div>
              </>
            )}

            {/* Alertas */}
            {alerts.length > 0 && <AlertList alerts={alerts} />}

            {/* Resumo executivo */}
            {resumoExecutivo && (
              <div className="px-6 py-5 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-bold uppercase tracking-[0.04em] text-blue-700 mb-2">Resumo Executivo</p>
                <p className="text-sm text-blue-800 leading-relaxed">{resumoExecutivo}</p>
              </div>
            )}

            {/* Pontos fortes */}
            {pontosFortes.length > 0 && (
              <div className="px-6 py-5 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-sm font-bold uppercase tracking-[0.04em] text-green-700 mb-3">
                  Pontos Fortes ({pontosFortes.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {pontosFortes.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-green-700">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pontos fracos */}
            {pontosFracos.length > 0 && (
              <div className="px-6 py-5 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-bold uppercase tracking-[0.04em] text-red-700 mb-3">
                  Pontos Fracos ({pontosFracos.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {pontosFracos.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-red-600">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Perguntas para visita */}
            {perguntasVisita.length > 0 && (
              <div className="px-6 py-5 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm font-bold uppercase tracking-[0.04em] text-amber-700 mb-3">
                  Perguntas para Visita ({perguntasVisita.length})
                </p>
                <div className="flex flex-col gap-2.5">
                  {perguntasVisita.map((q, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-amber-700">{i + 1}. {q.pergunta}</p>
                      <p className="text-[11px] text-amber-900 mt-0.5">{q.contexto}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </SectionCard>

        {/* ── Editar dados do relatório (collapsible) ── */}
        <div className="bg-white overflow-hidden border border-gray-200 rounded-[14px]">
          <button
            onClick={() => setEditing(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200 ${editing ? "bg-cf-navy" : "bg-cf-surface-2"}`}>
                <Pencil size={14} className={editing ? "text-white" : "text-cf-text-3"} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-cf-text-1">Editar dados do relatório</p>
                <p className="text-[11px] text-cf-text-4 mt-px">Ajuste os campos antes de gerar</p>
              </div>
            </div>
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-all duration-200 ${editing ? "bg-cf-navy text-white" : "bg-cf-surface-2 text-cf-text-3"}`}>
              {editing ? "Fechar" : "Abrir"}
            </span>
          </button>

          {editing && (
            <div className="border-t border-gray-200 px-5 pt-4 pb-5 animate-fade-in space-y-5">
              {/* Identificação */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-navy inline-block" />
                  Identificação da Empresa
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["Razão Social", "razaoSocial"], ["Nome Fantasia", "nomeFantasia"], ["CNPJ", "cnpj"],
                    ["Data Abertura", "dataAbertura"], ["Situação", "situacaoCadastral"], ["Data Situação", "dataSituacaoCadastral"],
                    ["Motivo Situação", "motivoSituacao"], ["Natureza Jurídica", "naturezaJuridica"],
                    ["CNAE Principal", "cnaePrincipal"], ["Porte", "porte"], ["Capital Social", "capitalSocialCNPJ"],
                    ["Endereço", "endereco"], ["Telefone", "telefone"], ["E-mail", "email"],
                  ] as [string, keyof typeof data.cnpj][]).map(([label, key]) => (
                    <div key={key} className={key === "razaoSocial" || key === "endereco" || key === "naturezaJuridica" || key === "cnaePrincipal" ? "col-span-2" : ""}>
                      <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                      <input value={data.cnpj[key]} onChange={e => setCNPJ(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Estrutura Societária */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-green inline-block" />
                  Estrutura Societária
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([["Capital Social", "capitalSocial"], ["Data Constituição", "dataConstituicao"]] as [string, keyof typeof data.contrato][]).map(([label, key]) => (
                    <div key={key}>
                      <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                      <input value={data.contrato[key] as string} onChange={e => setContrato(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Objeto Social</label>
                    <textarea value={data.contrato.objetoSocial} onChange={e => setContrato("objetoSocial", e.target.value)} rows={3} className="input-field py-1.5 text-xs mt-0.5 resize-none" />
                  </div>
                </div>
              </div>

              {/* Perfil de Crédito */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-warning inline-block" />
                  Perfil de Crédito
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["Total Dívidas (R$)", "totalDividasAtivas"], ["Classificação Risco", "classificacaoRisco"],
                    ["A Vencer (R$)", "operacoesAVencer"], ["Em Atraso", "operacoesEmAtraso"],
                    ["Vencidas (R$)", "operacoesVencidas"], ["Tempo Atraso", "tempoAtraso"],
                    ["Prejuízos", "prejuizos"], ["Coobrigações", "coobrigacoes"],
                    ["Carteira a Vencer", "carteiraAVencer"], ["Vencidos", "vencidos"],
                    ["Limite Crédito", "limiteCredito"], ["Histórico", "historicoInadimplencia"],
                  ] as [string, keyof typeof data.scr][]).map(([label, key]) => (
                    <div key={key as string} className={key === "historicoInadimplencia" ? "col-span-2" : ""}>
                      <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">{label}</label>
                      {key === "historicoInadimplencia"
                        ? <textarea value={data.scr[key] as string} onChange={e => setSCR(key, e.target.value)} rows={2} className="input-field py-1.5 text-xs mt-0.5 resize-none" />
                        : <input value={data.scr[key] as string} onChange={e => setSCR(key, e.target.value)} className="input-field py-1.5 text-xs mt-0.5" />
                      }
                    </div>
                  ))}
                </div>
              </div>

              {/* Parecer */}
              <div>
                <p className="section-label mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-navy inline-block" />
                  Parecer Final
                </p>
                <label className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Resumo do Risco / Parecer</label>
                <textarea value={data.resumoRisco} onChange={e => setResumoRisco(e.target.value)} rows={4} className="input-field py-1.5 text-xs mt-0.5 resize-none" placeholder="Descreva o parecer final sobre a empresa analisada..." />
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
            SEÇÃO FS — PARÂMETROS DO FUNDO
            ════════════════════════════════════════ */}
        {activeValidationSettings.exibir_conformidade && <SectionCard
          id="sec-fs"
          badge="FS"
          badgeVariant="navy"
          sectionLabel="Critérios de Elegibilidade"
          title="Política do Fundo"
          headerRight={
            <div className="flex items-center gap-2">
              {fundValidation.failCount > 0 && (
                <StatusPill label={`${fundValidation.failCount} reprovado${fundValidation.failCount !== 1 ? "s" : ""}`} variant="red" />
              )}
              {fundValidation.warnCount > 0 && (
                <StatusPill label={`${fundValidation.warnCount} atenção`} variant="yellow" />
              )}
              <StatusPill
                label={`${fundValidation.passCount}/${fundValidation.criteria.length} ok`}
                variant={fundValidation.failCount > 0 ? "red" : fundValidation.warnCount > 0 ? "yellow" : "green"}
              />
            </div>
          }
        >
          {/* Critérios */}
          <div className="border-b border-gray-200 divide-y divide-gray-100">
            {fundValidation.criteria.map((c) => (
              <div key={c.id}>
                <CriteriaItem
                  status={c.status}
                  name={c.label}
                  eliminatorio={c.eliminatoria}
                  limit={c.threshold}
                  value={c.actual}
                  detail={c.detail}
                />
              </div>
            ))}
          </div>

          {/* Resultado + detalhes LC */}
          <div className="px-8 py-6 flex flex-col gap-4">
            <ResultadoBox
              title={
                creditLimit.classificacao === "REPROVADO"
                  ? "Empresa não elegível para este perfil"
                  : `Limite sugerido: R$ ${Math.round(creditLimit.limiteAjustado).toLocaleString("pt-BR")}`
              }
              sub={
                creditLimit.classificacao === "REPROVADO"
                  ? `${fundValidation.failCount} critério(s) eliminatório(s) não atendido(s)`
                  : creditLimit.classificacao === "CONDICIONAL"
                  ? `Reduzido 30% por ${fundValidation.warnCount} critério(s) de atenção — perfil "${selectedPresetName}"`
                  : `Todos os ${fundValidation.passCount} critérios atendidos — perfil "${selectedPresetName}"`
              }
              badge={creditLimit.classificacao === "CONDICIONAL" ? "APROVAÇÃO CONDICIONAL" : creditLimit.classificacao}
              variant={creditLimit.classificacao === "APROVADO" ? "aprovado" : creditLimit.classificacao === "REPROVADO" ? "reprovado" : "pendente"}
            />

            {creditLimit.classificacao !== "REPROVADO" && (
              <div className="kpi-grid">
                <KpiCard
                  label="Prazo máximo"
                  value={`${creditLimit.prazo} dias`}
                  sub={creditLimit.classificacao === "APROVADO" ? "Aprovado" : "Condicional"}
                />
                <KpiCard
                  label="Revisão em"
                  value={new Date(creditLimit.dataRevisao).toLocaleDateString("pt-BR")}
                  sub={`em ${creditLimit.revisaoDias} dias`}
                />
                <KpiCard
                  label="Conc. máx./sacado"
                  value={`R$ ${Math.round(creditLimit.limiteConcentracao ?? 0).toLocaleString("pt-BR")}`}
                  sub={`${creditLimit.concentracaoMaxPct}% do limite`}
                />
                <KpiCard
                  label="Base de cálculo"
                  value={`R$ ${Math.round(creditLimit.fmmBase).toLocaleString("pt-BR")}`}
                  sub={`FMM × ${creditLimit.fatorBase}x`}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: selectedPresetColor }} />
                <span className="text-[11px] text-cf-text-4">{selectedPresetName}</span>
              </div>
              <a href="/configuracoes" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-cf-navy no-underline hover:underline">
                Gerenciar perfis →
              </a>
            </div>
          </div>
        </SectionCard>}

        {/* ════════════════════════════════════════
            SEÇÃO 05 — SCR / BACEN
            ════════════════════════════════════════ */}
        <SectionCard
          id="sec-05"
          badge="05"
          badgeVariant="navy"
          sectionLabel="Perfil de Crédito"
          title="SCR / Bacen"
        >
          <div className="px-8 py-6 flex flex-col gap-5">

            {data.scr.semHistorico && (
              <AlertBanner variant="warn" label="Sem histórico bancário" message="Empresa sem operações registradas no SCR / Banco Central" />
            )}

            {/* KPIs linha 1 */}
            <div className="kpi-grid">
              <KpiCard
                label="Total Dívidas"
                value={dividaAtiva > 0 ? `R$ ${data.scr.totalDividasAtivas}` : "—"}
                variant={dividaAtiva > 1000000 ? "warning" : "default"}
              />
              <KpiCard
                label="A Vencer"
                value={data.scr.carteiraAVencer ? `R$ ${data.scr.carteiraAVencer}` : "—"}
              />
              <KpiCard
                label="Vencidos"
                value={vencidosSCR > 0 ? `R$ ${data.scr.vencidos}` : "—"}
                variant={vencidosSCR > 0 ? "danger" : "default"}
              />
              <KpiCard
                label="Prejuízos"
                value={prejuizosVal > 0 ? `R$ ${data.scr.prejuizos}` : "—"}
                variant={prejuizosVal > 0 ? "danger" : "default"}
              />
            </div>

            {/* KPIs linha 2 */}
            <div className="kpi-grid">
              <KpiCard label="Op. a Vencer" value={data.scr.operacoesAVencer ? `R$ ${data.scr.operacoesAVencer}` : "—"} />
              <KpiCard
                label="Em Atraso"
                value={atraso > 0 ? `R$ ${data.scr.operacoesEmAtraso}` : "—"}
                variant={atraso > 0 ? "warning" : "default"}
              />
              <KpiCard
                label="Vencidas"
                value={vencidas > 0 ? `R$ ${data.scr.operacoesVencidas}` : "—"}
                variant={vencidas > 0 ? "danger" : "default"}
              />
              <KpiCard label="Coobrigações" value={data.scr.coobrigacoes ? `R$ ${data.scr.coobrigacoes}` : "—"} />
            </div>

            {/* KPIs linha 3 */}
            <div className="kpi-grid">
              <KpiCard label="Curto Prazo" value={data.scr.carteiraCurtoPrazo ? `R$ ${data.scr.carteiraCurtoPrazo}` : "—"} />
              <KpiCard label="Longo Prazo" value={data.scr.carteiraLongoPrazo ? `R$ ${data.scr.carteiraLongoPrazo}` : "—"} />
              <KpiCard label="Limite de Crédito" value={data.scr.limiteCredito ? `R$ ${data.scr.limiteCredito}` : "—"} />
            </div>

            {/* Modalidades */}
            {data.scr.modalidades.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2">Modalidades de Crédito</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <ScrTable
                    columns={["Modalidade", "Total", "A Vencer", "Vencido", "Part."]}
                    rows={data.scr.modalidades.map(m => [m.nome, m.total, m.aVencer, m.vencido, m.participacao])}
                  />
                </div>
              </div>
            )}

            {/* Instituições */}
            {data.scr.instituicoes.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2">Instituições Credoras</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.scr.instituicoes.map((inst, i) => (
                    <span key={i} className="bg-gray-100 text-cf-text-2 text-xs font-medium px-2.5 py-1 rounded-md">
                      {inst.nome}: <span className="font-mono">R$ {inst.valor}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Inadimplência */}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2">Histórico de Inadimplência</p>
              {data.scr.historicoInadimplencia ? (
                <AlertBanner variant="warn" label="Histórico" message={data.scr.historicoInadimplencia} />
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                  <p className="text-xs font-medium text-green-700">Sem registro de operações vencidas ou prejuízos</p>
                </div>
              )}
            </div>

          </div>
        </SectionCard>

        {/* ════════════════════════════════════════
            SEÇÃO 07 — PROCESSOS JUDICIAIS
            ════════════════════════════════════════ */}
        {data.processos && (parseInt(data.processos.passivosTotal || "0") > 0 || data.processos.temRJ || (data.processos.distribuicao?.length ?? 0) > 0) && (() => {
          const proc = data.processos!;
          const passivosN  = parseInt(proc.passivosTotal  || "0");
          const ativosN    = parseInt(proc.ativosTotal    || "0");
          if (passivosN === 0 && ativosN === 0 && !proc.temRJ) return null;
          const poloAtivoN = parseInt(proc.poloAtivoQtd  || "0");
          const poloPassN  = parseInt(proc.poloPassivoQtd || "0");
          const dividasN   = parseInt(proc.dividasQtd    || "0");
          return (
            <SectionCard
              id="sec-07"
              badge="07"
              badgeVariant="navy"
              sectionLabel="Processos Judiciais"
              title="Credit Hub"
              headerRight={proc.temRJ ? <StatusPill label="RECUPERAÇÃO JUDICIAL" variant="red" /> : undefined}
            >
              <div className="px-8 py-6 flex flex-col gap-5">

                <div className="kpi-grid">
                  <KpiCard label="Total Processos" value={passivosN > 0 ? String(passivosN) : "—"} sub="todos os polos" variant={passivosN > 0 ? "warning" : "default"} />
                  <KpiCard label="Polo Ativo"      value={poloAtivoN > 0 ? String(poloAtivoN) : "—"} sub="empresa autora" />
                  <KpiCard label="Polo Passivo"    value={poloPassN > 0 ? String(poloPassN) : "—"} sub="empresa ré" variant={poloPassN > 0 ? "warning" : "default"} />
                  <KpiCard label="Dívidas"         value={dividasN > 0 ? String(dividasN) : "—"} sub="vencidas" variant={dividasN > 0 ? "danger" : "default"} />
                </div>

                {proc.valorTotalEstimado && proc.valorTotalEstimado !== "0,00" && (
                  <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-amber-700">Valor Total Estimado</p>
                    <p className="text-xl font-medium text-amber-700 font-mono">R$ {proc.valorTotalEstimado}</p>
                  </div>
                )}

                {(proc.distribuicao?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2.5">Distribuição por Tipo</p>
                    <MetricBarChart
                      items={proc.distribuicao!.slice(0, 8).map(d => ({
                        label: d.tipo,
                        count: Number(d.qtd),
                        pct: Number(d.pct),
                        highlight: /execu|falên/i.test(d.tipo),
                      }))}
                    />
                  </div>
                )}

                {(proc.distribuicaoTemporal?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2.5">Antiguidade dos Processos</p>
                    <div className="kpi-grid">
                      {proc.distribuicaoTemporal!.map((dt, i) => (
                        <KpiCard key={i} label={dt.periodo} value={String(dt.qtd)} sub={`R$ ${dt.valor}`} />
                      ))}
                    </div>
                  </div>
                )}

                {proc.top10Valor && proc.top10Valor.filter(p => p.numero || p.tipo).length > 0 && (() => {
                  const reais = proc.top10Valor!.filter(p => (p.numero || p.tipo) && p.tipo !== "DÍVIDA");
                  if (reais.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-2.5">Maiores Processos por Valor</p>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <ScrTable
                          columns={["Número", "Tipo", "Data", "Valor", "Status"]}
                          rows={reais.slice(0, 5).map(p => [
                            <span key="n" className="font-mono text-[10px]">{p.numero || "—"}</span>,
                            p.tipo || "—",
                            p.data || "—",
                            <span key="v" className="font-medium text-amber-700 font-mono">R$ {p.valor}</span>,
                            p.status ? <StatusPill key="s" label={p.status.slice(0, 20)} variant="gray" /> : <span key="s" className="text-cf-text-4">—</span>,
                          ])}
                        />
                      </div>
                    </div>
                  );
                })()}

              </div>
            </SectionCard>
          );
        })()}

        {/* ════════════════════════════════════════
            SEÇÃO OP — RELATÓRIO DE VISITA
            ════════════════════════════════════════ */}
        <VisitaSection data={data} />

        {/* ════════════════════════════════════════
            SEÇÃO ✎ — ANOTAÇÕES
            ════════════════════════════════════════ */}
        <NotasSection
          analystNotes={analystNotes}
          onNotesChange={setAnalystNotes}
          onSave={saveNotes}
          savingNotes={savingNotes}
        />

        {/* ── Integrantes do Comitê ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Integrantes do Comit&ecirc;
          </label>
          <input
            type="text"
            value={committeMembers}
            onChange={e => setCommitteMembers(e.target.value)}
            placeholder="Ex: Luiz Carlos, Débora Santos, Gleyson Azevedo"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
          />
        </div>

        {/* ════════════════════════════════════════
            SEÇÃO ↓ — EXPORTAR
            ════════════════════════════════════════ */}
        <OnboardingTooltip
          id="generate-exportar"
          message="Gere o relatório em PDF completo com análise de IA, grupo econômico e dados dos birôs. Preencha o Score V2 antes para incluir o rating A-F no relatório."
          position="top"
          isSeen={isSeen("generate-exportar")}
          onSeen={() => markSeen("generate-exportar")}
        >
          <ExportSection
            generatedFormats={generatedFormats}
            generatingFormat={generatingFormat}
            generatePDF={wrappedGeneratePDF}
            generateDOCX={wrappedGenerateDOCX}
            generateExcel={wrappedGenerateExcel}
            generateHTML={wrappedGenerateHTML}
            generateHTMLView={wrappedGenerateHTMLView}
            shareReport={shareReport}
            sharingReport={sharingReport}
            sharedUrl={sharedUrl}
          />
        </OnboardingTooltip>

        {/* ── Inline bottom action bar (rolagem normal) ── */}
        <div className="bg-white" style={{ borderTop: "1px solid #e5e7eb", boxShadow: "0 -2px 8px rgba(0,0,0,0.04)", marginTop: 32 }}>
          <div className="max-w-[1720px] mx-auto px-8 flex items-center justify-between gap-4" style={{ height: 56 }}>

            {/* Esquerda — navegação */}
            <div className="flex items-center gap-1.5">
              <button onClick={onBack} className="btn-secondary min-h-0 px-3.5 py-1.5 text-[13px]">
                <ArrowLeft size={13} /> Voltar
              </button>
              {onReset && (
                <button
                  onClick={() => { try { localStorage.removeItem(NOTES_KEY); } catch { /* ignore */ } onReset(); }}
                  className="flex items-center gap-1 text-[12px] text-cf-text-4 bg-transparent border-none cursor-pointer px-2.5 py-1.5 rounded-md hover:text-cf-text-2 hover:bg-gray-100 transition-colors"
                >
                  <RotateCcw size={11} /> Recomeçar
                </button>
              )}
            </div>

            {/* Centro — status */}
            <div className="flex items-center gap-2">
              {savedFeedback && <StatusPill label="Salvo" variant="green" dot />}
              {generatedFormats.size > 0 && (
                <StatusPill
                  label={`${generatedFormats.size} formato${generatedFormats.size > 1 ? "s" : ""} gerado${generatedFormats.size > 1 ? "s" : ""}`}
                  variant="green"
                  dot
                />
              )}
            </div>

            {/* Direita — ações */}
            <div className="flex items-center gap-2">
              <GoalfyButton data={data} aiAnalysis={aiAnalysis} settings={activeValidationSettings} disabled={!aiAnalysis} />

              {/* Score V2 inline — só aparece se há pendentes */}
              {pendentesScore.length > 0 && (
                <OnboardingTooltip
                  id="generate-score-v2"
                  message="Score V2 avalia a empresa em 5 pilares (Risco, Financeiro, Sócios, Operação e Perfil) com pontuação de 0-100. Clique para completar os critérios pendentes — o rating A-F aparecerá no relatório."
                  position="top"
                  isSeen={isSeen("generate-score-v2")}
                  onSeen={() => markSeen("generate-score-v2")}
                >
                  <button
                    onClick={onAbrirScoreForm}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "#fffbeb", border: "1px solid #fcd34d",
                      borderRadius: 8, padding: "5px 12px", cursor: onAbrirScoreForm ? "pointer" : "default",
                      fontSize: 12, fontWeight: 600, color: "#92400e",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                    Score V2 · {pendentesScore.length} pendente{pendentesScore.length > 1 ? "s" : ""}
                    {onAbrirScoreForm && (
                      <span style={{ fontSize: 11, color: "#b45309", borderLeft: "1px solid #fcd34d", paddingLeft: 8, marginLeft: 2 }}>
                        Preencher
                      </span>
                    )}
                  </button>
                </OnboardingTooltip>
              )}

              {/* Divisor */}
              <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

              <button
                onClick={handleGoToParecer}
                disabled={finishing}
                className="btn-green min-h-0 px-4 py-1.5 text-[13px] flex items-center gap-1.5"
              >
                {finishing
                  ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                  : <>Registrar Parecer <ArrowRight size={13} /></>
                }
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* ── Validation gate modal (Fase 3.2) ── */}
      {/* Portal porque o wrapper pai tem animate-fade-in (transform) que cria
          um stacking context novo, fazendo position:fixed ficar confinado.
          Renderizar direto no document.body resolve. */}
      {pendingGenerator && gateValidation && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-fade-in"
          onClick={() => setPendingGenerator(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-6 py-4 border-b flex items-center gap-3 ${gateValidation.criticalCount > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
              <AlertTriangle size={22} className={gateValidation.criticalCount > 0 ? "text-red-600" : "text-amber-600"} />
              <div className="flex-1">
                <div className={`text-sm font-bold ${gateValidation.criticalCount > 0 ? "text-red-900" : "text-amber-900"}`}>
                  {gateValidation.criticalCount > 0
                    ? `${gateValidation.criticalCount} problema${gateValidation.criticalCount > 1 ? "s" : ""} crítico${gateValidation.criticalCount > 1 ? "s" : ""} impede${gateValidation.criticalCount > 1 ? "m" : ""} a geração`
                    : `${gateValidation.warningCount} alerta${gateValidation.warningCount > 1 ? "s" : ""} — revisar antes de gerar?`}
                </div>
                <div className={`text-[11px] mt-0.5 ${gateValidation.criticalCount > 0 ? "text-red-700" : "text-amber-700"}`}>
                  {gateValidation.criticalCount > 0
                    ? "Corrija os pontos abaixo ou escolha gerar mesmo assim."
                    : `O relatório ${pendingGenerator.label} será gerado com os campos disponíveis.`}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
              {gateValidation.gaps.map((gap, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${gap.severity === "critical" ? "bg-red-50/50 border-red-200" : "bg-amber-50/40 border-amber-200"}`}
                >
                  <div className={`text-[12px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${gap.severity === "critical" ? "text-red-800" : "text-amber-800"}`}>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{
                      background: gap.severity === "critical" ? "#dc2626" : "#d97706",
                      color: "#fff",
                    }}>{gap.severity === "critical" ? "CRÍTICO" : "ALERTA"}</span>
                    {gap.label}
                  </div>
                  <ul className="text-[11px] text-[#374151] space-y-0.5 pl-1">
                    {gap.fields.map((f, j) => (
                      <li key={j} className="flex items-start gap-1.5">
                        <span className={gap.severity === "critical" ? "text-red-500" : "text-amber-500"}>•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setPendingGenerator(null)}
                className="text-[13px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100 transition-colors"
              >
                Voltar e revisar
              </button>
              <button
                onClick={async () => {
                  const fn = pendingGenerator.fn;
                  const label = pendingGenerator.label;
                  setPendingGenerator(null);
                  try {
                    await fn();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Erro desconhecido";
                    console.error(`[generate-${label}] falha:`, err);
                    toast.error(`Falha ao gerar ${label}: ${msg}`);
                  }
                }}
                className={`text-[13px] font-semibold text-white rounded-lg px-4 py-2 transition-colors ${gateValidation.criticalCount > 0 ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}
              >
                {gateValidation.criticalCount > 0 ? "Gerar assim mesmo" : "Gerar " + pendingGenerator.label}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


```

## components/UploadArea.tsx

```tsx
"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, FileText, FileSpreadsheet, Image as ImageIcon, CheckCircle2, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const EXTRACTION_MESSAGES: Record<string, string[]> = {
  cnpj:        ["Lendo documento...", "Extraindo dados societários...", "Validando CNPJ..."],
  qsa:         ["Lendo documento...", "Extraindo quadro societário...", "Validando sócios..."],
  contrato:    ["Lendo contrato...", "Extraindo cláusulas...", "Validando dados..."],
  faturamento: ["Lendo planilha...", "Calculando FMM...", "Validando meses..."],
  scr:         ["Lendo SCR...", "Extraindo modalidades...", "Calculando alavancagem..."],
  scrAnterior: ["Lendo SCR anterior...", "Extraindo modalidades...", "Calculando comparativo..."],
};
const DEFAULT_MESSAGES = ["Processando...", "Interpretando documento...", "Quase pronto..."];

const ACCEPTED_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"];
const ACCEPT_STRING = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg";

function isAcceptedFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTS.includes(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  switch (ext) {
    case ".pdf":   return <FileText size={13} className="text-red-500 flex-shrink-0" />;
    case ".xls":
    case ".xlsx":  return <FileSpreadsheet size={13} className="text-green-600 flex-shrink-0" />;
    case ".doc":
    case ".docx":  return <FileText size={13} className="text-blue-600 flex-shrink-0" />;
    case ".jpg":
    case ".jpeg":
    case ".png":   return <ImageIcon size={13} className="text-purple-500 flex-shrink-0" />;
    default:       return <FileText size={13} className="text-cf-text-3 flex-shrink-0" />;
  }
}

export interface UploadAreaProps {
  title: string;
  description: string;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  processing: boolean;
  doneCount: number;
  errorCount: number;
  errorType?: string;
  onRetry?: () => void;
  onReprocess?: () => void;
  reprocessing?: boolean;
  icon: React.ReactNode;
  docKey: string;
  resumedFilenames?: string[];
  fromCache?: boolean;
  onForceReextract?: () => void;
}

export default function UploadArea({
  title, description, files, onAddFiles, onRemoveFile,
  processing, doneCount, errorCount, errorType,
  onRetry, onReprocess, reprocessing, icon, docKey, resumedFilenames,
  fromCache, onForceReextract,
}: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (!processing) { setMsgIndex(0); return; }
    const id = setInterval(() => {
      setMsgIndex(i => {
        const msgs = EXTRACTION_MESSAGES[docKey] ?? DEFAULT_MESSAGES;
        return (i + 1) % msgs.length;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [processing, docKey]);

  const extractionMsg = (EXTRACTION_MESSAGES[docKey] ?? DEFAULT_MESSAGES)[msgIndex];
  const hasFiles   = files.length > 0;
  const hasResumed = (resumedFilenames?.length ?? 0) > 0;
  const isDone     = doneCount > 0;
  const hasError   = errorCount > 0;

  const filterAndAdd = useCallback((incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const valid: File[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i];
      if (isAcceptedFile(f)) valid.push(f);
      else toast.error(`Formato não suportado: ${f.name}`);
    }
    if (valid.length > 0) onAddFiles(valid);
  }, [onAddFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    filterAndAdd(e.dataTransfer.files);
  }, [filterAndAdd]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    filterAndAdd(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  }, [filterAndAdd]);

  // Left accent color
  const accentColor = isDone  ? "#16a34a"
    : hasError                ? "#dc2626"
    : processing              ? "#3b82f6"
    : dragOver                ? "#203b88"
    : "transparent";

  return (
    <div
      className="relative rounded-xl border border-cf-border bg-white transition-all duration-200 overflow-hidden"
      style={{ borderLeft: `3px solid ${accentColor}` }}
      onDragEnter={() => { dragCounter.current++; setDragOver(true); }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setDragOver(false); }}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={ACCEPT_STRING} multiple className="hidden" onChange={handleInputChange} />

      {/* ── Compact main row ── */}
      <div
        className="flex items-center gap-3 px-4 h-14 cursor-pointer select-none hover:bg-cf-surface/40 transition-colors duration-150"
        onClick={() => inputRef.current?.click()}
      >
        {/* Status icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          isDone     ? "bg-green-50 text-green-600"
          : hasError ? "bg-red-50 text-red-500"
          : processing ? "bg-blue-50 text-blue-500"
          : "bg-cf-surface text-cf-navy"
        }`}>
          {processing
            ? <Loader2 size={15} className="animate-spin" />
            : isDone     ? <CheckCircle2 size={15} />
            : hasError   ? <AlertCircle size={15} />
            : icon}
        </div>

        {/* Title + subtitle */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-cf-text-1 leading-tight">{title}</p>
          <p className="text-[11px] truncate leading-tight mt-0.5 text-cf-text-4">
            {processing
              ? extractionMsg
              : hasFiles
                ? files.length === 1 ? files[0].name : `${files.length} arquivos`
                : hasResumed
                  ? resumedFilenames!.length === 1 ? resumedFilenames![0] : `${resumedFilenames!.length} arquivos`
                  : description}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {/* Remove all */}
          {!processing && hasFiles && (
            <button
              onClick={() => { for (let i = files.length - 1; i >= 0; i--) onRemoveFile(i); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-red-50 transition-colors"
              title="Remover arquivo"
            >
              <X size={13} />
            </button>
          )}
          {/* Upload / Adicionar / Trocar button */}
          {!processing && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer ${
                hasFiles
                  ? "text-cf-text-3 border-cf-border hover:border-cf-navy hover:text-cf-navy"
                  : hasResumed
                    ? "text-cf-navy border-cf-navy/30 bg-cf-navy/5 hover:bg-cf-navy/10"
                    : "text-cf-navy border-cf-border hover:border-cf-navy hover:bg-cf-surface"
              }`}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={11} />
              {hasFiles ? "Trocar" : hasResumed ? "Adicionar" : "Upload"}
            </span>
          )}
        </div>
      </div>

      {/* ── File list ── */}
      {hasFiles && (
        <div className="px-4 pb-3 space-y-1">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-1.5 bg-cf-surface/60 rounded-lg">
              {getFileIcon(file.name)}
              <span className="text-[11px] text-cf-text-2 font-medium truncate flex-1 min-w-0">{file.name}</span>
              <span className="text-[10px] text-cf-text-4 flex-shrink-0">{formatSize(file.size)}</span>
              <button
                onClick={e => { e.stopPropagation(); onRemoveFile(index); }}
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-cf-text-4 hover:text-cf-danger hover:bg-red-50 transition-colors"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
            className="w-full text-[10px] font-medium text-cf-text-4 hover:text-cf-navy transition-colors pt-1 flex items-center justify-center gap-1"
          >
            <Upload size={9} /> Adicionar mais arquivos
          </button>
        </div>
      )}

      {/* ── Resumed filenames (when no new files uploaded) ── */}
      {hasResumed && !hasFiles && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {resumedFilenames!.map((name, i) => (
              <span key={i} className="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-md px-2 py-0.5 font-medium">
                ✓ {name}
              </span>
            ))}
          </div>
          <button
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
            className="w-full text-[10px] font-medium text-cf-text-4 hover:text-cf-navy transition-colors pt-2 flex items-center justify-center gap-1"
          >
            <Upload size={9} /> Adicionar novo documento
          </button>
        </div>
      )}

      {/* ── Inline error + retry ── */}
      {hasError && !processing && (
        <div className={`px-4 pb-3 flex items-center gap-3 ${errorType === "scanned" ? "bg-amber-50/60" : ""}`}>
          <p className={`text-[11px] flex-1 leading-snug ${errorType === "scanned" ? "text-amber-800" : "text-red-600"}`}>
            {errorType === "scanned"
              ? "⚠️ PDF escaneado — sem texto selecionável. Envie a versão digital ou use um conversor OCR (ex: Adobe, ilovepdf.com) antes de enviar."
              : errorType === "quota" ? "API indisponível — limite de uso atingido. Tente em alguns minutos."
              : errorType === "parse" ? "Não foi possível interpretar o documento. Verifique o arquivo."
              : errorType === "empty" ? "Arquivo vazio ou ilegível. Envie um arquivo com conteúdo."
              : "Erro na extração. Tente novamente ou use outro formato."}
          </p>
          {onRetry && errorType !== "empty" && (
            <button
              onClick={e => { e.stopPropagation(); onRetry(); }}
              className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-lg px-2.5 py-1.5 transition-colors flex-shrink-0 ${
                errorType === "scanned"
                  ? "text-amber-700 border-amber-300 hover:bg-amber-100"
                  : "text-red-600 border-red-200 hover:bg-red-50"
              }`}
            >
              <RefreshCw size={10} /> {errorType === "scanned" ? "Tentar outro arquivo" : "Tentar novamente"}
            </button>
          )}
        </div>
      )}

      {/* ── Reprocess button — visible after successful extraction ── */}
      {onReprocess && isDone && !hasError && !processing && (hasFiles || hasResumed) && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onReprocess(); }}
            disabled={reprocessing}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-cf-navy border border-cf-border rounded-lg px-2.5 py-1.5 hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50"
          >
            {reprocessing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            {reprocessing ? "Reextraindo..." : "Reprocessar extracao"}
          </button>
          {fromCache && onForceReextract && (
            <button
              onClick={e => { e.stopPropagation(); onForceReextract(); }}
              title="Resultado veio do cache — clique para forçar nova extração com o modelo atualizado"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-50 transition-colors"
            >
              <RefreshCw size={10} /> Reextrair (cache)
            </button>
          )}
        </div>
      )}

      {/* ── Drag & drop overlay ── */}
      {dragOver && (
        <div className="absolute inset-0 bg-blue-50/95 border-2 border-dashed border-blue-400 rounded-xl flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <Upload size={20} className="text-blue-500 mx-auto mb-1" />
            <p className="text-sm font-semibold text-blue-600">Solte o arquivo aqui</p>
          </div>
        </div>
      )}
    </div>
  );
}

```

## components/AlertList.tsx

```tsx
import React from "react";

export type AlertSeverity = "CRÍTICO" | "RESTRITIVO" | "OBSERVAÇÃO";

export interface Alert {
  message: string;
  severity: AlertSeverity;
  impacto?: string;
}

const config: Record<AlertSeverity, {
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  badgeLabel: string;
  border: string;
  icon: React.ReactNode;
}> = {
  CRÍTICO: {
    iconBg: "#FEF0F0",
    badgeBg: "#FEE2E2",
    badgeText: "#A32D2D",
    badgeLabel: "CRÍTICO",
    border: "#FECACA",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L16.5 15H1.5L9 2Z" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 7.5V10.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="12.75" r="0.75" fill="#DC2626" />
      </svg>
    ),
  },
  RESTRITIVO: {
    iconBg: "#FFFBEB",
    badgeBg: "#FEF3C7",
    badgeText: "#854F0B",
    badgeLabel: "RESTRITIVO",
    border: "#FDE68A",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="#D97706" strokeWidth="1.5" />
        <path d="M9 5.5V9.5" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="12" r="0.75" fill="#D97706" />
      </svg>
    ),
  },
  OBSERVAÇÃO: {
    iconBg: "#EFF6FF",
    badgeBg: "#DBEAFE",
    badgeText: "#185FA5",
    badgeLabel: "OBSERVAÇÃO",
    border: "#BFDBFE",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="#2563EB" strokeWidth="1.5" />
        <path d="M9 8V13" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="5.75" r="0.75" fill="#2563EB" />
      </svg>
    ),
  },
};

interface AlertListProps {
  alerts: Alert[];
  className?: string;
}

export default function AlertList({ alerts, className = "" }: AlertListProps) {
  if (!alerts.length) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {alerts.map((alert, i) => {
        const c = config[alert.severity] ?? config.OBSERVAÇÃO;
        return (
          <div
            key={i}
            style={{ border: `0.5px solid ${c.border}`, background: "#ffffff" }}
            className="flex items-start gap-3 rounded-lg px-3 py-2.5"
          >
            {/* Ícone */}
            <div
              style={{ background: c.iconBg, minWidth: 32, minHeight: 32 }}
              className="flex items-center justify-center rounded-md flex-shrink-0"
            >
              {c.icon}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {/* Badge */}
                <span
                  style={{ background: c.badgeBg, color: c.badgeText }}
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none"
                >
                  {c.badgeLabel}
                </span>
              </div>
              <p className="text-[12px] font-medium text-[#111827] leading-snug">
                {alert.message}
              </p>
              {alert.impacto && (
                <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                  {alert.impacto}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

```

## components/ProgressBar.tsx

```tsx
// This component is no longer used — progress is shown in the hero strip of page.tsx
export default function ProgressBar() { return null; }

```

## components/WelcomeModal.tsx

```tsx
"use client";

import Logo from "@/components/Logo";

interface WelcomeModalProps {
  onClose: () => void;
}

const steps = [
  {
    icon: "01",
    title: "Envie os documentos",
    description: "Faca upload dos 4 documentos obrigatorios: Cartao CNPJ, QSA, Contrato Social e Faturamento. O SCR e consultado automaticamente via API.",
    color: "bg-cf-navy",
  },
  {
    icon: "02",
    title: "A IA extrai e analisa",
    description: "Nossa inteligencia artificial le cada documento e extrai automaticamente os dados relevantes para analise de credito.",
    color: "bg-cf-green",
  },
  {
    icon: "03",
    title: "Gere o relatorio",
    description: "Com um clique, gere o relatorio completo de due diligence em PDF, Word ou Excel para o comite de credito.",
    color: "bg-[#8b5cf6]",
  },
];

export default function WelcomeModal({ onClose }: WelcomeModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden animate-fade-in" style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.15)" }}>
        {/* Header */}
        <div className="bg-hero-gradient px-8 py-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          <div className="relative">
            <Logo light height={22} className="mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white">Bem-vindo a plataforma</h2>
            <p className="text-blue-200 text-sm mt-1">Veja como e simples analisar um cedente</p>
          </div>
        </div>

        {/* Steps */}
        <div className="px-8 py-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {steps.map((step) => (
              <div key={step.icon} className="text-center">
                <div className={`w-10 h-10 rounded-xl ${step.color} text-white text-sm font-bold flex items-center justify-center mx-auto mb-3`}>
                  {step.icon}
                </div>
                <h3 className="text-sm font-bold text-cf-text-1 mb-1">{step.title}</h3>
                <p className="text-[11px] text-cf-text-3 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onClose}
            className="btn-green w-full h-12 text-sm font-bold"
          >
            Comecar agora
          </button>
          <p className="text-center text-[11px] text-cf-text-4 mt-3">
            Voce pode acessar este tutorial novamente nas configuracoes
          </p>
        </div>
      </div>
    </div>
  );
}

```

## components/FirstCollectionChecklist.tsx

```tsx
"use client";

import { X, Check } from "lucide-react";

interface FirstCollectionChecklistProps {
  currentStep: 1 | 2 | 3;
  onDismiss: () => void;
}

const steps = [
  { id: 1, title: "Enviar documentos", description: "Faca upload dos PDFs da empresa" },
  { id: 2, title: "Revisar dados extraidos", description: "Confira o que a IA identificou" },
  { id: 3, title: "Gerar relatorio", description: "Exporte em PDF, Word ou Excel" },
];

export default function FirstCollectionChecklist({ currentStep, onDismiss }: FirstCollectionChecklistProps) {
  const progress = Math.max(0, currentStep - 1);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[280px] bg-white rounded-xl border border-cf-border shadow-lg animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-cf-bg border-b border-cf-border">
        <p className="text-xs font-bold text-cf-text-1">Sua primeira analise</p>
        <button onClick={onDismiss} className="w-5 h-5 rounded flex items-center justify-center text-cf-text-4 hover:text-cf-text-2 hover:bg-cf-surface transition-colors" style={{ minHeight: "auto" }}>
          <X size={12} />
        </button>
      </div>

      {/* Steps */}
      <div className="px-4 py-3 space-y-3">
        {steps.map(s => {
          const done = s.id < currentStep;
          const active = s.id === currentStep;

          return (
            <div key={s.id} className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {done ? (
                  <div className="w-5 h-5 rounded-full bg-cf-green flex items-center justify-center">
                    <Check size={10} className="text-white" strokeWidth={3} />
                  </div>
                ) : active ? (
                  <div className="w-5 h-5 rounded-full bg-cf-navy flex items-center justify-center animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-cf-border" />
                )}
              </div>

              {/* Text */}
              <div>
                <p className={`text-xs font-semibold leading-tight ${done ? "text-cf-green line-through" : active ? "text-cf-text-1" : "text-cf-text-4"}`}>
                  {s.title}
                </p>
                <p className={`text-[10px] leading-snug mt-0.5 ${active ? "text-cf-text-3" : "text-cf-text-4"}`}>
                  {s.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-cf-text-4">{progress}/3 concluido{progress !== 1 ? "s" : ""}</span>
        </div>
        <div className="h-1.5 bg-cf-border rounded-full overflow-hidden">
          <div
            className="h-full bg-cf-green rounded-full transition-all duration-500"
            style={{ width: `${(progress / 3) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

```

## components/GoalfyButton.tsx

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";

interface GoalfyButtonProps {
  data: any;
  aiAnalysis: any;
  settings: any;
  disabled?: boolean;
}

export default function GoalfyButton({ data, aiAnalysis, settings, disabled }: GoalfyButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleEnviar() {
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/goalfy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, aiAnalysis, settings }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus("success");
        setMessage(json.mock ? "Webhook não configurado" : "Enviado!");
      } else {
        setStatus("error");
        setMessage(json.error || "Erro ao enviar");
      }
    } catch {
      setStatus("error");
      setMessage("Erro de conexão");
    }
  }

  const icon =
    status === "loading" ? <Loader2 size={13} className="animate-spin" /> :
    status === "success" ? <CheckCircle2 size={13} /> :
    status === "error"   ? <AlertCircle size={13} /> :
                           <Send size={13} />;

  const label =
    status === "loading" ? "Enviando..." :
    status === "success" ? (message || "Enviado!") :
    status === "error"   ? "Tentar novamente" :
                           "Enviar ao Goalfy";

  const cls =
    status === "success" ? "text-green-600 border-green-200 hover:bg-green-50" :
    status === "error"   ? "text-red-500 border-red-200 hover:bg-red-50" :
                           "text-cf-text-2 border-cf-border hover:bg-cf-bg hover:text-cf-navy";

  return (
    <button
      onClick={handleEnviar}
      disabled={disabled || status === "loading" || status === "success"}
      title={status === "success" && message ? message : undefined}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-default ${cls}`}
      style={{ minHeight: "auto" }}
    >
      {icon}
      {label}
    </button>
  );
}

```

## components/review/SectionBalanco.tsx

```tsx
"use client";
import { Scale } from "lucide-react";
import { BalancoData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: BalancoData;
  set: (k: string, v: string) => void;
  setAno: (anoIdx: number, k: string, v: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

const BALANCO_CAMPOS = [
  { label: "Ativo Total", campo: "ativoTotal" },
  { label: "Ativo Circulante", campo: "ativoCirculante" },
  { label: "Ativo Não Circulante", campo: "ativoNaoCirculante" },
  { label: "Passivo Total", campo: "passivoTotal" },
  { label: "Passivo Circulante", campo: "passivoCirculante" },
  { label: "Passivo Não Circulante", campo: "passivoNaoCirculante" },
  { label: "Patrimônio Líquido", campo: "patrimonioLiquido" },
  { label: "Liquidez Corrente", campo: "liquidezCorrente" },
  { label: "Endividamento (%)", campo: "endividamentoTotal" },
  { label: "Capital de Giro Líq.", campo: "capitalDeGiroLiquido" },
];

export function SectionBalanco({ data, set, setAno, expanded, onToggle }: Props) {
  return (
    <SectionCard number="07" icon={<Scale size={16} className="text-cyan-600" />} title="Balanço Patrimonial"
      iconColor="bg-cyan-100" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-4">
        {data.anos.length > 0 && (
          <div>
            <span className="section-label block mb-2">Dados por Ano</span>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cf-bg">
                    <th className="text-left py-2 px-3 text-cf-text-3 font-medium">Indicador</th>
                    {data.anos.map(a => <th key={a.ano} className="text-right py-2 px-3 text-cf-text-3 font-medium">{a.ano}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {BALANCO_CAMPOS.map((linha, i) => (
                    <tr key={i} className="border-b border-cf-border/30 hover:bg-cf-bg/50">
                      <td className="py-1.5 px-3 text-cf-text-2 font-medium">{linha.label}</td>
                      {data.anos.map((a, anoIdx) => (
                        <td key={a.ano} className="py-1 px-2">
                          <input
                            value={(a as unknown as Record<string, string>)[linha.campo] || ""}
                            onChange={e => setAno(anoIdx, linha.campo, e.target.value)}
                            className="input-field py-1 text-xs text-right w-full"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="section-label block mb-1.5">Tendência do Patrimônio</label>
            <select value={data.tendenciaPatrimonio} onChange={e => set("tendenciaPatrimonio", e.target.value)} className="input-field">
              <option value="">—</option>
              <option value="crescimento">Crescimento</option>
              <option value="estavel">Estável</option>
              <option value="queda">Queda</option>
            </select>
          </div>
          <Field label="Período Mais Recente" value={data.periodoMaisRecente} onChange={v => set("periodoMaisRecente", v)} />
        </div>
        <Field label="Observações" value={data.observacoes} onChange={v => set("observacoes", v)} multiline span2 />
      </div>
    </SectionCard>
  );
}

```

## components/review/SectionCNPJ.tsx

```tsx
"use client";
// Building2 removed — icon no longer used in SectionCard
import { CNPJData } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult, qualityAccent } from "./shared";

interface Props {
  data: CNPJData;
  set: (k: keyof CNPJData, v: string) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionCNPJ({ data, set, expanded, onToggle, quality }: Props) {
  const pct = quality.pct;
  return (
    <SectionCard number="01" title="Identificação da Empresa — Cartão CNPJ"
      accentColor={qualityAccent(quality.score)} expanded={expanded} onToggle={onToggle}
      badge={<span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: quality.score === "good" ? "#dcfce7" : quality.score === "warning" ? "#fef9c3" : "#fee2e2", color: quality.score === "good" ? "#15803d" : quality.score === "warning" ? "#92400e" : "#991b1b" }}>{pct}%</span>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Razão Social" value={data.razaoSocial} onChange={v => set("razaoSocial", v)} span2 />
        <Field label="Nome Fantasia" value={data.nomeFantasia} onChange={v => set("nomeFantasia", v)} />
        <Field label="CNPJ" value={data.cnpj} onChange={v => set("cnpj", v)} />
        <Field label="Data de Abertura" value={data.dataAbertura} onChange={v => set("dataAbertura", v)} />
        <Field label="Situação Cadastral" value={data.situacaoCadastral} onChange={v => set("situacaoCadastral", v)} />
        <Field label="Data da Situação" value={data.dataSituacaoCadastral} onChange={v => set("dataSituacaoCadastral", v)} />
        <Field label="Motivo da Situação" value={data.motivoSituacao} onChange={v => set("motivoSituacao", v)} />
        <Field label="Natureza Jurídica" value={data.naturezaJuridica} onChange={v => set("naturezaJuridica", v)} span2 />
        <Field label="CNAE Principal" value={data.cnaePrincipal} onChange={v => set("cnaePrincipal", v)} span2 />
        <Field label="CNAEs Secundários" value={data.cnaeSecundarios} onChange={v => set("cnaeSecundarios", v)} multiline span2 />
        <Field label="Porte" value={data.porte} onChange={v => set("porte", v)} />
        <Field label="Capital Social (CNPJ)" value={data.capitalSocialCNPJ} onChange={v => set("capitalSocialCNPJ", v)} />
        <Field label="Endereço Completo" value={data.endereco} onChange={v => set("endereco", v)} span2 />
        <Field label="Telefone" value={data.telefone} onChange={v => set("telefone", v)} />
        <Field label="E-mail" value={data.email} onChange={v => set("email", v)} />
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}

```

## components/review/SectionContrato.tsx

```tsx
"use client";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { ContratoSocialData, Socio } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult, qualityAccent } from "./shared";

interface Props {
  data: ContratoSocialData;
  set: (k: keyof ContratoSocialData, v: string | boolean) => void;
  setSocio: (i: number, k: keyof Socio, v: string) => void;
  addSocio: () => void;
  removeSocio: (i: number) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionContrato({ data, set, setSocio, addSocio, removeSocio, expanded, onToggle, quality }: Props) {
  const accent = data.temAlteracoes ? "#d97706" : qualityAccent(quality.score);

  return (
    <SectionCard
      number="03"
      title="Contrato Social"
      accentColor={accent}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        data.temAlteracoes ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#92400e", background: "#fef9c3", border: "1px solid #fde68a", padding: "2px 8px", borderRadius: "99px" }}>
            <AlertTriangle size={9} /> Alterações
          </span>
        ) : (
          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: quality.score === "good" ? "#dcfce7" : quality.score === "warning" ? "#fef9c3" : "#fee2e2", color: quality.score === "good" ? "#15803d" : quality.score === "warning" ? "#92400e" : "#991b1b" }}>
            {quality.pct}%
          </span>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Sócios */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6B7280" }}>Sócios no Contrato</span>
            <button
              onClick={addSocio}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#203b88", background: "white", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#203b88"; (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "white"; }}
            >
              <Plus size={12} /> Adicionar
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.socios.map((s, i) => {
              const initial = s.nome ? s.nome.trim().charAt(0).toUpperCase() : String(i + 1);
              const hasCPF = s.cpf && s.cpf.trim();
              return (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: "12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: "12px", padding: "14px" }}
                >
                  {/* Avatar */}
                  <div style={{ width: "40px", height: "40px", borderRadius: "99px", background: "linear-gradient(135deg, #5a9010 0%, #73b815 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "white", fontSize: "15px", fontWeight: 700 }}>
                    {initial}
                  </div>

                  {/* Campos */}
                  <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <input
                        value={s.nome}
                        onChange={e => setSocio(i, "nome", e.target.value)}
                        placeholder="Nome completo"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "13px", fontWeight: 600, border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                    </div>
                    <div>
                      <input
                        value={s.cpf}
                        onChange={e => setSocio(i, "cpf", e.target.value)}
                        placeholder="CPF"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: `1px solid ${hasCPF ? "#E5E7EB" : "#fcd34d"}`, background: hasCPF ? "white" : "#fffbeb", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = hasCPF ? "#E5E7EB" : "#fcd34d"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      {!hasCPF && (
                        <p style={{ fontSize: "10px", color: "#d97706", marginTop: "3px", display: "flex", alignItems: "center", gap: "3px" }}>
                          <AlertTriangle size={9} /> CPF ausente
                        </p>
                      )}
                    </div>
                    <input
                      value={s.qualificacao}
                      onChange={e => setSocio(i, "qualificacao", e.target.value)}
                      placeholder="Qualificação"
                      style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                    <input
                      value={s.participacao}
                      onChange={e => setSocio(i, "participacao", e.target.value)}
                      placeholder="Participação %"
                      style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  </div>

                  {/* Remover */}
                  <button
                    onClick={() => removeSocio(i)}
                    style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #E5E7EB", borderRadius: "8px", cursor: "pointer", color: "#9CA3AF", flexShrink: 0, transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#dc2626"; (e.currentTarget as HTMLElement).style.borderColor = "#fca5a5"; (e.currentTarget as HTMLElement).style.background = "#fef2f2"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "white"; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Campos gerais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Capital Social" value={data.capitalSocial} onChange={v => set("capitalSocial", v)} />
          <Field label="Data de Constituição" value={data.dataConstituicao} onChange={v => set("dataConstituicao", v)} />
          <Field label="Prazo de Duração" value={data.prazoDuracao} onChange={v => set("prazoDuracao", v)} />
          <Field label="Foro" value={data.foro} onChange={v => set("foro", v)} />
          <Field label="Objeto Social" value={data.objetoSocial} onChange={v => set("objetoSocial", v)} multiline span2 />
          <Field label="Administração e Poderes" value={data.administracao} onChange={v => set("administracao", v)} multiline span2 />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={data.temAlteracoes} onChange={e => set("temAlteracoes", e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "#d97706", cursor: "pointer" }} />
          <span style={{ fontSize: "13px", color: "#374151", display: "flex", alignItems: "center", gap: "6px" }}>
            <AlertTriangle size={13} color="#d97706" /> Alterações societárias recentes
          </span>
        </label>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}

```

## components/review/SectionCurvaABC.tsx

```tsx
"use client";
import { PieChart, Plus, Trash2, AlertTriangle } from "lucide-react";
import { CurvaABCData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: CurvaABCData;
  setField: (k: string, v: string | number | boolean) => void;
  setCliente: (idx: number, k: string, v: string) => void;
  addCliente: () => void;
  removeCliente: (idx: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionCurvaABC({ data, setField, setCliente, addCliente, removeCliente, expanded, onToggle }: Props) {
  return (
    <SectionCard number="08" icon={<PieChart size={16} className="text-orange-600" />} title="Curva ABC — Carteira de Clientes"
      iconColor="bg-orange-100" expanded={expanded} onToggle={onToggle}
      badge={data.alertaConcentracao ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertTriangle size={10} /> Concentração</span> : undefined}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Período de Referência" value={data.periodoReferencia} onChange={v => setField("periodoReferencia", v)} />
          <Field label="Total Clientes na Base" value={String(data.totalClientesNaBase || "")} onChange={v => setField("totalClientesNaBase", Number(v) || v)} />
          <Field label="Concentração Top 3 (%)" value={data.concentracaoTop3} onChange={v => setField("concentracaoTop3", v)} />
          <Field label="Concentração Top 5 (%)" value={data.concentracaoTop5} onChange={v => setField("concentracaoTop5", v)} />
          <Field label="Maior Cliente" value={data.maiorCliente} onChange={v => setField("maiorCliente", v)} />
          <Field label="Maior Cliente (%)" value={data.maiorClientePct} onChange={v => setField("maiorClientePct", v)} />
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none group">
          <input type="checkbox" checked={data.alertaConcentracao} onChange={e => setField("alertaConcentracao", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
          <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-red-500" /> Alerta de concentração
          </span>
        </label>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Clientes</span>
            <button onClick={addCliente} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
              <Plus size={12} /> Adicionar cliente
            </button>
          </div>
          {data.clientes.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="hidden sm:grid grid-cols-[40px_1fr_100px_100px_80px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["#","Nome","Faturado","% Receita","Segmento",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.clientes.map((c, i) => (
                <div key={i} className={`hidden sm:grid grid-cols-[40px_1fr_100px_100px_80px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <span className="text-xs font-bold text-cf-text-3 text-center">{c.posicao || i + 1}</span>
                  <input value={c.nome} onChange={e => setCliente(i, "nome", e.target.value)} placeholder="Nome do cliente" className="input-field py-1.5 text-xs" />
                  <input value={c.valorFaturado} onChange={e => setCliente(i, "valorFaturado", e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={c.percentualReceita} onChange={e => setCliente(i, "percentualReceita", e.target.value)} placeholder="0%" className="input-field py-1.5 text-xs" />
                  <input value={c.classe} onChange={e => setCliente(i, "classe", e.target.value)} placeholder="A/B/C" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeCliente(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="sm:hidden divide-y divide-cf-border">
                {data.clientes.map((c, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-cf-text-3 uppercase">#{c.posicao || i + 1}</span>
                      <button onClick={() => removeCliente(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg"><Trash2 size={12} /></button>
                    </div>
                    <input value={c.nome} onChange={e => setCliente(i, "nome", e.target.value)} placeholder="Nome" className="input-field py-2 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={c.valorFaturado} onChange={e => setCliente(i, "valorFaturado", e.target.value)} placeholder="Faturado" className="input-field py-2 text-sm" />
                      <input value={c.percentualReceita} onChange={e => setCliente(i, "percentualReceita", e.target.value)} placeholder="% Receita" className="input-field py-2 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhum cliente extraído. Clique em &ldquo;Adicionar cliente&rdquo; para inserir manualmente.</div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

```

## components/review/SectionDRE.tsx

```tsx
"use client";
import { LineChart } from "lucide-react";
import { DREData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: DREData;
  set: (k: string, v: string) => void;
  setAno: (anoIdx: number, k: string, v: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

const DRE_CAMPOS = [
  { label: "Receita Bruta", campo: "receitaBruta" },
  { label: "Receita Líquida", campo: "receitaLiquida" },
  { label: "Lucro Bruto", campo: "lucroBruto" },
  { label: "Margem Bruta (%)", campo: "margemBruta" },
  { label: "EBITDA", campo: "ebitda" },
  { label: "Margem EBITDA (%)", campo: "margemEbitda" },
  { label: "Lucro Líquido", campo: "lucroLiquido" },
  { label: "Margem Líquida (%)", campo: "margemLiquida" },
];

export function SectionDRE({ data, set, setAno, expanded, onToggle }: Props) {
  return (
    <SectionCard number="06" icon={<LineChart size={16} className="text-violet-600" />} title="DRE — Demonstração de Resultado"
      iconColor="bg-violet-100" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-4">
        {data.anos.length > 0 && (
          <div>
            <span className="section-label block mb-2">Dados por Ano</span>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cf-bg">
                    <th className="text-left py-2 px-3 text-cf-text-3 font-medium">Indicador</th>
                    {data.anos.map(a => <th key={a.ano} className="text-right py-2 px-3 text-cf-text-3 font-medium">{a.ano}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DRE_CAMPOS.map((linha, i) => (
                    <tr key={i} className="border-b border-cf-border/30 hover:bg-cf-bg/50">
                      <td className="py-1.5 px-3 text-cf-text-2 font-medium">{linha.label}</td>
                      {data.anos.map((a, anoIdx) => (
                        <td key={a.ano} className="py-1 px-2">
                          <input
                            value={(a as unknown as Record<string, string>)[linha.campo] || ""}
                            onChange={e => setAno(anoIdx, linha.campo, e.target.value)}
                            className="input-field py-1 text-xs text-right w-full"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Crescimento da Receita (%)" value={data.crescimentoReceita} onChange={v => set("crescimentoReceita", v)} />
          <div>
            <label className="section-label block mb-1.5">Tendência do Lucro</label>
            <select value={data.tendenciaLucro} onChange={e => set("tendenciaLucro", e.target.value)} className="input-field">
              <option value="">—</option>
              <option value="crescimento">Crescimento</option>
              <option value="estavel">Estável</option>
              <option value="queda">Queda</option>
            </select>
          </div>
          <Field label="Período Mais Recente" value={data.periodoMaisRecente} onChange={v => set("periodoMaisRecente", v)} />
        </div>
        <Field label="Observações" value={data.observacoes} onChange={v => set("observacoes", v)} multiline span2 />
      </div>
    </SectionCard>
  );
}

```

## components/review/SectionFaturamento.tsx

```tsx
"use client";
import { Plus, Trash2, AlertCircle, AlertTriangle } from "lucide-react";
import { FaturamentoData, FaturamentoMensal } from "@/types";
import { QualityBadge, SectionCard, QualityResult, qualityAccent } from "./shared";

interface Props {
  data: FaturamentoData;
  setMes: (i: number, k: keyof FaturamentoMensal, v: string) => void;
  addMes: () => void;
  removeMes: (i: number) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionFaturamento({ data, setMes, addMes, removeMes, expanded, onToggle, quality }: Props) {
  // Recomputa dos meses reais — não confia no flag armazenado (default é true)
  const parseFatVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const fatZeradoReal = (data.meses?.length ?? 0) > 0 && data.meses!.every(m => parseFatVal(m.valor) === 0);

  return (
    <SectionCard number="04" title="Faturamento"
      accentColor={qualityAccent(quality.score)} expanded={expanded} onToggle={onToggle}
      badge={<div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: quality.score === "good" ? "#dcfce7" : quality.score === "warning" ? "#fef9c3" : "#fee2e2", color: quality.score === "good" ? "#15803d" : quality.score === "warning" ? "#92400e" : "#991b1b" }}>{quality.pct}%</span>
        {fatZeradoReal
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 700, color: "#991b1b", background: "#fee2e2", padding: "2px 7px", borderRadius: "99px" }}><AlertCircle size={9} /> Zerado</span>
          : !data.dadosAtualizados
            ? <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 700, color: "#92400e", background: "#fef9c3", padding: "2px 7px", borderRadius: "99px" }}><AlertTriangle size={9} /> Desatualizado</span>
            : null}
      </div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">FMM 12M (R$)</p>
            <p className="text-[15px] font-bold text-cf-navy mt-1">{data.fmm12m ? `R$ ${data.fmm12m}` : data.mediaAno ? `R$ ${data.mediaAno}` : "—"}</p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">Base de crédito</p>
          </div>
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">FMM Médio (R$)</p>
            <p className="text-[15px] font-bold text-cf-navy mt-1">{data.fmmMedio ? `R$ ${data.fmmMedio}` : "—"}</p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">Média anos completos</p>
          </div>
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Tendência</p>
            <p className={`text-[15px] font-bold mt-1 ${data.tendencia === "crescimento" ? "text-green-600" : data.tendencia === "queda" ? "text-red-600" : "text-cf-text-2"}`}>
              {data.tendencia === "crescimento" ? "↑ Crescimento" : data.tendencia === "queda" ? "↓ Queda" : data.tendencia === "estavel" ? "→ Estável" : "—"}
            </p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">vs. FMM 12M</p>
          </div>
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Último Mês</p>
            <p className="text-[15px] font-bold text-cf-navy mt-1">{data.ultimoMesComDados || "—"}</p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">Com dados</p>
          </div>
        </div>
        {data.fmmAnual && Object.keys(data.fmmAnual).length > 0 && (
          <div className="bg-cf-surface/60 rounded-lg px-3 py-2 border border-cf-border text-xs text-cf-text-2 flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(data.fmmAnual).sort(([a], [b]) => Number(a) - Number(b)).map(([ano, val]) => {
              const qtd = (data.meses || []).filter(m => (m.mes || "").endsWith(`/${ano}`)).length;
              return <span key={ano}><span className="font-semibold text-cf-navy">FMM {ano}:</span> R$ {val} <span className="text-cf-text-4">({qtd} {qtd === 1 ? "mês" : "meses"})</span></span>;
            })}
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Faturamento Mensal</span>
            <button onClick={addMes} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
              <Plus size={12} /> Adicionar mês
            </button>
          </div>
          {data.meses.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="grid grid-cols-[88px_1fr_32px] sm:grid-cols-[120px_1fr_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Mês","Valor (R$)",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.meses.map((m, i) => (
                <div key={i} className={`grid grid-cols-[88px_1fr_32px] sm:grid-cols-[120px_1fr_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={m.mes} onChange={e => setMes(i,"mes",e.target.value)} placeholder="MM/YYYY" className="input-field py-1.5 text-xs" />
                  <input value={m.valor} onChange={e => setMes(i,"valor",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeMes(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">
              Nenhum dado de faturamento extraído. Clique em &ldquo;Adicionar mês&rdquo; para inserir manualmente.
            </div>
          )}
        </div>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}

```

## components/review/SectionGrupoEconomico.tsx

```tsx
"use client";
import { GrupoEconomicoData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: GrupoEconomicoData;
  expanded: boolean;
  onToggle: () => void;
}

function parseNum(v: string | undefined | null): number {
  if (!v) return 0;
  return parseFloat(String(v).replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
}

export function SectionGrupoEconomico({ data, expanded, onToggle }: Props) {
  const empresas = data.empresas || [];
  const hasEmpresas = empresas.length > 0;
  const alertaParentesco = data.alertaParentesco;
  const parentescos = data.parentescosDetectados || [];
  const sociosKyc = data.sociosKyc || [];

  const totalSCR = empresas.reduce((acc, e) => acc + parseNum(e.scrTotal), 0);
  const empresasAtivas = empresas.filter(e => !e.situacao || e.situacao === "ATIVA");

  return (
    <SectionCard
      number="08"
      title="Grupo Econômico"
      accentColor={alertaParentesco ? "#d97706" : hasEmpresas ? "#3b82f6" : "#9CA3AF"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: hasEmpresas ? "#dbeafe" : "#f3f4f6",
          color: hasEmpresas ? "#1e40af" : "#6b7280",
        }}>
          {hasEmpresas ? `${empresas.length} empresa${empresas.length !== 1 ? "s" : ""}` : "sem dados"}
        </span>
      }
    >
      {/* Alerta parentesco */}
      {alertaParentesco && parentescos.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#d97706", fontSize: "14px", flexShrink: 0 }}>⚠</span>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 700, color: "#92400e" }}>Possível parentesco entre sócios detectado</p>
            {parentescos.map((p, i) => (
              <p key={i} style={{ margin: "2px 0 0", fontSize: "11px", color: "#b45309" }}>
                {p.socio1} × {p.socio2} — sobrenome: <strong>{p.sobrenomeComum}</strong>
              </p>
            ))}
          </div>
        </div>
      )}

      {!hasEmpresas && (
        <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "8px", border: "1px dashed #D1D5DB", marginBottom: "16px" }}>
          <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>Nenhuma empresa vinculada encontrada no grupo econômico.</p>
        </div>
      )}

      {/* Resumo do grupo */}
      {hasEmpresas && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
          <ResumoCard label="Empresas no grupo" value={String(empresas.length)} />
          <ResumoCard label="Ativas" value={String(empresasAtivas.length)} />
          <ResumoCard label="SCR Total Grupo" value={totalSCR > 0 ? `R$ ${totalSCR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} />
        </div>
      )}

      {/* Tabela de empresas */}
      {hasEmpresas && (
        <div style={{ marginBottom: sociosKyc.length > 0 ? "20px" : "0" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Empresas Vinculadas
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Razão Social", "CNPJ", "Relação", "Sócio Origem", "SCR Total", "Protestos", "Processos", "Situação"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 4 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresas.map((e, i) => {
                  const baixada = e.situacao && e.situacao !== "ATIVA";
                  const temDivida = parseNum(e.scrTotal) > 0;
                  const temProtesto = parseInt(e.protestos || "0", 10) > 0;
                  const temProcesso = parseInt(e.processos || "0", 10) > 0;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #F3F4F6", opacity: baixada ? 0.6 : 1 }}>
                      <td style={{ padding: "8px 10px", color: "#111827", fontWeight: 600, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.razaoSocial}>{e.razaoSocial || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#6B7280", fontFamily: "ui-monospace, monospace", fontSize: "11px", whiteSpace: "nowrap" }}>{e.cnpj || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#374151", whiteSpace: "nowrap" }}>{e.relacao || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#374151", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.socioOrigem}>
                        {e.socioOrigem || "—"}
                        {e.participacao && <span style={{ fontSize: "10px", color: "#9CA3AF", marginLeft: "4px" }}>({e.participacao})</span>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: temDivida ? "#dc2626" : "#6B7280", fontWeight: temDivida ? 700 : 400, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {e.scrTotal && e.scrTotal !== "0" && e.scrTotal !== "0,00" ? e.scrTotal : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: temProtesto ? "#dc2626" : "#6B7280", fontWeight: temProtesto ? 700 : 400 }}>
                        {e.protestos || "0"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: temProcesso ? "#d97706" : "#6B7280", fontWeight: temProcesso ? 700 : 400 }}>
                        {e.processos || "0"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px",
                          background: baixada ? "#f3f4f6" : "#dcfce7",
                          color: baixada ? "#6b7280" : "#15803d",
                        }}>
                          {e.situacao || "ATIVA"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KYC dos sócios (Credit Hub) */}
      {sociosKyc.length > 0 && (
        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            KYC dos Sócios (Credit Hub)
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["CPF", "Processos Total", "Polo Ativo", "Polo Passivo", "Valor Processos", "Protestos"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "right", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sociosKyc.map((s, i) => {
                  const maskCpf = (cpf: string) => {
                    const d = cpf.replace(/\D/g, "");
                    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf;
                  };
                  const temProblema = (s.processosTotal || 0) > 0 || (s.protestosQtd || 0) > 0;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #F3F4F6", background: temProblema ? "#fffbeb" : "transparent" }}>
                      <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace" }}>{maskCpf(s.cpf)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: (s.processosTotal || 0) > 0 ? "#d97706" : "#6B7280", fontWeight: (s.processosTotal || 0) > 0 ? 700 : 400 }}>{s.processosTotal ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280" }}>{s.processosAtivo ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: (s.processosPassivo || 0) > 0 ? "#dc2626" : "#6B7280", fontWeight: (s.processosPassivo || 0) > 0 ? 700 : 400 }}>{s.processosPassivo ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#374151", fontVariantNumeric: "tabular-nums" }}>{s.processosValorTotal || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: (s.protestosQtd || 0) > 0 ? "#dc2626" : "#6B7280", fontWeight: (s.protestosQtd || 0) > 0 ? 700 : 400 }}>{s.protestosQtd ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ResumoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}

```

## components/review/SectionIRSocios.tsx

```tsx
"use client";
import { FileKey, Plus, Trash2 } from "lucide-react";
import { IRSocioData } from "@/types";
import { Field, SectionCard } from "./shared";

const IR_VAZIO: Omit<IRSocioData, "impostoDefinido" | "valorQuota"> = {
  nomeSocio: "", cpf: "", anoBase: "", tipoDocumento: "recibo", numeroRecibo: "", dataEntrega: "",
  situacaoMalhas: false, debitosEmAberto: false, descricaoDebitos: "",
  rendimentosTributaveis: "", rendimentosIsentos: "", rendimentoTotal: "",
  bensImoveis: "", bensVeiculos: "", aplicacoesFinanceiras: "", outrosBens: "",
  totalBensDireitos: "", dividasOnus: "", patrimonioLiquido: "",
  impostoPago: "", impostoRestituir: "", temSociedades: false, sociedades: [],
  coerenciaComEmpresa: true, observacoes: "",
};

interface Props {
  data: IRSocioData[];
  set: (idx: number, k: keyof IRSocioData, v: string | boolean) => void;
  add: () => void;
  remove: (idx: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionIRSocios({ data, set, add, remove, expanded, onToggle }: Props) {
  return (
    <SectionCard number="09" icon={<FileKey size={16} className="text-teal-600" />} title="IR dos Sócios"
      iconColor="bg-teal-100" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-6">
        {data.length === 0 && (
          <p className="text-xs text-cf-text-3 text-center py-3">Nenhum IR de sócio carregado. Adicione manualmente abaixo.</p>
        )}
        <button onClick={add} className="btn-secondary w-full flex items-center justify-center gap-2 text-xs py-2">
          <Plus size={13} /> Adicionar Sócio
        </button>
        {data.map((socio, idx) => (
          <div key={idx} className="border border-cf-border rounded-xl overflow-hidden">
            <div className="bg-cf-surface px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-cf-text-1 uppercase tracking-wide">{socio.nomeSocio || `Sócio ${idx + 1}`}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-cf-text-3">Ano-base: {socio.anoBase || "—"}</span>
                <button onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome do Sócio" value={socio.nomeSocio} onChange={v => set(idx, "nomeSocio", v)} />
              <Field label="CPF" value={socio.cpf} onChange={v => set(idx, "cpf", v)} />
              <Field label="Ano-Base" value={socio.anoBase} onChange={v => set(idx, "anoBase", v)} />
              <div>
                <label className="section-label block mb-1.5">Tipo de Documento</label>
                <select value={socio.tipoDocumento || ""} onChange={e => set(idx, "tipoDocumento", e.target.value)} className="input-field">
                  <option value="">—</option>
                  <option value="recibo">Recibo de Entrega</option>
                  <option value="declaracao">Declaração Completa</option>
                </select>
              </div>
              {socio.tipoDocumento === "recibo" && (
                <Field label="Número do Recibo" value={socio.numeroRecibo || ""} onChange={v => set(idx, "numeroRecibo", v)} />
              )}
              <Field label="Rendimento Total (R$)" value={socio.rendimentoTotal} onChange={v => set(idx, "rendimentoTotal", v)} />
              <Field label="Total Bens e Direitos (R$)" value={socio.totalBensDireitos} onChange={v => set(idx, "totalBensDireitos", v)} />
              <Field label="Dívidas e Ônus (R$)" value={socio.dividasOnus} onChange={v => set(idx, "dividasOnus", v)} />
              <Field label="Patrimônio Líquido (R$)" value={socio.patrimonioLiquido} onChange={v => set(idx, "patrimonioLiquido", v)} />
              <div className="col-span-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input type="checkbox" checked={!!socio.situacaoMalhas} onChange={e => set(idx, "situacaoMalhas", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                  <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors">Em malha fina</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input type="checkbox" checked={!!socio.debitosEmAberto} onChange={e => set(idx, "debitosEmAberto", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                  <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors">Débitos em aberto</span>
                </label>
              </div>
              {socio.debitosEmAberto && (
                <Field label="Descrição dos Débitos" value={socio.descricaoDebitos || ""} onChange={v => set(idx, "descricaoDebitos", v)} multiline span2 />
              )}
              <Field label="Observações" value={socio.observacoes} onChange={v => set(idx, "observacoes", v)} multiline span2 />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export { IR_VAZIO };

```

## components/review/SectionProcessos.tsx

```tsx
"use client";
import { ProcessosData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: ProcessosData;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionProcessos({ data, expanded, onToggle }: Props) {
  const passivos = parseInt(data.passivosTotal || "0", 10);
  const ativos = parseInt(data.ativosTotal || "0", 10);
  const temRJ = data.temRJ;
  const temFalencia = data.temFalencia;
  const hasProcessos = passivos > 0;
  const temDistribuicao = data.distribuicao && data.distribuicao.length > 0;
  const temBancarios = data.bancarios && data.bancarios.length > 0;
  const temFiscais = data.fiscais && data.fiscais.length > 0;
  const temFornecedores = data.fornecedores && data.fornecedores.length > 0;
  const temOutros = data.outros && data.outros.length > 0;

  const accentColor = temRJ || temFalencia ? "#7c3aed" : passivos > 5 ? "#dc2626" : passivos > 0 ? "#d97706" : "#16a34a";

  return (
    <SectionCard
      number="07"
      title="Processos Judiciais"
      accentColor={accentColor}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: passivos > 0 ? "#fef3c7" : "#dcfce7",
          color: passivos > 0 ? "#92400e" : "#15803d",
        }}>
          {passivos > 0 ? `${passivos} processo${passivos !== 1 ? "s" : ""}` : "sem processos"}
        </span>
      }
    >
      {/* Alertas RJ / Falência */}
      {(temRJ || temFalencia) && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#7c3aed", fontSize: "14px", flexShrink: 0 }}>⚠</span>
          <div>
            {temRJ && <p style={{ margin: "0 0 2px", fontSize: "12px", fontWeight: 700, color: "#6d28d9" }}>Recuperação Judicial identificada</p>}
            {temFalencia && <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#6d28d9" }}>Pedido de Falência identificado</p>}
          </div>
        </div>
      )}

      {!hasProcessos && !temRJ && !temFalencia && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#16a34a", fontSize: "14px", flexShrink: 0 }}>✓</span>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#15803d" }}>Nenhum processo judicial encontrado</p>
        </div>
      )}

      {/* Cards resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px" }}>
        <SummaryCard label="Total Passivos" value={data.passivosTotal || "0"} danger={passivos > 0} />
        <SummaryCard label="Em Andamento" value={data.ativosTotal || "0"} danger={ativos > 0} />
        <SummaryCard label="Valor Estimado" value={data.valorTotalEstimado || "—"} />
        {data.poloPassivoQtd && <SummaryCard label="Polo Passivo (réu)" value={data.poloPassivoQtd} danger />}
        {data.poloAtivoQtd && <SummaryCard label="Polo Ativo (autor)" value={data.poloAtivoQtd} />}
        {data.arquivadosQtd && <SummaryCard label="Arquivados" value={data.arquivadosQtd} muted />}
      </div>

      {/* Distribuição por tipo */}
      {temDistribuicao && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Distribuição por Tipo
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Tipo", "Qtd", "%"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i === 0 ? "left" : "right", fontSize: "11px", fontWeight: 600, color: "#6B7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.distribuicao.map((d, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", color: "#374151", fontWeight: 500 }}>{d.tipo}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#111827", fontWeight: 600 }}>{d.qtd}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#6B7280" }}>{d.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bancários */}
      {temBancarios && (
        <ProcessoTable
          title={`Bancários (${data.bancarios.length})`}
          colunas={["Banco", "Assunto", "Data", "Valor", "Status"]}
          rows={data.bancarios.map(b => [b.banco, b.assunto, b.data, b.valor, b.status])}
        />
      )}

      {/* Fiscais */}
      {temFiscais && (
        <ProcessoTable
          title={`Fiscais (${data.fiscais.length})`}
          colunas={["Contraparte", "Data", "Valor", "Status"]}
          rows={data.fiscais.map(f => [f.contraparte, f.data, f.valor, f.status])}
        />
      )}

      {/* Fornecedores */}
      {temFornecedores && (
        <ProcessoTable
          title={`Fornecedores (${data.fornecedores.length})`}
          colunas={["Contraparte", "Assunto", "Data", "Valor", "Status"]}
          rows={data.fornecedores.map(f => [f.contraparte, f.assunto, f.data, f.valor, f.status])}
        />
      )}

      {/* Outros */}
      {temOutros && (
        <ProcessoTable
          title={`Outros (${data.outros.length})`}
          colunas={["Contraparte", "Assunto", "Data", "Valor", "Status"]}
          rows={data.outros.map(o => [o.contraparte, o.assunto, o.data, o.valor, o.status])}
        />
      )}

      {/* Top 10 por valor */}
      {data.top10Valor && data.top10Valor.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Top 10 por Valor
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "640px", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Número", "Tipo", "Assunto", "Data", "Valor", "Status"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 3 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.top10Valor.map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 10px", color: "#6B7280", fontSize: "11px", fontFamily: "monospace" }}>{p.numero || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151" }}>{p.tipo || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.assunto}>{p.assunto || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280", whiteSpace: "nowrap" }}>{p.data || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#111827", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.valor || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "99px", background: "#F3F4F6", color: "#374151" }}>{p.status || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function SummaryCard({ label, value, danger, muted }: { label: string; value: string; danger?: boolean; muted?: boolean }) {
  const isZero = value === "0" || value === "0,00" || value === "—";
  const isHighlight = danger && !isZero;
  return (
    <div style={{
      padding: "12px 14px", borderRadius: "8px",
      background: isHighlight ? "#fef3c7" : "#F9FAFB",
      border: `1px solid ${isHighlight ? "#fde68a" : "#E5E7EB"}`,
    }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: isHighlight ? "#92400e" : muted ? "#9CA3AF" : "#111827", fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}

function ProcessoTable({ title, colunas, rows }: { title: string; colunas: string[]; rows: (string | undefined)[][] }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>{title}</p>
      <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB" }}>
              {colunas.map((h, i) => (
                <th key={i} style={{ padding: "7px 10px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: "7px 10px", color: j === 0 ? "#111827" : "#374151", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cell}>{cell || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

```

## components/review/SectionProtestos.tsx

```tsx
"use client";
import { ProtestosData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: ProtestosData;
  expanded: boolean;
  onToggle: () => void;
}

function fmtVal(v: string | undefined) {
  return v && v !== "0" && v !== "0,00" ? v : "R$ 0,00";
}

export function SectionProtestos({ data, expanded, onToggle }: Props) {
  const vigQtd = parseInt(data.vigentesQtd || "0", 10);
  const regQtd = parseInt(data.regularizadosQtd || "0", 10);
  const fiscQtd = parseInt(data.fiscaisQtd || "0", 10);
  const total = vigQtd + regQtd;
  const hasProtestos = total > 0;
  const temDetalhe = data.detalhes && data.detalhes.length > 0;

  return (
    <SectionCard
      number="06"
      title="Protestos"
      accentColor={vigQtd > 0 ? "#dc2626" : "#16a34a"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: vigQtd > 0 ? "#fee2e2" : "#dcfce7",
          color: vigQtd > 0 ? "#991b1b" : "#15803d",
        }}>
          {vigQtd > 0 ? `${vigQtd} vigente${vigQtd !== 1 ? "s" : ""}` : "sem protestos"}
        </span>
      }
    >
      {/* Alerta de protestos vigentes */}
      {vigQtd > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#dc2626", fontSize: "14px", flexShrink: 0 }}>⚠</span>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#991b1b" }}>
            {vigQtd} protesto{vigQtd !== 1 ? "s" : ""} vigente{vigQtd !== 1 ? "s" : ""} — total{" "}
            {fmtVal(data.vigentesValor)}
            {fiscQtd > 0 && ` (${fiscQtd} fiscal${fiscQtd !== 1 ? "is" : ""})`}
          </p>
        </div>
      )}

      {!hasProtestos && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#16a34a", fontSize: "14px", flexShrink: 0 }}>✓</span>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#15803d" }}>Nenhum protesto encontrado</p>
        </div>
      )}

      {/* Resumo em cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: temDetalhe ? "20px" : "0" }}>
        <MetricCard label="Vigentes" qtd={vigQtd} valor={data.vigentesValor} danger={vigQtd > 0} />
        <MetricCard label="Regularizados" qtd={regQtd} valor={data.regularizadosValor} />
        {fiscQtd > 0 && (
          <MetricCard label="Fiscais (subconjunto)" qtd={fiscQtd} valor={data.fiscaisValor} danger />
        )}
      </div>

      {/* Tabela de detalhes */}
      {temDetalhe && (
        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Detalhamento ({data.detalhes.length} registro{data.detalhes.length !== 1 ? "s" : ""})
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "640px", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Data", "Credor", "Valor", "Espécie", "Município/UF", "Status"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 2 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.detalhes.map((d, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6", background: d.regularizado ? "#f0fdf4" : "white" }}>
                    <td style={{ padding: "8px 10px", color: "#374151", whiteSpace: "nowrap" }}>{d.data || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#111827", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.credor}>{d.credor || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: d.regularizado ? "#15803d" : "#991b1b", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{d.valor || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280", whiteSpace: "nowrap" }}>{d.especie || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280", whiteSpace: "nowrap" }}>
                      {[d.municipio, d.uf].filter(Boolean).join("/") || "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{
                        fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px",
                        background: d.regularizado ? "#dcfce7" : "#fee2e2",
                        color: d.regularizado ? "#15803d" : "#991b1b",
                      }}>
                        {d.regularizado ? "Regularizado" : "Vigente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function MetricCard({ label, qtd, valor, danger }: { label: string; qtd: number; valor?: string; danger?: boolean }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: "8px",
      background: danger && qtd > 0 ? "#fef2f2" : "#F9FAFB",
      border: `1px solid ${danger && qtd > 0 ? "#fecaca" : "#E5E7EB"}`,
    }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: danger && qtd > 0 ? "#991b1b" : "#111827" }}>{qtd}</p>
      {valor && valor !== "0" && valor !== "0,00" && (
        <p style={{ margin: "2px 0 0", fontSize: "11px", color: danger && qtd > 0 ? "#dc2626" : "#6B7280", fontVariantNumeric: "tabular-nums" }}>{valor}</p>
      )}
    </div>
  );
}

```

## components/review/SectionQSA.tsx

```tsx
"use client";
import { Plus, Trash2, AlertTriangle, FileSignature } from "lucide-react";
import { QSAData, QSASocio } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult, qualityAccent } from "./shared";

type MergeFlag = {
  cpfCnpj?:          boolean;
  qualificacao?:     boolean;
  participacao?:     boolean;
  capitalInvestido?: boolean;
};

interface Props {
  data: QSAData;
  setField: (k: "capitalSocial", v: string) => void;
  setSocio: (i: number, k: keyof QSASocio, v: string) => void;
  addSocio: () => void;
  removeSocio: (i: number) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
  // Mapa nome-normalizado → flags dos campos vindos do Contrato Social.
  // Quando presente, a UI mostra um badge "do contrato" ao lado do campo.
  mergeMap?: Record<string, MergeFlag>;
}

// Mesma normalização do mergeQsaWithContrato — manter sincronizada.
function normalizeName(name: string): string {
  return (name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function FromContratoBadge() {
  return (
    <span
      title="Dado obtido do Contrato Social (sobrescreve o QSA da Receita)"
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        fontSize: "9px", fontWeight: 700, color: "#0369a1",
        background: "#e0f2fe", border: "1px solid #bae6fd",
        borderRadius: 4, padding: "1px 5px",
        marginLeft: 6, lineHeight: 1.3,
      }}
    >
      <FileSignature size={9} />
      do contrato
    </span>
  );
}

export function SectionQSA({ data, setField, setSocio, addSocio, removeSocio, expanded, onToggle, quality, mergeMap }: Props) {
  return (
    <SectionCard
      number="02"
      title="Quadro de Sócios e Administradores — QSA"
      accentColor={qualityAccent(quality.score)}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: quality.score === "good" ? "#dcfce7" : quality.score === "warning" ? "#fef9c3" : "#fee2e2", color: quality.score === "good" ? "#15803d" : quality.score === "warning" ? "#92400e" : "#991b1b" }}>
          {quality.pct}%
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Field label="Capital Social" value={data.capitalSocial} onChange={v => setField("capitalSocial", v)} />

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6B7280" }}>Quadro Societário</span>
            <button
              onClick={addSocio}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#203b88", background: "white", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#203b88"; (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "white"; }}
            >
              <Plus size={12} /> Adicionar sócio
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.quadroSocietario.map((s, i) => {
              const initial = s.nome ? s.nome.trim().charAt(0).toUpperCase() : String(i + 1);
              const hasCPF = s.cpfCnpj && s.cpfCnpj.trim();
              const flags = mergeMap?.[normalizeName(s.nome)] || {};
              return (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: "12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: "12px", padding: "14px" }}
                >
                  {/* Avatar */}
                  <div style={{ width: "40px", height: "40px", borderRadius: "99px", background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "white", fontSize: "15px", fontWeight: 700 }}>
                    {initial}
                  </div>

                  {/* Campos */}
                  <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <input
                        value={s.nome}
                        onChange={e => setSocio(i, "nome", e.target.value)}
                        placeholder="Nome completo"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "13px", fontWeight: 600, border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                    </div>
                    <div>
                      <input
                        value={s.cpfCnpj}
                        onChange={e => setSocio(i, "cpfCnpj", e.target.value)}
                        placeholder="CPF / CNPJ"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: `1px solid ${hasCPF ? "#E5E7EB" : "#fcd34d"}`, background: hasCPF ? "white" : "#fffbeb", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = hasCPF ? "#E5E7EB" : "#fcd34d"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                        {!hasCPF && (
                          <p style={{ fontSize: "10px", color: "#d97706", margin: 0, display: "flex", alignItems: "center", gap: "3px" }}>
                            <AlertTriangle size={9} /> CPF/CNPJ ausente
                          </p>
                        )}
                        {flags.cpfCnpj && <FromContratoBadge />}
                      </div>
                    </div>
                    <div>
                      <input
                        value={s.qualificacao}
                        onChange={e => setSocio(i, "qualificacao", e.target.value)}
                        placeholder="Qualificação"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      {flags.qualificacao && <div style={{ marginTop: 3 }}><FromContratoBadge /></div>}
                    </div>
                    <div>
                      <input
                        value={s.participacao}
                        onChange={e => setSocio(i, "participacao", e.target.value)}
                        placeholder="Participação %"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      {flags.participacao && <div style={{ marginTop: 3 }}><FromContratoBadge /></div>}
                    </div>
                    <div>
                      <input
                        value={s.capitalInvestido ?? ""}
                        onChange={e => setSocio(i, "capitalInvestido", e.target.value)}
                        placeholder="Capital investido (R$)"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      {flags.capitalInvestido && <div style={{ marginTop: 3 }}><FromContratoBadge /></div>}
                    </div>
                  </div>

                  {/* Remover */}
                  <button
                    onClick={() => removeSocio(i)}
                    style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #E5E7EB", borderRadius: "8px", cursor: "pointer", color: "#9CA3AF", flexShrink: 0, transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#dc2626"; (e.currentTarget as HTMLElement).style.borderColor = "#fca5a5"; (e.currentTarget as HTMLElement).style.background = "#fef2f2"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "white"; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}

```

## components/review/SectionRelatorioVisita.tsx

```tsx
"use client";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { RelatorioVisitaData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: RelatorioVisitaData;
  set: (k: string, v: string | boolean) => void;
  setLista: (k: "pontosPositivos" | "pontosAtencao", idx: number, v: string) => void;
  addLista: (k: "pontosPositivos" | "pontosAtencao") => void;
  removeLista: (k: "pontosPositivos" | "pontosAtencao", idx: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionRelatorioVisita({ data, set, setLista, addLista, removeLista, expanded, onToggle }: Props) {
  const badge = data.recomendacaoVisitante === "aprovado"
    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">✓ Aprovado</span>
    : data.recomendacaoVisitante === "condicional"
      ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">⚠ Condicional</span>
      : data.recomendacaoVisitante === "reprovado"
        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">✕ Reprovado</span>
        : undefined;

  const CHECKLIST = [
    { label: "Estrutura Física Confirmada", k: "estruturaFisicaConfirmada" as const },
    { label: "Estoque Visível", k: "estoqueVisivel" as const },
    { label: "Operação Compatível com Faturamento", k: "operacaoCompativelFaturamento" as const },
    { label: "Máquinas e Equipamentos", k: "maquinasEquipamentos" as const },
    { label: "Presença dos Sócios", k: "presencaSocios" as const },
  ];

  return (
    <SectionCard number="10" icon={<ClipboardList size={16} className="text-pink-600" />} title="Relatório de Visita"
      iconColor="bg-pink-100" expanded={expanded} onToggle={onToggle} badge={badge}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Data da Visita" value={data.dataVisita} onChange={v => set("dataVisita", v)} />
          <Field label="Responsável pela Visita" value={data.responsavelVisita} onChange={v => set("responsavelVisita", v)} />
          <Field label="Local da Visita" value={data.localVisita} onChange={v => set("localVisita", v)} />
          <Field label="Duração" value={data.duracaoVisita} onChange={v => set("duracaoVisita", v)} />
          <Field label="Estimativa de Estoque (R$)" value={data.estimativaEstoque} onChange={v => set("estimativaEstoque", v)} />
          <Field label="Funcionários Observados" value={String(data.funcionariosObservados ?? "")} onChange={v => set("funcionariosObservados", v)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CHECKLIST.map((item, i) => (
            <label key={i} className="flex items-center gap-2.5 cursor-pointer select-none group px-3 py-2 rounded-lg border border-cf-border bg-cf-surface hover:bg-cf-bg transition-colors">
              <input type="checkbox" checked={!!(data[item.k as "estruturaFisicaConfirmada"])} onChange={e => set(item.k, e.target.checked)} className="w-4 h-4 rounded accent-green-600 cursor-pointer" />
              <span className="text-xs text-cf-text-2 group-hover:text-cf-text-1 transition-colors">{item.label}</span>
            </label>
          ))}
        </div>
        <Field label="Descrição da Estrutura" value={data.descricaoEstrutura} onChange={v => set("descricaoEstrutura", v)} multiline span2 />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["pontosPositivos", "pontosAtencao"] as const).map(k => (
            <div key={k}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="section-label">{k === "pontosPositivos" ? "Pontos Positivos" : "Pontos de Atenção"}</p>
                <button onClick={() => addLista(k)} className="inline-flex items-center gap-1 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2 py-1 transition-colors" style={{ minHeight: "auto" }}>
                  <Plus size={11} /> Adicionar
                </button>
              </div>
              <div className="space-y-1.5">
                {data[k].map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p} onChange={e => setLista(k, i, e.target.value)} placeholder={k === "pontosPositivos" ? "Ponto positivo..." : "Ponto de atenção..."} className="input-field py-1.5 text-xs flex-1" />
                    <button onClick={() => removeLista(k, i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors flex-shrink-0"><Trash2 size={12} /></button>
                  </div>
                ))}
                {data[k].length === 0 && <p className="text-xs text-cf-text-4 italic">Nenhum item.</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="section-label mb-1.5">Recomendação</p>
            <div className="flex gap-2">
              {(["aprovado", "condicional", "reprovado"] as const).map(op => (
                <button key={op} onClick={() => set("recomendacaoVisitante", op)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors capitalize ${data.recomendacaoVisitante === op ? op === "aprovado" ? "bg-green-100 border-green-400 text-green-700" : op === "condicional" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-red-100 border-red-400 text-red-700" : "bg-cf-surface border-cf-border text-cf-text-3 hover:bg-cf-bg"}`}>
                  {op}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="section-label mb-1.5">Nível de Confiança</p>
            <div className="flex gap-2">
              {(["alto", "medio", "baixo"] as const).map(op => (
                <button key={op} onClick={() => set("nivelConfiancaVisita", op)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors capitalize ${data.nivelConfiancaVisita === op ? op === "alto" ? "bg-green-100 border-green-400 text-green-700" : op === "medio" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-red-100 border-red-400 text-red-700" : "bg-cf-surface border-cf-border text-cf-text-3 hover:bg-cf-bg"}`}>
                  {op}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Field label="Observações Livres" value={data.observacoesLivres} onChange={v => set("observacoesLivres", v)} multiline span2 />
        <div className="pt-2 border-t border-cf-border">
          <p className="section-label mb-3">Parâmetros Operacionais</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Pleito (R$)" value={data.pleito ?? ""} onChange={v => set("pleito", v)} />
            <div className="flex flex-col gap-1">
              <label className="section-label">Modalidade</label>
              <select value={data.modalidade ?? ""} onChange={e => set("modalidade", e.target.value)} className="input-field text-sm">
                <option value="">—</option>
                <option value="convencional">Convencional</option>
                <option value="comissaria">Comissária</option>
                <option value="hibrida">Híbrida</option>
                <option value="outra">Outra</option>
              </select>
            </div>
            <Field label="Taxa Convencional (%)" value={data.taxaConvencional ?? ""} onChange={v => set("taxaConvencional", v)} />
            <Field label="Taxa Comissária (%)" value={data.taxaComissaria ?? ""} onChange={v => set("taxaComissaria", v)} />
            <Field label="Limite Total (R$)" value={data.limiteTotal ?? ""} onChange={v => set("limiteTotal", v)} />
            <Field label="Limite por Sacado (R$)" value={data.limitePorSacado ?? ""} onChange={v => set("limitePorSacado", v)} />
            <Field label="Ticket Médio (R$)" value={data.ticketMedio ?? ""} onChange={v => set("ticketMedio", v)} />
            <Field label="Prazo Recompra Cedente (dias)" value={data.prazoRecompraCedente ?? ""} onChange={v => set("prazoRecompraCedente", v)} />
            <Field label="Prazo Envio Cartório (dias)" value={data.prazoEnvioCartorio ?? ""} onChange={v => set("prazoEnvioCartorio", v)} />
            <Field label="Prazo Máximo da Operação (dias)" value={data.prazoMaximoOp ?? ""} onChange={v => set("prazoMaximoOp", v)} />
          </div>
        </div>
        <div className="pt-2 border-t border-cf-border">
          <p className="section-label mb-3">Dados da Empresa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Folha de Pagamento (R$)" value={data.folhaPagamento ?? ""} onChange={v => set("folhaPagamento", v)} />
            <Field label="Endividamento Bancos (R$)" value={data.endividamentoBanco ?? ""} onChange={v => set("endividamentoBanco", v)} />
            <Field label="Endividamento Factoring/FIDC (R$)" value={data.endividamentoFactoring ?? ""} onChange={v => set("endividamentoFactoring", v)} />
            <Field label="Prazo Médio de Faturamento (dias)" value={data.prazoMedioFaturamento ?? ""} onChange={v => set("prazoMedioFaturamento", v)} />
            <Field label="Prazo Médio de Entrega (dias)" value={data.prazoMedioEntrega ?? ""} onChange={v => set("prazoMedioEntrega", v)} />
            <Field label="Referências Comerciais / Fornecedores" value={data.referenciasFornecedores ?? ""} onChange={v => set("referenciasFornecedores", v)} multiline span2 />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

```

## components/review/SectionSCR.tsx

```tsx
"use client";
import { Plus, Trash2 } from "lucide-react";
import { SCRData, SCRModalidade, SCRInstituicao } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult, qualityAccent } from "./shared";

interface Props {
  data: SCRData;
  anterior?: SCRData;
  set: (k: keyof SCRData, v: string) => void;
  setMod: (i: number, k: keyof SCRModalidade, v: string) => void;
  addMod: () => void;
  removeMod: (i: number) => void;
  setInst: (i: number, k: keyof SCRInstituicao, v: string) => void;
  addInst: () => void;
  removeInst: (i: number) => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionSCR({ data, anterior, set, setMod, addMod, removeMod, setInst, addInst, removeInst, showDetails, setShowDetails, expanded, onToggle, quality }: Props) {
  const parse = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;

  return (
    <SectionCard number="05" title="SCR / Bacen — Perfil de Crédito"
      accentColor={qualityAccent(quality.score)} expanded={expanded} onToggle={onToggle}
      badge={<span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: quality.score === "good" ? "#dcfce7" : quality.score === "warning" ? "#fef9c3" : "#fee2e2", color: quality.score === "good" ? "#15803d" : quality.score === "warning" ? "#92400e" : "#991b1b" }}>{quality.pct}%</span>}>
      <div className="space-y-5">
        {data.urlRelatorio && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <a
              href={data.urlRelatorio}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "11px", fontWeight: 600, color: "#203b88", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", border: "1px solid #c7d3f0", borderRadius: "6px", background: "#eef2fb" }}
            >
              🔗 Ver consulta original DataBox360
            </a>
          </div>
        )}
        {data.semHistorico && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <span className="text-blue-500 mt-0.5">ℹ</span>
            <div>
              <p className="text-sm font-semibold text-blue-700">Sem operações registradas no SCR</p>
              <p className="text-xs text-blue-500 mt-0.5">Empresa sem dívida bancária ativa — campos zerados abaixo para confirmação</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Período de Referência" value={data.periodoReferencia} onChange={v => set("periodoReferencia", v)} />
        </div>
        <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-cf-navy hover:text-cf-navy/70 flex items-center gap-1 transition-colors" style={{ minHeight: "auto" }}>
          {showDetails ? "▲ Ocultar" : "▼ Ver"} detalhes (vencimentos, evolucao, modalidades)
        </button>
        {showDetails && (
          <div className="space-y-4 animate-fade-in">
            {anterior && (
              <div>
                <p className="text-[11px] font-medium text-cf-text-4 uppercase tracking-wider mb-2">Evolucao SCR — {anterior.periodoReferencia || "Anterior"} x {data.periodoReferencia || "Atual"}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-cf-bg"><th className="text-left py-2 px-3 text-cf-text-3 font-medium">Metrica</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Anterior</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Atual</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Var.</th></tr></thead>
                    <tbody>{([
                      { label: "Em Dia", ant: anterior.carteiraAVencer, at: data.carteiraAVencer, positiveIsGood: true, bold: false },
                      { label: "Total Divida", ant: anterior.totalDividasAtivas, at: data.totalDividasAtivas, positiveIsGood: false, bold: true },
                      { label: "Vencida", ant: anterior.vencidos, at: data.vencidos, positiveIsGood: false, bold: false },
                      { label: "Prejuizo", ant: anterior.prejuizos, at: data.prejuizos, positiveIsGood: false, bold: false },
                      { label: "Limite", ant: anterior.limiteCredito, at: data.limiteCredito, positiveIsGood: true, bold: false },
                      { label: "IFs", ant: anterior.qtdeInstituicoes, at: data.qtdeInstituicoes, positiveIsGood: true, bold: false },
                    ] as { label: string; ant: string; at: string; positiveIsGood: boolean; bold: boolean }[]).map((m, i) => {
                      const d1 = parse(m.ant); const d2 = parse(m.at); const diff = d2 - d1;
                      const pct = d1 > 0 ? ((diff / d1) * 100).toFixed(1) : null;
                      const varStr = diff === 0 ? "=" : pct ? `${diff > 0 ? "+" : ""}${pct}%` : "—";
                      const isGood = diff === 0 ? null : (diff > 0 && m.positiveIsGood) || (diff < 0 && !m.positiveIsGood);
                      const varColor = diff === 0 ? "text-cf-text-4" : isGood ? "text-green-600" : "text-red-600";
                      return (<tr key={i} className={`border-b border-cf-border/30 ${m.bold ? "font-semibold bg-cf-bg" : ""}`}><td className="py-1.5 px-3 text-cf-text-2">{m.label}</td><td className="py-1.5 px-3 text-right text-cf-text-3" style={{ fontVariantNumeric: "tabular-nums" }}>{m.ant || "—"}</td><td className="py-1.5 px-3 text-right text-cf-text-1 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{m.at || "—"}</td><td className={`py-1.5 px-3 text-right font-medium ${varColor}`} style={{ fontVariantNumeric: "tabular-nums" }}>{varStr}</td></tr>);
                    })}</tbody>
                  </table>
                </div>
              </div>
            )}
            {data.faixasAVencer && (
              <div>
                <p className="text-[11px] font-medium text-cf-text-4 uppercase tracking-wider mb-2">Vencimentos por Prazo</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-cf-bg"><th className="text-left py-2 px-3 text-cf-text-3 font-medium">Faixa</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Valor (R$)</th></tr></thead>
                    <tbody>
                      {[
                        { label: "Ate 30 dias", value: data.faixasAVencer.ate30d },
                        { label: "31 a 60 dias", value: data.faixasAVencer.d31_60 },
                        { label: "61 a 90 dias", value: data.faixasAVencer.d61_90 },
                        { label: "91 a 180 dias", value: data.faixasAVencer.d91_180 },
                        { label: "181 a 360 dias", value: data.faixasAVencer.d181_360 },
                        { label: "Acima de 360 dias", value: data.faixasAVencer.acima360d },
                      ].filter(r => r.value && r.value !== "0" && r.value !== "0,00").map((r, i) => (
                        <tr key={i} className="border-b border-cf-border/30"><td className="py-2 px-3 text-cf-text-2">{r.label}</td><td className="py-2 px-3 text-right font-medium text-cf-text-1" style={{ fontVariantNumeric: "tabular-nums" }}>{r.value}</td></tr>
                      ))}
                      <tr className="bg-cf-bg font-semibold"><td className="py-2 px-3 text-cf-text-1">Total</td><td className="py-2 px-3 text-right text-cf-text-1" style={{ fontVariantNumeric: "tabular-nums" }}>{data.faixasAVencer.total || data.carteiraAVencer || "—"}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        <div className={data.semHistorico ? "opacity-50" : ""}>
          <span className="section-label block mb-2">Resumo</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Carteira a Vencer (R$)" value={data.carteiraAVencer} onChange={v => set("carteiraAVencer", v)} />
            <Field label="Vencidos (R$)" value={data.vencidos} onChange={v => set("vencidos", v)} />
            <Field label="Prejuízos (R$)" value={data.prejuizos} onChange={v => set("prejuizos", v)} />
            <Field label="Limite de Crédito (R$)" value={data.limiteCredito} onChange={v => set("limiteCredito", v)} />
            <Field label="Qtde Instituições" value={data.qtdeInstituicoes} onChange={v => set("qtdeInstituicoes", v)} />
            <Field label="Qtde Operações" value={data.qtdeOperacoes} onChange={v => set("qtdeOperacoes", v)} />
          </div>
        </div>
        <div className={data.semHistorico ? "opacity-50" : ""}>
          <span className="section-label block mb-2">Detalhamento</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Total Dívidas Ativas (R$)" value={data.totalDividasAtivas} onChange={v => set("totalDividasAtivas", v)} />
            <Field label="Classificação de Risco (A-H)" value={data.classificacaoRisco} onChange={v => set("classificacaoRisco", v)} />
            <Field label="Operações a Vencer (R$)" value={data.operacoesAVencer} onChange={v => set("operacoesAVencer", v)} />
            <Field label="Operações em Atraso (R$)" value={data.operacoesEmAtraso} onChange={v => set("operacoesEmAtraso", v)} />
            <Field label="Curto Prazo - CP (R$)" value={data.carteiraCurtoPrazo} onChange={v => set("carteiraCurtoPrazo", v)} />
            <Field label="Longo Prazo - LP (R$)" value={data.carteiraLongoPrazo} onChange={v => set("carteiraLongoPrazo", v)} />
            <Field label="Histórico de Inadimplência" value={data.historicoInadimplencia} onChange={v => set("historicoInadimplencia", v)} multiline span2 />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Modalidades de Crédito</span>
            <button onClick={addMod} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors"><Plus size={12} /> Adicionar</button>
          </div>
          {data.modalidades.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_100px_100px_100px_70px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Modalidade","Total","A Vencer","Vencido","Part.",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.modalidades.map((m, i) => (
                <div key={i} className={`hidden sm:grid grid-cols-[1fr_100px_100px_100px_70px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={m.nome} onChange={e => setMod(i,"nome",e.target.value)} placeholder="Capital de giro..." className="input-field py-1.5 text-xs" />
                  <input value={m.total} onChange={e => setMod(i,"total",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={m.aVencer} onChange={e => setMod(i,"aVencer",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={m.vencido} onChange={e => setMod(i,"vencido",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={m.participacao} onChange={e => setMod(i,"participacao",e.target.value)} placeholder="0%" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeMod(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhuma modalidade extraída.</div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Instituições Financeiras</span>
            <button onClick={addInst} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors"><Plus size={12} /> Adicionar</button>
          </div>
          {data.instituicoes.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="grid grid-cols-[1fr_140px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Instituição","Valor (R$)",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.instituicoes.map((inst, i) => (
                <div key={i} className={`grid grid-cols-[1fr_140px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={inst.nome} onChange={e => setInst(i,"nome",e.target.value)} placeholder="Nome do banco" className="input-field py-1.5 text-xs" />
                  <input value={inst.valor} onChange={e => setInst(i,"valor",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeInst(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhuma instituição extraída.</div>
          )}
        </div>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}

```

## components/review/SectionSCRSocios.tsx

```tsx
"use client";
import { useState } from "react";
import { SCRSocioData } from "@/types";
import { SectionCard, QualityResult, qualityAccent } from "./shared";

interface Props {
  socios: SCRSocioData[];
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

function parseBR(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmtBRL(v: string | undefined | null): string {
  const n = parseBR(v);
  if (n === 0) return "R$ 0,00";
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVar(atual: string | undefined, anterior: string | undefined): { text: string; color: string } {
  const a = parseBR(atual);
  const b = parseBR(anterior);
  if (b === 0) return { text: "—", color: "#9CA3AF" };
  const diff = a - b;
  if (diff === 0) return { text: "=", color: "#9CA3AF" };
  const pct = (diff / Math.abs(b)) * 100;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    // Aumento de dívida = ruim (vermelho); redução = bom (verde)
    color: pct > 0 ? "#DC2626" : "#16A34A",
  };
}

function maskCpf(cpf: string | undefined): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return cpf;
}

export function SectionSCRSocios({ socios, expanded, onToggle, quality }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const hasSocios = socios && socios.length > 0;

  return (
    <SectionCard
      number="05b"
      title="SCR dos Sócios — Perfil de Crédito PF"
      accentColor={hasSocios ? qualityAccent(quality.score) : "#9CA3AF"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: hasSocios ? "#dbeafe" : "#f3f4f6", color: hasSocios ? "#1e40af" : "#6b7280" }}>
          {hasSocios ? `${socios.length} sócio${socios.length > 1 ? "s" : ""}` : "sem dados"}
        </span>
      }
    >
      {!hasSocios ? (
        <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "8px", border: "1px dashed #D1D5DB" }}>
          <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>
            Nenhum SCR de sócio PF enviado. Envie arquivos nos slots <strong>SCR dos Sócios — Atual</strong> e{" "}
            <strong>SCR dos Sócios — Anterior</strong> para visualizar o comparativo aqui.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {socios.map((socio, i) => {
            const atual = socio.periodoAtual;
            const anterior = socio.periodoAnterior;
            const isExpanded = expandedIdx === i;
            const nomeSocio = socio.nomeSocio || atual?.nomeCliente || "Sócio sem nome";
            const cpfSocio = maskCpf(socio.cpfSocio || atual?.cpfSCR);

            return (
              <div
                key={i}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "10px",
                  overflow: "hidden",
                  background: "white",
                }}
              >
                {/* Header do sócio */}
                <div style={{ padding: "12px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nomeSocio}
                      </div>
                      <div style={{ fontSize: "11px", color: "#6B7280", fontFamily: "ui-monospace, SFMono-Regular, monospace", marginTop: "2px" }}>
                        CPF: {cpfSocio}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {atual?.periodoReferencia || "—"}
                        {anterior?.periodoReferencia ? ` × ${anterior.periodoReferencia}` : ""}
                      </span>
                      {atual?.urlRelatorio && (
                        <a
                          href={atual.urlRelatorio}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "11px", fontWeight: 600, color: "#203b88", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", border: "1px solid #c7d3f0", borderRadius: "6px", background: "#eef2fb", whiteSpace: "nowrap" }}
                        >
                          🔗 Ver DataBox360
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Métricas principais — sempre visíveis */}
                <div style={{ padding: "14px 16px" }}>
                  {(() => {
                    const respAtiva = parseBR(atual?.carteiraAVencer) + parseBR(atual?.vencidos);
                    const prejVal   = parseBR(atual?.prejuizos);
                    const limVal    = parseBR(atual?.limiteCredito);
                    const semDivida = respAtiva === 0 && prejVal > 0;
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "10px" }}>
                        <div title={semDivida ? "Crédito baixado para prejuízo — sem dívida ativa em cobrança" : undefined}>
                          <Metric
                            label="Resp. Ativa"
                            value={respAtiva > 0 ? fmtBRL(String(respAtiva)) : "R$ 0,00"}
                            variation={anterior ? fmtVar(
                              String(parseBR(atual?.carteiraAVencer) + parseBR(atual?.vencidos)),
                              String(parseBR(anterior.carteiraAVencer) + parseBR(anterior.vencidos))
                            ) : undefined}
                            sub={semDivida ? "sem cobrança ativa" : undefined}
                          />
                        </div>
                        <Metric
                          label="Prejuízos"
                          value={prejVal > 0 ? fmtBRL(atual?.prejuizos) : "—"}
                          variation={anterior ? fmtVar(atual?.prejuizos, anterior.prejuizos) : undefined}
                          danger={prejVal > 0}
                          tag={prejVal > 0 ? "⚠ Write-off" : undefined}
                        />
                        <Metric
                          label="A Vencer"
                          value={fmtBRL(atual?.carteiraAVencer)}
                          variation={anterior ? fmtVar(atual?.carteiraAVencer, anterior.carteiraAVencer) : undefined}
                        />
                        <Metric
                          label="Vencidos"
                          value={parseBR(atual?.vencidos) > 0 ? fmtBRL(atual?.vencidos) : "—"}
                          variation={anterior ? fmtVar(atual?.vencidos, anterior.vencidos) : undefined}
                          danger={parseBR(atual?.vencidos) > 0}
                        />
                        <Metric
                          label="Limite"
                          value={limVal > 0 ? fmtBRL(atual?.limiteCredito) : "Não informado"}
                          muted={limVal === 0}
                        />
                        <Metric label="IFs" value={atual?.qtdeInstituicoes || "—"} />
                      </div>
                    );
                  })()}

                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    style={{
                      marginTop: "12px", fontSize: "12px", fontWeight: 600, color: "#203b88",
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    {isExpanded ? "▲ Ocultar detalhes" : "▼ Ver modalidades e comparativo completo"}
                  </button>

                  {isExpanded && (
                    <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      {/* Comparativo atual x anterior detalhado */}
                      {anterior && (
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280", marginBottom: "6px" }}>
                            Comparativo {anterior.periodoReferencia || "Anterior"} → {atual?.periodoReferencia || "Atual"}
                          </p>
                          <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", minWidth: "420px", fontSize: "12px", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#F9FAFB" }}>
                                <th style={{ textAlign: "left", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Métrica</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Anterior</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Atual</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Var.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                {
                                  label: "Resp. Ativa",
                                  ant: String(parseBR(anterior.carteiraAVencer) + parseBR(anterior.vencidos)) || "0",
                                  at:  String(parseBR(atual?.carteiraAVencer)   + parseBR(atual?.vencidos))   || "0",
                                  bold: true,
                                },
                                { label: "Prejuízos",   ant: anterior.prejuizos,          at: atual?.prejuizos },
                                { label: "A Vencer",    ant: anterior.carteiraAVencer,    at: atual?.carteiraAVencer },
                                { label: "Vencidos",    ant: anterior.vencidos,           at: atual?.vencidos },
                                { label: "Limite",      ant: anterior.limiteCredito,      at: atual?.limiteCredito },
                                { label: "Curto Prazo", ant: anterior.carteiraCurtoPrazo, at: atual?.carteiraCurtoPrazo },
                                { label: "Longo Prazo", ant: anterior.carteiraLongoPrazo, at: atual?.carteiraLongoPrazo },
                                { label: "IFs",         ant: anterior.qtdeInstituicoes,   at: atual?.qtdeInstituicoes },
                              ].map((m, j) => {
                                const v = fmtVar(m.at, m.ant);
                                return (
                                  <tr key={j} style={{ borderBottom: "1px solid #F3F4F6", fontWeight: m.bold ? 700 : 400, background: m.bold ? "#F9FAFB" : "transparent" }}>
                                    <td style={{ padding: "6px 10px", color: "#374151" }}>{m.label}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#6B7280", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(m.ant)}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#111827", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(m.at)}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: v.color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{v.text}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      )}

                      {/* Modalidades do período atual */}
                      {atual?.modalidades && atual.modalidades.length > 0 && (
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280", marginBottom: "6px" }}>
                            Modalidades ({atual.periodoReferencia || "Atual"})
                          </p>
                          <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", minWidth: "420px", fontSize: "12px", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#F9FAFB" }}>
                                <th style={{ textAlign: "left", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Modalidade</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>A Vencer</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Vencido</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {atual.modalidades.map((mod, k) => (
                                <tr key={k} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                  <td style={{ padding: "6px 10px", color: "#374151" }}>{mod.nome || "—"}</td>
                                  <td style={{ padding: "6px 10px", textAlign: "right", color: "#374151", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(mod.aVencer)}</td>
                                  <td style={{ padding: "6px 10px", textAlign: "right", color: parseBR(mod.vencido) > 0 ? "#DC2626" : "#374151", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(mod.vencido)}</td>
                                  <td style={{ padding: "6px 10px", textAlign: "right", color: "#111827", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtBRL(mod.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      )}

                      {/* Aviso se não tem anterior */}
                      {!anterior && (
                        <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: "8px", fontSize: "12px", color: "#92400E" }}>
                          Sem período anterior enviado — comparativo indisponível. Envie no slot <strong>SCR dos Sócios — Anterior</strong>.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function Metric({ label, value, variation, danger, sub, tag, muted }: {
  label: string;
  value: string;
  variation?: { text: string; color: string };
  danger?: boolean;
  sub?: string;
  tag?: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "8px",
        background: danger ? "#FEF2F2" : "#F9FAFB",
        border: `1px solid ${danger ? "#FECACA" : "#E5E7EB"}`,
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: danger ? "#991B1B" : muted ? "#9CA3AF" : "#111827", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {tag && (
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#DC2626", marginTop: "2px" }}>
          {tag}
        </div>
      )}
      {sub && (
        <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px", fontStyle: "italic" }}>
          {sub}
        </div>
      )}
      {variation && (
        <div style={{ fontSize: "10px", fontWeight: 600, color: variation.color, marginTop: "2px" }}>
          {variation.text}
        </div>
      )}
    </div>
  );
}

```

## components/review/shared.tsx

```tsx
"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

export const SUSPICIOUS_VALUES = new Set(["N/D", "n/d", "ND", "nd", "N/A", "n/a", "—", "-", "null", "undefined", "NaN"]);

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({ label, value, onChange, multiline = false, span2 = false }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; span2?: boolean;
}) {
  const isEmpty = !value || value === "" || value === "0" || value === "0,00";
  const isSuspicious = !isEmpty && SUSPICIOUS_VALUES.has(value.trim());

  const baseBorder = isSuspicious ? "#fb923c" : isEmpty ? "#fcd34d" : "#E5E7EB";
  const baseBg    = isSuspicious ? "#fff7ed" : isEmpty ? "#fffbeb" : "#ffffff";

  return (
    <div className={span2 ? "col-span-2" : ""}>
      <label style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6B7280" }}>
        {label}
        {isSuspicious && (
          <span style={{ fontSize: "9px", fontWeight: 700, color: "#ea580c", background: "#ffedd5", padding: "1px 6px", borderRadius: "99px" }}>⚠ verificar</span>
        )}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ width: "100%", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", border: `1px solid ${baseBorder}`, background: baseBg, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: "1.5", transition: "border-color 0.15s, box-shadow 0.15s" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = baseBorder; e.currentTarget.style.boxShadow = "none"; }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: "100%", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", border: `1px solid ${baseBorder}`, background: baseBg, outline: "none", fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = baseBorder; e.currentTarget.style.boxShadow = "none"; }}
        />
      )}
    </div>
  );
}

// ── QualityResult ─────────────────────────────────────────────────────────────
export interface QualityResult {
  score: "good" | "warning" | "error";
  filledFields: number;
  totalFields: number;
  pct: number;
  issues: string[];
}

export function QualityBadge({ quality }: { quality: QualityResult }) {
  const cfg = {
    good:    { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d",  bar: "#22c55e", label: "Boa qualidade" },
    warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e",  bar: "#f59e0b", label: "Revisar" },
    error:   { bg: "#fef2f2", border: "#fecaca", text: "#991b1b",  bar: "#ef4444", label: "Incompleto" },
  };
  const c = cfg[quality.score];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "10px", padding: "10px 14px", marginTop: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: c.text }}>{c.label} — {quality.pct}%</span>
      </div>
      <div style={{ height: "4px", borderRadius: "99px", background: "#e5e7eb", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: "99px", background: c.bar, width: `${quality.pct}%`, transition: "width 0.4s ease" }} />
      </div>
      {quality.issues.length > 0 && (
        <ul style={{ marginTop: "6px" }}>
          {quality.issues.map((issue, i) => (
            <li key={i} style={{ fontSize: "10px", color: c.text, opacity: 0.85, display: "flex", alignItems: "flex-start", gap: "4px" }}>
              <span style={{ marginTop: "1px", flexShrink: 0 }}>→</span>{issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────
export function SectionCard({
  number, title, children, expanded, onToggle, badge, accentColor = "#9CA3AF"
}: {
  number: string; icon?: React.ReactNode; title: string; iconColor?: string;
  children: React.ReactNode; expanded: boolean; onToggle: () => void;
  badge?: React.ReactNode; accentColor?: string;
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #E5E7EB",
        borderLeft: `3px solid ${accentColor}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.2s",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          textAlign: "left",
          background: expanded ? "#F8FAFC" : "white",
          cursor: "pointer",
          border: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "white"; }}
      >
        {/* Pill número */}
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "99px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: "10px",
            fontWeight: 700,
            color: "white",
            background: accentColor,
          }}
        >
          {number}
        </div>

        {/* Título */}
        <p style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "#111827", lineHeight: "1.4", margin: 0 }}>
          {title}
        </p>

        {/* Badge */}
        {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}

        {/* Chevron */}
        <div style={{ flexShrink: 0, color: "#9CA3AF" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div
          style={{ padding: "20px 20px 20px", background: "white", borderTop: "1px solid #F3F4F6", animationName: "fadeIn", animationDuration: "0.15s" }}
          className="animate-fade-in"
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Quality assessment ─────────────────────────────────────────────────────────
export function avaliarQualidade(type: string, data: Record<string, unknown>): QualityResult {
  const issues: string[] = [];
  let filled = 0;
  let total = 0;

  const check = (field: unknown, label: string, required = false) => {
    total++;
    const isEmpty = !field || field === "" || field === "0" || field === "0,00" || (Array.isArray(field) && field.length === 0);
    if (!isEmpty) { filled++; }
    else if (required) { issues.push(`${label} nao encontrado`); }
  };

  switch (type) {
    case "cnpj":
      check(data.razaoSocial, "Razao Social", true);
      check(data.cnpj, "CNPJ", true);
      check(data.situacaoCadastral, "Situacao Cadastral", true);
      check(data.dataAbertura, "Data de Abertura");
      check(data.cnaePrincipal, "CNAE Principal");
      check(data.porte, "Porte");
      check(data.endereco, "Endereco");
      check(data.capitalSocialCNPJ, "Capital Social");
      break;
    case "qsa": {
      check(data.quadroSocietario, "Quadro Societario", true);
      const socios = (data.quadroSocietario || []) as Record<string, unknown>[];
      if (socios.filter(s => s.nome).length === 0) issues.push("Nenhum socio identificado");
      else socios.forEach((s, i) => { if (!s.cpfCnpj) issues.push(`Socio ${i + 1}: CPF/CNPJ ausente`); });
      break;
    }
    case "contrato":
      check(data.capitalSocial, "Capital Social", true);
      check(data.dataConstituicao, "Data de Constituicao");
      check(data.administracao, "Administracao");
      check(data.objetoSocial, "Objeto Social");
      { const sc = (data.socios || []) as Record<string, unknown>[]; total++; if (sc.filter(s => s.nome).length > 0) filled++; else issues.push("Nenhum socio no contrato"); }
      break;
    case "faturamento":
      check(data.mediaAno || data.mediaMensal, "Media Mensal", true);
      { const m = (data.meses || []) as unknown[]; total++;
        if (m.length === 0) issues.push("Nenhum mes de faturamento extraido");
        else if (m.length < 6) { issues.push(`Apenas ${m.length} meses — ideal 12+`); filled += 0.5; }
        else filled++;
      }
      // Recomputa a partir dos meses reais — não confia no flag armazenado (pode ser default true)
      const mesesFat = (data.meses || []) as { valor: string }[];
      const parseFatVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
      const fatZeradoReal = mesesFat.length > 0 && mesesFat.every(m => parseFatVal(m.valor) === 0);
      if (fatZeradoReal) issues.push("Faturamento zerado no periodo");
      break;
    case "scr":
      check(data.periodoReferencia, "Periodo de Referencia", true);
      check(data.totalDividasAtivas, "Total de Dividas");
      check(data.carteiraAVencer, "Carteira a Vencer");
      check(data.qtdeInstituicoes, "N de Instituicoes");
      break;
    default:
      total = 1; filled = data && Object.keys(data).length > 0 ? 1 : 0;
  }

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const score: QualityResult["score"] = issues.some(i => i.includes("nao encontrado") || i.includes("Nenhum")) ? "error" : pct >= 70 ? "good" : "warning";
  return { score, filledFields: Math.round(filled), totalFields: total, pct, issues };
}

export function podeAvancar(qm: Record<string, QualityResult>): { pode: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (qm.cnpj?.score === "error") motivos.push("Cartao CNPJ com dados criticos faltando");
  if (qm.faturamento?.score === "error") motivos.push("Faturamento sem dados de media mensal");
  const total = Object.keys(qm).length;
  const errs = Object.values(qm).filter(q => q.score === "error").length;
  if (total > 0 && errs === total) motivos.push("Nenhum documento foi extraido com sucesso");
  return { pode: motivos.length === 0, motivos };
}

export function getAvisos(qm: Record<string, QualityResult>): string[] {
  const labels: Record<string, string> = { cnpj: "Cartao CNPJ", qsa: "QSA", contrato: "Contrato Social", faturamento: "Faturamento", scr: "SCR" };
  return Object.entries(qm)
    .filter(([, q]) => q.score === "warning")
    .map(([type, q]) => `${labels[type] || type}: ${q.issues[0] || "dados incompletos"}`);
}

// ── Helper: accent color from quality score ───────────────────────────────────
export function qualityAccent(score: QualityResult["score"]): string {
  return score === "good" ? "#16a34a" : score === "warning" ? "#d97706" : "#dc2626";
}

```

## components/generate/ExportSection.tsx

```tsx
"use client";

import { Loader2, CheckCircle2, Link2 } from "lucide-react";
import { SectionCard } from "@/components/report/ReportComponents";

type Format = "pdf" | "docx" | "xlsx" | "html";

interface ExportSectionProps {
  generatedFormats: Set<Format>;
  generatingFormat: Format | null;
  generatePDF: () => void;
  generateDOCX: () => void;
  generateExcel: () => void;
  generateHTML: () => void;
  generateHTMLView: () => void;
  shareReport: () => void;
  sharingReport?: boolean;
  sharedUrl?: string;
}

export default function ExportSection({
  generatedFormats,
  generatingFormat,
  generatePDF,
  generateDOCX,
  generateExcel,
  generateHTML,
  generateHTMLView,
  shareReport,
  sharingReport = false,
  sharedUrl,
}: ExportSectionProps) {
  return (
    <SectionCard
      id="sec-ex"
      badge="↓"
      badgeVariant="navy"
      sectionLabel="Download"
      title="Exportar Relatório"
    >
      <div className="px-8 py-6">
        {generatedFormats.size > 0 && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-green-50 border border-green-200 rounded-lg mb-3.5">
            <CheckCircle2 size={14} className="text-green-600" />
            <span className="text-xs font-medium text-green-700">Relatório gerado com sucesso!</span>
          </div>
        )}

        <div className="flex gap-2.5 flex-wrap">
          {([
            { fmt: "pdf"  as Format, label: "PDF",        sub: "Download direto (.pdf)", fn: generatePDF,      ext: ".pdf",  dot: "#dc2626", recommended: true },
            { fmt: "html" as Format, label: "Visualizar", sub: "Abre em nova aba",       fn: generateHTMLView, ext: ".html", dot: "#203b88", recommended: false },
            { fmt: "docx" as Format, label: "Word",       sub: "Editável (.docx)",       fn: generateDOCX,     ext: ".docx", dot: "#2b5eb7", recommended: false },
            { fmt: "xlsx" as Format, label: "Excel",      sub: "Dados tabulados",        fn: generateExcel,    ext: ".xlsx", dot: "#1d6f42", recommended: false },
            { fmt: "html" as Format, label: "HTML",       sub: "Web / impressão",        fn: generateHTML,     ext: ".html", dot: "#e34f26", recommended: false },
          ]).map(({ fmt, label, sub, fn, ext, dot, recommended }) => {
            const done    = generatedFormats.has(fmt);
            const loading = generatingFormat === fmt;
            return (
              <button
                key={label}
                onClick={fn}
                disabled={!!generatingFormat}
                className={`flex-[1_1_140px] flex items-center gap-2.5 px-3.5 py-3 rounded-lg border relative text-left transition-all duration-150 hover:shadow-sm ${
                  done ? "bg-green-50 border-green-200" :
                  recommended ? "bg-blue-50 border-cf-navy" :
                  "bg-white border-gray-200"
                } ${!!generatingFormat ? "cursor-not-allowed" : "cursor-pointer"} ${!!generatingFormat && !loading ? "opacity-55" : "opacity-100"}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: done ? "#16a34a" : dot }} />
                <div className="flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-medium text-cf-text-1">{label}</span>
                    <span className="text-[11px] text-cf-text-4 font-mono">{ext}</span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: loading ? dot : done ? "#16a34a" : undefined }}>
                    {loading ? "Gerando..." : done ? "Pronto!" : <span className="text-cf-text-4">{sub}</span>}
                  </p>
                </div>
                {loading && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: dot }} />}
                {done    && <CheckCircle2 size={14} className="text-green-600 shrink-0" />}
                {recommended && !done && (
                  <span className="absolute -top-2.5 right-2.5 text-[9px] font-bold text-white bg-cf-navy rounded-full px-1.5 py-0.5 tracking-[0.03em]">
                    Recomendado
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Compartilhar — gera link público válido por 90 dias */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={shareReport}
              disabled={sharingReport || !!generatingFormat}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[13px] font-medium transition-all duration-150 hover:shadow-sm
                ${sharedUrl ? "bg-green-50 border-green-200 text-green-700" : "bg-white border-gray-200 text-cf-text-1"}
                ${(sharingReport || !!generatingFormat) ? "opacity-55 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {sharingReport ? (
                <Loader2 size={14} className="animate-spin" />
              ) : sharedUrl ? (
                <CheckCircle2 size={14} className="text-green-600" />
              ) : (
                <Link2 size={14} />
              )}
              {sharingReport ? "Gerando link…" : sharedUrl ? "Link copiado!" : "Compartilhar relatório"}
            </button>

            {sharedUrl && (
              <span className="text-[11px] text-cf-text-4 font-mono truncate max-w-xs select-all" title={sharedUrl}>
                {sharedUrl}
              </span>
            )}
          </div>
          <p className="text-[11px] text-cf-text-4 mt-1.5">
            Gera um link público válido por 90 dias — qualquer pessoa com o link consegue visualizar.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

```

## components/generate/NotasSection.tsx

```tsx
"use client";

import { useEffect, useRef } from "react";
import { SectionCard } from "@/components/report/ReportComponents";

interface NotasSectionProps {
  analystNotes: string;
  onNotesChange: (v: string) => void;
  onSave: (v: string) => void;
  savingNotes: boolean;
}

export default function NotasSection({ analystNotes, onNotesChange, onSave, savingNotes }: NotasSectionProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { onSave(analystNotes); }, 2000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analystNotes]);

  return (
    <SectionCard
      id="sec-nt"
      badge="✎"
      badgeVariant="navy"
      sectionLabel="Observações do Analista"
      title="Anotações"
      headerRight={savingNotes ? <span className="text-[11px] text-cf-text-4">Salvando...</span> : undefined}
    >
      <div className="px-8 py-6">
        <textarea
          value={analystNotes}
          onChange={e => onNotesChange(e.target.value)}
          onBlur={() => { if (debounceRef.current) clearTimeout(debounceRef.current); onSave(analystNotes); }}
          placeholder="Registre aqui observações sobre a empresa, pontos de atenção identificados na visita, pendências de documentação, ou qualquer informação relevante para a tomada de decisão de crédito..."
          className="w-full min-h-[180px] resize-y bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3 text-[13px] text-cf-text-1 leading-relaxed font-sans outline-none focus:border-navy-800 focus:ring-1 focus:ring-navy-800/20 placeholder:text-cf-text-4"
        />
        <div className="flex justify-between mt-1.5 px-0.5">
          <span className="text-[11px] text-cf-text-4">Salvo automaticamente</span>
          <span className="text-[11px] text-cf-text-4 font-mono">{analystNotes.length} caracteres</span>
        </div>
      </div>
    </SectionCard>
  );
}

```

## components/generate/VisitaSection.tsx

```tsx
"use client";

import { SectionCard, KpiCard } from "@/components/report/ReportComponents";
import type { ExtractedData } from "@/types";

interface VisitaSectionProps {
  data: ExtractedData;
}

export default function VisitaSection({ data }: VisitaSectionProps) {
  if (!data.relatorioVisita) return null;

  const rv = data.relatorioVisita;

  return (
    <SectionCard
      id="sec-op"
      badge="OP"
      badgeVariant="teal"
      sectionLabel="Parâmetros Operacionais"
      title="Relatório de Visita"
    >
      <div className="px-8 py-6 flex flex-col gap-6">

        {/* Taxas e Limites */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Taxas e Limites</p>
          <div className="kpi-grid">
            {([
              ["Taxa Convencional",    rv.taxaConvencional],
              ["Taxa Comissária",      rv.taxaComissaria],
              ["Limite Total",         rv.limiteTotal        ? `R$ ${rv.limiteTotal}` : ""],
              ["Limite Convencional",  rv.limiteConvencional ? `R$ ${rv.limiteConvencional}` : ""],
              ["Limite Comissária",    rv.limiteComissaria   ? `R$ ${rv.limiteComissaria}` : ""],
              ["Limite por Sacado",    rv.limitePorSacado    ? `R$ ${rv.limitePorSacado}` : ""],
              ["Ticket Médio",         rv.ticketMedio        ? `R$ ${rv.ticketMedio}` : ""],
              ["Cobr. Boleto",         rv.valorCobrancaBoleto ? `R$ ${rv.valorCobrancaBoleto}` : ""],
            ] as [string, string | undefined][]).map(([label, value]) => (
              <KpiCard key={label} label={label} value={value || "—"} />
            ))}
          </div>
        </div>

        {/* Condições e Prazos */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Condições e Prazos</p>
          <div className="kpi-grid">
            {([
              ["Prazo Recompra",   rv.prazoRecompraCedente ? `${rv.prazoRecompraCedente} dias` : ""],
              ["Envio Cartório",   rv.prazoEnvioCartorio   ? `${rv.prazoEnvioCartorio} dias` : ""],
              ["Prazo Máximo Op.", rv.prazoMaximoOp        ? `${rv.prazoMaximoOp} dias` : ""],
              ["Cobrança TAC",     rv.cobrancaTAC],
              ["Tranche",          rv.tranche              ? `R$ ${rv.tranche}` : ""],
              ["Prazo Tranche",    rv.prazoTranche         ? `${rv.prazoTranche} dias` : ""],
            ] as [string, string | undefined][]).map(([label, value]) => (
              <KpiCard key={label} label={label} value={value || "—"} />
            ))}
          </div>
        </div>

        {/* Dados da Empresa */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Dados da Empresa</p>
          <div className="kpi-grid">
            {([
              ["Funcionários",        String(rv.funcionariosObservados || "—")],
              ["Folha Pagamento",     rv.folhaPagamento         ? `R$ ${rv.folhaPagamento}` : ""],
              ["Endiv. Banco",        rv.endividamentoBanco],
              ["Endiv. Factoring",    rv.endividamentoFactoring],
              ["Vendas Cheque",       rv.vendasCheque],
              ["Vendas Duplicata",    rv.vendasDuplicata],
              ["Vendas Outras",       rv.vendasOutras],
              ["Prazo Faturamento",   rv.prazoMedioFaturamento  ? `${rv.prazoMedioFaturamento} dias` : ""],
              ["Prazo Entrega",       rv.prazoMedioEntrega      ? `${rv.prazoMedioEntrega} dias` : ""],
            ] as [string, string | undefined][]).map(([label, value]) => (
              <KpiCard key={label} label={label} value={value || "—"} />
            ))}
          </div>
          {rv.referenciasFornecedores && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-1">Referências Comerciais (texto)</p>
              <p className="text-[13px] text-cf-text-2 leading-relaxed">{rv.referenciasFornecedores}</p>
            </div>
          )}
        </div>

        {/* Referências Comerciais Estruturadas */}
        {rv.referenciasComerciais && rv.referenciasComerciais.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Referências Comerciais</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Empresa</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Tipo</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Tempo</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Contato</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Limite</th>
                    <th className="text-center py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Pgto.</th>
                  </tr>
                </thead>
                <tbody>
                  {rv.referenciasComerciais.map((ref, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-800">
                        <div>{ref.empresa}</div>
                        {ref.cnpj && <div className="text-[10px] text-gray-400 font-mono">{ref.cnpj}</div>}
                      </td>
                      <td className="py-2 px-3 text-gray-600">{ref.tipoRelacionamento || "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{ref.tempoRelacionamento || "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{ref.contato || "—"}</td>
                      <td className="py-2 px-3 text-right font-mono text-gray-700">{ref.limiteConcelidado || "—"}</td>
                      <td className="py-2 px-3 text-center">
                        {ref.avaliacaoPagamento ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ref.avaliacaoPagamento === "boa" ? "bg-green-100 text-green-700" :
                            ref.avaliacaoPagamento === "regular" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {ref.avaliacaoPagamento}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

```

## components/report/ReportComponents.tsx

```tsx
"use client";
import React from "react";
import { Check, X, AlertTriangle } from "lucide-react";

// ── Badge variants ──────────────────────────────────────────────────────────
type BadgeVariant = "navy" | "teal" | "blue" | "amber" | "red";
const BADGE_BG: Record<BadgeVariant, string> = {
  navy:  "#132952",
  teal:  "#0891b2",
  blue:  "#3b82f6",
  amber: "#d4940a",
  red:   "#c53030",
};

// ── SectionCard ─────────────────────────────────────────────────────────────
export interface SectionCardProps {
  id?: string;
  badge: string;
  badgeVariant?: BadgeVariant;
  sectionLabel: string;
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({
  id, badge, badgeVariant = "navy", sectionLabel, title, headerRight, children, className = "",
}: SectionCardProps) {
  return (
    <div
      id={id}
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between px-8 py-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: BADGE_BG[badgeVariant] }}
          >
            <span className="text-[15px] font-bold text-white tracking-wide">{badge}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.08em] mb-0.5">
              {sectionLabel}
            </p>
            <p className="text-xl font-bold text-navy-900 leading-tight">{title}</p>
          </div>
        </div>
        {headerRight && (
          <div className="flex items-center gap-2.5 flex-shrink-0">{headerRight}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── KpiCard ─────────────────────────────────────────────────────────────────
type KpiVariant = "default" | "danger" | "warning" | "success";

const KPI_STYLES: Record<KpiVariant, { bg: string; border: string; valueColor: string }> = {
  default: { bg: "bg-white",       border: "border-gray-200",    valueColor: "text-navy-900" },
  danger:  { bg: "bg-red-50",      border: "border-red-100",     valueColor: "text-red-600" },
  warning: { bg: "bg-amber-50",    border: "border-amber-100",   valueColor: "text-amber-500" },
  success: { bg: "bg-green-50",    border: "border-green-100",   valueColor: "text-green-600" },
};

export interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  variant?: KpiVariant;
}

export function KpiCard({ label, value, sub, variant = "default" }: KpiCardProps) {
  const s = KPI_STYLES[variant];
  const isMoney = /^R\$|^\d/.test(value);
  return (
    <div className={`${s.bg} ${s.border} border rounded-2xl p-6`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.08em] mb-3">
        {label}
      </p>
      <p className={`text-2xl font-bold leading-tight ${s.valueColor} ${isMoney ? "font-mono" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-[13px] text-gray-500 mt-2.5">{sub}</p>}
    </div>
  );
}

// ── StatusPill ──────────────────────────────────────────────────────────────
type PillVariant = "red" | "yellow" | "green" | "gray";

const PILL_STYLES: Record<PillVariant, { bg: string; text: string; border: string; dot: string }> = {
  red:    { bg: "bg-red-50",    text: "text-red-600",    border: "border-red-100",    dot: "bg-red-600" },
  yellow: { bg: "bg-amber-50",  text: "text-amber-500",  border: "border-amber-100",  dot: "bg-amber-500" },
  green:  { bg: "bg-green-50",  text: "text-green-600",  border: "border-green-100",  dot: "bg-green-600" },
  gray:   { bg: "bg-gray-100",  text: "text-gray-500",   border: "border-gray-200",   dot: "bg-gray-400" },
};

export interface StatusPillProps {
  label: string;
  variant: PillVariant;
  dot?: boolean;
}

export function StatusPill({ label, variant, dot = false }: StatusPillProps) {
  const s = PILL_STYLES[variant];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium border whitespace-nowrap ${s.bg} ${s.text} ${s.border}`}>
      {dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />}
      {label}
    </span>
  );
}

// ── CriteriaItem ────────────────────────────────────────────────────────────
type CriterionStatus = "ok" | "warning" | "error" | "unknown";

export interface CriteriaItemProps {
  status: CriterionStatus;
  name: string;
  eliminatorio?: boolean;
  limit: string;
  value: string;
  detail?: string;
}

export function CriteriaItem({ status, name, eliminatorio, limit, value, detail }: CriteriaItemProps) {
  const isOk      = status === "ok";
  const isWarn    = status === "warning";
  const isError   = status === "error";

  const iconClasses = isOk
    ? "bg-green-50 border-green-200 text-green-600"
    : isWarn
    ? "bg-amber-50 border-amber-200 text-amber-500"
    : isError
    ? "bg-red-50 border-red-200 text-red-600"
    : "bg-gray-100 border-gray-200 text-gray-400";

  const valueColor = isOk ? "text-green-600" : isWarn ? "text-amber-500" : isError ? "text-red-600" : "text-gray-400";
  const rowBg = isError ? "bg-red-50/50" : isWarn ? "bg-amber-50/30" : "";

  return (
    <div className={`grid grid-cols-[32px_1.2fr_1fr_1fr] items-center gap-4 px-6 py-4 ${rowBg}`}>
      <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 ${iconClasses}`}>
        {isOk      && <Check size={14} />}
        {isWarn    && <span className="text-sm font-bold">!</span>}
        {isError   && <X size={14} />}
        {status === "unknown" && <span className="text-sm">?</span>}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-0.5">{name}</p>
        {eliminatorio && isError && (
          <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-100 px-2 py-0.5 rounded">
            ELIMINATÓRIO
          </span>
        )}
        {detail && !isError && (
          <p className="text-[11px] text-gray-400 mt-0.5">{detail}</p>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] mb-1">Limite do Fundo</p>
        <p className="text-sm font-medium text-gray-700">{limit}</p>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] mb-1">Apurado</p>
        <p className={`text-sm font-semibold ${valueColor}`}>{value}</p>
        {detail && isError && (
          <p className={`text-[11px] mt-0.5 ${valueColor} opacity-80`}>{detail}</p>
        )}
      </div>
    </div>
  );
}

// ── MetricBarChart ───────────────────────────────────────────────────────────
export interface MetricBarItem {
  label: string;
  count: number;
  pct: number;
  highlight?: boolean;
}

export function MetricBarChart({ items }: { items: MetricBarItem[] }) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="text-[13px] font-medium text-gray-700 w-48 flex-shrink-0 truncate">
            {item.label}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-[6px]">
            <div
              className={`h-[6px] rounded-full transition-all duration-400 ${
                item.highlight ? "bg-red-600" : "bg-navy-800"
              }`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="text-[13px] font-semibold text-gray-700 w-8 text-right flex-shrink-0">
            {item.count}
          </span>
          <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">
            {item.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── ScrTable ────────────────────────────────────────────────────────────────
export interface ScrTableProps {
  columns: string[];
  rows: (string | React.ReactNode)[][];
}

export function ScrTable({ columns, rows }: ScrTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-navy-900">
            {columns.map((col, i) => (
              <th
                key={i}
                className="text-[11px] font-semibold text-white uppercase tracking-[0.06em] text-left px-4 py-3"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={`${ri % 2 === 1 ? "bg-gray-50/70" : "bg-white"} hover:bg-gray-50 transition-colors`}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`text-[13px] text-gray-900 px-4 py-3 ${
                    ri < rows.length - 1 ? "border-b border-gray-100" : ""
                  } ${ci > 0 ? "font-mono" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── AlertBanner ──────────────────────────────────────────────────────────────
export interface AlertBannerProps {
  variant: "danger" | "warn";
  label: string;
  message: string;
}

export function AlertBanner({ variant, label, message }: AlertBannerProps) {
  const isDanger = variant === "danger";
  return (
    <div className={`flex items-start gap-3.5 px-6 py-5 rounded-xl border ${
      isDanger ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
    }`}>
      <AlertTriangle size={18} className={`flex-shrink-0 mt-0.5 ${isDanger ? "text-red-600" : "text-amber-500"}`} />
      <div className="flex gap-2 flex-wrap items-baseline">
        <span className={`text-sm font-bold ${isDanger ? "text-red-600" : "text-amber-500"}`}>{label}</span>
        <span className={`text-sm ${isDanger ? "text-red-900" : "text-amber-900"}`}>{message}</span>
      </div>
    </div>
  );
}

// ── ResultadoBox ────────────────────────────────────────────────────────────
type ResultadoVariant = "aprovado" | "reprovado" | "pendente";

const RESULTADO_STYLES: Record<ResultadoVariant, { container: string; text: string; badge: string }> = {
  aprovado:  { container: "bg-green-50 border-green-100", text: "text-green-600", badge: "bg-green-600" },
  reprovado: { container: "bg-red-50 border-red-100",     text: "text-red-600",   badge: "bg-red-600" },
  pendente:  { container: "bg-amber-50 border-amber-100", text: "text-amber-500", badge: "bg-amber-500" },
};

export interface ResultadoBoxProps {
  title: string;
  sub: string;
  badge: string;
  variant: ResultadoVariant;
}

export function ResultadoBox({ title, sub, badge, variant }: ResultadoBoxProps) {
  const s = RESULTADO_STYLES[variant];
  return (
    <div className={`flex items-center justify-between gap-4 px-6 py-5 rounded-xl border ${s.container}`}>
      <div>
        <p className={`text-base font-semibold ${s.text} mb-1`}>{title}</p>
        <p className={`text-sm ${s.text} opacity-75`}>{sub}</p>
      </div>
      <span className={`text-sm font-bold text-white rounded-md px-4 py-2 whitespace-nowrap flex-shrink-0 uppercase tracking-wide ${s.badge}`}>
        {badge}
      </span>
    </div>
  );
}

```

## components/score/ScoreForm.tsx

```tsx
"use client";

import { useState, useMemo } from "react";
import { CheckCircle, Circle, AlertTriangle } from "lucide-react";
import type {
  ConfiguracaoPolitica,
  CriterioPilar,
  PilarPolitica,
  RespostaCriterio,
  ScoreResult,
} from "@/types/politica-credito";
import { calcularScore, calcularPontosCriterio } from "@/lib/politica-credito/calculator";
import { PolicyVersionBanner } from "@/components/politica/PolicyVersionBanner";

interface Props {
  config: ConfiguracaoPolitica;
  initialRespostas?: RespostaCriterio[];
  onScoreCalculated?: (score: ScoreResult, respostas: RespostaCriterio[]) => void;
  readOnly?: boolean;
}

const MANUAIS_OBRIGATORIOS = [
  'segmento', 'estrutura_fisica', 'garantias',
  'patrimonio_socios', 'risco_sucessao',
];

const PILAR_COLORS: Record<string, string> = {
  perfil_empresa:    "#73b815",
  saude_financeira:  "#d97706",
  risco_compliance:  "#dc2626",
  socios_governanca: "#7c3aed",
  estrutura_operacao:"#203b88",
};

export function ScoreForm({ config, initialRespostas = [], onScoreCalculated, readOnly = false }: Props) {
  const [respostas, setRespostas] = useState<RespostaCriterio[]>(initialRespostas);
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [expandedPilares, setExpandedPilares] = useState<Set<string>>(
    new Set(config.pilares.map(p => p.id))
  );

  const score = useMemo(() => calcularScore(config, respostas), [config, respostas]);
  const ratingFaixa = config.faixas_rating.find(f => f.rating === score.rating);

  const totalCriterios = config.pilares.flatMap(p => p.criterios).length;
  const progresso = totalCriterios > 0 ? Math.round((respostas.length / totalCriterios) * 100) : 0;

  const getResp = (criterioId: string, pilarId: string) =>
    respostas.find(r => r.criterio_id === criterioId && r.pilar_id === pilarId);

  const setResposta = (pilarId: string, criterioId: string, opcaoLabel: string, pontos_base: number, modLabel?: string, modMult?: number) => {
    const pontos_final = calcularPontosCriterio(pontos_base, modMult);
    const nova: RespostaCriterio = {
      criterio_id: criterioId, pilar_id: pilarId,
      opcao_label: opcaoLabel, pontos_base, pontos_final,
      modificador_label: modLabel, modificador_multiplicador: modMult,
      observacao: observacoes[`${pilarId}-${criterioId}`],
      fonte_preenchimento: 'manual',
    };
    const novas = [...respostas.filter(r => !(r.criterio_id === criterioId && r.pilar_id === pilarId)), nova];
    setRespostas(novas);
    onScoreCalculated?.(calcularScore(config, novas), novas);
  };

  const setObs = (pilarId: string, criterioId: string, obs: string) => {
    const key = `${pilarId}-${criterioId}`;
    setObservacoes(prev => ({ ...prev, [key]: obs }));
    setRespostas(prev => prev.map(r =>
      r.criterio_id === criterioId && r.pilar_id === pilarId ? { ...r, observacao: obs } : r
    ));
  };

  const togglePilar = (id: string) =>
    setExpandedPilares(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolicyVersionBanner version={config.versao} compact />

      {/* Score em tempo real */}
      <div style={{
        background: "white", borderRadius: 16, border: "1px solid #e8edf5",
        padding: "20px 24px", display: "flex", alignItems: "center", gap: 20,
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}>
        {/* Gauge */}
        <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
          <svg viewBox="0 0 80 80" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
            <circle cx="40" cy="40" r="32" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle
              cx="40" cy="40" r="32" fill="none"
              stroke={ratingFaixa?.cor ?? "#e5e7eb"}
              strokeWidth="10"
              strokeDasharray={`${(score.score_final / 100) * 201} 201`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.4s" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: ratingFaixa?.cor ?? "#374151", lineHeight: 1 }}>
              {score.score_final.toFixed(0)}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af" }}>/ 100</span>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: ratingFaixa?.cor ?? "#374151" }}>
              Rating {score.rating}
            </span>
            {ratingFaixa && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                — {ratingFaixa.interpretacao}
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: score.confianca_score === "alta" ? "#16a34a" : score.confianca_score === "parcial" ? "#d97706" : "#dc2626",
              background: score.confianca_score === "alta" ? "#f0fdf4" : score.confianca_score === "parcial" ? "#fffbeb" : "#fef2f2",
              border: `1px solid ${score.confianca_score === "alta" ? "#bbf7d0" : score.confianca_score === "parcial" ? "#fcd34d" : "#fecaca"}`,
              borderRadius: 5, padding: "2px 7px",
            }}>
              Confiança {score.confianca_score.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${progresso}%`, background: "#203b88", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, flexShrink: 0 }}>
              {respostas.length}/{totalCriterios} critérios
            </span>
          </div>

          {score.pilares_pendentes.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={12} style={{ color: "#d97706" }} />
              <span style={{ fontSize: 11, color: "#d97706" }}>
                Score parcial — aguardando calibração: {score.pilares_pendentes.join(", ")}
              </span>
            </div>
          )}

          {ratingFaixa && (
            <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0" }}>
              {ratingFaixa.leitura_risco} · Reanálise em {ratingFaixa.periodicidade_reanalise_dias} dias
            </p>
          )}
        </div>
      </div>

      {/* Pilares */}
      {config.pilares.map(pilar => {
        const cor = PILAR_COLORS[pilar.id] ?? "#203b88";
        const expanded = expandedPilares.has(pilar.id);
        const pontosBrutos = score.pontos_brutos[pilar.id] ?? 0;
        const pontosPonderados = score.pontuacao_ponderada[pilar.id] ?? 0;
        const pilarRespostas = respostas.filter(r => r.pilar_id === pilar.id);
        const pilarProgresso = pilar.criterios.length > 0 ? pilarRespostas.length / pilar.criterios.length : 0;

        return (
          <div key={pilar.id} style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
            <button
              onClick={() => togglePilar(pilar.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: cor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>{pilar.nome}</p>
                  {pilar.status_calibracao === "pendente_calibracao" && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#d97706", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 4, padding: "1px 5px" }}>
                      AGUARDANDO CALIBRAÇÃO
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 80, height: 4, background: "#f1f5f9", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${pilarProgresso * 100}%`, background: cor, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>{pilarRespostas.length}/{pilar.criterios.length}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 900, color: cor, margin: 0 }}>
                  {pontosBrutos.toFixed(1)} / {pilar.pontos_totais}
                </p>
                <p style={{ fontSize: 10, color: "#9ca3af", margin: 0 }}>{pontosPonderados.toFixed(1)} pts pond.</p>
              </div>
              <span style={{ color: "#9ca3af", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
            </button>

            {expanded && (
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                {pilar.criterios.map(criterio => (
                  <CriterioItem
                    key={criterio.id}
                    criterio={criterio}
                    pilar={pilar}
                    cor={cor}
                    resp={getResp(criterio.id, pilar.id)}
                    obsValue={observacoes[`${pilar.id}-${criterio.id}`] ?? ""}
                    onSelect={(opcaoLabel, pontosBase, modLabel, modMult) =>
                      setResposta(pilar.id, criterio.id, opcaoLabel, pontosBase, modLabel, modMult)
                    }
                    onObs={obs => setObs(pilar.id, criterio.id, obs)}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-componente por critério (tem estado próprio) ─────────────────────────
interface CriterioItemProps {
  criterio: CriterioPilar;
  pilar: PilarPolitica;
  cor: string;
  resp: RespostaCriterio | undefined;
  obsValue: string;
  onSelect: (opcaoLabel: string, pontosBase: number, modLabel?: string, modMult?: number) => void;
  onObs: (obs: string) => void;
  readOnly: boolean;
}

function CriterioItem({ criterio, cor, resp, obsValue, onSelect, onObs, readOnly }: CriterioItemProps) {
  const [showObs, setShowObs] = useState(false);

  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid #f8fafc" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ marginTop: 2 }}>
          {resp
            ? <CheckCircle size={15} style={{ color: "#16a34a" }} />
            : <Circle size={15} style={{ color: "#d1d5db" }} />
          }
        </div>
        <div style={{ flex: 1 }}>
          {/* Nome + badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{criterio.nome}</p>
            {resp?.fonte_preenchimento === 'auto' && (
              <span style={{
                fontSize: '10px', fontWeight: 500, padding: '1px 6px',
                borderRadius: '99px', background: '#e0f2fe', color: '#0369a1',
                verticalAlign: 'middle',
              }}>
                Auto
              </span>
            )}
            {!resp && MANUAIS_OBRIGATORIOS.includes(criterio.id) && (
              <span style={{
                fontSize: '10px', fontWeight: 500, padding: '1px 6px',
                borderRadius: '99px', background: '#fef9c3', color: '#854d0e',
                verticalAlign: 'middle',
              }}>
                Obrigatório
              </span>
            )}
            {criterio.obrigatorio && (
              <span style={{ fontSize: 9, fontWeight: 800, color: "#dc2626", background: "#fef2f2", borderRadius: 3, padding: "1px 5px" }}>
                OBRIG.
              </span>
            )}
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
              máx. {criterio.pontos_maximos} pts
            </span>
          </div>

          {criterio.observacao && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px", fontStyle: "italic" }}>
              {criterio.observacao}
            </p>
          )}

          {/* Modificadores */}
          {criterio.modificadores && criterio.modificadores.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#374151", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Tipo de validação
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {criterio.modificadores.map(mod => {
                  const modSel = resp?.modificador_label === mod.label;
                  return (
                    <button
                      key={mod.label}
                      disabled={readOnly || !resp}
                      onClick={() => resp && onSelect(resp.opcao_label, resp.pontos_base, mod.label, mod.multiplicador)}
                      style={{
                        padding: "4px 10px", fontSize: 11, fontWeight: modSel ? 700 : 500,
                        color: modSel ? "#7c3aed" : "#6b7280",
                        background: modSel ? "#faf5ff" : "white",
                        border: `1px solid ${modSel ? "#c4b5fd" : "#e5e7eb"}`,
                        borderRadius: 6, cursor: readOnly || !resp ? "default" : "pointer",
                      }}
                    >
                      {mod.label} (×{mod.multiplicador})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Opções */}
          {criterio.opcoes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {criterio.opcoes.map(opcao => {
                const sel = resp?.opcao_label === opcao.label;
                const pontosExibidos = resp?.modificador_multiplicador && sel
                  ? calcularPontosCriterio(opcao.pontos, resp.modificador_multiplicador).toFixed(1)
                  : String(opcao.pontos);
                return (
                  <button
                    key={opcao.label}
                    disabled={readOnly}
                    onClick={() => onSelect(opcao.label, opcao.pontos, resp?.modificador_label, resp?.modificador_multiplicador)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "9px 12px", textAlign: "left", width: "100%",
                      background: sel ? `${cor}12` : "white",
                      border: `1px solid ${sel ? cor : "#e5e7eb"}`,
                      borderRadius: 8, cursor: readOnly ? "default" : "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      border: `2px solid ${sel ? cor : "#d1d5db"}`,
                      background: sel ? cor : "transparent",
                    }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: sel ? "#0f172a" : "#374151", margin: "0 0 2px" }}>
                        {opcao.label}
                      </p>
                      <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{opcao.descricao}</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: sel ? cor : "#9ca3af", flexShrink: 0 }}>
                      {pontosExibidos} pts
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "8px 12px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 11, color: "#92400e" }}>
              Opções não calibradas — aguardando definição da pontuação V2.
            </div>
          )}

          {/* Observação */}
          {resp && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setShowObs(v => !v)}
                style={{ fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {showObs ? "▲ Ocultar observação" : "▼ Adicionar observação"}
              </button>
              {showObs && (
                <textarea
                  value={obsValue}
                  onChange={e => onObs(e.target.value)}
                  placeholder="Observação sobre este critério..."
                  rows={2}
                  style={{
                    display: "block", width: "100%", marginTop: 6,
                    border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px",
                    fontSize: 12, color: "#374151", resize: "vertical", outline: "none", boxSizing: "border-box",
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

```

## components/score/ScoreSection.tsx

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, ChevronDown, ChevronUp, BarChart3, Settings, PenLine, AlertCircle, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ConfiguracaoPolitica, RespostaCriterio, ScoreResult } from "@/types/politica-credito";
import { DEFAULT_POLITICA_V2, mergeComDefaults } from "@/lib/politica-credito/defaults";
import { autoPreencherScore } from "@/lib/politica-credito/auto-score";
import type { ExtractedData } from "@/types";
import { ScoreForm } from "./ScoreForm";
import { ScoreSummaryCard } from "./ScoreSummaryCard";
// import { PolicyVersionBanner } from "@/components/politica/PolicyVersionBanner";

interface Props {
  collectionId: string;
  extractedData?: ExtractedData;
}

type ViewMode = "form" | "summary";

export function ScoreSection({ collectionId, extractedData }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("form");
  const [noPolicy, setNoPolicy] = useState(false);

  const [policy, setPolicy] = useState<ConfiguracaoPolitica | null>(null);
  const [respostas, setRespostas] = useState<RespostaCriterio[]>([]);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [scoreId, setScoreId] = useState<string | null>(null);
  const [preenchidoPor, setPreenchidoPor] = useState<string | null>(null);

  const [autoGerado, setAutoGerado] = useState(false);
  const [criteriosManuaisPendentes, setCriteriosManuaisPendentes] = useState<string[]>([]);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = useRef<string | null>(null);

  // ── Load: auth + policy + existing score ─────────────────────────────────
  useEffect(() => {
    if (!collectionId) return;
    const load = async () => {
      try {
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        userId.current = user.id;

        // Load policy config
        const { data: policyData } = await supabase
          .from("politica_credito_config")
          .select("*")
          .eq("user_id", user.id)
          .order("atualizado_em", { ascending: false })
          .limit(1)
          .maybeSingle();

        let resolvedPolicy: ConfiguracaoPolitica;
        if (policyData) {
          resolvedPolicy = mergeComDefaults(policyData as Record<string, unknown>);
          setPolicy(resolvedPolicy);
        } else {
          resolvedPolicy = DEFAULT_POLITICA_V2;
          setPolicy(DEFAULT_POLITICA_V2);
          setNoPolicy(true);
        }

        // Load existing score for this collection
        const { data: scoreData } = await supabase
          .from("score_operacoes")
          .select("*")
          .eq("collection_id", collectionId)
          .order("preenchido_em", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (scoreData) {
          setScoreId(scoreData.id);
          setRespostas(scoreData.respostas ?? []);
          setScoreResult(scoreData.score_result ?? null);
          setSavedAt(scoreData.preenchido_em);
          setPreenchidoPor(scoreData.preenchido_por ?? null);
          if (scoreData.score_result) setViewMode("summary");
        } else if (extractedData) {
          // Nenhum score salvo — auto-preenche a partir dos documentos extraídos
          const resultado = autoPreencherScore(extractedData, resolvedPolicy, []);
          const now = new Date().toISOString();
          const payload = {
            collection_id: collectionId,
            cedente_cnpj: null,
            versao_politica: resultado.score.versao_politica,
            score_result: resultado.score,
            respostas: resultado.respostas,
            preenchido_por: user.id,
            preenchido_em: now,
          };
          const { data: inserted } = await supabase
            .from("score_operacoes")
            .insert(payload)
            .select("id")
            .single();
          if (inserted?.id) setScoreId(inserted.id);
          setRespostas(resultado.respostas);
          setScoreResult(resultado.score);
          setSavedAt(now);
          setPreenchidoPor(user.id);
          setAutoGerado(true);
          setCriteriosManuaisPendentes(resultado.criterios_manuais);
          setViewMode("summary");
        }
      } catch (err) {
        console.warn("[ScoreSection] load error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [collectionId]);

  // ── Save to score_operacoes ───────────────────────────────────────────────
  const persist = useCallback(async (result: ScoreResult, resps: RespostaCriterio[]) => {
    if (!collectionId || !userId.current) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const payload = {
        collection_id: collectionId,
        cedente_cnpj: null,
        versao_politica: result.versao_politica,
        score_result: result,
        respostas: resps,
        preenchido_por: userId.current,
        preenchido_em: now,
      };

      if (scoreId) {
        await supabase.from("score_operacoes").update(payload).eq("id", scoreId);
      } else {
        const { data } = await supabase
          .from("score_operacoes")
          .insert(payload)
          .select("id")
          .single();
        if (data?.id) setScoreId(data.id);
      }
      setSavedAt(now);
    } catch (err) {
      console.warn("[ScoreSection] save error:", err);
    } finally {
      setSaving(false);
    }
  }, [collectionId, scoreId]);

  // ── Autosave debounced ────────────────────────────────────────────────────
  const handleScoreCalculated = useCallback((result: ScoreResult, resps: RespostaCriterio[]) => {
    setScoreResult(result);
    setRespostas(resps);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => persist(result, resps), 2000);
  }, [persist]);

  // ── Render ────────────────────────────────────────────────────────────────
  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, cursor: "pointer", padding: "18px 20px",
    background: "transparent", border: "none", width: "100%", textAlign: "left",
  };

  const ratingFaixa = scoreResult && policy
    ? policy.faixas_rating.find(f => f.rating === scoreResult.rating)
    : null;

  return (
    <div id="score-section" style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
      marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)", overflow: "hidden",
    }}>
      {/* Header */}
      <button style={sectionHeaderStyle} onClick={() => setCollapsed(v => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #1a2f6b, #203b88)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BarChart3 size={15} style={{ color: "#a8d96b" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Score de Crédito
              </p>
              <span style={{
                fontSize: 9, fontWeight: 800, color: "#d97706",
                background: "#fffbeb", border: "1px solid #fbbf24",
                borderRadius: 4, padding: "1px 5px",
              }}>V2</span>
              {scoreResult && ratingFaixa && (
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: ratingFaixa.cor,
                  background: `${ratingFaixa.cor}18`,
                  border: `1px solid ${ratingFaixa.cor}44`,
                  borderRadius: 6, padding: "2px 8px",
                }}>
                  {scoreResult.score_final.toFixed(0)} pts · Rating {scoreResult.rating}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {scoreResult
                ? `Preenchido${savedAt ? ` · ${new Date(savedAt).toLocaleString("pt-BR")}` : ""}${saving ? " · salvando..." : " · salvo"}`
                : "Preencha o score estruturado pela Política V2"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "#9ca3af" }} />}
          {collapsed ? <ChevronDown size={16} style={{ color: "#9ca3af" }} /> : <ChevronUp size={16} style={{ color: "#9ca3af" }} />}
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "20px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 80 }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
            </div>
          ) : !policy ? null : (
            <>
              {scoreResult && policy && scoreResult.versao_politica !== policy.versao && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  background: "#fffbeb", border: "1px solid #fcd34d",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                }}>
                  <AlertCircle size={15} style={{ color: "#d97706", marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", margin: "0 0 2px" }}>
                      Score desatualizado
                    </p>
                    <p style={{ fontSize: 11, color: "#b45309", margin: 0 }}>
                      Calculado com a política <strong>{scoreResult.versao_politica}</strong>, mas a vigente é <strong>{policy.versao}</strong>. Recalcule para refletir os critérios atuais.
                    </p>
                  </div>
                </div>
              )}

              {noPolicy && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  background: "#eff6ff", border: "1px solid #93c5fd",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                }}>
                  <Settings size={15} style={{ color: "#2563eb", marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", margin: "0 0 2px" }}>
                      Usando política padrão V2
                    </p>
                    <p style={{ fontSize: 11, color: "#3b82f6", margin: 0 }}>
                      Nenhuma configuração salva encontrada. Configure os parâmetros em{" "}
                      <a href="/configuracoes" target="_blank" style={{ fontWeight: 700, color: "#2563eb" }}>
                        Configurações → Política de Crédito V2
                      </a>
                      {" "}para personalizar os pesos e critérios.
                    </p>
                  </div>
                </div>
              )}

              {/* Banner auto-gerado */}
              {autoGerado && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  background: "#f0fdf4", border: "1px solid #86efac",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                }}>
                  <Zap size={15} style={{ color: "#16a34a", marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#15803d", margin: "0 0 2px" }}>
                      Score gerado automaticamente
                    </p>
                    <p style={{ fontSize: 11, color: "#166534", margin: 0 }}>
                      Calculado com base nos documentos enviados.
                      {criteriosManuaisPendentes.length > 0
                        ? ` ${criteriosManuaisPendentes.length} critério${criteriosManuaisPendentes.length > 1 ? "s precisam" : " precisa"} de revisão manual para maior precisão.`
                        : " Todos os critérios foram preenchidos automaticamente."}
                    </p>
                  </div>
                  {criteriosManuaisPendentes.length > 0 && (
                    <button
                      onClick={() => setViewMode("form")}
                      style={{
                        fontSize: 11, fontWeight: 700, color: "#15803d",
                        background: "white", border: "1px solid #86efac",
                        borderRadius: 6, padding: "4px 10px", cursor: "pointer", flexShrink: 0,
                      }}
                    >
                      Revisar
                    </button>
                  )}
                </div>
              )}

              {/* Toggle form ↔ summary */}
              {scoreResult && (
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                  <button
                    onClick={() => setViewMode("summary")}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", fontSize: 12, fontWeight: viewMode === "summary" ? 700 : 500,
                      color: viewMode === "summary" ? "#203b88" : "#6b7280",
                      background: viewMode === "summary" ? "#f0f4ff" : "white",
                      border: `1px solid ${viewMode === "summary" ? "#c7d2fe" : "#e5e7eb"}`,
                      borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    <BarChart3 size={12} /> Resumo
                  </button>
                  <button
                    onClick={() => setViewMode("form")}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", fontSize: 12, fontWeight: viewMode === "form" ? 700 : 500,
                      color: viewMode === "form" ? "#203b88" : "#6b7280",
                      background: viewMode === "form" ? "#f0f4ff" : "white",
                      border: `1px solid ${viewMode === "form" ? "#c7d2fe" : "#e5e7eb"}`,
                      borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    <PenLine size={12} /> Editar / Preencher
                  </button>
                </div>
              )}

              {viewMode === "summary" && scoreResult ? (
                <ScoreSummaryCard
                  score={scoreResult}
                  config={policy}
                  preenchidoEm={savedAt ?? undefined}
                  preenchidoPor={preenchidoPor ?? undefined}
                />
              ) : (
                <ScoreForm
                  config={policy}
                  initialRespostas={respostas}
                  onScoreCalculated={handleScoreCalculated}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

```

## components/score/ScoreSummaryCard.tsx

```tsx
"use client";

import type { ScoreResult, ConfiguracaoPolitica } from "@/types/politica-credito";
import { PolicyVersionBanner } from "@/components/politica/PolicyVersionBanner";

interface Props {
  score: ScoreResult;
  config: ConfiguracaoPolitica;
  preenchidoEm?: string;
  preenchidoPor?: string;
}

const PILAR_LABELS: Record<string, string> = {
  perfil_empresa:    "Perfil da Empresa",
  saude_financeira:  "Saúde Financeira",
  risco_compliance:  "Risco e Compliance",
  socios_governanca: "Sócios e Governança",
  estrutura_operacao:"Estrutura da Operação",
};

const PILAR_COLORS: Record<string, string> = {
  perfil_empresa:    "#73b815",
  saude_financeira:  "#d97706",
  risco_compliance:  "#dc2626",
  socios_governanca: "#7c3aed",
  estrutura_operacao:"#203b88",
};

export function ScoreSummaryCard({ score, config, preenchidoEm, preenchidoPor }: Props) {
  const ratingFaixa = config.faixas_rating.find(f => f.rating === score.rating);
  const ratingCor = ratingFaixa?.cor ?? "#e5e7eb";

  const pilarOrder = ["perfil_empresa", "saude_financeira", "risco_compliance", "socios_governanca", "estrutura_operacao"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolicyVersionBanner version={score.versao_politica} compact />

      {/* Score principal */}
      <div style={{
        background: "white", borderRadius: 16, border: `1px solid ${ratingCor}44`,
        overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        <div style={{ height: 4, background: ratingCor }} />
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
            {/* Score gauge */}
            <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
              <svg viewBox="0 0 90 90" style={{ width: 90, height: 90, transform: "rotate(-90deg)" }}>
                <circle cx="45" cy="45" r="36" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                <circle
                  cx="45" cy="45" r="36" fill="none"
                  stroke={ratingCor}
                  strokeWidth="12"
                  strokeDasharray={`${(score.score_final / 100) * 226} 226`}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: ratingCor, lineHeight: 1 }}>
                  {score.score_final.toFixed(0)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af" }}>pts</span>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{
                  fontSize: 32, fontWeight: 900, color: ratingCor, lineHeight: 1,
                  background: `${ratingCor}15`, borderRadius: 8, padding: "4px 14px",
                }}>
                  {score.rating}
                </span>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    {ratingFaixa?.interpretacao ?? "—"}
                  </p>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
                    {ratingFaixa?.leitura_risco ?? ""}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Tag color="#203b88">{score.versao_politica}</Tag>
                <Tag color={score.confianca_score === "alta" ? "#16a34a" : score.confianca_score === "parcial" ? "#d97706" : "#dc2626"}>
                  Confiança {score.confianca_score}
                </Tag>
                {ratingFaixa && (
                  <Tag color="#374151">Reanálise em {ratingFaixa.periodicidade_reanalise_dias}d</Tag>
                )}
              </div>
            </div>
          </div>

          {/* Breakdown por pilar */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Pontuação por pilar
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pilarOrder.map(id => {
                const pilar = config.pilares.find(p => p.id === id);
                if (!pilar) return null;
                const bruto = score.pontos_brutos[id] ?? 0;
                const ponderado = score.pontuacao_ponderada[id] ?? 0;
                const max = pilar.pontos_totais;
                const cor = PILAR_COLORS[id] ?? "#374151";
                const pct = max > 0 ? bruto / max : 0;
                const isPendente = pilar.status_calibracao === "pendente_calibracao";

                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor, flexShrink: 0 }} />
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: 0, minWidth: 160 }}>
                      {PILAR_LABELS[id] ?? id}
                      {isPendente && (
                        <span style={{ fontSize: 9, color: "#d97706", marginLeft: 6, fontWeight: 800 }}>PEND.</span>
                      )}
                    </p>
                    <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3 }}>
                      <div style={{
                        height: "100%", width: `${pct * 100}%`,
                        background: isPendente ? "#d1d5db" : cor,
                        borderRadius: 3, transition: "width 0.4s",
                      }} />
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: cor, margin: 0, minWidth: 60, textAlign: "right" }}>
                      {bruto.toFixed(1)}/{max}
                    </p>
                    <p style={{ fontSize: 10, color: "#9ca3af", margin: 0, minWidth: 60, textAlign: "right" }}>
                      {ponderado.toFixed(1)} pts
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pilares pendentes */}
          {score.pilares_pendentes.length > 0 && (
            <div style={{
              marginTop: 12, padding: "8px 12px",
              background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
              fontSize: 11, color: "#92400e",
            }}>
              ⚠ Score parcial — pilares sem calibração V2: {score.pilares_pendentes.join(", ")}.
              As pontuações desses pilares não foram contabilizadas completamente.
            </div>
          )}
        </div>
      </div>

      {/* Metadados */}
      {(preenchidoEm || preenchidoPor) && (
        <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
          {preenchidoPor && <span>Por: <b>{preenchidoPor}</b> · </span>}
          {preenchidoEm && <span>Em: <b>{new Date(preenchidoEm).toLocaleString("pt-BR")}</b></span>}
        </div>
      )}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}14`, border: `1px solid ${color}33`,
      borderRadius: 5, padding: "2px 8px",
    }}>
      {children}
    </span>
  );
}

```
