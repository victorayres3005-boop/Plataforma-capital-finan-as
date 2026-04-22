"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { PilarPolitica, CriterioPilar, OpcaoCriterio } from "@/types/politica-credito";

interface Props {
  pilares: PilarPolitica[];
  onChange: (pilares: PilarPolitica[]) => void;
}

const PILAR_COLORS: Record<string, string> = {
  perfil_empresa:    "#73b815",
  saude_financeira:  "#d97706",
  risco_compliance:  "#dc2626",
  socios_governanca: "#7c3aed",
  estrutura_operacao:"#203b88",
};

export function CriteriosTab({ pilares, onChange }: Props) {
  const [selectedPilarId, setSelectedPilarId] = useState<string>(pilares[0]?.id ?? "");
  const [expandedCriterios, setExpandedCriterios] = useState<Set<string>>(new Set());

  const selectedPilar = pilares.find(p => p.id === selectedPilarId);
  const cor = PILAR_COLORS[selectedPilarId] ?? "#203b88";

  const updatePilar = (updated: PilarPolitica) =>
    onChange(pilares.map(p => p.id === updated.id ? updated : p));

  const updateCriterio = (criterio: CriterioPilar) => {
    if (!selectedPilar) return;
    updatePilar({
      ...selectedPilar,
      criterios: selectedPilar.criterios.map(c => c.id === criterio.id ? criterio : c),
    });
  };

  const toggleExpanded = (id: string) =>
    setExpandedCriterios(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
      {/* Pilares sidebar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px 2px" }}>
          Pilares
        </p>
        {pilares.map(p => {
          const sel = p.id === selectedPilarId;
          const pc = PILAR_COLORS[p.id] ?? "#203b88";
          return (
            <button key={p.id} onClick={() => setSelectedPilarId(p.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 13px",
              background: sel ? "white" : "rgba(255,255,255,0.7)",
              border: sel ? `1.5px solid ${pc}` : "1px solid #e8edf5",
              borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%",
              boxShadow: sel ? `0 2px 8px ${pc}22` : "none", transition: "all 0.15s",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: pc, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.nome}
                </p>
                <p style={{ fontSize: 10, color: "#9ca3af", margin: "1px 0 0" }}>
                  {p.criterios.length} critérios · {p.pontos_totais} pts
                </p>
              </div>
              {p.status_calibracao === "pendente_calibracao" && (
                <span style={{ fontSize: 9, fontWeight: 800, color: "#d97706", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                  PEND.
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Critérios do pilar selecionado */}
      <div>
        {!selectedPilar ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>Selecione um pilar.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Pilar header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 }}>{selectedPilar.nome}</p>
                {selectedPilar.status_calibracao === "pendente_calibracao" && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: "#d97706",
                    background: "#fffbeb", border: "1px solid #fbbf24",
                    borderRadius: 5, padding: "2px 8px",
                  }}>
                    Aguardando calibração
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Total: <b style={{ color: cor }}>{selectedPilar.pontos_totais} pts</b>
              </span>
            </div>

            {selectedPilar.status_calibracao === "pendente_calibracao" && (
              <div style={{
                background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 10, padding: "10px 14px",
                fontSize: 12, color: "#92400e", lineHeight: 1.6,
              }}>
                As pontuações deste pilar ainda não foram calibradas para a V2. Os critérios estão listados
                abaixo para referência. Preencha as opções e pontos quando a calibração for definida.
              </div>
            )}

            {/* Pontos totais do pilar */}
            <div style={{ background: "white", borderRadius: 10, border: "1px solid #e8edf5", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: 0 }}>Pontos totais do pilar</p>
              <input
                type="number"
                value={selectedPilar.pontos_totais}
                onChange={e => updatePilar({ ...selectedPilar, pontos_totais: parseInt(e.target.value) || 0 })}
                min={0} max={100}
                style={{ width: 72, height: 32, border: "1px solid #e5e7eb", borderRadius: 7, padding: "0 8px", fontSize: 14, fontWeight: 800, color: cor, textAlign: "center", outline: "none" }}
              />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>pontos (base para ponderação)</span>
            </div>

            {/* Lista de critérios */}
            {selectedPilar.criterios.map(criterio => {
              const expanded = expandedCriterios.has(criterio.id);
              return (
                <div key={criterio.id} style={{ background: "white", borderRadius: 12, border: "1px solid #e8edf5", overflow: "hidden" }}>
                  {/* Header do critério */}
                  <button
                    onClick={() => toggleExpanded(criterio.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "13px 16px",
                      background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    {expanded ? <ChevronDown size={14} style={{ color: "#9ca3af", flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{criterio.nome}</p>
                      {criterio.observacao && !expanded && (
                        <p style={{ fontSize: 10, color: "#9ca3af", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 380 }}>
                          {criterio.observacao}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {criterio.obrigatorio && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, padding: "1px 5px" }}>
                          OBRIG.
                        </span>
                      )}
                      {criterio.status_calibracao === "pendente_calibracao" && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#d97706", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 4, padding: "1px 5px" }}>
                          PEND.
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>
                        {criterio.pontos_maximos} pts
                      </span>
                    </div>
                  </button>

                  {/* Body expandido */}
                  {expanded && (
                    <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px" }}>
                      {/* Pontos max */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Pontos máximos:</label>
                        <input
                          type="number"
                          value={criterio.pontos_maximos}
                          onChange={e => updateCriterio({ ...criterio, pontos_maximos: parseInt(e.target.value) || 0 })}
                          min={0}
                          style={{ width: 64, height: 30, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 13, fontWeight: 800, color: cor, textAlign: "center", outline: "none" }}
                        />
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginLeft: 12 }}>
                          <input
                            type="checkbox"
                            checked={criterio.obrigatorio}
                            onChange={e => updateCriterio({ ...criterio, obrigatorio: e.target.checked })}
                            style={{ marginRight: 6 }}
                          />
                          Obrigatório
                        </label>
                      </div>

                      {/* Observação */}
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Observação</label>
                        <textarea
                          value={criterio.observacao ?? ""}
                          onChange={e => updateCriterio({ ...criterio, observacao: e.target.value })}
                          rows={2}
                          placeholder="Notas sobre como aplicar este critério..."
                          style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#374151", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                        />
                      </div>

                      {/* Modificadores */}
                      {criterio.modificadores && criterio.modificadores.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>Modificadores</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {criterio.modificadores.map((mod, mi) => (
                              <div key={mi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e8edf5" }}>
                                <input
                                  value={mod.label}
                                  onChange={e => {
                                    const mods = [...(criterio.modificadores ?? [])];
                                    mods[mi] = { ...mods[mi], label: e.target.value };
                                    updateCriterio({ ...criterio, modificadores: mods });
                                  }}
                                  style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 12, outline: "none" }}
                                />
                                <span style={{ fontSize: 11, color: "#6b7280" }}>×</span>
                                <input
                                  type="number"
                                  value={mod.multiplicador}
                                  onChange={e => {
                                    const mods = [...(criterio.modificadores ?? [])];
                                    mods[mi] = { ...mods[mi], multiplicador: parseFloat(e.target.value) || 1 };
                                    updateCriterio({ ...criterio, modificadores: mods });
                                  }}
                                  step={0.1} min={0} max={2}
                                  style={{ width: 60, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 6px", fontSize: 12, textAlign: "center", outline: "none" }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Opções */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: 0 }}>Opções de pontuação</p>
                          <button
                            onClick={() => updateCriterio({
                              ...criterio,
                              opcoes: [...criterio.opcoes, { label: "Nova opção", descricao: "", pontos: 0 }],
                            })}
                            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#203b88", background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                          >
                            <Plus size={11} /> Adicionar opção
                          </button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {criterio.opcoes.length === 0 && (
                            <p style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                              Nenhuma opção configurada. Adicione opções para este critério.
                            </p>
                          )}
                          {criterio.opcoes.map((opcao, oi) => (
                            <OpcaoRow
                              key={oi}
                              opcao={opcao}
                              cor={cor}
                              onChange={updated => {
                                const ops = [...criterio.opcoes];
                                ops[oi] = updated;
                                updateCriterio({ ...criterio, opcoes: ops });
                              }}
                              onRemove={() => {
                                const ops = criterio.opcoes.filter((_, idx) => idx !== oi);
                                updateCriterio({ ...criterio, opcoes: ops });
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Linha de opção editável ──────────────────────────────────────────────────
function OpcaoRow({ opcao, cor, onChange, onRemove }: {
  opcao: OpcaoCriterio; cor: string;
  onChange: (o: OpcaoCriterio) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: "#fafafa", borderRadius: 8, border: "1px solid #e8edf5" }}>
      {/* Pontos */}
      <input
        type="number"
        value={opcao.pontos}
        onChange={e => onChange({ ...opcao, pontos: parseFloat(e.target.value) || 0 })}
        min={0}
        style={{ width: 52, height: 30, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 6px", fontSize: 13, fontWeight: 800, color: cor, textAlign: "center", outline: "none", flexShrink: 0 }}
      />
      <span style={{ fontSize: 10, color: "#9ca3af", marginTop: 9, flexShrink: 0 }}>pts</span>
      {/* Label + Desc */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <input
          value={opcao.label}
          onChange={e => onChange({ ...opcao, label: e.target.value })}
          placeholder="Rótulo (ex: Bom)"
          style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 600, outline: "none" }}
        />
        <input
          value={opcao.descricao}
          onChange={e => onChange({ ...opcao, descricao: e.target.value })}
          placeholder="Descrição..."
          style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#6b7280", outline: "none" }}
        />
      </div>
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, marginTop: 4, color: "#d1d5db" }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}
