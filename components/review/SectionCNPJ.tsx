"use client";
import { Building2 } from "lucide-react";
import { CNPJData } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult } from "./shared";

interface Props {
  data: CNPJData;
  set: (k: keyof CNPJData, v: string) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionCNPJ({ data, set, expanded, onToggle, quality }: Props) {
  const pct = quality.pct;
  return (
    <SectionCard number="01" icon={<Building2 size={16} className="text-cf-navy" />} title="Identificação da Empresa — Cartão CNPJ"
      iconColor="bg-cf-navy/10" expanded={expanded} onToggle={onToggle}
      badge={<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${quality.score === "good" ? "bg-green-100 text-green-700" : quality.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{pct}%</span>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Razão Social" value={data.razaoSocial} onChange={v => set("razaoSocial", v)} span2 />
        <Field label="Nome Fantasia" value={data.nomeFantasia} onChange={v => set("nomeFantasia", v)} />
        <Field label="CNPJ" value={data.cnpj} onChange={v => set("cnpj", v)} />
        <Field label="Data de Abertura" value={data.dataAbertura} onChange={v => set("dataAbertura", v)} />
        <Field label="Situação Cadastral" value={data.situacaoCadastral} onChange={v => set("situacaoCadastral", v)} />
        <Field label="Data da Situação" value={data.dataSituacaoCadastral} onChange={v => set("dataSituacaoCadastral", v)} />
        <Field label="Motivo da Situação" value={data.motivoSituacao} onChange={v => set("motivoSituacao", v)} />
        <Field label="Natureza Jurídica" value={data.naturezaJuridica} onChange={v => set("naturezaJuridica", v)} span2 />
        <Field label="CNAE Principal" value={data.cnaePrincipal} onChange={v => set("cnaePrincipal", v)} span2 />
        <Field label="CNAEs Secundários" value={data.cnaeSecundarios} onChange={v => set("cnaeSecundarios", v)} multiline span2 />
        <Field label="Porte" value={data.porte} onChange={v => set("porte", v)} />
        <Field label="Capital Social (CNPJ)" value={data.capitalSocialCNPJ} onChange={v => set("capitalSocialCNPJ", v)} />
        <Field label="Endereço Completo" value={data.endereco} onChange={v => set("endereco", v)} span2 />
        <Field label="Telefone" value={data.telefone} onChange={v => set("telefone", v)} />
        <Field label="E-mail" value={data.email} onChange={v => set("email", v)} />
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}
