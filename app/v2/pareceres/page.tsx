"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ClipboardList, FileText, Building2, CheckCircle2, Clock, XCircle,
  AlertTriangle, ChevronRight, BarChart2, TrendingUp, DollarSign, Download, Plus, HelpCircle,
} from "lucide-react";
import { T, card } from "../theme";

type DecisaoComite = "APROVADO" | "APROVACAO_CONDICIONAL" | "REPROVADO" | "PENDENTE" | "QUESTIONAMENTO";
type RatingV2 = "A" | "B" | "C" | "D" | "E" | "F";
type FilterValue = "todos" | "APROVADO" | "APROVACAO_CONDICIONAL" | "REPROVADO" | "PENDENTE" | "QUESTIONAMENTO" | "pendentes";

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

const DECISAO_MAP: Record<DecisaoComite, { label: string; color: string; glow: string; Icon: React.ElementType }> = {
  APROVADO:              { label: "Aprovado",        color: T.green,  glow: T.greenGlow,  Icon: CheckCircle2 },
  APROVACAO_CONDICIONAL: { label: "Condicional",     color: T.purple, glow: "0 0 12px rgba(167,139,250,0.25)", Icon: AlertTriangle },
  PENDENTE:              { label: "Em Análise",      color: T.amber,  glow: T.amberGlow,  Icon: Clock },
  REPROVADO:             { label: "Reprovado",       color: T.red,    glow: T.redGlow,    Icon: XCircle },
  QUESTIONAMENTO:        { label: "Questionamento",  color: "#0891b2", glow: "0 0 12px rgba(8,145,178,0.25)", Icon: HelpCircle },
};

const V2_MAP: Record<RatingV2, { color: string }> = {
  A: { color: T.green  },
  B: { color: "#65A30D"},
  C: { color: T.amber  },
  D: { color: "#EA580C"},
  E: { color: T.red    },
  F: { color: "#991B1B"},
};

function fmtBRL(v: number | null) {
  if (!v) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCNPJ(s: string | null) {
  if (!s) return "—";
  const n = s.replace(/\D/g, "");
  return n.length === 14 ? n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : s;
}

export default function ParecersV2() {
  const router = useRouter();
  const [pareceres, setPareceres] = useState<Parecer[]>([]);
  const [pending, setPending]     = useState<PendingCollection[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<FilterValue>("todos");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const [parecerRes, colRes] = await Promise.all([
        supabase.from("pareceres").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("document_collections")
          .select("id, company_name, cnpj, label, rating, created_at, status, decisao")
          .eq("user_id", user.id).eq("status", "finished")
          .order("created_at", { ascending: false }),
      ]);
      const formal = (parecerRes.data ?? []) as Parecer[];
      setPareceres(formal);
      const registered = new Set(formal.map(p => p.collection_id));
      setPending(((colRes.data ?? []) as PendingCollection[]).filter(c => !registered.has(c.id)));
      setLoading(false);
    }
    load();
  }, [router]);

  const aprovados        = pareceres.filter(p => p.decisao_comite === "APROVADO").length;
  const condicionais     = pareceres.filter(p => p.decisao_comite === "APROVACAO_CONDICIONAL").length;
  const reprovados       = pareceres.filter(p => p.decisao_comite === "REPROVADO").length;
  const questionamentos  = pareceres.filter(p => p.decisao_comite === "QUESTIONAMENTO").length;
  const limiteTotal  = pareceres
    .filter(p => p.decisao_comite === "APROVADO" || p.decisao_comite === "APROVACAO_CONDICIONAL")
    .reduce((s, p) => s + (p.limite_aprovado ?? 0), 0);
  const totalComV2   = pareceres.filter(p => p.score_v2_rating).length;
  const maxBar       = Math.max(aprovados + condicionais, reprovados, pending.length, 1);

  const FILTERS: { value: FilterValue; label: string }[] = [
    { value: "todos",                 label: `Todos (${pareceres.length + pending.length})` },
    { value: "APROVADO",              label: `Aprovados (${aprovados})` },
    { value: "APROVACAO_CONDICIONAL", label: `Condicionais (${condicionais})` },
    { value: "REPROVADO",             label: `Reprovados (${reprovados})` },
    { value: "QUESTIONAMENTO",        label: `Questionamentos (${questionamentos})` },
    { value: "pendentes",             label: `Sem Parecer (${pending.length})` },
  ];

  type ListItem = { type: "parecer"; data: Parecer } | { type: "pending"; data: PendingCollection };
  const listItems: ListItem[] = [];
  if (filter === "pendentes") pending.forEach(c => listItems.push({ type: "pending", data: c }));
  else if (filter === "todos") {
    pareceres.forEach(p => listItems.push({ type: "parecer", data: p }));
    pending.forEach(c => listItems.push({ type: "pending", data: c }));
  } else {
    pareceres.filter(p => p.decisao_comite === filter).forEach(p => listItems.push({ type: "parecer", data: p }));
  }

  function exportCsv() {
    const cols = ["Empresa","CNPJ","Decisão","Rating V2","Score pts","Rating IA","Limite","Prazo","Data"];
    const esc = (v: unknown) => { const s = v == null ? "" : String(v); return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
    const rows = pareceres.map(p => [p.razao_social ?? "", p.cnpj ?? "", DECISAO_MAP[p.decisao_comite]?.label ?? "", p.score_v2_rating ?? "", p.score_v2_pontos ?? "", p.rating_ia ?? "", p.limite_aprovado ?? "", p.prazo_maximo ?? "", fmtDate(p.created_at)].map(esc).join(","));
    const csv  = [cols.join(","), ...rows].join("\n");
    const url  = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a    = document.createElement("a");
    a.href = url; a.download = `pareceres_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", color: T.textSecondary, fontSize: 13 }}>
        Carregando pareceres...
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: T.accentDim, border: `1px solid ${T.borderStrong}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: T.accentGlowSm,
          }}>
            <ClipboardList size={18} color={T.accent} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, margin: 0 }}>Portfólio de Crédito</h1>
            <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>Pareceres formais do comitê · Política V2</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {pareceres.length > 0 && (
            <button onClick={exportCsv} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: T.radiusSm,
              border: `1px solid ${T.border}`, background: T.bgCard,
              color: T.textSecondary, fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
              <Download size={13} /> Exportar CSV
            </button>
          )}
          <button onClick={() => router.push("/?nova=true")} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: T.radiusSm, border: "none",
            background: T.accent, color: "#07101F",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: T.accentGlow,
          }}>
            <Plus size={13} /> Nova Análise
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total Analisados",   value: String(pareceres.length + pending.length), sub: `${pareceres.length} com parecer formal`, icon: <BarChart2 size={15}/>,   accent: T.blue   },
          { label: "Aprovados",          value: String(aprovados + condicionais),           sub: `${aprovados} plenos · ${condicionais} condicionais`, icon: <CheckCircle2 size={15}/>, accent: T.green  },
          { label: "Reprovados",         value: String(reprovados),                         sub: `${pending.length} sem parecer ainda`, icon: <XCircle size={15}/>,      accent: T.red    },
          { label: "Limite em Carteira", value: fmtBRL(limiteTotal),                        sub: "aprovados + condicionais", icon: <DollarSign size={15}/>,  accent: T.purple },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textSecondary }}>{kpi.label}</span>
              <span style={{ color: kpi.accent }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.textPrimary, lineHeight: 1 }}>{kpi.value}</div>
            <p style={{ fontSize: 11, color: T.textSecondary, marginTop: 6 }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {(totalComV2 > 0 || pareceres.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          {/* Funil */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 18 }}>
              <TrendingUp size={13} style={{ color: T.accent }} />
              <h3 style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, margin: 0 }}>Funil de Decisões</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Aprovados",   value: aprovados + condicionais, color: T.green, glow: T.greenGlow },
                { label: "Reprovados",  value: reprovados,               color: T.red,   glow: T.redGlow   },
                { label: "Sem parecer", value: pending.length,           color: T.amber, glow: T.amberGlow },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 90, fontSize: 11, color: T.textSecondary, flexShrink: 0, textAlign: "right" }}>{row.label}</div>
                  <div style={{ flex: 1, height: 7, borderRadius: 4, background: T.bgElevated, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((row.value / maxBar) * 100)}%`, height: "100%", background: row.color, borderRadius: 4, boxShadow: row.glow, transition: "width 0.6s" }} />
                  </div>
                  <div style={{ width: 26, fontSize: 13, fontWeight: 700, color: row.color, textAlign: "right" }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rating V2 */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 18 }}>
              <BarChart2 size={13} style={{ color: T.accent }} />
              <h3 style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, margin: 0 }}>Distribuição Rating V2</h3>
              {totalComV2 > 0 && <span style={{ fontSize: 10, color: T.textMuted, marginLeft: "auto" }}>{totalComV2} com score</span>}
            </div>
            {totalComV2 === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 80, fontSize: 12, color: T.textMuted }}>
                Nenhum parecer com Rating V2
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(["A","B","C","D","E","F"] as RatingV2[]).map(r => {
                  const cfg   = V2_MAP[r];
                  const count = pareceres.filter(p => p.score_v2_rating === r).length;
                  const pct   = totalComV2 > 0 ? Math.round((count / totalComV2) * 100) : 0;
                  return (
                    <div key={r} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                        background: `${cfg.color}15`, border: `1px solid ${cfg.color}40`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: cfg.color,
                      }}>{r}</div>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.bgElevated, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: 3, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, width: 22, textAlign: "right" }}>{count}</span>
                      <span style={{ fontSize: 10, color: T.textMuted, width: 30 }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", background: T.bgElevated, borderRadius: T.radiusSm, padding: 3, gap: 2, marginBottom: 16, width: "fit-content", border: `1px solid ${T.border}` }}>
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)} style={{
            padding: "5px 14px", borderRadius: T.radiusXs, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
            background: filter === f.value ? T.accentDim : "transparent",
            color: filter === f.value ? T.accent : T.textSecondary,
            boxShadow: filter === f.value ? T.accentGlowSm : "none",
            transition: "all 0.15s",
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {listItems.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 24px" }}>
          <ClipboardList size={36} style={{ color: T.textMuted, margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: T.textSecondary, margin: "0 0 4px" }}>Nenhum registro encontrado</p>
          <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
            {filter === "pendentes" ? "Todas as coletas finalizadas já têm parecer formal." : "Confirme pareceres nas análises para eles aparecerem aqui."}
          </p>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {["Empresa", "CNPJ", "Data", "Decisão", "Limite", "Rating IA", "V2", ""].map((h, i) => (
                  <th key={h || i} style={{
                    padding: "10px 16px", fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    color: T.textMuted, textAlign: i > 2 ? "center" : "left",
                    borderBottom: `1px solid ${T.borderSubtle}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listItems.map((item, idx) => {
                if (item.type === "pending") {
                  const c = item.data;
                  const name = c.company_name || c.label || "Empresa sem nome";
                  return (
                    <tr key={`pending-${c.id}`}
                      style={{ borderBottom: `1px solid ${T.borderSubtle}`, background: `${T.amber}08` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${T.amber}12`}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${T.amber}08`}
                    >
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: T.amberDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Building2 size={13} style={{ color: T.amber }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, color: T.textSecondary, fontFamily: "monospace" }}>{fmtCNPJ(c.cnpj)}</span></td>
                      <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(c.created_at)}</span></td>
                      <td style={{ padding: "13px 16px", textAlign: "center" }}>
                        <span style={{ padding: "3px 10px", borderRadius: T.radiusFull, fontSize: 11, fontWeight: 600, color: T.amber, background: T.amberDim, border: `1px solid ${T.amber}30` }}>
                          Sem parecer
                        </span>
                      </td>
                      <td colSpan={3} style={{ padding: "13px 16px", textAlign: "center", color: T.textMuted, fontSize: 12 }}>—</td>
                      <td style={{ padding: "13px 16px", textAlign: "right" }}>
                        <button onClick={() => router.push(`/parecer?id=${c.id}`)} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "5px 10px", borderRadius: T.radiusXs,
                          background: T.accent, color: "#07101F",
                          fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
                          boxShadow: T.accentGlowSm,
                        }}>
                          <FileText size={11} /> Registrar
                        </button>
                      </td>
                    </tr>
                  );
                }

                const p   = item.data;
                const cfg = DECISAO_MAP[p.decisao_comite];
                const v2c = p.score_v2_rating ? V2_MAP[p.score_v2_rating] : null;
                const rClr = p.rating_ia != null
                  ? (p.rating_ia >= 8 ? T.green : p.rating_ia >= 5 ? T.amber : T.red)
                  : null;
                const rGlow = p.rating_ia != null
                  ? (p.rating_ia >= 8 ? T.greenGlow : p.rating_ia >= 5 ? T.amberGlow : T.redGlow)
                  : null;
                const name = p.razao_social || "Empresa sem nome";

                return (
                  <tr key={`parecer-${p.id}-${idx}`}
                    style={{ borderBottom: `1px solid ${T.borderSubtle}` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.bgCardHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Building2 size={13} style={{ color: T.accent }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, color: T.textSecondary, fontFamily: "monospace" }}>{fmtCNPJ(p.cnpj)}</span></td>
                    <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(p.created_at)}</span></td>
                    <td style={{ padding: "13px 16px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "3px 10px", borderRadius: T.radiusFull,
                        fontSize: 11, fontWeight: 600,
                        color: cfg.color, background: `${cfg.color}15`,
                        border: `1px solid ${cfg.color}30`,
                      }}>
                        <cfg.Icon size={10} /> {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: T.textPrimary }}>
                      {fmtBRL(p.limite_aprovado)}
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "center" }}>
                      {p.rating_ia != null && rClr && rGlow ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 32, height: 32, borderRadius: "50%",
                          fontSize: 12, fontWeight: 700, color: rClr,
                          background: `${rClr}15`, border: `1.5px solid ${rClr}40`,
                          boxShadow: rGlow,
                        }}>
                          {p.rating_ia.toFixed(1)}
                        </span>
                      ) : <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "center" }}>
                      {v2c && p.score_v2_rating ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 32, height: 32, borderRadius: 7,
                          fontSize: 13, fontWeight: 900,
                          color: v2c.color, background: `${v2c.color}15`,
                          border: `1.5px solid ${v2c.color}40`,
                        }}>
                          {p.score_v2_rating}
                        </span>
                      ) : <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "right" }}>
                      <button onClick={() => router.push(`/parecer?id=${p.collection_id}`)} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "5px 10px", borderRadius: T.radiusXs,
                        background: T.accentDim, color: T.accent,
                        fontSize: 11, fontWeight: 600,
                        border: `1px solid ${T.borderStrong}`, cursor: "pointer",
                      }}>
                        <ChevronRight size={12} /> Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
