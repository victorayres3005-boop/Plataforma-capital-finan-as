"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DocumentCollection } from "@/types";
import type { ScoreResult } from "@/types/politica-credito";
import { hydrateFromCollection } from "@/lib/hydrateFromCollection";
import { autoPreencherScore } from "@/lib/politica-credito/auto-score";
import type { AutoScoreResultado } from "@/lib/politica-credito/auto-score";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, AlertTriangle,
  Loader2, DollarSign, Calendar, Users, Shield, RefreshCw, FileText,
  Percent, TrendingUp, Landmark, Package, Send, AlertCircle, HelpCircle,
} from "lucide-react";
import { ScoreSection } from "@/components/score/ScoreSection";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { toast } from "sonner";
import { Toaster } from "sonner";
import { Download, ExternalLink, Link2, Copy } from "lucide-react";

// Logo local removido — não era usado, e o componente compartilhado existe em
// @/components/Logo caso precisemos.

// ── Types ─────────────────────────────────────────────────────────────────
type DecisaoValue = "APROVADO" | "APROVACAO_CONDICIONAL" | "PENDENTE" | "REPROVADO" | "QUESTIONAMENTO";

const DECISOES: {
  value: DecisaoValue;
  label: string;
  sub: string;
  color: string;
  lightBg: string;
  border: string;
  Icon: React.ElementType;
}[] = [
  {
    value: "APROVADO",
    label: "Aprovado",
    sub: "Empresa apta para operação sem restrições",
    color: "#16a34a",
    lightBg: "#f0fdf4",
    border: "#86efac",
    Icon: CheckCircle2,
  },
  {
    value: "APROVACAO_CONDICIONAL",
    label: "Aprovação Condicional",
    sub: "Apta sujeito às condições estabelecidas",
    color: "#7c3aed",
    lightBg: "#faf5ff",
    border: "#c4b5fd",
    Icon: AlertTriangle,
  },
  {
    value: "PENDENTE",
    label: "Em Análise",
    sub: "Aguardando informações ou revisão adicional",
    color: "#d97706",
    lightBg: "#fffbeb",
    border: "#fcd34d",
    Icon: Clock,
  },
  {
    value: "REPROVADO",
    label: "Reprovado",
    sub: "Empresa não apta para a operação",
    color: "#dc2626",
    lightBg: "#fff1f2",
    border: "#fca5a5",
    Icon: XCircle,
  },
  {
    value: "QUESTIONAMENTO",
    label: "Questionamento",
    sub: "Análise em questionamento — aguarda esclarecimentos",
    color: "#0891b2",
    lightBg: "#ecfeff",
    border: "#a5f3fc",
    Icon: HelpCircle,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────
type FieldFormat = "text" | "currency" | "percent" | "days";

// Validação leve: detecta valores que claramente não fazem sentido no formato esperado.
// Retorna mensagem de aviso ou null. Não bloqueia a digitação — apenas sinaliza.
function validateField(value: string, format: FieldFormat): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (format === "currency") {
    const hasDigit = /\d/.test(trimmed);
    if (!hasDigit) return "Informe um valor numérico (ex: R$ 150.000)";
    return null;
  }
  if (format === "percent") {
    const m = trimmed.match(/(\d+[.,]?\d*)/);
    if (!m) return "Informe um percentual (ex: 2,5% a.m.)";
    const n = parseFloat(m[1].replace(",", "."));
    if (!isNaN(n) && n > 100 && !/a\.m\.|ao ano|a\.a\./i.test(trimmed)) {
      return "Percentual > 100% — verifique a unidade";
    }
    return null;
  }
  if (format === "days") {
    const hasDigit = /\d/.test(trimmed);
    if (!hasDigit) return "Informe um número de dias (ex: 120 dias)";
    return null;
  }
  return null;
}

function InputField({
  label, value, onChange, placeholder, icon: Icon, hint, format = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ElementType;
  hint?: string;
  format?: FieldFormat;
}) {
  const warn = validateField(value, format);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        {Icon && (
          <Icon
            size={14}
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }}
          />
        )}
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: Icon ? "9px 12px 9px 32px" : "9px 12px",
            fontSize: 13,
            border: warn ? "1px solid #f59e0b" : "1px solid #e2e8f0",
            borderRadius: 8,
            outline: "none",
            background: "#fff",
            color: "#0f172a",
            boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
          onFocus={e => (e.target.style.borderColor = warn ? "#f59e0b" : "#203b88")}
          onBlur={e => (e.target.style.borderColor = warn ? "#f59e0b" : "#e2e8f0")}
        />
      </div>
      {warn && <span style={{ fontSize: 10, color: "#d97706", display: "flex", alignItems: "center", gap: 4 }}><AlertCircle size={10} /> {warn}</span>}
      {!warn && hint && <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>{hint}</span>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
function ParecerContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState<DocumentCollection | null>(null);
  const [decisao, setDecisao] = useState<DecisaoValue | null>(null);
  const [fundSettings, setFundSettings] = useState<Record<string, number> | null>(null);
  const [scoreV2, setScoreV2] = useState<ScoreResult | null>(null);
  const [autoScore, setAutoScore] = useState<AutoScoreResultado | null>(null);
  const [parecerId, setParecerId] = useState<string | null>(null);
  const [ratingAnalista, setRatingAnalista] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // Decisão do comitê
  const [decisaoComite, setDecisaoComite] = useState<"conforme_pleito" | "com_modificacoes" | "condicionado" | null>(null);
  const [notaComite, setNotaComite] = useState("");
  const [visitaParams, setVisitaParams] = useState<Record<string, string>>({});

  const [limiteCredito, setLimiteCredito] = useState("");
  const [concentracao, setConcentracao] = useState("");
  const [garantias, setGarantias] = useState("");
  const [prazoRevisao, setPrazoRevisao] = useState("");
  const [notas, setNotas] = useState("");

  // Taxas
  const [taxaConvencional, setTaxaConvencional] = useState("");
  const [taxaComissaria, setTaxaComissaria] = useState("");
  // TAC sem default — Victor pediu (2026-05-04) que TAC, garantias e concentração
  // por sacado fiquem vazios na aba de registrar parecer para preenchimento manual.
  const [tac, setTac] = useState("");

  // Limites
  const [limiteTotal, setLimiteTotal] = useState("");
  const [limiteConvencional, setLimiteConvencional] = useState("");
  const [limiteComissaria, setLimiteComissaria] = useState("");
  const [limitePorSacados, setLimitePorSacados] = useState("");
  const [ticketMedio, setTicketMedio] = useState("");

  // Condições de cobrança
  const [prazoRecompra, setPrazoRecompra] = useState("");
  const [prazoCartorio, setPrazoCartorio] = useState("");

  // Prazos e Tranche
  const [prazoMaximo, setPrazoMaximo] = useState("");
  const [trancheValor, setTrancheValor] = useState("");
  const [tranchePrazo, setTranchePrazo] = useState("");

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("document_collections")
          .select("*")
          .eq("id", id)
          .single();
        if (error || !data) {
          console.error("[parecer] erro ao carregar coleta:", error);
          toast.error("Coleta não encontrada.");
          return;
        }
        setCollection(data as DocumentCollection);

        // Auto-score a partir dos dados extraídos
        const docs = (data.documents ?? []) as { type: string; extracted_data: Record<string, unknown> }[];
        const extractedData = hydrateFromCollection(docs);
        const resultado = autoPreencherScore(extractedData);
        setAutoScore(resultado);
        console.log('[auto-score carregado]', resultado.criterios_auto);
        console.log('[manuais pendentes]', resultado.criterios_manuais);

        // Carrega Score V2, parecer existente e fund_settings em paralelo
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const [scoreRow, parecerRow, fsRow] = await Promise.all([
          supabase.from("score_operacoes").select("score_result").eq("collection_id", id)
            .order("preenchido_em", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("pareceres").select("id").eq("collection_id", id).maybeSingle(),
          currentUser
            ? supabase.from("fund_settings").select("*").eq("user_id", currentUser.id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (fsRow.data) setFundSettings(fsRow.data as Record<string, number>);
        if (scoreRow.data?.score_result) setScoreV2(scoreRow.data.score_result as ScoreResult);
        if (parecerRow.data?.id) setParecerId(parecerRow.data.id as string);

        if (data.decisao) setDecisao(data.decisao as DecisaoValue);
        if (data.observacoes) setNotas(data.observacoes);

        // Extrai parâmetros do Relatório de Visita
        const visitaDoc = (data.documents || []).find((d: { type: string }) => d.type === "relatorio_visita");
        if (visitaDoc?.extracted_data) {
          const vd = visitaDoc.extracted_data as Record<string, string>;
          setVisitaParams({
            pleito: vd.pleito || "",
            modalidade: vd.modalidade || "",
            taxaConvencional: vd.taxaConvencional || "",
            taxaComissaria: vd.taxaComissaria || "",
            cobrancaTAC: vd.cobrancaTAC || "",
            limiteTotal: vd.limiteTotal || "",
            limiteConvencional: vd.limiteConvencional || "",
            limiteComissaria: vd.limiteComissaria || "",
            limitePorSacado: vd.limitePorSacado || "",
            ticketMedio: vd.ticketMedio || "",
            prazoRecompraCedente: vd.prazoRecompraCedente || "",
            prazoEnvioCartorio: vd.prazoEnvioCartorio || "",
            prazoMaximoOp: vd.prazoMaximoOp || "",
            tranche: vd.tranche || "",
            prazoTranche: vd.prazoTranche || "",
          });
        }

        const ai = data.ai_analysis as Record<string, unknown> | null;
        const analista = ai?.parecerAnalista as Record<string, unknown> | null;

        // Rating: prioriza o valor salvo pelo analista no parecerAnalista, depois a coluna denormalizada.
        // Normaliza sempre para number com 1 casa decimal (defensivo contra valores armazenados como string).
        const normalizeRating = (v: unknown): number | null => {
          if (v == null) return null;
          const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
          if (isNaN(n)) return null;
          return Math.round(n * 10) / 10;
        };
        if (analista?.ratingAnalista != null) {
          setRatingAnalista(normalizeRating(analista.ratingAnalista));
        } else if (data.rating != null) {
          setRatingAnalista(normalizeRating(data.rating));
        }
        const aiParams = ai?.parametrosOperacionais as Record<string, unknown> | null;
        const src = (analista ?? aiParams ?? {}) as Record<string, unknown>;
        const s = (k: string) => (src[k] as string) || "";

        // Para concentração por sacado, garantias e TAC: Victor pediu (2026-05-04)
        // que NÃO sejam auto-preenchidos pela IA — só restaurar quando o analista
        // já editou e salvou. Por isso lemos só de `analista`, ignorando `aiParams`.
        const analistaOnly = (k: string) => ((analista as Record<string, unknown> | null)?.[k] as string) || "";

        if (s("limiteCredito") || s("limiteAproximado")) setLimiteCredito(s("limiteCredito") || s("limiteAproximado"));
        if (analistaOnly("concentracaoSacado")) setConcentracao(analistaOnly("concentracaoSacado"));
        if (analistaOnly("garantias")) setGarantias(analistaOnly("garantias"));
        if (s("prazoRevisao") || s("revisao")) setPrazoRevisao(s("prazoRevisao") || s("revisao"));
        // Taxas
        if (s("taxaConvencional")) setTaxaConvencional(s("taxaConvencional"));
        if (s("taxaComissaria")) setTaxaComissaria(s("taxaComissaria"));
        if (analistaOnly("tac")) setTac(analistaOnly("tac"));
        // Limites
        if (s("limiteTotal")) setLimiteTotal(s("limiteTotal"));
        if (s("limiteConvencional")) setLimiteConvencional(s("limiteConvencional"));
        if (s("limiteComissaria")) setLimiteComissaria(s("limiteComissaria"));
        if (s("limitePorSacados")) setLimitePorSacados(s("limitePorSacados"));
        if (s("ticketMedio")) setTicketMedio(s("ticketMedio"));
        // Condições de cobrança
        if (s("prazoRecompra")) setPrazoRecompra(s("prazoRecompra"));
        if (s("prazoCartorio")) setPrazoCartorio(s("prazoCartorio"));
        // Prazos e Tranche
        if (s("prazoMaximo")) setPrazoMaximo(s("prazoMaximo"));
        if (s("trancheValor")) setTrancheValor(s("trancheValor"));
        if (s("tranchePrazo")) setTranchePrazo(s("tranchePrazo"));
        // Decisão do comitê
        if (analista?.decisaoComite) setDecisaoComite(analista.decisaoComite as typeof decisaoComite);
        if (analista?.notaComite) setNotaComite(analista.notaComite as string);

        // Recupera dados pendentes do localStorage (salvos no beforeunload anterior).
        // Sempre pede confirmação antes de sobrescrever — em qualquer cenário de divergência,
        // o analista decide se aplica o pending ou descarta.
        try {
          const pendingRaw = localStorage.getItem(`cf_parecer_pending_${id}`);
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw);
            const pendingAt = new Date(pending.savedAt).getTime();
            const age = Date.now() - pendingAt;
            const supaUpdatedAt = new Date(
              (data as unknown as { updated_at?: string; finished_at?: string; created_at?: string })
                .updated_at ||
              (data as unknown as { finished_at?: string }).finished_at ||
              data.created_at ||
              0,
            ).getTime();
            const supabaseIsNewer = supaUpdatedAt > pendingAt;
            const pendingFresh = age < 3600 * 1000 && pending.parecerAnalista;
            const msg = supabaseIsNewer
              ? "Há alterações locais pendentes, mas o banco tem dados MAIS RECENTES. Aplicar as alterações locais mesmo assim? (OK = aplicar pending, Cancelar = usar banco)"
              : "Há alterações locais pendentes desta coleta que não chegaram ao banco. Aplicar agora? (OK = aplicar, Cancelar = descartar)";
            const shouldApplyPending =
              pendingFresh &&
              typeof window !== "undefined" &&
              window.confirm(msg);
            if (shouldApplyPending) {
              const p = pending.parecerAnalista;
              // Sobrescreve com dados pendentes (são mais recentes que o Supabase)
              if (p.limiteCredito) setLimiteCredito(p.limiteCredito);
              if (p.concentracaoSacado) setConcentracao(p.concentracaoSacado);
              if (p.garantias) setGarantias(p.garantias);
              if (p.prazoRevisao) setPrazoRevisao(p.prazoRevisao);
              if (p.taxaConvencional) setTaxaConvencional(p.taxaConvencional);
              if (p.taxaComissaria) setTaxaComissaria(p.taxaComissaria);
              if (p.tac) setTac(p.tac);
              if (p.limiteTotal) setLimiteTotal(p.limiteTotal);
              if (p.limiteConvencional) setLimiteConvencional(p.limiteConvencional);
              if (p.limiteComissaria) setLimiteComissaria(p.limiteComissaria);
              if (p.limitePorSacados) setLimitePorSacados(p.limitePorSacados);
              if (p.ticketMedio) setTicketMedio(p.ticketMedio);
              if (p.prazoRecompra) setPrazoRecompra(p.prazoRecompra);
              if (p.prazoCartorio) setPrazoCartorio(p.prazoCartorio);
              if (p.prazoMaximo) setPrazoMaximo(p.prazoMaximo);
              if (p.trancheValor) setTrancheValor(p.trancheValor);
              if (p.tranchePrazo) setTranchePrazo(p.tranchePrazo);
              if (p.ratingAnalista != null) setRatingAnalista(p.ratingAnalista);
              if (p.decisaoComite) setDecisaoComite(p.decisaoComite);
              if (p.notaComite) setNotaComite(p.notaComite);
              if (pending.decisao) setDecisao(pending.decisao);
              if (pending.observacoes) setNotas(pending.observacoes);
              // Envia os dados pendentes para o Supabase
              const existingAiForPending = (data.ai_analysis as Record<string, unknown>) || {};
              await supabase.from("document_collections").update({
                ai_analysis: { ...existingAiForPending, parecerAnalista: p },
                ...(pending.decisao ? { decisao: pending.decisao } : {}),
                ...(pending.ratingAnalista != null ? { rating: pending.ratingAnalista } : {}),
                ...(pending.observacoes ? { observacoes: pending.observacoes } : {}),
              }).eq("id", id);
            }
            localStorage.removeItem(`cf_parecer_pending_${id}`);
          }
        } catch (err) {
          console.error("[parecer] falha ao recuperar pending do localStorage:", err);
        }
      } catch (err) {
        console.error("[parecer] erro ao carregar dados:", err);
        toast.error("Erro ao carregar dados da coleta.");
      } finally {
        setLoading(false);
        // Libera o auto-save só DEPOIS que o loading virou false.
        // Usamos double-rAF para garantir que todas as chamadas de setState
        // acima já foram aplicadas antes do auto-save começar a observar mudanças.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          initialLoadDone.current = true;
        }));
      }
    })();
  }, [id]);

  // ── Auto-save helper (reutilizado no debounce e no flush ao sair) ──
  const pendingSave = useRef(false);
  const formRef = useRef({
    decisao, ratingAnalista, decisaoComite, notaComite, notas,
    limiteCredito, concentracao, garantias, prazoRevisao,
    taxaConvencional, taxaComissaria, tac,
    limiteTotal, limiteConvencional, limiteComissaria, limitePorSacados, ticketMedio,
    prazoRecompra, prazoCartorio, prazoMaximo, trancheValor, tranchePrazo,
  });

  // Manter ref sempre atualizado
  useEffect(() => {
    formRef.current = {
      decisao, ratingAnalista, decisaoComite, notaComite, notas,
      limiteCredito, concentracao, garantias, prazoRevisao,
      taxaConvencional, taxaComissaria, tac,
      limiteTotal, limiteConvencional, limiteComissaria, limitePorSacados, ticketMedio,
      prazoRecompra, prazoCartorio, prazoMaximo, trancheValor, tranchePrazo,
    };
  });

  // Retorna true se salvou com sucesso. Usado tanto pelo debounce quanto
  // pelo fluxo síncrono (handleConfirmar / gerarPDFDecisao) que precisa
  // garantir que dados pendentes foram ao banco antes de prosseguir.
  const doSave = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    try {
      const f = formRef.current;
      const supabase = createClient();
      const { data: session, error: authErr } = await supabase.auth.getUser();
      if (authErr || !session.user) {
        setAutoSaveError("Sessão expirada — faça login novamente para salvar.");
        setSessionExpired(true);
        console.error("[parecer] sessão expirada no autosave:", authErr);
        return false;
      }
      const { data: current, error: fetchErr } = await supabase
        .from("document_collections").select("ai_analysis").eq("id", id).single();
      if (fetchErr) {
        setAutoSaveError(`Erro ao ler coleta: ${fetchErr.message}`);
        console.error("[parecer] erro ao ler coleta no autosave:", fetchErr);
        return false;
      }
      const existingAi = (current?.ai_analysis as Record<string, unknown>) || {};
      const parecerAnalista = {
        limiteCredito: f.limiteCredito.trim() || null,
        concentracaoSacado: f.concentracao.trim() || null,
        garantias: f.garantias.trim() || null,
        prazoRevisao: f.prazoRevisao.trim() || null,
        taxaConvencional: f.taxaConvencional.trim() || null,
        taxaComissaria: f.taxaComissaria.trim() || null,
        tac: f.tac.trim() || null,
        limiteTotal: f.limiteTotal.trim() || null,
        limiteConvencional: f.limiteConvencional.trim() || null,
        limiteComissaria: f.limiteComissaria.trim() || null,
        limitePorSacados: f.limitePorSacados.trim() || null,
        ticketMedio: f.ticketMedio.trim() || null,
        prazoRecompra: f.prazoRecompra.trim() || null,
        prazoCartorio: f.prazoCartorio.trim() || null,
        prazoMaximo: f.prazoMaximo.trim() || null,
        trancheValor: f.trancheValor.trim() || null,
        tranchePrazo: f.tranchePrazo.trim() || null,
        ratingAnalista: f.ratingAnalista ?? null,
        decisaoComite: f.decisaoComite ?? null,
        notaComite: f.notaComite.trim() || null,
      };
      const { error: updateErr } = await supabase.from("document_collections").update({
        ai_analysis: { ...existingAi, parecerAnalista },
        decisao: f.decisao ?? null,
        rating: f.ratingAnalista ?? null,
        observacoes: f.notas.trim() || null,
      }).eq("id", id).eq("user_id", session.user.id);
      if (updateErr) {
        setAutoSaveError(`Erro ao salvar: ${updateErr.message}`);
        console.error("[parecer] erro ao salvar:", updateErr);
        return false;
      }
      pendingSave.current = false;
      setAutoSaveError(null);
      setSessionExpired(false);
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
      // Limpa backup local — dados já estão no banco.
      try { localStorage.removeItem(`cf_parecer_pending_${id}`); } catch { /* ignore */ }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutoSaveError(`Erro ao salvar: ${msg.substring(0, 80)}`);
      console.error("[parecer] autosave falhou:", err);
      return false;
    }
  }, [id]);

  // ── Auto-save (debounced 2s) ──────────────────────────────────────────────
  useEffect(() => {
    if (!initialLoadDone.current || !id) return;
    pendingSave.current = true;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { doSave(); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisao, ratingAnalista, decisaoComite, notaComite, notas,
      limiteCredito, concentracao, garantias, prazoRevisao,
      taxaConvencional, taxaComissaria, tac,
      limiteTotal, limiteConvencional, limiteComissaria, limitePorSacados, ticketMedio,
      prazoRecompra, prazoCartorio, prazoMaximo, trancheValor, tranchePrazo, doSave]);

  // ── Flush imediato ao sair da página (beforeunload + unmount) ──
  useEffect(() => {
    const flushOnUnload = () => {
      if (!pendingSave.current || !id) return;
      // sendBeacon para garantir save mesmo durante navegação
      const f = formRef.current;
      const parecerAnalista = {
        limiteCredito: f.limiteCredito.trim() || null,
        concentracaoSacado: f.concentracao.trim() || null,
        garantias: f.garantias.trim() || null,
        prazoRevisao: f.prazoRevisao.trim() || null,
        taxaConvencional: f.taxaConvencional.trim() || null,
        taxaComissaria: f.taxaComissaria.trim() || null,
        tac: f.tac.trim() || null,
        limiteTotal: f.limiteTotal.trim() || null,
        limiteConvencional: f.limiteConvencional.trim() || null,
        limiteComissaria: f.limiteComissaria.trim() || null,
        limitePorSacados: f.limitePorSacados.trim() || null,
        ticketMedio: f.ticketMedio.trim() || null,
        prazoRecompra: f.prazoRecompra.trim() || null,
        prazoCartorio: f.prazoCartorio.trim() || null,
        prazoMaximo: f.prazoMaximo.trim() || null,
        trancheValor: f.trancheValor.trim() || null,
        tranchePrazo: f.tranchePrazo.trim() || null,
        ratingAnalista: f.ratingAnalista ?? null,
        decisaoComite: f.decisaoComite ?? null,
        notaComite: f.notaComite.trim() || null,
      };
      // Salva no localStorage como backup para ser enviado na próxima visita
      try {
        localStorage.setItem(`cf_parecer_pending_${id}`, JSON.stringify({
          parecerAnalista,
          decisao: f.decisao,
          ratingAnalista: f.ratingAnalista,
          observacoes: f.notas.trim() || null,
          savedAt: new Date().toISOString(),
        }));
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", flushOnUnload);
    return () => {
      window.removeEventListener("beforeunload", flushOnUnload);
      // No unmount (navegação SPA), faz save imediato
      if (pendingSave.current && id) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        doSave();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, doSave]);

  const handleConfirmar = async () => {
    if (!decisao) { toast.error("Selecione uma decisão antes de confirmar."); return; }
    if (!id || !collection) return;
    // Cancela o timer do debounce e força flush síncrono do auto-save
    // para garantir que todo o estado atual foi ao banco antes do UPDATE final.
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    setSaving(true);
    try {
      if (pendingSave.current) {
        const saved = await doSave();
        if (!saved) {
          toast.error("Não foi possível salvar as alterações. Verifique os erros antes de confirmar.");
          return;
        }
      }
      const supabase = createClient();
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) {
        setSessionExpired(true);
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      // Busca estado atualizado do banco (não confia em `collection` stale) para
      // preservar campos do ai_analysis que possam ter sido atualizados em paralelo.
      const { data: fresh, error: freshErr } = await supabase
        .from("document_collections").select("ai_analysis").eq("id", id).single();
      if (freshErr) throw freshErr;
      const existingAi = (fresh?.ai_analysis as Record<string, unknown>) || {};
      const parecerAnalista = {
        // Crédito e garantias
        limiteCredito: limiteCredito.trim() || null,
        concentracaoSacado: concentracao.trim() || null,
        garantias: garantias.trim() || null,
        prazoRevisao: prazoRevisao.trim() || null,
        // Taxas
        taxaConvencional: taxaConvencional.trim() || null,
        taxaComissaria: taxaComissaria.trim() || null,
        tac: tac.trim() || null,
        // Limites
        limiteTotal: limiteTotal.trim() || null,
        limiteConvencional: limiteConvencional.trim() || null,
        limiteComissaria: limiteComissaria.trim() || null,
        limitePorSacados: limitePorSacados.trim() || null,
        ticketMedio: ticketMedio.trim() || null,
        // Condições de cobrança
        prazoRecompra: prazoRecompra.trim() || null,
        prazoCartorio: prazoCartorio.trim() || null,
        // Prazos e Tranche
        prazoMaximo: prazoMaximo.trim() || null,
        trancheValor: trancheValor.trim() || null,
        tranchePrazo: tranchePrazo.trim() || null,
        ratingAnalista: ratingAnalista ?? null,
        decisaoComite: decisaoComite ?? null,
        notaComite: notaComite.trim() || null,
        decidedAt: new Date().toISOString(),
      };
      const { error } = await supabase.from("document_collections").update({
        status: "finished",
        finished_at: new Date().toISOString(),
        decisao,
        rating: ratingAnalista ?? collection.rating ?? null,
        observacoes: notas.trim() || null,
        ai_analysis: { ...existingAi, parecerAnalista },
      }).eq("id", id).eq("user_id", session.user.id);
      if (error) throw error;

      // Salva snapshot formal na tabela pareceres
      try {
        const aiData = (fresh?.ai_analysis as Record<string, unknown>) || {};
        const parseBRNum = (s: string) => parseFloat(s.replace(/[^0-9,.]/g, "").replace(",", ".")) || null;
        const _ratingV2 = autoScore?.score?.rating ?? null;
        const _dataProximaReanalise = (() => {
          if (!_ratingV2) return null;
          const DIAS: Record<string, number> = {
            A: fundSettings?.reanalise_rating_a_dias ?? 180,
            B: fundSettings?.reanalise_rating_b_dias ?? 120,
            C: fundSettings?.reanalise_rating_c_dias ?? 120,
            D: fundSettings?.reanalise_rating_d_dias ?? 120,
            E: fundSettings?.reanalise_rating_e_dias ?? 90,
            F: fundSettings?.reanalise_rating_f_dias ?? 45,
          };
          const dias = DIAS[_ratingV2] ?? 90;
          const d = new Date();
          d.setDate(d.getDate() + dias);
          return d.toISOString().split('T')[0];
        })();

        const parecerPayload = {
          collection_id: id,
          user_id: session.user.id,
          cnpj: collection?.cnpj || null,
          razao_social: collection?.company_name || null,
          decisao_comite: decisao,
          limite_aprovado: parseBRNum(limiteCredito || limiteTotal),
          prazo_maximo: parseInt(prazoMaximo) || null,
          concentracao_max: parseBRNum(concentracao),
          score_v2_rating: scoreV2?.rating ?? null,
          score_v2_pontos: scoreV2?.score_final ?? null,
          score_v2_conf: scoreV2?.confianca_score ?? null,
          rating_ia: (aiData.rating as number) ?? null,
          decisao_ia: (aiData.decisao as string) ?? null,
          garantias: garantias.trim() || null,
          prazo_revisao: parseInt(prazoRevisao) || null,
          observacoes: notas.trim() || null,
          membros_comite: null,
          data_proxima_reanalise: _dataProximaReanalise,
          rating_v2: _ratingV2,
          score_v2: autoScore?.score?.score_final ?? null,
        };
        if (parecerId) {
          await supabase.from("pareceres").update(parecerPayload).eq("id", parecerId);
        } else {
          const { data: np } = await supabase.from("pareceres").insert(parecerPayload).select("id").single();
          if (np?.id) setParecerId(np.id as string);
        }
      } catch (parecerErr) {
        console.warn("[parecer] falha ao salvar em pareceres:", parecerErr);
      }

      // ── Notificações para alertas críticos ──────────────────
      try {
        type AlertaItem = { severidade?: string; descricao?: string; codigo?: string };
        const alertasAlta = ((existingAi.alertas as AlertaItem[]) ?? []).filter(
          (a) => a.severidade?.toLowerCase() === 'alta'
        );
        const razaoSocial = collection?.company_name ?? 'Cedente';

        if (alertasAlta.length > 0) {
          const notificacoes = alertasAlta.map((a) => ({
            user_id: session.user.id,
            message: `🚨 Alerta crítico em ${razaoSocial}: ${a.descricao ?? a.codigo}`,
            read: false,
          }));
          await supabase.from('notifications').insert(notificacoes);
        }

        // ── Notificação de decisão REPROVADO ────────────────────
        if (decisao === 'REPROVADO') {
          const resumo = (existingAi.parecer as Record<string, unknown> | undefined)?.resumoExecutivo as string | undefined;
          await supabase.from('notifications').insert({
            user_id: session.user.id,
            message: `❌ Parecer REPROVADO: ${razaoSocial} — ${resumo?.slice(0, 80) ?? 'ver parecer completo'}`,
            read: false,
          });
        }
      } catch { /* notificação é secundária — não bloqueia fluxo */ }

      try { localStorage.removeItem(`cf_parecer_pending_${id}`); } catch { /* ignore */ }
      toast.success("Parecer registrado com sucesso!");
      setTimeout(() => { window.location.href = `/historico?highlight=${id}`; }, 800);
    } catch (err) {
      console.error("[parecer] erro ao confirmar parecer:", err);
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ──
  // Mostra SEMPRE os parâmetros operacionais (não depende de `decisao`), para evitar
  // que dados já salvos fiquem "órfãos" na UI quando o analista troca a decisão.
  const showParams = true;
  const selectedD = DECISOES.find(d => d.value === decisao);
  const rating = ratingAnalista ?? collection?.rating ?? null;
  const ratingColor = rating != null ? (rating >= 8 ? "#16a34a" : rating >= 5 ? "#d97706" : "#dc2626") : "#94a3b8";
const ratingIsAnalista = ratingAnalista != null;
  const companyName = collection?.company_name || collection?.label || "Empresa";
  const cnpj = collection?.cnpj || "—";

  // ── Gerar PDF Decisão do Comitê ──
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharingPublic, setSharingPublic] = useState(false);
  const [publicLink, setPublicLink] = useState<string | null>(null);

  const buildDecisaoHtml = (): string => {
      const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      const decLabel: Record<string, string> = { APROVADO: "APROVADO", APROVACAO_CONDICIONAL: "APROVAÇÃO CONDICIONAL", PENDENTE: "EM ANÁLISE", REPROVADO: "REPROVADO", QUESTIONAMENTO: "QUESTIONAMENTO" };
      const comiteLabel: Record<string, string> = { conforme_pleito: "Conforme Pleito", com_modificacoes: "Aprovado com Modificações", condicionado: "Condicionado" };

      // Cores alinhadas ao design system do relatório de síntese (template.ts):
      // aprovado=--g6 (#5a8a2a), reprovado=--r6 (#c53030), pendente/condicional=--a5 (#d4940a).
      const decVariant = (d: string | null): "success" | "warn" | "danger" | null => {
        if (!d) return null;
        if (d === "APROVADO") return "success";
        if (d === "REPROVADO") return "danger";
        return "warn"; // APROVACAO_CONDICIONAL, PENDENTE
      };
      const variant = decVariant(decisao);
      const ratingVariant: "success" | "warn" | "danger" | null = rating == null
        ? null : rating >= 8 ? "success" : rating >= 5 ? "warn" : "danger";
      const riskLabel = rating != null ? (rating >= 8 ? "BAIXO RISCO" : rating >= 5 ? "RISCO MODERADO" : "ALTO RISCO") : "";

      // Comparativo rows
      const rows: { label: string; pleito: string; aprovado: string }[] = [];
      const addRow = (label: string, pleitoKey: string, aprovado: string) => {
        const p = visitaParams[pleitoKey] || ""; const a = aprovado?.trim() || "";
        if (p || a) rows.push({ label, pleito: p || "—", aprovado: a || "—" });
      };
      if (visitaParams.pleito) rows.push({ label: "Pleito / Solicitação", pleito: visitaParams.pleito, aprovado: "—" });
      if (visitaParams.modalidade) rows.push({ label: "Modalidade", pleito: visitaParams.modalidade, aprovado: visitaParams.modalidade });
      addRow("Taxa Convencional", "taxaConvencional", taxaConvencional);
      addRow("Taxa Comissária", "taxaComissaria", taxaComissaria);
      addRow("Cobrança de TAC", "cobrancaTAC", tac);
      addRow("Limite de Crédito", "limiteTotal", limiteCredito || limiteTotal);
      addRow("Limite Total", "limiteTotal", limiteTotal);
      addRow("Limite Convencional", "limiteConvencional", limiteConvencional);
      addRow("Limite Comissária", "limiteComissaria", limiteComissaria);
      addRow("Limite por Sacado", "limitePorSacado", limitePorSacados);
      addRow("Ticket Médio", "ticketMedio", ticketMedio);
      addRow("Prazo Máximo", "prazoMaximoOp", prazoMaximo);
      addRow("Recompra Cedente", "prazoRecompraCedente", prazoRecompra);
      addRow("Envio Cartório", "prazoEnvioCartorio", prazoCartorio);
      addRow("Tranche (R$)", "tranche", trancheValor);
      addRow("Prazo Tranche", "prazoTranche", tranchePrazo);

      const cond: { label: string; value: string }[] = [];
      if (limiteCredito) cond.push({ label: "Limite de Crédito", value: limiteCredito });
      if (concentracao) cond.push({ label: "Concentração máx/sacado", value: concentracao });
      if (garantias) cond.push({ label: "Garantias", value: garantias });

      // Logo SVG inline — mesma marca do relatório de síntese, versão clara para header.
      const logoSvg = (whiteFill: boolean) => {
        const blue = whiteFill ? "#ffffff" : "#163269";
        const green = whiteFill ? "#84BF41" : "#84BF41";
        return `<svg width="170" height="22" viewBox="0 0 451 58" xmlns="http://www.w3.org/2000/svg">
          <circle cx="31" cy="27" r="22" stroke="${blue}" stroke-width="4.5" fill="none"/>
          <circle cx="31" cy="49" r="4.5" fill="${blue}"/>
          <text x="66" y="46" font-family="'DM Sans',Arial,sans-serif" font-weight="700" font-size="38" letter-spacing="-0.3">
            <tspan fill="${blue}">capital</tspan><tspan fill="${green}">finanças</tspan>
          </text>
        </svg>`;
      };

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Decisão do Comitê — ${esc(companyName)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --n9:#163269;--n8:#1F478E;--n7:#2a5aad;--n1:#ccd9f0;--n0:#e8eef8;
    --a5:#d4940a;--a1:#fdf3d7;--a0:#fef9ec;
    --r6:#c53030;--r1:#fee2e2;--r0:#fef2f2;
    --g6:#5a8a2a;--g1:#dff0c0;--g0:#f0f9e6;
    --x9:#111827;--x7:#374151;--x5:#6b7280;--x4:#9ca3af;--x2:#e5e7eb;--x1:#f3f4f6;--x0:#f9fafb;
    --gl:#84BF41;
    --fs-kpi:14px;--fs-h3:12px;--fs-body:11px;--fs-label:9px;--fs-tag:8px;
  }
  body{font-family:'DM Sans',sans-serif;font-size:var(--fs-body);color:var(--x9);background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-font-smoothing:antialiased}
  .mono{font-family:'JetBrains Mono',monospace}
  @page{size:210mm auto;margin:14mm 18mm}
  @media print{
    body{margin:0;padding:0}
    .page{max-width:none!important;margin:0!important;box-shadow:none!important;border-radius:0!important}
    .no-print{display:none!important}
  }
  .page{max-width:860px;margin:20px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(12,27,58,0.07);display:flex;flex-direction:column;min-height:100vh}
  /* Header */
  .hdr{background:var(--n9);padding:14px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--gl)}
  .hdr .meta{font-size:var(--fs-label);color:rgba(255,255,255,0.5);letter-spacing:0.04em}
  .hdr .pg{background:var(--gl);color:#fff;font-size:var(--fs-body);font-weight:700;padding:3px 11px;border-radius:10px;margin-left:12px}
  /* Conteúdo */
  .ct{padding:28px 32px 32px;flex:1}
  /* Empresa header */
  .emp{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--x2);margin-bottom:24px;gap:24px}
  .emp-name{font-size:20px;font-weight:700;color:var(--n9);margin-bottom:4px;line-height:1.2}
  .emp-cnpj{font-size:var(--fs-h3);color:var(--x5)}
  .emp-cnpj b{color:var(--x7);font-family:'JetBrains Mono',monospace}
  .dec{display:inline-block;padding:3px 12px;border-radius:4px;font-size:var(--fs-label);font-weight:700;letter-spacing:0.06em;margin-top:8px}
  .dec.success{background:var(--g1);color:var(--g6)}
  .dec.warn{background:var(--a1);color:var(--a5)}
  .dec.danger{background:var(--r1);color:var(--r6)}
  /* Rating circle */
  .rat{text-align:center;min-width:120px;flex-shrink:0}
  .rat-c{width:72px;height:72px;border-radius:50%;border:3px solid;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px}
  .rat-c.success{border-color:var(--g6);color:var(--g6)}
  .rat-c.warn{border-color:var(--a5);color:var(--a5)}
  .rat-c.danger{border-color:var(--r6);color:var(--r6)}
  .rat-n{font-size:26px;font-weight:700;line-height:1}
  .rat-d{font-size:var(--fs-label);color:var(--x4);margin-top:2px}
  .rat-l{font-size:var(--fs-label);font-weight:700;letter-spacing:0.06em}
  .rat-l.success{color:var(--g6)}
  .rat-l.warn{color:var(--a5)}
  .rat-l.danger{color:var(--r6)}
  /* Section title */
  .stitle{font-size:var(--fs-body);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--x5);margin:28px 0 12px;display:flex;align-items:center;gap:10px}
  .stitle:first-child{margin-top:0}
  .stitle .tag{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:18px;border-radius:3px;background:var(--n9);color:#fff;font-size:var(--fs-tag);font-weight:700;padding:0 6px;letter-spacing:0.04em}
  .stitle .line{flex:1;height:1px;background:var(--x2)}
  /* Comparativo table */
  .cmp{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--fs-h3);border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:8px}
  .cmp thead th{background:var(--n9);color:rgba(255,255,255,0.9);font-size:var(--fs-label);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left}
  .cmp thead th.c{text-align:center}
  .cmp tbody td{padding:9px 14px;border-bottom:1px solid var(--x1);color:var(--x7);font-size:var(--fs-body)}
  .cmp tbody tr:last-child td{border-bottom:none}
  .cmp tbody tr:nth-child(even){background:var(--x0)}
  .cmp td.label{color:var(--x5);font-weight:600}
  .cmp td.val{text-align:center}
  .cmp td.appr{text-align:center;font-weight:700;color:var(--x9)}
  .cmp td.appr.changed{color:var(--n8)}
  .cmp td.appr .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--n8);margin-left:6px;vertical-align:middle}
  /* Condições grid */
  .cond-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
  .icell{padding:12px 14px;background:var(--x0);border-radius:6px;border:1px solid var(--x1);border-left:3px solid var(--n8)}
  .icell .l{font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x4);margin-bottom:4px}
  .icell .v{font-size:var(--fs-kpi);font-weight:700;color:var(--n9)}
  /* Observações */
  .note{background:#fff;border:1px solid var(--x2);border-left:4px solid var(--n8);border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:10px}
  .note.analyst{border-left-color:var(--x4)}
  .note .l{font-size:var(--fs-tag);font-weight:700;color:var(--n8);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
  .note.analyst .l{color:var(--x5)}
  .note .body{font-size:var(--fs-h3);color:var(--x7);line-height:1.6;white-space:pre-wrap}
  /* Footer */
  .ftr{background:var(--x0);border-top:1px solid var(--x2);padding:10px 32px;display:flex;justify-content:space-between;align-items:center}
  .ftr span{font-size:var(--fs-label);color:var(--x4);letter-spacing:0.04em}
  .ftr .logo{opacity:0.5;display:flex;align-items:center}
  /* Botão flutuante */
  .print-btn{position:fixed;bottom:24px;right:24px;padding:12px 24px;background:var(--n9);color:#fff;border:none;border-radius:10px;font-size:var(--fs-h3);font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(22,50,105,0.3);font-family:'DM Sans',sans-serif;letter-spacing:0.02em}
  .print-btn:hover{background:var(--n8)}
</style></head><body>

<div class="page">

  <!-- ═══ HEADER ═══ -->
  <div class="hdr">
    <div style="display:flex;align-items:center">${logoSvg(true)}</div>
    <div style="display:flex;align-items:center">
      <div class="meta">Decisão do Comitê de Crédito · ${esc(hoje)}</div>
      <div class="pg">1</div>
    </div>
  </div>

  <!-- ═══ CONTEÚDO ═══ -->
  <div class="ct">

    <!-- Empresa / Decisão / Rating -->
    <div class="emp">
      <div style="flex:1">
        <div class="emp-name">${esc(companyName)}</div>
        <div class="emp-cnpj">CNPJ <b>${esc(cnpj)}</b></div>
        ${variant && decisao ? `<span class="dec ${variant}">${decLabel[decisao] || decisao}${decisaoComite ? ` · ${esc(comiteLabel[decisaoComite] || decisaoComite)}` : ""}</span>` : ""}
      </div>
      ${(() => {
        if (!scoreV2) return "";
        const v2colors: Record<string, string> = { A:"#16a34a", B:"#65a30d", C:"#d97706", D:"#ea580c", E:"#dc2626", F:"#991b1b" };
        const v2bgs: Record<string, string>    = { A:"#f0fdf4", B:"#f7fee7", C:"#fffbeb", D:"#fff7ed", E:"#fef2f2", F:"#fff1f2" };
        const v2lbls: Record<string, string>   = { A:"EXCELENTE", B:"BOM", C:"MODERADO", D:"FRACO", E:"RUIM", F:"CRÍTICO" };
        const v2c   = v2colors[scoreV2.rating] ?? "#94a3b8";
        const v2bg  = v2bgs[scoreV2.rating]    ?? "#f1f5f9";
        const v2lbl = v2lbls[scoreV2.rating]   ?? "";
        return `<div class="rat" style="min-width:86px">
          <div style="width:68px;height:68px;border-radius:50%;border:3px solid ${v2c};background:${v2bg};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px">
            <div style="font-size:32px;font-weight:900;color:${v2c};line-height:1">${scoreV2.rating}</div>
          </div>
          <div style="font-size:9px;font-weight:800;color:${v2c};letter-spacing:0.06em;text-align:center;text-transform:uppercase">RATING V2</div>
          <div style="font-size:9px;color:#64748b;text-align:center;margin-top:1px">${scoreV2.score_final.toFixed(0)} pts · ${v2lbl}</div>
        </div>`;
      })()}
      ${rating != null && ratingVariant ? `
      <div class="rat">
        <div class="rat-c ${ratingVariant}">
          <div class="rat-n">${rating}</div>
          <div class="rat-d">/ 10</div>
        </div>
        <div class="rat-l ${ratingVariant}">${riskLabel}</div>
      </div>` : ""}
    </div>

    ${rows.length > 0 ? `
    <!-- Comparativo -->
    <div class="stitle"><span class="tag">01</span>Comparativo: Pleito × Aprovado<div class="line"></div></div>
    <table class="cmp">
      <thead>
        <tr>
          <th>Parâmetro</th>
          <th class="c">Pleito do Cedente</th>
          <th class="c">Aprovado pelo Comitê</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const diff = r.pleito !== "—" && r.aprovado !== "—" && r.pleito !== r.aprovado;
          return `<tr>
            <td class="label">${esc(r.label)}</td>
            <td class="val">${esc(r.pleito)}</td>
            <td class="appr${diff ? " changed" : ""}">${esc(r.aprovado)}${diff ? '<span class="dot"></span>' : ""}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    ` : ""}

    ${cond.length > 0 ? `
    <!-- Condições e Garantias -->
    <div class="stitle"><span class="tag">02</span>Condições e Garantias<div class="line"></div></div>
    <div class="cond-grid">
      ${cond.map(c => `
      <div class="icell">
        <div class="l">${esc(c.label)}</div>
        <div class="v">${esc(c.value)}</div>
      </div>`).join("")}
    </div>
    ` : ""}

    ${notaComite.trim() || notas.trim() ? `
    <!-- Observações -->
    <div class="stitle"><span class="tag">03</span>Observações<div class="line"></div></div>
    ${notaComite.trim() ? `
    <div class="note">
      <div class="l">Nota do Comitê</div>
      <div class="body">${esc(notaComite.trim())}</div>
    </div>` : ""}
    ${notas.trim() ? `
    <div class="note analyst">
      <div class="l">Observações do Analista</div>
      <div class="body">${esc(notas.trim())}</div>
    </div>` : ""}
    ` : ""}

  </div>

  <!-- ═══ FOOTER ═══ -->
  <div class="ftr">
    <div class="logo">${logoSvg(false)}</div>
    <span>Capital Finanças · Decisão do Comitê · Documento Confidencial</span>
    <span>Pág. 1</span>
  </div>

</div>

<button class="no-print print-btn" onclick="window.print()">Salvar como PDF</button>

</body></html>`;

      return html;
  };

  const visualizarHTML = async () => {
    setGeneratingPdf(true);
    try {
      if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
      if (pendingSave.current) {
        const saved = await doSave();
        if (!saved) { toast.error("Salvamento pendente falhou — corrija os erros antes de gerar o PDF."); return; }
      }
      const html = buildDecisaoHtml();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("Documento aberto — clique em 'Salvar como PDF' para baixar.");
    } catch (err) {
      console.error("Erro ao gerar visualização:", err);
      toast.error("Erro ao gerar documento.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Compartilha o relatório como link público /r/<id>. Usa /api/share-report
  // que persiste o HTML em shared_reports e retorna um id curto (10 chars).
  const compartilharPublico = async () => {
    if (publicLink) {
      // Segundo clique: já temos o link, só re-copia.
      try { await navigator.clipboard.writeText(publicLink); toast.success("Link copiado novamente"); } catch { toast.error("Falha ao copiar"); }
      return;
    }
    setSharingPublic(true);
    try {
      if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
      if (pendingSave.current) {
        const saved = await doSave();
        if (!saved) { toast.error("Salvamento pendente falhou — corrija os erros antes de gerar o link."); return; }
      }
      const html = buildDecisaoHtml();
      const res = await fetch("/api/share-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, cnpj, company: companyName }),
      });
      const json = await res.json();
      if (!res.ok || !json?.id) {
        throw new Error(json?.error || "Falha ao gerar link público");
      }
      const link = `${window.location.origin}/r/${json.id}`;
      setPublicLink(link);
      try { await navigator.clipboard.writeText(link); toast.success("Link público copiado para a área de transferência"); }
      catch { toast.success("Link gerado: " + link); }
    } catch (err) {
      console.error("Erro ao compartilhar publicamente:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar link público");
    } finally {
      setSharingPublic(false);
    }
  };

  const baixarPDF = async () => {
    setDownloadingPdf(true);
    try {
      if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
      if (pendingSave.current) {
        const saved = await doSave();
        if (!saved) { toast.error("Salvamento pendente falhou — corrija os erros antes de gerar o PDF."); return; }
      }
      const html = buildDecisaoHtml();
      const res = await fetch("/api/exportar-pdf-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename: `parecer-${(cnpj || "decisao").replace(/\D/g, "")}.pdf` }),
      });
      if (!res.ok) throw new Error("Falha na geração do PDF");
      const pdfBlob = await res.blob();
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parecer-${(cnpj || "decisao").replace(/\D/g, "")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF baixado com sucesso!");
    } catch (err) {
      console.error("Erro ao baixar PDF:", err);
      toast.error("Erro ao gerar PDF. Use 'Ver HTML' e imprima manualmente.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <Loader2 size={28} style={{ color: "#203b88", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (!id || !collection) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#f8fafc" }}>
        <XCircle size={40} style={{ color: "#dc2626" }} />
        <p style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Coleta não encontrada.</p>
        <a href="/" style={{ fontSize: 13, color: "#203b88", textDecoration: "none" }}>← Voltar ao início</a>
      </div>
    );
  }

  // ── Render ──
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "#fff", borderBottom: "1px solid #f1f5f9",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {autoSaveError && (
              <span style={{ fontSize: 12, color: "#b91c1c", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                <AlertCircle size={13} /> Não salvo
              </span>
            )}
            {!autoSaveError && autoSaved && (
              <span style={{ fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={13} /> Salvo automaticamente
              </span>
            )}
            <button
              onClick={() => { window.location.href = id ? `/?resume=${id}&step=generate` : "/"; }}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
            >
              <ArrowLeft size={13} /> Voltar ao relatório
            </button>
          </div>
        </div>
        {autoSaveError && (
          <div style={{
            background: sessionExpired ? "#fef2f2" : "#fffbeb",
            borderTop: `1px solid ${sessionExpired ? "#fecaca" : "#fde68a"}`,
            padding: "10px 24px",
          }}>
            <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: sessionExpired ? "#991b1b" : "#92400e" }}>
                <AlertCircle size={15} />
                <span>
                  <strong>{sessionExpired ? "Sessão expirada:" : "Auto-save falhou:"}</strong> {autoSaveError}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {sessionExpired ? (
                  <button
                    onClick={() => { window.location.href = `/login?returnTo=${encodeURIComponent(`/parecer?id=${id}`)}`; }}
                    style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#dc2626", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}
                  >Fazer login</button>
                ) : (
                  <button
                    onClick={() => { doSave(); }}
                    style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#d97706", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}
                  >Tentar novamente</button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Content ── */}
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "20px 24px 32px" }}>

        <Breadcrumb
          items={[
            { label: "Pareceres", href: "/pareceres" },
            { label: companyName, current: true },
          ]}
          className="mb-4"
        />

        {/* ── Hero Banner ── */}
        <div style={{
          background: "linear-gradient(135deg, #1a2f6b 0%, #203b88 60%, #1e3a8a 100%)",
          borderRadius: 20, padding: "28px 28px 24px", marginBottom: 24,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -50, right: -50, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.03)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -30, right: 100, width: 130, height: 130, borderRadius: "50%", background: "rgba(168,217,107,0.06)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, position: "relative" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(168,217,107,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={22} style={{ color: "#a8d96b" }} />
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(168,217,107,0.9)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 4px" }}>Registrar Parecer Final</p>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.01em" }}>{companyName}</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>CNPJ {cnpj}</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, position: "relative" }}>
            {scoreV2 && (() => {
              const v2cores: Record<string, string> = { A:"#4ade80", B:"#a3e635", C:"#fbbf24", D:"#fb923c", E:"#f87171", F:"#fca5a5" };
              const v2cor = v2cores[scoreV2.rating] ?? "#94a3b8";
              return (
                <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 12, padding: "8px 16px", textAlign: "center", border: `1px solid ${v2cor}44` }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Score V2</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: v2cor, margin: 0, lineHeight: 1.2 }}>
                    {scoreV2.rating}<span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)" }}> · {scoreV2.score_final.toFixed(0)}pts</span>
                  </p>
                </div>
              );
            })()}
            {rating != null && (
              <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 12, padding: "8px 16px", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>{ratingIsAnalista ? "Comitê" : "Rating IA"}</p>
                <p style={{ fontSize: 22, fontWeight: 900, color: ratingColor, margin: 0, lineHeight: 1.2 }}>{rating.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>/10</span></p>
              </div>
            )}
            {selectedD && (
              <div style={{ background: `${selectedD.color}25`, border: `1px solid ${selectedD.color}55`, borderRadius: 10, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                <selectedD.Icon size={14} style={{ color: selectedD.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: selectedD.color }}>{selectedD.label}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Decision section ── */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #1a2f6b, #203b88)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CheckCircle2 size={15} style={{ color: "#a8d96b" }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>Decisão do Analista</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Selecione o resultado desta análise de crédito</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {DECISOES.map(d => {
              const selected = decisao === d.value;
              return (
                <button
                  key={d.value}
                  onClick={() => setDecisao(d.value)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 14,
                    padding: "16px 18px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                    border: selected ? `2px solid ${d.color}` : "1.5px solid #e5e7eb",
                    background: selected ? d.lightBg : "#fafafa",
                    transition: "all 0.15s", outline: "none",
                    boxShadow: selected ? `0 0 0 3px ${d.color}18` : "none",
                    position: "relative",
                  }}
                  onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                  onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "#fafafa"; }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0, marginTop: 1,
                    background: selected ? `${d.color}18` : "#f1f5f9",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <d.Icon size={18} style={{ color: selected ? d.color : "#94a3b8" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: selected ? d.color : "#0f172a", margin: 0 }}>{d.label}</p>
                    <p style={{ fontSize: 12, color: selected ? d.color : "#64748b", margin: "3px 0 0", opacity: selected ? 0.85 : 1 }}>{d.sub}</p>
                  </div>
                  {selected && (
                    <div style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: "50%", background: d.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckCircle2 size={14} style={{ color: "#fff" }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {decisao === "QUESTIONAMENTO" && (
            <div style={{ marginTop: 14, background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
              <HelpCircle size={15} style={{ color: "#0891b2", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: "#0e7490", margin: 0, lineHeight: 1.5 }}>
                <strong>Status: Questionamento.</strong> Os parâmetros operacionais abaixo são <strong>opcionais</strong> — preencha apenas o que já foi discutido. Você pode confirmar o parecer deixando os demais campos em branco.
              </p>
            </div>
          )}
        </div>

        {/* ── Rating do Comitê ── */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #1a2f6b, #203b88)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                <TrendingUp size={15} style={{ color: "#a8d96b" }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>Rating do Comitê</p>
                <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, maxWidth: 420 }}>
                  Definido manualmente — vai para o dashboard e histórico.
                  {collection.rating != null && (
                    <span style={{ color: "#cbd5e1" }}> IA gerou {collection.rating.toFixed(1)}/10 como referência.</span>
                  )}
                </p>
              </div>
            </div>
            {ratingAnalista != null && (
              <div style={{
                background: ratingAnalista >= 8 ? "#f0fdf4" : ratingAnalista >= 5 ? "#fffbeb" : "#fff1f2",
                border: `2px solid ${ratingAnalista >= 8 ? "#86efac" : ratingAnalista >= 5 ? "#fcd34d" : "#fca5a5"}`,
                borderRadius: 14, padding: "10px 20px", textAlign: "center", flexShrink: 0,
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, color: ratingAnalista >= 8 ? "#16a34a" : ratingAnalista >= 5 ? "#d97706" : "#dc2626" }}>Comitê</p>
                <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1.1, color: ratingAnalista >= 8 ? "#16a34a" : ratingAnalista >= 5 ? "#d97706" : "#dc2626" }}>
                  {ratingAnalista.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 500 }}>/10</span>
                </p>
              </div>
            )}
          </div>

          {/* Atalhos por inteiro */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
              const active = ratingAnalista != null && Math.floor(ratingAnalista) === n && ratingAnalista % 1 === 0;
              const inRange = ratingAnalista != null && ratingAnalista >= n && ratingAnalista < n + 1;
              const color = n >= 8 ? "#16a34a" : n >= 5 ? "#d97706" : "#dc2626";
              const lightBg = n >= 8 ? "#f0fdf4" : n >= 5 ? "#fffbeb" : "#fff1f2";
              return (
                <button key={n} onClick={() => setRatingAnalista(active ? null : n)}
                  style={{
                    width: 44, height: 44, borderRadius: 10, fontSize: 15, fontWeight: 700,
                    border: (active || inRange) ? `2px solid ${color}` : "1.5px solid #e5e7eb",
                    background: (active || inRange) ? lightBg : "#fafafa",
                    color: (active || inRange) ? color : "#64748b",
                    cursor: "pointer", transition: "all 0.12s",
                    boxShadow: active ? `0 0 0 3px ${color}18` : "none",
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.color = color; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = (active || inRange) ? color : "#e5e7eb"; (e.currentTarget as HTMLElement).style.color = (active || inRange) ? color : "#64748b"; } }}
                >{n}</button>
              );
            })}
          </div>

          {/* Input decimal preciso */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Valor exato (decimal)
              </label>
              <input
                type="number" min="0" max="10" step="0.1"
                value={ratingAnalista ?? ""}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (e.target.value === "") { setRatingAnalista(null); return; }
                  if (!isNaN(v) && v >= 0 && v <= 10) setRatingAnalista(Math.round(v * 10) / 10);
                }}
                placeholder="ex: 7.5"
                style={{
                  width: 120, padding: "9px 12px", fontSize: 16, fontWeight: 700,
                  border: "1.5px solid #e2e8f0", borderRadius: 10, outline: "none",
                  color: ratingAnalista != null ? (ratingAnalista >= 8 ? "#16a34a" : ratingAnalista >= 5 ? "#d97706" : "#dc2626") : "#94a3b8",
                  background: "#fafafa", textAlign: "center",
                }}
                onFocus={e => (e.target.style.borderColor = "#203b88")}
                onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
              />
            </div>
            <p style={{ fontSize: 11, color: "#cbd5e1", marginTop: 18, fontStyle: "italic" }}>
              Use os botões para seleção rápida ou digite o decimal exato
            </p>
          </div>
        </div>

        {/* ── Score de Crédito V2 ── */}
        {id && <ScoreSection collectionId={id} />}

        {/* ── Parâmetros Operacionais + Decisão do Comitê ── */}
        {showParams && (<>

          {decisao === "REPROVADO" && (
            <div style={{
              background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 12,
              padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <AlertCircle size={16} style={{ color: "#dc2626", flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12, color: "#991b1b" }}>
                <strong>Operação reprovada.</strong> Os parâmetros abaixo serão mantidos no registro para histórico, mas não devem ser considerados aprovados. Se preferir, limpe os campos antes de confirmar.
              </div>
            </div>
          )}

          {/* ── Decisão do Comitê ── */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #1a2f6b, #203b88)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Shield size={15} style={{ color: "#a8d96b" }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>Decisão do Comitê sobre os Parâmetros</p>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Como os parâmetros do cedente foram tratados pelo comitê</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
              {([
                { value: "conforme_pleito",   label: "Conforme Pleito",          sub: "Parâmetros aprovados exatamente como solicitado", color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
                { value: "com_modificacoes",  label: "Aprovado com Modificações", sub: "Parâmetros ajustados pelo comitê em relação ao pleito", color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd" },
                { value: "condicionado",      label: "Condicionado",              sub: "Aprovação sujeita a condições específicas", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
              ] as const).map(op => {
                const sel = decisaoComite === op.value;
                return (
                  <button key={op.value} onClick={() => setDecisaoComite(sel ? null : op.value)}
                    style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                      border: sel ? `2px solid ${op.color}` : "1.5px solid #e5e7eb",
                      background: sel ? op.bg : "#fafafa", outline: "none",
                      boxShadow: sel ? `0 0 0 3px ${op.color}18` : "none", transition: "all 0.15s" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: sel ? op.color : "#0f172a" }}>{op.label}</span>
                    <span style={{ fontSize: 11, color: sel ? op.color : "#94a3b8", opacity: sel ? 0.85 : 1 }}>{op.sub}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Nota do Comitê <span style={{ color: "#cbd5e1", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— justificativa das decisões sobre os parâmetros</span></label>
              <textarea value={notaComite} onChange={e => setNotaComite(e.target.value)} rows={3}
                placeholder="Ex: Limite reduzido de R$ 500k para R$ 300k devido à concentração de sacados..."
                style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, resize: "vertical",
                  outline: "none", color: "#0f172a", background: "#fff", fontFamily: "inherit", boxSizing: "border-box" }}
                onFocus={e => (e.target.style.borderColor = "#203b88")}
                onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
            </div>
          </div>

          {/* ── Pleito vs Comitê ── */}
          <div style={{ display: "grid", gridTemplateColumns: Object.values(visitaParams).some(v => v) ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 20, alignItems: "start" }}>

            {/* Coluna esquerda — Pleito do Cedente (só mostra se houver relatório de visita) */}
            {Object.values(visitaParams).some(v => v) && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                    Pleito do Cedente
                  </p>
                  <span style={{ fontSize: 10, background: "#f1f5f9", color: "#64748b", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>
                    Relatório de Visita
                  </span>
                </div>
                {[
                  ["Pleito / Solicitação", visitaParams.pleito],
                  ["Modalidade", visitaParams.modalidade],
                  ["Taxa Convencional", visitaParams.taxaConvencional],
                  ["Taxa Comissária", visitaParams.taxaComissaria],
                  ["TAC", visitaParams.cobrancaTAC],
                  ["Limite Total", visitaParams.limiteTotal],
                  ["Limite Convencional", visitaParams.limiteConvencional],
                  ["Limite Comissária", visitaParams.limiteComissaria],
                  ["Limite por Sacado", visitaParams.limitePorSacado],
                  ["Ticket Médio", visitaParams.ticketMedio],
                  ["Prazo de Recompra", visitaParams.prazoRecompraCedente],
                  ["Prazo p/ Cartório", visitaParams.prazoEnvioCartorio],
                  ["Prazo Máximo Op.", visitaParams.prazoMaximoOp],
                  ["Tranche", visitaParams.tranche],
                  ["Prazo Tranche", visitaParams.prazoTranche],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f1f5f9", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{value}</span>
                  </div>
                ))}
                {!Object.values(visitaParams).some(v => v) && (
                  <p style={{ fontSize: 12, color: "#cbd5e1", fontStyle: "italic" }}>Nenhum parâmetro registrado no relatório de visita.</p>
                )}
              </div>
            )}

            {/* Coluna direita — Parâmetros Aprovados pelo Comitê */}
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "22px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  Parâmetros Aprovados pelo Comitê
                </p>
                {collection.ai_analysis && (
                  <span style={{ fontSize: 10, background: "#eff6ff", color: "#3b82f6", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>
                    pré-preenchido pela IA
                  </span>
                )}
              </div>

              {/* Crédito e Garantias */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: "#203b88", flexShrink: 0 }} />
                <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Crédito e Garantias</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Concentração por Sacado" value={concentracao} onChange={setConcentracao} placeholder="ex: até 25%" icon={Users} format="percent" />
                <InputField label="Garantias" value={garantias} onChange={setGarantias} placeholder="ex: Aval dos sócios" icon={Shield} />
              </div>

              {/* Taxas */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: "#203b88", flexShrink: 0 }} />
                <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Taxas</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Taxa Convencional" value={taxaConvencional} onChange={setTaxaConvencional} placeholder="ex: 2,5% a.m." icon={Percent} format="percent" />
                <InputField label="Taxa Comissária" value={taxaComissaria} onChange={setTaxaComissaria} placeholder="ex: 1,8% a.m." icon={Percent} format="percent" />
                <InputField label="Cobrança de TAC" value={tac} onChange={setTac} placeholder="ex: 0,3%" icon={TrendingUp} format="percent" />
              </div>

              {/* Limites */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: "#203b88", flexShrink: 0 }} />
                <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Limites</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Limite Total" value={limiteTotal} onChange={setLimiteTotal} placeholder="ex: R$ 500.000" icon={Landmark} format="currency" />
                <InputField label="Limite Convencional" value={limiteConvencional} onChange={setLimiteConvencional} placeholder="ex: R$ 300.000" icon={Landmark} format="currency" />
                <InputField label="Limite Comissária" value={limiteComissaria} onChange={setLimiteComissaria} placeholder="ex: R$ 200.000" icon={Landmark} format="currency" />
                <InputField label="Limite por Sacados" value={limitePorSacados} onChange={setLimitePorSacados} placeholder="ex: R$ 50.000" icon={Users} format="currency" />
                <InputField label="Ticket Médio" value={ticketMedio} onChange={setTicketMedio} placeholder="ex: R$ 15.000" icon={TrendingUp} format="currency" />
              </div>

              {/* Condições de Cobrança */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: "#203b88", flexShrink: 0 }} />
                <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Condições de Cobrança</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Prazo de Recompra" value={prazoRecompra} onChange={setPrazoRecompra} placeholder="ex: 3 dias" icon={RefreshCw} format="days" />
                <InputField label="Envio para Cartório" value={prazoCartorio} onChange={setPrazoCartorio} placeholder="ex: 5 dias" icon={Send} format="days" />
              </div>

              {/* Prazos e Tranche */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: "#203b88", flexShrink: 0 }} />
                <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Prazos e Tranche</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <InputField label="Prazo Máximo" value={prazoMaximo} onChange={setPrazoMaximo} placeholder="ex: 120 dias" icon={Calendar} format="days" />
                <InputField label="Tranche em R$" value={trancheValor} onChange={setTrancheValor} placeholder="ex: R$ 300.000" icon={DollarSign} format="currency" />
                <InputField label="Prazo Tranche (dias)" value={tranchePrazo} onChange={setTranchePrazo} placeholder="ex: 7 dias" icon={Package} format="days" />
              </div>
            </div>
          </div>
        </>)}

        {/* ── Observações ── */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #1a2f6b, #203b88)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={15} style={{ color: "#a8d96b" }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>Observações do Analista</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Considerações gerais — diferente da Nota do Comitê, que trata dos parâmetros.</p>
            </div>
          </div>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Ex: Empresa com histórico consolidado, mas atentar para sazonalidade no 2º semestre..."
            rows={4}
            style={{
              width: "100%", padding: "10px 12px", fontSize: 13,
              border: "1px solid #e2e8f0", borderRadius: 8, resize: "vertical",
              outline: "none", color: "#0f172a", background: "#fff",
              fontFamily: "inherit", boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={e => (e.target.style.borderColor = "#203b88")}
            onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
          />
        </div>

      </main>

      {/* ── Inline bottom action bar (rolagem normal) ── */}
      <div style={{
        background: "#ffffff",
        borderTop: "1px solid rgba(32,59,136,0.1)",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
        marginTop: 32,
      }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: 0 }}>{companyName}</p>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
              {decisao ? `Decisão: ${selectedD?.label}` : "Nenhuma decisão selecionada"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => window.history.back()}
              style={{ fontSize: 13, fontWeight: 500, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={visualizarHTML}
              disabled={!decisao || generatingPdf}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 13, fontWeight: 600,
                background: "none",
                color: decisao ? "#64748b" : "#94a3b8",
                border: `1px solid ${decisao ? "#cbd5e1" : "#e2e8f0"}`,
                borderRadius: 8, padding: "9px 16px",
                cursor: decisao ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {generatingPdf
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Abrindo...</>
                : <><ExternalLink size={14} /> Ver HTML</>
              }
            </button>
            <button
              onClick={compartilharPublico}
              disabled={!decisao || sharingPublic}
              title={publicLink ? "Link gerado — clique para copiar de novo" : "Gerar link público para compartilhar com o comitê"}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 13, fontWeight: 600,
                background: publicLink ? "#f0f9e0" : "none",
                color: !decisao ? "#94a3b8" : (publicLink ? "#5a9010" : "#64748b"),
                border: `1px solid ${!decisao ? "#e2e8f0" : (publicLink ? "#a8d96b" : "#cbd5e1")}`,
                borderRadius: 8, padding: "9px 16px",
                cursor: decisao ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {sharingPublic
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Gerando link...</>
                : publicLink
                  ? <><Copy size={14} /> Link copiado</>
                  : <><Link2 size={14} /> Compartilhar link</>
              }
            </button>
            <button
              onClick={baixarPDF}
              disabled={!decisao || downloadingPdf}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 13, fontWeight: 600,
                background: "none",
                color: decisao ? "#203b88" : "#94a3b8",
                border: `1px solid ${decisao ? "#203b88" : "#e2e8f0"}`,
                borderRadius: 8, padding: "9px 16px",
                cursor: decisao ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {downloadingPdf
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Gerando PDF...</>
                : <><Download size={14} /> Baixar PDF</>
              }
            </button>
            <button
              onClick={handleConfirmar}
              disabled={!decisao || saving}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 13, fontWeight: 700,
                background: decisao ? (selectedD?.color ?? "#203b88") : "#e2e8f0",
                color: decisao ? "#fff" : "#94a3b8",
                border: "none", borderRadius: 8, padding: "9px 22px",
                cursor: decisao ? "pointer" : "not-allowed",
                transition: "background 0.2s",
              }}
            >
              {saving
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Registrando...</>
                : <><FileText size={14} /> Confirmar Parecer</>
              }
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Page export with Suspense ─────────────────────────────────────────────
export default function ParecerPage() {
  return (
    <>
      <Toaster richColors position="top-right" />
      <Suspense fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
          <Loader2 size={28} style={{ color: "#203b88" }} className="animate-spin" />
        </div>
      }>
        <ParecerContent />
      </Suspense>
    </>
  );
}
