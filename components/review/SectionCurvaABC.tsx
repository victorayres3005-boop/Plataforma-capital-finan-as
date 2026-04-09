"use client";
import { PieChart, Plus, Trash2, AlertTriangle } from "lucide-react";
import { CurvaABCData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: CurvaABCData;
  setField: (k: string, v: string | number | boolean) => void;
  setCliente: (idx: number, k: string, v: string) => void;
  addCliente: () => void;
  removeCliente: (idx: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionCurvaABC({ data, setField, setCliente, addCliente, removeCliente, expanded, onToggle }: Props) {
  return (
    <SectionCard number="08" icon={<PieChart size={16} className="text-orange-600" />} title="Curva ABC — Carteira de Clientes"
      iconColor="bg-orange-100" expanded={expanded} onToggle={onToggle}
      badge={data.alertaConcentracao ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertTriangle size={10} /> Concentração</span> : undefined}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Período de Referência" value={data.periodoReferencia} onChange={v => setField("periodoReferencia", v)} />
          <Field label="Total Clientes na Base" value={String(data.totalClientesNaBase || "")} onChange={v => setField("totalClientesNaBase", Number(v) || v)} />
          <Field label="Concentração Top 3 (%)" value={data.concentracaoTop3} onChange={v => setField("concentracaoTop3", v)} />
          <Field label="Concentração Top 5 (%)" value={data.concentracaoTop5} onChange={v => setField("concentracaoTop5", v)} />
          <Field label="Maior Cliente" value={data.maiorCliente} onChange={v => setField("maiorCliente", v)} />
          <Field label="Maior Cliente (%)" value={data.maiorClientePct} onChange={v => setField("maiorClientePct", v)} />
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none group">
          <input type="checkbox" checked={data.alertaConcentracao} onChange={e => setField("alertaConcentracao", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
          <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-red-500" /> Alerta de concentração
          </span>
        </label>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Clientes</span>
            <button onClick={addCliente} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
              <Plus size={12} /> Adicionar cliente
            </button>
          </div>
          {data.clientes.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="hidden sm:grid grid-cols-[40px_1fr_100px_100px_80px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["#","Nome","Faturado","% Receita","Segmento",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.clientes.map((c, i) => (
                <div key={i} className={`hidden sm:grid grid-cols-[40px_1fr_100px_100px_80px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <span className="text-xs font-bold text-cf-text-3 text-center">{c.posicao || i + 1}</span>
                  <input value={c.nome} onChange={e => setCliente(i, "nome", e.target.value)} placeholder="Nome do cliente" className="input-field py-1.5 text-xs" />
                  <input value={c.valorFaturado} onChange={e => setCliente(i, "valorFaturado", e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={c.percentualReceita} onChange={e => setCliente(i, "percentualReceita", e.target.value)} placeholder="0%" className="input-field py-1.5 text-xs" />
                  <input value={c.classe} onChange={e => setCliente(i, "classe", e.target.value)} placeholder="A/B/C" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeCliente(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="sm:hidden divide-y divide-cf-border">
                {data.clientes.map((c, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-cf-text-3 uppercase">#{c.posicao || i + 1}</span>
                      <button onClick={() => removeCliente(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg"><Trash2 size={12} /></button>
                    </div>
                    <input value={c.nome} onChange={e => setCliente(i, "nome", e.target.value)} placeholder="Nome" className="input-field py-2 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={c.valorFaturado} onChange={e => setCliente(i, "valorFaturado", e.target.value)} placeholder="Faturado" className="input-field py-2 text-sm" />
                      <input value={c.percentualReceita} onChange={e => setCliente(i, "percentualReceita", e.target.value)} placeholder="% Receita" className="input-field py-2 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhum cliente extraído. Clique em &ldquo;Adicionar cliente&rdquo; para inserir manualmente.</div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
