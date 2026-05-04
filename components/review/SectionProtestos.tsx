"use client";
import { ProtestosData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: ProtestosData;
  expanded: boolean;
  onToggle: () => void;
}

function fmtVal(v: string | undefined) {
  return v && v !== "0" && v !== "0,00" ? v : "R$ 0,00";
}

export function SectionProtestos({ data, expanded, onToggle }: Props) {
  const vigQtd = parseInt(data.vigentesQtd || "0", 10);
  const regQtd = parseInt(data.regularizadosQtd || "0", 10);
  const fiscQtd = parseInt(data.fiscaisQtd || "0", 10);
  const total = vigQtd + regQtd;
  const hasProtestos = total > 0;
  const temDetalhe = data.detalhes && data.detalhes.length > 0;

  return (
    <SectionCard
      number="06"
      title="Protestos"
      accentColor={vigQtd > 0 ? "#dc2626" : "#16a34a"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: vigQtd > 0 ? "#fee2e2" : "#dcfce7",
          color: vigQtd > 0 ? "#991b1b" : "#15803d",
        }}>
          {vigQtd > 0 ? `${vigQtd} vigente${vigQtd !== 1 ? "s" : ""}` : "sem protestos"}
        </span>
      }
    >
      {/* Alerta de protestos vigentes */}
      {vigQtd > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#dc2626", fontSize: "14px", flexShrink: 0 }}>⚠</span>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#991b1b" }}>
            {vigQtd} protesto{vigQtd !== 1 ? "s" : ""} vigente{vigQtd !== 1 ? "s" : ""} — total{" "}
            {fmtVal(data.vigentesValor)}
            {fiscQtd > 0 && ` (${fiscQtd} fiscal${fiscQtd !== 1 ? "is" : ""})`}
          </p>
        </div>
      )}

      {!hasProtestos && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#16a34a", fontSize: "14px", flexShrink: 0 }}>✓</span>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#15803d" }}>Nenhum protesto encontrado</p>
        </div>
      )}

      {/* Resumo em cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", marginBottom: temDetalhe ? "20px" : "0" }}>
        <MetricCard label="Vigentes" qtd={vigQtd} valor={data.vigentesValor} danger={vigQtd > 0} />
        <MetricCard label="Regularizados" qtd={regQtd} valor={data.regularizadosValor} />
        {fiscQtd > 0 && (
          <MetricCard label="Fiscais (subconjunto)" qtd={fiscQtd} valor={data.fiscaisValor} danger />
        )}
      </div>

      {/* Tabela de detalhes */}
      {temDetalhe && (
        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Detalhamento ({data.detalhes.length} registro{data.detalhes.length !== 1 ? "s" : ""})
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Data", "Credor", "Valor", "Espécie", "Município/UF", "Status"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 2 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.detalhes.map((d, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6", background: d.regularizado ? "#f0fdf4" : "white" }}>
                    <td style={{ padding: "8px 10px", color: "#374151", whiteSpace: "nowrap" }}>{d.data || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#111827", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.credor}>{d.credor || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: d.regularizado ? "#15803d" : "#991b1b", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{d.valor || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280", whiteSpace: "nowrap" }}>{d.especie || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280", whiteSpace: "nowrap" }}>
                      {[d.municipio, d.uf].filter(Boolean).join("/") || "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{
                        fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px",
                        background: d.regularizado ? "#dcfce7" : "#fee2e2",
                        color: d.regularizado ? "#15803d" : "#991b1b",
                      }}>
                        {d.regularizado ? "Regularizado" : "Vigente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function MetricCard({ label, qtd, valor, danger }: { label: string; qtd: number; valor?: string; danger?: boolean }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: "8px",
      background: danger && qtd > 0 ? "#fef2f2" : "#F9FAFB",
      border: `1px solid ${danger && qtd > 0 ? "#fecaca" : "#E5E7EB"}`,
    }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: danger && qtd > 0 ? "#991b1b" : "#111827" }}>{qtd}</p>
      {valor && valor !== "0" && valor !== "0,00" && (
        <p style={{ margin: "2px 0 0", fontSize: "11px", color: danger && qtd > 0 ? "#dc2626" : "#6B7280", fontVariantNumeric: "tabular-nums" }}>{valor}</p>
      )}
    </div>
  );
}
