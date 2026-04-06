"use client";

import { useState } from "react";
import { Building2, Users, ScrollText, TrendingUp, BarChart3, ArrowRight, ArrowLeft, Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp, AlertCircle, LineChart, Scale, PieChart, FileKey, ClipboardList } from "lucide-react";
import { ExtractedData, Socio, QSASocio, FaturamentoMensal, SCRModalidade, SCRInstituicao, SCRData, IRSocioData } from "@/types";

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

// ── Quality assessment ──
interface QualityResult {
  score: "good" | "warning" | "error";
  filledFields: number;
  totalFields: number;
  pct: number;
  issues: string[];
}

function avaliarQualidade(type: string, data: Record<string, unknown>): QualityResult {
  const issues: string[] = [];
  let filled = 0;
  let total = 0;

  const check = (field: unknown, label: string, required = false) => {
    total++;
    const isEmpty = !field || field === "" || field === "0" || field === "0,00" || (Array.isArray(field) && field.length === 0);
    if (!isEmpty) { filled++; }
    else if (required) { issues.push(`${label} nao encontrado`); }
  };

  switch (type) {
    case "cnpj":
      check(data.razaoSocial, "Razao Social", true);
      check(data.cnpj, "CNPJ", true);
      check(data.situacaoCadastral, "Situacao Cadastral", true);
      check(data.dataAbertura, "Data de Abertura");
      check(data.cnaePrincipal, "CNAE Principal");
      check(data.porte, "Porte");
      check(data.endereco, "Endereco");
      check(data.capitalSocialCNPJ, "Capital Social");
      break;
    case "qsa": {
      check(data.quadroSocietario, "Quadro Societario", true);
      const socios = (data.quadroSocietario || []) as Record<string, unknown>[];
      if (socios.filter(s => s.nome).length === 0) issues.push("Nenhum socio identificado");
      else socios.forEach((s, i) => { if (!s.cpfCnpj) issues.push(`Socio ${i + 1}: CPF/CNPJ ausente`); });
      break;
    }
    case "contrato":
      check(data.capitalSocial, "Capital Social", true);
      check(data.dataConstituicao, "Data de Constituicao");
      check(data.administracao, "Administracao");
      check(data.objetoSocial, "Objeto Social");
      { const sc = (data.socios || []) as Record<string, unknown>[]; total++; if (sc.filter(s => s.nome).length > 0) filled++; else issues.push("Nenhum socio no contrato"); }
      break;
    case "faturamento":
      check(data.mediaAno || data.mediaMensal, "Media Mensal", true);
      { const m = (data.meses || []) as unknown[]; total++;
        if (m.length === 0) issues.push("Nenhum mes de faturamento extraido");
        else if (m.length < 6) { issues.push(`Apenas ${m.length} meses — ideal 12+`); filled += 0.5; }
        else filled++;
      }
      if (data.faturamentoZerado) issues.push("Faturamento zerado no periodo");
      break;
    case "scr":
      check(data.periodoReferencia, "Periodo de Referencia", true);
      check(data.totalDividasAtivas, "Total de Dividas");
      check(data.carteiraAVencer, "Carteira a Vencer");
      check(data.qtdeInstituicoes, "N de Instituicoes");
      break;
    default:
      total = 1; filled = data && Object.keys(data).length > 0 ? 1 : 0;
  }

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const score: QualityResult["score"] = issues.some(i => i.includes("nao encontrado") || i.includes("Nenhum")) ? "error" : pct >= 70 ? "good" : "warning";
  return { score, filledFields: Math.round(filled), totalFields: total, pct, issues };
}

function podeAvancar(qm: Record<string, QualityResult>): { pode: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (qm.cnpj?.score === "error") motivos.push("Cartao CNPJ com dados criticos faltando");
  if (qm.faturamento?.score === "error") motivos.push("Faturamento sem dados de media mensal");
  const total = Object.keys(qm).length;
  const errs = Object.values(qm).filter(q => q.score === "error").length;
  if (total > 0 && errs === total) motivos.push("Nenhum documento foi extraido com sucesso");
  return { pode: motivos.length === 0, motivos };
}

function getAvisos(qm: Record<string, QualityResult>): string[] {
  const labels: Record<string, string> = { cnpj: "Cartao CNPJ", qsa: "QSA", contrato: "Contrato Social", faturamento: "Faturamento", scr: "SCR" };
  return Object.entries(qm)
    .filter(([, q]) => q.score === "warning")
    .map(([type, q]) => `${labels[type] || type}: ${q.issues[0] || "dados incompletos"}`);
}

function QualityBadge({ quality }: { quality: QualityResult }) {
  const cfg = {
    good: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", icon: "✓", label: "Boa qualidade" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "⚠", label: "Revisar campos" },
    error: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: "✕", label: "Dados incompletos" },
  };
  const c = cfg[quality.score];
  return (
    <div className={`${c.bg} ${c.border} border rounded-lg p-3 mt-2`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[11px] font-semibold ${c.text} flex items-center gap-1`}>
          <span>{c.icon}</span> {c.label} — {quality.pct}% extraido
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
        <div className={`h-1.5 rounded-full transition-all ${quality.score === "good" ? "bg-green-500" : quality.score === "warning" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${quality.pct}%` }} />
      </div>
      {quality.issues.length > 0 && (
        <ul className="space-y-0.5">
          {quality.issues.map((issue, i) => (
            <li key={i} className={`text-[10px] ${c.text} opacity-80 flex items-start gap-1`}>
              <span className="mt-0.5 flex-shrink-0">→</span>{issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value, onChange, multiline = false, span2 = false }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; span2?: boolean;
}) {
  const isEmpty = !value || value === "" || value === "0" || value === "0,00";
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <label className="section-label block mb-1.5">{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={4} className={`input-field resize-none ${isEmpty ? "border-amber-200 bg-amber-50/30" : ""}`} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} className={`input-field ${isEmpty ? "border-amber-200 bg-amber-50/30" : ""}`} />
      }
    </div>
  );
}

export default function ReviewStep({ data, onComplete, onBack }: ReviewStepProps) {
  const [form, setForm] = useState<ExtractedData>(() => {
    const d: ExtractedData = JSON.parse(JSON.stringify(data));
    if (!d.dre) d.dre = { anos: [], crescimentoReceita: "", tendenciaLucro: "estavel", periodoMaisRecente: "", observacoes: "" };
    if (!d.balanco) d.balanco = { anos: [], periodoMaisRecente: "", tendenciaPatrimonio: "estavel", observacoes: "" };
    if (!d.curvaABC) d.curvaABC = { clientes: [], totalClientesNaBase: 0, totalClientesExtraidos: 0, periodoReferencia: "", receitaTotalBase: "", concentracaoTop3: "", concentracaoTop5: "", maiorCliente: "", maiorClientePct: "", alertaConcentracao: false };
    if (!d.irSocios) d.irSocios = [];
    if (!d.relatorioVisita) d.relatorioVisita = { dataVisita: "", responsavelVisita: "", localVisita: "", duracaoVisita: "", estruturaFisicaConfirmada: false, funcionariosObservados: 0, estoqueVisivel: false, estimativaEstoque: "", operacaoCompativelFaturamento: false, maquinasEquipamentos: false, descricaoEstrutura: "", pontosPositivos: [], pontosAtencao: [], recomendacaoVisitante: "aprovado", nivelConfiancaVisita: "medio", presencaSocios: false, sociosPresentes: [], documentosVerificados: [], observacoesLivres: "" };
    return d;
  });
  const [open, setOpen] = useState({ cnpj: true, qsa: true, contrato: false, faturamento: true, scr: true, dre: false, balanco: false, curvaABC: false, irSocios: false, relatorioVisita: false });
  const [showSCRDetails, setShowSCRDetails] = useState(false);

  const toggle = (k: keyof typeof open) => setOpen(p => ({ ...p, [k]: !p[k] }));

  // ── CNPJ setters ──
  const setCNPJ = (k: keyof typeof form.cnpj, v: string) => setForm(p => ({ ...p, cnpj: { ...p.cnpj, [k]: v } }));

  // ── QSA setters ──
  const setQSAField = (k: 'capitalSocial', v: string) => setForm(p => ({ ...p, qsa: { ...p.qsa, [k]: v } }));
  const setQSASocio = (i: number, k: keyof QSASocio, v: string) =>
    setForm(p => { const q = [...p.qsa.quadroSocietario]; q[i] = { ...q[i], [k]: v }; return { ...p, qsa: { ...p.qsa, quadroSocietario: q } }; });
  const addQSASocio = () => setForm(p => ({ ...p, qsa: { ...p.qsa, quadroSocietario: [...p.qsa.quadroSocietario, { nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }] } }));
  const removeQSASocio = (i: number) => setForm(p => {
    const q = p.qsa.quadroSocietario.filter((_, idx) => idx !== i);
    return { ...p, qsa: { ...p.qsa, quadroSocietario: q.length > 0 ? q : [{ nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }] } };
  });

  // ── Contrato setters ──
  const setContrato = (k: keyof typeof form.contrato, v: string | boolean) => setForm(p => ({ ...p, contrato: { ...p.contrato, [k]: v } }));
  const setSocio = (i: number, k: keyof Socio, v: string) =>
    setForm(p => { const s = [...p.contrato.socios]; s[i] = { ...s[i], [k]: v }; return { ...p, contrato: { ...p.contrato, socios: s } }; });
  const addSocio = () => setForm(p => ({ ...p, contrato: { ...p.contrato, socios: [...p.contrato.socios, { nome: "", cpf: "", participacao: "", qualificacao: "" }] } }));
  const removeSocio = (i: number) => setForm(p => {
    const s = p.contrato.socios.filter((_, idx) => idx !== i);
    return { ...p, contrato: { ...p.contrato, socios: s.length > 0 ? s : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }] } };
  });

  // ── Faturamento setters ──
  const setFatMes = (i: number, k: keyof FaturamentoMensal, v: string) =>
    setForm(p => { const m = [...p.faturamento.meses]; m[i] = { ...m[i], [k]: v }; return { ...p, faturamento: { ...p.faturamento, meses: m } }; });
  const addFatMes = () => setForm(p => ({ ...p, faturamento: { ...p.faturamento, meses: [...p.faturamento.meses, { mes: "", valor: "" }] } }));
  const removeFatMes = (i: number) => setForm(p => ({ ...p, faturamento: { ...p.faturamento, meses: p.faturamento.meses.filter((_, idx) => idx !== i) } }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setFatField = (k: 'somatoriaAno' | 'mediaAno' | 'ultimoMesComDados', v: string) =>
    setForm(p => ({ ...p, faturamento: { ...p.faturamento, [k]: v } }));

  // ── SCR setters ──
  const setSCR = (k: keyof SCRData, v: string) => setForm(p => ({ ...p, scr: { ...p.scr, [k]: v } }));
  const setSCRMod = (i: number, k: keyof SCRModalidade, v: string) =>
    setForm(p => { const m = [...p.scr.modalidades]; m[i] = { ...m[i], [k]: v }; return { ...p, scr: { ...p.scr, modalidades: m } }; });
  const addSCRMod = () => setForm(p => ({ ...p, scr: { ...p.scr, modalidades: [...p.scr.modalidades, { nome: "", total: "", aVencer: "", vencido: "", participacao: "" }] } }));
  const removeSCRMod = (i: number) => setForm(p => ({ ...p, scr: { ...p.scr, modalidades: p.scr.modalidades.filter((_, idx) => idx !== i) } }));
  const setSCRInst = (i: number, k: keyof SCRInstituicao, v: string) =>
    setForm(p => { const inst = [...p.scr.instituicoes]; inst[i] = { ...inst[i], [k]: v }; return { ...p, scr: { ...p.scr, instituicoes: inst } }; });
  const addSCRInst = () => setForm(p => ({ ...p, scr: { ...p.scr, instituicoes: [...p.scr.instituicoes, { nome: "", valor: "" }] } }));
  const removeSCRInst = (i: number) => setForm(p => ({ ...p, scr: { ...p.scr, instituicoes: p.scr.instituicoes.filter((_, idx) => idx !== i) } }));

  // ── DRE setters ──
  const setDRE = (k: string, v: string) => setForm(p => ({ ...p, dre: p.dre ? { ...p.dre, [k]: v } : p.dre }));

  // ── Balanço setters ──
  const setBalanco = (k: string, v: string) => setForm(p => ({ ...p, balanco: p.balanco ? { ...p.balanco, [k]: v } : p.balanco }));

  // ── IR Sócios setters ──
  const setIRSocio = (idx: number, k: keyof IRSocioData, v: string | boolean) =>
    setForm(p => {
      if (!p.irSocios) return p;
      const arr = [...p.irSocios];
      arr[idx] = { ...arr[idx], [k]: v };
      return { ...p, irSocios: arr };
    });

  // ── Relatório de Visita setters ──
  const setVisita = (k: string, v: string | boolean) => setForm(p => ({ ...p, relatorioVisita: p.relatorioVisita ? { ...p.relatorioVisita, [k]: v } : p.relatorioVisita }));

  // ── DRE ano setters ──
  const setDREAno = (anoIdx: number, k: string, v: string) =>
    setForm(p => {
      if (!p.dre) return p;
      const anos = [...p.dre.anos];
      anos[anoIdx] = { ...anos[anoIdx], [k]: v } as typeof anos[0];
      return { ...p, dre: { ...p.dre, anos } };
    });

  // ── Balanço ano setters ──
  const setBalancoAno = (anoIdx: number, k: string, v: string) =>
    setForm(p => {
      if (!p.balanco) return p;
      const anos = [...p.balanco.anos];
      anos[anoIdx] = { ...anos[anoIdx], [k]: v } as typeof anos[0];
      return { ...p, balanco: { ...p.balanco, anos } };
    });

  // ── Curva ABC setters ──
  const setCurvaABCField = (k: string, v: string | number | boolean) =>
    setForm(p => ({ ...p, curvaABC: p.curvaABC ? { ...p.curvaABC, [k]: v } : p.curvaABC }));
  const setCurvaABCCliente = (idx: number, k: string, v: string) =>
    setForm(p => {
      if (!p.curvaABC) return p;
      const clientes = [...p.curvaABC.clientes];
      clientes[idx] = { ...clientes[idx], [k]: v } as typeof clientes[0];
      return { ...p, curvaABC: { ...p.curvaABC, clientes } };
    });
  const addCurvaABCCliente = () =>
    setForm(p => ({
      ...p,
      curvaABC: p.curvaABC
        ? { ...p.curvaABC, clientes: [...p.curvaABC.clientes, { posicao: p.curvaABC.clientes.length + 1, nome: "", cnpjCpf: "", valorFaturado: "", percentualReceita: "", segmento: "" }] }
        : p.curvaABC,
    }));
  const removeCurvaABCCliente = (idx: number) =>
    setForm(p => ({
      ...p,
      curvaABC: p.curvaABC
        ? { ...p.curvaABC, clientes: p.curvaABC.clientes.filter((_, i) => i !== idx) }
        : p.curvaABC,
    }));

  // ── Relatório de Visita lista setters ──
  const setVisitaLista = (k: "pontosPositivos" | "pontosAtencao", idx: number, v: string) =>
    setForm(p => {
      if (!p.relatorioVisita) return p;
      const arr = [...p.relatorioVisita[k]];
      arr[idx] = v;
      return { ...p, relatorioVisita: { ...p.relatorioVisita, [k]: arr } };
    });
  const addVisitaLista = (k: "pontosPositivos" | "pontosAtencao") =>
    setForm(p => ({
      ...p,
      relatorioVisita: p.relatorioVisita
        ? { ...p.relatorioVisita, [k]: [...p.relatorioVisita[k], ""] }
        : p.relatorioVisita,
    }));
  const removeVisitaLista = (k: "pontosPositivos" | "pontosAtencao", idx: number) =>
    setForm(p => ({
      ...p,
      relatorioVisita: p.relatorioVisita
        ? { ...p.relatorioVisita, [k]: p.relatorioVisita[k].filter((_, i) => i !== idx) }
        : p.relatorioVisita,
    }));

  // ── Quality assessment ──
  const qualityMap = {
    cnpj: avaliarQualidade("cnpj", form.cnpj as unknown as Record<string, unknown>),
    qsa: avaliarQualidade("qsa", form.qsa as unknown as Record<string, unknown>),
    contrato: avaliarQualidade("contrato", form.contrato as unknown as Record<string, unknown>),
    faturamento: avaliarQualidade("faturamento", form.faturamento as unknown as Record<string, unknown>),
    scr: avaliarQualidade("scr", form.scr as unknown as Record<string, unknown>),
  };
  const goodCount = Object.values(qualityMap).filter(q => q.score === "good").length;
  const warningCount = Object.values(qualityMap).filter(q => q.score === "warning").length;
  const errorCount = Object.values(qualityMap).filter(q => q.score === "error").length;
  const { pode, motivos } = podeAvancar(qualityMap);
  const avisos = getAvisos(qualityMap);
  const [forcarAvancar, setForcarAvancar] = useState(false);

  return (
    <div className="animate-slide-up space-y-4">

      {/* Quality summary banner */}
      {!pode && !forcarAvancar ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">Nao e possivel prosseguir</p>
              <ul className="space-y-1">
                {motivos.map((m, i) => (
                  <li key={i} className="text-xs text-red-600 flex items-start gap-1"><span className="mt-0.5">→</span>{m}</li>
                ))}
              </ul>
              <p className="text-[10px] text-red-400 mt-2">Corrija os campos destacados em vermelho ou reenvie os documentos com problema.</p>
            </div>
          </div>
        </div>
      ) : pode && avisos.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 mb-1">Dados incompletos — revise antes de prosseguir</p>
              <ul className="space-y-1">
                {avisos.map((a, i) => (
                  <li key={i} className="text-xs text-amber-600 flex items-start gap-1"><span className="mt-0.5">→</span>{a}</li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-400 mt-2">Voce pode prosseguir, mas o relatorio pode ficar incompleto.</p>
            </div>
          </div>
        </div>
      ) : errorCount === 0 && warningCount === 0 ? (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-green-700">Todos os {goodCount} documentos foram extraidos com boa qualidade</p>
            <p className="text-[10px] text-green-500 mt-0.5">Revise os dados e prossiga para gerar o relatorio</p>
          </div>
        </div>
      ) : null}

      {/* ═══ 01 — CNPJ ═══ */}
      <SectionCard number="01" icon={<Building2 size={16} className="text-cf-navy" />} title="Identificação da Empresa — Cartão CNPJ"
        iconColor="bg-cf-navy/10" expanded={open.cnpj} onToggle={() => toggle("cnpj")}
        badge={<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${qualityMap.cnpj.score === "good" ? "bg-green-100 text-green-700" : qualityMap.cnpj.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{qualityMap.cnpj.pct}%</span>}>
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
        <QualityBadge quality={qualityMap.cnpj} />
      </SectionCard>

      {/* ═══ 02 — QSA ═══ */}
      <SectionCard number="02" icon={<Users size={16} className="text-indigo-600" />} title="Quadro de Sócios e Administradores — QSA"
        iconColor="bg-indigo-100" expanded={open.qsa} onToggle={() => toggle("qsa")}
        badge={<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${qualityMap.qsa.score === "good" ? "bg-green-100 text-green-700" : qualityMap.qsa.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{qualityMap.qsa.pct}%</span>}>
        <div className="space-y-4">
          <Field label="Capital Social" value={form.qsa.capitalSocial} onChange={v => setQSAField("capitalSocial", v)} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">Quadro Societário</span>
              <button onClick={addQSASocio} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
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
                {form.qsa.quadroSocietario.map((s, i) => (
                  <div key={i} className={`grid grid-cols-[1fr_150px_140px_80px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                    <input value={s.nome} onChange={e => setQSASocio(i,"nome",e.target.value)} placeholder="Nome completo" className="input-field py-1.5 text-xs" />
                    <input value={s.cpfCnpj} onChange={e => setQSASocio(i,"cpfCnpj",e.target.value)} placeholder="000.000.000-00" className="input-field py-1.5 text-xs" />
                    <input value={s.qualificacao} onChange={e => setQSASocio(i,"qualificacao",e.target.value)} placeholder="Sócio-Admin." className="input-field py-1.5 text-xs" />
                    <input value={s.participacao} onChange={e => setQSASocio(i,"participacao",e.target.value)} placeholder="50%" className="input-field py-1.5 text-xs" />
                    <button onClick={() => removeQSASocio(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="sm:hidden divide-y divide-cf-border">
                {form.qsa.quadroSocietario.map((s, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-cf-text-3 uppercase">Sócio {i + 1}</span>
                      <button onClick={() => removeQSASocio(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg"><Trash2 size={12} /></button>
                    </div>
                    <input value={s.nome} onChange={e => setQSASocio(i,"nome",e.target.value)} placeholder="Nome" className="input-field py-2 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={s.cpfCnpj} onChange={e => setQSASocio(i,"cpfCnpj",e.target.value)} placeholder="CPF/CNPJ" className="input-field py-2 text-sm" />
                      <input value={s.qualificacao} onChange={e => setQSASocio(i,"qualificacao",e.target.value)} placeholder="Qualificação" className="input-field py-2 text-sm" />
                    </div>
                    <input value={s.participacao} onChange={e => setQSASocio(i,"participacao",e.target.value)} placeholder="Participação %" className="input-field py-2 text-sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <QualityBadge quality={qualityMap.qsa} />
      </SectionCard>

      {/* ═══ 03 — Contrato Social ═══ */}
      <SectionCard number="03" icon={<ScrollText size={16} className="text-cf-green" />} title="Contrato Social"
        iconColor="bg-cf-green/10" expanded={open.contrato} onToggle={() => toggle("contrato")}
        badge={form.contrato.temAlteracoes ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-warning bg-cf-warning-bg px-2 py-0.5 rounded-full border border-cf-warning/20"><AlertTriangle size={10} /> Alterações</span> : undefined}>
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
                {form.contrato.socios.map((s, i) => (
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
                {form.contrato.socios.map((s, i) => (
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
            <Field label="Capital Social" value={form.contrato.capitalSocial} onChange={v => setContrato("capitalSocial", v)} />
            <Field label="Data de Constituição" value={form.contrato.dataConstituicao} onChange={v => setContrato("dataConstituicao", v)} />
            <Field label="Prazo de Duração" value={form.contrato.prazoDuracao} onChange={v => setContrato("prazoDuracao", v)} />
            <Field label="Foro" value={form.contrato.foro} onChange={v => setContrato("foro", v)} />
            <Field label="Objeto Social" value={form.contrato.objetoSocial} onChange={v => setContrato("objetoSocial", v)} multiline span2 />
            <Field label="Administração e Poderes" value={form.contrato.administracao} onChange={v => setContrato("administracao", v)} multiline span2 />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <input type="checkbox" checked={form.contrato.temAlteracoes} onChange={e => setContrato("temAlteracoes", e.target.checked)} className="w-4 h-4 rounded accent-yellow-500 cursor-pointer" />
            <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-cf-warning" /> Alterações societárias recentes
            </span>
          </label>
        </div>
        <QualityBadge quality={qualityMap.contrato} />
      </SectionCard>

      {/* ═══ 04 — Faturamento ═══ */}
      <SectionCard number="04" icon={<TrendingUp size={16} className="text-emerald-600" />} title="Faturamento"
        iconColor="bg-emerald-100" expanded={open.faturamento} onToggle={() => toggle("faturamento")}
        badge={<>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${qualityMap.faturamento.score === "good" ? "bg-green-100 text-green-700" : qualityMap.faturamento.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{qualityMap.faturamento.pct}%</span>
          {form.faturamento.faturamentoZerado
            ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertCircle size={10} /> Zerado</span>
            : !form.faturamento.dadosAtualizados
              ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-warning bg-cf-warning-bg px-2 py-0.5 rounded-full border border-cf-warning/20"><AlertTriangle size={10} /> Desatualizado</span>
              : null}
        </>}>
        <div className="space-y-4">
          {/* Métricas FMM */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
              <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">FMM 12M (R$)</p>
              <p className="text-[15px] font-bold text-cf-navy mt-1">{form.faturamento.fmm12m ? `R$ ${form.faturamento.fmm12m}` : form.faturamento.mediaAno ? `R$ ${form.faturamento.mediaAno}` : "—"}</p>
              <p className="text-[10px] text-cf-text-4 mt-0.5">Base de crédito</p>
            </div>
            <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
              <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">FMM Médio (R$)</p>
              <p className="text-[15px] font-bold text-cf-navy mt-1">{form.faturamento.fmmMedio ? `R$ ${form.faturamento.fmmMedio}` : "—"}</p>
              <p className="text-[10px] text-cf-text-4 mt-0.5">Média anos completos</p>
            </div>
            <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
              <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Tendência</p>
              <p className={`text-[15px] font-bold mt-1 ${form.faturamento.tendencia === "crescimento" ? "text-green-600" : form.faturamento.tendencia === "queda" ? "text-red-600" : "text-cf-text-2"}`}>
                {form.faturamento.tendencia === "crescimento" ? "↑ Crescimento" : form.faturamento.tendencia === "queda" ? "↓ Queda" : form.faturamento.tendencia === "estavel" ? "→ Estável" : "—"}
              </p>
              <p className="text-[10px] text-cf-text-4 mt-0.5">vs. FMM 12M</p>
            </div>
            <div className="bg-cf-surface rounded-xl p-3 border border-cf-border">
              <p className="text-[10px] font-semibold text-cf-text-3 uppercase tracking-wide">Último Mês</p>
              <p className="text-[15px] font-bold text-cf-navy mt-1">{form.faturamento.ultimoMesComDados || "—"}</p>
              <p className="text-[10px] text-cf-text-4 mt-0.5">Com dados</p>
            </div>
          </div>
          {/* FMM por ano */}
          {form.faturamento.fmmAnual && Object.keys(form.faturamento.fmmAnual).length > 0 && (
            <div className="bg-cf-surface/60 rounded-lg px-3 py-2 border border-cf-border text-xs text-cf-text-2 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(form.faturamento.fmmAnual).sort(([a], [b]) => Number(a) - Number(b)).map(([ano, val]) => {
                const qtd = (form.faturamento.meses || []).filter(m => (m.mes || "").endsWith(`/${ano}`)).length;
                return <span key={ano}><span className="font-semibold text-cf-navy">FMM {ano}:</span> R$ {val} <span className="text-cf-text-4">({qtd} {qtd === 1 ? "mês" : "meses"})</span></span>;
              })}
            </div>
          )}


          {/* Tabela de meses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">Faturamento Mensal</span>
              <button onClick={addFatMes} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
                <Plus size={12} /> Adicionar mês
              </button>
            </div>
            {form.faturamento.meses.length > 0 ? (
              <div className="rounded-xl border border-cf-border overflow-hidden">
                <div className="grid grid-cols-[120px_1fr_36px] bg-cf-surface px-3 py-2 gap-2">
                  {["Mês","Valor (R$)",""].map((h, i) => (
                    <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                  ))}
                </div>
                {form.faturamento.meses.map((m, i) => (
                  <div key={i} className={`grid grid-cols-[120px_1fr_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                    <input value={m.mes} onChange={e => setFatMes(i,"mes",e.target.value)} placeholder="MM/YYYY" className="input-field py-1.5 text-xs" />
                    <input value={m.valor} onChange={e => setFatMes(i,"valor",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                    <button onClick={() => removeFatMes(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
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
        <QualityBadge quality={qualityMap.faturamento} />
      </SectionCard>

      {/* ═══ 05 — SCR Detalhado ═══ */}
      <SectionCard number="05" icon={<BarChart3 size={16} className="text-cf-warning" />} title="SCR / Bacen — Perfil de Crédito"
        iconColor="bg-cf-warning/10" expanded={open.scr} onToggle={() => toggle("scr")}
        badge={<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${qualityMap.scr.score === "good" ? "bg-green-100 text-green-700" : qualityMap.scr.score === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{qualityMap.scr.pct}%</span>}>
        <div className="space-y-5">
          {/* Sem histórico bancário */}
          {form.scr.semHistorico && (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <span className="text-blue-500 mt-0.5">ℹ</span>
              <div>
                <p className="text-sm font-semibold text-blue-700">Sem operações registradas no SCR</p>
                <p className="text-xs text-blue-500 mt-0.5">Empresa sem dívida bancária ativa — campos zerados abaixo para confirmação</p>
              </div>
            </div>
          )}

          {/* Período */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Período de Referência" value={form.scr.periodoReferencia} onChange={v => setSCR("periodoReferencia", v)} />
          </div>

          {/* Toggle detalhes SCR */}
          <button onClick={() => setShowSCRDetails(prev => !prev)} className="text-xs text-cf-navy hover:text-cf-navy/70 flex items-center gap-1 transition-colors" style={{ minHeight: "auto" }}>
            {showSCRDetails ? "▲ Ocultar" : "▼ Ver"} detalhes (vencimentos, evolucao, modalidades)
          </button>

          {showSCRDetails && (
          <div className="space-y-4 animate-fade-in">

          {/* Comparativo expandido */}
          {form.scrAnterior && (
            <div>
              <p className="text-[11px] font-medium text-cf-text-4 uppercase tracking-wider mb-2">Evolucao SCR — {form.scrAnterior.periodoReferencia || "Anterior"} x {form.scr.periodoReferencia || "Atual"}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-cf-bg"><th className="text-left py-2 px-3 text-cf-text-3 font-medium">Metrica</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Anterior</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Atual</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Var.</th></tr></thead>
                  <tbody>{([
                    { label: "Em Dia", ant: form.scrAnterior.carteiraAVencer, at: form.scr.carteiraAVencer, positiveIsGood: true, bold: false },
                    { label: "CP", ant: form.scrAnterior.carteiraCurtoPrazo, at: form.scr.carteiraCurtoPrazo, positiveIsGood: false, bold: false },
                    { label: "LP", ant: form.scrAnterior.carteiraLongoPrazo, at: form.scr.carteiraLongoPrazo, positiveIsGood: false, bold: false },
                    { label: "Total Divida", ant: form.scrAnterior.totalDividasAtivas, at: form.scr.totalDividasAtivas, positiveIsGood: false, bold: true },
                    { label: "Vencida", ant: form.scrAnterior.vencidos, at: form.scr.vencidos, positiveIsGood: false, bold: false },
                    { label: "Prejuizo", ant: form.scrAnterior.prejuizos, at: form.scr.prejuizos, positiveIsGood: false, bold: false },
                    { label: "Limite", ant: form.scrAnterior.limiteCredito, at: form.scr.limiteCredito, positiveIsGood: true, bold: false },
                    { label: "IFs", ant: form.scrAnterior.qtdeInstituicoes, at: form.scr.qtdeInstituicoes, positiveIsGood: true, bold: false },
                  ] as { label: string; ant: string; at: string; positiveIsGood: boolean; bold: boolean }[]).map((m, i) => {
                    const parse = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
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

          {/* Vencimentos por prazo */}
          {form.scr.faixasAVencer && (
            <div>
              <p className="text-[11px] font-medium text-cf-text-4 uppercase tracking-wider mb-2">Vencimentos por Prazo</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-cf-bg"><th className="text-left py-2 px-3 text-cf-text-3 font-medium">Faixa</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Valor (R$)</th></tr></thead>
                  <tbody>
                    {[
                      { label: "Ate 30 dias", value: form.scr.faixasAVencer.ate30d },
                      { label: "31 a 60 dias", value: form.scr.faixasAVencer.d31_60 },
                      { label: "61 a 90 dias", value: form.scr.faixasAVencer.d61_90 },
                      { label: "91 a 180 dias", value: form.scr.faixasAVencer.d91_180 },
                      { label: "181 a 360 dias", value: form.scr.faixasAVencer.d181_360 },
                      { label: "Acima de 360 dias", value: form.scr.faixasAVencer.acima360d },
                    ].filter(r => r.value && r.value !== "0" && r.value !== "0,00").map((r, i) => (
                      <tr key={i} className="border-b border-cf-border/30"><td className="py-2 px-3 text-cf-text-2">{r.label}</td><td className="py-2 px-3 text-right font-medium text-cf-text-1" style={{ fontVariantNumeric: "tabular-nums" }}>{r.value}</td></tr>
                    ))}
                    <tr className="bg-cf-bg font-semibold"><td className="py-2 px-3 text-cf-text-1">Total</td><td className="py-2 px-3 text-right text-cf-text-1" style={{ fontVariantNumeric: "tabular-nums" }}>{form.scr.faixasAVencer.total || form.scr.carteiraAVencer || "—"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modalidades read-only */}
          {form.scr.modalidades.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-cf-text-4 uppercase tracking-wider mb-2">Modalidades de Credito</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-cf-bg"><th className="text-left py-2 px-3 text-cf-text-3 font-medium">Modalidade</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Total</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">A Vencer</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Vencido</th><th className="text-right py-2 px-3 text-cf-text-3 font-medium">Part.</th></tr></thead>
                  <tbody>{form.scr.modalidades.map((m, i) => {
                    const vencidoNum = parseFloat((m.vencido || "0").replace(/\./g, "").replace(",", ".")) || 0;
                    return (<tr key={i} className="border-b border-cf-border/30 hover:bg-cf-bg/50 transition-colors"><td className="py-2 px-3 text-cf-text-1">{m.nome}</td><td className="py-2 px-3 text-right text-cf-text-1" style={{ fontVariantNumeric: "tabular-nums" }}>{m.total || "—"}</td><td className="py-2 px-3 text-right text-cf-text-2" style={{ fontVariantNumeric: "tabular-nums" }}>{m.aVencer || "—"}</td><td className={`py-2 px-3 text-right font-medium ${vencidoNum > 0 ? "text-red-600" : "text-cf-text-2"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{m.vencido || "—"}</td><td className="py-2 px-3 text-right text-cf-text-3 font-medium">{m.participacao || "—"}</td></tr>);
                  })}</tbody>
                </table>
              </div>
            </div>
          )}

          </div>
          )}

          {/* Resumo principal */}
          <div className={form.scr.semHistorico ? "opacity-50" : ""}>
            <span className="section-label block mb-2">Resumo</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Carteira a Vencer (R$)" value={form.scr.carteiraAVencer} onChange={v => setSCR("carteiraAVencer", v)} />
              <Field label="Vencidos (R$)" value={form.scr.vencidos} onChange={v => setSCR("vencidos", v)} />
              <Field label="Prejuízos (R$)" value={form.scr.prejuizos} onChange={v => setSCR("prejuizos", v)} />
              <Field label="Limite de Crédito (R$)" value={form.scr.limiteCredito} onChange={v => setSCR("limiteCredito", v)} />
              <Field label="Qtde Instituições" value={form.scr.qtdeInstituicoes} onChange={v => setSCR("qtdeInstituicoes", v)} />
              <Field label="Qtde Operações" value={form.scr.qtdeOperacoes} onChange={v => setSCR("qtdeOperacoes", v)} />
            </div>
          </div>

          {/* Detalhamento */}
          <div className={form.scr.semHistorico ? "opacity-50" : ""}>
            <span className="section-label block mb-2">Detalhamento</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Total Dívidas Ativas (R$)" value={form.scr.totalDividasAtivas} onChange={v => setSCR("totalDividasAtivas", v)} />
              <Field label="Classificação de Risco (A-H)" value={form.scr.classificacaoRisco} onChange={v => setSCR("classificacaoRisco", v)} />
              <Field label="Operações a Vencer (R$)" value={form.scr.operacoesAVencer} onChange={v => setSCR("operacoesAVencer", v)} />
              <Field label="Operações em Atraso (R$)" value={form.scr.operacoesEmAtraso} onChange={v => setSCR("operacoesEmAtraso", v)} />
              <Field label="Operações Vencidas (R$)" value={form.scr.operacoesVencidas} onChange={v => setSCR("operacoesVencidas", v)} />
              <Field label="Tempo Médio de Atraso" value={form.scr.tempoAtraso} onChange={v => setSCR("tempoAtraso", v)} />
              <Field label="Curto Prazo - CP (R$)" value={form.scr.carteiraCurtoPrazo} onChange={v => setSCR("carteiraCurtoPrazo", v)} />
              <Field label="Longo Prazo - LP (R$)" value={form.scr.carteiraLongoPrazo} onChange={v => setSCR("carteiraLongoPrazo", v)} />
              <Field label="Coobrigações (R$)" value={form.scr.coobrigacoes} onChange={v => setSCR("coobrigacoes", v)} />
              <Field label="Moeda Estrangeira" value={form.scr.valoresMoedaEstrangeira} onChange={v => setSCR("valoresMoedaEstrangeira", v)} />
              <Field label="Histórico de Inadimplência" value={form.scr.historicoInadimplencia} onChange={v => setSCR("historicoInadimplencia", v)} multiline span2 />
            </div>
          </div>

          {/* Modalidades */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">Modalidades de Crédito</span>
              <button onClick={addSCRMod} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
                <Plus size={12} /> Adicionar
              </button>
            </div>
            {form.scr.modalidades.length > 0 ? (
              <div className="rounded-xl border border-cf-border overflow-hidden">
                <div className="hidden sm:grid grid-cols-[1fr_100px_100px_100px_70px_36px] bg-cf-surface px-3 py-2 gap-2">
                  {["Modalidade","Total","A Vencer","Vencido","Part.",""].map((h, i) => (
                    <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                  ))}
                </div>
                {form.scr.modalidades.map((m, i) => (
                  <div key={i} className={`hidden sm:grid grid-cols-[1fr_100px_100px_100px_70px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                    <input value={m.nome} onChange={e => setSCRMod(i,"nome",e.target.value)} placeholder="Capital de giro..." className="input-field py-1.5 text-xs" />
                    <input value={m.total} onChange={e => setSCRMod(i,"total",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                    <input value={m.aVencer} onChange={e => setSCRMod(i,"aVencer",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                    <input value={m.vencido} onChange={e => setSCRMod(i,"vencido",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                    <input value={m.participacao} onChange={e => setSCRMod(i,"participacao",e.target.value)} placeholder="0%" className="input-field py-1.5 text-xs" />
                    <button onClick={() => removeSCRMod(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
                {/* Mobile */}
                <div className="sm:hidden divide-y divide-cf-border">
                  {form.scr.modalidades.map((m, i) => (
                    <div key={i} className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-cf-text-3 uppercase">Modalidade {i + 1}</span>
                        <button onClick={() => removeSCRMod(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg"><Trash2 size={12} /></button>
                      </div>
                      <input value={m.nome} onChange={e => setSCRMod(i,"nome",e.target.value)} placeholder="Nome" className="input-field py-2 text-sm" />
                      <div className="grid grid-cols-2 gap-2">
                        <input value={m.total} onChange={e => setSCRMod(i,"total",e.target.value)} placeholder="Total" className="input-field py-2 text-sm" />
                        <input value={m.participacao} onChange={e => setSCRMod(i,"participacao",e.target.value)} placeholder="Part. %" className="input-field py-2 text-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhuma modalidade extraída.</div>
            )}
          </div>

          {/* Instituições */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">Instituições Financeiras</span>
              <button onClick={addSCRInst} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
                <Plus size={12} /> Adicionar
              </button>
            </div>
            {form.scr.instituicoes.length > 0 ? (
              <div className="rounded-xl border border-cf-border overflow-hidden">
                <div className="grid grid-cols-[1fr_140px_36px] bg-cf-surface px-3 py-2 gap-2">
                  {["Instituição","Valor (R$)",""].map((h, i) => (
                    <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                  ))}
                </div>
                {form.scr.instituicoes.map((inst, i) => (
                  <div key={i} className={`grid grid-cols-[1fr_140px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                    <input value={inst.nome} onChange={e => setSCRInst(i,"nome",e.target.value)} placeholder="Nome do banco" className="input-field py-1.5 text-xs" />
                    <input value={inst.valor} onChange={e => setSCRInst(i,"valor",e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                    <button onClick={() => removeSCRInst(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-cf-text-3 bg-cf-surface rounded-xl border border-cf-border">Nenhuma instituição extraída.</div>
            )}
          </div>
        </div>
        <QualityBadge quality={qualityMap.scr} />
      </SectionCard>

      {/* ═══ 06 — DRE ═══ */}
      {form.dre && (
        <SectionCard number="06" icon={<LineChart size={16} className="text-violet-600" />} title="DRE — Demonstração de Resultado"
          iconColor="bg-violet-100" expanded={open.dre} onToggle={() => toggle("dre")}>
          <div className="space-y-4">
            {form.dre.anos.length > 0 && (
              <div>
                <span className="section-label block mb-2">Dados por Ano</span>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-cf-bg">
                        <th className="text-left py-2 px-3 text-cf-text-3 font-medium">Indicador</th>
                        {form.dre.anos.map(a => <th key={a.ano} className="text-right py-2 px-3 text-cf-text-3 font-medium">{a.ano}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Receita Bruta", campo: "receitaBruta" },
                        { label: "Receita Líquida", campo: "receitaLiquida" },
                        { label: "Lucro Bruto", campo: "lucroBruto" },
                        { label: "Margem Bruta (%)", campo: "margemBruta" },
                        { label: "EBITDA", campo: "ebitda" },
                        { label: "Margem EBITDA (%)", campo: "margemEbitda" },
                        { label: "Lucro Líquido", campo: "lucroLiquido" },
                        { label: "Margem Líquida (%)", campo: "margemLiquida" },
                      ].map((linha, i) => (
                        <tr key={i} className="border-b border-cf-border/30 hover:bg-cf-bg/50">
                          <td className="py-1.5 px-3 text-cf-text-2 font-medium">{linha.label}</td>
                          {form.dre!.anos.map((a, anoIdx) => (
                            <td key={a.ano} className="py-1 px-2">
                              <input
                                value={(a as unknown as Record<string, string>)[linha.campo] || ""}
                                onChange={e => setDREAno(anoIdx, linha.campo, e.target.value)}
                                className="input-field py-1 text-xs text-right w-full"
                                style={{ fontVariantNumeric: "tabular-nums" }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Crescimento da Receita (%)" value={form.dre.crescimentoReceita} onChange={v => setDRE("crescimentoReceita", v)} />
              <div>
                <label className="section-label block mb-1.5">Tendência do Lucro</label>
                <select value={form.dre.tendenciaLucro} onChange={e => setDRE("tendenciaLucro", e.target.value)} className="input-field">
                  <option value="">—</option>
                  <option value="crescimento">Crescimento</option>
                  <option value="estavel">Estável</option>
                  <option value="queda">Queda</option>
                </select>
              </div>
              <Field label="Período Mais Recente" value={form.dre.periodoMaisRecente} onChange={v => setDRE("periodoMaisRecente", v)} />
            </div>
            <Field label="Observações" value={form.dre.observacoes} onChange={v => setDRE("observacoes", v)} multiline span2 />
          </div>
        </SectionCard>
      )}

      {/* ═══ 07 — Balanço Patrimonial ═══ */}
      {form.balanco && (
        <SectionCard number="07" icon={<Scale size={16} className="text-cyan-600" />} title="Balanço Patrimonial"
          iconColor="bg-cyan-100" expanded={open.balanco} onToggle={() => toggle("balanco")}>
          <div className="space-y-4">
            {form.balanco.anos.length > 0 && (
              <div>
                <span className="section-label block mb-2">Dados por Ano</span>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-cf-bg">
                        <th className="text-left py-2 px-3 text-cf-text-3 font-medium">Indicador</th>
                        {form.balanco.anos.map(a => <th key={a.ano} className="text-right py-2 px-3 text-cf-text-3 font-medium">{a.ano}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Ativo Total", campo: "ativoTotal" },
                        { label: "Ativo Circulante", campo: "ativoCirculante" },
                        { label: "Ativo Não Circulante", campo: "ativoNaoCirculante" },
                        { label: "Passivo Total", campo: "passivoTotal" },
                        { label: "Passivo Circulante", campo: "passivoCirculante" },
                        { label: "Passivo Não Circulante", campo: "passivoNaoCirculante" },
                        { label: "Patrimônio Líquido", campo: "patrimonioLiquido" },
                        { label: "Liquidez Corrente", campo: "liquidezCorrente" },
                        { label: "Endividamento (%)", campo: "endividamentoTotal" },
                        { label: "Capital de Giro Líq.", campo: "capitalDeGiroLiquido" },
                      ].map((linha, i) => (
                        <tr key={i} className="border-b border-cf-border/30 hover:bg-cf-bg/50">
                          <td className="py-1.5 px-3 text-cf-text-2 font-medium">{linha.label}</td>
                          {form.balanco!.anos.map((a, anoIdx) => (
                            <td key={a.ano} className="py-1 px-2">
                              <input
                                value={(a as unknown as Record<string, string>)[linha.campo] || ""}
                                onChange={e => setBalancoAno(anoIdx, linha.campo, e.target.value)}
                                className="input-field py-1 text-xs text-right w-full"
                                style={{ fontVariantNumeric: "tabular-nums" }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="section-label block mb-1.5">Tendência do Patrimônio</label>
                <select value={form.balanco.tendenciaPatrimonio} onChange={e => setBalanco("tendenciaPatrimonio", e.target.value)} className="input-field">
                  <option value="">—</option>
                  <option value="crescimento">Crescimento</option>
                  <option value="estavel">Estável</option>
                  <option value="queda">Queda</option>
                </select>
              </div>
              <Field label="Período Mais Recente" value={form.balanco.periodoMaisRecente} onChange={v => setBalanco("periodoMaisRecente", v)} />
            </div>
            <Field label="Observações" value={form.balanco.observacoes} onChange={v => setBalanco("observacoes", v)} multiline span2 />
          </div>
        </SectionCard>
      )}

      {/* ═══ 08 — Curva ABC ═══ */}
      {form.curvaABC && (
        <SectionCard number="08" icon={<PieChart size={16} className="text-orange-600" />} title="Curva ABC — Carteira de Clientes"
          iconColor="bg-orange-100" expanded={open.curvaABC} onToggle={() => toggle("curvaABC")}
          badge={form.curvaABC.alertaConcentracao ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertTriangle size={10} /> Concentração</span> : undefined}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Período de Referência" value={form.curvaABC.periodoReferencia} onChange={v => setCurvaABCField("periodoReferencia", v)} />
              <Field label="Total Clientes na Base" value={String(form.curvaABC.totalClientesNaBase || "")} onChange={v => setCurvaABCField("totalClientesNaBase", Number(v) || v)} />
              <Field label="Concentração Top 3 (%)" value={form.curvaABC.concentracaoTop3} onChange={v => setCurvaABCField("concentracaoTop3", v)} />
              <Field label="Concentração Top 5 (%)" value={form.curvaABC.concentracaoTop5} onChange={v => setCurvaABCField("concentracaoTop5", v)} />
              <Field label="Maior Cliente" value={form.curvaABC.maiorCliente} onChange={v => setCurvaABCField("maiorCliente", v)} />
              <Field label="Maior Cliente (%)" value={form.curvaABC.maiorClientePct} onChange={v => setCurvaABCField("maiorClientePct", v)} />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <input type="checkbox" checked={form.curvaABC.alertaConcentracao} onChange={e => setCurvaABCField("alertaConcentracao", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
              <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-red-500" /> Alerta de concentração
              </span>
            </label>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="section-label">Clientes</span>
                <button onClick={addCurvaABCCliente} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2.5 py-1.5 transition-colors">
                  <Plus size={12} /> Adicionar cliente
                </button>
              </div>
              {form.curvaABC.clientes.length > 0 ? (
                <div className="rounded-xl border border-cf-border overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[40px_1fr_100px_100px_80px_36px] bg-cf-surface px-3 py-2 gap-2">
                    {["#","Nome","Faturado","% Receita","Segmento",""].map((h, i) => (
                      <span key={i} className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide">{h}</span>
                    ))}
                  </div>
                  {form.curvaABC.clientes.map((c, i) => (
                    <div key={i} className={`hidden sm:grid grid-cols-[40px_1fr_100px_100px_80px_36px] px-3 py-2 gap-2 items-center ${i > 0 ? "border-t border-cf-border" : ""}`}>
                      <span className="text-xs font-bold text-cf-text-3 text-center">{c.posicao || i + 1}</span>
                      <input value={c.nome} onChange={e => setCurvaABCCliente(i, "nome", e.target.value)} placeholder="Nome do cliente" className="input-field py-1.5 text-xs" />
                      <input value={c.valorFaturado} onChange={e => setCurvaABCCliente(i, "valorFaturado", e.target.value)} placeholder="0,00" className="input-field py-1.5 text-xs" />
                      <input value={c.percentualReceita} onChange={e => setCurvaABCCliente(i, "percentualReceita", e.target.value)} placeholder="0%" className="input-field py-1.5 text-xs" />
                      <input value={c.segmento} onChange={e => setCurvaABCCliente(i, "segmento", e.target.value)} placeholder="Segmento" className="input-field py-1.5 text-xs" />
                      <button onClick={() => removeCurvaABCCliente(i)} className="w-8 h-8 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <div className="sm:hidden divide-y divide-cf-border">
                    {form.curvaABC.clientes.map((c, i) => (
                      <div key={i} className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-cf-text-3 uppercase">#{c.posicao || i + 1}</span>
                          <button onClick={() => removeCurvaABCCliente(i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger rounded-lg"><Trash2 size={12} /></button>
                        </div>
                        <input value={c.nome} onChange={e => setCurvaABCCliente(i, "nome", e.target.value)} placeholder="Nome" className="input-field py-2 text-sm" />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={c.valorFaturado} onChange={e => setCurvaABCCliente(i, "valorFaturado", e.target.value)} placeholder="Faturado" className="input-field py-2 text-sm" />
                          <input value={c.percentualReceita} onChange={e => setCurvaABCCliente(i, "percentualReceita", e.target.value)} placeholder="% Receita" className="input-field py-2 text-sm" />
                        </div>
                        <input value={c.segmento} onChange={e => setCurvaABCCliente(i, "segmento", e.target.value)} placeholder="Segmento" className="input-field py-2 text-sm" />
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
      )}

      {/* ═══ 09 — IR dos Sócios ═══ */}
      {form.irSocios !== undefined && (
        <SectionCard number="09" icon={<FileKey size={16} className="text-teal-600" />} title="IR dos Sócios"
          iconColor="bg-teal-100" expanded={open.irSocios} onToggle={() => toggle("irSocios")}>
          <div className="space-y-6">
            {form.irSocios!.length === 0 && (
              <p className="text-xs text-cf-text-3 text-center py-3">Nenhum IR de sócio carregado. Adicione manualmente abaixo.</p>
            )}
            <button onClick={() => setForm(p => ({ ...p, irSocios: [...(p.irSocios || []), { nomeSocio: "", cpf: "", anoBase: "", rendimentosTributaveis: "", rendimentosIsentos: "", rendimentoTotal: "", bensImoveis: "", bensVeiculos: "", aplicacoesFinanceiras: "", outrosBens: "", totalBensDireitos: "", dividasOnus: "", patrimonioLiquido: "", impostoPago: "", impostoRestituir: "", temSociedades: false, sociedades: [], coerenciaComEmpresa: true, observacoes: "" }] }))} className="btn-secondary w-full flex items-center justify-center gap-2 text-xs py-2">
              <Plus size={13} /> Adicionar Sócio
            </button>
            {form.irSocios!.map((socio, idx) => (
              <div key={idx} className="border border-cf-border rounded-xl overflow-hidden">
                <div className="bg-cf-surface px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-cf-text-1 uppercase tracking-wide">{socio.nomeSocio || `Sócio ${idx + 1}`}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-cf-text-3">Ano-base: {socio.anoBase || "—"}</span>
                    <button onClick={() => setForm(p => ({ ...p, irSocios: p.irSocios!.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Nome do Sócio" value={socio.nomeSocio} onChange={v => setIRSocio(idx, "nomeSocio", v)} />
                  <Field label="CPF" value={socio.cpf} onChange={v => setIRSocio(idx, "cpf", v)} />
                  <Field label="Ano-Base" value={socio.anoBase} onChange={v => setIRSocio(idx, "anoBase", v)} />
                  <div>
                    <label className="section-label block mb-1.5">Tipo de Documento</label>
                    <select value={socio.tipoDocumento || ""} onChange={e => setIRSocio(idx, "tipoDocumento", e.target.value)} className="input-field">
                      <option value="">—</option>
                      <option value="recibo">Recibo de Entrega</option>
                      <option value="declaracao">Declaração Completa</option>
                    </select>
                  </div>
                  {socio.tipoDocumento === "recibo" && (
                    <Field label="Número do Recibo" value={socio.numeroRecibo || ""} onChange={v => setIRSocio(idx, "numeroRecibo", v)} />
                  )}
                  <Field label="Rendimento Total (R$)" value={socio.rendimentoTotal} onChange={v => setIRSocio(idx, "rendimentoTotal", v)} />
                  <Field label="Total Bens e Direitos (R$)" value={socio.totalBensDireitos} onChange={v => setIRSocio(idx, "totalBensDireitos", v)} />
                  <Field label="Dívidas e Ônus (R$)" value={socio.dividasOnus} onChange={v => setIRSocio(idx, "dividasOnus", v)} />
                  <Field label="Patrimônio Líquido (R$)" value={socio.patrimonioLiquido} onChange={v => setIRSocio(idx, "patrimonioLiquido", v)} />
                  <div className="col-span-2 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                      <input type="checkbox" checked={!!socio.situacaoMalhas} onChange={e => setIRSocio(idx, "situacaoMalhas", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                      <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors">Em malha fina</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                      <input type="checkbox" checked={!!socio.debitosEmAberto} onChange={e => setIRSocio(idx, "debitosEmAberto", e.target.checked)} className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                      <span className="text-sm text-cf-text-2 group-hover:text-cf-text-1 transition-colors">Débitos em aberto</span>
                    </label>
                  </div>
                  {socio.debitosEmAberto && (
                    <Field label="Descrição dos Débitos" value={socio.descricaoDebitos || ""} onChange={v => setIRSocio(idx, "descricaoDebitos", v)} multiline span2 />
                  )}
                  <Field label="Observações" value={socio.observacoes} onChange={v => setIRSocio(idx, "observacoes", v)} multiline span2 />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ═══ 10 — Relatório de Visita ═══ */}
      {form.relatorioVisita && (
        <SectionCard number="10" icon={<ClipboardList size={16} className="text-pink-600" />} title="Relatório de Visita"
          iconColor="bg-pink-100" expanded={open.relatorioVisita} onToggle={() => toggle("relatorioVisita")}
          badge={
            form.relatorioVisita.recomendacaoVisitante === "aprovado"
              ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">✓ Aprovado</span>
              : form.relatorioVisita.recomendacaoVisitante === "condicional"
                ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">⚠ Condicional</span>
                : form.relatorioVisita.recomendacaoVisitante === "reprovado"
                  ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">✕ Reprovado</span>
                  : undefined
          }>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Data da Visita" value={form.relatorioVisita.dataVisita} onChange={v => setVisita("dataVisita", v)} />
              <Field label="Responsável pela Visita" value={form.relatorioVisita.responsavelVisita} onChange={v => setVisita("responsavelVisita", v)} />
              <Field label="Local da Visita" value={form.relatorioVisita.localVisita} onChange={v => setVisita("localVisita", v)} />
              <Field label="Duração" value={form.relatorioVisita.duracaoVisita} onChange={v => setVisita("duracaoVisita", v)} />
              <Field label="Estimativa de Estoque (R$)" value={form.relatorioVisita.estimativaEstoque} onChange={v => setVisita("estimativaEstoque", v)} />
              <Field label="Funcionários Observados" value={String(form.relatorioVisita.funcionariosObservados ?? "")} onChange={v => setVisita("funcionariosObservados", v)} />
            </div>

            {/* Checklist editável */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { label: "Estrutura Física Confirmada", k: "estruturaFisicaConfirmada" as const },
                { label: "Estoque Visível", k: "estoqueVisivel" as const },
                { label: "Operação Compatível com Faturamento", k: "operacaoCompativelFaturamento" as const },
                { label: "Máquinas e Equipamentos", k: "maquinasEquipamentos" as const },
                { label: "Presença dos Sócios", k: "presencaSocios" as const },
              ] as { label: string; k: keyof typeof form.relatorioVisita }[]).map((item, i) => (
                <label key={i} className="flex items-center gap-2.5 cursor-pointer select-none group px-3 py-2 rounded-lg border border-cf-border bg-cf-surface hover:bg-cf-bg transition-colors">
                  <input
                    type="checkbox"
                    checked={!!(form.relatorioVisita![item.k as "estruturaFisicaConfirmada"])}
                    onChange={e => setVisita(item.k, e.target.checked)}
                    className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                  />
                  <span className="text-xs text-cf-text-2 group-hover:text-cf-text-1 transition-colors">{item.label}</span>
                </label>
              ))}
            </div>

            <Field label="Descrição da Estrutura" value={form.relatorioVisita.descricaoEstrutura} onChange={v => setVisita("descricaoEstrutura", v)} multiline span2 />

            {/* Pontos positivos e atenção — editáveis */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="section-label">Pontos Positivos</p>
                  <button onClick={() => addVisitaLista("pontosPositivos")} className="inline-flex items-center gap-1 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2 py-1 transition-colors" style={{ minHeight: "auto" }}>
                    <Plus size={11} /> Adicionar
                  </button>
                </div>
                <div className="space-y-1.5">
                  {form.relatorioVisita.pontosPositivos.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={p} onChange={e => setVisitaLista("pontosPositivos", i, e.target.value)} placeholder="Ponto positivo..." className="input-field py-1.5 text-xs flex-1" />
                      <button onClick={() => removeVisitaLista("pontosPositivos", i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors flex-shrink-0"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  {form.relatorioVisita.pontosPositivos.length === 0 && (
                    <p className="text-xs text-cf-text-4 italic">Nenhum ponto positivo.</p>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="section-label">Pontos de Atenção</p>
                  <button onClick={() => addVisitaLista("pontosAtencao")} className="inline-flex items-center gap-1 text-xs font-semibold text-cf-navy hover:bg-cf-surface border border-cf-border hover:border-cf-navy rounded-lg px-2 py-1 transition-colors" style={{ minHeight: "auto" }}>
                    <Plus size={11} /> Adicionar
                  </button>
                </div>
                <div className="space-y-1.5">
                  {form.relatorioVisita.pontosAtencao.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={p} onChange={e => setVisitaLista("pontosAtencao", i, e.target.value)} placeholder="Ponto de atenção..." className="input-field py-1.5 text-xs flex-1" />
                      <button onClick={() => removeVisitaLista("pontosAtencao", i)} className="w-7 h-7 flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger-bg rounded-lg transition-colors flex-shrink-0"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  {form.relatorioVisita.pontosAtencao.length === 0 && (
                    <p className="text-xs text-cf-text-4 italic">Nenhum ponto de atenção.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="section-label mb-1.5">Recomendação</p>
                <div className="flex gap-2">
                  {(["aprovado", "condicional", "reprovado"] as const).map(op => (
                    <button key={op} onClick={() => setVisita("recomendacaoVisitante", op)}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors capitalize ${form.relatorioVisita!.recomendacaoVisitante === op ? op === "aprovado" ? "bg-green-100 border-green-400 text-green-700" : op === "condicional" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-red-100 border-red-400 text-red-700" : "bg-cf-surface border-cf-border text-cf-text-3 hover:bg-cf-bg"}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="section-label mb-1.5">Nível de Confiança</p>
                <div className="flex gap-2">
                  {(["alto", "medio", "baixo"] as const).map(op => (
                    <button key={op} onClick={() => setVisita("nivelConfiancaVisita", op)}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors capitalize ${form.relatorioVisita!.nivelConfiancaVisita === op ? op === "alto" ? "bg-green-100 border-green-400 text-green-700" : op === "medio" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-red-100 border-red-400 text-red-700" : "bg-cf-surface border-cf-border text-cf-text-3 hover:bg-cf-bg"}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Field label="Observações Livres" value={form.relatorioVisita.observacoesLivres} onChange={v => setVisita("observacoesLivres", v)} multiline span2 />
          </div>
        </SectionCard>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft size={15} /> Voltar
        </button>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => onComplete(form)}
            disabled={!pode && !forcarAvancar}
            title={!pode && !forcarAvancar ? "Corrija os erros criticos antes de prosseguir" : undefined}
            className={`btn-primary ${!pode && !forcarAvancar ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {pode || forcarAvancar ? "Gerar Relatorio" : "Corrija os erros primeiro"} <ArrowRight size={15} />
          </button>
          {!pode && !forcarAvancar && (
            <button onClick={() => setForcarAvancar(true)} className="text-[10px] text-cf-text-4 hover:text-cf-text-2 underline transition-colors" style={{ minHeight: "auto" }}>
              Prosseguir mesmo assim
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
