"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, RotateCcw, Plus, Trash2, Check, ChevronRight, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { FundSettings, FundPreset, DEFAULT_FUND_SETTINGS, PRESET_COLORS, PRESET_TEMPLATES } from "@/types";

function Logo() {
  return (
    <svg width="160" height="22" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#203b88" />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill="#203b88">capital</tspan><tspan fill="#73b815">finanças</tspan>
      </text>
    </svg>
  );
}

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
  return (
    <div>
      <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "3px", letterSpacing: "0.01em" }}>{label}</label>
      <p style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "8px", lineHeight: 1.4 }}>{description}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          step={step}
          min={min}
          max={max}
          style={{
            flex: 1, height: "36px", border: "1px solid #E5E7EB", borderRadius: "8px",
            padding: "0 10px", fontSize: "13px", fontWeight: 600, color: "#111827",
            outline: "none", background: "white",
          }}
        />
        {suffix && <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600, flexShrink: 0, minWidth: "40px" }}>{suffix}</span>}
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

export default function ConfiguracoesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

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
          setSelectedId(toSelect.id);
          setEditing({ ...toSelect });
          setIsNew(false);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  const set = (key: keyof FundSettings, value: number) => setEditing(prev => ({ ...prev, [key]: value }));

  const handleSelect = (p: FundPreset) => {
    setSelectedId(p.id);
    setEditing({ ...p });
    setIsNew(false);
    setShowTemplates(false);
  };

  const handleNew = (template?: Omit<FundPreset, "id" | "user_id">) => {
    setSelectedId(null);
    setIsNew(true);
    setEditing({
      name: template?.name ?? "Novo Perfil",
      description: template?.description ?? "",
      color: template?.color ?? PRESET_COLORS[0],
      ...(template ? presetToSettings(template) : DEFAULT_FUND_SETTINGS),
    });
    setShowTemplates(false);
  };

  const handleSave = async () => {
    const err = validate(editing as FundSettings);
    if (err) { toast.error(err); return; }
    if (!editing.name?.trim()) { toast.error("Dê um nome ao perfil."); return; }
    if (!user) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        user_id: user.id,
        name: editing.name,
        description: editing.description || undefined,
        color: editing.color || PRESET_COLORS[0],
        fmm_minimo: editing.fmm_minimo, idade_minima_anos: editing.idade_minima_anos,
        alavancagem_saudavel: editing.alavancagem_saudavel, alavancagem_maxima: editing.alavancagem_maxima,
        prazo_maximo_aprovado: editing.prazo_maximo_aprovado, prazo_maximo_condicional: editing.prazo_maximo_condicional,
        concentracao_max_sacado: editing.concentracao_max_sacado, fator_limite_base: editing.fator_limite_base,
        revisao_aprovado_dias: editing.revisao_aprovado_dias, revisao_condicional_dias: editing.revisao_condicional_dias,
        protestos_max: editing.protestos_max, processos_passivos_max: editing.processos_passivos_max,
        scr_vencidos_max_pct: editing.scr_vencidos_max_pct,
        updated_at: new Date().toISOString(),
      };
      if (isNew) {
        const { data, error } = await supabase.from("fund_presets").insert(payload).select().single();
        if (error) throw error;
        setPresets(prev => [...prev, data]);
        setSelectedId(data.id);
        setEditing({ ...data });
        setIsNew(false);
        toast.success("Perfil criado!");
      } else {
        const { error } = await supabase.from("fund_presets").update(payload).eq("id", selectedId!).eq("user_id", user!.id);
        if (error) throw error;
        setPresets(prev => prev.map(p => p.id === selectedId ? { ...p, ...payload, id: p.id, description: payload.description ?? undefined } : p));
        setEditing(prev => ({ ...prev, ...payload, description: payload.description ?? undefined }));
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
        user_id: user.id,
        active_preset_id: selectedId,
        fmm_minimo: editing.fmm_minimo, idade_minima_anos: editing.idade_minima_anos,
        alavancagem_saudavel: editing.alavancagem_saudavel, alavancagem_maxima: editing.alavancagem_maxima,
        prazo_maximo_aprovado: editing.prazo_maximo_aprovado, prazo_maximo_condicional: editing.prazo_maximo_condicional,
        concentracao_max_sacado: editing.concentracao_max_sacado, fator_limite_base: editing.fator_limite_base,
        revisao_aprovado_dias: editing.revisao_aprovado_dias, revisao_condicional_dias: editing.revisao_condicional_dias,
        protestos_max: editing.protestos_max, processos_passivos_max: editing.processos_passivos_max,
        scr_vencidos_max_pct: editing.scr_vencidos_max_pct,
        updated_at: new Date().toISOString(),
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
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB" }}><Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} /></div>;
  }
  if (!user) { router.push("/login"); return null; }

  const isActive = !isNew && selectedId === activePresetId;
  const hasPresets = presets.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <header style={{ background: "white", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 3px rgba(32,59,136,0.06)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center" }}><Logo /></Link>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#203b88", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.1em" }}>Política do Fundo</span>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: "1200px", margin: "0 auto", width: "100%", padding: "28px 24px" }}>
        {/* Back link */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#6b7280", textDecoration: "none", marginBottom: "20px" }}>
          <ArrowLeft size={13} /> Voltar ao painel
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "24px", alignItems: "start" }}>

          {/* ─── Left sidebar: preset list ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Perfis configurados</p>
              <span style={{ fontSize: "11px", color: "#9ca3af" }}>{presets.length}</span>
            </div>

            {!hasPresets && !isNew && (
              <div style={{ padding: "20px", background: "white", borderRadius: "12px", border: "1px solid #E5E7EB", textAlign: "center" }}>
                <p style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.5 }}>Nenhum perfil criado ainda. Comece por um template abaixo.</p>
              </div>
            )}

            {presets.map(p => (
              <button key={p.id} onClick={() => handleSelect(p)} style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px",
                background: selectedId === p.id && !isNew ? "white" : "rgba(255,255,255,0.5)",
                border: selectedId === p.id && !isNew ? `1.5px solid ${p.color}` : "1px solid #E5E7EB",
                borderRadius: "10px", cursor: "pointer", width: "100%", textAlign: "left",
                boxShadow: selectedId === p.id && !isNew ? `0 0 0 3px ${p.color}18` : "none",
                transition: "all 0.15s",
              }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                    {p.id === activePresetId && (
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "1px 5px", borderRadius: "4px", flexShrink: 0, letterSpacing: "0.04em" }}>ATIVO</span>
                    )}
                  </div>
                  {p.description && <p style={{ fontSize: "10px", color: "#9ca3af", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</p>}
                </div>
                {selectedId === p.id && !isNew && <ChevronRight size={14} style={{ color: p.color, flexShrink: 0 }} />}
              </button>
            ))}

            {isNew && (
              <div style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px",
                background: "white", border: `1.5px solid ${editing.color || PRESET_COLORS[0]}`,
                borderRadius: "10px", boxShadow: `0 0 0 3px ${editing.color || PRESET_COLORS[0]}18`,
              }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: editing.color || PRESET_COLORS[0], flexShrink: 0 }} />
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#111827", flex: 1 }}>{editing.name || "Novo Perfil"} <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 400 }}>(novo)</span></p>
              </div>
            )}

            {/* Templates */}
            <div style={{ marginTop: "8px" }}>
              <button onClick={() => setShowTemplates(v => !v)} style={{
                display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "10px 14px",
                background: showTemplates ? "#EDF2FB" : "transparent", border: "1px dashed #D1DCF0",
                borderRadius: "10px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "#203b88",
              }}>
                <Zap size={13} /> Templates prontos
              </button>
              {showTemplates && (
                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {PRESET_TEMPLATES.map(t => (
                    <button key={t.name} onClick={() => handleNew(t)} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
                      background: "white", border: "1px solid #E5E7EB", borderRadius: "8px",
                      cursor: "pointer", textAlign: "left", width: "100%",
                    }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: "12px", fontWeight: 600, color: "#111827" }}>{t.name}</p>
                        <p style={{ fontSize: "10px", color: "#9ca3af" }}>{t.description}</p>
                      </div>
                    </button>
                  ))}
                  <button onClick={() => handleNew()} style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
                    background: "white", border: "1px solid #E5E7EB", borderRadius: "8px",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}>
                    <Plus size={13} style={{ color: "#6b7280" }} />
                    <div>
                      <p style={{ fontSize: "12px", fontWeight: 600, color: "#111827" }}>Em branco</p>
                      <p style={{ fontSize: "10px", color: "#9ca3af" }}>Começar do zero</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ─── Right panel: editor ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* No selection state */}
            {!selectedId && !isNew && (
              <div style={{ padding: "48px 24px", background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", textAlign: "center" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#F0F4FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Zap size={24} style={{ color: "#203b88" }} />
                </div>
                <p style={{ fontSize: "15px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Selecione ou crie um perfil</p>
                <p style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>Cada perfil define um conjunto de critérios de elegibilidade que será aplicado na análise e nos relatórios.</p>
              </div>
            )}

            {(selectedId || isNew) && (
              <>
                {/* Preset identity */}
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px" }}>
                    {isNew ? "Novo perfil" : "Identificação do perfil"}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "6px" }}>Nome</label>
                      <input
                        value={editing.name || ""}
                        onChange={e => setEditing(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Ex: FIDC Conservador"
                        style={{ width: "100%", height: "36px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "0 10px", fontSize: "13px", fontWeight: 600, color: "#111827", outline: "none", background: "white", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "6px" }}>Descrição (opcional)</label>
                      <input
                        value={editing.description || ""}
                        onChange={e => setEditing(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Ex: Para cedentes industriais"
                        style={{ width: "100%", height: "36px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "0 10px", fontSize: "13px", color: "#111827", outline: "none", background: "white", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", display: "block", marginBottom: "8px" }}>Cor do perfil</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => setEditing(prev => ({ ...prev, color: c }))} style={{
                          width: "26px", height: "26px", borderRadius: "50%", background: c,
                          border: editing.color === c ? "3px solid #111827" : "2px solid transparent",
                          cursor: "pointer", outline: "none", boxShadow: editing.color === c ? "0 0 0 2px white inset" : "none",
                          transition: "all 0.1s",
                        }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Grupo 1 — Pré-requisitos */}
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <div style={{ width: "4px", height: "32px", borderRadius: "99px", background: "#203b88" }} />
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Pré-requisitos Mínimos</p>
                      <p style={{ fontSize: "11px", color: "#9ca3af" }}>Critérios eliminatórios — reprovação automática se não atender</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <SettingField label="FMM Mínimo" description="Faturamento médio mensal mínimo para elegibilidade" value={editing.fmm_minimo} onChange={v => set("fmm_minimo", v)} suffix="R$" step={10000} min={0} />
                    <SettingField label="Idade Mínima" description="Tempo mínimo de operação da empresa" value={editing.idade_minima_anos} onChange={v => set("idade_minima_anos", v)} suffix="anos" step={0.5} min={0} />
                  </div>
                </div>

                {/* Grupo 2 — Alavancagem */}
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <div style={{ width: "4px", height: "32px", borderRadius: "99px", background: "#d97706" }} />
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Limites de Alavancagem</p>
                      <p style={{ fontSize: "11px", color: "#9ca3af" }}>Dívida total SCR ÷ FMM — quanto menor, mais saudável</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <SettingField label="Alavancagem Saudável" description="Até esse valor = aprovado sem ressalvas" value={editing.alavancagem_saudavel} onChange={v => set("alavancagem_saudavel", v)} suffix="x FMM" step={0.1} min={0} />
                    <SettingField label="Alavancagem Máxima" description="Acima = reprovado automaticamente" value={editing.alavancagem_maxima} onChange={v => set("alavancagem_maxima", v)} suffix="x FMM" step={0.1} min={0} />
                  </div>
                </div>

                {/* Grupo 3 — Operacionais */}
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <div style={{ width: "4px", height: "32px", borderRadius: "99px", background: "#73b815" }} />
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Parâmetros Operacionais</p>
                      <p style={{ fontSize: "11px", color: "#9ca3af" }}>Prazos, concentração e limites de operação</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                    <SettingField label="Prazo Máx. Aprovado" description="Prazo máximo para operação aprovada" value={editing.prazo_maximo_aprovado} onChange={v => set("prazo_maximo_aprovado", v)} suffix="dias" min={1} />
                    <SettingField label="Prazo Máx. Condicional" description="Prazo para aprovação condicional" value={editing.prazo_maximo_condicional} onChange={v => set("prazo_maximo_condicional", v)} suffix="dias" min={1} />
                    <SettingField label="Concentração Máx. Sacado" description="Máximo por sacado no total" value={editing.concentracao_max_sacado} onChange={v => set("concentracao_max_sacado", v)} suffix="%" step={1} min={1} max={100} />
                  </div>
                </div>

                {/* Grupo 4 — Limite e Revisão */}
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <div style={{ width: "4px", height: "32px", borderRadius: "99px", background: "#7c3aed" }} />
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Limite de Crédito e Revisão</p>
                      <p style={{ fontSize: "11px", color: "#9ca3af" }}>Cálculo do limite sugerido e períodos de revisão</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                    <SettingField label="Fator Base do Limite" description="Limite sugerido = FMM × este fator" value={editing.fator_limite_base} onChange={v => set("fator_limite_base", v)} suffix="x FMM" step={0.1} min={0.1} />
                    <SettingField label="Revisão Aprovado" description="Prazo para revisar empresa aprovada" value={editing.revisao_aprovado_dias} onChange={v => set("revisao_aprovado_dias", v)} suffix="dias" min={1} />
                    <SettingField label="Revisão Condicional" description="Prazo para revisar aprovação condicional" value={editing.revisao_condicional_dias} onChange={v => set("revisao_condicional_dias", v)} suffix="dias" min={1} />
                  </div>
                </div>

                {/* Grupo 5 — Restrições */}
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <div style={{ width: "4px", height: "32px", borderRadius: "99px", background: "#dc2626" }} />
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Restrições Adicionais</p>
                      <p style={{ fontSize: "11px", color: "#9ca3af" }}>Limites eliminatórios para bureau e SCR</p>
                    </div>
                  </div>
                  <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", background: "#fef2f2", border: "1px solid #fecaca" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Critérios fixos (não configuráveis)</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {["CCF — Cheques sem fundo > 0 ocorrências", "Recuperação Judicial / Falência ativa"].map(t => (
                        <span key={t} style={{ fontSize: "10px", fontWeight: 600, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "4px", padding: "2px 8px" }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                    <SettingField label="Protestos Máximos" description="Número máximo de protestos vigentes" value={editing.protestos_max} onChange={v => set("protestos_max", v)} suffix="protestos" step={1} min={0} />
                    <SettingField label="Processos Passivos Máx." description="Número máximo de processos passivos" value={editing.processos_passivos_max} onChange={v => set("processos_passivos_max", v)} suffix="processos" step={1} min={0} />
                    <SettingField label="SCR Vencidos Máx." description="% máxima de dívidas vencidas no SCR" value={editing.scr_vencidos_max_pct} onChange={v => set("scr_vencidos_max_pct", v)} suffix="% do total" step={1} min={0} max={100} />
                  </div>
                </div>

                {/* Action bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "white", borderRadius: "12px", border: "1px solid #E5E7EB" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {!isNew && (
                      <button onClick={handleSetActive} disabled={activating || isActive} style={{
                        display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px",
                        background: isActive ? "#dcfce7" : "#203b88", color: isActive ? "#16a34a" : "white",
                        border: isActive ? "1px solid #bbf7d0" : "none",
                        borderRadius: "8px", fontSize: "12px", fontWeight: 700,
                        cursor: isActive ? "default" : "pointer", transition: "all 0.15s",
                      }}>
                        {activating ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
                        {isActive ? "Perfil Ativo" : "Definir como Ativo"}
                      </button>
                    )}
                    <button onClick={() => { setEditing(prev => ({ ...prev, ...DEFAULT_FUND_SETTINGS })); }} style={{
                      display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px",
                      background: "transparent", border: "1px solid #E5E7EB", borderRadius: "8px",
                      fontSize: "12px", fontWeight: 600, color: "#6b7280", cursor: "pointer",
                    }}>
                      <RotateCcw size={12} /> Resetar valores
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {!isNew && (
                      <button onClick={handleDelete} disabled={deleting} style={{
                        display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px",
                        background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px",
                        fontSize: "12px", fontWeight: 600, color: "#dc2626", cursor: "pointer",
                      }}>
                        {deleting ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />} Excluir
                      </button>
                    )}
                    <button onClick={handleSave} disabled={saving} style={{
                      display: "flex", alignItems: "center", gap: "6px", padding: "8px 20px",
                      background: "#73b815", color: "white", border: "none", borderRadius: "8px",
                      fontSize: "12px", fontWeight: 700, cursor: "pointer",
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
      </main>

      <footer style={{ background: "#192f5d", marginTop: "32px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo />
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>&copy; {new Date().getFullYear()} Capital Finanças</p>
        </div>
      </footer>
    </div>
  );
}
