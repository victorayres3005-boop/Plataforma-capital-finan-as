"use client";
import { FileKey, Plus, Trash2 } from "lucide-react";
import { IRSocioData } from "@/types";
import { Field, SectionCard } from "./shared";

const IR_VAZIO: Omit<IRSocioData, "impostoDefinido" | "valorQuota"> = {
  nomeSocio: "", cpf: "", anoBase: "", tipoDocumento: "recibo", numeroRecibo: "", dataEntrega: "",
  situacaoMalhas: false, debitosEmAberto: false, descricaoDebitos: "",
  rendimentosTributaveis: "", rendimentosIsentos: "", rendimentoTotal: "",
  bensImoveis: "", bensVeiculos: "", aplicacoesFinanceiras: "", outrosBens: "",
  totalBensDireitos: "", dividasOnus: "", patrimonioLiquido: "",
  impostoPago: "", impostoRestituir: "", temSociedades: false, sociedades: [],
  coerenciaComEmpresa: true, observacoes: "",
};

interface Props {
  data: IRSocioData[];
  set: (idx: number, k: keyof IRSocioData, v: string | boolean) => void;
  add: () => void;
  remove: (idx: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionIRSocios({ data, set, add, remove, expanded, onToggle }: Props) {
  return (
    <SectionCard number="09" icon={<FileKey size={16} className="text-teal-600" />} title="IR dos Sócios"
      iconColor="bg-teal-100" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-6">
        {data.length === 0 && (
          <p className="text-xs text-cf-text-3 text-center py-3">Nenhum IR de sócio carregado. Adicione manualmente abaixo.</p>
        )}
        <button onClick={add} className="btn-secondary w-full flex items-center justify-center gap-2 text-xs py-2">
          <Plus size={13} /> Adicionar Sócio
        </button>
        {data.map((socio, idx) => (
          <div key={idx} className="border border-cf-border rounded-xl overflow-hidden">
            <div className="bg-cf-surface px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-cf-text-1 uppercase tracking-wide">{socio.nomeSocio || `Sócio ${idx + 1}`}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-cf-text-3">Ano-base: {socio.anoBase || "—"}</span>
                <button onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome do Sócio" value={socio.nomeSocio} onChange={v => set(idx, "nomeSocio", v)} />
              <Field label="CPF" value={socio.cpf} onChange={v => set(idx, "cpf", v)} />
              <Field label="Ano-Base" value={socio.anoBase} onChange={v => set(idx, "anoBase", v)} />
              <div>
                <label className="section-label block mb-1.5">Tipo de Documento</label>
                <select value={socio.tipoDocumento || ""} onChange={e => set(idx, "tipoDocumento", e.target.value)} className="input-field">
                  <option value="">—</option>
                  <option value="recibo">Recibo de Entrega</option>
                  <option value="declaracao">Declaração Completa</option>
                </select>
              </div>
              {socio.tipoDocumento === "recibo" && (
                <Field label="Número do Recibo" value={socio.numeroRecibo || ""} onChange={v => set(idx, "numeroRecibo", v)} />
              )}
              <Field label="Rendimento Total (R$)" value={socio.rendimentoTotal} onChange={v => set(idx, "rendimentoTotal", v)} />
              <Field label="Total Bens e Direitos (R$)" value={socio.totalBensDireitos} onChange={v => set(idx, "totalBensDireitos", v)} />
              <Field label="Dívidas e Ônus (R$)" value={socio.dividasOnus} onChange={v => set(idx, "dividasOnus", v)} />
              <Field label="Patrimônio Líquido (R$)" value={socio.patrimonioLiquido} onChange={v => set(idx, "patrimonioLiquido", v)} />
              <div className="col-span-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input type="checkbox" checked={!!socio.situacaoMalhas} onChange={e => set(idx, "situacaoMalhas", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                  <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors">Em malha fina</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input type="checkbox" checked={!!socio.debitosEmAberto} onChange={e => set(idx, "debitosEmAberto", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                  <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors">Débitos em aberto</span>
                </label>
              </div>
              {socio.debitosEmAberto && (
                <Field label="Descrição dos Débitos" value={socio.descricaoDebitos || ""} onChange={v => set(idx, "descricaoDebitos", v)} multiline span2 />
              )}
              <Field label="Observações" value={socio.observacoes} onChange={v => set(idx, "observacoes", v)} multiline span2 />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export { IR_VAZIO };
