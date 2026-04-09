"use client";
import { TrendingUp, Plus, Trash2, AlertCircle, AlertTriangle } from "lucide-react";
import { FaturamentoData, FaturamentoMensal } from "@/types";
import { QualityBadge, SectionCard, QualityResult } from "./shared";

interface Props {
  data: FaturamentoData;
  setMes: (i: number, k: keyof FaturamentoMensal, v: string) => void;
  addMes: () => void;
  removeMes: (i: number) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionFaturamento({ data, setMes, addMes, removeMes, expanded, onToggle, quality }: Props) {
  return (
    <SectionCard number="04" icon={<TrendingUp size={16} className="text-emerald-600" />} title="Faturamento"
      iconColor="bg-emerald-100" expanded={expanded} onToggle={onToggle}
      badge={<>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${quality.score === "good" ? "bg-green-100 text-green-700" : quality.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{quality.pct}%</span>
        {data.faturamentoZerado
          ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertCircle size={10} /> Zerado</span>
          : !data.dadosAtualizados
            ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-warning bg-cf-warning-bg px-2 py-0.5 rounded-full border border-cf-warning/20"><AlertTriangle size={10} /> Desatualizado</span>
            : null}
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">FMM 12M (R$)</p>
            <p className="text-[15px] font-bold text-cf-navy mt-1">{data.fmm12m ? `R$ ${data.fmm12m}` : data.mediaAno ? `R$ ${data.mediaAno}` : "—"}</p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">Base de crédito</p>
          </div>
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">FMM Médio (R$)</p>
            <p className="text-[15px] font-bold text-cf-navy mt-1">{data.fmmMedio ? `R$ ${data.fmmMedio}` : "—"}</p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">Média anos completos</p>
          </div>
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Tendência</p>
            <p className={`text-[15px] font-bold mt-1 ${data.tendencia === "crescimento" ? "text-green-600" : data.tendencia === "queda" ? "text-red-600" : "text-cf-text-2"}`}>
              {data.tendencia === "crescimento" ? "↑ Crescimento" : data.tendencia === "queda" ? "↓ Queda" : data.tendencia === "estavel" ? "→ Estável" : "—"}
            </p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">vs. FMM 12M</p>
          </div>
          <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
            <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Último Mês</p>
            <p className="text-[15px] font-bold text-cf-navy mt-1">{data.ultimoMesComDados || "—"}</p>
            <p className="text-[10px] text-cf-text-4 mt-0.5">Com dados</p>
          </div>
        </div>
        {data.fmmAnual && Object.keys(data.fmmAnual).length > 0 && (
          <div className="bg-cf-surface/60 rounded-lg px-3 py-2 border border-cf-border text-xs text-cf-text-2 flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(data.fmmAnual).sort(([a], [b]) => Number(a) - Number(b)).map(([ano, val]) => {
              const qtd = (data.meses || []).filter(m => (m.mes || "").endsWith(`/${ano}`)).length;
              return <span key={ano}><span className="font-semibold text-cf-navy">FMM {ano}:</span> R$ {val} <span className="text-cf-text-4">({qtd} {qtd === 1 ? "mês" : "meses"})</span></span>;
            })}
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Faturamento Mensal</span>
            <button onClick={addMes} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
              <Plus size={12} /> Adicionar mês
            </button>
          </div>
          {data.meses.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="grid grid-cols-[120px_1fr_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Mês","Valor (R$)",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.meses.map((m, i) => (
                <div key={i} className={`grid grid-cols-[120px_1fr_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={m.mes} onChange={e => setMes(i,"mes",e.target.value)} placeholder="MM/YYYY" className="input-field py-1.5 text-xs" />
                  <input value={m.valor} onChange={e => setMes(i,"valor",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeMes(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">
              Nenhum dado de faturamento extraído. Clique em &ldquo;Adicionar mês&rdquo; para inserir manualmente.
            </div>
          )}
        </div>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}
