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
