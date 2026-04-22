"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, ChevronDown, ChevronUp, BarChart3, Settings, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ConfiguracaoPolitica, RespostaCriterio, ScoreResult } from "@/types/politica-credito";
import { DEFAULT_POLITICA_V2 } from "@/lib/politica-credito/defaults";
import { ScoreForm } from "./ScoreForm";
import { ScoreSummaryCard } from "./ScoreSummaryCard";
import { PolicyVersionBanner } from "@/components/politica/PolicyVersionBanner";

interface Props {
  collectionId: string;
}

type ViewMode = "form" | "summary";

export function ScoreSection({ collectionId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("form");
  const [noPolicy, setNoPolicy] = useState(false);

  const [policy, setPolicy] = useState<ConfiguracaoPolitica | null>(null);
  const [respostas, setRespostas] = useState<RespostaCriterio[]>([]);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [scoreId, setScoreId] = useState<string | null>(null);
  const [preenchidoPor, setPreenchidoPor] = useState<string | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = useRef<string | null>(null);

  // ── Load: auth + policy + existing score ─────────────────────────────────
  useEffect(() => {
    if (!collectionId) return;
    const load = async () => {
      try {
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        userId.current = user.id;

        // Load policy config
        const { data: policyData } = await supabase
          .from("politica_credito_config")
          .select("*")
          .eq("user_id", user.id)
          .order("atualizado_em", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (policyData) {
          setPolicy({
            id: policyData.id,
            user_id: policyData.user_id,
            versao: policyData.versao ?? "V2",
            status: policyData.status ?? "rascunho",
            parametros_elegibilidade: policyData.parametros_elegibilidade ?? DEFAULT_POLITICA_V2.parametros_elegibilidade,
            pesos_pilares: policyData.pesos_pilares ?? DEFAULT_POLITICA_V2.pesos_pilares,
            pilares: policyData.pilares ?? DEFAULT_POLITICA_V2.pilares,
            faixas_rating: policyData.faixas_rating ?? DEFAULT_POLITICA_V2.faixas_rating,
            alertas: policyData.alertas ?? DEFAULT_POLITICA_V2.alertas,
          });
        } else {
          // Sem configuração salva — usa defaults V2 como preview
          setPolicy(DEFAULT_POLITICA_V2);
          setNoPolicy(true);
        }

        // Load existing score for this collection
        const { data: scoreData } = await supabase
          .from("score_operacoes")
          .select("*")
          .eq("collection_id", collectionId)
          .order("preenchido_em", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (scoreData) {
          setScoreId(scoreData.id);
          setRespostas(scoreData.respostas ?? []);
          setScoreResult(scoreData.score_result ?? null);
          setSavedAt(scoreData.preenchido_em);
          setPreenchidoPor(scoreData.preenchido_por ?? null);
          if (scoreData.score_result) setViewMode("summary");
        }
      } catch (err) {
        console.warn("[ScoreSection] load error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [collectionId]);

  // ── Save to score_operacoes ───────────────────────────────────────────────
  const persist = useCallback(async (result: ScoreResult, resps: RespostaCriterio[]) => {
    if (!collectionId || !userId.current) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const payload = {
        collection_id: collectionId,
        cedente_cnpj: null,
        versao_politica: result.versao_politica,
        score_result: result,
        respostas: resps,
        preenchido_por: userId.current,
        preenchido_em: now,
      };

      if (scoreId) {
        await supabase.from("score_operacoes").update(payload).eq("id", scoreId);
      } else {
        const { data } = await supabase
          .from("score_operacoes")
          .insert(payload)
          .select("id")
          .single();
        if (data?.id) setScoreId(data.id);
      }
      setSavedAt(now);
    } catch (err) {
      console.warn("[ScoreSection] save error:", err);
    } finally {
      setSaving(false);
    }
  }, [collectionId, scoreId]);

  // ── Autosave debounced ────────────────────────────────────────────────────
  const handleScoreCalculated = useCallback((result: ScoreResult, resps: RespostaCriterio[]) => {
    setScoreResult(result);
    setRespostas(resps);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => persist(result, resps), 2000);
  }, [persist]);

  // ── Render ────────────────────────────────────────────────────────────────
  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, cursor: "pointer", padding: "18px 20px",
    background: "transparent", border: "none", width: "100%", textAlign: "left",
  };

  const ratingFaixa = scoreResult && policy
    ? policy.faixas_rating.find(f => f.rating === scoreResult.rating)
    : null;

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
      marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.04)", overflow: "hidden",
    }}>
      {/* Header */}
      <button style={sectionHeaderStyle} onClick={() => setCollapsed(v => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #1a2f6b, #203b88)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BarChart3 size={15} style={{ color: "#a8d96b" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Score de Crédito
              </p>
              <span style={{
                fontSize: 9, fontWeight: 800, color: "#d97706",
                background: "#fffbeb", border: "1px solid #fbbf24",
                borderRadius: 4, padding: "1px 5px",
              }}>V2</span>
              {scoreResult && ratingFaixa && (
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: ratingFaixa.cor,
                  background: `${ratingFaixa.cor}18`,
                  border: `1px solid ${ratingFaixa.cor}44`,
                  borderRadius: 6, padding: "2px 8px",
                }}>
                  {scoreResult.score_final.toFixed(0)} pts · Rating {scoreResult.rating}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {scoreResult
                ? `Preenchido${savedAt ? ` · ${new Date(savedAt).toLocaleString("pt-BR")}` : ""}${saving ? " · salvando..." : " · salvo"}`
                : "Preencha o score estruturado pela Política V2"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "#9ca3af" }} />}
          {collapsed ? <ChevronDown size={16} style={{ color: "#9ca3af" }} /> : <ChevronUp size={16} style={{ color: "#9ca3af" }} />}
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "20px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 80 }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
            </div>
          ) : !policy ? null : (
            <>
              {noPolicy && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  background: "#eff6ff", border: "1px solid #93c5fd",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                }}>
                  <Settings size={15} style={{ color: "#2563eb", marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", margin: "0 0 2px" }}>
                      Usando política padrão V2
                    </p>
                    <p style={{ fontSize: 11, color: "#3b82f6", margin: 0 }}>
                      Nenhuma configuração salva encontrada. Configure os parâmetros em{" "}
                      <a href="/configuracoes" target="_blank" style={{ fontWeight: 700, color: "#2563eb" }}>
                        Configurações → Política de Crédito V2
                      </a>
                      {" "}para personalizar os pesos e critérios.
                    </p>
                  </div>
                </div>
              )}

              {/* Toggle form ↔ summary */}
              {scoreResult && (
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                  <button
                    onClick={() => setViewMode("summary")}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", fontSize: 12, fontWeight: viewMode === "summary" ? 700 : 500,
                      color: viewMode === "summary" ? "#203b88" : "#6b7280",
                      background: viewMode === "summary" ? "#f0f4ff" : "white",
                      border: `1px solid ${viewMode === "summary" ? "#c7d2fe" : "#e5e7eb"}`,
                      borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    <BarChart3 size={12} /> Resumo
                  </button>
                  <button
                    onClick={() => setViewMode("form")}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", fontSize: 12, fontWeight: viewMode === "form" ? 700 : 500,
                      color: viewMode === "form" ? "#203b88" : "#6b7280",
                      background: viewMode === "form" ? "#f0f4ff" : "white",
                      border: `1px solid ${viewMode === "form" ? "#c7d2fe" : "#e5e7eb"}`,
                      borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    <PenLine size={12} /> Editar / Preencher
                  </button>
                </div>
              )}

              {viewMode === "summary" && scoreResult ? (
                <ScoreSummaryCard
                  score={scoreResult}
                  config={policy}
                  preenchidoEm={savedAt ?? undefined}
                  preenchidoPor={preenchidoPor ?? undefined}
                />
              ) : (
                <ScoreForm
                  config={policy}
                  initialRespostas={respostas}
                  onScoreCalculated={handleScoreCalculated}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
