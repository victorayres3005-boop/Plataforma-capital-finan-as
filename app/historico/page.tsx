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
  LogOut, User, ChevronDown as ChDown,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { deleteCollectionFiles } from "@/lib/storage";

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

function getStatusDisplay(col: DocumentCollection): { label: string; bg: string; color: string } {
  if (col.status !== "finished") return { label: "Em andamento", bg: "#FEF3C7", color: "#D97706" };
  switch (col.decisao) {
    case "APROVADO":              return { label: "Aprovado",    bg: "#DCFCE7", color: "#16A34A" };
    case "APROVACAO_CONDICIONAL": return { label: "Condicional", bg: "#EDE9FE", color: "#7C3AED" };
    case "REPROVADO":             return { label: "Reprovado",   bg: "#FEE2E2", color: "#DC2626" };
    default:                      return { label: "Pendente",    bg: "#F1F5F9", color: "#6B7280" };
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
function CollectionRow({ col, isGrouped, userId, highlight, onDelete, onUpdate }: {
  col: DocumentCollection;
  isGrouped: boolean;
  userName: string;
  userId?: string;
  highlight: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, docs: CollectionDocument[]) => void;
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

  const docs = (col.documents || []) as CollectionDocument[];
  const cnpjDoc = docs.find(d => d.type === "cnpj");
  const setor = derivarSetor(cnpjDoc?.extracted_data?.cnaePrincipal as string | undefined);
  const visitaDoc = docs.find(d => d.type === "relatorio_visita");
  const pleito = visitaDoc?.extracted_data?.pleito as string | undefined;

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
      let analysis: Record<string, unknown> | null = null;
      try {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: extractedData }) });
        if (res.ok) { const json = await res.json(); if (json.success) analysis = json.analysis; }
      } catch { /* sem análise IA */ }
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
        {/* Grade circle */}
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: grade.bg, border: `1.5px solid ${grade.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: grade.color }}>{grade.letter}</span>
        </div>

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
        <span style={{ fontSize: 11, fontWeight: 600, background: status.bg, color: status.color, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap", flexShrink: 0 }}>
          {status.label}
        </span>

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
                { k: "prazoRevisao", l: "Prazo de Revisão" },
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
                const wasEdited = !!(doc.extracted_data as Record<string, unknown>)?._editedManually;
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
                        <p className="text-xs font-semibold text-[#374151]">{doc.type} {wasEdited && <span className="text-[9px] bg-cf-navy/10 text-cf-navy px-1 py-0.5 rounded ml-1">Editado</span>}</p>
                        <p className="text-[10px] text-[#9CA3AF] truncate">{doc.filename}</p>
                      </div>
                      <span className="text-[10px] text-[#9CA3AF] font-mono">{Object.keys(doc.extracted_data || {}).length} campos</span>
                      {!isEditing && (
                        <button onClick={() => { setEditingDoc(doc.type); setEditValues({ ...(doc.extracted_data || {}) }); setSaveError(null); }} className="text-[11px] font-semibold text-[#9CA3AF] hover:text-cf-navy transition-colors flex items-center gap-1">
                          <Pencil size={10} /> Editar
                        </button>
                      )}
                    </div>
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
    </div>
  );
}

// ── GroupCard — wrapper for same-company entries ──
function GroupCard({ group, userName, userId, highlightId, onDelete, onDeleteAll, onUpdate }: {
  group: { key: string; name: string; cnpj: string | null; cols: DocumentCollection[] };
  userName: string;
  userId?: string;
  highlightId: string | null;
  onDelete: (id: string) => void;
  onDeleteAll: (ids: string[]) => void;
  onUpdate: (id: string, docs: CollectionDocument[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const isGroup = group.cols.length > 1;
  const visible = showAll ? group.cols : group.cols.slice(0, 3);
  const hidden = group.cols.length - 3;

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
        <CollectionRow col={group.cols[0]} isGrouped={false} userName={userName} userId={userId} highlight={group.cols[0].id === highlightId} onDelete={onDelete} onUpdate={onUpdate} />
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
            <CollectionRow key={col.id} col={col} isGrouped userName={userName} userId={userId} highlight={col.id === highlightId} onDelete={onDelete} onUpdate={onUpdate} />
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

function HistoricoContent() {
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDecisao, setFilterDecisao] = useState("");
  const [filterRamo, setFilterRamo] = useState("");
  const [filterPeriodo, setFilterPeriodo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [notifications, setNotifications] = useState<{ id: string; message: string; read: boolean; created_at: string }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();
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
        setCollections((data || []) as DocumentCollection[]);
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

  const activeFilters = [filterStatus, filterDecisao, filterRamo, filterPeriodo].filter(Boolean).length;

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
      const name = (col.company_name || col.label || "").toLowerCase();
      const cnpj = (col.cnpj || "").toLowerCase();
      const q = search.toLowerCase().trim();
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
  }, [collections, search, filterStatus, filterDecisao, filterRamo, filterPeriodo]);

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

      {/* ══ NAVBAR (same as Consolidador) ══ */}
      <header className="sticky top-0 z-50" style={{ backgroundColor: "#ffffff", borderBottom: "1px solid #F1F5F9", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", height: "56px" }}>
        <div className="max-w-6xl mx-auto px-6" style={{ height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/"><Logo /></Link>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <a href="/historico" className="hidden sm:flex items-center gap-1.5" style={{ fontSize: "13px", fontWeight: 600, color: "#203b88", padding: "5px 10px", borderRadius: "6px", textDecoration: "none", background: "#EFF6FF" }}>
              <Clock size={14} /> Histórico
            </a>
            <a href="/ajuda" className="hidden sm:flex items-center justify-center" style={{ color: "#94A3B8", padding: "6px", borderRadius: "6px", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#475569"; (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <HelpCircle size={18} />
            </a>
            <a href="/configuracoes" className="hidden sm:flex items-center justify-center" style={{ color: "#94A3B8", padding: "6px", borderRadius: "6px", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#475569"; (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <Settings size={18} />
            </a>
            {!authLoading && user && (
              <>
                <div className="relative" style={{ marginLeft: "4px" }}>
                  <button onClick={() => setShowNotifications(p => !p)} style={{ position: "relative", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", padding: 0, transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; (e.currentTarget as HTMLElement).style.color = "#475569"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}>
                    <Bell size={18} />
                    {unreadCount > 0 && <span style={{ position: "absolute", top: "-2px", right: "-2px", minWidth: "16px", height: "16px", borderRadius: "99px", background: "#22c55e", color: "white", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{unreadCount}</span>}
                  </button>
                  {showNotifications && (
                    <div className="absolute right-0 bg-white rounded-xl border border-[#E2E8F0] shadow-lg z-50 overflow-hidden" style={{ top: "40px", width: "300px" }}>
                      <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
                        <p className="text-xs font-bold text-[#374151]">Notificações {unreadCount > 0 && `(${unreadCount})`}</p>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="text-xs text-[#9CA3AF] text-center py-8">Nenhuma notificação</p>
                        ) : notifications.map(n => (
                          <div key={n.id} className={`px-4 py-3 border-b border-[#F1F5F9] last:border-0 ${n.read ? "" : "bg-[#203b88]/[0.03]"}`}>
                            <p className="text-xs text-[#374151]">{n.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <a href="/perfil" className="hidden sm:flex items-center gap-2" style={{ padding: "4px 8px", borderRadius: "8px", textDecoration: "none", marginLeft: "4px", transition: "background 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <div style={{ width: "26px", height: "26px", borderRadius: "99px", background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "white" }}>{userInitial}</span>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#374151", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</span>
                  <ChDown size={12} style={{ color: "#9CA3AF" }} />
                </a>
                <button onClick={signOut} className="hidden sm:flex items-center gap-1.5" style={{ fontSize: "13px", fontWeight: 400, color: "#94A3B8", background: "transparent", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: "6px", transition: "color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}>
                  <LogOut size={14} /> Sair
                </button>
              </>
            )}
            {!authLoading && !user && (
              <a href="/login" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-full text-white hover:opacity-80 transition-opacity" style={{ backgroundColor: "#73b815" }}>
                <User size={13} /> Entrar
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ══ CONTENT ══ */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-6 py-8">

        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h1 className="text-lg font-bold text-[#111827]">Histórico de Relatórios</h1>
              {!loading && (
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  {totalEntries} coleta{totalEntries !== 1 ? "s" : ""} encontrada{totalEntries !== 1 ? "s" : ""}
                  {grouped.length !== totalEntries && ` · ${grouped.length} empresa${grouped.length !== 1 ? "s" : ""}`}
                </p>
              )}
            </div>
            <Link href="/" className="btn-secondary text-xs flex-shrink-0">
              ← Voltar
            </Link>
          </div>

          {/* ── Funil de Crédito + Métricas ── */}
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

            const funnel = [
              { label: "Recebidas", count: total, color: "#1E3A5F", bg: "#DBEAFE" },
              { label: "Finalizadas", count: finalizadas, color: "#2563EB", bg: "#C7D2FE" },
              { label: "Aprovadas", count: aprovadas + condicionais, color: "#16A34A", bg: "#BBF7D0" },
            ];

            return (
              <div style={{ background: "white", borderRadius: 14, border: "1px solid #E2E8F0", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                {/* Funil horizontal */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  {funnel.map((s, i) => {
                    const pct = total > 0 ? Math.max((s.count / total) * 100, 12) : 0;
                    return (
                      <div key={i} style={{ flex: `${pct} 0 0`, minWidth: 0 }}>
                        <div style={{ background: s.bg, borderRadius: 8, padding: "8px 12px", borderLeft: `3px solid ${s.color}`, transition: "all 0.3s" }}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: s.color, flexShrink: 0 }}>{s.count}</span>
                          </div>
                          {i > 0 && total > 0 && (
                            <div style={{ fontSize: 9, color: s.color, opacity: 0.7, fontWeight: 600, marginTop: 2 }}>
                              {Math.round((s.count / total) * 100)}% do total
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Métricas resumidas abaixo */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "Em andamento", value: String(emAndamento), color: "#D97706" },
                    { label: "Condicionais", value: String(condicionais), color: "#7C3AED" },
                    { label: "Reprovadas", value: String(reprovadas), color: "#DC2626" },
                    { label: "Taxa aprov.", value: `${taxaAprov}%`, color: taxaAprov >= 60 ? "#16A34A" : "#D97706" },
                    { label: "Rating médio", value: ratingMedio != null ? `${ratingMedio.toFixed(1)}/10` : "—", color: ratingMedio != null ? (ratingMedio >= 7 ? "#16A34A" : ratingMedio >= 4 ? "#D97706" : "#DC2626") : "#9CA3AF" },
                  ].map((m, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: m.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#6B7280" }}>{m.label}:</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</span>
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
                      {[{ v: "APROVADO", l: "Aprovado" }, { v: "APROVACAO_CONDICIONAL", l: "Condicional" }, { v: "REPROVADO", l: "Reprovado" }, { v: "PENDENTE", l: "Pendente" }].map(d => (
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
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center">
              {search || activeFilters > 0 ? <Search size={24} className="text-[#CBD5E1]" /> : <Inbox size={24} className="text-[#CBD5E1]" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[#374151] mb-1">
                {search || activeFilters > 0 ? "Nenhum relatório encontrado" : "Nenhuma coleta salva ainda"}
              </h3>
              <p className="text-sm text-[#9CA3AF]">
                {search || activeFilters > 0 ? "Tente outros filtros ou inicie uma nova análise" : "Finalize uma coleta para vê-la aqui."}
              </p>
            </div>
            {search || activeFilters > 0 ? (
              <button onClick={() => { setSearch(""); setFilterStatus(""); setFilterDecisao(""); setFilterRamo(""); setFilterPeriodo(""); }} className="btn-secondary text-xs mt-2">
                Limpar busca
              </button>
            ) : (
              <Link href="/" className="btn-green mt-2">+ Nova Coleta</Link>
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
      <footer className="border-t border-[#E2E8F0] mt-16 py-6">
        <p className="text-center text-[11px] text-[#9CA3AF]">
          &copy; {new Date().getFullYear()} Capital Finanças — Documentos processados com segurança
        </p>
      </footer>
    </div>
  );
}
