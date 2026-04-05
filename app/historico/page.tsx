"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DocumentCollection, CollectionDocument } from "@/types";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, ChevronUp, FileText, Building2, BarChart3, ScrollText,
  Loader2, Pencil, Check, RotateCcw, Inbox, LogOut, User, Trash2, Download
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { listFiles, getDownloadUrl, deleteCollectionFiles } from "@/lib/storage";

function Logo({ light = false }: { light?: boolean }) {
  const textColor = light ? "#ffffff" : "#203b88";
  return (
    <svg width="196" height="27" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke={textColor} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={textColor} />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.5">
        <tspan fill={textColor}>capital</tspan>
        <tspan fill="#a8d96b">finanças</tspan>
      </text>
    </svg>
  );
}

const docIcon: Record<string, React.ReactNode> = {
  cnpj: <Building2 size={14} className="text-cf-navy" />,
  contrato_social: <ScrollText size={14} className="text-cf-green" />,
  scr_bacen: <BarChart3 size={14} className="text-cf-warning" />,
  outro: <FileText size={14} className="text-cf-text-3" />,
};

const docLabel: Record<string, string> = {
  cnpj: "Cartão CNPJ",
  contrato_social: "Contrato Social",
  scr_bacen: "SCR / Bacen",
  outro: "Outro documento",
};

// ── Gerador de relatório HTML direto do histórico ──
function gerarRelatorioHTML(
  col: DocumentCollection,
  data: Record<string, Record<string, unknown>>,
  analysis: Record<string, unknown> | null,
): string {
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

  const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#1a1a1a;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:820px;margin:0 auto;padding:48px 40px}.doc-header{padding-bottom:20px;border-bottom:1px solid #e5e5e5;margin-bottom:32px}.brand{font-size:14px;font-weight:300;color:#1a1a1a}.brand-sub{font-size:10px;letter-spacing:0.15em;color:#666;text-transform:uppercase;margin-top:2px}.doc-title{text-align:center;margin:28px 0 8px}.doc-title h1{font-size:28px;font-weight:300}.doc-title .company{font-size:16px;font-weight:600;margin-top:8px}.doc-title .meta{font-size:12px;color:#999;margin-top:4px}.section{margin-bottom:36px;page-break-inside:avoid}.sec-num{display:block;font-size:11px;color:#999;margin-bottom:4px}.sec-heading{font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:#1a1a1a}.sec-rule{border:none;border-top:1px solid #e5e5e5;margin:8px 0 24px}table.kv{width:100%;border-collapse:collapse}table.kv td{padding:8px 0;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:top}table.kv tr:last-child td{border-bottom:none}td.lbl{width:220px;color:#666}td.val{color:#1a1a1a;font-weight:500}td.muted{color:#999}.dtable{width:100%;border-collapse:collapse;margin-bottom:20px}.dtable th{background:#f8f9fa;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;padding:10px 12px;font-weight:500;text-align:left;border-bottom:1px solid #e5e5e5}.dtable td{font-size:13px;padding:10px 12px;border-bottom:1px solid #f0f0f0}.dtable tr:last-child td{border-bottom:none}.decision-badge{display:inline-block;font-size:13px;font-weight:500;padding:8px 20px;border-radius:4px;border:1px solid}.decision-approved{background:#f0fdf4;color:#16a34a;border-color:#bbf7d0}.decision-pending{background:#fffbeb;color:#d97706;border-color:#fde68a}.decision-rejected{background:#fef2f2;color:#dc2626;border-color:#fecaca}.alert-line{margin-bottom:8px}.alert-badge{display:inline-block;font-size:10px;padding:2px 8px;border-radius:3px;font-weight:500;margin-right:10px}.alert-critico{background:#fef2f2;color:#dc2626}.alert-moderado{background:#fffbeb;color:#d97706}.alert-info{background:#eff6ff;color:#2563eb}.alert-positivo{background:#f0fdf4;color:#16a34a}.alert-text{font-size:13px;color:#444}.sub-heading{font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #f0f0f0}.doc-footer{border-top:1px solid #e5e5e5;padding-top:12px;margin-top:40px;display:flex;justify-content:space-between}.doc-footer span{font-size:10px;color:#999}@media print{.page{padding:0;max-width:100%}.section{page-break-inside:avoid}}@page{margin:20mm 15mm}`;

  const row = (label: string, value: unknown) => {
    const v = String(value || "");
    const empty = !v || v === "—" || v === "undefined";
    return `<tr><td class="lbl">${esc(label)}</td><td class="val${empty ? " muted" : ""}">${empty ? "—" : esc(v)}</td></tr>`;
  };

  const socios = (qsa.quadroSocietario as Record<string, unknown>[] || []).filter(s => s.nome);
  const meses = (faturamento.meses as { mes: string; valor: string }[] || []).filter(m => m.mes);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatorio — ${esc(col.company_name || col.label)}</title><style>${css}</style></head><body><div class="page">
<div class="doc-header"><div class="brand">capital financas</div><div class="brand-sub">CONSOLIDADOR DE DOCUMENTOS</div></div>
<div class="doc-title"><h1>Relatorio de Due Diligence</h1><div class="company">${esc(col.company_name || col.label)}</div><div class="meta">CNPJ ${esc(col.cnpj || cnpj.cnpj)} — Gerado em ${genDt}</div></div>

<div class="section"><span class="sec-num">00</span><span class="sec-heading">Sumario Executivo</span><hr class="sec-rule">
<div style="text-align:center;margin-bottom:20px"><span class="decision-badge ${decisionClass}">${esc(decision)}</span></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">Empresa</div><div style="font-size:13px;font-weight:500">${esc(col.company_name || col.label)}</div></div>
<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">CNPJ</div><div style="font-size:13px;font-weight:500">${esc(col.cnpj || cnpj.cnpj)}</div></div>
<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">Decisao</div><div style="font-size:13px;font-weight:500">${esc(decision)} — ${rating}/10</div></div>
</div>
${alertas.length > 0 ? `<div>${alertas.map(a => `<div class="alert-line"><span class="alert-badge ${a.severidade === "ALTA" ? "alert-critico" : a.severidade === "MODERADA" ? "alert-moderado" : "alert-info"}">${esc(a.severidade || a.severity)}</span><span class="alert-text">${esc(a.descricao || a.message)}</span></div>`).join("")}</div>` : ""}
${resumo ? `<p style="font-size:13px;color:#444;line-height:1.8;margin-top:16px">${esc(resumo)}</p>` : ""}
</div>

<div class="section"><span class="sec-num">01</span><span class="sec-heading">Identificacao da Empresa</span><hr class="sec-rule">
<table class="kv">${row("Razao Social", cnpj.razaoSocial)}${row("CNPJ", cnpj.cnpj || col.cnpj)}${row("Situacao Cadastral", cnpj.situacaoCadastral)}${row("Data de Abertura", cnpj.dataAbertura)}${row("CNAE Principal", cnpj.cnaePrincipal)}${row("Porte", cnpj.porte)}${row("Capital Social", cnpj.capitalSocialCNPJ)}${row("Endereco", cnpj.endereco)}${row("Telefone", cnpj.telefone)}</table>
</div>

<div class="section"><span class="sec-num">02</span><span class="sec-heading">Quadro Societario</span><hr class="sec-rule">
${socios.length > 0 ? `<table class="dtable"><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Qualificacao</th><th>Participacao</th></tr></thead><tbody>${socios.map(s => `<tr><td>${esc(s.nome)}</td><td>${esc(s.cpfCnpj)}</td><td>${esc(s.qualificacao)}</td><td><strong>${esc(s.participacao)}</strong></td></tr>`).join("")}</tbody></table>` : '<p style="color:#999;font-size:13px">Nenhum socio encontrado.</p>'}
</div>

<div class="section"><span class="sec-num">03</span><span class="sec-heading">Contrato Social</span><hr class="sec-rule">
<table class="kv">${row("Capital Social", contrato.capitalSocial)}${row("Data de Constituicao", contrato.dataConstituicao)}${row("Objeto Social", contrato.objetoSocial)}${row("Administracao", contrato.administracao)}${row("Foro", contrato.foro)}</table>
</div>

<div class="section"><span class="sec-num">04</span><span class="sec-heading">Faturamento</span><hr class="sec-rule">
<table class="kv">${row("Media Mensal (R$)", faturamento.mediaAno || faturamento.mediaMensal)}${row("Somatoria (R$)", faturamento.somatoriaAno || faturamento.totalAno)}${row("Ultimo Mes com Dados", faturamento.ultimoMesComDados)}</table>
${meses.length > 0 ? `<div class="sub-heading">Serie Mensal</div><table class="dtable"><thead><tr><th>Mes</th><th style="text-align:right">Valor (R$)</th></tr></thead><tbody>${meses.map(m => `<tr><td>${esc(m.mes)}</td><td style="text-align:right;font-variant-numeric:tabular-nums"><strong>${esc(m.valor)}</strong></td></tr>`).join("")}</tbody></table>` : ""}
</div>

<div class="section"><span class="sec-num">05</span><span class="sec-heading">Perfil de Credito — SCR</span><hr class="sec-rule">
<table class="kv">${row("Total Dividas Ativas", scr.totalDividasAtivas)}${row("Carteira a Vencer", scr.carteiraAVencer)}${row("Vencidos", scr.vencidos)}${row("Prejuizos", scr.prejuizos)}${row("Limite de Credito", scr.limiteCredito)}${row("Qtde Instituicoes", scr.qtdeInstituicoes)}${row("Periodo de Referencia", scr.periodoReferencia)}</table>
</div>

<div class="section"><span class="sec-num">06</span><span class="sec-heading">Protestos</span><hr class="sec-rule">
<table class="kv">${row("Vigentes (Qtd)", protestos.vigentesQtd || "0")}${row("Vigentes (R$)", protestos.vigentesValor || "0,00")}${row("Regularizados (Qtd)", protestos.regularizadosQtd || "0")}${row("Regularizados (R$)", protestos.regularizadosValor || "0,00")}</table>
</div>

<div class="section"><span class="sec-num">07</span><span class="sec-heading">Processos Judiciais</span><hr class="sec-rule">
<table class="kv">${row("Passivos (Total)", processos.passivosTotal || "0")}${row("Ativos (Total)", processos.ativosTotal || "0")}${row("Valor Estimado (R$)", processos.valorTotalEstimado || "0,00")}</table>
</div>

<div class="section"><span class="sec-num">08</span><span class="sec-heading">Parecer Final</span><hr class="sec-rule">
<div style="display:flex;gap:12px;align-items:center;margin-bottom:24px"><span class="decision-badge ${decisionClass}">${esc(decision)}</span><span style="font-size:13px;color:#666">Rating: <strong>${rating}/10</strong></span></div>
${pontosFortes.length > 0 ? `<div class="sub-heading">Pontos Fortes</div><div style="margin-bottom:16px">${pontosFortes.map(p => `<div class="alert-line"><span class="alert-badge alert-positivo">POSITIVO</span><span class="alert-text">${esc(p)}</span></div>`).join("")}</div>` : ""}
${pontosFracos.length > 0 ? `<div class="sub-heading">Pontos Fracos</div><div style="margin-bottom:16px">${pontosFracos.map(p => `<div class="alert-line"><span class="alert-badge alert-critico">RISCO</span><span class="alert-text">${esc(p)}</span></div>`).join("")}</div>` : ""}
${perguntas.length > 0 ? `<div class="sub-heading">Perguntas para Visita</div><table class="dtable"><thead><tr><th style="width:40%">Pergunta</th><th>Contexto</th></tr></thead><tbody>${perguntas.map(q => `<tr><td style="font-weight:500">${esc(q.pergunta)}</td><td style="color:#666;font-size:12px">${esc(q.contexto)}</td></tr>`).join("")}</tbody></table>` : ""}
</div>

<div class="doc-footer"><span>capital financas — Consolidador de Documentos</span><span>Documento confidencial — uso restrito</span><span>Gerado em ${genDt}</span></div>
</div></body></html>`;
}

// ── Field configs per document type ──
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

function CollectionCard({ col, highlight, onDelete, onUpdate, userId }: { col: DocumentCollection; highlight: boolean; onDelete: (id: string) => void; onUpdate: (docs: CollectionDocument[]) => void; userId?: string }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setReportError(null);
    try {
      const extractedData: Record<string, Record<string, unknown>> = {};
      for (const doc of (col.documents || [])) {
        if (doc.extracted_data) extractedData[doc.type] = doc.extracted_data;
      }

      let analysis: Record<string, unknown> | null = null;
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: extractedData }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) analysis = json.analysis;
        }
      } catch { /* gera sem análise IA */ }

      const html = gerarRelatorioHTML(col, extractedData, analysis);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${(col.company_name || col.label || col.id).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError("Erro ao gerar relatorio. Tente novamente.");
      console.error("[historico] generateReport error:", err);
    } finally {
      setGeneratingReport(false);
    }
  };
  const [storedFiles, setStoredFiles] = useState<{ originals: { name: string; path: string }[]; reports: { name: string; path: string }[] }>({ originals: [], reports: [] });
  const [filesLoaded, setFilesLoaded] = useState(false);

  const loadFiles = async () => {
    if (filesLoaded || !userId) return;
    const [originals, reports] = await Promise.all([
      listFiles(userId, col.id, "originals"),
      listFiles(userId, col.id, "reports"),
    ]);
    setStoredFiles({ originals, reports });
    setFilesLoaded(true);
  };

  const handleDownload = async (path: string, name: string) => {
    const url = await getDownloadUrl(path);
    if (url) { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }
    else toast.error("Erro ao gerar link de download");
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
  const [expanded, setExpanded] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState(col.label || "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ── Inline doc editing ──
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [savingDoc, setSavingDoc] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const startEditing = (doc: CollectionDocument) => {
    if (editingDoc && editingDoc !== doc.type) {
      if (!confirm("Há edições não salvas. Descartar?")) return;
    }
    setEditingDoc(doc.type);
    setEditValues({ ...(doc.extracted_data || {}) });
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditingDoc(null);
    setEditValues({});
    setSaveError(null);
  };

  const updateField = (key: string, value: unknown) => {
    setEditValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveDoc = async (docType: string) => {
    setSavingDoc(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const updatedDocs = docs.map(d => {
        if (d.type !== docType) return d;
        const newData: Record<string, unknown> = { ...d.extracted_data, ...editValues, _editedManually: true };
        // Recalculate faturamento average if applicable
        if (docType === "faturamento" && Array.isArray(editValues.meses)) {
          const meses = editValues.meses as { mes: string; valor: string }[];
          const vals = meses.map(m => parseFloat((m.valor || "0").replace(/\./g, "").replace(",", ".")) || 0);
          const sum = vals.reduce((a, b) => a + b, 0);
          const avg = vals.length > 0 ? sum / vals.length : 0;
          newData.mediaAno = avg.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
          newData.somatoriaAno = sum.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        }
        return { ...d, extracted_data: newData };
      });

      const { error } = await supabase
        .from("document_collections")
        .update({ documents: updatedDocs })
        .eq("id", col.id);

      if (error) throw error;

      onUpdate(updatedDocs);
      setEditingDoc(null);
      setEditValues({});
      toast.success("Documento atualizado");
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setSavingDoc(false);
    }
  };

  useEffect(() => {
    if (highlight && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  const saveLabel = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from("document_collections").update({ label: label || null }).eq("id", col.id).eq("user_id", userId);
      setEditingLabel(false);
      toast.success("Título atualizado");
    } catch { toast.error("Erro ao salvar título"); }
    finally { setSaving(false); }
  };

  const isFinished = col.status === "finished";
  const date = new Date(col.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const docs = (col.documents || []) as CollectionDocument[];

  return (
    <div ref={ref} className={`card overflow-hidden transition-all duration-500 ${highlight ? "ring-2 ring-cf-green ring-offset-2" : ""}`}>
      <div className="p-5">
        {/* Linha 1: data + status */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-cf-text-3 font-medium">{date}</span>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
            isFinished
              ? "text-cf-green bg-cf-green/5 border-cf-green/20"
              : "text-cf-warning bg-cf-warning-bg border-cf-warning/20"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isFinished ? "bg-cf-green" : "bg-cf-warning animate-pulse"}`} />
            {isFinished ? "Finalizada" : "Em andamento"}
          </div>
        </div>

        {/* Linha 2: label editável */}
        <div className="flex items-center gap-2 mb-2">
          {editingLabel ? (
            <div className="flex items-center gap-2 flex-1">
              <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && saveLabel()}
                autoFocus placeholder="Título da coleta" className="input-field py-1 text-sm flex-1" />
              <button onClick={saveLabel} disabled={saving} className="w-7 h-7 rounded-lg bg-cf-green/10 flex items-center justify-center text-cf-green hover:bg-cf-green/20 transition-colors">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-bold text-cf-text-1">{label || "Coleta sem título"}</h3>
              <button onClick={() => setEditingLabel(true)} className="text-cf-text-4 hover:text-cf-navy transition-colors">
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>

        {/* Linha 3: info + botões */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-cf-text-3">{docs.length} documento{docs.length !== 1 ? "s" : ""} salvo{docs.length !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            {!isFinished && (
              <Link href={`/?resume=${col.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-green hover:bg-cf-green/5 border border-cf-green/20 rounded-lg px-3 py-1.5 transition-colors">
                <RotateCcw size={12} /> Retomar
              </Link>
            )}
            {docs.length > 0 && (
              <button onClick={handleGenerateReport} disabled={generatingReport} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-text-2 hover:bg-cf-bg border border-cf-border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                {generatingReport ? <><Loader2 size={12} className="animate-spin" /> Gerando...</> : <><Download size={12} /> Relatorio</>}
              </button>
            )}
            {reportError && <span className="text-[10px] text-cf-danger">{reportError}</span>}
            <button onClick={() => { setExpanded(p => !p); loadFiles(); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-navy/5 border border-cf-navy/15 rounded-lg px-3 py-1.5 transition-colors">
              {expanded ? <><ChevronUp size={12} /> Fechar</> : <><ChevronDown size={12} /> Ver detalhes</>}
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-text-4 hover:text-cf-danger hover:bg-cf-danger-bg border border-cf-border rounded-lg px-2.5 py-1.5 transition-colors" title="Excluir coleta">
                <Trash2 size={12} />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-cf-danger hover:bg-red-700 rounded-lg px-2.5 py-1.5 transition-colors">
                  {deleting ? <Loader2 size={11} className="animate-spin" /> : "Excluir"}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-[11px] font-semibold text-cf-text-3 hover:text-cf-text-1 px-2 py-1.5 transition-colors">
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accordion: documentos */}
      {expanded && (
        <div className="border-t border-cf-border px-5 pb-5 pt-3 space-y-3 animate-fade-in">
          {docs.length === 0 ? (
            <p className="text-xs text-cf-text-3 italic">Nenhum documento nesta coleta.</p>
          ) : docs.map((doc, i) => {
            const isEditing = editingDoc === doc.type;
            const fields = DOC_FIELDS[doc.type];
            const data = isEditing ? editValues : (doc.extracted_data || {});
            const wasEdited = !!(doc.extracted_data as Record<string, unknown>)?._editedManually;

            return (
            <div key={i} className="bg-cf-bg rounded-xl border border-cf-border overflow-hidden">
              {/* Doc header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-white border border-cf-border flex items-center justify-center flex-shrink-0">
                  {docIcon[doc.type] || docIcon.outro}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-cf-text-1">{docLabel[doc.type] || doc.type}</p>
                    {wasEdited && (
                      <span className="text-[9px] font-semibold text-cf-navy bg-cf-navy/10 px-1.5 py-0.5 rounded">Editado</span>
                    )}
                  </div>
                  <p className="text-xs text-cf-text-3 truncate">{doc.filename} — {new Date(doc.uploaded_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <span className="text-[10px] font-bold text-cf-text-3 bg-cf-surface px-2 py-0.5 rounded-full">
                  {Object.keys(doc.extracted_data || {}).length} campos
                </span>
                {!isEditing && (
                  <button onClick={() => startEditing(doc)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-cf-text-4 hover:text-cf-navy transition-colors" style={{ minHeight: "auto" }}>
                    <Pencil size={11} /> Editar
                  </button>
                )}
              </div>

              {/* Fields — read mode (always show key fields) */}
              {!isEditing && fields && (
                <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {fields.slice(0, 4).map(f => {
                    const val = String((data as Record<string, unknown>)[f.key] || "");
                    return (
                      <div key={f.key}>
                        <p className="text-[10px] text-cf-text-4 uppercase tracking-wide">{f.label}</p>
                        <p className="text-xs text-cf-text-1 font-medium truncate">{val || "—"}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fields — read mode for QSA (show sócios) */}
              {!isEditing && doc.type === "qsa" && (
                <div className="px-4 pb-3">
                  {Array.isArray((data as Record<string, unknown>).quadroSocietario) &&
                    ((data as Record<string, unknown>).quadroSocietario as { nome: string; cpfCnpj: string }[]).filter(s => s.nome).slice(0, 3).map((s, si) => (
                      <p key={si} className="text-xs text-cf-text-1"><span className="text-cf-text-4">{si + 1}.</span> {s.nome} <span className="text-cf-text-4 font-mono text-[10px]">{s.cpfCnpj}</span></p>
                    ))
                  }
                </div>
              )}

              {/* Fields — read mode for faturamento (show meses) */}
              {!isEditing && doc.type === "faturamento" && (
                <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <p className="text-[10px] text-cf-text-4 uppercase tracking-wide">Media Mensal</p>
                    <p className="text-xs text-cf-text-1 font-medium">{String((data as Record<string, unknown>).mediaAno || "—")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-cf-text-4 uppercase tracking-wide">Somatoria Anual</p>
                    <p className="text-xs text-cf-text-1 font-medium">{String((data as Record<string, unknown>).somatoriaAno || "—")}</p>
                  </div>
                </div>
              )}

              {/* Edit mode */}
              {isEditing && (
                <div className="px-4 pb-4 space-y-3 animate-fade-in border-t border-cf-border pt-3">
                  {/* Typed fields */}
                  {fields ? (
                    <div className="grid grid-cols-2 gap-3">
                      {fields.map(f => (
                        <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                          <label className="text-[10px] text-cf-text-4 uppercase tracking-wide mb-1 block">{f.label}</label>
                          {f.type === "readonly" ? (
                            <input value={String((editValues as Record<string, unknown>)[f.key] || "")} readOnly className="border border-cf-border rounded-lg px-2.5 py-1.5 text-xs w-full bg-cf-surface text-cf-text-3" />
                          ) : f.type === "select" ? (
                            <select value={String((editValues as Record<string, unknown>)[f.key] || "")} onChange={e => updateField(f.key, e.target.value)} className="border border-cf-border rounded-lg px-2.5 py-1.5 text-xs w-full bg-white">
                              <option value="">—</option>
                              {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : f.type === "textarea" ? (
                            <textarea value={String((editValues as Record<string, unknown>)[f.key] || "")} onChange={e => updateField(f.key, e.target.value)} rows={3} className="border border-cf-border rounded-lg px-2.5 py-1.5 text-xs w-full resize-none" />
                          ) : (
                            <input value={String((editValues as Record<string, unknown>)[f.key] || "")} onChange={e => updateField(f.key, e.target.value)} className="border border-cf-border rounded-lg px-2.5 py-1.5 text-xs w-full" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : doc.type === "qsa" ? (
                    /* QSA: edit each sócio */
                    <div className="space-y-3">
                      <p className="text-[10px] text-cf-text-4 uppercase tracking-wide font-bold">Socios</p>
                      {Array.isArray(editValues.quadroSocietario) && (editValues.quadroSocietario as { nome: string; cpfCnpj: string; qualificacao: string }[]).map((s, si) => (
                        <div key={si} className="grid grid-cols-3 gap-2 bg-white rounded-lg p-2 border border-cf-border">
                          <div>
                            <label className="text-[10px] text-cf-text-4 mb-0.5 block">Nome</label>
                            <input value={s.nome || ""} onChange={e => {
                              const arr = [...(editValues.quadroSocietario as Record<string, string>[])];
                              arr[si] = { ...arr[si], nome: e.target.value };
                              updateField("quadroSocietario", arr);
                            }} className="border border-cf-border rounded-lg px-2 py-1 text-xs w-full" />
                          </div>
                          <div>
                            <label className="text-[10px] text-cf-text-4 mb-0.5 block">CPF/CNPJ</label>
                            <input value={s.cpfCnpj || ""} onChange={e => {
                              const arr = [...(editValues.quadroSocietario as Record<string, string>[])];
                              arr[si] = { ...arr[si], cpfCnpj: e.target.value };
                              updateField("quadroSocietario", arr);
                            }} className="border border-cf-border rounded-lg px-2 py-1 text-xs w-full" />
                          </div>
                          <div>
                            <label className="text-[10px] text-cf-text-4 mb-0.5 block">Qualificacao</label>
                            <input value={s.qualificacao || ""} onChange={e => {
                              const arr = [...(editValues.quadroSocietario as Record<string, string>[])];
                              arr[si] = { ...arr[si], qualificacao: e.target.value };
                              updateField("quadroSocietario", arr);
                            }} className="border border-cf-border rounded-lg px-2 py-1 text-xs w-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : doc.type === "faturamento" ? (
                    /* Faturamento: edit meses */
                    <div className="space-y-2">
                      <p className="text-[10px] text-cf-text-4 uppercase tracking-wide font-bold">Meses</p>
                      {Array.isArray(editValues.meses) && (editValues.meses as { mes: string; valor: string }[]).map((m, mi) => (
                        <div key={mi} className="flex items-center gap-2">
                          <span className="text-xs text-cf-text-3 w-20 flex-shrink-0">{m.mes}</span>
                          <input value={m.valor || ""} onChange={e => {
                            const arr = [...(editValues.meses as { mes: string; valor: string }[])];
                            arr[mi] = { ...arr[mi], valor: e.target.value };
                            updateField("meses", arr);
                          }} className="border border-cf-border rounded-lg px-2 py-1 text-xs flex-1" placeholder="0,00" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Fallback: JSON editor */
                    <div>
                      <label className="text-[10px] text-cf-text-4 uppercase tracking-wide mb-1 block">Dados (JSON)</label>
                      <textarea
                        value={JSON.stringify(editValues, null, 2)}
                        onChange={e => {
                          try { setEditValues(JSON.parse(e.target.value)); setSaveError(null); }
                          catch { setSaveError("JSON invalido"); }
                        }}
                        rows={8}
                        className="border border-cf-border rounded-lg px-2.5 py-1.5 text-xs w-full font-mono resize-none"
                      />
                    </div>
                  )}

                  {/* Save/Cancel */}
                  {saveError && <p className="text-[11px] text-cf-danger font-medium">{saveError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => handleSaveDoc(doc.type)} disabled={savingDoc} className="inline-flex items-center gap-1.5 bg-cf-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors">
                      {savingDoc ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
                    </button>
                    <button onClick={cancelEditing} disabled={savingDoc} className="border border-cf-border text-xs font-semibold text-cf-text-3 px-3 py-1.5 rounded-lg hover:bg-cf-bg transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}

          {/* Arquivos salvos — originais + relatórios */}
          {filesLoaded && (storedFiles.originals.length > 0 || storedFiles.reports.length > 0) && (
            <div className="mt-4 pt-4 border-t border-cf-border space-y-3">
              {storedFiles.originals.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest mb-2">Documentos Originais</p>
                  <div className="space-y-1.5">
                    {storedFiles.originals.map((f, i) => (
                      <button key={i} onClick={() => handleDownload(f.path, f.name)}
                        className="w-full flex items-center gap-3 bg-cf-bg rounded-lg px-3 py-2 border border-cf-border hover:border-cf-navy/30 hover:bg-cf-surface transition-all text-left" style={{ minHeight: "auto" }}>
                        <FileText size={14} className="text-cf-navy flex-shrink-0" />
                        <span className="text-xs font-medium text-cf-text-1 flex-1 truncate">{f.name}</span>
                        <Download size={12} className="text-cf-text-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {storedFiles.reports.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest mb-2">Relatórios Gerados</p>
                  <div className="space-y-1.5">
                    {storedFiles.reports.map((f, i) => (
                      <button key={i} onClick={() => handleDownload(f.path, f.name)}
                        className="w-full flex items-center gap-3 bg-cf-green/5 rounded-lg px-3 py-2 border border-cf-green/20 hover:bg-cf-green/10 transition-all text-left" style={{ minHeight: "auto" }}>
                        <Download size={14} className="text-cf-green flex-shrink-0" />
                        <span className="text-xs font-medium text-cf-text-1 flex-1 truncate">{f.name}</span>
                        <span className="text-[10px] text-cf-green font-semibold">Baixar</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoricoPage() {
  return <Suspense fallback={<div className="min-h-screen bg-cf-bg flex items-center justify-center"><Loader2 size={24} className="text-cf-navy animate-spin" /></div>}><HistoricoContent /></Suspense>;
}

function HistoricoContent() {
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, signOut } = useAuth();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setCollections([]);
          return;
        }
        const query = supabase.from("document_collections").select("*").eq("user_id", user.id).order("created_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        setCollections((data || []) as DocumentCollection[]);
      } catch (err) {
        toast.error("Erro ao carregar histórico: " + (err instanceof Error ? err.message : "Verifique o Supabase"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-cf-bg flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-cf-border sticky top-0 z-50" style={{ boxShadow: "0 1px 0 #d1dcf0" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 grid grid-cols-3 items-center">
          <Link href="/"><Logo light={false} /></Link>
          <div className="hidden sm:flex justify-center">
            <span className="text-sm font-semibold text-cf-navy">Histórico de Coletas</span>
          </div>
          <div className="flex justify-end gap-3 items-center">
            {!authLoading && user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-xs text-cf-text-2 font-medium truncate max-w-[120px]">{user.user_metadata?.full_name || user.email?.split("@")[0]}</span>
                <button onClick={signOut} className="flex items-center gap-1 text-xs font-semibold text-cf-text-3 hover:text-cf-danger border border-cf-border rounded-full px-2.5 py-1.5 transition-colors">
                  <LogOut size={12} /> Sair
                </button>
              </div>
            ) : !authLoading ? (
              <Link href="/login" className="flex items-center gap-1.5 bg-cf-navy text-white text-xs font-semibold rounded-full px-3 py-1.5 hover:bg-cf-navy-dark transition-colors">
                <User size={12} /> Entrar
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-hero-gradient">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Histórico de Coletas</h1>
            <p className="text-blue-200 mt-2 text-sm max-w-md mx-auto">Consulte todas as coletas realizadas anteriormente</p>
          </div>
        </div>
        <div className="relative h-10 -mb-px">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,20 C240,40 480,0 720,20 C960,40 1200,0 1440,20 L1440,40 L0,40 Z" fill="#f5f7fb" />
          </svg>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-5 sm:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="btn-secondary text-xs">
            <ArrowLeft size={14} /> Voltar ao consolidador
          </Link>
          <span className="text-xs text-cf-text-3 font-medium">{collections.length} coleta{collections.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={24} className="text-cf-navy animate-spin" />
            <p className="text-sm text-cf-text-3">Carregando histórico...</p>
          </div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-cf-surface flex items-center justify-center">
              <Inbox size={28} className="text-cf-text-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-cf-text-1 mb-1">Nenhuma coleta salva ainda</h3>
              <p className="text-sm text-cf-text-3">Finalize uma coleta para vê-la aqui.</p>
            </div>
            <Link href="/" className="btn-green mt-2">Ir para o consolidador</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {collections.map(col => (
              <CollectionCard key={col.id} col={col} highlight={col.id === highlightId} userId={user?.id} onDelete={(id) => setCollections(prev => prev.filter(c => c.id !== id))} onUpdate={(docs) => setCollections(prev => prev.map(c => c.id === col.id ? { ...c, documents: docs } : c))} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-cf-dark mt-12">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo light={true} />
          <div className="text-center sm:text-right">
            <p className="text-xs text-white/40">&copy; {new Date().getFullYear()} Capital Finanças. Todos os direitos reservados.</p>
            <p className="text-xs text-white/25 mt-0.5">Documentos processados localmente com segurança</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
