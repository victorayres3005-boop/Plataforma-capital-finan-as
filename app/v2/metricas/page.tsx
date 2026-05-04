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
