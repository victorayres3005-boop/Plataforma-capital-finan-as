"use client";

import { useState, useMemo } from "react";
import { CheckCircle, Circle, AlertTriangle } from "lucide-react";
import type {
  ConfiguracaoPolitica,
  CriterioPilar,
  PilarPolitica,
  RespostaCriterio,
  ScoreResult,
} from "@/types/politica-credito";
import { calcularScore, calcularPontosCriterio } from "@/lib/politica-credito/calculator";
import { PolicyVersionBanner } from "@/components/politica/PolicyVersionBanner";

interface Props {
  config: ConfiguracaoPolitica;
  initialRespostas?: RespostaCriterio[];
  onScoreCalculated?: (score: ScoreResult, respostas: RespostaCriterio[]) => void;
  readOnly?: boolean;
}

const MANUAIS_OBRIGATORIOS = [
  'segmento', 'estrutura_fisica', 'garantias',
  'patrimonio_socios', 'risco_sucessao',
];

const PILAR_COLORS: Record<string, string> = {
  perfil_empresa:    "#73b815",
  saude_financeira:  "#d97706",
  risco_compliance:  "#dc2626",
  socios_governanca: "#7c3aed",
  estrutura_operacao:"#203b88",
};

export function ScoreForm({ config, initialRespostas = [], onScoreCalculated, readOnly = false }: Props) {
  const [respostas, setRespostas] = useState<RespostaCriterio[]>(initialRespostas);
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [expandedPilares, setExpandedPilares] = useState<Set<string>>(
    new Set(config.pilares.map(p => p.id))
  );

  const score = useMemo(() => calcularScore(config, respostas), [config, respostas]);
  const ratingFaixa = config.faixas_rating.find(f => f.rating === score.rating);

  const totalCriterios = config.pilares.flatMap(p => p.criterios).length;
  const progresso = totalCriterios > 0 ? Math.round((respostas.length / totalCriterios) * 100) : 0;

  const getResp = (criterioId: string, pilarId: string) =>
    respostas.find(r => r.criterio_id === criterioId && r.pilar_id === pilarId);

  const setResposta = (pilarId: string, criterioId: string, opcaoLabel: string, pontos_base: number, modLabel?: string, modMult?: number) => {
    const pontos_final = calcularPontosCriterio(pontos_base, modMult);
    const nova: RespostaCriterio = {
      criterio_id: criterioId, pilar_id: pilarId,
      opcao_label: opcaoLabel, pontos_base, pontos_final,
      modificador_label: modLabel, modificador_multiplicador: modMult,
      observacao: observacoes[`${pilarId}-${criterioId}`],
      fonte_preenchimento: 'manual',
    };
    const novas = [...respostas.filter(r => !(r.criterio_id === criterioId && r.pilar_id === pilarId)), nova];
    setRespostas(novas);
    onScoreCalculated?.(calcularScore(config, novas), novas);
  };

  const setObs = (pilarId: string, criterioId: string, obs: string) => {
    const key = `${pilarId}-${criterioId}`;
    setObservacoes(prev => ({ ...prev, [key]: obs }));
    setRespostas(prev => prev.map(r =>
      r.criterio_id === criterioId && r.pilar_id === pilarId ? { ...r, observacao: obs } : r
    ));
  };

  const togglePilar = (id: string) =>
    setExpandedPilares(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolicyVersionBanner version={config.versao} compact />

      {/* Score em tempo real */}
      <div style={{
        background: "white", borderRadius: 16, border: "1px solid #e8edf5",
        padding: "20px 24px", display: "flex", alignItems: "center", gap: 20,
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}>
        {/* Gauge */}
        <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
          <svg viewBox="0 0 80 80" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
            <circle cx="40" cy="40" r="32" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle
              cx="40" cy="40" r="32" fill="none"
              stroke={ratingFaixa?.cor ?? "#e5e7eb"}
              strokeWidth="10"
              strokeDasharray={`${(score.score_final / 100) * 201} 201`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.4s" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: ratingFaixa?.cor ?? "#374151", lineHeight: 1 }}>
              {score.score_final.toFixed(0)}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af" }}>/ 100</span>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: ratingFaixa?.cor ?? "#374151" }}>
              Rating {score.rating}
            </span>
            {ratingFaixa && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                — {ratingFaixa.interpretacao}
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: score.confianca_score === "alta" ? "#16a34a" : score.confianca_score === "parcial" ? "#d97706" : "#dc2626",
              background: score.confianca_score === "alta" ? "#f0fdf4" : score.confianca_score === "parcial" ? "#fffbeb" : "#fef2f2",
              border: `1px solid ${score.confianca_score === "alta" ? "#bbf7d0" : score.confianca_score === "parcial" ? "#fcd34d" : "#fecaca"}`,
              borderRadius: 5, padding: "2px 7px",
            }}>
              Confiança {score.confianca_score.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${progresso}%`, background: "#203b88", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, flexShrink: 0 }}>
              {respostas.length}/{totalCriterios} critérios
            </span>
          </div>

          {score.pilares_pendentes.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={12} style={{ color: "#d97706" }} />
              <span style={{ fontSize: 11, color: "#d97706" }}>
                Score parcial — aguardando calibração: {score.pilares_pendentes.join(", ")}
              </span>
            </div>
          )}

          {ratingFaixa && (
            <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0" }}>
              {ratingFaixa.leitura_risco} · Reanálise em {ratingFaixa.periodicidade_reanalise_dias} dias
            </p>
          )}
        </div>
      </div>

      {/* Pilares */}
      {config.pilares.map(pilar => {
        const cor = PILAR_COLORS[pilar.id] ?? "#203b88";
        const expanded = expandedPilares.has(pilar.id);
        const pontosBrutos = score.pontos_brutos[pilar.id] ?? 0;
        const pontosPonderados = score.pontuacao_ponderada[pilar.id] ?? 0;
        const pilarRespostas = respostas.filter(r => r.pilar_id === pilar.id);
        const pilarProgresso = pilar.criterios.length > 0 ? pilarRespostas.length / pilar.criterios.length : 0;

        return (
          <div key={pilar.id} style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
            <button
              onClick={() => togglePilar(pilar.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: cor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>{pilar.nome}</p>
                  {pilar.status_calibracao === "pendente_calibracao" && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#d97706", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 4, padding: "1px 5px" }}>
                      AGUARDANDO CALIBRAÇÃO
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 80, height: 4, background: "#f1f5f9", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${pilarProgresso * 100}%`, background: cor, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>{pilarRespostas.length}/{pilar.criterios.length}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 900, color: cor, margin: 0 }}>
                  {pontosBrutos.toFixed(1)} / {pilar.pontos_totais}
                </p>
                <p style={{ fontSize: 10, color: "#9ca3af", margin: 0 }}>{pontosPonderados.toFixed(1)} pts pond.</p>
              </div>
              <span style={{ color: "#9ca3af", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
            </button>

            {expanded && (
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                {pilar.criterios.map(criterio => (
                  <CriterioItem
                    key={criterio.id}
                    criterio={criterio}
                    pilar={pilar}
                    cor={cor}
                    resp={getResp(criterio.id, pilar.id)}
                    obsValue={observacoes[`${pilar.id}-${criterio.id}`] ?? ""}
                    onSelect={(opcaoLabel, pontosBase, modLabel, modMult) =>
                      setResposta(pilar.id, criterio.id, opcaoLabel, pontosBase, modLabel, modMult)
                    }
                    onObs={obs => setObs(pilar.id, criterio.id, obs)}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-componente por critério (tem estado próprio) ─────────────────────────
interface CriterioItemProps {
  criterio: CriterioPilar;
  pilar: PilarPolitica;
  cor: string;
  resp: RespostaCriterio | undefined;
  obsValue: string;
  onSelect: (opcaoLabel: string, pontosBase: number, modLabel?: string, modMult?: number) => void;
  onObs: (obs: string) => void;
  readOnly: boolean;
}

function CriterioItem({ criterio, cor, resp, obsValue, onSelect, onObs, readOnly }: CriterioItemProps) {
  const [showObs, setShowObs] = useState(false);

  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid #f8fafc" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ marginTop: 2 }}>
          {resp
            ? <CheckCircle size={15} style={{ color: "#16a34a" }} />
            : <Circle size={15} style={{ color: "#d1d5db" }} />
          }
        </div>
        <div style={{ flex: 1 }}>
          {/* Nome + badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{criterio.nome}</p>
            {resp?.fonte_preenchimento === 'auto' && (
              <span style={{
                fontSize: '10px', fontWeight: 500, padding: '1px 6px',
                borderRadius: '99px', background: '#e0f2fe', color: '#0369a1',
                verticalAlign: 'middle',
              }}>
                Auto
              </span>
            )}
            {!resp && MANUAIS_OBRIGATORIOS.includes(criterio.id) && (
              <span style={{
                fontSize: '10px', fontWeight: 500, padding: '1px 6px',
                borderRadius: '99px', background: '#fef9c3', color: '#854d0e',
                verticalAlign: 'middle',
              }}>
                Obrigatório
              </span>
            )}
            {criterio.obrigatorio && (
              <span style={{ fontSize: 9, fontWeight: 800, color: "#dc2626", background: "#fef2f2", borderRadius: 3, padding: "1px 5px" }}>
                OBRIG.
              </span>
            )}
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
              máx. {criterio.pontos_maximos} pts
            </span>
          </div>

          {criterio.observacao && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px", fontStyle: "italic" }}>
              {criterio.observacao}
            </p>
          )}

          {/* Modificadores */}
          {criterio.modificadores && criterio.modificadores.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#374151", margin: "0 0 5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Tipo de validação
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {criterio.modificadores.map(mod => {
                  const modSel = resp?.modificador_label === mod.label;
                  return (
                    <button
                      key={mod.label}
                      disabled={readOnly || !resp}
                      onClick={() => resp && onSelect(resp.opcao_label, resp.pontos_base, mod.label, mod.multiplicador)}
                      style={{
                        padding: "4px 10px", fontSize: 11, fontWeight: modSel ? 700 : 500,
                        color: modSel ? "#7c3aed" : "#6b7280",
                        background: modSel ? "#faf5ff" : "white",
                        border: `1px solid ${modSel ? "#c4b5fd" : "#e5e7eb"}`,
                        borderRadius: 6, cursor: readOnly || !resp ? "default" : "pointer",
                      }}
                    >
                      {mod.label} (×{mod.multiplicador})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Opções */}
          {criterio.opcoes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {criterio.opcoes.map(opcao => {
                const sel = resp?.opcao_label === opcao.label;
                const pontosExibidos = resp?.modificador_multiplicador && sel
                  ? calcularPontosCriterio(opcao.pontos, resp.modificador_multiplicador).toFixed(1)
                  : String(opcao.pontos);
                return (
                  <button
                    key={opcao.label}
                    disabled={readOnly}
                    onClick={() => onSelect(opcao.label, opcao.pontos, resp?.modificador_label, resp?.modificador_multiplicador)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "9px 12px", textAlign: "left", width: "100%",
                      background: sel ? `${cor}12` : "white",
                      border: `1px solid ${sel ? cor : "#e5e7eb"}`,
                      borderRadius: 8, cursor: readOnly ? "default" : "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      border: `2px solid ${sel ? cor : "#d1d5db"}`,
                      background: sel ? cor : "transparent",
                    }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: sel ? "#0f172a" : "#374151", margin: "0 0 2px" }}>
                        {opcao.label}
                      </p>
                      <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{opcao.descricao}</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: sel ? cor : "#9ca3af", flexShrink: 0 }}>
                      {pontosExibidos} pts
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "8px 12px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 11, color: "#92400e" }}>
              Opções não calibradas — aguardando definição da pontuação V2.
            </div>
          )}

          {/* Observação */}
          {resp && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setShowObs(v => !v)}
                style={{ fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {showObs ? "▲ Ocultar observação" : "▼ Adicionar observação"}
              </button>
              {showObs && (
                <textarea
                  value={obsValue}
                  onChange={e => onObs(e.target.value)}
                  placeholder="Observação sobre este critério..."
                  rows={2}
                  style={{
                    display: "block", width: "100%", marginTop: 6,
                    border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px",
                    fontSize: 12, color: "#374151", resize: "vertical", outline: "none", boxSizing: "border-box",
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
