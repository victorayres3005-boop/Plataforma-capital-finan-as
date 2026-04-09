"use client";
import { Scale } from "lucide-react";
import { BalancoData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: BalancoData;
  set: (k: string, v: string) => void;
  setAno: (anoIdx: number, k: string, v: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

const BALANCO_CAMPOS = [
  { label: "Ativo Total", campo: "ativoTotal" },
  { label: "Ativo Circulante", campo: "ativoCirculante" },
  { label: "Ativo Não Circulante", campo: "ativoNaoCirculante" },
  { label: "Passivo Total", campo: "passivoTotal" },
  { label: "Passivo Circulante", campo: "passivoCirculante" },
  { label: "Passivo Não Circulante", campo: "passivoNaoCirculante" },
  { label: "Patrimônio Líquido", campo: "patrimonioLiquido" },
  { label: "Liquidez Corrente", campo: "liquidezCorrente" },
  { label: "Endividamento (%)", campo: "endividamentoTotal" },
  { label: "Capital de Giro Líq.", campo: "capitalDeGiroLiquido" },
];

export function SectionBalanco({ data, set, setAno, expanded, onToggle }: Props) {
  return (
    <SectionCard number="07" icon={<Scale size={16} className="text-cyan-600" />} title="Balanço Patrimonial"
      iconColor="bg-cyan-100" expanded={expanded} onToggle={onToggle}>
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
                  {BALANCO_CAMPOS.map((linha, i) => (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="section-label block mb-1.5">Tendência do Patrimônio</label>
            <select value={data.tendenciaPatrimonio} onChange={e => set("tendenciaPatrimonio", e.target.value)} className="input-field">
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
