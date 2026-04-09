"use client";
import { BarChart3, Plus, Trash2 } from "lucide-react";
import { SCRData, SCRModalidade, SCRInstituicao } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult } from "./shared";

interface Props {
  data: SCRData;
  anterior?: SCRData;
  set: (k: keyof SCRData, v: string) => void;
  setMod: (i: number, k: keyof SCRModalidade, v: string) => void;
  addMod: () => void;
  removeMod: (i: number) => void;
  setInst: (i: number, k: keyof SCRInstituicao, v: string) => void;
  addInst: () => void;
  removeInst: (i: number) => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionSCR({ data, anterior, set, setMod, addMod, removeMod, setInst, addInst, removeInst, showDetails, setShowDetails, expanded, onToggle, quality }: Props) {
  const parse = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;

  return (
    <SectionCard number="05" icon={<BarChart3 size={16} className="text-cf-warning" />} title="SCR / Bacen — Perfil de Crédito"
      iconColor="bg-cf-warning/10" expanded={expanded} onToggle={onToggle}
      badge={<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${quality.score === "good" ? "bg-green-100 text-green-700" : quality.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{quality.pct}%</span>}>
      <div className="space-y-5">
        {data.semHistorico && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <span className="text-blue-500 mt-0.5">ℹ</span>
            <div>
              <p className="text-sm font-semibold text-blue-700">Sem operações registradas no SCR</p>
              <p className="text-xs text-blue-500 mt-0.5">Empresa sem dívida bancária ativa — campos zerados abaixo para confirmação</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Período de Referência" value={data.periodoReferencia} onChange={v => set("periodoReferencia", v)} />
        </div>
        <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-cf-navy hover:text-cf-navy/70 flex items-center gap-1 transition-colors" style={{ minHeight: "auto" }}>
          {showDetails ? "▲ Ocultar" : "▼ Ver"} detalhes (vencimentos, evolucao, modalidades)
        </button>
        {showDetails && (
          <div className="space-y-4 animate-fade-in">
            {anterior && (
              <div>
                <p className="text-[11px] font-medium text-cf-text-4 uppercase tracking-wider mb-2">Evolucao SCR — {anterior.periodoReferencia || "Anterior"} x {data.periodoReferencia || "Atual"}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-cf-bg"><th className="text-left py-2 px-3 text-cf-text-3 font-medium">Metrica</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Anterior</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Atual</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Var.</th></tr></thead>
                    <tbody>{([
                      { label: "Em Dia", ant: anterior.carteiraAVencer, at: data.carteiraAVencer, positiveIsGood: true, bold: false },
                      { label: "Total Divida", ant: anterior.totalDividasAtivas, at: data.totalDividasAtivas, positiveIsGood: false, bold: true },
                      { label: "Vencida", ant: anterior.vencidos, at: data.vencidos, positiveIsGood: false, bold: false },
                      { label: "Prejuizo", ant: anterior.prejuizos, at: data.prejuizos, positiveIsGood: false, bold: false },
                      { label: "Limite", ant: anterior.limiteCredito, at: data.limiteCredito, positiveIsGood: true, bold: false },
                      { label: "IFs", ant: anterior.qtdeInstituicoes, at: data.qtdeInstituicoes, positiveIsGood: true, bold: false },
                    ] as { label: string; ant: string; at: string; positiveIsGood: boolean; bold: boolean }[]).map((m, i) => {
                      const d1 = parse(m.ant); const d2 = parse(m.at); const diff = d2 - d1;
                      const pct = d1 > 0 ? ((diff / d1) * 100).toFixed(1) : null;
                      const varStr = diff === 0 ? "=" : pct ? `${diff > 0 ? "+" : ""}${pct}%` : "—";
                      const isGood = diff === 0 ? null : (diff > 0 && m.positiveIsGood) || (diff < 0 && !m.positiveIsGood);
                      const varColor = diff === 0 ? "text-cf-text-4" : isGood ? "text-green-600" : "text-red-600";
                      return (<tr key={i} className={`border-b border-cf-border/30 ${m.bold ? "font-semibold bg-cf-bg" : ""}`}><td className="py-1.5 px-3 text-cf-text-2">{m.label}</td><td className="py-1.5 px-3 text-right text-cf-text-3" style={{ fontVariantNumeric: "tabular-nums" }}>{m.ant || "—"}</td><td className="py-1.5 px-3 text-right text-cf-text-1 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{m.at || "—"}</td><td className={`py-1.5 px-3 text-right font-medium ${varColor}`} style={{ fontVariantNumeric: "tabular-nums" }}>{varStr}</td></tr>);
                    })}</tbody>
                  </table>
                </div>
              </div>
            )}
            {data.faixasAVencer && (
              <div>
                <p className="text-[11px] font-medium text-cf-text-4 uppercase tracking-wider mb-2">Vencimentos por Prazo</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-cf-bg"><th className="text-left py-2 px-3 text-cf-text-3 font-medium">Faixa</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Valor (R$)</th></tr></thead>
                    <tbody>
                      {[
                        { label: "Ate 30 dias", value: data.faixasAVencer.ate30d },
                        { label: "31 a 60 dias", value: data.faixasAVencer.d31_60 },
                        { label: "61 a 90 dias", value: data.faixasAVencer.d61_90 },
                        { label: "91 a 180 dias", value: data.faixasAVencer.d91_180 },
                        { label: "181 a 360 dias", value: data.faixasAVencer.d181_360 },
                        { label: "Acima de 360 dias", value: data.faixasAVencer.acima360d },
                      ].filter(r => r.value && r.value !== "0" && r.value !== "0,00").map((r, i) => (
                        <tr key={i} className="border-b border-cf-border/30"><td className="py-2 px-3 text-cf-text-2">{r.label}</td><td className="py-2 px-3 text-right font-medium text-cf-text-1" style={{ fontVariantNumeric: "tabular-nums" }}>{r.value}</td></tr>
                      ))}
                      <tr className="bg-cf-bg font-semibold"><td className="py-2 px-3 text-cf-text-1">Total</td><td className="py-2 px-3 text-right text-cf-text-1" style={{ fontVariantNumeric: "tabular-nums" }}>{data.faixasAVencer.total || data.carteiraAVencer || "—"}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        <div className={data.semHistorico ? "opacity-50" : ""}>
          <span className="section-label block mb-2">Resumo</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Carteira a Vencer (R$)" value={data.carteiraAVencer} onChange={v => set("carteiraAVencer", v)} />
            <Field label="Vencidos (R$)" value={data.vencidos} onChange={v => set("vencidos", v)} />
            <Field label="Prejuízos (R$)" value={data.prejuizos} onChange={v => set("prejuizos", v)} />
            <Field label="Limite de Crédito (R$)" value={data.limiteCredito} onChange={v => set("limiteCredito", v)} />
            <Field label="Qtde Instituições" value={data.qtdeInstituicoes} onChange={v => set("qtdeInstituicoes", v)} />
            <Field label="Qtde Operações" value={data.qtdeOperacoes} onChange={v => set("qtdeOperacoes", v)} />
          </div>
        </div>
        <div className={data.semHistorico ? "opacity-50" : ""}>
          <span className="section-label block mb-2">Detalhamento</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Total Dívidas Ativas (R$)" value={data.totalDividasAtivas} onChange={v => set("totalDividasAtivas", v)} />
            <Field label="Classificação de Risco (A-H)" value={data.classificacaoRisco} onChange={v => set("classificacaoRisco", v)} />
            <Field label="Operações a Vencer (R$)" value={data.operacoesAVencer} onChange={v => set("operacoesAVencer", v)} />
            <Field label="Operações em Atraso (R$)" value={data.operacoesEmAtraso} onChange={v => set("operacoesEmAtraso", v)} />
            <Field label="Curto Prazo - CP (R$)" value={data.carteiraCurtoPrazo} onChange={v => set("carteiraCurtoPrazo", v)} />
            <Field label="Longo Prazo - LP (R$)" value={data.carteiraLongoPrazo} onChange={v => set("carteiraLongoPrazo", v)} />
            <Field label="Histórico de Inadimplência" value={data.historicoInadimplencia} onChange={v => set("historicoInadimplencia", v)} multiline span2 />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Modalidades de Crédito</span>
            <button onClick={addMod} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors"><Plus size={12} /> Adicionar</button>
          </div>
          {data.modalidades.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_100px_100px_100px_70px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Modalidade","Total","A Vencer","Vencido","Part.",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.modalidades.map((m, i) => (
                <div key={i} className={`hidden sm:grid grid-cols-[1fr_100px_100px_100px_70px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={m.nome} onChange={e => setMod(i,"nome",e.target.value)} placeholder="Capital de giro..." className="input-field py-1.5 text-xs" />
                  <input value={m.total} onChange={e => setMod(i,"total",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={m.aVencer} onChange={e => setMod(i,"aVencer",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={m.vencido} onChange={e => setMod(i,"vencido",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <input value={m.participacao} onChange={e => setMod(i,"participacao",e.target.value)} placeholder="0%" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeMod(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhuma modalidade extraída.</div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Instituições Financeiras</span>
            <button onClick={addInst} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors"><Plus size={12} /> Adicionar</button>
          </div>
          {data.instituicoes.length > 0 ? (
            <div className="rounded-xl border border-cf-border overflow-hidden">
              <div className="grid grid-cols-[1fr_140px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Instituição","Valor (R$)",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.instituicoes.map((inst, i) => (
                <div key={i} className={`grid grid-cols-[1fr_140px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={inst.nome} onChange={e => setInst(i,"nome",e.target.value)} placeholder="Nome do banco" className="input-field py-1.5 text-xs" />
                  <input value={inst.valor} onChange={e => setInst(i,"valor",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeInst(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhuma instituição extraída.</div>
          )}
        </div>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}
