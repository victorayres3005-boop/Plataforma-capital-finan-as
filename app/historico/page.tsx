"use client";

import { useState, useEffect, useMemo, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DocumentCollection, CollectionDocument } from "@/types";
import { toast } from "sonner";
import {
  ChevronDown, ChevronUp, ChevronRight, FileText,
  Loader2, Pencil, Check, RotateCcw, Inbox, Trash2, Download,
  Search, Settings, HelpCircle, Bell, Clock, Filter, X,
  LogOut, User, ChevronDown as ChDown, Plus,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { deleteCollectionFiles } from "@/lib/storage";
import OnboardingTooltip from "@/components/OnboardingTooltip";
import { useTooltips } from "@/lib/useTooltips";

// ── Logo ──
function Logo() {
  return (
    <svg width="180" height="24" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#203b88" />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.5">
        <tspan fill="#203b88">capital</tspan>
        <tspan fill="#a8d96b">finanças</tspan>
      </text>
    </svg>
  );
}

// ── Helpers ──
function derivarSetor(cnaePrincipal?: string): string {
  if (!cnaePrincipal) return "";
  const match = cnaePrincipal.match(/^(\d{2})/);
  if (match) {
    const c = parseInt(match[1]);
    if (c <= 3)  return "Agronegócio";
    if (c <= 9)  return "Indústria";
    if (c <= 12) return "Alimentício";
    if (c <= 18) return "Têxtil";
    if (c <= 25) return "Indústria";
    if (c <= 27) return "Tecnologia";
    if (c <= 33) return "Indústria";
    if (c === 35) return "Energia";
    if (c <= 39) return "Saneamento";
    if (c <= 43) return "Construção";
    if (c <= 47) return "Comércio";
    if (c <= 53) return "Transporte";
    if (c <= 56) return "Alimentício";
    if (c <= 63) return "Tecnologia";
    if (c <= 66) return "Financeiro";
    if (c === 68) return "Imobiliário";
    if (c <= 82) return "Serviços";
    if (c === 84) return "Governo";
    if (c === 85) return "Educação";
    if (c <= 88) return "Saúde";
    if (c <= 93) return "Cultura";
    return "Serviços";
  }
  const t = cnaePrincipal.toLowerCase();
  if (/saúde|médic|hospital|farmácia|clínica/.test(t)) return "Saúde";
  if (/tecnologia|software|informátic|internet/.test(t)) return "Tecnologia";
  if (/aliment|bebida|restaurante|padaria/.test(t)) return "Alimentício";
  if (/construção|engenharia|obras/.test(t)) return "Construção";
  if (/transporte|logística|frete/.test(t)) return "Transporte";
  if (/educação|escola|ensino|curso/.test(t)) return "Educação";
  if (/financeiro|banco|crédito|seguro/.test(t)) return "Financeiro";
  if (/comércio|varejo|atacado/.test(t)) return "Comércio";
  if (/agro|agrícol|pecuária|rural/.test(t)) return "Agronegócio";
  if (/imóvel|imobiliária|locação/.test(t)) return "Imobiliário";
  return "Serviços";
}

function getGrade(rating: number | null): { letter: string; bg: string; color: string; border: string } {
  if (rating == null) return { letter: "—", bg: "#F1F5F9", color: "#94A3B8", border: "#E2E8F0" };
  if (rating >= 8)   return { letter: "A", bg: "#DCFCE7", color: "#16A34A", border: "#86EFAC" };
  if (rating >= 5)   return { letter: "B", bg: "#FEF3C7", color: "#D97706", border: "#FCD34D" };
  if (rating >= 3)   return { letter: "C", bg: "#FFEDD5", color: "#EA580C", border: "#FDBA74" };
  return               { letter: "D", bg: "#FEE2E2", color: "#DC2626", border: "#FCA5A5" };
}

// Tooltip explicativo do rating — mostrado no hover do círculo A/B/C/D na lista.
function getGradeTooltip(rating: number | null): string {
  if (rating == null) return "Sem rating — análise ainda não foi gerada";
  const faixa =
    rating >= 8 ? "A · Baixo risco (rating 8-10): perfil saudável, recomendado"
    : rating >= 5 ? "B · Risco moderado (rating 5-7,9): atenção recomendada"
    : rating >= 3 ? "C · Risco elevado (rating 3-4,9): avaliar condições antes de aprovar"
    : "D · Alto risco (rating 0-2,9): perfil crítico, evitar ou exigir garantias fortes";
  return `Rating ${rating.toFixed(1)}/10 · ${faixa}`;
}

// ── Doc icon colors per type ──
const DOC_ICON_STYLE: Record<string, { color: string; bg: string }> = {
  cnpj:            { color: "#3B82F6", bg: "#EFF6FF" },
  qsa:             { color: "#8B5CF6", bg: "#F5F3FF" },
  contrato_social: { color: "#10B981", bg: "#ECFDF5" },
  faturamento:     { color: "#F59E0B", bg: "#FFFBEB" },
  scr_bacen:       { color: "#EF4444", bg: "#FEF2F2" },
  curva_abc:       { color: "#06B6D4", bg: "#ECFEFF" },
  dre:             { color: "#EAB308", bg: "#FEFCE8" },
  balanco:         { color: "#EAB308", bg: "#FEFCE8" },
  ir_socio:        { color: "#EC4899", bg: "#FDF2F8" },
  outro:           { color: "#9CA3AF", bg: "#F9FAFB" },
};

function getStatusDisplay(col: DocumentCollection): { label: string; bg: string; color: string; border: string } {
  if (col.status !== "finished") return { label: "Em andamento", bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" };
  switch (col.decisao) {
    case "APROVADO":              return { label: "Aprovado",        bg: "#DCFCE7", color: "#16A34A", border: "#86EFAC" };
    case "APROVACAO_CONDICIONAL": return { label: "Condicional",     bg: "#EDE9FE", color: "#7C3AED", border: "#C4B5FD" };
    case "REPROVADO":             return { label: "Reprovado",       bg: "#FEE2E2", color: "#DC2626", border: "#FCA5A5" };
    case "QUESTIONAMENTO":        return { label: "Questionamento",  bg: "#ECFEFF", color: "#0891B2", border: "#A5F3FC" };
    default:                      return { label: "Pendente",        bg: "#F1F5F9", color: "#6B7280", border: "#E2E8F0" };
  }
}

function fmtCurrency(val: number | null | undefined): string {
  if (val == null) return "—";
  return "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

// ── Gerador HTML (mantido intacto) ──
function gerarRelatorioHTML(col: DocumentCollection, data: Record<string, Record<string, unknown>>, analysis: Record<string, unknown> | null): string {
  const cnpj = data.cnpj || data.contrato_social || {};
  const qsa = data.qsa || {};
  const contrato = data.contrato_social || data.contrato || {};
  const faturamento = data.faturamento || {};
  const scr = data.scr_bacen || data.scr || {};
  const protestos = data.protestos || {};
  const processos = data.processos || {};
  const esc = (s: unknown) => String(s || "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const genDt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const decision = (analysis?.decisao || col.decisao || "PENDENTE") as string;
  const rating = (analysis?.rating || col.rating || 0) as number;
  const parecer = analysis?.parecer as Record<string, unknown> | string | null;
  const pontosFortes = (typeof parecer === "object" && parecer?.pontosFortes ? parecer.pontosFortes : analysis?.pontosFortes || []) as string[];
  const pontosFracos = (typeof parecer === "object" && parecer?.pontosNegativosOuFracos ? parecer.pontosNegativosOuFracos : analysis?.pontosFracos || []) as string[];
  const resumo = (typeof parecer === "object" && parecer?.resumoExecutivo ? parecer.resumoExecutivo : analysis?.resumoExecutivo || "") as string;
  const perguntas = (typeof parecer === "object" && parecer?.perguntasVisita ? parecer.perguntasVisita : analysis?.perguntasVisita || []) as { pergunta: string; contexto: string }[];
  const alertas = (analysis?.alertas || []) as Record<string, unknown>[];
  const decisionClass = decision === "APROVADO" ? "decision-approved" : decision === "REPROVADO" ? "decision-rejected" : "decision-pending";
  const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#1a1a1a;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:820px;margin:0 auto;padding:48px 40px}.doc-header{padding-bottom:20px;border-bottom:1px solid #e5e5e5;margin-bottom:32px}.brand{font-size:14px;font-weight:300;color:#1a1a1a}.brand-sub{font-size:10px;letter-spacing:0.15em;color:#666;text-transform:uppercase;margin-top:2px}.doc-title{text-align:center;margin:28px 0 8px}.doc-title h1{font-size:28px;font-weight:300}.doc-title .company{font-size:16px;font-weight:600;margin-top:8px}.doc-title .meta{font-size:12px;color:#999;margin-top:4px}.section{margin-bottom:36px;page-break-inside:avoid}.sec-num{display:block;font-size:11px;color:#999;margin-bottom:4px}.sec-heading{font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:#1a1a1a}.sec-rule{border:none;border-top:1px solid #e5e5e5;margin:8px 0 24px}table.kv{width:100%;border-collapse:collapse}table.kv td{padding:8px 0;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:top}table.kv tr:last-child td{border-bottom:none}td.lbl{width:220px;color:#666}td.val{color:#1a1a1a;font-weight:500}td.muted{color:#999}.dtable{width:100%;border-collapse:collapse;margin-bottom:20px}.dtable th{background:#f8f9fa;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;padding:10px 12px;font-weight:500;text-align:left;border-bottom:1px solid #e5e5e5}.dtable td{font-size:13px;padding:10px 12px;border-bottom:1px solid #f0f0f0}.dtable tr:last-child td{border-bottom:none}.decision-badge{display:inline-block;font-size:13px;font-weight:500;padding:8px 20px;border-radius:4px;border:1px solid}.decision-approved{background:#f0fdf4;color:#16a34a;border-color:#bbf7d0}.decision-pending{background:#fffbeb;color:#d97706;border-color:#fde68a}.decision-rejected{background:#fef2f2;color:#dc2626;border-color:#fecaca}.alert-line{margin-bottom:8px}.alert-badge{display:inline-block;font-size:10px;padding:2px 8px;border-radius:3px;font-weight:500;margin-right:10px}.alert-critico{background:#fef2f2;color:#dc2626}.alert-moderado{background:#fffbeb;color:#d97706}.alert-info{background:#eff6ff;color:#2563eb}.alert-positivo{background:#f0fdf4;color:#16a34a}.alert-text{font-size:13px;color:#444}.sub-heading{font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #f0f0f0}.doc-footer{border-top:1px solid #e5e5e5;padding-top:12px;margin-top:40px;display:flex;justify-content:space-between}.doc-footer span{font-size:10px;color:#999}@media print{.page{padding:0;max-width:100%}}@page{margin:20mm 15mm}`;
  const row = (label: string, value: unknown) => { const v = String(value || ""); const empty = !v || v === "—" || v === "undefined"; return `<tr><td class="lbl">${esc(label)}</td><td class="val${empty ? " muted" : ""}">${empty ? "—" : esc(v)}</td></tr>`; };
  const socios = (qsa.quadroSocietario as Record<string, unknown>[] || []).filter(s => s.nome);
  const meses = (faturamento.meses as { mes: string; valor: string }[] || []).filter(m => m.mes);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatorio — ${esc(col.company_name || col.label)}</title><style>${css}</style></head><body><div class="page"><div class="doc-header"><div class="brand">capital financas</div><div class="brand-sub">CONSOLIDADOR DE DOCUMENTOS</div></div><div class="doc-title"><h1>Relatorio de Due Diligence</h1><div class="company">${esc(col.company_name || col.label)}</div><div class="meta">CNPJ ${esc(col.cnpj || cnpj.cnpj)} — Gerado em ${genDt}</div></div><div class="section"><span class="sec-num">00</span><span class="sec-heading">Sumario Executivo</span><hr class="sec-rule"><div style="text-align:center;margin-bottom:20px"><span class="decision-badge ${decisionClass}">${esc(decision)}</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px"><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">Empresa</div><div style="font-size:13px;font-weight:500">${esc(col.company_name || col.label)}</div></div><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">CNPJ</div><div style="font-size:13px;font-weight:500">${esc(col.cnpj || cnpj.cnpj)}</div></div><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">Decisao</div><div style="font-size:13px;font-weight:500">${esc(decision)} — ${rating}/10</div></div></div>${alertas.length > 0 ? `<div>${alertas.map(a => `<div class="alert-line"><span class="alert-badge ${a.severidade === "ALTA" ? "alert-critico" : a.severidade === "MODERADA" ? "alert-moderado" : "alert-info"}">${esc(a.severidade || a.severity)}</span><span class="alert-text">${esc(a.descricao || a.message)}</span></div>`).join("")}</div>` : ""}${resumo ? `<p style="font-size:13px;color:#444;line-height:1.8;margin-top:16px">${esc(resumo)}</p>` : ""}</div><div class="section"><span class="sec-num">01</span><span class="sec-heading">Identificacao da Empresa</span><hr class="sec-rule"><table class="kv">${row("Razao Social", cnpj.razaoSocial)}${row("CNPJ", cnpj.cnpj || col.cnpj)}${row("Situacao Cadastral", cnpj.situacaoCadastral)}${row("Data de Abertura", cnpj.dataAbertura)}${row("CNAE Principal", cnpj.cnaePrincipal)}${row("Porte", cnpj.porte)}${row("Capital Social", cnpj.capitalSocialCNPJ)}${row("Endereco", cnpj.endereco)}${row("Telefone", cnpj.telefone)}</table></div><div class="section"><span class="sec-num">02</span><span class="sec-heading">Quadro Societario</span><hr class="sec-rule">${socios.length > 0 ? `<table class="dtable"><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Qualificacao</th><th>Participacao</th></tr></thead><tbody>${socios.map(s => `<tr><td>${esc(s.nome)}</td><td>${esc(s.cpfCnpj)}</td><td>${esc(s.qualificacao)}</td><td><strong>${esc(s.participacao)}</strong></td></tr>`).join("")}</tbody></table>` : '<p style="color:#999;font-size:13px">Nenhum socio encontrado.</p>'}</div><div class="section"><span class="sec-num">03</span><span class="sec-heading">Contrato Social</span><hr class="sec-rule"><table class="kv">${row("Capital Social", contrato.capitalSocial)}${row("Data de Constituicao", contrato.dataConstituicao)}${row("Objeto Social", contrato.objetoSocial)}${row("Administracao", contrato.administracao)}${row("Foro", contrato.foro)}</table></div><div class="section"><span class="sec-num">04</span><span class="sec-heading">Faturamento</span><hr class="sec-rule"><table class="kv">${row("Media Mensal (R$)", faturamento.mediaAno || faturamento.mediaMensal)}${row("Somatoria (R$)", faturamento.somatoriaAno || faturamento.totalAno)}${row("Ultimo Mes com Dados", faturamento.ultimoMesComDados)}</table>${meses.length > 0 ? `<div class="sub-heading">Serie Mensal</div><table class="dtable"><thead><tr><th>Mes</th><th style="text-align:right">Valor (R$)</th></tr></thead><tbody>${meses.map(m => `<tr><td>${esc(m.mes)}</td><td style="text-align:right;font-variant-numeric:tabular-nums"><strong>${esc(m.valor)}</strong></td></tr>`).join("")}</tbody></table>` : ""}</div><div class="section"><span class="sec-num">05</span><span class="sec-heading">Perfil de Credito — SCR</span><hr class="sec-rule"><table class="kv">${row("Total Dividas Ativas", scr.totalDividasAtivas)}${row("Carteira a Vencer", scr.carteiraAVencer)}${row("Vencidos", scr.vencidos)}${row("Prejuizos", scr.prejuizos)}${row("Limite de Credito", scr.limiteCredito)}${row("Qtde Instituicoes", scr.qtdeInstituicoes)}${row("Periodo de Referencia", scr.periodoReferencia)}</table></div><div class="section"><span class="sec-num">06</span><span class="sec-heading">Protestos</span><hr class="sec-rule"><table class="kv">${row("Vigentes (Qtd)", protestos.vigentesQtd || "0")}${row("Vigentes (R$)", protestos.vigentesValor || "0,00")}${row("Regularizados (Qtd)", protestos.regularizadosQtd || "0")}${row("Regularizados (R$)", protestos.regularizadosValor || "0,00")}</table></div><div class="section"><span class="sec-num">07</span><span class="sec-heading">Processos Judiciais</span><hr class="sec-rule"><table class="kv">${row("Passivos (Total)", processos.passivosTotal || "0")}${row("Ativos (Total)", processos.ativosTotal || "0")}${row("Valor Estimado (R$)", processos.valorTotalEstimado || "0,00")}</table></div><div class="section"><span class="sec-num">08</span><span class="sec-heading">Parecer Final</span><hr class="sec-rule"><div style="display:flex;gap:12px;align-items:center;margin-bottom:24px"><span class="decision-badge ${decisionClass}">${esc(decision)}</span><span style="font-size:13px;color:#666">Rating: <strong>${rating}/10</strong></span></div>${pontosFortes.length > 0 ? `<div class="sub-heading">Pontos Fortes</div><div style="margin-bottom:16px">${pontosFortes.map(p => `<div class="alert-line"><span class="alert-badge alert-positivo">POSITIVO</span><span class="alert-text">${esc(p)}</span></div>`).join("")}</div>` : ""}${pontosFracos.length > 0 ? `<div class="sub-heading">Pontos Fracos</div><div style="margin-bottom:16px">${pontosFracos.map(p => `<div class="alert-line"><span class="alert-badge alert-critico">RISCO</span><span class="alert-text">${esc(p)}</span></div>`).join("")}</div>` : ""}${perguntas.length > 0 ? `<div class="sub-heading">Perguntas para Visita</div><table class="dtable"><thead><tr><th style="width:40%">Pergunta</th><th>Contexto</th></tr></thead><tbody>${perguntas.map(q => `<tr><td style="font-weight:500">${esc(q.pergunta)}</td><td style="color:#666;font-size:12px">${esc(q.contexto)}</td></tr>`).join("")}</tbody></table>` : ""}</div><div class="doc-footer"><span>capital financas — Consolidador de Documentos</span><span>Documento confidencial — uso restrito</span><span>Gerado em ${genDt}</span></div></div></body></html>`;
}

// ── DOC_FIELDS for inline editing ──
const DOC_FIELDS: Record<string, { key: string; label: string; type: "text" | "select" | "textarea" | "readonly"; options?: string[] }[]> = {
  cnpj: [
    { key: "razaoSocial", label: "Razao Social", type: "text" },
    { key: "nomeFantasia", label: "Nome Fantasia", type: "text" },
    { key: "cnpj", label: "CNPJ", type: "readonly" },
    { key: "situacaoCadastral", label: "Situacao Cadastral", type: "select", options: ["ATIVA", "INAPTA", "BAIXADA", "SUSPENSA"] },
    { key: "dataAbertura", label: "Data de Abertura", type: "text" },
    { key: "porte", label: "Porte", type: "text" },
    { key: "endereco", label: "Endereco", type: "text" },
    { key: "telefone", label: "Telefone", type: "text" },
  ],
  contrato_social: [
    { key: "dataConstituicao", label: "Data de Constituicao", type: "text" },
    { key: "capitalSocial", label: "Capital Social", type: "text" },
    { key: "administracao", label: "Administracao", type: "text" },
    { key: "objetoSocial", label: "Objeto Social", type: "textarea" },
  ],
  scr_bacen: [
    { key: "periodoReferencia", label: "Periodo de Referencia", type: "text" },
    { key: "totalDividasAtivas", label: "Total Dividas Ativas", type: "text" },
    { key: "operacoesAVencer", label: "Operacoes a Vencer", type: "text" },
    { key: "operacoesVencidas", label: "Operacoes Vencidas", type: "text" },
    { key: "prejuizos", label: "Prejuizos", type: "text" },
  ],
};

// ── CollectionRow — single entry row ──
function CollectionRow({ col, isGrouped, userId, highlight, onDelete, onUpdate, v2Map }: {
  col: DocumentCollection;
  isGrouped: boolean;
  userName: string;
  userId?: string;
  highlight: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, docs: CollectionDocument[]) => void;
  v2Map?: Map<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [observacoes, setObservacoes] = useState(col.observacoes || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [savingDoc, setSavingDoc] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inspectingIdx, setInspectingIdx] = useState<number | null>(null);
  const [inspectDraft, setInspectDraft] = useState<string>("");
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectSaving, setInspectSaving] = useState(false);
  const [inspectDirty, setInspectDirty] = useState(false);

  // Reset inspector state quando trocar o documento inspecionado
  useEffect(() => {
    if (inspectingIdx === null) return;
    const rec = (docs[inspectingIdx]?.extracted_data || {}) as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    Object.entries(rec).forEach(([k, v]) => { if (!k.startsWith("_")) clean[k] = v; });
    setInspectDraft(JSON.stringify(clean, null, 2));
    setInspectError(null);
    setInspectDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectingIdx]);

  const handleSaveInspectDoc = async () => {
    if (inspectingIdx === null) return;
    setInspectSaving(true);
    setInspectError(null);
    try {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(inspectDraft); }
      catch { throw new Error("JSON inválido. Verifique a sintaxe antes de salvar."); }
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        throw new Error("O JSON raiz precisa ser um objeto { ... }");
      }
      const supabase = createClient();
      const updatedDocs = docs.map((d, i) => {
        if (i !== inspectingIdx) return d;
        // Preserva meta-fields com underscore (_warnings, _editedManually)
        const preserved: Record<string, unknown> = {};
        Object.entries(d.extracted_data || {}).forEach(([k, v]) => {
          if (k.startsWith("_")) preserved[k] = v;
        });
        return {
          ...d,
          extracted_data: { ...parsed, ...preserved, _editedManually: true },
        };
      });
      const { error } = await supabase
        .from("document_collections")
        .update({ documents: updatedDocs })
        .eq("id", col.id)
        .eq("user_id", userId);
      if (error) throw error;
      onUpdate(col.id, updatedDocs);
      toast.success("Dados atualizados");
      setInspectDirty(false);
      setInspectingIdx(null);
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setInspectSaving(false);
    }
  };

  const docs = (col.documents || []) as CollectionDocument[];
  const cnpjDoc = docs.find(d => d.type === "cnpj");
  const setor = derivarSetor(cnpjDoc?.extracted_data?.cnaePrincipal as string | undefined);
  const visitaDoc = docs.find(d => d.type === "relatorio_visita");
  const pleito = visitaDoc?.extracted_data?.pleito as string | undefined;

  // Detecta coletas incompletas: sócios PF no QSA sem SCR correspondente
  const qsaDoc = docs.find(d => d.type === "qsa");
  const qsaSocios = (qsaDoc?.extracted_data?.quadroSocietario as Array<{ nome?: string; cpfCnpj?: string }> | undefined) || [];
  const sociosPfCount = qsaSocios.filter(s => ((s.cpfCnpj || "").replace(/\D/g, "")).length === 11).length;
  const scrPfDocsCount = docs.filter(d => d.type === "scr_bacen" && (d.extracted_data?.tipoPessoa as string) === "PF").length;
  const needsRevision = sociosPfCount > 0 && scrPfDocsCount === 0;

  const grade = getGrade(col.rating);
  const status = getStatusDisplay(col);
  const isFinished = col.status === "finished";
  const date = new Date(col.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const name = col.company_name || col.label || "Sem título";

  useEffect(() => {
    if (highlight && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const extractedData: Record<string, Record<string, unknown>> = {};
      for (const doc of docs) { if (doc.extracted_data) extractedData[doc.type] = doc.extracted_data; }
      // Usa análise salva — preserva o rating V2 original e evita re-chamar a IA sem o scoreV2
      let analysis: Record<string, unknown> | null = (col.ai_analysis as Record<string, unknown> | null) ?? null;
      if (!analysis) {
        try {
          const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: extractedData }) });
          if (res.ok) { const json = await res.json(); if (json.success) analysis = json.analysis; }
        } catch { /* sem análise IA */ }
      }
      const html = gerarRelatorioHTML(col, extractedData, analysis);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${(col.company_name || col.label || col.id).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Erro ao gerar relatório"); }
    finally { setGeneratingReport(false); }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("document_collections").update({ status: "in_progress", finished_at: null }).eq("id", col.id).eq("user_id", userId);
      if (error) throw error;
      toast.success("Coleta reaberta — redirecionando...");
      setTimeout(() => { window.location.href = `/?resume=${col.id}`; }, 800);
    } catch { toast.error("Erro ao reabrir coleta"); }
    finally { setReopening(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const supabase = createClient();
      if (userId) await deleteCollectionFiles(userId, col.id);
      const { error } = await supabase.from("document_collections").delete().eq("id", col.id).eq("user_id", userId);
      if (error) throw error;
      toast.success("Coleta excluída");
      onDelete(col.id);
    } catch { toast.error("Erro ao excluir"); }
    finally { setDeleting(false); setConfirmDelete(false); }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const supabase = createClient();
      await supabase.from("document_collections").update({ observacoes: observacoes.trim() || null }).eq("id", col.id).eq("user_id", userId);
      setEditingNotes(false);
      toast.success("Observações salvas");
    } catch { toast.error("Erro ao salvar observações"); }
    finally { setSavingNotes(false); }
  };

  const handleSaveDoc = async (docType: string) => {
    setSavingDoc(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const updatedDocs = docs.map(d => {
        if (d.type !== docType) return d;
        const newData: Record<string, unknown> = { ...d.extracted_data, ...editValues, _editedManually: true };
        if (docType === "faturamento" && Array.isArray(editValues.meses)) {
          const ms = editValues.meses as { mes: string; valor: string }[];
          const vals = ms.map(m => parseFloat((m.valor || "0").replace(/\./g, "").replace(",", ".")) || 0);
          const sum = vals.reduce((a, b) => a + b, 0);
          newData.mediaAno = (vals.length > 0 ? sum / vals.length : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
          newData.somatoriaAno = sum.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        }
        return { ...d, extracted_data: newData };
      });
      const { error } = await supabase.from("document_collections").update({ documents: updatedDocs }).eq("id", col.id).eq("user_id", userId);
      if (error) throw error;
      onUpdate(col.id, updatedDocs);
      setEditingDoc(null);
      setEditValues({});
      toast.success("Documento atualizado");
    } catch { setSaveError("Erro ao salvar. Tente novamente."); }
    finally { setSavingDoc(false); }
  };

  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-lg text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F1F5F9] transition-colors border border-transparent hover:border-[#E5E7EB]";

  return (
    <div ref={ref} className={highlight ? "ring-1 ring-cf-green/40" : ""}>
      {/* ── Collapsed row (56px) ── */}
      <div className="flex items-center gap-2.5 px-4 h-14 hover:bg-[#FAFAFA] transition-colors group">
        {/* Grade circle (IA) */}
        <div title={getGradeTooltip(col.rating)} style={{ width: 36, height: 36, borderRadius: "50%", background: grade.bg, border: `1.5px solid ${grade.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "help" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: grade.color }}>{grade.letter}</span>
        </div>

        {/* V2 rating badge */}
        {(() => {
          const v2r = v2Map?.get(col.id);
          if (!v2r) return null;
          const V2C: Record<string, { c: string; bg: string }> = {
            A:{c:"#16a34a",bg:"#f0fdf4"}, B:{c:"#65a30d",bg:"#f7fee7"},
            C:{c:"#d97706",bg:"#fffbeb"}, D:{c:"#ea580c",bg:"#fff7ed"},
            E:{c:"#dc2626",bg:"#fef2f2"}, F:{c:"#991b1b",bg:"#fff1f2"},
          };
          const cfg = V2C[v2r] ?? { c:"#94a3b8", bg:"#f1f5f9" };
          return (
            <div title={`Score V2: ${v2r}`} style={{
              width: 20, height: 20, borderRadius: 4, flexShrink: 0,
              background: cfg.bg, border: `1px solid ${cfg.c}55`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: cfg.c, cursor: "help",
            }}>
              {v2r}
            </div>
          );
        })()}

        {/* Company name — only when not in a group */}
        {!isGrouped && (
          <span
            className="text-sm font-semibold text-[#111827] truncate"
            style={{ maxWidth: 280, flexShrink: 1 }}
            title={name}
          >
            {name}
          </span>
        )}

        {/* Sector */}
        {setor && (
          <span style={{ fontSize: 11, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
            {setor}
          </span>
        )}

        {/* Date · docs */}
        <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "#CBD5E1" }}>{date}</span>
          <span style={{ color: "#E2E8F0" }}>·</span>
          <FileText size={11} style={{ color: "#CBD5E1" }} />
          <span>{docs.length} doc{docs.length !== 1 ? "s" : ""}</span>
        </span>

        {/* Rating do comitê / analista */}
        {(() => {
          const ai = col.ai_analysis as Record<string, unknown> | null;
          const parecer = ai?.parecerAnalista as Record<string, unknown> | null;
          const ratingVal = parecer?.ratingAnalista != null ? Number(parecer.ratingAnalista) : col.rating;
          if (ratingVal == null) return null;
          const rc = ratingVal >= 7 ? "#16a34a" : ratingVal >= 4 ? "#d97706" : "#dc2626";
          const rbg = ratingVal >= 7 ? "#f0fdf4" : ratingVal >= 4 ? "#fffbeb" : "#fff1f2";
          const rborder = ratingVal >= 7 ? "#bbf7d0" : ratingVal >= 4 ? "#fde68a" : "#fecaca";
          return (
            <span style={{ fontSize: 11, fontWeight: 700, color: rc, background: rbg, border: `1px solid ${rborder}`, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.8 }}>Rating</span>
              {ratingVal}/10
            </span>
          );
        })()}

        {/* Status */}
        <span style={{ fontSize: 11, fontWeight: 600, background: status.bg, color: status.color, border: `1px solid ${status.border}`, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.color, flexShrink: 0 }} />
          {status.label}
        </span>

        {/* Badge "REVISAR" — coleta com socios PF no QSA mas sem SCR de socios */}
        {needsRevision && (
          <span
            title={`${sociosPfCount} socio(s) PF no QSA sem SCR correspondente. Reabra a coleta e envie os SCRs dos socios.`}
            style={{ fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3 }}
          >
            <span style={{ fontSize: 10 }}>⚠</span> REVISAR
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {docs.length > 0 && (
            <button title="Baixar relatório" onClick={handleGenerateReport} disabled={generatingReport} className={iconBtn}>
              {generatingReport ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            </button>
          )}
          <button
            title={isFinished ? "Reabrir edição" : "Retomar coleta"}
            onClick={isFinished ? handleReopen : undefined}
            disabled={reopening}
            className={iconBtn}
          >
            {!isFinished
              ? <Link href={`/?resume=${col.id}`} className="flex items-center justify-center w-full h-full"><RotateCcw size={15} /></Link>
              : reopening ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />
            }
          </button>
          <button title={expanded ? "Fechar" : "Ver detalhes"} onClick={() => setExpanded(p => !p)} className={iconBtn}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {!confirmDelete ? (
            <button title="Excluir" onClick={() => setConfirmDelete(true)} className={`${iconBtn} hover:!text-red-500 hover:!bg-red-50`}>
              <Trash2 size={15} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={handleDelete} disabled={deleting} className="h-7 text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg px-2.5 transition-colors">
                {deleting ? <Loader2 size={11} className="animate-spin" /> : "Excluir"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="h-7 text-[11px] text-[#9CA3AF] hover:text-[#374151] px-2 transition-colors">Não</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div style={{ background: "#FAFAFA", borderTop: "1px solid #F1F5F9", padding: "14px 16px 14px 60px" }} className="animate-fade-in">
          {/* Info grid */}
          <div className="grid grid-cols-3 gap-x-8 gap-y-3 mb-4">
            <div>
              <p style={{ fontSize: 10, color: col.fmm_12m != null && col.fmm_12m >= 300000 ? "#15803D" : col.fmm_12m != null ? "#DC2626" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>FMM / mês</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#1E3A5F" }}>{fmtCurrency(col.fmm_12m)}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Pleito</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{pleito || "—"}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Decisão</p>
              <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, background: status.bg, color: status.color, borderRadius: 999, padding: "3px 10px" }}>
                {status.label}
              </span>
            </div>
          </div>

          {/* Observações */}
          <div className="mb-4">
            <p style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Observação</p>
            {editingNotes ? (
              <div>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  autoFocus rows={2}
                  placeholder="Observações do analista..."
                  className="w-full text-xs text-[#374151] bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#203b88]/20 placeholder:text-[#9CA3AF]"
                />
                <div className="flex gap-2 mt-1.5">
                  <button onClick={saveNotes} disabled={savingNotes} className="text-[11px] font-semibold text-cf-green border border-cf-green/20 rounded-lg px-3 py-1 hover:bg-cf-green/5 transition-colors inline-flex items-center gap-1">
                    {savingNotes ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Salvar
                  </button>
                  <button onClick={() => { setObservacoes(col.observacoes || ""); setEditingNotes(false); }} className="text-[11px] text-[#9CA3AF] hover:text-[#374151] px-2 py-1 transition-colors">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditingNotes(true)} className="group/note flex items-start gap-1.5 w-full text-left">
                <p className="text-xs text-[#6B7280] flex-1 leading-relaxed group-hover/note:text-[#374151] transition-colors italic min-h-[20px]">
                  {observacoes || "+ Adicionar observação"}
                </p>
                <Pencil size={11} className="text-[#CBD5E1] opacity-0 group-hover/note:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
              </button>
            )}
          </div>

          {/* Parâmetros do Parecer */}
          {(() => {
            const ai = col.ai_analysis as Record<string, unknown> | null;
            const parecer = ai?.parecerAnalista as Record<string, string | null> | null;
            if (!parecer) return null;
            const paramGroups: { label: string; items: { k: string; l: string }[] }[] = [
              { label: "Crédito", items: [
                { k: "limiteCredito", l: "Limite de Crédito" },
                { k: "concentracaoSacado", l: "Concentração/Sacado" },
                { k: "garantias", l: "Garantias" },
              ]},
              { label: "Taxas", items: [
                { k: "taxaConvencional", l: "Taxa Convencional" },
                { k: "taxaComissaria", l: "Taxa Comissária" },
                { k: "tac", l: "TAC" },
              ]},
              { label: "Limites", items: [
                { k: "limiteTotal", l: "Limite Total" },
                { k: "limiteConvencional", l: "Limite Convencional" },
                { k: "limiteComissaria", l: "Limite Comissária" },
                { k: "limitePorSacados", l: "Limite/Sacado" },
                { k: "ticketMedio", l: "Ticket Médio" },
              ]},
              { label: "Cobrança e Tranche", items: [
                { k: "prazoMaximo", l: "Prazo Máximo" },
                { k: "prazoRecompra", l: "Recompra Cedente" },
                { k: "prazoCartorio", l: "Envio Cartório" },
                { k: "trancheValor", l: "Tranche (R$)" },
                { k: "tranchePrazo", l: "Tranche (dias)" },
              ]},
            ];
            const hasAnyValue = paramGroups.some(g => g.items.some(i => parecer[i.k]));
            if (!hasAnyValue) return null;
            return (
              <div className="mb-4">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Parâmetros do Parecer</p>
                  {parecer.ratingAnalista != null && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: Number(parecer.ratingAnalista) >= 7 ? "#f0fdf4" : Number(parecer.ratingAnalista) >= 4 ? "#fffbeb" : "#fff1f2",
                      border: `1px solid ${Number(parecer.ratingAnalista) >= 7 ? "#86efac" : Number(parecer.ratingAnalista) >= 4 ? "#fcd34d" : "#fca5a5"}`,
                      borderRadius: 8, padding: "3px 10px",
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: Number(parecer.ratingAnalista) >= 7 ? "#16a34a" : Number(parecer.ratingAnalista) >= 4 ? "#d97706" : "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rating Analista</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: Number(parecer.ratingAnalista) >= 7 ? "#16a34a" : Number(parecer.ratingAnalista) >= 4 ? "#d97706" : "#dc2626" }}>{parecer.ratingAnalista}/10</span>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {paramGroups.map(group => {
                    const filled = group.items.filter(i => parecer[i.k]);
                    if (filled.length === 0) return null;
                    return (
                      <div key={group.label}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: "#CBD5E1", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{group.label}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {filled.map(item => (
                            <div key={item.k} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "4px 10px", display: "flex", flexDirection: "column", gap: 1, minWidth: 100 }}>
                              <span style={{ fontSize: 9, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>{item.l}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#1E3A5F" }}>{parecer[item.k]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9]">
            <button
              onClick={() => setShowDocs(p => !p)}
              className="text-xs text-[#6B7280] hover:text-[#374151] transition-colors flex items-center gap-1"
            >
              {showDocs ? <ChevronUp size={13} /> : <ChevronRight size={13} />}
              Ver documentos ({docs.length})
            </button>
            {isFinished ? (
              <div className="flex items-center gap-3">
                <a
                  href={`/parecer?id=${col.id}`}
                  className="text-xs font-semibold text-[#7c3aed] hover:underline transition-colors"
                >
                  Editar parecer →
                </a>
                <button
                  onClick={handleReopen}
                  disabled={reopening}
                  className="text-xs font-semibold text-[#203b88] hover:underline transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {reopening ? <Loader2 size={12} className="animate-spin" /> : null}
                  Reabrir edição →
                </button>
              </div>
            ) : (
              <Link href={`/?resume=${col.id}`} className="text-xs font-semibold text-[#203b88] hover:underline">
                Retomar →
              </Link>
            )}
          </div>

          {/* Documents accordion */}
          {showDocs && (
            <div className="mt-3 space-y-2 animate-fade-in">
              {docs.map((doc, i) => {
                const isEditing = editingDoc === doc.type;
                const fields = DOC_FIELDS[doc.type];
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const data = isEditing ? editValues : (doc.extracted_data || {});
                const rec = (doc.extracted_data || {}) as Record<string, unknown>;
                const wasEdited = !!rec._editedManually;
                const warnings = (rec._warnings as Array<{ field?: string; message?: string; path?: string[] }> | undefined) || [];
                const wCount = warnings.length;
                // Conta quantos campos do top-level estão vazios ("" / null / undefined / [] / {})
                const filledCount = Object.entries(rec).filter(([k, v]) => {
                  if (k.startsWith("_")) return false;
                  if (v == null || v === "") return false;
                  if (Array.isArray(v)) return v.length > 0;
                  if (typeof v === "object") return Object.keys(v as object).length > 0;
                  return true;
                }).length;
                const totalFields = Object.keys(rec).filter(k => !k.startsWith("_")).length;
                return (
                  <div key={i} className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      {(() => {
                        const s = DOC_ICON_STYLE[doc.type] || DOC_ICON_STYLE.outro;
                        return (
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: s.bg, border: `1px solid ${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <FileText size={13} style={{ color: s.color }} />
                          </div>
                        );
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#374151] flex items-center gap-1.5">
                          {doc.type}
                          {wasEdited && <span className="text-[9px] bg-cf-navy/10 text-cf-navy px-1 py-0.5 rounded">Editado</span>}
                          {wCount > 0 && (
                            <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200" title={warnings.map(w => `${w.field ?? w.path?.join(".") ?? ""} — ${w.message ?? ""}`).join("\n")}>
                              ⚠ {wCount} validação{wCount > 1 ? "ões" : ""}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-[#9CA3AF] truncate">{doc.filename}</p>
                      </div>
                      <span className="text-[10px] text-[#9CA3AF] font-mono">{filledCount}/{totalFields} campos</span>
                      <button onClick={() => setInspectingIdx(i)} className="text-[11px] font-semibold text-[#9CA3AF] hover:text-cf-navy transition-colors flex items-center gap-1" title="Ver dados brutos extraídos">
                        <Search size={10} /> Dados
                      </button>
                      {!isEditing && (
                        <button onClick={() => { setEditingDoc(doc.type); setEditValues({ ...(doc.extracted_data || {}) }); setSaveError(null); }} className="text-[11px] font-semibold text-[#9CA3AF] hover:text-cf-navy transition-colors flex items-center gap-1">
                          <Pencil size={10} /> Editar
                        </button>
                      )}
                    </div>
                    {wCount > 0 && !isEditing && (
                      <div className="px-3 pb-2 pt-0 space-y-1">
                        {warnings.slice(0, 3).map((w, j) => (
                          <div key={j} className="text-[10px] text-amber-800 bg-amber-50/60 border border-amber-100 rounded px-2 py-1">
                            <span className="font-mono text-amber-900">{w.field ?? w.path?.join(".") ?? "?"}</span>
                            <span className="mx-1 text-amber-500">·</span>
                            {w.message ?? "—"}
                          </div>
                        ))}
                        {wCount > 3 && <div className="text-[10px] text-amber-600">+{wCount - 3} mais…</div>}
                      </div>
                    )}
                    {isEditing && (
                      <div className="px-3 pb-3 pt-2 space-y-2 border-t border-[#F1F5F9] animate-fade-in">
                        {fields ? (
                          <div className="grid grid-cols-2 gap-2">
                            {fields.map(f => (
                              <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                                <label className="text-[10px] text-[#9CA3AF] uppercase tracking-wide mb-0.5 block">{f.label}</label>
                                {f.type === "readonly" ? (
                                  <input value={String((editValues as Record<string, unknown>)[f.key] || "")} readOnly className="border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs w-full bg-[#F8FAFC] text-[#9CA3AF]" />
                                ) : f.type === "select" ? (
                                  <select value={String((editValues as Record<string, unknown>)[f.key] || "")} onChange={e => setEditValues(p => ({ ...p, [f.key]: e.target.value }))} className="border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs w-full bg-white">
                                    <option value="">—</option>
                                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : f.type === "textarea" ? (
                                  <textarea value={String((editValues as Record<string, unknown>)[f.key] || "")} onChange={e => setEditValues(p => ({ ...p, [f.key]: e.target.value }))} rows={3} className="border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs w-full resize-none" />
                                ) : (
                                  <input value={String((editValues as Record<string, unknown>)[f.key] || "")} onChange={e => setEditValues(p => ({ ...p, [f.key]: e.target.value }))} className="border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs w-full" />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <textarea value={JSON.stringify(editValues, null, 2)} onChange={e => { try { setEditValues(JSON.parse(e.target.value)); setSaveError(null); } catch { setSaveError("JSON inválido"); } }} rows={6} className="border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs w-full font-mono resize-none" />
                        )}
                        {saveError && <p className="text-[11px] text-red-500">{saveError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveDoc(doc.type)} disabled={savingDoc} className="inline-flex items-center gap-1 bg-cf-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors">
                            {savingDoc ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Salvar
                          </button>
                          <button onClick={() => { setEditingDoc(null); setEditValues({}); setSaveError(null); }} className="text-xs text-[#9CA3AF] hover:text-[#374151] px-2 py-1.5 transition-colors">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Inspector modal: raw extracted_data JSON ── */}
      {inspectingIdx !== null && docs[inspectingIdx] && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setInspectingIdx(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB] bg-[#F8FAFC]">
              <div>
                <div className="text-sm font-semibold text-cf-navy">
                  Dados extraídos · {docs[inspectingIdx].type}
                </div>
                <div className="text-[11px] text-[#6B7280] truncate">
                  {docs[inspectingIdx].filename}
                </div>
              </div>
              <button
                onClick={() => setInspectingIdx(null)}
                className="text-[#9CA3AF] hover:text-[#374151] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            {(() => {
              const rec = (docs[inspectingIdx].extracted_data || {}) as Record<string, unknown>;
              const warnings = (rec._warnings as Array<{ field?: string; message?: string; path?: string[] }> | undefined) || [];
              return (
                <>
                  {warnings.length > 0 && (
                    <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 mb-1.5">
                        ⚠ {warnings.length} validação{warnings.length > 1 ? "ões" : ""} pendente{warnings.length > 1 ? "s" : ""}
                      </div>
                      <div className="space-y-1">
                        {warnings.map((w, j) => (
                          <div key={j} className="text-[11px] text-amber-900">
                            <span className="font-mono font-semibold">{w.field ?? w.path?.join(".") ?? "?"}</span>
                            <span className="mx-1.5 text-amber-500">·</span>
                            {w.message ?? "—"}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex-1 overflow-auto p-5">
                    <textarea
                      value={inspectDraft}
                      onChange={(e) => {
                        setInspectDraft(e.target.value);
                        setInspectDirty(true);
                        // Live-validate mas não bloqueia digitação
                        try { JSON.parse(e.target.value); setInspectError(null); }
                        catch { setInspectError("JSON inválido — revise antes de salvar"); }
                      }}
                      spellCheck={false}
                      className={`w-full h-full min-h-[300px] text-[11px] font-mono text-[#1F2937] p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 ${inspectError ? "border-red-300 focus:ring-red-400 bg-red-50/30" : "border-[#E5E7EB] focus:ring-cf-navy/40 bg-white"}`}
                    />
                  </div>
                  <div className="px-5 py-3 border-t border-[#E5E7EB] bg-[#F8FAFC] flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {inspectError ? (
                        <span className="text-[11px] text-red-600 font-semibold">{inspectError}</span>
                      ) : (
                        <span className="text-[11px] text-[#6B7280]">
                          {inspectDirty ? "Alterações não salvas" : "JSON editável — salva direto no banco"}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inspectDraft);
                        toast.success("JSON copiado");
                      }}
                      className="text-[12px] font-semibold text-[#9CA3AF] hover:text-cf-navy transition-colors"
                    >
                      Copiar
                    </button>
                    <button
                      onClick={() => setInspectingIdx(null)}
                      className="text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-100 transition-colors"
                    >
                      Fechar
                    </button>
                    <button
                      onClick={handleSaveInspectDoc}
                      disabled={inspectSaving || !inspectDirty || !!inspectError}
                      className="text-[12px] font-semibold text-white bg-cf-green rounded-lg px-3 py-1.5 hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {inspectSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Salvar
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── GroupCard — wrapper for same-company entries ──
function GroupCard({ group, userName, userId, highlightId, onDelete, onDeleteAll, onUpdate, v2Map }: {
  group: { key: string; name: string; cnpj: string | null; cols: DocumentCollection[] };
  userName: string;
  userId?: string;
  highlightId: string | null;
  onDelete: (id: string) => void;
  onDeleteAll: (ids: string[]) => void;
  onUpdate: (id: string, docs: CollectionDocument[]) => void;
  v2Map?: Map<string, string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const isGroup = group.cols.length > 1;
  const visible = showAll ? group.cols : group.cols.slice(0, 3);
  const hidden = group.cols.length - 3;

  const toggleCompare = (id: string) =>
    setCompareIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]);

  // Feature 4 — dados para sparkline de rating
  const ratingHistory = group.cols
    .filter(c => c.rating != null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(c => ({ rating: c.rating!, date: c.created_at }));

  const sparklineSvg = (() => {
    const vals = ratingHistory.map(r => r.rating);
    if (vals.length < 2) return null;
    const w = 56, h = 20, min = Math.min(...vals), max = Math.max(...vals), range = max - min || 0.1;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`).join(" ");
    const trend = vals[vals.length - 1] - vals[0];
    const c = trend > 0.2 ? "#16a34a" : trend < -0.2 ? "#dc2626" : "#6b7280";
    return { pts, color: c, trend };
  })();

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const supabase = createClient();
      const ids = group.cols.map(c => c.id);
      // Deleta arquivos do storage
      if (userId) {
        const { deleteCollectionFiles } = await import("@/lib/storage");
        for (const id of ids) {
          await deleteCollectionFiles(userId, id).catch(() => {});
        }
      }
      // Deleta do banco
      const { error } = await supabase.from("document_collections").delete().in("id", ids);
      if (error) throw error;
      onDeleteAll(ids);
      toast.success(`${ids.length} coletas de "${group.name}" excluídas`);
    } catch {
      toast.error("Erro ao excluir coletas");
    } finally {
      setDeletingAll(false);
      setConfirmDeleteAll(false);
    }
  };

  if (!isGroup) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <CollectionRow col={group.cols[0]} isGrouped={false} userName={userName} userId={userId} highlight={group.cols[0].id === highlightId} onDelete={onDelete} onUpdate={onUpdate} v2Map={v2Map} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      {/* Group header */}
      <div
        style={{ background: "#F8FAFF", borderLeft: "3px solid #1E3A5F" }}
        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:brightness-[0.98] transition-all border-b border-[#E8EFF9]"
        onClick={() => setCollapsed(p => !p)}
      >
        <div style={{ color: "#1E3A5F", flexShrink: 0 }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1E3A5F" }} className="truncate flex-1" title={group.name}>
          {group.name}
        </span>
        {group.cnpj && (
          <span className="text-[11px] text-[#9CA3AF] font-mono hidden sm:block">{group.cnpj}</span>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, background: "#E0E7FF", color: "#3730A3", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>
          {group.cols.length} entradas
        </span>

        {/* Feature 4 — Sparkline de rating */}
        {sparklineSvg && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }} title={`Evolução rating: ${ratingHistory.map(r => r.rating.toFixed(1)).join(" → ")}`}>
            <svg width={56} height={20}>
              <polyline points={sparklineSvg.pts} fill="none" stroke={sparklineSvg.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: sparklineSvg.color }}>
              {sparklineSvg.trend > 0.2 ? `+${sparklineSvg.trend.toFixed(1)}` : sparklineSvg.trend < -0.2 ? sparklineSvg.trend.toFixed(1) : "—"}
            </span>
          </div>
        )}

        {/* Feature 2 — Botão comparar */}
        <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
          <button
            onClick={() => { setShowCompare(true); setCompareIds(group.cols.slice(0, 2).map(c => c.id)); }}
            title="Comparar duas análises desta empresa lado a lado"
            style={{ fontSize: 11, fontWeight: 600, background: "rgba(32,59,136,0.08)", color: "#1E3A5F", border: "1px solid rgba(32,59,136,0.15)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Comparar
          </button>
        </div>

        {/* Botão apagar todas */}
        <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
          {!confirmDeleteAll ? (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              title={`Apagar todas as ${group.cols.length} coletas de ${group.name}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#CBD5E1] hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">Apagar {group.cols.length}?</span>
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll}
                className="h-6 text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-md px-2 transition-colors"
              >
                {deletingAll ? <Loader2 size={10} className="animate-spin" /> : "Sim"}
              </button>
              <button onClick={() => setConfirmDeleteAll(false)} className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#374151] px-1.5 transition-colors">
                Não
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rows */}
      {!collapsed && (
        <div className="divide-y divide-[#F8FAFC]">
          {visible.map(col => (
            <CollectionRow key={col.id} col={col} isGrouped userName={userName} userId={userId} highlight={col.id === highlightId} onDelete={onDelete} onUpdate={onUpdate} v2Map={v2Map} />
          ))}
          {!showAll && hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2.5 text-xs text-[#9CA3AF] hover:text-[#374151] hover:bg-[#FAFAFA] transition-colors"
            >
              + {hidden} anterior{hidden !== 1 ? "es" : ""}
            </button>
          )}
        </div>
      )}

      {/* Feature 2 — Modal de comparação */}
      {showCompare && (() => {
        const colA = group.cols.find(c => c.id === compareIds[0]);
        const colB = group.cols.find(c => c.id === compareIds[1]);
        const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
        const fmtFmm = (v: number | null | undefined) => v ? `R$ ${(v / 1000).toFixed(0)}K` : "—";
        const decBg: Record<string, string> = { APROVADO: "#DCFCE7", REPROVADO: "#FEE2E2", APROVACAO_CONDICIONAL: "#EDE9FE", QUESTIONAMENTO: "#ECFEFF" };
        const decColor: Record<string, string> = { APROVADO: "#16A34A", REPROVADO: "#DC2626", APROVACAO_CONDICIONAL: "#7C3AED", QUESTIONAMENTO: "#0891B2" };
        const decLabel: Record<string, string> = { APROVADO: "Aprovado", REPROVADO: "Reprovado", APROVACAO_CONDICIONAL: "Condicional", PENDENTE: "Pendente", QUESTIONAMENTO: "Questionamento" };
        const CompareCol = ({ col }: { col: DocumentCollection | undefined }) => !col ? null : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 10px" }}>{fmtDate(col.created_at)}</p>
            {/* Rating */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Rating</p>
              {col.rating != null ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: col.rating >= 7 ? "#16a34a" : col.rating >= 4 ? "#d97706" : "#dc2626" }}>{col.rating.toFixed(1)}</span>
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>/10</span>
                </div>
              ) : <span style={{ fontSize: 20, color: "#CBD5E1" }}>—</span>}
            </div>
            {/* Decisão */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Decisão</p>
              {col.decisao ? (
                <span style={{ fontSize: 11, fontWeight: 700, background: decBg[col.decisao] || "#F1F5F9", color: decColor[col.decisao] || "#6B7280", borderRadius: 999, padding: "3px 10px" }}>
                  {decLabel[col.decisao] || col.decisao}
                </span>
              ) : <span style={{ fontSize: 12, color: "#CBD5E1" }}>Pendente</span>}
            </div>
            {/* FMM */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>FMM 12m</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{fmtFmm(col.fmm_12m)}</p>
            </div>
            {/* Docs */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Documentos</p>
              <p style={{ fontSize: 13, color: "#374151" }}>{col.documents?.length ?? 0} doc{(col.documents?.length ?? 0) !== 1 ? "s" : ""}</p>
            </div>
          </div>
        );
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCompare(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ background: "linear-gradient(135deg, #1a2f6b, #203b88)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 2px" }}>Comparativo</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{group.name}</p>
                </div>
                <button onClick={() => setShowCompare(false)} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center" }}>
                  <X size={14} />
                </button>
              </div>
              {/* Seleção de entradas */}
              <div style={{ padding: "12px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {group.cols.map(col => {
                  const sel = compareIds.includes(col.id);
                  const idx = compareIds.indexOf(col.id);
                  return (
                    <button key={col.id} onClick={() => toggleCompare(col.id)}
                      style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: sel ? "1.5px solid #203b88" : "1.5px solid #E2E8F0", background: sel ? "#EEF2FF" : "#fff", color: sel ? "#203b88" : "#9CA3AF", display: "flex", alignItems: "center", gap: 4 }}>
                      {sel && <span style={{ width: 14, height: 14, borderRadius: "50%", background: idx === 0 ? "#203b88" : "#7C3AED", color: "#fff", fontSize: 9, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>}
                      {new Date(col.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      {col.rating != null && <span style={{ color: sel ? "#203b88" : "#CBD5E1", fontWeight: 700 }}> · {col.rating.toFixed(1)}</span>}
                    </button>
                  );
                })}
              </div>
              {/* Comparação lado a lado */}
              {compareIds.length === 2 && colA && colB ? (
                <div style={{ padding: "20px", display: "flex", gap: 16 }}>
                  <div style={{ width: 3, borderRadius: 99, background: "linear-gradient(180deg, #203b88, #7C3AED)", flexShrink: 0, alignSelf: "stretch" }} />
                  <CompareCol col={colA} />
                  <div style={{ width: 1, background: "#E2E8F0", flexShrink: 0 }} />
                  <CompareCol col={colB} />
                </div>
              ) : (
                <div style={{ padding: "32px 20px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                  Selecione 2 entradas acima para comparar
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Page entry ──
export default function HistoricoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center"><Loader2 size={22} className="text-[#203b88] animate-spin" /></div>}>
      <HistoricoContent />
    </Suspense>
  );
}

// Chave e forma dos filtros persistidos entre sessões do Histórico.
// Qualquer mudança nessa estrutura é compatível: valores ausentes caem no default.
const HISTORICO_FILTERS_KEY = "cf_historico_filters_v1";
type HistoricoFilters = {
  filterStatus: string;
  filterDecisao: string;
  filterRamo: string;
  filterPeriodo: string;
  hideEmpty: boolean;
};
const DEFAULT_HISTORICO_FILTERS: HistoricoFilters = {
  filterStatus: "",
  filterDecisao: "",
  filterRamo: "",
  filterPeriodo: "",
  hideEmpty: true,
};
function loadHistoricoFilters(): HistoricoFilters {
  if (typeof window === "undefined") return DEFAULT_HISTORICO_FILTERS;
  try {
    const raw = localStorage.getItem(HISTORICO_FILTERS_KEY);
    if (!raw) return DEFAULT_HISTORICO_FILTERS;
    const parsed = JSON.parse(raw) as Partial<HistoricoFilters>;
    return { ...DEFAULT_HISTORICO_FILTERS, ...parsed };
  } catch { return DEFAULT_HISTORICO_FILTERS; }
}

function HistoricoContent() {
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [v2Map, setV2Map] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Debounce de 300ms no search para evitar re-filtragem a cada tecla em listas grandes.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Estado inicial dos filtros vem do localStorage (preferências persistidas entre sessões).
  const initialFilters = typeof window !== "undefined" ? loadHistoricoFilters() : DEFAULT_HISTORICO_FILTERS;
  const [filterStatus, setFilterStatus] = useState(initialFilters.filterStatus);
  const [filterDecisao, setFilterDecisao] = useState(initialFilters.filterDecisao);
  const [filterRamo, setFilterRamo] = useState(initialFilters.filterRamo);
  const [filterPeriodo, setFilterPeriodo] = useState(initialFilters.filterPeriodo);
  const [showFilters, setShowFilters] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(initialFilters.hideEmpty);
  const [deletingEmpty, setDeletingEmpty] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [notifications, setNotifications] = useState<{ id: string; message: string; read: boolean; created_at: string }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();
  const { isSeen, markSeen } = useTooltips();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const filterRef = useRef<HTMLDivElement>(null);

  // Load collections
  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { setCollections([]); return; }
        const { data, error } = await supabase.from("document_collections").select("*").eq("user_id", u.id).order("created_at", { ascending: false });
        if (error) throw error;
        const cols = (data || []) as DocumentCollection[];
        setCollections(cols);
        if (cols.length > 0) {
          const ids = cols.map(c => c.id);
          const { data: scoreRows } = await supabase
            .from("score_operacoes")
            .select("collection_id, score_result")
            .in("collection_id", ids)
            .order("preenchido_em", { ascending: false });
          const map = new Map<string, string>();
          if (scoreRows) {
            for (const row of scoreRows) {
              if (!map.has(row.collection_id) && (row.score_result as { rating?: string } | null)?.rating) {
                map.set(row.collection_id, (row.score_result as { rating: string }).rating);
              }
            }
          }
          setV2Map(map);
        }
      } catch (err) { toast.error("Erro ao carregar histórico: " + (err instanceof Error ? err.message : "Verifique o Supabase")); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Load notifications
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setNotifications(data); });
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilters(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounce da busca: atualiza debouncedSearch 300ms após o usuário parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Persiste filtros em localStorage sempre que mudarem.
  useEffect(() => {
    try {
      localStorage.setItem(HISTORICO_FILTERS_KEY, JSON.stringify({
        filterStatus, filterDecisao, filterRamo, filterPeriodo, hideEmpty,
      }));
    } catch { /* ignore storage errors */ }
  }, [filterStatus, filterDecisao, filterRamo, filterPeriodo, hideEmpty]);

  const activeFilters = [filterStatus, filterDecisao, filterRamo, filterPeriodo].filter(Boolean).length;

  // Coletas sem nenhum documento — não têm utilidade prática
  const isEmptyCollection = (col: DocumentCollection) =>
    (col.documents || []).length === 0 && !col.rating && !col.ai_analysis;

  const emptyCollections = useMemo(
    () => collections.filter(isEmptyCollection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collections]
  );

  const handleDeleteEmpty = async () => {
    if (emptyCollections.length === 0) return;
    setDeletingEmpty(true);
    try {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error("Não autenticado");
      const ids = emptyCollections.map(c => c.id);
      const { error } = await supabase
        .from("document_collections")
        .delete()
        .in("id", ids)
        .eq("user_id", u.id);
      if (error) throw error;
      setCollections(prev => prev.filter(c => !ids.includes(c.id)));
      toast.success(`${ids.length} coleta${ids.length !== 1 ? "s" : ""} vazia${ids.length !== 1 ? "s" : ""} excluída${ids.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error("Erro ao excluir vazias: " + (err instanceof Error ? err.message : "tente novamente"));
    } finally {
      setDeletingEmpty(false);
    }
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const userInitial = userName.charAt(0).toUpperCase() || "U";

  // Derive all available ramos for filter
  const allRamos = useMemo(() => {
    const set = new Set<string>();
    for (const col of collections) {
      const cnpjDoc = (col.documents || []).find((d: CollectionDocument) => d.type === "cnpj");
      const s = derivarSetor(cnpjDoc?.extracted_data?.cnaePrincipal as string | undefined);
      if (s) set.add(s);
    }
    return Array.from(set).sort();
  }, [collections]);

  // Filter + group
  const grouped = useMemo(() => {
    const now = new Date();
    const filtered = collections.filter(col => {
      // Oculta coletas sem documentos por padrão
      if (hideEmpty && isEmptyCollection(col)) return false;
      const name = (col.company_name || col.label || "").toLowerCase();
      const cnpj = (col.cnpj || "").toLowerCase();
      // Usa debouncedSearch (em vez de search cru) para não filtrar a cada tecla.
      const q = debouncedSearch.toLowerCase().trim();
      if (q && !name.includes(q) && !cnpj.includes(q)) return false;
      if (filterStatus && col.status !== filterStatus) return false;
      if (filterDecisao && col.decisao !== filterDecisao) return false;
      if (filterRamo) {
        const cnpjDoc = (col.documents || []).find((d: CollectionDocument) => d.type === "cnpj");
        const s = derivarSetor(cnpjDoc?.extracted_data?.cnaePrincipal as string | undefined);
        if (s !== filterRamo) return false;
      }
      if (filterPeriodo) {
        const days = parseInt(filterPeriodo);
        if ((now.getTime() - new Date(col.created_at).getTime()) > days * 86400000) return false;
      }
      return true;
    });

    const map = new Map<string, DocumentCollection[]>();
    for (const col of filtered) {
      const key = col.cnpj || col.company_name || col.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(col);
    }
    return Array.from(map.entries()).map(([key, cols]) => ({
      key,
      name: cols[0].company_name || cols[0].label || "Sem título",
      cnpj: cols[0].cnpj,
      cols: cols.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, debouncedSearch, filterStatus, filterDecisao, filterRamo, filterPeriodo, hideEmpty]);

  const totalEntries = grouped.reduce((s, g) => s + g.cols.length, 0);
  const visibleGroups = grouped.slice(0, pageSize);
  const hasMore = grouped.length > pageSize;

  const handleDelete = useCallback((id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleDeleteAll = useCallback((ids: string[]) => {
    setCollections(prev => prev.filter(c => !ids.includes(c.id)));
  }, []);

  const handleUpdate = useCallback((id: string, docs: CollectionDocument[]) => {
    setCollections(prev => prev.map(c => c.id === id ? { ...c, documents: docs } : c));
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex flex-col">

      {/* ══ CONTENT ══ */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-6 pb-8">

        {/* ── Hero header ── */}
        <div style={{ background: "linear-gradient(135deg, #1a2f6b 0%, #203b88 60%, #1e3a8a 100%)", padding: "28px 28px 24px", borderRadius: "0 0 20px 20px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(168,217,107,0.15)", border: "1px solid rgba(168,217,107,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Clock size={20} style={{ color: "#a8d96b" }} />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.3px" }}>Histórico de Relatórios</h1>
                {!loading && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "3px 0 0" }}>
                    {totalEntries} coleta{totalEntries !== 1 ? "s" : ""} · {grouped.length} empresa{grouped.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
            {!loading && (
              <div style={{ display: "flex", gap: 20 }}>
                {[
                  { label: "Total", value: totalEntries, color: "#fff" },
                  { label: "Empresas", value: grouped.length, color: "#a8d96b" },
                ].map((s) => (
                  <div key={s.label} style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", margin: "3px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          {/* Aviso de coletas vazias */}
          {!loading && emptyCollections.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-4 flex-wrap">
              <p className="text-xs text-amber-700">
                <span className="font-semibold">{emptyCollections.length} coleta{emptyCollections.length !== 1 ? "s" : ""} sem documentos</span>
                {hideEmpty ? " ocultada" : " visível"}{emptyCollections.length !== 1 ? "s" : ""} no histórico
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setHideEmpty(p => !p)}
                  className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 bg-transparent border-none cursor-pointer"
                >
                  {hideEmpty ? "Mostrar" : "Ocultar"}
                </button>
                <span className="text-amber-300 text-xs">|</span>
                <button
                  onClick={handleDeleteEmpty}
                  disabled={deletingEmpty}
                  className="text-xs font-medium text-red-600 hover:text-red-800 underline underline-offset-2 bg-transparent border-none cursor-pointer disabled:opacity-50"
                >
                  {deletingEmpty ? "Excluindo…" : "Excluir todas"}
                </button>
              </div>
            </div>
          )}

          {/* ── Funil de Crédito Profissional ── */}
          {!loading && collections.length > 0 && (() => {
            const total = collections.length;
            const finalizadas = collections.filter(c => c.status === "finished").length;
            const aprovadas = collections.filter(c => c.decisao === "APROVADO").length;
            const condicionais = collections.filter(c => c.decisao === "APROVACAO_CONDICIONAL").length;
            const reprovadas = collections.filter(c => c.decisao === "REPROVADO").length;
            const emAndamento = collections.filter(c => c.status !== "finished").length;
            const taxaAprov = finalizadas > 0 ? Math.round(((aprovadas + condicionais) / finalizadas) * 100) : 0;

            const ratings = collections.map(c => {
              const ai = c.ai_analysis as Record<string, unknown> | null;
              const parecer = ai?.parecerAnalista as Record<string, unknown> | null;
              return parecer?.ratingAnalista != null ? Number(parecer.ratingAnalista) : c.rating;
            }).filter((r): r is number => r != null && r > 0);
            const ratingMedio = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

            const stages = [
              { label: "Recebidas", sub: "total de análises", count: total, color: "#1E3A5F", gradient: ["#1a3560", "#2a4db5"] },
              { label: "Finalizadas", sub: "análise concluída", count: finalizadas, color: "#2563EB", gradient: ["#1d4ed8", "#3b82f6"] },
              { label: "Pré-aprovadas", sub: "aprovadas + condicionais", count: aprovadas + condicionais, color: "#059669", gradient: ["#047857", "#10b981"] },
              { label: "Aprovação plena", sub: "sem restrições", count: aprovadas, color: "#15803d", gradient: ["#166534", "#22c55e"] },
            ];
            const VW = 320; const SH = 44; const GAP = 3; const TH = stages.length * SH + (stages.length - 1) * GAP;

            return (
              <div style={{ background: "linear-gradient(135deg, #ffffff 0%, #f8faff 100%)", borderRadius: 16, border: "1px solid #e2e8f0", padding: 0, marginBottom: 16, boxShadow: "0 2px 12px rgba(30,58,95,0.06)", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>Funil de Crédito</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>{total} análise{total !== 1 ? "s" : ""} no período</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{taxaAprov}%</p>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Taxa de aprovação</p>
                    </div>
                    {ratingMedio != null && (
                      <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.15)" }} />
                    )}
                    {ratingMedio != null && (
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 22, fontWeight: 800, color: ratingMedio >= 7 ? "#86efac" : ratingMedio >= 4 ? "#fde68a" : "#fca5a5", lineHeight: 1 }}>{ratingMedio.toFixed(1)}</p>
                        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rating médio</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Body: SVG funnel + legend */}
                <div style={{ display: "flex", alignItems: "center", padding: "20px 24px", gap: 28 }}>
                  {/* SVG Funnel */}
                  <svg viewBox={`0 0 ${VW} ${TH}`} style={{ flex: "0 0 auto", width: "min(260px, 45%)", height: "auto" }} xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      {stages.map((s, i) => (
                        <linearGradient key={`fg-${i}`} id={`hfg-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor={s.gradient[0]} />
                          <stop offset="100%" stopColor={s.gradient[1]} />
                        </linearGradient>
                      ))}
                    </defs>
                    {stages.map((s, i) => {
                      const MIN_W = 0.22;
                      const topRatio = Math.max(s.count / total, MIN_W);
                      const nextRatio = i < stages.length - 1
                        ? Math.max(stages[i + 1].count / total, MIN_W)
                        : Math.max(s.count / total * 0.65, MIN_W);
                      const topW = topRatio * VW; const botW = nextRatio * VW;
                      const topL = (VW - topW) / 2; const topR = VW - topL;
                      const botL = (VW - botW) / 2; const botR = VW - botL;
                      const y = i * (SH + GAP);
                      const r = 4;
                      const pts = `M${topL + r},${y} L${topR - r},${y} Q${topR},${y} ${topR},${y + r} L${botR},${y + SH - r} Q${botR},${y + SH} ${botR - r},${y + SH} L${botL + r},${y + SH} Q${botL},${y + SH} ${botL},${y + SH - r} L${topL},${y + r} Q${topL},${y} ${topL + r},${y} Z`;
                      return (
                        <g key={i}>
                          <path d={pts} fill={`url(#hfg-${i})`} opacity="0.9" />
                          <text x={VW / 2} y={y + SH / 2 + 1} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 15, fontWeight: 800, fill: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
                            {s.count}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Legend */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                    {stages.map((s, i) => {
                      const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                      const prev = i > 0 ? stages[i - 1].count : null;
                      const conv = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
                      return (
                        <div key={i}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})`, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#1f2937", flex: 1 }}>{s.label}</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.count}</span>
                            <span style={{ fontSize: 10, color: "#9ca3af", width: 32, textAlign: "right", fontWeight: 600 }}>{pct}%</span>
                          </div>
                          <div style={{ paddingLeft: 18, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, color: "#9ca3af" }}>{s.sub}</span>
                            {conv != null && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: conv >= 70 ? "#16a34a" : conv >= 40 ? "#d97706" : "#dc2626", background: conv >= 70 ? "#f0fdf4" : conv >= 40 ? "#fffbeb" : "#fef2f2", borderRadius: 4, padding: "1px 5px" }}>
                                {conv}% conv.
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer: métricas adicionais */}
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "10px 24px", display: "flex", gap: 20, flexWrap: "wrap", background: "#fafbfd" }}>
                  {[
                    { label: "Em andamento", value: String(emAndamento), color: "#d97706", icon: "⏳" },
                    { label: "Condicionais", value: String(condicionais), color: "#7c3aed", icon: "⚠" },
                    { label: "Reprovadas", value: String(reprovadas), color: "#dc2626", icon: "✕" },
                  ].map((m, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10 }}>{m.icon}</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{m.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: m.color }}>{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Search + Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar empresa ou CNPJ..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#203b88]/15 focus:border-[#203b88]/40 placeholder:text-[#9CA3AF]"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#374151] transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="relative" ref={filterRef}>
              <OnboardingTooltip
                id="historico-filtros-rating"
                message="Use os filtros para encontrar análises por status, decisão (Aprovado/Reprovado), setor ou período. O badge A/B/C/D em cada card é o rating do Score V2 — A=baixo risco, D=alto risco."
                position="bottom"
                isSeen={isSeen("historico-filtros-rating")}
                onSeen={() => markSeen("historico-filtros-rating")}
              >
              <button
                onClick={() => setShowFilters(p => !p)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-[#E2E8F0] rounded-lg hover:border-[#203b88]/40 transition-colors"
                style={{ color: activeFilters > 0 ? "#203b88" : "#6B7280" }}
              >
                <Filter size={14} />
                Filtros
                {activeFilters > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#203b88] text-white text-[10px] font-bold flex items-center justify-center">{activeFilters}</span>
                )}
              </button>
              </OnboardingTooltip>
              {showFilters && (
                <div className="absolute left-0 top-11 bg-white rounded-xl border border-[#E2E8F0] shadow-lg z-20 w-72 p-4 space-y-4">
                  {/* Status */}
                  <div>
                    <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-2">Status</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {[{ v: "in_progress", l: "Em andamento" }, { v: "finished", l: "Finalizada" }].map(s => (
                        <button key={s.v} onClick={() => setFilterStatus(filterStatus === s.v ? "" : s.v)}
                          className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                          style={filterStatus === s.v ? { background: "#203b88", color: "white", borderColor: "#203b88" } : { borderColor: "#E2E8F0", color: "#6B7280" }}>
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Decisão */}
                  <div>
                    <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-2">Decisão</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {[{ v: "APROVADO", l: "Aprovado" }, { v: "APROVACAO_CONDICIONAL", l: "Condicional" }, { v: "REPROVADO", l: "Reprovado" }, { v: "PENDENTE", l: "Pendente" }, { v: "QUESTIONAMENTO", l: "Questionamento" }].map(d => (
                        <button key={d.v} onClick={() => setFilterDecisao(filterDecisao === d.v ? "" : d.v)}
                          className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                          style={filterDecisao === d.v ? { background: "#203b88", color: "white", borderColor: "#203b88" } : { borderColor: "#E2E8F0", color: "#6B7280" }}>
                          {d.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Ramo */}
                  {allRamos.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-2">Ramo</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {allRamos.map(r => (
                          <button key={r} onClick={() => setFilterRamo(filterRamo === r ? "" : r)}
                            className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                            style={filterRamo === r ? { background: "#203b88", color: "white", borderColor: "#203b88" } : { borderColor: "#E2E8F0", color: "#6B7280" }}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Período */}
                  <div>
                    <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-2">Período</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {[{ v: "7", l: "7 dias" }, { v: "30", l: "30 dias" }, { v: "90", l: "90 dias" }].map(p => (
                        <button key={p.v} onClick={() => setFilterPeriodo(filterPeriodo === p.v ? "" : p.v)}
                          className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                          style={filterPeriodo === p.v ? { background: "#203b88", color: "white", borderColor: "#203b88" } : { borderColor: "#E2E8F0", color: "#6B7280" }}>
                          {p.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {activeFilters > 0 && (
                    <button onClick={() => { setFilterStatus(""); setFilterDecisao(""); setFilterRamo(""); setFilterPeriodo(""); }} className="w-full text-xs text-red-500 hover:text-red-600 transition-colors pt-1 border-t border-[#F1F5F9]">
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] px-4 h-14 flex items-center gap-3">
                <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-56 rounded" />
                  <div className="skeleton h-2.5 w-32 rounded" />
                </div>
                <div className="skeleton h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 gap-5 text-center">
            <div style={{ width: 76, height: 76, borderRadius: 22, background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(32,59,136,0.10)" }}>
              {search || activeFilters > 0
                ? <Search size={32} style={{ color: "#203b88", opacity: 0.45 }} />
                : <Inbox size={32} style={{ color: "#203b88", opacity: 0.45 }} />}
            </div>
            <div style={{ maxWidth: 320 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
                {search || activeFilters > 0 ? "Nenhum relatório encontrado" : "Nenhuma coleta salva ainda"}
              </h3>
              <p style={{ fontSize: 13, color: "#9CA3AF", lineHeight: 1.6, margin: 0 }}>
                {search || activeFilters > 0
                  ? "Tente outros filtros ou termos diferentes para encontrar o que procura."
                  : "Finalize uma coleta e ela aparecerá aqui. Todas as suas análises de crédito ficam registradas nesta tela."}
              </p>
            </div>
            {search || activeFilters > 0 ? (
              <button
                onClick={() => { setSearch(""); setFilterStatus(""); setFilterDecisao(""); setFilterRamo(""); setFilterPeriodo(""); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, background: "white", color: "#374151", fontSize: 13, fontWeight: 600, border: "1px solid #E2E8F0", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
              >
                <X size={13} /> Limpar filtros
              </button>
            ) : (
              <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 22px", borderRadius: 10, background: "linear-gradient(135deg, #1a2f6b, #203b88)", color: "white", fontSize: 13, fontWeight: 700, textDecoration: "none", boxShadow: "0 3px 10px rgba(32,59,136,0.28)" }}>
                <Plus size={14} /> Nova Coleta
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGroups.map(group => (
              <GroupCard
                key={group.key}
                group={group}
                userName={userName}
                userId={user?.id}
                highlightId={highlightId}
                onDelete={handleDelete}
                onDeleteAll={handleDeleteAll}
                onUpdate={handleUpdate}
                v2Map={v2Map}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setPageSize(p => p + 20)}
                  className="btn-secondary text-xs"
                >
                  Carregar mais {Math.min(grouped.length - pageSize, 20)} grupos
                </button>
              </div>
            )}
            <p className="text-center text-[11px] text-[#9CA3AF] pt-2">
              Mostrando {visibleGroups.length} de {grouped.length} grupo{grouped.length !== 1 ? "s" : ""} · {totalEntries} entrada{totalEntries !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ background: "#f1f5f9", borderTop: "1px solid #e2e8f0", marginTop: 40 }}>
        <div style={{ height: 3, background: "linear-gradient(90deg, #73b815, #a8d96b 60%, transparent)" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <svg width="150" height="22" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
            <circle cx="31" cy="49" r="4.5" fill="#203b88" />
            <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.5">
              <tspan fill="#203b88">capital</tspan><tspan fill="#73b815">finanças</tspan>
            </text>
          </svg>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, letterSpacing: "0.01em" }}>
            © {new Date().getFullYear()} Capital Finanças · Uso interno e confidencial
          </p>
        </div>
      </footer>
    </div>
  );
}
