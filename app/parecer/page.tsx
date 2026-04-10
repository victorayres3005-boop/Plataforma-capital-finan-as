"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DocumentCollection } from "@/types";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, AlertTriangle,
  Loader2, Building2, DollarSign, Calendar, Users, Shield, RefreshCw, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "sonner";

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
  const [saving, setSaving] = useState(false);

  const [limiteCredito, setLimiteCredito] = useState("");
  const [prazoMaximo, setPrazoMaximo] = useState("");
  const [concentracao, setConcentracao] = useState("");
  const [garantias, setGarantias] = useState("");
  const [prazoRevisao, setPrazoRevisao] = useState("");
  const [notas, setNotas] = useState("");

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

        const ai = data.ai_analysis as Record<string, unknown> | null;
        const analista = ai?.parecerAnalista as Record<string, string> | null;
        const aiParams = ai?.parametrosOperacionais as Record<string, string> | null;
        const src = analista ?? aiParams ?? {};

        if (src.limiteCredito || src.limiteAproximado) setLimiteCredito(src.limiteCredito || src.limiteAproximado || "");
        if (src.prazoMaximo) setPrazoMaximo(src.prazoMaximo);
        if (src.concentracaoSacado) setConcentracao(src.concentracaoSacado);
        if (src.garantias) setGarantias(src.garantias);
        if (src.prazoRevisao || src.revisao) setPrazoRevisao(src.prazoRevisao || src.revisao || "");
      } catch {
        toast.error("Erro ao carregar dados da coleta.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleConfirmar = async () => {
    if (!decisao) { toast.error("Selecione uma decisão antes de confirmar."); return; }
    if (!id || !collection) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const existingAi = (collection.ai_analysis as Record<string, unknown>) || {};
      const parecerAnalista = {
        limiteCredito: limiteCredito.trim() || null,
        prazoMaximo: prazoMaximo.trim() || null,
        concentracaoSacado: concentracao.trim() || null,
        garantias: garantias.trim() || null,
        prazoRevisao: prazoRevisao.trim() || null,
        decidedAt: new Date().toISOString(),
      };
      const { error } = await supabase.from("document_collections").update({
        status: "finished",
        finished_at: new Date().toISOString(),
        decisao,
        observacoes: notas.trim() || null,
        ai_analysis: { ...existingAi, parecerAnalista },
      }).eq("id", id);
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
  const showParams = decisao === "APROVADO" || decisao === "APROVACAO_CONDICIONAL";
  const selectedD = DECISOES.find(d => d.value === decisao);
  const rating = collection?.rating ?? null;
  const ratingColor = rating != null ? (rating >= 7 ? "#16a34a" : rating >= 4 ? "#d97706" : "#dc2626") : "#94a3b8";
  const ratingBg = rating != null ? (rating >= 7 ? "#f0fdf4" : rating >= 4 ? "#fffbeb" : "#fff1f2") : "#f8fafc";
  const companyName = collection?.company_name || collection?.label || "Empresa";
  const cnpj = collection?.cnpj || "—";

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
          <Logo height={24} />
          <button
            onClick={() => window.history.back()}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
          >
            <ArrowLeft size={13} /> Voltar ao relatório
          </button>
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
                <p style={{ fontSize: 10, fontWeight: 700, color: ratingColor, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Rating IA</p>
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

        {/* ── Operational parameters ── */}
        {showParams && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                Parâmetros Operacionais
              </p>
              {collection.ai_analysis && (
                <span style={{ fontSize: 10, background: "#eff6ff", color: "#3b82f6", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>
                  pré-preenchido pela IA
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <InputField
                label="Limite de Crédito"
                value={limiteCredito}
                onChange={setLimiteCredito}
                placeholder="ex: R$ 150.000"
                icon={DollarSign}
                hint="Sugestão IA pré-preenchida"
              />
              <InputField
                label="Prazo Máximo"
                value={prazoMaximo}
                onChange={setPrazoMaximo}
                placeholder="ex: 90 dias"
                icon={Calendar}
              />
              <InputField
                label="Concentração por Sacado"
                value={concentracao}
                onChange={setConcentracao}
                placeholder="ex: até 25% por sacado"
                icon={Users}
              />
              <InputField
                label="Garantias"
                value={garantias}
                onChange={setGarantias}
                placeholder="ex: Aval dos sócios"
                icon={Shield}
              />
              <InputField
                label="Prazo de Revisão"
                value={prazoRevisao}
                onChange={setPrazoRevisao}
                placeholder="ex: 180 dias"
                icon={RefreshCw}
              />
            </div>
          </div>
        )}

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
