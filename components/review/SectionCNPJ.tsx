"use client";
// Building2 removed — icon no longer used in SectionCard
import { CNPJData } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult, qualityAccent } from "./shared";
import { BDCDataButton } from "./BDCDataModal";

interface Props {
  data: CNPJData;
  set: (k: keyof CNPJData, v: string) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
  /** Raw BDC da empresa principal pra modal "Ver dados BDC" (decisão 2026-05-15). */
  rawBDCEmpresa?: { cnpj: string; consultadoEm: string; json: unknown };
}

export function SectionCNPJ({ data, set, expanded, onToggle, quality, rawBDCEmpresa }: Props) {
  const pct = quality.pct;
  return (
    <SectionCard number="01" title="Identificação da Empresa — Cartão CNPJ"
      accentColor={qualityAccent(quality.score)} expanded={expanded} onToggle={onToggle}
      badge={<span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: quality.score === "good" ? "#dcfce7" : quality.score === "warning" ? "#fef9c3" : "#fee2e2", color: quality.score === "good" ? "#15803d" : quality.score === "warning" ? "#92400e" : "#991b1b" }}>{pct}%</span>}>
      {rawBDCEmpresa && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
          <BDCDataButton
            title="Dados BigDataCorp — Empresa Principal"
            subtitle={`CNPJ ${rawBDCEmpresa.cnpj} · consultado em ${new Date(rawBDCEmpresa.consultadoEm).toLocaleString("pt-BR")}`}
            raw={rawBDCEmpresa.json}
          />
        </div>
      )}
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
