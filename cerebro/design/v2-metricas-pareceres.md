> Hub: [[CAPITAL]]

# Aba: V2 (em desenvolvimento)

Telas em desenvolvimento da próxima versão (`/v2`) — métricas e pareceres remodelados.

Gerado em 2026-05-05T12:26:17.798Z

---

## Sumário
- `app/v2/page.tsx`
- `app/v2/metricas/page.tsx`
- `app/v2/pareceres/page.tsx`

---

## app/v2/page.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, ArrowUpRight, TrendingUp, Clock, CheckCircle2, XCircle, Loader2, Eye } from "lucide-react";
import Link from "next/link";
import { T, card } from "./theme";

interface Collection {
  id: string;
  company_name: string | null;
  cnpj: string | null;
  status: string;
  decisao: string | null;
  rating: number | null;
  created_at: string;
  fmm_12m: number | null;
}

interface KPIs {
  total: number;
  aprovados: number;
  reprovados: number;
  emAndamento: number;
  taxaAprov: number;
}

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  finished:    { label: "Finalizado",  color: T.textSecondary, dot: T.textMuted },
  in_progress: { label: "Em análise",  color: T.blue,          dot: T.blue },
  pending:     { label: "Pendente",    color: T.amber,         dot: T.amber },
  idle:        { label: "Aguardando",  color: T.textMuted,     dot: T.textMuted },
};

const DECISAO_MAP: Record<string, { label: string; color: string; bg: string }> = {
  APROVADO:              { label: "Aprovado",    color: T.green,  bg: T.greenDim  },
  APROVACAO_CONDICIONAL: { label: "Condicional", color: T.purple, bg: T.purpleDim },
  REPROVADO:             { label: "Reprovado",   color: T.red,    bg: T.redDim    },
  PENDENTE:              { label: "Pendente",    color: T.amber,  bg: T.amberDim  },
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCNPJ(s: string | null) {
  if (!s) return "—";
  const n = s.replace(/\D/g, "");
  return n.length === 14 ? n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : s;
}
function ratingGlow(r: number) {
  if (r >= 8) return { color: T.green,  glow: T.greenGlow  };
  if (r >= 6) return { color: T.amber,  glow: T.amberGlow  };
  return            { color: T.red,    glow: T.redGlow    };
}

export default function DashboardV2() {
  const [cols, setCols]   = useState<Collection[]>([]);
  const [kpis, setKpis]   = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [colsRes, metricsRes] = await Promise.allSettled([
        supabase
          .from("document_collections")
          .select("id, company_name, cnpj, status, decisao, rating, created_at, fmm_12m")
          .order("created_at", { ascending: false })
          .limit(12),
        fetch("/api/metricas?dias=30").then(r => r.json()),
      ]);

      if (colsRes.status === "fulfilled" && colsRes.value.data) setCols(colsRes.value.data);
      if (metricsRes.status === "fulfilled") {
        const m = metricsRes.value;
        const ap = (m.porDecisao?.aprovado ?? 0) + (m.porDecisao?.condicional ?? 0);
        const re = m.porDecisao?.reprovado ?? 0;
        const total = ap + re + (m.porDecisao?.pendente ?? 0);
        setKpis({
          total: m.total ?? 0,
          aprovados: ap,
          reprovados: re,
          emAndamento: m.porDecisao?.em_andamento ?? 0,
          taxaAprov: total > 0 ? Math.round((ap / total) * 100) : 0,
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayFmt = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.textPrimary, margin: 0 }}>Visão Geral</h1>
          <p style={{ fontSize: 13, color: T.textSecondary, marginTop: 4 }}>{todayFmt}</p>
        </div>
        <Link href="/?nova=true" style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "9px 18px", borderRadius: T.radiusSm,
          background: T.accent, color: "#07101F",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
          boxShadow: T.accentGlow,
          transition: "box-shadow 0.2s",
        }}>
          <Plus size={15} />
          Nova Análise
        </Link>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total no Período",  value: loading ? "—" : String(kpis?.total ?? 0),        sub: "Últimos 30 dias",            icon: <TrendingUp size={16}/>, accent: T.blue  },
          { label: "Aprovados",         value: loading ? "—" : String(kpis?.aprovados ?? 0),    sub: `Taxa: ${kpis?.taxaAprov ?? 0}%`, icon: <CheckCircle2 size={16}/>, accent: T.green },
          { label: "Reprovados",        value: loading ? "—" : String(kpis?.reprovados ?? 0),   sub: "Últimos 30 dias",            icon: <XCircle size={16}/>,      accent: T.red   },
          { label: "Em Andamento",      value: loading ? "—" : String(kpis?.emAndamento ?? 0),  sub: "Análises ativas",            icon: <Clock size={16}/>,        accent: T.amber },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textSecondary }}>
                {kpi.label}
              </span>
              <span style={{
                width: 30, height: 30, borderRadius: T.radiusSm,
                background: `${kpi.accent}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: kpi.accent,
              }}>
                {kpi.icon}
              </span>
            </div>
            <div style={{
              fontSize: 32, fontWeight: 800, lineHeight: 1,
              color: kpi.value === "—" ? T.textMuted : T.textPrimary,
            }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 8 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: T.bgCard, borderRadius: T.radius,
        border: `1px solid ${T.border}`,
        overflow: "hidden", boxShadow: T.shadowCard,
      }}>
        <div style={{
          padding: "16px 24px",
          borderBottom: `1px solid ${T.borderSubtle}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, margin: 0 }}>Análises Recentes</h2>
          <Link href="/historico" style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, color: T.textSecondary, textDecoration: "none", fontWeight: 500,
          }}>
            Ver todas <ArrowUpRight size={13} />
          </Link>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: T.textSecondary }}>
            <Loader2 size={18} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Carregando...</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {["Empresa", "CNPJ", "Data", "Status", "Decisão", "Rating IA", ""].map(h => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left",
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: T.textMuted,
                    borderBottom: `1px solid ${T.borderSubtle}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
                    Nenhuma análise encontrada.
                  </td>
                </tr>
              ) : cols.map((c, i) => {
                const st  = STATUS_MAP[c.status] ?? STATUS_MAP.idle;
                const dec = c.decisao ? DECISAO_MAP[c.decisao] : null;
                const rc  = c.rating ? ratingGlow(c.rating) : null;
                return (
                  <tr
                    key={c.id}
                    style={{ borderBottom: `1px solid ${T.borderSubtle}` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.bgCardHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>
                        {c.company_name ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: "monospace" }}>
                        {fmtCNPJ(c.cnpj)}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{ fontSize: 12, color: T.textMuted }}>{fmtDate(c.created_at)}</span>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "3px 10px", borderRadius: T.radiusFull,
                        fontSize: 11, fontWeight: 500,
                        color: st.color, background: `${st.dot}14`,
                        border: `1px solid ${st.dot}30`,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      {dec ? (
                        <span style={{
                          padding: "3px 10px", borderRadius: T.radiusXs,
                          fontSize: 11, fontWeight: 600,
                          color: dec.color, background: dec.bg,
                          border: `1px solid ${dec.color}30`,
                        }}>
                          {dec.label}
                        </span>
                      ) : <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      {c.rating && rc ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 34, height: 34, borderRadius: "50%",
                          fontSize: 12, fontWeight: 700,
                          color: rc.color,
                          background: `${rc.color}18`,
                          border: `1.5px solid ${rc.color}40`,
                          boxShadow: rc.glow,
                        }}>
                          {c.rating.toFixed(1)}
                        </span>
                      ) : <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "right" }}>
                      <Link href={`/?resume=${c.id}`} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "5px 10px", borderRadius: T.radiusXs,
                        background: T.accentDim, color: T.accent,
                        fontSize: 11, fontWeight: 600, textDecoration: "none",
                        border: `1px solid ${T.borderStrong}`,
                      }}>
                        <Eye size={12} /> Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

```

## app/v2/metricas/page.tsx

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart2, CheckCircle2, XCircle, Clock, AlertTriangle, TrendingUp, Users, RefreshCw, Star } from "lucide-react";
import { T, card, labelStyle } from "../theme";

type Periodo = "7" | "30" | "90";

interface Metricas {
  porDecisao: { aprovado: number; condicional: number; pendente: number; reprovado: number; em_andamento: number };
  ranking: { name: string; total: number; aprovado: number; reprovado: number; pendente: number }[];
  ratingMedio: number;
  total: number;
}

export default function MetricasV2() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [data, setData]       = useState<Metricas | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: Periodo) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/metricas?dias=${p}`);
      setData(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(periodo); }, [periodo, load]);

  const fin      = data ? data.porDecisao.aprovado + data.porDecisao.condicional + data.porDecisao.reprovado + data.porDecisao.pendente : 0;
  const aprov    = data ? data.porDecisao.aprovado + data.porDecisao.condicional : 0;
  const reprov   = data?.porDecisao.reprovado ?? 0;
  const pend     = data?.porDecisao.pendente ?? 0;
  const andamento = data?.porDecisao.em_andamento ?? 0;
  const taxa     = fin > 0 ? Math.round((aprov / fin) * 100) : 0;
  const maxBar   = Math.max(aprov, reprov, pend, andamento, 1);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: T.accentDim,
            border: `1px solid ${T.borderStrong}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: T.accentGlowSm,
          }}>
            <BarChart2 size={18} color={T.accent} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, margin: 0 }}>Métricas</h1>
            <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>Visão consolidada da equipe</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Period selector */}
          <div style={{ display: "flex", background: T.bgElevated, borderRadius: T.radiusSm, padding: 3, gap: 2, border: `1px solid ${T.border}` }}>
            {(["7", "30", "90"] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)} style={{
                padding: "5px 14px", borderRadius: T.radiusXs, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 500,
                background: periodo === p ? T.accentDim : "transparent",
                color: periodo === p ? T.accent : T.textSecondary,
                boxShadow: periodo === p ? T.accentGlowSm : "none",
                transition: "all 0.15s",
              }}>
                {p === "7" ? "7 dias" : p === "30" ? "30 dias" : "90 dias"}
              </button>
            ))}
          </div>
          <button onClick={() => load(periodo)} style={{
            width: 34, height: 34, borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`,
            background: T.bgCard, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.textSecondary,
          }}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: T.textSecondary, fontSize: 13 }}>
          Carregando métricas...
        </div>
      ) : data ? (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
            {[
              { icon: <CheckCircle2 size={15}/>, label: "Aprovados",    value: aprov,    accent: T.green,  glow: T.greenGlow,  sub: data.porDecisao.condicional > 0 ? `${data.porDecisao.condicional} condicionais` : undefined },
              { icon: <XCircle size={15}/>,      label: "Reprovados",   value: reprov,   accent: T.red,    glow: T.redGlow     },
              { icon: <Clock size={15}/>,        label: "Pendentes",    value: pend,     accent: T.amber,  glow: T.amberGlow   },
              { icon: <AlertTriangle size={15}/>,label: "Em Andamento", value: andamento,accent: T.blue,   glow: `0 0 12px rgba(59,130,246,0.25)` },
            ].map(kpi => (
              <div key={kpi.label} style={{ ...card }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textSecondary }}>{kpi.label}</span>
                  <span style={{ color: kpi.accent }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: kpi.accent, lineHeight: 1, textShadow: kpi.glow }}>
                  {kpi.value}
                </div>
                {kpi.sub && <p style={{ fontSize: 11, color: T.textSecondary, marginTop: 6 }}>{kpi.sub}</p>}
              </div>
            ))}
          </div>

          {/* Row 2: KPIs grandes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>

            {/* Taxa aprovação */}
            <div style={{ ...card }}>
              <div style={labelStyle}>
                <TrendingUp size={13} style={{ color: T.accent }} />
                Taxa de Aprovação
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, color: T.accent, lineHeight: 1.1, textShadow: T.accentGlow }}>
                {taxa}%
              </div>
              <div style={{ marginTop: 12, height: 4, borderRadius: 2, background: T.bgElevated, overflow: "hidden" }}>
                <div style={{ width: `${taxa}%`, height: "100%", background: T.accent, borderRadius: 2, transition: "width 0.6s", boxShadow: T.accentGlowSm }} />
              </div>
              <p style={{ fontSize: 11, color: T.textSecondary, marginTop: 8 }}>{fin} análises finalizadas</p>
            </div>

            {/* Rating médio */}
            <div style={{ ...card }}>
              <div style={labelStyle}>
                <Star size={13} style={{ color: T.amber }} />
                Rating Médio IA
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.1, color: data.ratingMedio > 0 ? T.textPrimary : T.textMuted, textShadow: data.ratingMedio >= 8 ? T.greenGlow : data.ratingMedio >= 6 ? T.amberGlow : "none" }}>
                {data.ratingMedio > 0 ? data.ratingMedio.toFixed(1) : "—"}
              </div>
              {data.ratingMedio > 0 && (
                <div style={{ marginTop: 12, height: 4, borderRadius: 2, background: T.bgElevated, overflow: "hidden" }}>
                  <div style={{
                    width: `${(data.ratingMedio / 10) * 100}%`, height: "100%", borderRadius: 2,
                    background: data.ratingMedio >= 8 ? T.green : data.ratingMedio >= 6 ? T.amber : T.red,
                  }} />
                </div>
              )}
              <p style={{ fontSize: 11, color: T.textSecondary, marginTop: 8 }}>Escala de 0 a 10</p>
            </div>

            {/* Total */}
            <div style={{ ...card }}>
              <div style={labelStyle}>
                <Users size={13} style={{ color: T.blue }} />
                Total no Período
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, color: T.textPrimary, lineHeight: 1.1 }}>
                {data.total}
              </div>
              <p style={{ fontSize: 11, color: T.textSecondary, marginTop: 16 }}>últimos {periodo} dias</p>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, marginBottom: 20 }}>Distribuição de Decisões</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Aprovados (incl. condicionais)", value: aprov,     color: T.green, glow: T.greenGlow },
                { label: "Reprovados",                     value: reprov,    color: T.red,   glow: T.redGlow   },
                { label: "Pendentes",                      value: pend,      color: T.amber, glow: T.amberGlow },
                { label: "Em Andamento",                   value: andamento, color: T.blue,  glow: "0 0 8px rgba(59,130,246,0.30)" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 160, fontSize: 12, color: T.textSecondary, flexShrink: 0, textAlign: "right" }}>{row.label}</div>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: T.bgElevated, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.round((row.value / maxBar) * 100)}%`, height: "100%",
                      background: row.color, borderRadius: 4,
                      boxShadow: row.glow,
                      transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                    }} />
                  </div>
                  <div style={{ width: 32, fontSize: 14, fontWeight: 800, color: row.color, textAlign: "right", textShadow: row.glow }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ranking */}
          {data.ranking.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.borderSubtle}`, display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={14} style={{ color: T.textSecondary }} />
                <h3 style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, margin: 0 }}>Ranking de Analistas</h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["#", "Analista", "Total", "Aprov.", "Reprov.", "Pend.", "Taxa"].map((h, i) => (
                      <th key={h} style={{
                        padding: "10px 16px", fontSize: 10, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.08em",
                        color: T.textMuted, textAlign: i > 1 ? "center" : "left",
                        borderBottom: `1px solid ${T.borderSubtle}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((a, i) => {
                    const taxa2 = a.total > 0 ? Math.round((a.aprovado / a.total) * 100) : 0;
                    const taxaColor = taxa2 >= 70 ? T.green : taxa2 >= 40 ? T.amber : T.red;
                    const taxaGlow  = taxa2 >= 70 ? T.greenGlow : taxa2 >= 40 ? T.amberGlow : T.redGlow;
                    return (
                      <tr key={i}
                        style={{ borderBottom: `1px solid ${T.borderSubtle}` }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.bgCardHover}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                      >
                        <td style={{ padding: "13px 16px", fontSize: 12, color: T.textMuted, fontWeight: 700, width: 40 }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: "13px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: "50%",
                              background: T.accentDim, color: T.accent,
                              border: `1px solid ${T.borderStrong}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 700, flexShrink: 0,
                            }}>
                              {(a.name || "?").slice(0, 2).toUpperCase()}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{a.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 14, fontWeight: 700, color: T.textPrimary }}>{a.total}</td>
                        <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 600, color: T.green }}>{a.aprovado}</td>
                        <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 600, color: T.red }}>{a.reprovado}</td>
                        <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 600, color: T.amber }}>{a.pendente}</td>
                        <td style={{ padding: "13px 16px", textAlign: "center" }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: T.radiusFull,
                            fontSize: 11, fontWeight: 700,
                            color: taxaColor, background: `${taxaColor}15`,
                            border: `1px solid ${taxaColor}30`,
                            textShadow: taxaGlow,
                          }}>{taxa2}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

```

## app/v2/pareceres/page.tsx

```tsx
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

```
