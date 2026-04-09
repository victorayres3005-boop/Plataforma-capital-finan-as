"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { FundSettings, DEFAULT_FUND_SETTINGS } from "@/types";

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
      <label className="text-xs font-semibold text-cf-text-2 block mb-1">{label}</label>
      <p className="text-[10px] text-cf-text-4 mb-2">{description}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          step={step}
          min={min}
          max={max}
          className="input-field h-10 w-full"
        />
        {suffix && <span className="text-xs text-cf-text-3 font-medium flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<FundSettings>({ ...DEFAULT_FUND_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("fund_settings")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (data) {
          setSettings({
            ...DEFAULT_FUND_SETTINGS,
            ...data,
            fmm_minimo: Number(data.fmm_minimo),
            idade_minima_anos: Number(data.idade_minima_anos),
            alavancagem_saudavel: Number(data.alavancagem_saudavel),
            alavancagem_maxima: Number(data.alavancagem_maxima),
            prazo_maximo_aprovado: Number(data.prazo_maximo_aprovado),
            prazo_maximo_condicional: Number(data.prazo_maximo_condicional),
            concentracao_max_sacado: Number(data.concentracao_max_sacado),
            fator_limite_base: Number(data.fator_limite_base),
            revisao_aprovado_dias: Number(data.revisao_aprovado_dias),
            revisao_condicional_dias: Number(data.revisao_condicional_dias),
            protestos_max: data.protestos_max != null ? Number(data.protestos_max) : DEFAULT_FUND_SETTINGS.protestos_max,
            processos_passivos_max: data.processos_passivos_max != null ? Number(data.processos_passivos_max) : DEFAULT_FUND_SETTINGS.processos_passivos_max,
            scr_vencidos_max_pct: data.scr_vencidos_max_pct != null ? Number(data.scr_vencidos_max_pct) : DEFAULT_FUND_SETTINGS.scr_vencidos_max_pct,
          });
        }
      } catch { /* usa defaults */ }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  const validate = (): string | null => {
    if (settings.fmm_minimo <= 0) return "FMM minimo deve ser maior que zero.";
    if (settings.idade_minima_anos < 0) return "Idade minima nao pode ser negativa.";
    if (settings.alavancagem_saudavel >= settings.alavancagem_maxima) return "Alavancagem saudavel deve ser menor que a maxima.";
    if (settings.alavancagem_maxima <= 0) return "Alavancagem maxima deve ser maior que zero.";
    if (settings.prazo_maximo_condicional > settings.prazo_maximo_aprovado) return "Prazo condicional deve ser menor ou igual ao prazo aprovado.";
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }
    if (!user) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        user_id: user.id,
        fmm_minimo: settings.fmm_minimo,
        idade_minima_anos: settings.idade_minima_anos,
        alavancagem_saudavel: settings.alavancagem_saudavel,
        alavancagem_maxima: settings.alavancagem_maxima,
        prazo_maximo_aprovado: settings.prazo_maximo_aprovado,
        prazo_maximo_condicional: settings.prazo_maximo_condicional,
        concentracao_max_sacado: settings.concentracao_max_sacado,
        fator_limite_base: settings.fator_limite_base,
        revisao_aprovado_dias: settings.revisao_aprovado_dias,
        revisao_condicional_dias: settings.revisao_condicional_dias,
        protestos_max: settings.protestos_max,
        processos_passivos_max: settings.processos_passivos_max,
        scr_vencidos_max_pct: settings.scr_vencidos_max_pct,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("fund_settings")
        .upsert(payload, { onConflict: "user_id" });

      if (upsertError) throw upsertError;
      toast.success("Configuracoes salvas!");
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_FUND_SETTINGS });
    toast.info("Valores restaurados para os defaults.");
  };

  const set = (key: keyof FundSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cf-bg">
        <Loader2 size={24} className="animate-spin text-cf-navy" />
      </div>
    );
  }

  if (!user) { router.push("/login"); return null; }

  return (
    <div className="min-h-screen bg-cf-bg flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-cf-border sticky top-0 z-50" style={{ boxShadow: "0 1px 3px rgba(32,59,136,0.06)" }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" style={{ minHeight: "auto" }}><Logo /></Link>
          <span className="text-xs font-semibold text-cf-navy/60 uppercase tracking-wider">Configuracoes</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 sm:px-8 py-8 space-y-6">
        <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-navy transition-colors" style={{ minHeight: "auto" }}>
          <ArrowLeft size={13} /> Voltar ao painel
        </Link>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-cf-text-1">Parametros do Fundo</h1>
          <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-cf-text-4 hover:text-cf-navy transition-colors" style={{ minHeight: "auto" }}>
            <RotateCcw size={12} /> Restaurar defaults
          </button>
        </div>

        {/* Grupo 1 — Pré-requisitos */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-8 rounded-full bg-cf-navy" />
            <div>
              <h2 className="text-sm font-bold text-cf-text-1">Pre-requisitos Minimos</h2>
              <p className="text-[11px] text-cf-text-3">Criterios eliminatorios — empresa reprovada automaticamente se nao atender</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SettingField label="FMM Minimo" description="Faturamento medio mensal minimo para elegibilidade" value={settings.fmm_minimo} onChange={v => set("fmm_minimo", v)} suffix="R$" step={10000} min={0} />
            <SettingField label="Idade Minima" description="Tempo minimo de operacao da empresa" value={settings.idade_minima_anos} onChange={v => set("idade_minima_anos", v)} suffix="anos" step={0.5} min={0} />
          </div>
        </div>

        {/* Grupo 2 — Alavancagem */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-8 rounded-full bg-cf-warning" />
            <div>
              <h2 className="text-sm font-bold text-cf-text-1">Limites de Alavancagem</h2>
              <p className="text-[11px] text-cf-text-3">Divida total SCR dividida pelo FMM — quanto menor, mais saudavel</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SettingField label="Alavancagem Saudavel" description="Ate esse valor = aprovado sem ressalvas" value={settings.alavancagem_saudavel} onChange={v => set("alavancagem_saudavel", v)} suffix="x FMM" step={0.1} min={0} />
            <SettingField label="Alavancagem Maxima" description="Acima desse valor = reprovado automaticamente" value={settings.alavancagem_maxima} onChange={v => set("alavancagem_maxima", v)} suffix="x FMM" step={0.1} min={0} />
          </div>
        </div>

        {/* Grupo 3 — Operacionais */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-8 rounded-full bg-cf-green" />
            <div>
              <h2 className="text-sm font-bold text-cf-text-1">Parametros Operacionais</h2>
              <p className="text-[11px] text-cf-text-3">Prazos, concentracao e limites de operacao</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SettingField label="Prazo Maximo Aprovado" description="Prazo maximo para operacao aprovada" value={settings.prazo_maximo_aprovado} onChange={v => set("prazo_maximo_aprovado", v)} suffix="dias" min={1} />
            <SettingField label="Prazo Maximo Condicional" description="Prazo para aprovacao condicional" value={settings.prazo_maximo_condicional} onChange={v => set("prazo_maximo_condicional", v)} suffix="dias" min={1} />
            <SettingField label="Concentracao Max Sacado" description="Maximo por sacado no total" value={settings.concentracao_max_sacado} onChange={v => set("concentracao_max_sacado", v)} suffix="%" step={1} min={1} max={100} />
          </div>
        </div>

        {/* Grupo 4 — Limites */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-8 rounded-full bg-[#8b5cf6]" />
            <div>
              <h2 className="text-sm font-bold text-cf-text-1">Limites de Credito e Revisao</h2>
              <p className="text-[11px] text-cf-text-3">Calculo do limite sugerido e periodos de revisao</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SettingField label="Fator Base do Limite" description="Limite sugerido = FMM x este fator" value={settings.fator_limite_base} onChange={v => set("fator_limite_base", v)} suffix="x FMM" step={0.1} min={0.1} />
            <SettingField label="Revisao Aprovado" description="Prazo para revisar empresa aprovada" value={settings.revisao_aprovado_dias} onChange={v => set("revisao_aprovado_dias", v)} suffix="dias" min={1} />
            <SettingField label="Revisao Condicional" description="Prazo para revisar aprovacao condicional" value={settings.revisao_condicional_dias} onChange={v => set("revisao_condicional_dias", v)} suffix="dias" min={1} />
          </div>
        </div>

        {/* Grupo 5 — Restrições Adicionais */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-8 rounded-full bg-red-500" />
            <div>
              <h2 className="text-sm font-bold text-cf-text-1">Restricoes Adicionais</h2>
              <p className="text-[11px] text-cf-text-3">Limites eliminatorios para bureau de credito e SCR — empresa reprovada automaticamente se ultrapassar</p>
            </div>
          </div>

          {/* Critérios fixos não configuráveis */}
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-[11px] font-semibold text-red-700 mb-1.5">Criterios fixos (nao configuráveis)</p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-red-700 bg-red-100 border border-red-300 rounded px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                CCF — Cheques sem fundos &gt; 0 ocorrencias
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-red-700 bg-red-100 border border-red-300 rounded px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Recuperacao Judicial / Falencia ativa
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SettingField
              label="Protestos Maximos"
              description="Numero maximo de protestos vigentes permitidos"
              value={settings.protestos_max}
              onChange={v => set("protestos_max", v)}
              suffix="protestos"
              step={1}
              min={0}
            />
            <SettingField
              label="Processos Passivos Max"
              description="Numero maximo de processos passivos permitidos"
              value={settings.processos_passivos_max}
              onChange={v => set("processos_passivos_max", v)}
              suffix="processos"
              step={1}
              min={0}
            />
            <SettingField
              label="SCR Vencidos Max"
              description="Percentual maximo de dividas vencidas no SCR"
              value={settings.scr_vencidos_max_pct}
              onChange={v => set("scr_vencidos_max_pct", v)}
              suffix="% do total"
              step={1}
              min={0}
              max={100}
            />
          </div>
        </div>

        {/* Botão Salvar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/" className="btn-secondary text-sm">Cancelar</Link>
          <button onClick={handleSave} disabled={saving} className="btn-green text-sm px-8">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Salvar Configuracoes</>}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-cf-dark mt-8">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-6 flex items-center justify-between">
          <Logo />
          <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Capital Financas</p>
        </div>
      </footer>
    </div>
  );
}
