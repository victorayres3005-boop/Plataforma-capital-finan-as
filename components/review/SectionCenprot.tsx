"use client";
import type { CenprotData, ProtestosData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: CenprotData | undefined;
  /** Bureau (CreditHub/Assertiva) — usado para cross-validation. */
  bureauProtestos?: ProtestosData | undefined;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionCenprot({ data, bureauProtestos, expanded, onToggle }: Props) {
  const qtd = data?.qtdRegistros ?? 0;
  const negativa = !!data?.certidaoNegativa;
  const regs = data?.registros ?? [];
  const bureauVigQtd = parseInt(bureauProtestos?.vigentesQtd || "0", 10);
  const divergencia = !!data && bureauProtestos && bureauVigQtd > 0 && qtd !== bureauVigQtd;

  return (
    <SectionCard
      number="13"
      title="CENPROT — Certidão Oficial de Protestos"
      accentColor={qtd > 0 ? "#dc2626" : "#16a34a"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: qtd > 0 ? "#fee2e2" : "#dcfce7",
          color: qtd > 0 ? "#991b1b" : "#15803d",
        }}>
          {qtd > 0 ? `${qtd} protesto${qtd !== 1 ? "s" : ""}` : negativa ? "negativa" : "sem dados"}
        </span>
      }
    >
      {!data ? (
        <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>Sem certidão CENPROT anexada.</p>
      ) : (
        <>
          {divergencia && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", marginBottom: "12px" }}>
              <span style={{ color: "#d97706", fontSize: "14px", flexShrink: 0 }}>⚠</span>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#92400e" }}>
                <b>Divergência:</b> bureau diz {bureauVigQtd} protesto(s) vigente(s); certidão CENPROT (oficial) diz {qtd}. Conferir manualmente.
              </p>
            </div>
          )}
          {negativa ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px" }}>
              <span style={{ color: "#16a34a", fontSize: "14px", flexShrink: 0 }}>✓</span>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#15803d" }}>Certidão CENPROT NEGATIVA — sem protestos registrados</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", marginBottom: "16px" }}>
                <span style={{ color: "#dc2626", fontSize: "14px", flexShrink: 0 }}>⚠</span>
                <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#991b1b" }}>
                  {qtd} protesto{qtd !== 1 ? "s" : ""} certificado{qtd !== 1 ? "s" : ""} pelo IEPTB — total <b>{data.valorTotal || "—"}</b>
                  {data.dataConsulta ? ` (emitida ${data.dataConsulta})` : ""}
                </p>
              </div>
              {regs.length > 0 && (
                <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "640px", fontSize: "12px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F9FAFB" }}>
                        {["Cartório", "Cidade/UF", "Data", "Valor", "Cedente", "Devedor"].map((h, i) => (
                          <th key={i} style={{ padding: "8px 10px", textAlign: i === 3 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {regs.map((r, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                          <td style={{ padding: "8px 10px", color: "#111827", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cartorio}>{r.cartorio || "—"}</td>
                          <td style={{ padding: "8px 10px", color: "#374151", whiteSpace: "nowrap" }}>{[r.cidade, r.uf].filter(Boolean).join("/") || "—"}</td>
                          <td style={{ padding: "8px 10px", color: "#6B7280", whiteSpace: "nowrap" }}>{r.data || "—"}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", color: "#991b1b", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.valor || "—"}</td>
                          <td style={{ padding: "8px 10px", color: "#6B7280", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cedente}>{r.cedente || "—"}</td>
                          <td style={{ padding: "8px 10px", color: "#374151", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.devedor}>{r.devedor || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}
