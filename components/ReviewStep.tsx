"use client";

import { useState } from "react";
import { Building2, ScrollText, BarChart3, ArrowRight, ArrowLeft, Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { ExtractedData, Socio } from "@/types";

interface ReviewStepProps {
  data: ExtractedData;
  onComplete: (data: ExtractedData) => void;
  onBack: () => void;
}

function SectionCard({
  number, icon, title, iconColor, children, expanded, onToggle, badge
}: {
  number: string; icon: React.ReactNode; title: string; iconColor: string;
  children: React.ReactNode; expanded: boolean; onToggle: () => void; badge?: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cf-bg transition-colors text-left">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-cf-text-3 uppercase tracking-widest">Seção {number}</span>
            {badge}
          </div>
          <p className="text-sm font-semibold text-cf-text-1 leading-tight">{title}</p>
        </div>
        {expanded ? <ChevronUp size={15} className="text-cf-text-3 flex-shrink-0" /> : <ChevronDown size={15} className="text-cf-text-3 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-cf-border px-5 pb-5 pt-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, multiline = false, span2 = false }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; span2?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <label className="section-label block mb-1.5">{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={4} className="input-field resize-none" />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} className="input-field" />
      }
    </div>
  );
}

export default function ReviewStep({ data, onComplete, onBack }: ReviewStepProps) {
  const [form, setForm] = useState<ExtractedData>(() => JSON.parse(JSON.stringify(data)));
  const [open, setOpen] = useState({ cnpj: true, contrato: true, scr: true });

  const toggle = (k: keyof typeof open) => setOpen(p => ({ ...p, [k]: !p[k] }));

  const setCNPJ = (k: keyof typeof form.cnpj, v: string) => setForm(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));
  const setContrato = (k: keyof typeof form.contrato, v: string | boolean) => setForm(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSCR = (k: keyof typeof form.scr, v: string) => setForm(p => ({ ...p, scr: { ...p.scr, [k]: v } }));

  const setSocio = (i: number, k: keyof Socio, v: string) =>
    setForm(p => { const s = [...p.contrato.socios]; s[i] = { ...s[i], [k]: v }; return { ...p, contrato: { ...p.contrato, socios: s } }; });

  const addSocio = () => setForm(p => ({ ...p, contrato: { ...p.contrato, socios: [...p.contrato.socios, { nome: "", cpf: "", participacao: "", qualificacao: "" }] } }));

  const removeSocio = (i: number) => setForm(p => {
    const s = p.contrato.socios.filter((_, idx) => idx !== i);
    return { ...p, contrato: { ...p.contrato, socios: s.length > 0 ? s : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }] } };
  });

  return (
    <div className="animate-slide-up space-y-4">

      {/* CNPJ */}
      <SectionCard number="01" icon={<Building2 size={16} className="text-cf-navy" />} title="Identificação da Empresa — Cartão CNPJ"
        iconColor="bg-cf-navy/10" expanded={open.cnpj} onToggle={() => toggle("cnpj")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Razão Social" value={form.cnpj.razaoSocial} onChange={v => setCNPJ("razaoSocial", v)} span2 />
          <Field label="Nome Fantasia" value={form.cnpj.nomeFantasia} onChange={v => setCNPJ("nomeFantasia", v)} />
          <Field label="CNPJ" value={form.cnpj.cnpj} onChange={v => setCNPJ("cnpj", v)} />
          <Field label="Data de Abertura" value={form.cnpj.dataAbertura} onChange={v => setCNPJ("dataAbertura", v)} />
          <Field label="Situação Cadastral" value={form.cnpj.situacaoCadastral} onChange={v => setCNPJ("situacaoCadastral", v)} />
          <Field label="Data da Situação" value={form.cnpj.dataSituacaoCadastral} onChange={v => setCNPJ("dataSituacaoCadastral", v)} />
          <Field label="Motivo da Situação" value={form.cnpj.motivoSituacao} onChange={v => setCNPJ("motivoSituacao", v)} />
          <Field label="Natureza Jurídica" value={form.cnpj.naturezaJuridica} onChange={v => setCNPJ("naturezaJuridica", v)} span2 />
          <Field label="CNAE Principal" value={form.cnpj.cnaePrincipal} onChange={v => setCNPJ("cnaePrincipal", v)} span2 />
          <Field label="CNAEs Secundários" value={form.cnpj.cnaeSecundarios} onChange={v => setCNPJ("cnaeSecundarios", v)} multiline span2 />
          <Field label="Porte" value={form.cnpj.porte} onChange={v => setCNPJ("porte", v)} />
          <Field label="Capital Social (CNPJ)" value={form.cnpj.capitalSocialCNPJ} onChange={v => setCNPJ("capitalSocialCNPJ", v)} />
          <Field label="Endereço Completo" value={form.cnpj.endereco} onChange={v => setCNPJ("endereco", v)} span2 />
          <Field label="Telefone" value={form.cnpj.telefone} onChange={v => setCNPJ("telefone", v)} />
          <Field label="E-mail" value={form.cnpj.email} onChange={v => setCNPJ("email", v)} />
        </div>
      </SectionCard>

      {/* Contrato Social */}
      <SectionCard number="02" icon={<ScrollText size={16} className="text-cf-green" />} title="Estrutura Societária — Contrato Social"
        iconColor="bg-cf-green/10" expanded={open.contrato} onToggle={() => toggle("contrato")}
        badge={
          form.contrato.temAlteracoes
            ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-warning bg-cf-warning-bg px-2 py-0.5 rounded-full border border-cf-warning/20">
                <AlertTriangle size={10} /> Alterações recentes
              </span>
            : undefined
        }
      >
        <div className="space-y-4">
          {/* Sócios */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">Quadro Societário</span>
              <button onClick={addSocio} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
                <Plus size={12} /> Adicionar sócio
              </button>
            </div>
            <div className="rounded-xl border border-cf-border overflow-hidden">
              {/* Desktop: tabela horizontal */}
              <div className="hidden sm:block">
                <div className="grid grid-cols-[1fr_140px_120px_70px_36px] bg-cf-surface px-3 py-2 gap-2">
                  {["Nome do Sócio","CPF","Qualificação","Part.",""].map((h, i) => (
                    <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                  ))}
                </div>
                {form.contrato.socios.map((s, i) => (
                  <div key={i} className={`grid grid-cols-[1fr_140px_120px_70px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                    <input value={s.nome} onChange={e => setSocio(i,"nome",e.target.value)} placeholder="Nome completo" className="input-field py-1.5 text-xs" />
                    <input value={s.cpf} onChange={e => setSocio(i,"cpf",e.target.value)} placeholder="000.000.000-00" className="input-field py-1.5 text-xs" />
                    <input value={s.qualificacao} onChange={e => setSocio(i,"qualificacao",e.target.value)} placeholder="Sócio-Admin." className="input-field py-1.5 text-xs" />
                    <input value={s.participacao} onChange={e => setSocio(i,"participacao",e.target.value)} placeholder="50%" className="input-field py-1.5 text-xs" />
                    <button onClick={() => removeSocio(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors" aria-label="Remover sócio">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              {/* Mobile: cards empilhados */}
              <div className="sm:hidden divide-y divide-cf-border">
                {form.contrato.socios.map((s, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-cf-text-3 uppercase">Sócio {i + 1}</span>
                      <button onClick={() => removeSocio(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg" aria-label="Remover sócio"><Trash2 size={12} /></button>
                    </div>
                    <input value={s.nome} onChange={e => setSocio(i,"nome",e.target.value)} placeholder="Nome completo" className="input-field py-2 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={s.cpf} onChange={e => setSocio(i,"cpf",e.target.value)} placeholder="CPF" className="input-field py-2 text-sm" />
                      <input value={s.qualificacao} onChange={e => setSocio(i,"qualificacao",e.target.value)} placeholder="Qualificação" className="input-field py-2 text-sm" />
                    </div>
                    <input value={s.participacao} onChange={e => setSocio(i,"participacao",e.target.value)} placeholder="Participação %" className="input-field py-2 text-sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Capital Social" value={form.contrato.capitalSocial} onChange={v => setContrato("capitalSocial", v)} />
            <Field label="Data de Constituição" value={form.contrato.dataConstituicao} onChange={v => setContrato("dataConstituicao", v)} />
            <Field label="Prazo de Duração" value={form.contrato.prazoDuracao} onChange={v => setContrato("prazoDuracao", v)} />
            <Field label="Foro" value={form.contrato.foro} onChange={v => setContrato("foro", v)} />
            <Field label="Objeto Social" value={form.contrato.objetoSocial} onChange={v => setContrato("objetoSocial", v)} multiline span2 />
            <Field label="Administração e Poderes" value={form.contrato.administracao} onChange={v => setContrato("administracao", v)} multiline span2 />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <input type="checkbox" checked={form.contrato.temAlteracoes} onChange={e => setContrato("temAlteracoes", e.target.checked)}
              className="w-4 h-4 rounded accent-yellow-500 cursor-pointer" />
            <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-cf-warning" />
              Documento contém alterações societárias recentes
            </span>
          </label>
        </div>
      </SectionCard>

      {/* SCR */}
      <SectionCard number="03" icon={<BarChart3 size={16} className="text-cf-warning" />} title="Perfil de Crédito — SCR / Bacen"
        iconColor="bg-cf-warning/10" expanded={open.scr} onToggle={() => toggle("scr")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Total de Dívidas Ativas (R$)" value={form.scr.totalDividasAtivas} onChange={v => setSCR("totalDividasAtivas", v)} />
          <Field label="Classificação de Risco (A-H)" value={form.scr.classificacaoRisco} onChange={v => setSCR("classificacaoRisco", v)} />
          <Field label="Operações a Vencer (R$)" value={form.scr.operacoesAVencer} onChange={v => setSCR("operacoesAVencer", v)} />
          <Field label="Operações em Atraso" value={form.scr.operacoesEmAtraso} onChange={v => setSCR("operacoesEmAtraso", v)} />
          <Field label="Operações Vencidas (R$)" value={form.scr.operacoesVencidas} onChange={v => setSCR("operacoesVencidas", v)} />
          <Field label="Tempo Médio de Atraso" value={form.scr.tempoAtraso} onChange={v => setSCR("tempoAtraso", v)} />
          <Field label="Créditos Baixados (Prejuízo)" value={form.scr.prejuizo} onChange={v => setSCR("prejuizo", v)} />
          <Field label="Coobrigações / Garantias (R$)" value={form.scr.coobrigacoes} onChange={v => setSCR("coobrigacoes", v)} />
          <Field label="Concentração de Crédito (%)" value={form.scr.concentracaoCredito} onChange={v => setSCR("concentracaoCredito", v)} />
          <Field label="Modalidades de Crédito" value={form.scr.modalidadesCredito} onChange={v => setSCR("modalidadesCredito", v)} />
          <Field label="Instituições Credoras" value={form.scr.instituicoesCredoras} onChange={v => setSCR("instituicoesCredoras", v)} span2 />
          <Field label="Histórico de Inadimplência" value={form.scr.historicoInadimplencia} onChange={v => setSCR("historicoInadimplencia", v)} multiline span2 />
        </div>
      </SectionCard>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft size={15} /> Voltar
        </button>
        <button onClick={() => onComplete(form)} className="btn-primary">
          Gerar Relatório <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
