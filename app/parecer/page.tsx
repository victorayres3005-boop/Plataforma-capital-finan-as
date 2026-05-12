"use client";

// /parecer — versão enxuta (2026-05-12).
//
// Antes: 1741 linhas com 17 campos de pleito + observações + Score V2 +
// gerador de PDF interno + autosave complexo + integração Goalfy.
//
// Agora: SÓ Decisão final (5 opções) + Nota do Comitê. Todo o resto migrou
// para o /r/{id} (Pleito do Comitê, 4 Percepções, Pontos Fortes/Fracos/
// Alertas). Score V2 saiu por decisão de produto. PDF do parecer baixa
// pelo /r/{id} (botão "Baixar Parecer" + endpoint /api/r/[id]/parecer-pdf
// já existente desde 2026-05-11).
//
// Pareceres ANTIGOS no Supabase continuam intactos no JSONB
// document_collections.ai_analysis.parecerAnalista — apenas deixam de
// ser lidos/escritos pelos campos removidos. Lista /pareceres lê
// snapshot da tabela `pareceres` (novos pareceres gravam payload mínimo;
// campos não-essenciais ficam null e a lista lida com isso).

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DocumentCollection } from "@/types";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, AlertTriangle,
  Loader2, HelpCircle, FileText, ExternalLink,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { toast } from "sonner";

type DecisaoValue = "APROVADO" | "APROVACAO_CONDICIONAL" | "PENDENTE" | "REPROVADO" | "QUESTIONAMENTO";

const DECISOES: {
  value: DecisaoValue;
  label: string;
  sub: string;
  color: string;
  lightBg: string;
  Icon: React.ElementType;
}[] = [
  { value: "APROVADO",             label: "Aprovado",              sub: "Empresa apta para operação sem restrições",       color: "#16a34a", lightBg: "#f0fdf4", Icon: CheckCircle2 },
  { value: "APROVACAO_CONDICIONAL",label: "Aprovação Condicional", sub: "Apta sujeito às condições estabelecidas",          color: "#7c3aed", lightBg: "#faf5ff", Icon: AlertTriangle },
  { value: "PENDENTE",             label: "Em Análise",            sub: "Aguardando informações ou revisão adicional",      color: "#d97706", lightBg: "#fffbeb", Icon: Clock },
  { value: "REPROVADO",            label: "Reprovado",             sub: "Empresa não apta para a operação",                 color: "#dc2626", lightBg: "#fff1f2", Icon: XCircle },
  { value: "QUESTIONAMENTO",       label: "Questionamento",        sub: "Análise em questionamento — aguarda esclarecimentos", color: "#0891b2", lightBg: "#ecfeff", Icon: HelpCircle },
];

function ParecerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [loading, setLoading]                 = useState(true);
  const [collection, setCollection]           = useState<DocumentCollection | null>(null);
  const [decisao, setDecisao]                 = useState<DecisaoValue | null>(null);
  const [ratingComite, setRatingComite]       = useState("");
  const [notaComite, setNotaComite]           = useState("");
  const [saving, setSaving]                   = useState(false);
  const [autoSavedAt, setAutoSavedAt]         = useState<Date | null>(null);
  const [sessionExpired, setSessionExpired]   = useState(false);
  const [parecerId, setParecerId]             = useState<string | null>(null);
  const [sharedReportId, setSharedReportId]   = useState<string | null>(null);

  // ── Carrega coleta + parecer existente + shared_report associado ─────────
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    (async () => {
      try {
        const supabase = createClient();
        const [collRes, parecerRes, shareRes] = await Promise.all([
          supabase.from("document_collections").select("*").eq("id", id).single(),
          supabase.from("pareceres").select("id").eq("collection_id", id).maybeSingle(),
          supabase.from("shared_reports").select("id").eq("collection_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (collRes.error || !collRes.data) {
          toast.error("Coleta não encontrada.");
          return;
        }
        const data = collRes.data as DocumentCollection;
        setCollection(data);
        if (parecerRes.data?.id) setParecerId(parecerRes.data.id as string);
        if (shareRes.data?.id) setSharedReportId(shareRes.data.id as string);

        if (data.decisao) setDecisao(data.decisao as DecisaoValue);
        const ai = data.ai_analysis as Record<string, unknown> | null;
        const analista = ai?.parecerAnalista as Record<string, unknown> | null;
        if (typeof analista?.notaComite === "string") setNotaComite(analista.notaComite);
        // Rating: prioriza valor salvo pelo analista; fallback p/ coluna rating
        const r = analista?.ratingAnalista ?? data.rating;
        if (r != null) setRatingComite(String(r).replace(".", ","));
      } catch (err) {
        toast.error("Erro ao carregar coleta: " + (err instanceof Error ? err.message : "desconhecido"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Autosave debounced (decisão + nota) ──────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!id || loading) return;
    // Pula o primeiro render (estado vindo do carregamento, não edição real)
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: session } = await supabase.auth.getUser();
        if (!session.user) { setSessionExpired(true); return; }
        const { data: fresh } = await supabase
          .from("document_collections").select("ai_analysis").eq("id", id).single();
        const existingAi = (fresh?.ai_analysis as Record<string, unknown>) || {};
        const existingAnalista = (existingAi.parecerAnalista as Record<string, unknown>) || {};
        const ratingNum = (() => {
          const n = parseFloat(ratingComite.replace(",", "."));
          return isNaN(n) ? null : Math.max(0, Math.min(10, Math.round(n * 10) / 10));
        })();
        const { error } = await supabase.from("document_collections").update({
          decisao: decisao || null,
          rating: ratingNum,
          ai_analysis: {
            ...existingAi,
            parecerAnalista: {
              ...existingAnalista,
              notaComite: notaComite.trim() || null,
              ratingAnalista: ratingNum,
              decidedAt: new Date().toISOString(),
            },
          },
        }).eq("id", id).eq("user_id", session.user.id);
        if (!error) setAutoSavedAt(new Date());
      } catch (err) {
        console.warn("[parecer] autosave falhou:", err);
      }
    }, 800);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [id, decisao, notaComite, ratingComite, loading]);

  // ── Confirmar (finaliza coleta + grava snapshot na tabela pareceres) ─────
  const handleConfirmar = useCallback(async () => {
    if (!decisao) { toast.error("Selecione uma decisão antes de confirmar."); return; }
    if (!id || !collection) return;
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) { setSessionExpired(true); return; }
      const { data: fresh, error: freshErr } = await supabase
        .from("document_collections").select("ai_analysis").eq("id", id).single();
      if (freshErr) throw freshErr;
      const existingAi = (fresh?.ai_analysis as Record<string, unknown>) || {};
      const existingAnalista = (existingAi.parecerAnalista as Record<string, unknown>) || {};
      const ratingNum = (() => {
        const n = parseFloat(ratingComite.replace(",", "."));
        return isNaN(n) ? null : Math.max(0, Math.min(10, Math.round(n * 10) / 10));
      })();
      const parecerAnalista = {
        ...existingAnalista,
        notaComite: notaComite.trim() || null,
        ratingAnalista: ratingNum,
        decidedAt: new Date().toISOString(),
      };
      const { error } = await supabase.from("document_collections").update({
        status: "finished",
        finished_at: new Date().toISOString(),
        decisao,
        rating: ratingNum,
        ai_analysis: { ...existingAi, parecerAnalista },
      }).eq("id", id).eq("user_id", session.user.id);
      if (error) throw error;

      // Snapshot na tabela `pareceres` (usada por /pareceres e cron de reanálise).
      // Campos não-essenciais ficam null; pareceres antigos preservam valores.
      try {
        const parecerPayload = {
          collection_id: id,
          user_id: session.user.id,
          cnpj: collection?.cnpj || null,
          razao_social: collection?.company_name || null,
          decisao_comite: decisao,
          observacoes: null,
          // Campos legados (mantidos como null pra não quebrar lista /pareceres)
          limite_aprovado: null,
          prazo_maximo: null,
          concentracao_max: null,
          garantias: null,
          prazo_revisao: null,
          score_v2_rating: null,
          score_v2_pontos: null,
          score_v2_conf: null,
          rating_ia: ratingNum,  // rating do comitê preenchido no /parecer
          decisao_ia: null,
          membros_comite: null,
          // Reanálise: fallback fixo 90 dias (sem Score V2 não dá pra usar regra por rating)
          data_proxima_reanalise: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 90);
            return d.toISOString().split("T")[0];
          })(),
          rating_v2: null,
          score_v2: null,
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

      toast.success("Parecer confirmado!");
    } catch (err) {
      toast.error("Erro ao confirmar: " + (err instanceof Error ? err.message : "desconhecido"));
    } finally {
      setSaving(false);
    }
  }, [decisao, id, collection, notaComite, parecerId]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <Loader2 size={28} style={{ color: "#203b88" }} className="animate-spin" />
      </div>
    );
  }

  if (sessionExpired) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", flexDirection: "column", gap: 12, padding: 24 }}>
        <p style={{ color: "#dc2626", fontSize: 14 }}>Sessão expirada. Faça login novamente.</p>
        <button onClick={() => router.push("/login")} style={{ padding: "8px 16px", background: "#1a2f6b", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Ir para login</button>
      </div>
    );
  }

  if (!collection) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <p style={{ color: "#64748b", fontSize: 14 }}>Coleta não encontrada.</p>
      </div>
    );
  }

  const companyName = collection.company_name || collection.label || "Empresa";
  const cnpj = collection.cnpj || "—";
  const selectedD = DECISOES.find(d => d.value === decisao);

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "20px 24px 32px" }}>

        <Breadcrumb
          items={[
            { label: "Pareceres", href: "/pareceres" },
            { label: companyName, current: true },
          ]}
          className="mb-4"
        />

        {/* Hero Banner */}
        <div style={{
          background: "linear-gradient(135deg, #1a2f6b 0%, #203b88 60%, #1e3a8a 100%)",
          borderRadius: 16, padding: "22px 24px", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(168,217,107,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={20} style={{ color: "#a8d96b" }} />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(168,217,107,0.9)", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>Registrar Parecer Final</p>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "2px 0 0" }}>{companyName}</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "1px 0 0" }}>CNPJ {cnpj}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {(() => {
              const n = parseFloat(ratingComite.replace(",", "."));
              if (isNaN(n)) return null;
              const clamped = Math.max(0, Math.min(10, n));
              const c = clamped >= 8 ? "#4ade80" : clamped >= 5 ? "#fbbf24" : "#f87171";
              return (
                <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", borderRadius: 10, padding: "6px 14px", textAlign: "center", border: `1px solid ${c}44` }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Rating</p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: c, margin: 0, lineHeight: 1.2 }}>{clamped.toFixed(1)}<span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>/10</span></p>
                </div>
              );
            })()}
            {selectedD && (
              <div style={{ background: `${selectedD.color}25`, border: `1px solid ${selectedD.color}55`, borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                <selectedD.Icon size={14} style={{ color: selectedD.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: selectedD.color }}>{selectedD.label}</span>
              </div>
            )}
          </div>
        </div>

        {/* Decisão */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 22, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Decisão do Comitê</p>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>Selecione o resultado desta análise de crédito</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {DECISOES.map(d => {
              const selected = decisao === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDecisao(d.value)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "13px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                    border: selected ? `2px solid ${d.color}` : "1.5px solid #e5e7eb",
                    background: selected ? d.lightBg : "#fafafa",
                    transition: "all 0.15s", outline: "none",
                    boxShadow: selected ? `0 0 0 3px ${d.color}18` : "none",
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: selected ? `${d.color}18` : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <d.Icon size={16} style={{ color: selected ? d.color : "#94a3b8" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: selected ? d.color : "#0f172a", margin: 0 }}>{d.label}</p>
                    <p style={{ fontSize: 11, color: selected ? d.color : "#64748b", opacity: selected ? 0.85 : 1, margin: "2px 0 0", lineHeight: 1.4 }}>{d.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rating do Comitê */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 22, marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", display: "block", marginBottom: 4 }}>Rating do Comitê</label>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Nota de 0 a 10 — pode usar 1 casa decimal (ex.: 7,5)</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="text"
              inputMode="decimal"
              value={ratingComite}
              onChange={e => setRatingComite(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="—"
              style={{
                width: 120, padding: "10px 14px", borderRadius: 8,
                border: "1px solid #e5e7eb", fontSize: 18, fontWeight: 700, color: "#0f172a",
                fontFamily: "inherit", outline: "none", textAlign: "center",
                background: "#fafafa",
              }}
            />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>/ 10</span>
            {(() => {
              const n = parseFloat(ratingComite.replace(",", "."));
              if (isNaN(n)) return null;
              const clamped = Math.max(0, Math.min(10, n));
              const label = clamped >= 8 ? "Baixo Risco" : clamped >= 5 ? "Risco Moderado" : "Alto Risco";
              const color = clamped >= 8 ? "#16a34a" : clamped >= 5 ? "#d97706" : "#dc2626";
              return (
                <span style={{ fontSize: 11, fontWeight: 700, color, padding: "4px 10px", background: `${color}15`, borderRadius: 99 }}>
                  {label}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Nota do Comitê */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 22, marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", display: "block", marginBottom: 4 }}>Nota do Comitê</label>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Texto livre — registre a justificativa da decisão</p>
          <textarea
            value={notaComite}
            onChange={e => setNotaComite(e.target.value)}
            placeholder="Ex.: Aprovado com base em fluxo de caixa saudável, sem restritivos relevantes e sócios com bom histórico."
            rows={5}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              border: "1px solid #e5e7eb", fontSize: 13, color: "#0f172a",
              fontFamily: "inherit", outline: "none", resize: "vertical", minHeight: 100,
              background: "#fafafa",
            }}
          />
        </div>

        {/* Link p/ relatório público (se houver shared_report) */}
        {sharedReportId && (
          <a
            href={`/r/${sharedReportId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#1a2f6b",
              padding: "8px 14px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff",
              textDecoration: "none", marginBottom: 16,
            }}
          >
            <ExternalLink size={13} /> Abrir relatório público (Pleito do Comitê, Percepções, baixar PDF)
          </a>
        )}

        {/* Action bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "14px 18px",
        }}>
          <button
            onClick={() => router.back()}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
              fontSize: 13, color: "#64748b", background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            <ArrowLeft size={13} /> Voltar
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {autoSavedAt && (
              <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>
                Salvo às {autoSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              onClick={handleConfirmar}
              disabled={!decisao || saving}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px",
                fontSize: 13, fontWeight: 700, color: "#fff",
                background: decisao ? "#16a34a" : "#94a3b8",
                border: "none", borderRadius: 8,
                cursor: decisao && !saving ? "pointer" : "not-allowed",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> : <><CheckCircle2 size={13} /> Confirmar Parecer</>}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ParecerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <Loader2 size={28} style={{ color: "#203b88" }} className="animate-spin" />
      </div>
    }>
      <ParecerContent />
    </Suspense>
  );
}
