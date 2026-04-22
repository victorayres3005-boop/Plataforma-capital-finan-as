"use client";

import type { AlertaPolitica } from "@/types/politica-credito";

interface Props {
  alertas: AlertaPolitica[];
  onChange: (alertas: AlertaPolitica[]) => void;
}

const NIVEL_META = {
  critico:     { label: "Crítico", cor: "#dc2626", bg: "#fef2f2", border: "#fecaca", desc: "Reanálise imediata + possível bloqueio automático" },
  moderado:    { label: "Moderado", cor: "#d97706", bg: "#fffbeb", border: "#fcd34d", desc: "Reanálise obrigatória dentro do período acordado" },
  operacional: { label: "Operacional", cor: "#2563eb", bg: "#eff6ff", border: "#93c5fd", desc: "Monitoramento contínuo — sem bloqueio imediato" },
};

const ACAO_LABELS: Record<string, string> = {
  bloquear_operacao: "Bloquear operação",
  reduzir_limite:    "Reduzir limite",
  notificar_comite:  "Notificar comitê",
};

export function AlertasTab({ alertas, onChange }: Props) {
  const toggle = (id: string) =>
    onChange(alertas.map(a => a.id === id ? { ...a, ativo: !a.ativo } : a));

  const grupos = (["critico", "moderado", "operacional"] as const).map(nivel => ({
    nivel,
    meta: NIVEL_META[nivel],
    alertas: alertas.filter(a => a.nivel === nivel),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {grupos.map(grupo => (
        <div key={grupo.nivel}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 800, color: grupo.meta.cor,
              background: grupo.meta.bg, border: `1px solid ${grupo.meta.border}`,
              borderRadius: 6, padding: "3px 10px",
            }}>
              {grupo.meta.label}
            </span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{grupo.meta.desc}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {grupo.alertas.map(alerta => (
              <div
                key={alerta.id}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 16px",
                  background: alerta.ativo ? "white" : "#f8fafc",
                  border: `1px solid ${alerta.ativo ? grupo.meta.border : "#e8edf5"}`,
                  borderRadius: 10, opacity: alerta.ativo ? 1 : 0.6,
                  transition: "all 0.15s",
                }}
              >
                {/* Toggle */}
                <div
                  onClick={() => toggle(alerta.id)}
                  style={{ cursor: "pointer", flexShrink: 0 }}
                >
                  <div style={{
                    position: "relative", width: 38, height: 21, borderRadius: 11,
                    background: alerta.ativo ? grupo.meta.cor : "#d1d5db",
                    transition: "background 0.2s",
                  }}>
                    <div style={{
                      position: "absolute", top: 2.5, left: alerta.ativo ? 19 : 2.5,
                      width: 16, height: 16, borderRadius: "50%", background: "white",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
                    }} />
                  </div>
                </div>

                {/* Descrição */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", margin: 0 }}>
                    {alerta.descricao}
                  </p>
                  {alerta.acao_automatica && (
                    <p style={{ fontSize: 11, color: grupo.meta.cor, margin: "2px 0 0", fontWeight: 700 }}>
                      Ação automática: {ACAO_LABELS[alerta.acao_automatica] ?? alerta.acao_automatica}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <span style={{
                  fontSize: 10, fontWeight: 800, flexShrink: 0,
                  color: alerta.ativo ? grupo.meta.cor : "#9ca3af",
                  background: alerta.ativo ? grupo.meta.bg : "#f1f5f9",
                  border: `1px solid ${alerta.ativo ? grupo.meta.border : "#e2e8f0"}`,
                  borderRadius: 5, padding: "2px 7px",
                }}>
                  {alerta.ativo ? "ATIVO" : "INATIVO"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
