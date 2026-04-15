"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DocumentCollection } from "@/types";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, AlertTriangle,
  Loader2, Building2, DollarSign, Calendar, Users, Shield, RefreshCw, FileText,
  Percent, TrendingUp, Landmark, Package, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "sonner";
import { Download } from "lucide-react";

// ── Logo ──────────────────────────────────────────────────────────────────
function Logo({ height = 26 }: { height?: number }) {
  const blue = "#203b88";
  const green = "#73b815";
  const w = Math.round(height * 7.26);
  return (
    <svg width={w} height={height} viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="31" cy="27" r="22" stroke={blue} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={blue} />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill={blue}>capital</tspan>
        <tspan fill={green}>finanças</tspan>
      </text>
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────
type DecisaoValue = "APROVADO" | "APROVACAO_CONDICIONAL" | "PENDENTE" | "REPROVADO";

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
];

// ── Helpers ───────────────────────────────────────────────────────────────
function InputField({
  label, value, onChange, placeholder, icon: Icon, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ElementType;
  hint?: string;
}) {
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
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            outline: "none",
            background: "#fff",
            color: "#0f172a",
            boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
          onFocus={e => (e.target.style.borderColor = "#203b88")}
          onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
        />
      </div>
      {hint && <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>{hint}</span>}
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
  const [ratingAnalista, setRatingAnalista] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Estado de erro persistente do autosave — mostra no header para o analista
  // saber que precisa agir (sessao expirada, rede, RLS violacao).
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
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
  const [tac, setTac] = useState("0,3%");

  // Limites
  const [limiteTotal, setLimiteTotal] = useState("");
  const [limiteConvencional, setLimiteConvencional] = useState("");
  const [limiteComissaria, setLimiteComissaria] = useState("");
  const [limitePorSacados, setLimitePorSacados] = useState("");
  const [ticketMedio, setTicketMedio] = useState("");

  // Condições de cobrança
  const [prazoRecompra, setPrazoRecompra] = useState("3 dias");
  const [prazoCartorio, setPrazoCartorio] = useState("5 dias");

  // Prazos e Tranche
  const [prazoMaximo, setPrazoMaximo] = useState("120 dias");
  const [trancheValor, setTrancheValor] = useState("R$ 300.000,00");
  const [tranchePrazo, setTranchePrazo] = useState("7 dias");

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
        if (error || !data) { toast.error("Coleta não encontrada."); return; }
        setCollection(data as DocumentCollection);

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

        // Rating: prioriza o valor salvo pelo analista no parecerAnalista, depois a coluna denormalizada
        if (analista?.ratingAnalista != null) {
          setRatingAnalista(Number(analista.ratingAnalista));
        } else if (data.rating != null) {
          setRatingAnalista(Math.round(data.rating));
        }
        const aiParams = ai?.parametrosOperacionais as Record<string, unknown> | null;
        const src = (analista ?? aiParams ?? {}) as Record<string, unknown>;
        const s = (k: string) => (src[k] as string) || "";

        if (s("limiteCredito") || s("limiteAproximado")) setLimiteCredito(s("limiteCredito") || s("limiteAproximado"));
        if (s("concentracaoSacado")) setConcentracao(s("concentracaoSacado"));
        if (s("garantias")) setGarantias(s("garantias"));
        if (s("prazoRevisao") || s("revisao")) setPrazoRevisao(s("prazoRevisao") || s("revisao"));
        // Taxas
        if (s("taxaConvencional")) setTaxaConvencional(s("taxaConvencional"));
        if (s("taxaComissaria")) setTaxaComissaria(s("taxaComissaria"));
        if (s("tac")) setTac(s("tac"));
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

        // Recupera dados pendentes do localStorage (salvos no beforeunload anterior)
        // IMPORTANTE: so aplica se o pending for mais recente que o ultimo save
        // do Supabase. Se outra sessao editou a coleta depois do pending ser
        // gravado, pergunta ao analista antes de sobrescrever.
        try {
          const pendingRaw = localStorage.getItem(`cf_parecer_pending_${id}`);
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw);
            const pendingAt = new Date(pending.savedAt).getTime();
            const age = Date.now() - pendingAt;
            // Supabase retorna updated_at em alguns schemas — usa created_at como proxy
            // se nao houver updated_at. Se o timestamp do Supabase for MAIS RECENTE que
            // o pending, pergunta ao usuario antes de aplicar.
            const supaUpdatedAt = new Date(
              (data as unknown as { updated_at?: string; finished_at?: string; created_at?: string })
                .updated_at ||
              (data as unknown as { finished_at?: string }).finished_at ||
              data.created_at ||
              0,
            ).getTime();
            const supabaseIsNewer = supaUpdatedAt > pendingAt;
            const shouldApplyPending =
              age < 3600 * 1000 &&
              pending.parecerAnalista &&
              (!supabaseIsNewer ||
                (typeof window !== "undefined" &&
                  window.confirm(
                    "Foram encontradas alteracoes locais pendentes desta coleta, mas o banco tem dados mais recentes. Aplicar as alteracoes locais mesmo assim? (OK = aplicar pending, Cancelar = descartar pending e usar Supabase)",
                  )));
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
        } catch { /* ignore pending recovery errors */ }

        // Marca que o carregamento inicial terminou — libera o auto-save
        setTimeout(() => { initialLoadDone.current = true; }, 100);
      } catch {
        toast.error("Erro ao carregar dados da coleta.");
      } finally {
        setLoading(false);
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

  const doSave = useCallback(async () => {
    if (!id) return;
    try {
      const f = formRef.current;
      const supabase = createClient();
      const { data: session, error: authErr } = await supabase.auth.getUser();
      if (authErr || !session.user) {
        setAutoSaveError("Sessão expirada — faça login de novo para salvar.");
        return;
      }
      const { data: current, error: fetchErr } = await supabase
        .from("document_collections").select("ai_analysis").eq("id", id).single();
      if (fetchErr) {
        setAutoSaveError(`Erro ao ler coleta: ${fetchErr.message}`);
        return;
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
      // Agora sempre grava os 3 campos principais (inclusive null/vazio),
      // para que limpar um valor limpe no banco tambem.
      const { error: updateErr } = await supabase.from("document_collections").update({
        ai_analysis: { ...existingAi, parecerAnalista },
        decisao: f.decisao ?? null,
        rating: f.ratingAnalista ?? null,
        observacoes: f.notas.trim() || null,
      }).eq("id", id).eq("user_id", session.user.id);
      if (updateErr) {
        setAutoSaveError(`Erro ao salvar: ${updateErr.message}`);
        return;
      }
      pendingSave.current = false;
      setAutoSaveError(null);
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutoSaveError(`Erro ao salvar: ${msg.substring(0, 80)}`);
      console.warn("[parecer] autosave falhou:", msg);
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
    // Cancela auto-save pendente para evitar race condition
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    pendingSave.current = false;
    setSaving(true);
    try {
      const supabase = createClient();
      // Verificação de propriedade: garante que o update só afeta coletas do próprio usuário
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) { toast.error("Sessão expirada. Faça login novamente."); return; }
      const existingAi = (collection.ai_analysis as Record<string, unknown>) || {};
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
      toast.success("Parecer registrado com sucesso!");
      setTimeout(() => { window.location.href = `/historico?highlight=${id}`; }, 800);
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ──
  const showParams = !!decisao; // Sempre mostra parâmetros quando há decisão selecionada
  const selectedD = DECISOES.find(d => d.value === decisao);
  const rating = ratingAnalista ?? collection?.rating ?? null;
  const ratingColor = rating != null ? (rating >= 7 ? "#16a34a" : rating >= 4 ? "#d97706" : "#dc2626") : "#94a3b8";
  const ratingBg = rating != null ? (rating >= 7 ? "#f0fdf4" : rating >= 4 ? "#fffbeb" : "#fff1f2") : "#f8fafc";
  const ratingIsAnalista = ratingAnalista != null;
  const companyName = collection?.company_name || collection?.label || "Empresa";
  const cnpj = collection?.cnpj || "—";

  // ── Gerar PDF Decisão do Comitê ──
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const gerarPDFDecisao = async () => {
    setGeneratingPdf(true);
    try {
      const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      const decLabel: Record<string, string> = { APROVADO: "APROVADO", APROVACAO_CONDICIONAL: "APROVAÇÃO CONDICIONAL", PENDENTE: "EM ANÁLISE", REPROVADO: "REPROVADO" };
      const decStyle: Record<string, { bg: string; color: string }> = {
        APROVADO: { bg: "#dcfce7", color: "#166534" }, APROVACAO_CONDICIONAL: { bg: "#fef3c7", color: "#92400e" },
        PENDENTE: { bg: "#fef3c7", color: "#92400e" }, REPROVADO: { bg: "#fee2e2", color: "#991b1b" },
      };
      const comiteLabel: Record<string, string> = { conforme_pleito: "Conforme Pleito", com_modificacoes: "Aprovado com Modificações", condicionado: "Condicionado" };

      const rc = rating != null ? (rating >= 7 ? "#22c55e" : rating >= 4 ? "#f59e0b" : "#ef4444") : "#94a3b8";
      const riskLabel = rating != null ? (rating >= 7 ? "BAIXO RISCO" : rating >= 4 ? "RISCO MODERADO" : "ALTO RISCO") : "";
      const ds = decisao ? decStyle[decisao] || decStyle.PENDENTE : null;

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
      if (prazoRevisao) cond.push({ label: "Prazo de Revisão", value: prazoRevisao });

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Decisão do Comitê — ${esc(companyName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{margin:0}
@media print{.no-print{display:none!important}}
.page{min-height:100vh;display:flex;flex-direction:column}
</style></head><body>
<div class="page">

<!-- ═══ HEADER BAR ═══ -->
<div style="background:#0f1e3c;padding:28px 40px 0">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div>
      <div style="font-size:11px;font-weight:900;color:#fff;letter-spacing:.1em;text-transform:uppercase">CAPITAL <span style="color:#22c55e">FINANÇAS</span></div>
      <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px;letter-spacing:.04em">DECISÃO DO COMITÊ DE CRÉDITO</div>
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,.35)">${esc(hoje)}</div>
  </div>
  <div style="height:1px;background:rgba(255,255,255,.08);margin-bottom:24px"></div>

  <!-- Empresa + Decisão + Rating -->
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:32px;flex-wrap:wrap;padding-bottom:24px">
    <div style="flex:1;min-width:280px">
      ${ds ? `<span style="display:inline-block;padding:4px 14px;border-radius:4px;background:${ds.bg};color:${ds.color};font-size:10px;font-weight:800;letter-spacing:.06em;margin-bottom:10px">${decLabel[decisao!] || decisao}</span>` : ""}
      <div style="font-size:24px;font-weight:900;color:#fff;line-height:1.2;margin-bottom:6px">${esc(companyName)}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.45)">CNPJ ${esc(cnpj)}</div>
    </div>
    ${rating != null ? `
    <div style="text-align:center;flex-shrink:0">
      <div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Rating de Crédito</div>
      <div style="font-size:42px;font-weight:900;color:${rc};line-height:1">${rating}<span style="font-size:16px;color:rgba(255,255,255,.3)"> / 10</span></div>
      <span style="display:inline-block;margin-top:6px;padding:3px 12px;border-radius:99px;background:${rc};color:#fff;font-size:8px;font-weight:800;letter-spacing:.06em">${riskLabel}</span>
    </div>` : ""}
  </div>
</div>

<!-- ═══ TÍTULO DA DECISÃO DO COMITÊ ═══ -->
<div style="background:rgba(0,0,0,.15);padding:10px 40px">
  <div style="font-size:9px;font-weight:800;color:#22c55e;letter-spacing:.08em;text-transform:uppercase">DECISÃO DO COMITÊ DE CRÉDITO${decisaoComite ? ` — ${esc(comiteLabel[decisaoComite] || decisaoComite)}` : ""}</div>
</div>

<!-- ═══ CONTEÚDO ═══ -->
<div style="padding:28px 40px;flex:1">

${rows.length > 0 ? `
<!-- Seção: Comparativo -->
<div style="display:flex;align-items:center;gap:10px;background:#eef3fb;border-left:4px solid #22c55e;padding:8px 14px;margin-bottom:18px;border-radius:0 4px 4px 0">
  <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#1a2744;color:#fff;font-size:9px;font-weight:800;border-radius:6px;flex-shrink:0">CP</span>
  <span style="font-size:11px;font-weight:800;color:#1a2744;text-transform:uppercase;letter-spacing:.04em">Comparativo: Pleito do Cedente × Aprovado pelo Comitê</span>
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:28px">
  <thead>
    <tr>
      <th style="background:#1a2744;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:10px 14px;text-align:left;border-radius:6px 0 0 0">Parâmetro</th>
      <th style="background:#1a2744;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:10px 14px;text-align:center">Pleito do Cedente</th>
      <th style="background:#1a2744;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:10px 14px;text-align:center;border-radius:0 6px 0 0">Aprovado pelo Comitê</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((r, i) => {
      const diff = r.pleito !== "—" && r.aprovado !== "—" && r.pleito !== r.aprovado;
      const bg = i % 2 === 0 ? "#fff" : "#f8fafc";
      return `<tr style="background:${bg}">
        <td style="padding:10px 14px;font-size:11px;font-weight:600;color:#64748b;border-bottom:1px solid #f1f5f9">${esc(r.label)}</td>
        <td style="padding:10px 14px;font-size:11px;color:#374151;text-align:center;border-bottom:1px solid #f1f5f9">${esc(r.pleito)}</td>
        <td style="padding:10px 14px;font-size:11px;font-weight:700;text-align:center;border-bottom:1px solid #f1f5f9;color:${diff ? "#7c3aed" : "#111827"}">${esc(r.aprovado)}${diff ? ' <span style="font-size:9px;color:#7c3aed;font-weight:800">●</span>' : ""}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>
` : ""}

${cond.length > 0 ? `
<!-- Seção: Condições e Garantias -->
<div style="display:flex;align-items:center;gap:10px;background:#eef3fb;border-left:4px solid #22c55e;padding:8px 14px;margin-bottom:18px;border-radius:0 4px 4px 0">
  <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#1a2744;color:#fff;font-size:9px;font-weight:800;border-radius:6px;flex-shrink:0">CG</span>
  <span style="font-size:11px;font-weight:800;color:#1a2744;text-transform:uppercase;letter-spacing:.04em">Condições e Garantias</span>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px">
  ${cond.map(c => `
  <div style="background:#f8fafc;border-left:3px solid #1a2744;border-radius:0 8px 8px 0;padding:12px 16px">
    <div style="font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${esc(c.label)}</div>
    <div style="font-size:14px;font-weight:800;color:#1a2744">${esc(c.value)}</div>
  </div>`).join("")}
</div>
` : ""}

${notaComite.trim() || notas.trim() ? `
<!-- Seção: Observações -->
<div style="display:flex;align-items:center;gap:10px;background:#eef3fb;border-left:4px solid #22c55e;padding:8px 14px;margin-bottom:18px;border-radius:0 4px 4px 0">
  <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#1a2744;color:#fff;font-size:9px;font-weight:800;border-radius:6px;flex-shrink:0">NT</span>
  <span style="font-size:11px;font-weight:800;color:#1a2744;text-transform:uppercase;letter-spacing:.04em">Observações</span>
</div>
${notaComite.trim() ? `
<div style="background:#f0f4ff;border-left:4px solid #203b88;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:12px">
  <div style="font-size:8px;font-weight:800;color:#203b88;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Nota do Comitê</div>
  <div style="font-size:12px;color:#374151;line-height:1.7;white-space:pre-wrap">${esc(notaComite.trim())}</div>
</div>` : ""}
${notas.trim() ? `
<div style="background:#f8fafc;border-left:4px solid #94a3b8;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:12px">
  <div style="font-size:8px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Observações do Analista</div>
  <div style="font-size:12px;color:#374151;line-height:1.7;white-space:pre-wrap">${esc(notas.trim())}</div>
</div>` : ""}
` : ""}

</div>

<!-- ═══ FOOTER ═══ -->
<div style="background:#0f1e3c;padding:12px 40px;display:flex;justify-content:space-between;align-items:center;margin-top:auto">
  <span style="font-size:9px;color:rgba(255,255,255,.3)">Documento confidencial — uso exclusivamente interno</span>
  <span style="font-size:9px;color:rgba(255,255,255,.25)">Capital Finanças · ${esc(hoje)}</span>
</div>

</div>

<!-- Botão imprimir (não aparece na impressão) -->
<div class="no-print" style="position:fixed;bottom:24px;right:24px;display:flex;gap:10px;z-index:100">
  <button onclick="window.print()" style="padding:12px 28px;background:#1a2744;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);font-family:inherit">Salvar como PDF</button>
</div>

</body></html>`;

      // Abre em nova aba para impressão
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("Documento aberto — clique em 'Salvar como PDF' para baixar.");
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Erro ao gerar documento.");
    } finally {
      setGeneratingPdf(false);
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
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ textDecoration: "none" }}><Logo height={24} /></a>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {autoSaved && (
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
      </header>

      {/* ── Content ── */}
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 140px" }}>

        {/* ── Page title ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", margin: 0 }}>Registrar Parecer Final</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Defina a decisão do analista e os parâmetros operacionais para esta empresa.</p>
        </div>

        {/* ── Company card ── */}
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
          padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#203b88", borderRadius: "8px 0 0 8px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingLeft: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Building2 size={18} style={{ color: "#203b88" }} />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>{companyName}</p>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{cnpj}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {rating != null && (
              <div style={{ background: ratingBg, border: `1px solid ${ratingColor}22`, borderRadius: 10, padding: "6px 14px", textAlign: "center" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: ratingColor, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>{ratingIsAnalista ? "Rating Analista" : "Rating IA"}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: ratingColor, margin: 0, lineHeight: 1.2 }}>{rating.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 500 }}>/10</span></p>
              </div>
            )}
            {selectedD && (
              <div style={{ background: selectedD.lightBg, border: `1px solid ${selectedD.border}`, borderRadius: 10, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                <selectedD.Icon size={14} style={{ color: selectedD.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: selectedD.color }}>{selectedD.label}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Decision section ── */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, margin: "0 0 16px" }}>
            Decisão do Analista
          </p>
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
        </div>

        {/* ── Rating do Comitê ── */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                Rating do Comitê
              </p>
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, maxWidth: 420 }}>
                Definido manualmente pelo comitê — este valor vai para o dashboard e histórico.
                {collection.rating != null && (
                  <span style={{ color: "#cbd5e1" }}> IA gerou {collection.rating.toFixed(1)}/10 apenas como referência.</span>
                )}
              </p>
            </div>
            {ratingAnalista != null && (
              <div style={{
                background: ratingAnalista >= 7 ? "#f0fdf4" : ratingAnalista >= 4 ? "#fffbeb" : "#fff1f2",
                border: `2px solid ${ratingAnalista >= 7 ? "#86efac" : ratingAnalista >= 4 ? "#fcd34d" : "#fca5a5"}`,
                borderRadius: 14, padding: "10px 20px", textAlign: "center", flexShrink: 0,
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, color: ratingAnalista >= 7 ? "#16a34a" : ratingAnalista >= 4 ? "#d97706" : "#dc2626" }}>Comitê</p>
                <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1.1, color: ratingAnalista >= 7 ? "#16a34a" : ratingAnalista >= 4 ? "#d97706" : "#dc2626" }}>
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
              const color = n >= 7 ? "#16a34a" : n >= 4 ? "#d97706" : "#dc2626";
              const lightBg = n >= 7 ? "#f0fdf4" : n >= 4 ? "#fffbeb" : "#fff1f2";
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
                  color: ratingAnalista != null ? (ratingAnalista >= 7 ? "#16a34a" : ratingAnalista >= 4 ? "#d97706" : "#dc2626") : "#94a3b8",
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

        {/* ── Parâmetros Operacionais + Decisão do Comitê ── */}
        {showParams && (<>

          {/* ── Decisão do Comitê ── */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 16px" }}>
              Decisão do Comitê sobre os Parâmetros
            </p>
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
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Nota do Comitê</label>
              <textarea value={notaComite} onChange={e => setNotaComite(e.target.value)} rows={3}
                placeholder="Justificativa das modificações, condições impostas, observações do comitê..."
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
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px" }}>
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
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                  Parâmetros Aprovados pelo Comitê
                </p>
                {collection.ai_analysis && (
                  <span style={{ fontSize: 10, background: "#eff6ff", color: "#3b82f6", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>
                    pré-preenchido pela IA
                  </span>
                )}
              </div>

              {/* Crédito e Garantias */}
              <p style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Crédito e Garantias</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Limite de Crédito" value={limiteCredito} onChange={setLimiteCredito} placeholder="ex: R$ 150.000" icon={DollarSign} hint="Sugestão IA" />
                <InputField label="Concentração por Sacado" value={concentracao} onChange={setConcentracao} placeholder="ex: até 25%" icon={Users} />
                <InputField label="Garantias" value={garantias} onChange={setGarantias} placeholder="ex: Aval dos sócios" icon={Shield} />
                <InputField label="Prazo de Revisão" value={prazoRevisao} onChange={setPrazoRevisao} placeholder="ex: 180 dias" icon={RefreshCw} />
              </div>

              {/* Taxas */}
              <p style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Taxas</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Taxa Convencional" value={taxaConvencional} onChange={setTaxaConvencional} placeholder="ex: 2,5% a.m." icon={Percent} />
                <InputField label="Taxa Comissária" value={taxaComissaria} onChange={setTaxaComissaria} placeholder="ex: 1,8% a.m." icon={Percent} />
                <InputField label="Cobrança de TAC" value={tac} onChange={setTac} placeholder="ex: 0,3%" icon={TrendingUp} />
              </div>

              {/* Limites */}
              <p style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Limites</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Limite Total" value={limiteTotal} onChange={setLimiteTotal} placeholder="ex: R$ 500.000" icon={Landmark} />
                <InputField label="Limite Convencional" value={limiteConvencional} onChange={setLimiteConvencional} placeholder="ex: R$ 300.000" icon={Landmark} />
                <InputField label="Limite Comissária" value={limiteComissaria} onChange={setLimiteComissaria} placeholder="ex: R$ 200.000" icon={Landmark} />
                <InputField label="Limite por Sacados" value={limitePorSacados} onChange={setLimitePorSacados} placeholder="ex: R$ 50.000" icon={Users} />
                <InputField label="Ticket Médio" value={ticketMedio} onChange={setTicketMedio} placeholder="ex: R$ 15.000" icon={TrendingUp} />
              </div>

              {/* Condições de Cobrança */}
              <p style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Condições de Cobrança</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InputField label="Prazo de Recompra" value={prazoRecompra} onChange={setPrazoRecompra} placeholder="ex: 3 dias" icon={RefreshCw} />
                <InputField label="Envio para Cartório" value={prazoCartorio} onChange={setPrazoCartorio} placeholder="ex: 5 dias" icon={Send} />
              </div>

              {/* Prazos e Tranche */}
              <p style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Prazos e Tranche</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <InputField label="Prazo Máximo" value={prazoMaximo} onChange={setPrazoMaximo} placeholder="ex: 120 dias" icon={Calendar} />
                <InputField label="Tranche em R$" value={trancheValor} onChange={setTrancheValor} placeholder="ex: R$ 300.000" icon={DollarSign} />
                <InputField label="Prazo Tranche (dias)" value={tranchePrazo} onChange={setTranchePrazo} placeholder="ex: 7 dias" icon={Package} />
              </div>
            </div>
          </div>
        </>)}

        {/* ── Observações ── */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, margin: "0 0 14px" }}>
            Observações do Analista
          </p>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Adicione observações, ressalvas ou justificativas para esta decisão..."
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

      {/* ── Fixed bottom action bar ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "#fff", borderTop: "1px solid #f1f5f9",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
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
              onClick={gerarPDFDecisao}
              disabled={!decisao || generatingPdf}
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
              {generatingPdf
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Gerando...</>
                : <><Download size={14} /> Baixar Decisão</>
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
