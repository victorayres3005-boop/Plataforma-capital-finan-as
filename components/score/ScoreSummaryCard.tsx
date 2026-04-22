"use client";

import type { ScoreResult, ConfiguracaoPolitica } from "@/types/politica-credito";
import { PolicyVersionBanner } from "@/components/politica/PolicyVersionBanner";

interface Props {
  score: ScoreResult;
  config: ConfiguracaoPolitica;
  preenchidoEm?: string;
  preenchidoPor?: string;
}

const PILAR_LABELS: Record<string, string> = {
  perfil_empresa:    "Perfil da Empresa",
  saude_financeira:  "Saúde Financeira",
  risco_compliance:  "Risco e Compliance",
  socios_governanca: "Sócios e Governança",
  estrutura_operacao:"Estrutura da Operação",
};

const PILAR_COLORS: Record<string, string> = {
  perfil_empresa:    "#73b815",
  saude_financeira:  "#d97706",
  risco_compliance:  "#dc2626",
  socios_governanca: "#7c3aed",
  estrutura_operacao:"#203b88",
};

export function ScoreSummaryCard({ score, config, preenchidoEm, preenchidoPor }: Props) {
  const ratingFaixa = config.faixas_rating.find(f => f.rating === score.rating);
  const ratingCor = ratingFaixa?.cor ?? "#e5e7eb";

  const pilarOrder = ["perfil_empresa", "saude_financeira", "risco_compliance", "socios_governanca", "estrutura_operacao"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolicyVersionBanner version={score.versao_politica} compact />

      {/* Score principal */}
      <div style={{
        background: "white", borderRadius: 16, border: `1px solid ${ratingCor}44`,
        overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        <div style={{ height: 4, background: ratingCor }} />
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
            {/* Score gauge */}
            <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
              <svg viewBox="0 0 90 90" style={{ width: 90, height: 90, transform: "rotate(-90deg)" }}>
                <circle cx="45" cy="45" r="36" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                <circle
                  cx="45" cy="45" r="36" fill="none"
                  stroke={ratingCor}
                  strokeWidth="12"
                  strokeDasharray={`${(score.score_final / 100) * 226} 226`}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: ratingCor, lineHeight: 1 }}>
                  {score.score_final.toFixed(0)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af" }}>pts</span>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{
                  fontSize: 32, fontWeight: 900, color: ratingCor, lineHeight: 1,
                  background: `${ratingCor}15`, borderRadius: 8, padding: "4px 14px",
                }}>
                  {score.rating}
                </span>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    {ratingFaixa?.interpretacao ?? "—"}
                  </p>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
                    {ratingFaixa?.leitura_risco ?? ""}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Tag color="#203b88">{score.versao_politica}</Tag>
                <Tag color={score.confianca_score === "alta" ? "#16a34a" : score.confianca_score === "parcial" ? "#d97706" : "#dc2626"}>
                  Confiança {score.confianca_score}
                </Tag>
                {ratingFaixa && (
                  <Tag color="#374151">Reanálise em {ratingFaixa.periodicidade_reanalise_dias}d</Tag>
                )}
              </div>
            </div>
          </div>

          {/* Breakdown por pilar */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Pontuação por pilar
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pilarOrder.map(id => {
                const pilar = config.pilares.find(p => p.id === id);
                if (!pilar) return null;
                const bruto = score.pontos_brutos[id] ?? 0;
                const ponderado = score.pontuacao_ponderada[id] ?? 0;
                const max = pilar.pontos_totais;
                const cor = PILAR_COLORS[id] ?? "#374151";
                const pct = max > 0 ? bruto / max : 0;
                const isPendente = pilar.status_calibracao === "pendente_calibracao";

                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor, flexShrink: 0 }} />
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: 0, minWidth: 160 }}>
                      {PILAR_LABELS[id] ?? id}
                      {isPendente && (
                        <span style={{ fontSize: 9, color: "#d97706", marginLeft: 6, fontWeight: 800 }}>PEND.</span>
                      )}
                    </p>
                    <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3 }}>
                      <div style={{
                        height: "100%", width: `${pct * 100}%`,
                        background: isPendente ? "#d1d5db" : cor,
                        borderRadius: 3, transition: "width 0.4s",
                      }} />
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: cor, margin: 0, minWidth: 60, textAlign: "right" }}>
                      {bruto.toFixed(1)}/{max}
                    </p>
                    <p style={{ fontSize: 10, color: "#9ca3af", margin: 0, minWidth: 60, textAlign: "right" }}>
                      {ponderado.toFixed(1)} pts
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pilares pendentes */}
          {score.pilares_pendentes.length > 0 && (
            <div style={{
              marginTop: 12, padding: "8px 12px",
              background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
              fontSize: 11, color: "#92400e",
            }}>
              ⚠ Score parcial — pilares sem calibração V2: {score.pilares_pendentes.join(", ")}.
              As pontuações desses pilares não foram contabilizadas completamente.
            </div>
          )}
        </div>
      </div>

      {/* Metadados */}
      {(preenchidoEm || preenchidoPor) && (
        <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
          {preenchidoPor && <span>Por: <b>{preenchidoPor}</b> · </span>}
          {preenchidoEm && <span>Em: <b>{new Date(preenchidoEm).toLocaleString("pt-BR")}</b></span>}
        </div>
      )}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}14`, border: `1px solid ${color}33`,
      borderRadius: 5, padding: "2px 8px",
    }}>
      {children}
    </span>
  );
}
