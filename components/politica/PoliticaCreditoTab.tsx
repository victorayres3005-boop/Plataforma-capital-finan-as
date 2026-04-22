"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Save, Loader2, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ConfiguracaoPolitica } from "@/types/politica-credito";
import { DEFAULT_POLITICA_V2 } from "@/lib/politica-credito/defaults";
import { validarPolitica, validarPesosPilares, somarPesos } from "@/lib/politica-credito/validators";
import { PolicyVersionBanner } from "./PolicyVersionBanner";
import { ElegibilidadeTab } from "./ElegibilidadeTab";
import { PesosTab } from "./PesosTab";
import { CriteriosTab } from "./CriteriosTab";
import { RatingTab } from "./RatingTab";
import { AlertasTab } from "./AlertasTab";

const TABS = [
  { id: "elegibilidade", label: "Elegibilidade" },
  { id: "pesos",         label: "Pesos dos Pilares" },
  { id: "criterios",     label: "Critérios" },
  { id: "rating",        label: "Rating" },
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
          setConfig({
            id: data.id,
            user_id: data.user_id,
            versao: data.versao ?? "V2",
            status: data.status ?? "rascunho",
            parametros_elegibilidade: data.parametros_elegibilidade ?? DEFAULT_POLITICA_V2.parametros_elegibilidade,
            pesos_pilares: data.pesos_pilares ?? DEFAULT_POLITICA_V2.pesos_pilares,
            pilares: data.pilares ?? DEFAULT_POLITICA_V2.pilares,
            faixas_rating: data.faixas_rating ?? DEFAULT_POLITICA_V2.faixas_rating,
            alertas: data.alertas ?? DEFAULT_POLITICA_V2.alertas,
            criado_em: data.criado_em,
            atualizado_em: data.atualizado_em,
          });
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
