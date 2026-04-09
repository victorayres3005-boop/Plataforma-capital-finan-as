"use client";
import { Users, Plus, Trash2 } from "lucide-react";
import { QSAData, QSASocio } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult } from "./shared";

interface Props {
  data: QSAData;
  setField: (k: "capitalSocial", v: string) => void;
  setSocio: (i: number, k: keyof QSASocio, v: string) => void;
  addSocio: () => void;
  removeSocio: (i: number) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionQSA({ data, setField, setSocio, addSocio, removeSocio, expanded, onToggle, quality }: Props) {
  return (
    <SectionCard number="02" icon={<Users size={16} className="text-indigo-600" />} title="Quadro de Sócios e Administradores — QSA"
      iconColor="bg-indigo-100" expanded={expanded} onToggle={onToggle}
      badge={<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${quality.score === "good" ? "bg-green-100 text-green-700" : quality.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{quality.pct}%</span>}>
      <div className="space-y-4">
        <Field label="Capital Social" value={data.capitalSocial} onChange={v => setField("capitalSocial", v)} />
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Quadro Societário</span>
            <button onClick={addSocio} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
              <Plus size={12} /> Adicionar
            </button>
          </div>
          <div className="rounded-xl border border-cf-border overflow-hidden">
            <div className="hidden sm:block">
              <div className="grid grid-cols-[1fr_150px_140px_80px_36px] bg-cf-surface px-3 py-2 gap-2">
                {["Nome","CPF/CNPJ","Qualificação","Part.",""].map((h, i) => (
                  <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {data.quadroSocietario.map((s, i) => (
                <div key={i} className={`grid grid-cols-[1fr_150px_140px_80px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                  <input value={s.nome} onChange={e => setSocio(i,"nome",e.target.value)} placeholder="Nome completo" className="input-field py-1.5 text-xs" />
                  <input value={s.cpfCnpj} onChange={e => setSocio(i,"cpfCnpj",e.target.value)} placeholder="000.000.000-00" className="input-field py-1.5 text-xs" />
                  <input value={s.qualificacao} onChange={e => setSocio(i,"qualificacao",e.target.value)} placeholder="Sócio-Admin." className="input-field py-1.5 text-xs" />
                  <input value={s.participacao} onChange={e => setSocio(i,"participacao",e.target.value)} placeholder="50%" className="input-field py-1.5 text-xs" />
                  <button onClick={() => removeSocio(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <div className="sm:hidden divide-y divide-cf-border">
              {data.quadroSocietario.map((s, i) => (
                <div key={i} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cf-text-3 uppercase">Sócio {i + 1}</span>
                    <button onClick={() => removeSocio(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg"><Trash2 size={12} /></button>
                  </div>
                  <input value={s.nome} onChange={e => setSocio(i,"nome",e.target.value)} placeholder="Nome" className="input-field py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={s.cpfCnpj} onChange={e => setSocio(i,"cpfCnpj",e.target.value)} placeholder="CPF/CNPJ" className="input-field py-2 text-sm" />
                    <input value={s.qualificacao} onChange={e => setSocio(i,"qualificacao",e.target.value)} placeholder="Qualificação" className="input-field py-2 text-sm" />
                  </div>
                  <input value={s.participacao} onChange={e => setSocio(i,"participacao",e.target.value)} placeholder="Participação %" className="input-field py-2 text-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}
