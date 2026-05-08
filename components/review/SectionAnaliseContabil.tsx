"use client";
import { Calculator } from "lucide-react";
import { Field, SectionCard } from "./shared";

interface Props {
  value: string;
  onChange: (v: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Seção dedicada para a Análise Contábil que a equipe contábil (Vanessa)
 * preenche cobrindo balanço, DRE, faturamento e endividamento. Aparece na
 * Síntese Preliminar (pág 3) — bloco abaixo da Sugestão do Analista.
 *
 * Texto livre — sem auto-preencher, sem extração via IA, sem estrutura
 * forçada (decisão produto: dar flexibilidade total à analista contábil).
 */
export function SectionAnaliseContabil({ value, onChange, expanded, onToggle }: Props) {
  const trimmed = (value ?? "").trim();
  const badge = trimmed.length > 0
    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-navy bg-cf-surface px-2 py-0.5 rounded-full border border-cf-border">{trimmed.length} caracteres</span>
    : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-text-3 bg-cf-bg px-2 py-0.5 rounded-full border border-cf-border">Vazio</span>;

  return (
    <SectionCard
      number="11"
      icon={<Calculator size={16} className="text-blue-600" />}
      title="Análise Contábil — Vanessa"
      iconColor="bg-blue-100"
      expanded={expanded}
      onToggle={onToggle}
      badge={badge}
      accentColor="#2563EB"
    >
      <div className="space-y-3">
        <p className="text-xs text-cf-text-3">
          Análise textual cobrindo balanço, DRE, faturamento e endividamento.
          Texto livre — aparece na Síntese Preliminar (pág 3) e é lido junto da
          Sugestão do Analista no comitê.
        </p>
        <Field
          label="Análise Contábil"
          value={value ?? ""}
          onChange={onChange}
          multiline
          span2
        />
      </div>
    </SectionCard>
  );
}
