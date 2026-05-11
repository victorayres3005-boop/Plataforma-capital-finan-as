"use client";
import type { DividaAtivaData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: DividaAtivaData | undefined;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionDividaAtiva({ data, expanded, onToggle }: Props) {
  const qtd = data?.qtdRegistros ?? 0;
  const negativa = !!data?.certidaoNegativa;
  const regs = data?.registros ?? [];

  return (
    <SectionCard
      number="12"
      title="Dívida Ativa (PGFN/UF/Município)"
      accentColor={qtd > 0 ? "#dc2626" : "#16a34a"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: qtd > 0 ? "#fee2e2" : "#dcfce7",
          color: qtd > 0 ? "#991b1b" : "#15803d",
        }}>
          {qtd > 0 ? `${qtd} inscrição(ões)` : negativa ? "negativa" : "sem dados"}
        </span>
      }
    >
      {!data ? (
        <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>Sem documento de Dívida Ativa anexado.</p>
      ) : negativa ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px" }}>
          <span style={{ color: "#16a34a", fontSize: "14px", flexShrink: 0 }}>✓</span>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#15803d" }}>Certidão NEGATIVA — sem débitos inscritos</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", marginBottom: "16px" }}>
            <span style={{ color: "#dc2626", fontSize: "14px", flexShrink: 0 }}>⚠</span>
            <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#991b1b" }}>
              {qtd} inscrição(ões) em Dívida Ativa — total <b>{data.valorTotal || "—"}</b>
              {data.dataConsulta ? ` (consulta ${data.dataConsulta})` : ""}
            </p>
          </div>
          {regs.length > 0 && (
            <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: "640px", fontSize: "12px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["Origem", "Inscrição", "Valor", "Situação", "Data", "Natureza"].map((h, i) => (
                      <th key={i} style={{ padding: "8px 10px", textAlign: i === 2 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regs.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "8px 10px", color: "#111827" }}>{r.origem || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#6B7280", fontFamily: "monospace", fontSize: "11px" }}>{r.numeroInscricao || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#991b1b", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.valor || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#374151" }}>{r.situacao || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#6B7280", whiteSpace: "nowrap" }}>{r.dataInscricao || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#6B7280" }}>{r.natureza || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
