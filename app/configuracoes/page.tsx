"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, RotateCcw, Plus, Trash2, Check, ChevronRight, Zap, Shield, TrendingUp, Clock, AlertOctagon, SlidersHorizontal, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { FundSettings, FundPreset, DEFAULT_FUND_SETTINGS, PRESET_COLORS, PRESET_TEMPLATES } from "@/types";
import { PoliticaCreditoTab } from "@/components/politica/PoliticaCreditoTab";

interface FieldProps {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
}

function SettingField({ label, description, value, onChange, suffix, step = 1, min = 0, max }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "3px", letterSpacing: "0.03em" }}>{label}</label>
      <p style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "8px", lineHeight: 1.4 }}>{description}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          step={step}
          min={min}
          max={max}
          style={{
            flex: 1, height: "38px", border: focused ? "1.5px solid #203b88" : "1px solid #e5e7eb",
            borderRadius: "8px", padding: "0 12px", fontSize: "13px", fontWeight: 600, color: "#111827",
            outline: "none", background: focused ? "#fafbff" : "white",
            transition: "all 0.15s", boxShadow: focused ? "0 0 0 3px rgba(32,59,136,0.08)" : "none",
          }}
        />
        {suffix && <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600, flexShrink: 0, minWidth: "44px" }}>{suffix}</span>}
      </div>
    </div>
  );
}

function presetToSettings(p: FundPreset | Omit<FundPreset, "id" | "user_id">): FundSettings {
  return {
    fmm_minimo: p.fmm_minimo, idade_minima_anos: p.idade_minima_anos,
    alavancagem_saudavel: p.alavancagem_saudavel, alavancagem_maxima: p.alavancagem_maxima,
    prazo_maximo_aprovado: p.prazo_maximo_aprovado, prazo_maximo_condicional: p.prazo_maximo_condicional,
    concentracao_max_sacado: p.concentracao_max_sacado, fator_limite_base: p.fator_limite_base,
    revisao_aprovado_dias: p.revisao_aprovado_dias, revisao_condicional_dias: p.revisao_condicional_dias,
    protestos_max: p.protestos_max, processos_passivos_max: p.processos_passivos_max,
    scr_vencidos_max_pct: p.scr_vencidos_max_pct,
  };
}

function validate(s: FundSettings): string | null {
  if (s.fmm_minimo <= 0) return "FMM mínimo deve ser maior que zero.";
  if (s.idade_minima_anos < 0) return "Idade mínima não pode ser negativa.";
  if (s.alavancagem_saudavel >= s.alavancagem_maxima) return "Alavancagem saudável deve ser menor que a máxima.";
  if (s.alavancagem_maxima <= 0) return "Alavancagem máxima deve ser maior que zero.";
  if (s.prazo_maximo_condicional > s.prazo_maximo_aprovado) return "Prazo condicional deve ser ≤ prazo aprovado.";
  return null;
}

const SECTION_ICONS = [Shield, TrendingUp, SlidersHorizontal, Clock, AlertOctagon];
const SECTION_COLORS = ["#203b88", "#d97706", "#73b815", "#7c3aed", "#dc2626"];
const SECTION_BG = ["#f0f4ff", "#fffbeb", "#f0fdf4", "#faf5ff", "#fef2f2"];

export default function ConfiguracoesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [pageTab, setPageTab] = useState<"parametros" | "politica">("parametros");
  const [presets, setPresets] = useState<FundPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<FundPreset> & FundSettings>({ ...DEFAULT_FUND_SETTINGS, name: "", description: "", color: PRESET_COLORS[0] });
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextDirty = useRef(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      try {
        const supabase = createClient();
        const [{ data: presetsData }, { data: settingsData }] = await Promise.all([
          supabase.from("fund_presets").select("*").eq("user_id", user.id).order("created_at"),
          supabase.from("fund_settings").select("active_preset_id").eq("user_id", user.id).maybeSingle(),
        ]);
        const loaded: FundPreset[] = presetsData || [];
        setPresets(loaded);
        const aid = settingsData?.active_preset_id || null;
        setActivePresetId(aid);
        const toSelect = aid ? loaded.find(p => p.id === aid) : loaded[0];
        if (toSelect) {
          skipNextDirty.current = true;
          setSelectedId(toSelect.id);
          setEditing({ ...toSelect });
          setIsNew(false);
          setIsDirty(false);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  const set = (key: keyof FundSettings, value: number) => setEditing(prev => ({ ...prev, [key]: value }));

  const handleSelect = (p: FundPreset) => {
    skipNextDirty.current = true;
    setSelectedId(p.id);
    setEditing({ ...p });
    setIsNew(false);
    setIsDirty(false);
    setShowTemplates(false);
  };

  const handleNew = (template?: Omit<FundPreset, "id" | "user_id">) => {
    skipNextDirty.current = true;
    setSelectedId(null);
    setIsNew(true);
    setEditing({
      name: template?.name ?? "Novo Perfil",
      description: template?.description ?? "",
      color: template?.color ?? PRESET_COLORS[0],
      ...(template ? presetToSettings(template) : DEFAULT_FUND_SETTINGS),
    });
    setIsDirty(false);
    setShowTemplates(false);
  };

  useEffect(() => {
    if (skipNextDirty.current) { skipNextDirty.current = false; return; }
    setIsDirty(true);
    setAutoSaveStatus("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (!isDirty || isNew || !selectedId || !user) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const err = validate(editing as FundSettings);
      if (err || !editing.name?.trim()) { setAutoSaveStatus("error"); return; }
      setAutoSaveStatus("saving");
      try {
        const supabase = createClient();
        const payload = {
          user_id: user.id, name: editing.name, description: editing.description || undefined,
          color: editing.color || PRESET_COLORS[0],
          fmm_minimo: editing.fmm_minimo, idade_minima_anos: editing.idade_minima_anos,
          alavancagem_saudavel: editing.alavancagem_saudavel, alavancagem_maxima: editing.alavancagem_maxima,
          prazo_maximo_aprovado: editing.prazo_maximo_aprovado, prazo_maximo_condicional: editing.prazo_maximo_condicional,
          concentracao_max_sacado: editing.concentracao_max_sacado, fator_limite_base: editing.fator_limite_base,
          revisao_aprovado_dias: editing.revisao_aprovado_dias, revisao_condicional_dias: editing.revisao_condicional_dias,
          protestos_max: editing.protestos_max, processos_passivos_max: editing.processos_passivos_max,
          scr_vencidos_max_pct: editing.scr_vencidos_max_pct, updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("fund_presets").update(payload).eq("id", selectedId).eq("user_id", user.id);
        if (error) throw error;
        setPresets(prev => prev.map(p => p.id === selectedId ? { ...p, ...payload, id: p.id, description: payload.description ?? undefined } : p));
        setIsDirty(false);
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus(s => s === "saved" ? "idle" : s), 2000);
      } catch (e) {
        console.warn("[configuracoes] autosave falhou:", e instanceof Error ? e.message : e);
        setAutoSaveStatus("error");
      }
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, isDirty, isNew, selectedId, user]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "Voce tem alteracoes nao salvas. Sair mesmo assim?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleSave = async () => {
    const err = validate(editing as FundSettings);
    if (err) { toast.error(err); return; }
    if (!editing.name?.trim()) { toast.error("Dê um nome ao perfil."); return; }
    if (!user) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        user_id: user.id, name: editing.name, description: editing.description || undefined,
        color: editing.color || PRESET_COLORS[0],
        fmm_minimo: editing.fmm_minimo, idade_minima_anos: editing.idade_minima_anos,
        alavancagem_saudavel: editing.alavancagem_saudavel, alavancagem_maxima: editing.alavancagem_maxima,
        prazo_maximo_aprovado: editing.prazo_maximo_aprovado, prazo_maximo_condicional: editing.prazo_maximo_condicional,
        concentracao_max_sacado: editing.concentracao_max_sacado, fator_limite_base: editing.fator_limite_base,
        revisao_aprovado_dias: editing.revisao_aprovado_dias, revisao_condicional_dias: editing.revisao_condicional_dias,
        protestos_max: editing.protestos_max, processos_passivos_max: editing.processos_passivos_max,
        scr_vencidos_max_pct: editing.scr_vencidos_max_pct, updated_at: new Date().toISOString(),
      };
      if (isNew) {
        const { data, error } = await supabase.from("fund_presets").insert(payload).select().single();
        if (error) throw error;
        setPresets(prev => [...prev, data]);
        setSelectedId(data.id);
        skipNextDirty.current = true;
        setEditing({ ...data });
        setIsNew(false);
        setIsDirty(false);
        toast.success("Perfil criado!");
      } else {
        const { error } = await supabase.from("fund_presets").update(payload).eq("id", selectedId!).eq("user_id", user!.id);
        if (error) throw error;
        setPresets(prev => prev.map(p => p.id === selectedId ? { ...p, ...payload, id: p.id, description: payload.description ?? undefined } : p));
        skipNextDirty.current = true;
        setEditing(prev => ({ ...prev, ...payload, description: payload.description ?? undefined }));
        setIsDirty(false);
        toast.success("Perfil salvo!");
      }
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Tente novamente"));
    } finally { setSaving(false); }
  };

  const handleSetActive = async () => {
    if (!selectedId || isNew || !user) return;
    setActivating(true);
    try {
      const supabase = createClient();
      const upsertPayload = {
        user_id: user.id, active_preset_id: selectedId,
        fmm_minimo: editing.fmm_minimo, idade_minima_anos: editing.idade_minima_anos,
        alavancagem_saudavel: editing.alavancagem_saudavel, alavancagem_maxima: editing.alavancagem_maxima,
        prazo_maximo_aprovado: editing.prazo_maximo_aprovado, prazo_maximo_condicional: editing.prazo_maximo_condicional,
        concentracao_max_sacado: editing.concentracao_max_sacado, fator_limite_base: editing.fator_limite_base,
        revisao_aprovado_dias: editing.revisao_aprovado_dias, revisao_condicional_dias: editing.revisao_condicional_dias,
        protestos_max: editing.protestos_max, processos_passivos_max: editing.processos_passivos_max,
        scr_vencidos_max_pct: editing.scr_vencidos_max_pct, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("fund_settings").upsert(upsertPayload, { onConflict: "user_id" });
      if (error) throw error;
      setActivePresetId(selectedId);
      toast.success(`"${editing.name}" agora é o perfil ativo!`);
    } catch (err) {
      toast.error("Erro: " + (err instanceof Error ? err.message : "Tente novamente"));
    } finally { setActivating(false); }
  };

  const handleDelete = async () => {
    if (!selectedId || isNew) return;
    if (!confirm(`Excluir o perfil "${editing.name}"?`)) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("fund_presets").delete().eq("id", selectedId).eq("user_id", user!.id);
      if (error) throw error;
      const updated = presets.filter(p => p.id !== selectedId);
      setPresets(updated);
      if (activePresetId === selectedId) setActivePresetId(null);
      if (updated.length > 0) { handleSelect(updated[0]); }
      else { setSelectedId(null); setIsNew(false); setEditing({ ...DEFAULT_FUND_SETTINGS, name: "", description: "", color: PRESET_COLORS[0] }); }
      toast.success("Perfil excluído.");
    } catch { toast.error("Erro ao excluir."); }
    finally { setDeleting(false); }
  };

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
      </div>
    );
  }
  if (!user) { router.push("/login"); return null; }

  const isActive = !isNew && selectedId === activePresetId;
  const hasPresets = presets.length > 0;
  const accentColor = editing.color || PRESET_COLORS[0];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", display: "flex", flexDirection: "column" }}>

      {/* ── Hero header ── */}
      <div style={{ background: "linear-gradient(135deg, #1a2f6b 0%, #203b88 60%, #1e3a8a 100%)", padding: "32px 32px 28px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(168,217,107,0.15)", border: "1px solid rgba(168,217,107,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <SlidersHorizontal size={22} style={{ color: "#a8d96b" }} />
              </div>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.3px" }}>Política de Fundo</h1>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "3px 0 0" }}>
                  Configure os critérios de elegibilidade aplicados nas análises de crédito
                </p>
              </div>
            </div>
            <button
              onClick={() => handleNew()}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
                background: "#a8d96b", color: "#1a2f6b", border: "none", borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
            >
              <Plus size={15} /> Novo Perfil
            </button>
          </div>

          {/* Page tab switcher */}
          <div style={{ display: "flex", gap: 4, marginTop: 22 }}>
            {([
              { id: "parametros", label: "Parâmetros do Fundo", icon: SlidersHorizontal },
              { id: "politica",   label: "Política de Crédito V2", icon: FileText },
            ] as const).map(tab => {
              const active = pageTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setPageTab(tab.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 16px", fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? "#ffffff" : "rgba(255,255,255,0.55)",
                    background: active ? "rgba(255,255,255,0.18)" : "transparent",
                    border: active ? "1px solid rgba(255,255,255,0.25)" : "1px solid transparent",
                    borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <Icon size={13} />
                  {tab.label}
                  {tab.id === "politica" && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 4, padding: "1px 5px" }}>
                      V2
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Stats strip */}
          <div style={{ display: "flex", gap: 24, marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>{presets.length}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>Perfis criados</p>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "#a8d96b", margin: 0 }}>{activePresetId ? "1" : "0"}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>Perfil ativo</p>
            </div>
            {activePresetId && (
              <>
                <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: presets.find(p => p.id === activePresetId)?.color || "#a8d96b" }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", margin: 0 }}>
                    {presets.find(p => p.id === activePresetId)?.name}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <main style={{ flex: 1, maxWidth: "1200px", margin: "0 auto", width: "100%", padding: "28px 32px", boxSizing: "border-box" }}>

        {/* ─── Aba: Política de Crédito V2 ─── */}
        {pageTab === "politica" && user && (
          <PoliticaCreditoTab userId={user.id} />
        )}

        {/* ─── Aba: Parâmetros do Fundo ─── */}
        {pageTab === "parametros" && (
        <div style={{ display: "grid", gridTemplateColumns: "272px 1fr", gap: "24px", alignItems: "start" }}>

          {/* ─── Left sidebar: preset list ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", position: "sticky", top: "24px" }}>

            <p style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px", paddingLeft: "2px" }}>
              Perfis · {presets.length}
            </p>

            {!hasPresets && !isNew && (
              <div style={{ padding: "20px 16px", background: "white", borderRadius: "12px", border: "1px dashed #e2e8f0", textAlign: "center" }}>
                <p style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>Nenhum perfil ainda. Use &quot;Novo Perfil&quot; para começar.</p>
              </div>
            )}

            {presets.map(p => {
              const sel = selectedId === p.id && !isNew;
              return (
                <button key={p.id} onClick={() => handleSelect(p)} style={{
                  display: "flex", alignItems: "center", gap: "12px", padding: "13px 14px",
                  background: sel ? "white" : "rgba(255,255,255,0.7)",
                  border: sel ? `1.5px solid ${p.color}` : "1px solid #e8edf5",
                  borderRadius: "12px", cursor: "pointer", width: "100%", textAlign: "left",
                  boxShadow: sel ? `0 2px 12px ${p.color}22, 0 0 0 3px ${p.color}12` : "0 1px 3px rgba(0,0,0,0.04)",
                  transition: "all 0.18s",
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${p.color}18`, border: `1px solid ${p.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{p.name}</p>
                      {p.id === activePresetId && (
                        <span style={{ fontSize: "9px", fontWeight: 800, color: "#16a34a", background: "#dcfce7", padding: "2px 6px", borderRadius: "4px", flexShrink: 0, letterSpacing: "0.05em" }}>ATIVO</span>
                      )}
                    </div>
                    {p.description && <p style={{ fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{p.description}</p>}
                  </div>
                  {sel && <ChevronRight size={14} style={{ color: p.color, flexShrink: 0 }} />}
                </button>
              );
            })}

            {isNew && (
              <div style={{
                display: "flex", alignItems: "center", gap: "12px", padding: "13px 14px",
                background: "white", border: `1.5px solid ${accentColor}`,
                borderRadius: "12px", boxShadow: `0 2px 12px ${accentColor}22`,
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `${accentColor}18`, border: `1px solid ${accentColor}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: accentColor }} />
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", margin: 0 }}>{editing.name || "Novo Perfil"}</p>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>novo · não salvo</p>
                </div>
              </div>
            )}

            {/* Templates */}
            <div style={{ marginTop: "10px" }}>
              <button onClick={() => setShowTemplates(v => !v)} style={{
                display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "10px 14px",
                background: showTemplates ? "#EDF2FB" : "rgba(255,255,255,0.8)",
                border: showTemplates ? "1px solid #c7d7f5" : "1px dashed #d1dcf0",
                borderRadius: "10px", cursor: "pointer", fontSize: "12px", fontWeight: 700, color: "#203b88",
                transition: "all 0.15s",
              }}>
                <Zap size={13} style={{ color: "#a8d96b" }} /> Templates prontos
              </button>
              {showTemplates && (
                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {PRESET_TEMPLATES.map(t => (
                    <button key={t.name} onClick={() => handleNew(t)} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
                      background: "white", border: "1px solid #e8edf5", borderRadius: "8px",
                      cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.12s",
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: "12px", fontWeight: 600, color: "#111827", margin: 0 }}>{t.name}</p>
                        <p style={{ fontSize: "10px", color: "#9ca3af", margin: "1px 0 0" }}>{t.description}</p>
                      </div>
                    </button>
                  ))}
                  <button onClick={() => handleNew()} style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
                    background: "white", border: "1px solid #e8edf5", borderRadius: "8px",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}>
                    <Plus size={13} style={{ color: "#6b7280" }} />
                    <div>
                      <p style={{ fontSize: "12px", fontWeight: 600, color: "#111827", margin: 0 }}>Em branco</p>
                      <p style={{ fontSize: "10px", color: "#9ca3af", margin: "1px 0 0" }}>Começar do zero</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ─── Right panel: editor ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* No selection */}
            {!selectedId && !isNew && (
              <div style={{ padding: "64px 24px", background: "white", borderRadius: "20px", border: "1px solid #e8edf5", textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 56, height: 56, borderRadius: "16px", background: "linear-gradient(135deg, #f0f4ff, #e8edf5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                  <SlidersHorizontal size={26} style={{ color: "#203b88" }} />
                </div>
                <p style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>Selecione um perfil</p>
                <p style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
                  Cada perfil define um conjunto de critérios de elegibilidade aplicado nas análises e relatórios.
                </p>
                <button onClick={() => handleNew()} style={{
                  marginTop: "24px", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px",
                  background: "linear-gradient(135deg, #1a2f6b, #203b88)", color: "white", border: "none",
                  borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                  <Plus size={14} /> Criar primeiro perfil
                </button>
              </div>
            )}

            {(selectedId || isNew) && (
              <>
                {/* Identity card */}
                <div style={{ background: "white", borderRadius: "18px", border: "1px solid #e8edf5", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }} />
                  <div style={{ padding: "22px 24px" }}>
                    <p style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "18px" }}>
                      {isNew ? "Novo perfil" : "Identificação"}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "6px" }}>Nome do perfil</label>
                        <input
                          value={editing.name || ""}
                          onChange={e => setEditing(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Ex: FIDC Conservador"
                          style={{ width: "100%", height: "38px", border: "1px solid #e5e7eb", borderRadius: "9px", padding: "0 12px", fontSize: "13px", fontWeight: 600, color: "#111827", outline: "none", background: "white", boxSizing: "border-box", transition: "all 0.15s" }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "6px" }}>Descrição <span style={{ fontWeight: 400, color: "#9ca3af" }}>(opcional)</span></label>
                        <input
                          value={editing.description || ""}
                          onChange={e => setEditing(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Ex: Para cedentes industriais"
                          style={{ width: "100%", height: "38px", border: "1px solid #e5e7eb", borderRadius: "9px", padding: "0 12px", fontSize: "13px", color: "#111827", outline: "none", background: "white", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "10px" }}>Cor do perfil</label>
                      <div style={{ display: "flex", gap: "10px" }}>
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => setEditing(prev => ({ ...prev, color: c }))} title={c} style={{
                            width: 28, height: 28, borderRadius: "50%", background: c,
                            border: editing.color === c ? "3px solid #0f172a" : "2px solid transparent",
                            cursor: "pointer", outline: "none",
                            boxShadow: editing.color === c ? "0 0 0 2px white inset, 0 2px 6px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.12)",
                            transition: "all 0.12s",
                          }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section groups */}
                {([
                  {
                    icon: SECTION_ICONS[0], color: SECTION_COLORS[0], bg: SECTION_BG[0],
                    title: "Pré-requisitos Mínimos",
                    subtitle: "Critérios eliminatórios — reprovação automática se não atender",
                    cols: 2,
                    fields: [
                      { key: "fmm_minimo" as keyof FundSettings, label: "FMM Mínimo", description: "Faturamento médio mensal mínimo", suffix: "R$", step: 10000, min: 0 },
                      { key: "idade_minima_anos" as keyof FundSettings, label: "Idade Mínima", description: "Tempo mínimo de operação da empresa", suffix: "anos", step: 0.5, min: 0 },
                    ],
                  },
                  {
                    icon: SECTION_ICONS[1], color: SECTION_COLORS[1], bg: SECTION_BG[1],
                    title: "Limites de Alavancagem",
                    subtitle: "Dívida total SCR ÷ FMM — quanto menor, mais saudável",
                    cols: 2,
                    fields: [
                      { key: "alavancagem_saudavel" as keyof FundSettings, label: "Alavancagem Saudável", description: "Até esse valor = aprovado sem ressalvas", suffix: "x FMM", step: 0.1, min: 0 },
                      { key: "alavancagem_maxima" as keyof FundSettings, label: "Alavancagem Máxima", description: "Acima = reprovado automaticamente", suffix: "x FMM", step: 0.1, min: 0 },
                    ],
                  },
                  {
                    icon: SECTION_ICONS[2], color: SECTION_COLORS[2], bg: SECTION_BG[2],
                    title: "Parâmetros Operacionais",
                    subtitle: "Prazos, concentração e limites de operação",
                    cols: 3,
                    fields: [
                      { key: "prazo_maximo_aprovado" as keyof FundSettings, label: "Prazo Máx. Aprovado", description: "Prazo máximo para operação aprovada", suffix: "dias", min: 1 },
                      { key: "prazo_maximo_condicional" as keyof FundSettings, label: "Prazo Máx. Condicional", description: "Prazo para aprovação condicional", suffix: "dias", min: 1 },
                      { key: "concentracao_max_sacado" as keyof FundSettings, label: "Concentração Máx. Sacado", description: "Máximo por sacado no total", suffix: "%", step: 1, min: 1, max: 100 },
                    ],
                  },
                  {
                    icon: SECTION_ICONS[3], color: SECTION_COLORS[3], bg: SECTION_BG[3],
                    title: "Limite de Crédito e Revisão",
                    subtitle: "Cálculo do limite sugerido e períodos de revisão",
                    cols: 3,
                    fields: [
                      { key: "fator_limite_base" as keyof FundSettings, label: "Fator Base do Limite", description: "Limite sugerido = FMM × este fator", suffix: "x FMM", step: 0.1, min: 0.1 },
                      { key: "revisao_aprovado_dias" as keyof FundSettings, label: "Revisão Aprovado", description: "Prazo para revisar empresa aprovada", suffix: "dias", min: 1 },
                      { key: "revisao_condicional_dias" as keyof FundSettings, label: "Revisão Condicional", description: "Prazo para revisar aprovação condicional", suffix: "dias", min: 1 },
                    ],
                  },
                ] as const).map((section, i) => {
                  const Icon = section.icon;
                  return (
                    <div key={i} style={{ background: "white", borderRadius: "18px", border: "1px solid #e8edf5", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                      <div style={{ padding: "20px 24px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 11, background: section.bg, border: `1px solid ${section.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Icon size={18} style={{ color: section.color }} />
                          </div>
                          <div>
                            <p style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{section.title}</p>
                            <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>{section.subtitle}</p>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${section.cols}, 1fr)`, gap: "16px", paddingBottom: "24px" }}>
                          {section.fields.map(f => (
                            <SettingField
                              key={f.key}
                              label={f.label}
                              description={f.description}
                              value={editing[f.key] as number}
                              onChange={v => set(f.key, v)}
                              suffix={f.suffix}
                              step={"step" in f ? f.step : 1}
                              min={"min" in f ? f.min : 0}
                              max={"max" in f ? f.max : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Restrições section */}
                <div style={{ background: "white", borderRadius: "18px", border: "1px solid #e8edf5", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                  <div style={{ padding: "20px 24px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: "#fef2f2", border: "1px solid #dc262622", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <AlertOctagon size={18} style={{ color: "#dc2626" }} />
                      </div>
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", margin: 0 }}>Restrições Adicionais</p>
                        <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>Limites eliminatórios para bureau e SCR</p>
                      </div>
                    </div>
                    <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", background: "#fef2f2", border: "1px solid #fecaca" }}>
                      <p style={{ fontSize: "10px", fontWeight: 800, color: "#dc2626", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Critérios fixos — não configuráveis</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {["CCF — Cheques sem fundo > 0 ocorrências", "Recuperação Judicial / Falência ativa"].map(t => (
                          <span key={t} style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "5px", padding: "3px 9px" }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", paddingBottom: "24px" }}>
                      <SettingField label="Protestos Máximos" description="Número máximo de protestos vigentes" value={editing.protestos_max} onChange={v => set("protestos_max", v)} suffix="protestos" step={1} min={0} />
                      <SettingField label="Processos Passivos Máx." description="Número máximo de processos passivos" value={editing.processos_passivos_max} onChange={v => set("processos_passivos_max", v)} suffix="processos" step={1} min={0} />
                      <SettingField label="SCR Vencidos Máx." description="% máxima de dívidas vencidas no SCR" value={editing.scr_vencidos_max_pct} onChange={v => set("scr_vencidos_max_pct", v)} suffix="% do total" step={1} min={0} max={100} />
                    </div>
                  </div>
                </div>

                {/* Action bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "white", borderRadius: "14px", border: "1px solid #e8edf5", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {!isNew && (
                      <button onClick={handleSetActive} disabled={activating || isActive} style={{
                        display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px",
                        background: isActive ? "#f0fdf4" : "linear-gradient(135deg, #1a2f6b, #203b88)",
                        color: isActive ? "#16a34a" : "white",
                        border: isActive ? "1px solid #bbf7d0" : "none",
                        borderRadius: "9px", fontSize: "12px", fontWeight: 700,
                        cursor: isActive ? "default" : "pointer", transition: "all 0.15s",
                        boxShadow: isActive ? "none" : "0 2px 8px rgba(32,59,136,0.3)",
                      }}>
                        {activating ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
                        {isActive ? "Perfil Ativo" : "Definir como Ativo"}
                      </button>
                    )}
                    <button onClick={() => setEditing(prev => ({ ...prev, ...DEFAULT_FUND_SETTINGS }))} style={{
                      display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px",
                      background: "transparent", border: "1px solid #e2e8f0", borderRadius: "9px",
                      fontSize: "12px", fontWeight: 600, color: "#64748b", cursor: "pointer",
                    }}>
                      <RotateCcw size={12} /> Resetar valores
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {!isNew && (
                      <button onClick={handleDelete} disabled={deleting} style={{
                        display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px",
                        background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "9px",
                        fontSize: "12px", fontWeight: 600, color: "#dc2626", cursor: "pointer",
                      }}>
                        {deleting ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />} Excluir
                      </button>
                    )}
                    <button onClick={handleSave} disabled={saving} style={{
                      display: "flex", alignItems: "center", gap: "7px", padding: "9px 22px",
                      background: "linear-gradient(135deg, #73b815, #5e9a0e)", color: "white", border: "none", borderRadius: "9px",
                      fontSize: "12px", fontWeight: 700, cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(115,184,21,0.35)",
                    }}>
                      {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
                      {isNew ? "Criar Perfil" : "Salvar Alterações"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
