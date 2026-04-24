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
