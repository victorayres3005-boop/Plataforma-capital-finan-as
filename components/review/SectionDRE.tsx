"use client";
import { LineChart } from "lucide-react";
import { DREData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: DREData;
  set: (k: string, v: string) => void;
  setAno: (anoIdx: number, k: string, v: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

const DRE_CAMPOS = [
  { label: "Receita Bruta", campo: "receitaBruta" },
  { label: "Receita Líquida", campo: "receitaLiquida" },
  { label: "Lucro Bruto", campo: "lucroBruto" },
  { label: "Margem Bruta (%)", campo: "margemBruta" },
  { label: "EBITDA", campo: "ebitda" },
  { label: "Margem EBITDA (%)", campo: "margemEbitda" },
  { label: "Lucro Líquido", campo: "lucroLiquido" },
  { label: "Margem Líquida (%)", campo: "margemLiquida" },
];

export function SectionDRE({ data, set, setAno, expanded, onToggle }: Props) {
  return (
    <SectionCard number="06" icon={<LineChart size={16} className="text-violet-600" />} title="DRE — Demonstração de Resultado"
      iconColor="bg-violet-100" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-4">
        {data.anos.length > 0 && (
          <div>
            <span className="section-label block mb-2">Dados por Ano</span>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cf-bg">
                    <th className="text-left py-2 px-3 text-cf-text-3 font-medium">Indicador</th>
                    {data.anos.map(a => <th key={a.ano} className="text-right py-2 px-3 text-cf-text-3 font-medium">{a.ano}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DRE_CAMPOS.map((linha, i) => (
                    <tr key={i} className="border-b border-cf-border/30 hover:bg-cf-bg/50">
                      <td className="py-1.5 px-3 text-cf-text-2 font-medium">{linha.label}</td>
                      {data.anos.map((a, anoIdx) => (
                        <td key={a.ano} className="py-1 px-2">
                          <input
                            value={(a as unknown as Record<string, string>)[linha.campo] || ""}
                            onChange={e => setAno(anoIdx, linha.campo, e.target.value)}
                            className="input-field py-1 text-xs text-right w-full"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Crescimento da Receita (%)" value={data.crescimentoReceita} onChange={v => set("crescimentoReceita", v)} />
          <div>
            <label className="section-label block mb-1.5">Tendência do Lucro</label>
            <select value={data.tendenciaLucro} onChange={e => set("tendenciaLucro", e.target.value)} className="input-field">
              <option value="">—</option>
              <option value="crescimento">Crescimento</option>
              <option value="estavel">Estável</option>
              <option value="queda">Queda</option>
            </select>
          </div>
          <Field label="Período Mais Recente" value={data.periodoMaisRecente} onChange={v => set("periodoMaisRecente", v)} />
        </div>
        <Field label="Observações" value={data.observacoes} onChange={v => set("observacoes", v)} multiline span2 />
      </div>
    </SectionCard>
  );
}
