"use client";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { RelatorioVisitaData } from "@/types";
import { Field, SectionCard } from "./shared";

interface Props {
  data: RelatorioVisitaData;
  set: (k: string, v: string | boolean) => void;
  setLista: (k: "pontosPositivos" | "pontosAtencao", idx: number, v: string) => void;
  addLista: (k: "pontosPositivos" | "pontosAtencao") => void;
  removeLista: (k: "pontosPositivos" | "pontosAtencao", idx: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionRelatorioVisita({ data, set, setLista, addLista, removeLista, expanded, onToggle }: Props) {
  const badge = data.recomendacaoVisitante === "aprovado"
    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">✓ Aprovado</span>
    : data.recomendacaoVisitante === "condicional"
      ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">⚠ Condicional</span>
      : data.recomendacaoVisitante === "reprovado"
        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">✕ Reprovado</span>
        : undefined;

  const CHECKLIST = [
    { label: "Estrutura Física Confirmada", k: "estruturaFisicaConfirmada" as const },
    { label: "Estoque Visível", k: "estoqueVisivel" as const },
    { label: "Operação Compatível com Faturamento", k: "operacaoCompativelFaturamento" as const },
    { label: "Máquinas e Equipamentos", k: "maquinasEquipamentos" as const },
    { label: "Presença dos Sócios", k: "presencaSocios" as const },
  ];

  return (
    <SectionCard number="10" icon={<ClipboardList size={16} className="text-pink-600" />} title="Relatório de Visita"
      iconColor="bg-pink-100" expanded={expanded} onToggle={onToggle} badge={badge}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Data da Visita" value={data.dataVisita} onChange={v => set("dataVisita", v)} />
          <Field label="Responsável pela Visita" value={data.responsavelVisita} onChange={v => set("responsavelVisita", v)} />
          <Field label="Local da Visita" value={data.localVisita} onChange={v => set("localVisita", v)} />
          <Field label="Duração" value={data.duracaoVisita} onChange={v => set("duracaoVisita", v)} />
          <Field label="Estimativa de Estoque (R$)" value={data.estimativaEstoque} onChange={v => set("estimativaEstoque", v)} />
          <Field label="Funcionários Observados" value={String(data.funcionariosObservados ?? "")} onChange={v => set("funcionariosObservados", v)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CHECKLIST.map((item, i) => (
            <label key={i} className="flex items-center gap-2.5 cursor-pointer select-none group px-3 py-2 rounded-lg border border-cf-border bg-cf-surface hover:bg-cf-bg transition-colors">
              <input type="checkbox" checked={!!(data[item.k as "estruturaFisicaConfirmada"])} onChange={e => set(item.k, e.target.checked)} className="w-4 h-4 rounded accent-green-600 cursor-pointer" />
              <span className="text-xs text-cf-text-2 group-hover:text-cf-text-1 transition-colors">{item.label}</span>
            </label>
          ))}
        </div>
        <Field label="Descrição da Estrutura" value={data.descricaoEstrutura} onChange={v => set("descricaoEstrutura", v)} multiline span2 />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["pontosPositivos", "pontosAtencao"] as const).map(k => (
            <div key={k}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="section-label">{k === "pontosPositivos" ? "Pontos Positivos" : "Pontos de Atenção"}</p>
                <button onClick={() => addLista(k)} className="inline-flex items-center gap-1 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2 py-1 transition-colors" style={{ minHeight: "auto" }}>
                  <Plus size={11} /> Adicionar
                </button>
              </div>
              <div className="space-y-1.5">
                {data[k].map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p} onChange={e => setLista(k, i, e.target.value)} placeholder={k === "pontosPositivos" ? "Ponto positivo..." : "Ponto de atenção..."} className="input-field py-1.5 text-xs flex-1" />
                    <button onClick={() => removeLista(k, i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors flex-shrink-0"><Trash2 size={12} /></button>
                  </div>
                ))}
                {data[k].length === 0 && <p className="text-xs text-cf-text-4 italic">Nenhum item.</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="section-label mb-1.5">Recomendação</p>
            <div className="flex gap-2">
              {(["aprovado", "condicional", "reprovado"] as const).map(op => (
                <button key={op} onClick={() => set("recomendacaoVisitante", op)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors capitalize ${data.recomendacaoVisitante === op ? op === "aprovado" ? "bg-green-100 border-green-400 text-green-700" : op === "condicional" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-red-100 border-red-400 text-red-700" : "bg-cf-surface border-cf-border text-cf-text-3 hover:bg-cf-bg"}`}>
                  {op}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="section-label mb-1.5">Nível de Confiança</p>
            <div className="flex gap-2">
              {(["alto", "medio", "baixo"] as const).map(op => (
                <button key={op} onClick={() => set("nivelConfiancaVisita", op)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors capitalize ${data.nivelConfiancaVisita === op ? op === "alto" ? "bg-green-100 border-green-400 text-green-700" : op === "medio" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-red-100 border-red-400 text-red-700" : "bg-cf-surface border-cf-border text-cf-text-3 hover:bg-cf-bg"}`}>
                  {op}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Field label="Observações Livres" value={data.observacoesLivres} onChange={v => set("observacoesLivres", v)} multiline span2 />
        <div className="pt-2 border-t border-cf-border">
          <p className="section-label mb-3">Parâmetros Operacionais</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Pleito (R$)" value={data.pleito ?? ""} onChange={v => set("pleito", v)} />
            <div className="flex flex-col gap-1">
              <label className="section-label">Modalidade</label>
              <select value={data.modalidade ?? ""} onChange={e => set("modalidade", e.target.value)} className="input-field text-sm">
                <option value="">—</option>
                <option value="convencional">Convencional</option>
                <option value="comissaria">Comissária</option>
                <option value="hibrida">Híbrida</option>
                <option value="outra">Outra</option>
              </select>
            </div>
            <Field label="Taxa Convencional (%)" value={data.taxaConvencional ?? ""} onChange={v => set("taxaConvencional", v)} />
            <Field label="Taxa Comissária (%)" value={data.taxaComissaria ?? ""} onChange={v => set("taxaComissaria", v)} />
            <Field label="Limite Total (R$)" value={data.limiteTotal ?? ""} onChange={v => set("limiteTotal", v)} />
            <Field label="Limite por Sacado (R$)" value={data.limitePorSacado ?? ""} onChange={v => set("limitePorSacado", v)} />
            <Field label="Ticket Médio (R$)" value={data.ticketMedio ?? ""} onChange={v => set("ticketMedio", v)} />
            <Field label="Prazo Recompra Cedente (dias)" value={data.prazoRecompraCedente ?? ""} onChange={v => set("prazoRecompraCedente", v)} />
            <Field label="Prazo Envio Cartório (dias)" value={data.prazoEnvioCartorio ?? ""} onChange={v => set("prazoEnvioCartorio", v)} />
            <Field label="Prazo Máximo da Operação (dias)" value={data.prazoMaximoOp ?? ""} onChange={v => set("prazoMaximoOp", v)} />
          </div>
        </div>
        <div className="pt-2 border-t border-cf-border">
          <p className="section-label mb-3">Dados da Empresa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Folha de Pagamento (R$)" value={data.folhaPagamento ?? ""} onChange={v => set("folhaPagamento", v)} />
            <Field label="Endividamento Bancos (R$)" value={data.endividamentoBanco ?? ""} onChange={v => set("endividamentoBanco", v)} />
            <Field label="Endividamento Factoring/FIDC (R$)" value={data.endividamentoFactoring ?? ""} onChange={v => set("endividamentoFactoring", v)} />
            <Field label="Prazo Médio de Faturamento (dias)" value={data.prazoMedioFaturamento ?? ""} onChange={v => set("prazoMedioFaturamento", v)} />
            <Field label="Prazo Médio de Entrega (dias)" value={data.prazoMedioEntrega ?? ""} onChange={v => set("prazoMedioEntrega", v)} />
            <Field label="Referências Comerciais / Fornecedores" value={data.referenciasFornecedores ?? ""} onChange={v => set("referenciasFornecedores", v)} multiline span2 />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
