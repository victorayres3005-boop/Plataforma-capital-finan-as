"use client";
import type { GefipData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: GefipData | undefined;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionGefip({ data, expanded, onToggle }: Props) {
  const atrasos = data?.competenciasEmAtraso ?? 0;
  const competencias = data?.competencias ?? [];
  const danger = atrasos > 0;

  return (
    <SectionCard
      number="14"
      title="GEFIP / FGTS / INSS — Compliance Trabalhista"
      accentColor={danger ? "#dc2626" : "#16a34a"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: danger ? "#fee2e2" : data ? "#dcfce7" : "#F3F4F6",
          color: danger ? "#991b1b" : data ? "#15803d" : "#6B7280",
        }}>
          {data ? (danger ? `${atrasos} em atraso` : "regular") : "sem dados"}
        </span>
      }
    >
      {!data ? (
        <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>Sem GEFIP/FGTS/INSS anexado.</p>
      ) : (
        <>
          {danger ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", marginBottom: "16px" }}>
              <span style={{ color: "#dc2626", fontSize: "14px", flexShrink: 0 }}>⚠</span>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#991b1b" }}>
                {atrasos} competência{atrasos !== 1 ? "s" : ""} em atraso — risco de passivo trabalhista.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "16px" }}>
              <span style={{ color: "#16a34a", fontSize: "14px", flexShrink: 0 }}>✓</span>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#15803d" }}>Recolhimentos em dia.</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: competencias.length > 0 ? "16px" : "0" }}>
            <Metric label="Período" value={`${data.competenciaInicio || "—"} → ${data.competenciaFim || "—"}`} />
            <Metric label="Funcionários" value={String(data.totalFuncionarios)} />
            <Metric label="Total FGTS" value={data.valorFgtsTotal || "—"} />
            <Metric label="Total INSS" value={data.valorInssTotal || "—"} />
          </div>

          {competencias.length > 0 && (
            <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: "560px", fontSize: "12px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["Competência", "Funcs", "FGTS", "INSS", "Situação"].map((h, i) => (
                      <th key={i} style={{ padding: "8px 10px", textAlign: i >= 1 && i <= 3 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {competencias.map((c, i) => {
                    const atraso = !!c.situacao && !/recolhid|quitad|regular/i.test(c.situacao);
                    return (
                      <tr key={i} style={{ borderTop: "1px solid #F3F4F6", background: atraso ? "#fef2f2" : undefined }}>
                        <td style={{ padding: "8px 10px", color: "#111827", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "11px" }}>{c.mes || "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#374151" }}>{c.funcionarios}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: atraso ? "#991b1b" : "#374151", fontWeight: atraso ? 600 : 400 }}>{c.valorFgts || "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: atraso ? "#991b1b" : "#374151", fontWeight: atraso ? 600 : 400 }}>{c.valorInss || "—"}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{
                            fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px",
                            background: atraso ? "#fee2e2" : "#dcfce7",
                            color: atraso ? "#991b1b" : "#15803d",
                          }}>
                            {c.situacao || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#111827", fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}
