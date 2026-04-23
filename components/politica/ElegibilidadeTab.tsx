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
