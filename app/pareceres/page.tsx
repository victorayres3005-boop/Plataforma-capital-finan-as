"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import {
  ClipboardList, FileText, Building2, CheckCircle2,
  Clock, XCircle, AlertTriangle, ChevronRight, BarChart3,
  TrendingUp, DollarSign, ArrowLeft, Download, HelpCircle,
  Search, ChevronLeft,
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/skeleton";
import { fmtBRL as fmtBRLBase } from "@/lib/formatters";

const fmtBRL = (v: number | null) => fmtBRLBase(v, { maximumFractionDigits: 0 });

// ── Types ──────────────────────────────────────────────────────────────────────
type DecisaoComite = "APROVADO" | "APROVACAO_CONDICIONAL" | "REPROVADO" | "PENDENTE" | "QUESTIONAMENTO";
type RatingV2 = "A" | "B" | "C" | "D" | "E" | "F";

interface Parecer {
  id: string;
  collection_id: string;
  cnpj: string | null;
  razao_social: string | null;
  decisao_comite: DecisaoComite;
  limite_aprovado: number | null;
  prazo_maximo: number | null;
  score_v2_rating: RatingV2 | null;
  score_v2_pontos: number | null;
  score_v2_conf: string | null;
  rating_ia: number | null;
  garantias: string | null;
  observacoes: string | null;
  created_at: string;
}

interface PendingCollection {
  id: string;
  company_name: string | null;
  cnpj: string | null;
  label: string | null;
  rating: number | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
type FilterValue = "todos" | "APROVADO" | "APROVACAO_CONDICIONAL" | "REPROVADO" | "PENDENTE" | "QUESTIONAMENTO" | "pendentes";

const DECISAO_CONFIG: Record<DecisaoComite, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  APROVADO:              { label: "Aprovado",          color: "#16a34a", bg: "#f0fdf4", border: "#86efac", Icon: CheckCircle2 },
  APROVACAO_CONDICIONAL: { label: "Condicional",       color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd", Icon: AlertTriangle },
  PENDENTE:              { label: "Em Análise",        color: "#d97706", bg: "#fffbeb", border: "#fcd34d", Icon: Clock },
  REPROVADO:             { label: "Reprovado",         color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", Icon: XCircle },
  QUESTIONAMENTO:        { label: "Questionamento",    color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc", Icon: HelpCircle },
};

const V2_CONFIG: Record<RatingV2, { color: string; bg: string; label: string }> = {
  A: { color: "#16a34a", bg: "#f0fdf4", label: "Excelente" },
  B: { color: "#65a30d", bg: "#f7fee7", label: "Bom" },
  C: { color: "#d97706", bg: "#fffbeb", label: "Moderado" },
  D: { color: "#ea580c", bg: "#fff7ed", label: "Fraco" },
  E: { color: "#dc2626", bg: "#fef2f2", label: "Ruim" },
  F: { color: "#991b1b", bg: "#fff1f2", label: "Crítico" },
};

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  const accent = color ?? "#203b88";
  return (
    <div style={{
      position: "relative",
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 16,
      padding: "22px 22px 20px",
      display: "flex", flexDirection: "column", gap: 6,
      boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 14px -8px rgba(15,23,42,0.06)",
      overflow: "hidden",
      transition: "transform 0.2s, box-shadow 0.2s",
    }}>
      {/* Barra superior temática */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent}, ${accent}99)`,
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {Icon && (
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `${accent}14`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Icon size={14} style={{ color: accent }} />
          </div>
        )}
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>{label}</span>
      </div>
      <span style={{
        fontSize: 32, fontWeight: 900, color: accent, lineHeight: 1,
        fontFeatureSettings: '"tnum"',
        letterSpacing: "-0.02em",
      }}>{value}</span>
      {sub && (
        <span style={{
          fontSize: 11, color: "#94a3b8", marginTop: 2,
          letterSpacing: "0.01em",
        }}>{sub}</span>
      )}
    </div>
  );
}

// ── Rating Bar ─────────────────────────────────────────────────────────────────
function RatingBar({ rating, count, total }: { rating: RatingV2; count: number; total: number }) {
  const cfg = V2_CONFIG[rating];
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `linear-gradient(135deg, ${cfg.bg}, #fff)`,
        border: `1.5px solid ${cfg.color}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 900, color: cfg.color,
        boxShadow: count > 0 ? `0 0 0 3px ${cfg.color}10` : "none",
      }}>{rating}</div>
      <div style={{ flex: 1 }}>
        <div style={{ height: 10, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}cc)`,
            borderRadius: 99, transition: "width 0.5s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color, minWidth: 28, textAlign: "right", fontFeatureSettings: '"tnum"' }}>{count}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", minWidth: 36, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ParecerPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [pareceres, setPareceres] = useState<Parecer[]>([]);
  const [pending, setPending] = useState<PendingCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("todos");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;

  // Reseta paginação quando filtro ou busca mudam — evita ficar preso em pg vazia.
  useEffect(() => { setCurrentPage(1); }, [filter, search]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    const load = async () => {
      try {
        const supabase = createClient();
        const [parecerRes, colRes] = await Promise.all([
          supabase.from("pareceres").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("document_collections")
            .select("id, company_name, cnpj, label, rating, created_at, status, decisao")
            .eq("user_id", user.id).eq("status", "finished")
            .order("created_at", { ascending: false }),
        ]);
        const formalPareceres = (parecerRes.data ?? []) as Parecer[];
        setPareceres(formalPareceres);

        // Coletas finalizadas sem parecer formal
        const registeredIds = new Set(formalPareceres.map(p => p.collection_id));
        const pendingCols = ((colRes.data ?? []) as PendingCollection[])
          .filter(c => !registeredIds.has(c.id));
        setPending(pendingCols);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [user, authLoading, router]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const aprovados        = pareceres.filter(p => p.decisao_comite === "APROVADO").length;
  const condicionais     = pareceres.filter(p => p.decisao_comite === "APROVACAO_CONDICIONAL").length;
  const reprovados       = pareceres.filter(p => p.decisao_comite === "REPROVADO").length;
  const questionamentos  = pareceres.filter(p => p.decisao_comite === "QUESTIONAMENTO").length;

  const limiteTotal = pareceres
    .filter(p => p.decisao_comite === "APROVADO" || p.decisao_comite === "APROVACAO_CONDICIONAL")
    .reduce((s, p) => s + (p.limite_aprovado ?? 0), 0);

  const v2Counts = (["A","B","C","D","E","F"] as RatingV2[]).map(r => ({
    rating: r,
    count: pareceres.filter(p => p.score_v2_rating === r).length,
  }));
  const totalComV2 = pareceres.filter(p => p.score_v2_rating).length;

  // ── Filtered list ───────────────────────────────────────────────────────────
  const listItems: Array<{ type: "parecer"; data: Parecer } | { type: "pending"; data: PendingCollection }> = [];

  if (filter === "pendentes") {
    pending.forEach(c => listItems.push({ type: "pending", data: c }));
  } else if (filter === "todos") {
    pareceres.forEach(p => listItems.push({ type: "parecer", data: p }));
    pending.forEach(c => listItems.push({ type: "pending", data: c }));
  } else {
    pareceres.filter(p => p.decisao_comite === filter).forEach(p => listItems.push({ type: "parecer", data: p }));
  }

  // Aplica busca por empresa/CNPJ — case-insensitive, ignora pontuação no CNPJ.
  const searchNorm = search.trim().toLowerCase();
  const cnpjDigits = searchNorm.replace(/\D/g, "");
  const filteredItems = searchNorm
    ? listItems.filter(item => {
        const name = (item.type === "parecer" ? item.data.razao_social : (item.data.company_name || item.data.label)) || "";
        const cnpj = (item.data.cnpj || "").replace(/\D/g, "");
        return name.toLowerCase().includes(searchNorm) || (cnpjDigits.length >= 3 && cnpj.includes(cnpjDigits));
      })
    : listItems;

  // Paginação client-side — listas crescem com o tempo e queremos resposta instantânea.
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
        <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 80px" }}>
          <div className="h-8 w-1/3 animate-pulse rounded bg-slate-200 mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-white border border-slate-200 p-4 animate-pulse">
                <div className="h-3 w-1/2 rounded bg-slate-200 mb-3" />
                <div className="h-6 w-2/3 rounded bg-slate-200" />
              </div>
            ))}
          </div>
          <TableSkeleton cols={4} rows={6} />
        </main>
      </div>
    );
  }

  const exportCsv = () => {
    const cols = [
      "Empresa", "CNPJ", "Decisão", "Rating V2", "Score V2 pts", "Confiança V2",
      "Rating IA", "Limite Aprovado", "Prazo (dias)", "Garantias", "Observações", "Data",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = pareceres.map(p => [
      p.razao_social ?? "", p.cnpj ?? "",
      DECISAO_CONFIG[p.decisao_comite]?.label ?? p.decisao_comite,
      p.score_v2_rating ?? "", p.score_v2_pontos ?? "", p.score_v2_conf ?? "",
      p.rating_ia ?? "", p.limite_aprovado ?? "", p.prazo_maximo ?? "",
      p.garantias ?? "", p.observacoes ?? "",
      new Date(p.created_at).toLocaleDateString("pt-BR"),
    ].map(escape).join(","));
    const csv = [cols.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pareceres_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const FILTERS: { value: FilterValue; label: string }[] = [
    { value: "todos",                 label: `Todos (${pareceres.length + pending.length})` },
    { value: "APROVADO",              label: `Aprovados (${aprovados})` },
    { value: "APROVACAO_CONDICIONAL", label: `Condicionais (${condicionais})` },
    { value: "REPROVADO",             label: `Reprovados (${reprovados})` },
    { value: "QUESTIONAMENTO",        label: `Questionamentos (${questionamentos})` },
    { value: "pendentes",             label: `Sem Parecer (${pending.length})` },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fb" }}>

      {/* ── HERO BANNER full-width ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1f5c 0%, #203b88 45%, #2d4fad 100%)",
        position: "relative",
        overflow: "hidden",
        paddingBottom: 80,
      }}>
        {/* Padrão decorativo (círculos brancos sutis) */}
        <div aria-hidden style={{
          position: "absolute", top: -100, right: -100, width: 380, height: 380, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,217,107,0.18) 0%, transparent 70%)",
        }} />
        <div aria-hidden style={{
          position: "absolute", bottom: -80, left: "30%", width: 260, height: 260, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)",
        }} />

        <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 0", position: "relative", zIndex: 1 }}>
          {/* Breadcrumb */}
          <button
            onClick={() => router.push("/")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
              color: "rgba(255,255,255,0.7)", background: "transparent", border: "none", padding: "4px 0",
              cursor: "pointer", marginBottom: 24, transition: "color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#a8d96b")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          >
            <ArrowLeft size={13} /> Voltar ao Início
          </button>

          {/* Título + ações */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14,
                padding: "5px 12px", borderRadius: 99,
                background: "rgba(168,217,107,0.18)", border: "1px solid rgba(168,217,107,0.35)",
              }}>
                <ClipboardList size={12} style={{ color: "#a8d96b" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#a8d96b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Política de Crédito V2
                </span>
              </div>
              <h1 style={{
                fontSize: 40, fontWeight: 900, color: "#fff", margin: 0,
                letterSpacing: "-0.03em", lineHeight: 1.05,
              }}>
                Portfólio de Crédito
              </h1>
            </div>
            {pareceres.length > 0 && (
              <button
                onClick={exportCsv}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, fontWeight: 700, color: "#0f1f5c",
                  background: "#fff", border: "none",
                  borderRadius: 10, padding: "10px 18px", cursor: "pointer",
                  transition: "all 0.15s",
                  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.4)",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 12px 28px -10px rgba(0,0,0,0.5)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px -8px rgba(0,0,0,0.4)";
                }}
              >
                <Download size={13} /> Exportar CSV
              </button>
            )}
          </div>

          {/* KPIs inline no hero */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)",
            overflow: "hidden",
            backdropFilter: "blur(8px)",
          }}>
            {[
              { label: "Total Analisados", value: String(pareceres.length + pending.length), sub: `${pareceres.length} com parecer`, accent: "#a8d96b" },
              { label: "Aprovados", value: String(aprovados + condicionais), sub: `${aprovados} plenos · ${condicionais} cond.`, accent: "#86efac" },
              { label: "Reprovados", value: String(reprovados), sub: `${pending.length} sem parecer`, accent: "#fca5a5" },
              { label: "Limite em Carteira", value: fmtBRL(limiteTotal), sub: "aprovados + cond.", accent: "#c4b5fd" },
            ].map((kpi, i) => (
              <div key={i} style={{
                padding: "20px 22px",
                background: "rgba(15,31,92,0.45)",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: kpi.accent,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                }}>{kpi.label}</span>
                <span style={{
                  fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1,
                  letterSpacing: "-0.02em", fontFeatureSettings: '"tnum"',
                }}>{kpi.value}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{kpi.sub}</span>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* ── CONTENT (sobe sobre o hero) ── */}
      <main style={{ maxWidth: 1100, margin: "-50px auto 0", padding: "0 24px 80px", position: "relative", zIndex: 2 }}>

        {/* ── Distribuição V2 + Tendência ── */}
        {totalComV2 > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Rating V2 distribution */}
            <div style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
              padding: "22px 24px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 14px -8px rgba(15,23,42,0.06)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "#eef3fb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BarChart3 size={14} style={{ color: "#203b88" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>Distribuição Rating V2</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginLeft: "auto", background: "#f1f5f9", padding: "2px 8px", borderRadius: 99 }}>
                  {totalComV2} com score
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {v2Counts.map(({ rating, count }) => (
                  <RatingBar key={rating} rating={rating} count={count} total={totalComV2} />
                ))}
              </div>
            </div>

            {/* Decisões resumo */}
            <div style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
              padding: "22px 24px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 14px -8px rgba(15,23,42,0.06)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "#f0f9e0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TrendingUp size={14} style={{ color: "#5a9010" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>Funil de Decisões</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {(["APROVADO","APROVACAO_CONDICIONAL","REPROVADO","PENDENTE","QUESTIONAMENTO"] as DecisaoComite[]).map(d => {
                  const cfg = DECISAO_CONFIG[d];
                  const count = pareceres.filter(p => p.decisao_comite === d).length;
                  const pct = pareceres.length > 0 ? Math.round((count / pareceres.length) * 100) : 0;
                  return (
                    <div key={d} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: count > 0 ? cfg.bg : "#f8fafc",
                        border: `1px solid ${count > 0 ? cfg.border : "#e2e8f0"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <cfg.Icon size={12} style={{ color: count > 0 ? cfg.color : "#cbd5e1" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: count > 0 ? "#0f172a" : "#94a3b8", width: 110 }}>{cfg.label}</span>
                      <div style={{ flex: 1, height: 10, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: count > 0 ? `linear-gradient(90deg, ${cfg.color}, ${cfg.color}cc)` : "transparent",
                          borderRadius: 99, transition: "width 0.5s cubic-bezier(.4,0,.2,1)",
                        }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: count > 0 ? cfg.color : "#cbd5e1", minWidth: 28, textAlign: "right", fontFeatureSettings: '"tnum"' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
              {pending.length > 0 && (
                <div style={{
                  marginTop: 18, padding: "10px 12px",
                  background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <Clock size={13} style={{ color: "#d97706" }} />
                  <span style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                    {pending.length} coleta{pending.length !== 1 ? "s" : ""} finalizada{pending.length !== 1 ? "s" : ""} sem parecer formal
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Search + Filters ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{
            position: "relative", flex: "1 1 220px", maxWidth: 320, minWidth: 200,
          }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por empresa ou CNPJ"
              style={{
                width: "100%", padding: "8px 12px 8px 34px", borderRadius: 8,
                border: "1px solid #e2e8f0", fontSize: 13, color: "#0f172a",
                background: "white", outline: "none",
              }}
              aria-label="Buscar por empresa ou CNPJ"
            />
          </div>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 4,
            padding: 4,
            background: "#f1f5f9",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            flex: 1,
          }}>
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: filter === f.value ? "#fff" : "transparent",
                  color: filter === f.value ? "#0f172a" : "#64748b",
                  border: "none",
                  boxShadow: filter === f.value
                    ? "0 1px 2px rgba(15,23,42,0.06), 0 2px 6px rgba(15,23,42,0.04)"
                    : "none",
                  transition: "all 0.15s ease",
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {searchNorm && (
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 12px" }}>
            {filteredItems.length} resultado{filteredItems.length === 1 ? "" : "s"} para &ldquo;{search}&rdquo;
          </p>
        )}

        {/* ── List ── */}
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", background: "white", borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <ClipboardList size={36} style={{ color: "#cbd5e1", margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "#64748b", margin: "0 0 4px" }}>Nenhum registro encontrado</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {searchNorm
                ? `Nenhum parecer corresponde à busca "${search}".`
                : filter === "pendentes"
                  ? "Todas as coletas finalizadas já têm parecer formal."
                  : "Confirme pareceres nas análises para eles aparecerem aqui."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pagedItems.map((item, idx) => {
              if (item.type === "pending") {
                const c = item.data;
                const name = c.company_name || c.label || "Empresa sem nome";
                const date = new Date(c.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
                return (
                  <div key={`pending-${c.id}`} style={{
                    background: "#fff",
                    border: "1px solid #fde68a",
                    borderLeft: "4px solid #d97706",
                    borderRadius: 12,
                    padding: "16px 18px", display: "flex", alignItems: "center", gap: 14,
                    boxShadow: "0 1px 3px rgba(217,119,6,0.06)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10,
                      background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                    }}>
                      <Building2 size={18} style={{ color: "#b45309" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#fef3c7", color: "#d97706", flexShrink: 0 }}>
                          Sem parecer formal
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
                        {c.cnpj ? `CNPJ ${c.cnpj} · ` : ""}{date}
                      </p>
                    </div>
                    <button
                      onClick={() => router.push(`/parecer?id=${c.id}`)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                        borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                        background: "#203b88", color: "white", border: "none",
                      }}
                    >
                      <FileText size={13} /> Registrar
                    </button>
                  </div>
                );
              }

              // Formal parecer
              const p = item.data;
              const cfg = DECISAO_CONFIG[p.decisao_comite];
              const v2cfg = p.score_v2_rating ? V2_CONFIG[p.score_v2_rating] : null;
              const name = p.razao_social || "Empresa sem nome";
              const date = new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

              return (
                <div key={`parecer-${p.id}-${idx}`} style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderLeft: `4px solid ${cfg.color}`,
                  borderRadius: 12,
                  padding: "16px 18px", display: "flex", alignItems: "center", gap: 14,
                  boxShadow: `0 1px 3px ${cfg.color}10`,
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: `linear-gradient(135deg, ${cfg.bg}, #fff)`,
                    border: `1px solid ${cfg.color}22`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Building2 size={18} style={{ color: cfg.color }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                        <cfg.Icon size={10} /> {cfg.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{p.cnpj ? `CNPJ ${p.cnpj} · ` : ""}{date}</span>
                      {p.limite_aprovado && (
                        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Limite: {fmtBRL(p.limite_aprovado)}</span>
                      )}
                      {p.prazo_maximo && (
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{p.prazo_maximo} dias</span>
                      )}
                    </div>
                  </div>

                  {/* V2 badge */}
                  {v2cfg && p.score_v2_rating && (
                    <div style={{ textAlign: "center", flexShrink: 0 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 9, border: `2px solid ${v2cfg.color}`,
                        background: v2cfg.bg, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, fontWeight: 900, color: v2cfg.color,
                      }}>{p.score_v2_rating}</div>
                      <p style={{ fontSize: 9, color: "#94a3b8", margin: "2px 0 0", textAlign: "center" }}>V2</p>
                    </div>
                  )}

                  {/* IA rating */}
                  {p.rating_ia != null && (
                    <div style={{ textAlign: "center", flexShrink: 0 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%",
                        border: `2px solid ${p.rating_ia >= 8 ? "#16a34a" : p.rating_ia >= 5 ? "#d97706" : "#dc2626"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                        color: p.rating_ia >= 8 ? "#16a34a" : p.rating_ia >= 5 ? "#d97706" : "#dc2626",
                      }}>
                        {p.rating_ia.toFixed(1)}
                      </div>
                      <p style={{ fontSize: 9, color: "#94a3b8", margin: "2px 0 0", textAlign: "center" }}>IA</p>
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    onClick={() => router.push(`/parecer?id=${p.collection_id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "7px 13px",
                      borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                      background: "transparent", color: "#203b88", border: "1px solid #c7d2fe",
                    }}
                  >
                    <FileText size={13} /> Ver
                    <ChevronRight size={12} />
                  </button>
                </div>
              );
            })}

            {totalPages > 1 && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, marginTop: 12, padding: "10px 4px", flexWrap: "wrap",
              }}>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                  Página {safePage} de {totalPages} · {filteredItems.length} registro{filteredItems.length === 1 ? "" : "s"}
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
                      borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: "white", color: safePage === 1 ? "#cbd5e1" : "#203b88",
                      border: "1px solid #e2e8f0", cursor: safePage === 1 ? "not-allowed" : "pointer",
                    }}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={13} /> Anterior
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
                      borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: "white", color: safePage === totalPages ? "#cbd5e1" : "#203b88",
                      border: "1px solid #e2e8f0", cursor: safePage === totalPages ? "not-allowed" : "pointer",
                    }}
                    aria-label="Próxima página"
                  >
                    Próxima <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
