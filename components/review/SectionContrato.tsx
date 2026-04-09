"use client";
import { ScrollText, Plus, Trash2, AlertTriangle } from "lucide-react";
import { ContratoSocialData, Socio } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult } from "./shared";

interface Props {
  data: ContratoSocialData;
  set: (k: keyof ContratoSocialData, v: string | boolean) => void;
  setSocio: (i: number, k: keyof Socio, v: string) => void;
  addSocio: () => void;
  removeSocio: (i: number) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionContrato({ data, set, setSocio, addSocio, removeSocio, expanded, onToggle, quality }: Props) {
  return (
    <SectionCard number="03" icon={<ScrollText size={16} className="text-cf-green" />} title="Contrato Social"
      iconColor="bg-cf-green/10" expanded={expanded} onToggle={onToggle}
      badge={data.temAlteracoes ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-warning bg-cf-warning-bg px-2 py-0.5 rounded-full border border-cf-warning/20"><AlertTriangle size={10} /> Alterações</span> : undefined}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Sócios no Contrato</span>
            <button onClick={addSocio} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
              <Plus size={12} /> Adicionar
            </button>
          </div>
          <div className="rounded-xl border border-cf-border overflow-hidden">
            <div className="hidden sm:block">
              <div className="grid grid-cols-[1fr_140px_120px_70px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Nome","CPF","Qualificação","Part.",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.socios.map((s, i) => (
                <div key={i} className={`grid grid-cols-[1fr_140px_120px_70px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={s.nome} onChange={e => setSocio(i,"nome",e.target.value)} placeholder="Nome" className="input-field py-1.5 text-xs" />
                  <input value={s.cpf} onChange={e => setSocio(i,"cpf",e.target.value)} placeholder="000.000.000-00" className="input-field py-1.5 text-xs" />
                  <input value={s.qualificacao} onChange={e => setSocio(i,"qualificacao",e.target.value)} placeholder="Qualificação" className="input-field py-1.5 text-xs" />
                  <input value={s.participacao} onChange={e => setSocio(i,"participacao",e.target.value)} placeholder="50%" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeSocio(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <div className="sm:hidden divide-y divide-cf-border">
              {data.socios.map((s, i) => (
                <div key={i} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cf-text-3 uppercase">Sócio {i + 1}</span>
                    <button onClick={() => removeSocio(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg"><Trash2 size={12} /></button>
                  </div>
                  <input value={s.nome} onChange={e => setSocio(i,"nome",e.target.value)} placeholder="Nome" className="input-field py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={s.cpf} onChange={e => setSocio(i,"cpf",e.target.value)} placeholder="CPF" className="input-field py-2 text-sm" />
                    <input value={s.qualificacao} onChange={e => setSocio(i,"qualificacao",e.target.value)} placeholder="Qualificação" className="input-field py-2 text-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Capital Social" value={data.capitalSocial} onChange={v => set("capitalSocial", v)} />
          <Field label="Data de Constituição" value={data.dataConstituicao} onChange={v => set("dataConstituicao", v)} />
          <Field label="Prazo de Duração" value={data.prazoDuracao} onChange={v => set("prazoDuracao", v)} />
          <Field label="Foro" value={data.foro} onChange={v => set("foro", v)} />
          <Field label="Objeto Social" value={data.objetoSocial} onChange={v => set("objetoSocial", v)} multiline span2 />
          <Field label="Administração e Poderes" value={data.administracao} onChange={v => set("administracao", v)} multiline span2 />
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none group">
          <input type="checkbox" checked={data.temAlteracoes} onChange={e => set("temAlteracoes", e.target.checked)} className="w-4 h-4 rounded accent-yellow-500 cursor-pointer" />
          <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-cf-warning" /> Alterações societárias recentes
          </span>
        </label>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}
