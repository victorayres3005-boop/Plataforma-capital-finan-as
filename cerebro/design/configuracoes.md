# Aba: Configurações

Configurações da conta + Política de Crédito V2.

**Política de Crédito** é a sub-aba mais densa: contém critérios, pesos, alertas, rating, elegibilidade e parâmetros operacionais — cada um numa tab interna.

Gerado em 2026-05-05T12:26:17.783Z

---

## Sumário
- `app/configuracoes/page.tsx`
- `components\politica\AlertasTab.tsx`
- `components\politica\CriteriosTab.tsx`
- `components\politica\ElegibilidadeTab.tsx`
- `components\politica\OperacionalTab.tsx`
- `components\politica\PesosTab.tsx`
- `components\politica\PolicyVersionBanner.tsx`
- `components\politica\PoliticaCreditoTab.tsx`
- `components\politica\RatingTab.tsx`

---

## app/configuracoes/page.tsx

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { PoliticaCreditoTab } from "@/components/politica/PoliticaCreditoTab";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export default function ConfiguracoesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", display: "flex", flexDirection: "column" }}>

      {/* ── Hero header ── */}
      <div style={{ background: "linear-gradient(135deg, #1a2f6b 0%, #203b88 60%, #1e3a8a 100%)", padding: "32px 32px 28px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "rgba(168,217,107,0.15)", border: "1px solid rgba(168,217,107,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <SlidersHorizontal size={22} style={{ color: "#a8d96b" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.3px" }}>
                  Política de Crédito
                </h1>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: "#fbbf24",
                  background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)",
                  borderRadius: 4, padding: "2px 7px",
                }}>V2</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "3px 0 0" }}>
                Configure os critérios, pesos e parâmetros aplicados nas análises de crédito
              </p>
            </div>
          </div>
        </div>
      </div>

      <main style={{ flex: 1, maxWidth: "1200px", margin: "0 auto", width: "100%", padding: "20px 32px 28px", boxSizing: "border-box" }}>
        <Breadcrumb items={[{ label: "Política de Crédito", current: true }]} className="mb-4" />
        <PoliticaCreditoTab userId={user.id} />
      </main>
    </div>
  );
}

```

## components/politica/AlertasTab.tsx

```tsx
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

```

## components/politica/CriteriosTab.tsx

```tsx
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
      if (n.has(id)) n.delete(id); else n.add(id);
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

```

## components/politica/ElegibilidadeTab.tsx

```tsx
"use client";

import type { ParametrosElegibilidade } from "@/types/politica-credito";

interface Props {
  params: ParametrosElegibilidade;
  onChange: (p: ParametrosElegibilidade) => void;
}

export function ElegibilidadeTab({ params, onChange }: Props) {
  const set = <K extends keyof ParametrosElegibilidade>(key: K, value: ParametrosElegibilidade[K]) =>
    onChange({ ...params, [key]: value, ultima_atualizacao: new Date().toISOString().split("T")[0] });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Critérios eliminatórios quantitativos */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <SectionTitle label="Pré-requisitos Mínimos" subtitle="Critérios eliminatórios — reprovação automática se não atender" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingBottom: 20 }}>
            <NumField
              label="FMM Mínimo"
              description="Faturamento médio mensal mínimo aceito"
              value={params.fmm_minimo}
              onChange={v => set("fmm_minimo", v)}
              prefix="R$"
              step={10000}
              min={0}
              format="currency"
            />
            <NumField
              label="Tempo de Constituição Mínimo"
              description="Empresa deve ter pelo menos X anos"
              value={params.tempo_constituicao_minimo_anos}
              onChange={v => set("tempo_constituicao_minimo_anos", v)}
              suffix="anos"
              step={0.5}
              min={0}
            />
          </div>
        </div>
      </div>

      {/* Alavancagem */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <SectionTitle label="Limites de Alavancagem" subtitle="Dívida total SCR ÷ FMM — quanto menor, mais saudável" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingBottom: 20 }}>
            <NumField
              label="Alavancagem Saudável"
              description="Até esse valor = aprovado sem ressalvas"
              value={params.alavancagem_saudavel}
              onChange={v => set("alavancagem_saudavel", v)}
              suffix="x FMM"
              step={0.1}
              min={0}
            />
            <NumField
              label="Alavancagem Máxima"
              description="Acima = reprovado automaticamente"
              value={params.alavancagem_maxima}
              onChange={v => set("alavancagem_maxima", v)}
              suffix="x FMM"
              step={0.1}
              min={0}
            />
          </div>
        </div>
      </div>

      {/* Parâmetros operacionais */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <SectionTitle label="Parâmetros Operacionais" subtitle="Prazos, concentração e fator de limite" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, paddingBottom: 20 }}>
            <NumField
              label="Prazo Máx. Aprovado"
              description="Prazo máximo para operação aprovada"
              value={params.prazo_maximo_aprovado}
              onChange={v => set("prazo_maximo_aprovado", v)}
              suffix="dias"
              min={1}
            />
            <NumField
              label="Prazo Máx. Condicional"
              description="Prazo para aprovação condicional"
              value={params.prazo_maximo_condicional}
              onChange={v => set("prazo_maximo_condicional", v)}
              suffix="dias"
              min={1}
            />
            <NumField
              label="Concentração Máx. Sacado"
              description="Máximo por sacado no total da carteira"
              value={params.concentracao_max_sacado}
              onChange={v => set("concentracao_max_sacado", v)}
              suffix="%"
              step={1}
              min={1}
              max={100}
            />
          </div>
        </div>
      </div>

      {/* Limite de crédito e revisão */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <SectionTitle label="Limite de Crédito e Revisão" subtitle="Cálculo do limite sugerido e períodos de revisão" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, paddingBottom: 20 }}>
            <NumField
              label="Fator Base do Limite"
              description="Limite sugerido = FMM × este fator"
              value={params.fator_limite_base}
              onChange={v => set("fator_limite_base", v)}
              suffix="x FMM"
              step={0.1}
              min={0.1}
            />
            <NumField
              label="Revisão Aprovado"
              description="Prazo para revisar empresa aprovada"
              value={params.revisao_aprovado_dias}
              onChange={v => set("revisao_aprovado_dias", v)}
              suffix="dias"
              min={1}
            />
            <NumField
              label="Revisão Condicional"
              description="Prazo para revisar aprovação condicional"
              value={params.revisao_condicional_dias}
              onChange={v => set("revisao_condicional_dias", v)}
              suffix="dias"
              min={1}
            />
          </div>
        </div>
      </div>

      {/* Restrições SCR e bureau */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <SectionTitle label="Restrições Bureau e SCR" subtitle="Limites eliminatórios para protestos, processos e inadimplência" />
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Critérios fixos — não configuráveis
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["CCF — Cheques sem fundo > 0 ocorrências", "Recuperação Judicial / Falência ativa"].map(t => (
                <span key={t} style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 5, padding: "3px 9px" }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, paddingBottom: 20 }}>
            <NumField
              label="Protestos Máximos"
              description="Número máximo de protestos vigentes"
              value={params.protestos_max}
              onChange={v => set("protestos_max", v)}
              suffix="protestos"
              step={1}
              min={0}
            />
            <NumField
              label="Processos Passivos Máx."
              description="Número máximo de processos passivos"
              value={params.processos_passivos_max}
              onChange={v => set("processos_passivos_max", v)}
              suffix="processos"
              step={1}
              min={0}
            />
            <NumField
              label="SCR Vencidos Máx."
              description="% máxima de dívidas vencidas no SCR"
              value={params.scr_vencidos_max_pct}
              onChange={v => set("scr_vencidos_max_pct", v)}
              suffix="% do total"
              step={1}
              min={0}
              max={100}
            />
          </div>
        </div>
      </div>

      {/* Restrições qualitativas */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px" }}>
          <SectionTitle label="Restrições Qualitativas" subtitle="Situações que bloqueiam ou condicionam a aprovação" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ToggleField
              label="Aceita cedentes com débitos em outros fundos"
              description="Empresas com pendências em outros FIDCs"
              value={params.aceita_com_debitos_outros_fundos}
              onChange={v => set("aceita_com_debitos_outros_fundos", v)}
            />
            <ToggleField
              label="Aceita recuperação judicial homologada"
              description="Empresas com RJ já homologado pelo juiz"
              value={params.aceita_recuperacao_judicial_homologada}
              onChange={v => set("aceita_recuperacao_judicial_homologada", v)}
            />
          </div>
        </div>
      </div>

      {params.ultima_atualizacao && (
        <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "right", margin: 0 }}>
          Última atualização: {params.ultima_atualizacao}
        </p>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ label, subtitle }: { label: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px" }}>
        {label}
      </p>
      <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function NumField({
  label, description, value, onChange, prefix, suffix, step = 1, min = 0, max, format,
}: {
  label: string; description: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number; max?: number; format?: "currency";
}) {
  const formatted = format === "currency"
    ? value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : String(value);

  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>{label}</label>
      <p style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8, lineHeight: 1.4 }}>{description}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {prefix && <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          step={step}
          min={min}
          max={max}
          style={{
            flex: 1, height: 36, border: "1px solid #e5e7eb", borderRadius: 8,
            padding: "0 10px", fontSize: 13, fontWeight: 600, color: "#111827",
            outline: "none", background: "white",
          }}
        />
        {suffix && <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{suffix}</span>}
      </div>
      {format === "currency" && (
        <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
          = R$ {formatted}
        </p>
      )}
    </div>
  );
}

function ToggleField({
  label, description, value, onChange,
}: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px",
        background: value ? "#f0fdf4" : "#fafafa",
        border: `1px solid ${value ? "#bbf7d0" : "#e5e7eb"}`,
        borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{
        position: "relative", width: 40, height: 22, borderRadius: 11,
        background: value ? "#16a34a" : "#d1d5db",
        flexShrink: 0, marginTop: 1, transition: "background 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%", background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
        }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>{label}</p>
        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{description}</p>
      </div>
    </div>
  );
}

```

## components/politica/OperacionalTab.tsx

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface OperacionalData {
  id?: string;
  // Taxas por rating
  taxa_base_rating_a: number;
  taxa_base_rating_b: number;
  taxa_base_rating_c: number;
  taxa_base_rating_d: number;
  taxa_base_rating_e: number;
  // Reanálise por rating
  reanalise_rating_a_dias: number;
  reanalise_rating_b_dias: number;
  reanalise_rating_c_dias: number;
  reanalise_rating_d_dias: number;
  reanalise_rating_e_dias: number;
  reanalise_rating_f_dias: number;
  // Exceções e alçadas
  overlimit_permitido_pct: number;
  flexibilizacao_prazo_dias: number;
  tolerancia_atraso_dias: number;
  permite_excecao_eliminatorio: boolean;
  // Garantias por rating
  garantia_obrigatoria_rating: string[];
  // Visibilidade de seções
  exibir_conformidade: boolean;
}

const DEFAULTS: OperacionalData = {
  taxa_base_rating_a: 1.5,
  taxa_base_rating_b: 2.0,
  taxa_base_rating_c: 2.5,
  taxa_base_rating_d: 3.5,
  taxa_base_rating_e: 5.0,
  reanalise_rating_a_dias: 180,
  reanalise_rating_b_dias: 120,
  reanalise_rating_c_dias: 120,
  reanalise_rating_d_dias: 120,
  reanalise_rating_e_dias: 90,
  reanalise_rating_f_dias: 45,
  overlimit_permitido_pct: 0,
  flexibilizacao_prazo_dias: 0,
  tolerancia_atraso_dias: 0,
  permite_excecao_eliminatorio: false,
  garantia_obrigatoria_rating: ["D", "E", "F"],
  exibir_conformidade: false,
};

const RATINGS = ["A", "B", "C", "D", "E", "F"] as const;

interface Props {
  userId: string;
}

export function OperacionalTab({ userId }: Props) {
  const [data, setData] = useState<OperacionalData>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipDirty = useRef(true);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: row } = await supabase
          .from("fund_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (row) {
          skipDirty.current = true;
          setData({
            id: row.id,
            taxa_base_rating_a:        row.taxa_base_rating_a        ?? DEFAULTS.taxa_base_rating_a,
            taxa_base_rating_b:        row.taxa_base_rating_b        ?? DEFAULTS.taxa_base_rating_b,
            taxa_base_rating_c:        row.taxa_base_rating_c        ?? DEFAULTS.taxa_base_rating_c,
            taxa_base_rating_d:        row.taxa_base_rating_d        ?? DEFAULTS.taxa_base_rating_d,
            taxa_base_rating_e:        row.taxa_base_rating_e        ?? DEFAULTS.taxa_base_rating_e,
            reanalise_rating_a_dias:   row.reanalise_rating_a_dias   ?? DEFAULTS.reanalise_rating_a_dias,
            reanalise_rating_b_dias:   row.reanalise_rating_b_dias   ?? DEFAULTS.reanalise_rating_b_dias,
            reanalise_rating_c_dias:   row.reanalise_rating_c_dias   ?? DEFAULTS.reanalise_rating_c_dias,
            reanalise_rating_d_dias:   row.reanalise_rating_d_dias   ?? DEFAULTS.reanalise_rating_d_dias,
            reanalise_rating_e_dias:   row.reanalise_rating_e_dias   ?? DEFAULTS.reanalise_rating_e_dias,
            reanalise_rating_f_dias:   row.reanalise_rating_f_dias   ?? DEFAULTS.reanalise_rating_f_dias,
            overlimit_permitido_pct:   row.overlimit_permitido_pct   ?? DEFAULTS.overlimit_permitido_pct,
            flexibilizacao_prazo_dias: row.flexibilizacao_prazo_dias ?? DEFAULTS.flexibilizacao_prazo_dias,
            tolerancia_atraso_dias:    row.tolerancia_atraso_dias    ?? DEFAULTS.tolerancia_atraso_dias,
            permite_excecao_eliminatorio: row.permite_excecao_eliminatorio ?? DEFAULTS.permite_excecao_eliminatorio,
            exibir_conformidade:          row.exibir_conformidade          ?? DEFAULTS.exibir_conformidade,
            garantia_obrigatoria_rating:  Array.isArray(row.garantia_obrigatoria_rating)
              ? row.garantia_obrigatoria_rating
              : DEFAULTS.garantia_obrigatoria_rating,
          });
        }
      } catch (err) {
        console.warn("[OperacionalTab] load error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  useEffect(() => {
    if (skipDirty.current) { skipDirty.current = false; return; }
    setIsDirty(true);
    setSaveStatus("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const persist = useCallback(async (d: OperacionalData) => {
    const supabase = createClient();
    const payload = {
      user_id: userId,
      taxa_base_rating_a:           d.taxa_base_rating_a,
      taxa_base_rating_b:           d.taxa_base_rating_b,
      taxa_base_rating_c:           d.taxa_base_rating_c,
      taxa_base_rating_d:           d.taxa_base_rating_d,
      taxa_base_rating_e:           d.taxa_base_rating_e,
      reanalise_rating_a_dias:      d.reanalise_rating_a_dias,
      reanalise_rating_b_dias:      d.reanalise_rating_b_dias,
      reanalise_rating_c_dias:      d.reanalise_rating_c_dias,
      reanalise_rating_d_dias:      d.reanalise_rating_d_dias,
      reanalise_rating_e_dias:      d.reanalise_rating_e_dias,
      reanalise_rating_f_dias:      d.reanalise_rating_f_dias,
      overlimit_permitido_pct:      d.overlimit_permitido_pct,
      flexibilizacao_prazo_dias:    d.flexibilizacao_prazo_dias,
      tolerancia_atraso_dias:       d.tolerancia_atraso_dias,
      permite_excecao_eliminatorio: d.permite_excecao_eliminatorio,
      exibir_conformidade:          d.exibir_conformidade,
      garantia_obrigatoria_rating:  d.garantia_obrigatoria_rating,
    };

    if (d.id) {
      const { error } = await supabase.from("fund_settings").update(payload).eq("id", d.id);
      if (error) throw error;
    } else {
      const { data: row, error } = await supabase
        .from("fund_settings")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      setData(prev => ({ ...prev, id: row.id }));
    }
  }, [userId]);

  useEffect(() => {
    if (!isDirty) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      try {
        await persist(data);
        setIsDirty(false);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 2500);
      } catch {
        setSaveStatus("error");
      }
    }, 1800);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isDirty]);

  const set = <K extends keyof OperacionalData>(key: K, value: OperacionalData[K]) =>
    setData(prev => ({ ...prev, [key]: value }));

  const toggleGarantia = (rating: string) =>
    setData(prev => {
      const cur = prev.garantia_obrigatoria_rating;
      return {
        ...prev,
        garantia_obrigatoria_rating: cur.includes(rating)
          ? cur.filter(r => r !== rating)
          : [...cur, rating],
      };
    });

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
        <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Badge + autosave status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 12px", borderRadius: 20,
          background: "linear-gradient(90deg, #fef3c7, #fde68a)",
          border: "1px solid #fbbf24", fontSize: 11, fontWeight: 700, color: "#92400e",
        }}>
          V2 — Em construção
        </span>
        {saveStatus === "saved" && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
            <Check size={12} /> Salvo
          </span>
        )}
        {isDirty && saveStatus === "idle" && (
          <span style={{ fontSize: 11, color: "#9ca3af" }}>Salvando em instantes...</span>
        )}
        {saveStatus === "error" && (
          <span style={{ fontSize: 11, color: "#dc2626" }}>Erro ao salvar</span>
        )}
      </div>

      {/* 1. Taxas por rating */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 20px" }}>
          <SectionTitle
            label="Taxas por Rating"
            subtitle="Taxa base mensal sugerida de acordo com o rating V2 do cedente"
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {(["A", "B", "C", "D", "E"] as const).map(r => (
              <NumField
                key={r}
                label={`Taxa base Rating ${r} (% a.m.)`}
                value={(data as unknown as Record<string, number>)[`taxa_base_rating_${r.toLowerCase()}`]}
                onChange={v => set(`taxa_base_rating_${r.toLowerCase()}` as keyof OperacionalData, v as OperacionalData[keyof OperacionalData])}
                suffix="% a.m."
                step={0.1}
                min={0}
                max={20}
              />
            ))}
            <NumField
              label="Taxa base Rating F (% a.m.)"
              value={0}
              onChange={() => {}}
              suffix="% a.m."
              disabled
              disabledLabel="Não opera"
            />
          </div>
        </div>
      </div>

      {/* 2. Reanálise por rating */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 20px" }}>
          <SectionTitle
            label="Reanálise por Rating"
            subtitle="Prazo para revisão periódica do cedente conforme o rating V2"
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {RATINGS.map(r => (
              <NumField
                key={r}
                label={`Reanálise Rating ${r} (dias)`}
                value={(data as unknown as Record<string, number>)[`reanalise_rating_${r.toLowerCase()}_dias`]}
                onChange={v => set(`reanalise_rating_${r.toLowerCase()}_dias` as keyof OperacionalData, v as OperacionalData[keyof OperacionalData])}
                suffix="dias"
                step={15}
                min={1}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 3. Exceções e alçadas */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 20px" }}>
          <SectionTitle
            label="Exceções e Alçadas"
            subtitle="Limites de flexibilização permitidos pelo comitê"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <NumField
              label="Overlimit permitido (%)"
              value={data.overlimit_permitido_pct}
              onChange={v => set("overlimit_permitido_pct", v)}
              suffix="%"
              step={5}
              min={0}
              max={100}
            />
            <NumField
              label="Flexibilização de prazo (dias)"
              value={data.flexibilizacao_prazo_dias}
              onChange={v => set("flexibilizacao_prazo_dias", v)}
              suffix="dias"
              step={15}
              min={0}
            />
            <NumField
              label="Tolerância de atraso (dias)"
              value={data.tolerancia_atraso_dias}
              onChange={v => set("tolerancia_atraso_dias", v)}
              suffix="dias"
              step={1}
              min={0}
            />
          </div>
          <ToggleField
            label="Permite exceção para eliminatórios"
            description="Comitê pode aprovar cedentes com critérios eliminatórios mediante alçada superior"
            value={data.permite_excecao_eliminatorio}
            onChange={v => set("permite_excecao_eliminatorio", v)}
          />
          <div style={{ marginTop: 10 }}>
            <ToggleField
              label="Exibir seção de Conformidade no relatório"
              description="Quando desligado, a seção de conformidade com o fundo é ocultada no PDF, HTML e tela"
              value={data.exibir_conformidade}
              onChange={v => set("exibir_conformidade", v)}
              variant="positive"
            />
          </div>
        </div>
      </div>

      {/* 4. Garantias por rating */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 20px" }}>
          <SectionTitle
            label="Garantias por Rating"
            subtitle="Ratings para os quais garantia real é obrigatória — não apenas aval"
          />
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 14, marginTop: 0 }}>
            Exigir garantia obrigatória para ratings:
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {RATINGS.map(r => {
              const checked = data.garantia_obrigatoria_rating.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleGarantia(r)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${checked ? ratingColor(r).border : "#e5e7eb"}`,
                    background: checked ? ratingColor(r).bg : "#fafafa",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? ratingColor(r).border : "#d1d5db"}`,
                    background: checked ? ratingColor(r).border : "white",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    transition: "all 0.15s",
                  }}>
                    {checked && <Check size={10} color="white" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: checked ? ratingColor(r).text : "#6b7280" }}>
                    Rating {r}
                  </span>
                </button>
              );
            })}
          </div>
          {data.garantia_obrigatoria_rating.length > 0 && (
            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 12, marginBottom: 0 }}>
              Garantia obrigatória ativada para: {data.garantia_obrigatoria_rating.sort().join(", ")}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ratingColor(r: string): { bg: string; border: string; text: string } {
  if (r === "A") return { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" };
  if (r === "B") return { bg: "#f0fdf4", border: "#84cc16", text: "#4d7c0f" };
  if (r === "C") return { bg: "#fefce8", border: "#eab308", text: "#854d0e" };
  if (r === "D") return { bg: "#fff7ed", border: "#f97316", text: "#c2410c" };
  if (r === "E") return { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" };
  return           { bg: "#faf5ff", border: "#a855f7", text: "#7e22ce" }; // F
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ label, subtitle }: { label: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px" }}>
        {label}
      </p>
      <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function NumField({
  label, value, onChange, suffix, step = 1, min = 0, max, disabled, disabledLabel,
}: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; step?: number; min?: number; max?: number;
  disabled?: boolean; disabledLabel?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: disabled ? "#9ca3af" : "#374151", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          value={value}
          onChange={e => !disabled && onChange(parseFloat(e.target.value) || 0)}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          style={{
            flex: 1, height: 36, border: `1px solid ${disabled ? "#f3f4f6" : "#e5e7eb"}`,
            borderRadius: 8, padding: "0 10px", fontSize: 13, fontWeight: 600,
            color: disabled ? "#9ca3af" : "#111827",
            outline: "none", background: disabled ? "#f9fafb" : "white",
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
        {disabledLabel
          ? <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, fontStyle: "italic" }}>{disabledLabel}</span>
          : suffix && <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{suffix}</span>
        }
      </div>
    </div>
  );
}

function ToggleField({
  label, description, value, onChange, variant = "danger",
}: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
  variant?: "danger" | "positive";
}) {
  const activeColor  = variant === "positive" ? "#16a34a" : "#ef4444";
  const activeBg     = variant === "positive" ? "#f0fdf4" : "#fef2f2";
  const activeBorder = variant === "positive" ? "#86efac" : "#fca5a5";
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px",
        background: value ? activeBg : "#fafafa",
        border: `1px solid ${value ? activeBorder : "#e5e7eb"}`,
        borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{
        position: "relative", width: 40, height: 22, borderRadius: 11,
        background: value ? activeColor : "#d1d5db",
        flexShrink: 0, marginTop: 1, transition: "background 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%", background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
        }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>{label}</p>
        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{description}</p>
      </div>
    </div>
  );
}

```

## components/politica/PesosTab.tsx

```tsx
"use client";

import type { PesosPilares } from "@/types/politica-credito";
import { somarPesos } from "@/lib/politica-credito/validators";

interface Props {
  pesos: PesosPilares;
  onChange: (p: PesosPilares) => void;
}

const PILAR_LABELS: Record<keyof PesosPilares, { nome: string; desc: string; cor: string }> = {
  estrutura_operacao: { nome: "Estrutura da Operação", desc: "Lastro, sacados, garantias", cor: "#203b88" },
  risco_compliance:  { nome: "Risco e Compliance", desc: "SCR, protestos, processos, RJ", cor: "#dc2626" },
  perfil_empresa:    { nome: "Perfil da Empresa", desc: "Segmento, localização, porte", cor: "#73b815" },
  saude_financeira:  { nome: "Saúde Financeira", desc: "DRE, balanço, alavancagem", cor: "#d97706" },
  socios_governanca: { nome: "Sócios e Governança", desc: "Endividamento, patrimônio, sucessão", cor: "#7c3aed" },
};

export function PesosTab({ pesos, onChange }: Props) {
  const soma = somarPesos(pesos);
  const somaOk = Math.round(soma) === 100;

  const set = (key: keyof PesosPilares, value: number) =>
    onChange({ ...pesos, [key]: Math.max(0, Math.min(100, value)) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Indicador de soma */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px",
        background: somaOk ? "#f0fdf4" : "#fef2f2",
        border: `1px solid ${somaOk ? "#bbf7d0" : "#fecaca"}`,
        borderRadius: 12,
      }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: somaOk ? "#166534" : "#991b1b", margin: "0 0 2px" }}>
            {somaOk ? "Soma dos pesos: 100% ✓" : `Soma dos pesos: ${soma.toFixed(1)}% — deve ser exatamente 100%`}
          </p>
          <p style={{ fontSize: 11, color: somaOk ? "#16a34a" : "#dc2626", margin: 0 }}>
            {somaOk
              ? "Configuração válida — salvar habilitado."
              : `Falta ${(100 - soma).toFixed(1)}% para completar.`}
          </p>
        </div>
        {/* Mini bar */}
        <div style={{ width: 120, height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${Math.min(soma, 100)}%`,
            background: somaOk ? "#16a34a" : soma > 100 ? "#dc2626" : "#d97706",
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Sliders por pilar */}
      {(Object.entries(pesos) as [keyof PesosPilares, number][]).map(([key, valor]) => {
        const meta = PILAR_LABELS[key];
        return (
          <div key={key} style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: meta.cor, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{meta.nome}</p>
                  <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>{meta.desc}</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  value={valor}
                  onChange={e => set(key, parseFloat(e.target.value) || 0)}
                  min={0} max={100} step={1}
                  style={{
                    width: 64, height: 34, border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: "0 8px", fontSize: 14, fontWeight: 800, color: meta.cor,
                    textAlign: "center", outline: "none",
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>%</span>
              </div>
            </div>
            {/* Track */}
            <div style={{ position: "relative", height: 8, background: "#f1f5f9", borderRadius: 4 }}>
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${Math.min(valor, 100)}%`,
                background: meta.cor, borderRadius: 4, transition: "width 0.2s",
              }} />
              <input
                type="range"
                min={0} max={100} step={1}
                value={valor}
                onChange={e => set(key, parseInt(e.target.value))}
                style={{
                  position: "absolute", top: -4, left: 0, width: "100%", height: "16px",
                  opacity: 0, cursor: "pointer",
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Distribuição visual */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", padding: "18px 20px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Distribuição Visual
        </p>
        <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", gap: 1 }}>
          {(Object.entries(pesos) as [keyof PesosPilares, number][])
            .filter(([, v]) => v > 0)
            .map(([key, valor]) => (
              <div
                key={key}
                title={`${PILAR_LABELS[key].nome}: ${valor}%`}
                style={{ flex: valor, background: PILAR_LABELS[key].cor, minWidth: 2, transition: "flex 0.3s" }}
              />
            ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
          {(Object.entries(pesos) as [keyof PesosPilares, number][]).map(([key, valor]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: PILAR_LABELS[key].cor }} />
              <span style={{ fontSize: 11, color: "#374151" }}>{PILAR_LABELS[key].nome.split(" ")[0]}: <b>{valor}%</b></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

```

## components/politica/PolicyVersionBanner.tsx

```tsx
"use client";

import { AlertTriangle } from "lucide-react";

interface PolicyVersionBannerProps {
  version?: string;
  lastUpdated?: string;
  compact?: boolean;
}

export function PolicyVersionBanner({ version = "V2", lastUpdated, compact = false }: PolicyVersionBannerProps) {
  if (compact) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "#fffbeb", border: "1px solid #fbbf24",
        borderRadius: 6, padding: "3px 10px",
        fontSize: 11, fontWeight: 700, color: "#92400e",
      }}>
        <AlertTriangle size={11} />
        Política {version} — Em construção
      </span>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14,
      background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
      border: "1px solid #fbbf24",
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 20,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: "#fef3c7", border: "1px solid #fbbf24",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <AlertTriangle size={18} style={{ color: "#d97706" }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#92400e", margin: "0 0 4px" }}>
          Política de Crédito {version} — Em Construção
        </p>
        <p style={{ fontSize: 12, color: "#b45309", margin: 0, lineHeight: 1.6 }}>
          Esta política está na versão {version} e passará por alterações. Os parâmetros abaixo são
          configuráveis e serão refinados conforme aprendizados operacionais.
          {lastUpdated && (
            <span style={{ marginLeft: 6, fontWeight: 600 }}>
              Última atualização: {lastUpdated}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

```

## components/politica/PoliticaCreditoTab.tsx

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Save, Loader2, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ConfiguracaoPolitica } from "@/types/politica-credito";
import { DEFAULT_POLITICA_V2, mergeComDefaults } from "@/lib/politica-credito/defaults";
import { validarPolitica, validarPesosPilares, somarPesos } from "@/lib/politica-credito/validators";
import { PolicyVersionBanner } from "./PolicyVersionBanner";
import { ElegibilidadeTab } from "./ElegibilidadeTab";
import { PesosTab } from "./PesosTab";
import { CriteriosTab } from "./CriteriosTab";
import { RatingTab } from "./RatingTab";
import { AlertasTab } from "./AlertasTab";
import { OperacionalTab } from "./OperacionalTab";

const TABS = [
  { id: "elegibilidade", label: "Elegibilidade" },
  { id: "pesos",         label: "Pesos dos Pilares" },
  { id: "criterios",     label: "Critérios" },
  { id: "rating",        label: "Rating" },
  { id: "operacional",   label: "Operacional" },
  { id: "alertas",       label: "Alertas" },
] as const;

type TabId = typeof TABS[number]["id"];

interface Props {
  userId: string;
}

export function PoliticaCreditoTab({ userId }: Props) {
  const [config, setConfig] = useState<ConfiguracaoPolitica>({ ...DEFAULT_POLITICA_V2, user_id: userId });
  const [activeTab, setActiveTab] = useState<TabId>("elegibilidade");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipDirty = useRef(true);

  // Load from Supabase
  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("politica_credito_config")
          .select("*")
          .eq("user_id", userId)
          .order("atualizado_em", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          skipDirty.current = true;
          setConfig(mergeComDefaults(data as Record<string, unknown>));
        }
      } catch (err) {
        console.warn("[PoliticaCreditoTab] load error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  // Track dirty
  useEffect(() => {
    if (skipDirty.current) { skipDirty.current = false; return; }
    setIsDirty(true);
    setSaveStatus("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const persist = useCallback(async (cfg: ConfiguracaoPolitica) => {
    const erros = validarPolitica(cfg);
    if (erros.length > 0) return; // silent skip on autosave

    const supabase = createClient();
    const now = new Date().toISOString();
    const payload = {
      user_id: userId,
      versao: cfg.versao,
      status: cfg.status,
      parametros_elegibilidade: cfg.parametros_elegibilidade,
      pesos_pilares: cfg.pesos_pilares,
      pilares: cfg.pilares,
      faixas_rating: cfg.faixas_rating,
      alertas: cfg.alertas,
      atualizado_em: now,
    };

    if (cfg.id) {
      const { error } = await supabase
        .from("politica_credito_config")
        .update(payload)
        .eq("id", cfg.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("politica_credito_config")
        .insert({ ...payload, criado_em: now })
        .select("id")
        .single();
      if (error) throw error;
      setConfig(prev => ({ ...prev, id: data.id, criado_em: now }));
    }
  }, [userId]);

  // Autosave on dirty
  useEffect(() => {
    if (!isDirty) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      try {
        await persist(config);
        setIsDirty(false);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 2500);
      } catch {
        setSaveStatus("error");
      }
    }, 1800);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isDirty]);

  const handleSaveNow = async () => {
    const erros = validarPolitica(config);
    if (erros.length > 0) { toast.error(erros[0]); return; }
    setSaving(true);
    try {
      await persist(config);
      setIsDirty(false);
      setSaveStatus("saved");
      toast.success("Política salva!");
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Tente novamente"));
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    if (!confirm("Resetar para os valores padrão da V2? As alterações serão perdidas.")) return;
    skipDirty.current = true;
    setConfig({ ...DEFAULT_POLITICA_V2, user_id: userId, id: config.id });
    setIsDirty(true);
    setSaveStatus("idle");
  };

  const somaPesos = somarPesos(config.pesos_pilares);
  const pesosOk = Math.round(somaPesos) === 100;
  const erroPesos = validarPesosPilares(config.pesos_pilares);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
        <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <PolicyVersionBanner version={config.versao} lastUpdated={config.atualizado_em?.split("T")[0]} />

      {/* Tabs + save bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "white", borderRadius: 14, border: "1px solid #e8edf5",
        padding: "4px 8px 4px 8px", marginBottom: 16, flexWrap: "wrap", gap: 8,
      }}>
        {/* Tab pills */}
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            const hasError = tab.id === "pesos" && !pesosOk;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 500,
                  color: hasError ? "#dc2626" : active ? "#203b88" : "#6b7280",
                  background: active ? "#f0f4ff" : "transparent",
                  border: active ? "1px solid #c7d2fe" : "1px solid transparent",
                  borderRadius: 8, cursor: "pointer", transition: "all 0.12s",
                  position: "relative",
                }}
              >
                {tab.label}
                {hasError && (
                  <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%", background: "#dc2626" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saveStatus === "saved" && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={12} /> Salvo
            </span>
          )}
          {isDirty && saveStatus === "idle" && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Alterações pendentes...</span>
          )}
          {saveStatus === "error" && (
            <span style={{ fontSize: 11, color: "#dc2626" }}>Erro ao salvar</span>
          )}
          <button onClick={resetToDefault} title="Resetar para padrão V2" style={{
            padding: "7px 10px", fontSize: 11, fontWeight: 600, color: "#6b7280",
            background: "transparent", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <RefreshCw size={11} /> Reset V2
          </button>
          <button
            onClick={handleSaveNow}
            disabled={saving || (!isDirty && saveStatus !== "error")}
            style={{
              padding: "7px 16px", fontSize: 12, fontWeight: 700, color: "white",
              background: !pesosOk ? "#9ca3af" : "linear-gradient(135deg, #73b815, #5e9a0e)",
              border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: pesosOk ? "0 2px 8px rgba(115,184,21,0.3)" : "none",
              opacity: !isDirty && saveStatus === "idle" ? 0.5 : 1,
            }}
          >
            {saving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
            Salvar
          </button>
        </div>
      </div>

      {/* Aviso de pesos inválidos */}
      {erroPesos && activeTab !== "pesos" && (
        <div style={{
          padding: "8px 14px", background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 8, fontSize: 12, color: "#dc2626", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          ⚠ {erroPesos} — acesse a aba <b style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setActiveTab("pesos")}>Pesos dos Pilares</b> para corrigir.
        </div>
      )}

      {/* Tab content */}
      {activeTab === "elegibilidade" && (
        <ElegibilidadeTab
          params={config.parametros_elegibilidade}
          onChange={p => setConfig(prev => ({ ...prev, parametros_elegibilidade: p }))}
        />
      )}
      {activeTab === "pesos" && (
        <PesosTab
          pesos={config.pesos_pilares}
          onChange={p => setConfig(prev => ({ ...prev, pesos_pilares: p }))}
        />
      )}
      {activeTab === "criterios" && (
        <CriteriosTab
          pilares={config.pilares}
          onChange={p => setConfig(prev => ({ ...prev, pilares: p }))}
        />
      )}
      {activeTab === "rating" && (
        <RatingTab
          faixas={config.faixas_rating}
          onChange={f => setConfig(prev => ({ ...prev, faixas_rating: f }))}
        />
      )}
      {activeTab === "operacional" && (
        <OperacionalTab userId={userId} />
      )}
      {activeTab === "alertas" && (
        <AlertasTab
          alertas={config.alertas}
          onChange={a => setConfig(prev => ({ ...prev, alertas: a }))}
        />
      )}

      {/* Status rodapé */}
      <div style={{ marginTop: 16, fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
        Versão <b>{config.versao}</b> · Status: <b>{config.status}</b>
        {config.atualizado_em && ` · Salvo em ${new Date(config.atualizado_em).toLocaleString("pt-BR")}`}
      </div>
    </div>
  );
}

```

## components/politica/RatingTab.tsx

```tsx
"use client";

import type { FaixaRating } from "@/types/politica-credito";

interface Props {
  faixas: FaixaRating[];
  onChange: (faixas: FaixaRating[]) => void;
}

const _RATING_LABELS = { A: "A", B: "B", C: "C", D: "D", E: "E", F: "F" }; void _RATING_LABELS;

export function RatingTab({ faixas, onChange }: Props) {
  const sorted = [...faixas].sort((a, b) => b.score_minimo - a.score_minimo);

  const updateFaixa = (rating: string, updated: Partial<FaixaRating>) =>
    onChange(faixas.map(f => f.rating === rating ? { ...f, ...updated } : f));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Escala visual */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", padding: "18px 20px" }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#374151", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Escala de Rating (0–100)
        </p>
        <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", gap: 1 }}>
          {sorted.map(f => (
            <div
              key={f.rating}
              title={`${f.rating}: ${f.score_minimo}–${f.score_maximo} (${f.interpretacao})`}
              style={{ flex: f.score_maximo - f.score_minimo + 1, background: f.cor, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: "white", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{f.rating}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>0</span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>100</span>
        </div>
      </div>

      {/* Faixas editáveis */}
      {sorted.map(faixa => (
        <div key={faixa.rating} style={{ background: "white", borderRadius: 14, border: `1px solid ${faixa.cor}44`, overflow: "hidden" }}>
          <div style={{ height: 3, background: faixa.cor }} />
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: faixa.cor, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: "white" }}>{faixa.rating}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", margin: 0 }}>{faixa.interpretacao}</p>
                <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{faixa.leitura_risco}</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Field label="Score mínimo">
                <input
                  type="number"
                  value={faixa.score_minimo}
                  onChange={e => updateFaixa(faixa.rating, { score_minimo: parseInt(e.target.value) || 0 })}
                  min={0} max={100}
                  style={inputStyle}
                />
              </Field>
              <Field label="Score máximo">
                <input
                  type="number"
                  value={faixa.score_maximo}
                  onChange={e => updateFaixa(faixa.rating, { score_maximo: parseInt(e.target.value) || 0 })}
                  min={0} max={100}
                  style={inputStyle}
                />
              </Field>
              <Field label="Cor">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={faixa.cor}
                    onChange={e => updateFaixa(faixa.rating, { cor: e.target.value })}
                    style={{ width: 36, height: 36, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }}
                  />
                  <input
                    value={faixa.cor}
                    onChange={e => updateFaixa(faixa.rating, { cor: e.target.value })}
                    maxLength={7}
                    style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 12 }}
                  />
                </div>
              </Field>
              <Field label="Reanálise (dias)">
                <input
                  type="number"
                  value={faixa.periodicidade_reanalise_dias}
                  onChange={e => updateFaixa(faixa.rating, { periodicidade_reanalise_dias: parseInt(e.target.value) || 0 })}
                  min={1}
                  style={inputStyle}
                />
              </Field>
              <Field label="Interpretação" style={{ gridColumn: "span 2" }}>
                <input
                  value={faixa.interpretacao}
                  onChange={e => updateFaixa(faixa.rating, { interpretacao: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Leitura de risco" style={{ gridColumn: "span 2" }}>
                <input
                  value={faixa.leitura_risco}
                  onChange={e => updateFaixa(faixa.rating, { leitura_risco: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, border: "1px solid #e5e7eb", borderRadius: 7,
  padding: "0 10px", fontSize: 13, color: "#111827", outline: "none",
  boxSizing: "border-box",
};

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

```
