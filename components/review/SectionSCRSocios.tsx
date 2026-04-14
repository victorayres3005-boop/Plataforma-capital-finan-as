"use client";
import { useState } from "react";
import { SCRSocioData } from "@/types";
import { SectionCard, QualityResult, qualityAccent } from "./shared";

interface Props {
  socios: SCRSocioData[];
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

function parseBR(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmtBRL(v: string | undefined | null): string {
  const n = parseBR(v);
  if (n === 0) return "R$ 0,00";
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVar(atual: string | undefined, anterior: string | undefined): { text: string; color: string } {
  const a = parseBR(atual);
  const b = parseBR(anterior);
  if (b === 0) return { text: "—", color: "#9CA3AF" };
  const diff = a - b;
  if (diff === 0) return { text: "=", color: "#9CA3AF" };
  const pct = (diff / Math.abs(b)) * 100;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    // Aumento de dívida = ruim (vermelho); redução = bom (verde)
    color: pct > 0 ? "#DC2626" : "#16A34A",
  };
}

function maskCpf(cpf: string | undefined): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return cpf;
}

export function SectionSCRSocios({ socios, expanded, onToggle, quality }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const hasSocios = socios && socios.length > 0;

  return (
    <SectionCard
      number="05b"
      title="SCR dos Sócios — Perfil de Crédito PF"
      accentColor={hasSocios ? qualityAccent(quality.score) : "#9CA3AF"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: hasSocios ? "#dbeafe" : "#f3f4f6", color: hasSocios ? "#1e40af" : "#6b7280" }}>
          {hasSocios ? `${socios.length} sócio${socios.length > 1 ? "s" : ""}` : "sem dados"}
        </span>
      }
    >
      {!hasSocios ? (
        <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "8px", border: "1px dashed #D1D5DB" }}>
          <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>
            Nenhum SCR de sócio PF enviado. Envie arquivos nos slots <strong>SCR dos Sócios — Atual</strong> e{" "}
            <strong>SCR dos Sócios — Anterior</strong> para visualizar o comparativo aqui.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {socios.map((socio, i) => {
            const atual = socio.periodoAtual;
            const anterior = socio.periodoAnterior;
            const isExpanded = expandedIdx === i;
            const nomeSocio = socio.nomeSocio || atual?.nomeCliente || "Sócio sem nome";
            const cpfSocio = maskCpf(socio.cpfSocio || atual?.cpfSCR);

            return (
              <div
                key={i}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "10px",
                  overflow: "hidden",
                  background: "white",
                }}
              >
                {/* Header do sócio */}
                <div style={{ padding: "12px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nomeSocio}
                      </div>
                      <div style={{ fontSize: "11px", color: "#6B7280", fontFamily: "ui-monospace, SFMono-Regular, monospace", marginTop: "2px" }}>
                        CPF: {cpfSocio}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {atual?.periodoReferencia || "—"}
                        {anterior?.periodoReferencia ? ` × ${anterior.periodoReferencia}` : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Métricas principais — sempre visíveis */}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                    <Metric label="Total Dívida" value={fmtBRL(atual?.totalDividasAtivas)} variation={anterior ? fmtVar(atual?.totalDividasAtivas, anterior.totalDividasAtivas) : undefined} />
                    <Metric label="A Vencer" value={fmtBRL(atual?.carteiraAVencer)} variation={anterior ? fmtVar(atual?.carteiraAVencer, anterior.carteiraAVencer) : undefined} />
                    <Metric label="Vencidos" value={fmtBRL(atual?.vencidos)} variation={anterior ? fmtVar(atual?.vencidos, anterior.vencidos) : undefined} danger={parseBR(atual?.vencidos) > 0} />
                    <Metric label="Prejuízos" value={fmtBRL(atual?.prejuizos)} variation={anterior ? fmtVar(atual?.prejuizos, anterior.prejuizos) : undefined} danger={parseBR(atual?.prejuizos) > 0} />
                  </div>

                  <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                    <Metric label="Limite Crédito" value={fmtBRL(atual?.limiteCredito)} />
                    <Metric label="Qtde IFs" value={atual?.qtdeInstituicoes || "—"} />
                    <Metric label="Classificação" value={atual?.classificacaoRisco || "—"} />
                  </div>

                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    style={{
                      marginTop: "12px", fontSize: "12px", fontWeight: 600, color: "#203b88",
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    {isExpanded ? "▲ Ocultar detalhes" : "▼ Ver modalidades e comparativo completo"}
                  </button>

                  {isExpanded && (
                    <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      {/* Comparativo atual x anterior detalhado */}
                      {anterior && (
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280", marginBottom: "6px" }}>
                            Comparativo {anterior.periodoReferencia || "Anterior"} → {atual?.periodoReferencia || "Atual"}
                          </p>
                          <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#F9FAFB" }}>
                                <th style={{ textAlign: "left", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Métrica</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Anterior</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Atual</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Var.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                { label: "Total Dívida", ant: anterior.totalDividasAtivas, at: atual?.totalDividasAtivas, bold: true },
                                { label: "A Vencer", ant: anterior.carteiraAVencer, at: atual?.carteiraAVencer },
                                { label: "Vencidos", ant: anterior.vencidos, at: atual?.vencidos },
                                { label: "Prejuízos", ant: anterior.prejuizos, at: atual?.prejuizos },
                                { label: "Limite", ant: anterior.limiteCredito, at: atual?.limiteCredito },
                                { label: "Curto Prazo", ant: anterior.carteiraCurtoPrazo, at: atual?.carteiraCurtoPrazo },
                                { label: "Longo Prazo", ant: anterior.carteiraLongoPrazo, at: atual?.carteiraLongoPrazo },
                                { label: "IFs", ant: anterior.qtdeInstituicoes, at: atual?.qtdeInstituicoes },
                              ].map((m, j) => {
                                const v = fmtVar(m.at, m.ant);
                                return (
                                  <tr key={j} style={{ borderBottom: "1px solid #F3F4F6", fontWeight: m.bold ? 700 : 400, background: m.bold ? "#F9FAFB" : "transparent" }}>
                                    <td style={{ padding: "6px 10px", color: "#374151" }}>{m.label}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#6B7280", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(m.ant)}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#111827", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(m.at)}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: v.color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{v.text}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Modalidades do período atual */}
                      {atual?.modalidades && atual.modalidades.length > 0 && (
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280", marginBottom: "6px" }}>
                            Modalidades ({atual.periodoReferencia || "Atual"})
                          </p>
                          <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#F9FAFB" }}>
                                <th style={{ textAlign: "left", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Modalidade</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>A Vencer</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Vencido</th>
                                <th style={{ textAlign: "right", padding: "6px 10px", color: "#6B7280", fontWeight: 600 }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {atual.modalidades.map((mod, k) => (
                                <tr key={k} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                  <td style={{ padding: "6px 10px", color: "#374151" }}>{mod.nome || "—"}</td>
                                  <td style={{ padding: "6px 10px", textAlign: "right", color: "#374151", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(mod.aVencer)}</td>
                                  <td style={{ padding: "6px 10px", textAlign: "right", color: parseBR(mod.vencido) > 0 ? "#DC2626" : "#374151", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(mod.vencido)}</td>
                                  <td style={{ padding: "6px 10px", textAlign: "right", color: "#111827", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtBRL(mod.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Aviso se não tem anterior */}
                      {!anterior && (
                        <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: "8px", fontSize: "12px", color: "#92400E" }}>
                          Sem período anterior enviado — comparativo indisponível. Envie no slot <strong>SCR dos Sócios — Anterior</strong>.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function Metric({ label, value, variation, danger }: { label: string; value: string; variation?: { text: string; color: string }; danger?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "8px",
        background: danger ? "#FEF2F2" : "#F9FAFB",
        border: `1px solid ${danger ? "#FECACA" : "#E5E7EB"}`,
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: danger ? "#991B1B" : "#111827", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {variation && (
        <div style={{ fontSize: "10px", fontWeight: 600, color: variation.color, marginTop: "2px" }}>
          {variation.text}
        </div>
      )}
    </div>
  );
}
