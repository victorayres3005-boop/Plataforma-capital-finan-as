"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import {
  Zap, RefreshCw, Loader2, FileText, Building2,
  AlertTriangle, ArrowRight, Clock, Link2,
  Sparkles, Copy, Check, ChevronDown, ChevronUp,
  CheckCircle2, User,
} from "lucide-react";
import type { GoalfyOperation } from "@/app/api/goalfy/listar/route";
import { timeAgo } from "@/lib/formatters";

type OperationWithStatus = GoalfyOperation & { already_imported: boolean };
type ImportPhase = "idle" | "downloading" | "extracting" | "done" | "error";

const DOC_TYPE_LABEL: Record<string, string> = {
  contrato_social:  "Contrato Social",
  scr:              "SCR",
  balanco:          "Balanço",
  dre:              "DRE",
  faturamento:      "Faturamento",
  qsa:              "QSA",
  ir_socio:         "IR Sócio",
  relatorio_visita: "Rel. Visita",
  protestos:        "Protestos",
  processos:        "Processos",
  curva_abc:        "Curva ABC",
  outro:            "Outro",
};

function docLabel(type: string) {
  return DOC_TYPE_LABEL[type] ?? type;
}

function companyInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();
}

// Paleta de cores para os avatares por inicial
const AVATAR_COLORS: [string, string][] = [
  ["#1a2f6b", "#e8efff"],
  ["#065f46", "#d1fae5"],
  ["#7c3aed", "#ede9fe"],
  ["#b45309", "#fef3c7"],
  ["#0e7490", "#cffafe"],
  ["#be123c", "#ffe4e6"],
];

function avatarColor(name: string): [string, string] {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function ImportarGoalfyPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [operations, setOperations]   = useState<OperationWithStatus[]>([]);
  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [lastSync, setLastSync]       = useState<Date | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState<Record<string, ImportPhase>>({});
  const [imported, setImported]       = useState<Record<string, string>>({});
  const [copied, setCopied]           = useState(false);
  const [doneOpen, setDoneOpen]       = useState(false);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/goalfy/receber`
    : "https://plataformacapital.vercel.app/api/goalfy/receber";

  const fetchList = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/goalfy/listar");
      if (!res.ok) throw new Error("Falha ao buscar operações");
      const json = await res.json() as { operations: OperationWithStatus[]; mock: boolean; setup_required?: boolean };
      setOperations(json.operations);
      setLastSync(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    fetchList().finally(() => setLoading(false));
  }, [user, authLoading, router, fetchList]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/goalfy/sync", { method: "POST" });
    } catch { /* silencioso */ }
    await fetchList();
    setSyncing(false);
  }

  async function handleImport(op: OperationWithStatus) {
    setImportPhase(p => ({ ...p, [op.id]: "downloading" }));
    await new Promise(r => setTimeout(r, 800));
    setImportPhase(p => ({ ...p, [op.id]: "extracting" }));

    try {
      const res = await fetch("/api/goalfy/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: op }),
      });
      const json = await res.json() as { success?: boolean; collection_id?: string; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Erro ao importar");
      setImported(prev => ({ ...prev, [op.id]: json.collection_id! }));
      setImportPhase(p => ({ ...p, [op.id]: "done" }));
      setOperations(prev => prev.map(o => o.id === op.id ? { ...o, already_imported: true } : o));
    } catch (e) {
      setImportPhase(p => ({ ...p, [op.id]: "error" }));
      setTimeout(() => setImportPhase(p => ({ ...p, [op.id]: "idle" })), 3000);
      console.error(e);
    }
  }

  function goToCollection(collectionId: string) {
    router.push(`/?resume=${collectionId}`);
  }

  const pending = operations.filter(o => !o.already_imported);
  const done    = operations.filter(o =>  o.already_imported);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cf-bg">
        <Loader2 size={24} className="animate-spin text-cf-navy" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cf-bg">
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-3">
              <div style={{
                width: 44, height: 44, borderRadius: 13,
                background: "linear-gradient(135deg,#1a2f6b,#2d4fad)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, boxShadow: "0 2px 8px rgba(26,47,107,0.25)",
              }}>
                <Zap size={21} color="#a8d96b" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-cf-text-1 leading-tight">Importar do Goalfy</h1>
                <p className="text-xs text-cf-text-3 mt-0.5">Operações recebidas automaticamente via webhook</p>
              </div>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-cf-navy border border-cf-border hover:bg-cf-bg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </button>
          </div>

          {/* Painel de métricas rápidas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-cf-border px-4 py-3">
              <div className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide mb-1">Pendentes</div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold" style={{ color: pending.length > 0 ? "#d97706" : "#94a3b8" }}>
                  {pending.length}
                </span>
                {pending.length > 0 && (
                  <span className="text-[11px] font-semibold text-amber-500 mb-0.5">aguardando análise</span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-cf-border px-4 py-3">
              <div className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide mb-1">Analisadas</div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-cf-text-1">{done.length}</span>
                {done.length > 0 && (
                  <span className="text-[11px] font-semibold text-green-600 mb-0.5">concluídas</span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-cf-border px-4 py-3">
              <div className="text-[11px] font-semibold text-cf-text-3 uppercase tracking-wide mb-1">Última sync</div>
              <div className="text-sm font-semibold text-cf-text-2">
                {lastSync ? lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Erro global ────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 mb-5">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* ── Webhook URL ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-cf-border p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={13} className="text-cf-navy" />
            <span className="text-sm font-semibold text-cf-text-1">URL do Webhook</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Configure na Goalfy</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-cf-bg text-cf-navy font-mono px-3 py-2.5 rounded-lg border border-cf-border truncate">
              {webhookUrl}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(webhookUrl).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors"
              style={copied
                ? { background: "#f0fdf4", color: "#16a34a", borderColor: "#bbf7d0" }
                : { background: "white", color: "#203b88", borderColor: "#d1dcf0" }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="text-[11px] text-cf-text-3 mt-2">
            Na Goalfy: Automações → Webhook HTTP → Cole a URL acima → Método POST
          </p>
        </div>

        {/* ── Pendentes ───────────────────────────────────────────────────── */}
        {pending.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest">Aguardando análise</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                {pending.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {pending.map(op => (
                <OperationCard
                  key={op.id}
                  op={op}
                  phase={importPhase[op.id] ?? "idle"}
                  importedId={imported[op.id]}
                  onImport={() => handleImport(op)}
                  onOpen={() => goToCollection(imported[op.id])}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Já analisadas — accordion ──────────────────────────────────── */}
        {done.length > 0 && (
          <section>
            <button
              onClick={() => setDoneOpen(o => !o)}
              className="flex items-center gap-2 mb-3 group w-full text-left"
            >
              <span className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest group-hover:text-cf-text-2 transition-colors">
                Já analisadas
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                {done.length}
              </span>
              <span className="ml-auto text-cf-text-3 group-hover:text-cf-text-2 transition-colors">
                {doneOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>

            {doneOpen && (
              <div className="flex flex-col gap-2">
                {done.map(op => (
                  <OperationCard
                    key={op.id}
                    op={op}
                    phase="done"
                    importedId={imported[op.id]}
                    onImport={() => {}}
                    onOpen={() => imported[op.id] ? goToCollection(imported[op.id]) : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {operations.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-cf-border text-center">
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "linear-gradient(135deg,#f1f5f9,#e8efff)",
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
            }}>
              <Zap size={26} color="#94a3b8" />
            </div>
            <p className="text-sm font-semibold text-cf-text-2 mb-1">Nenhuma operação recebida ainda</p>
            <p className="text-xs text-cf-text-3 max-w-xs leading-relaxed">
              Configure o webhook na Goalfy com a URL acima. Quando um card for criado, ele aparece aqui automaticamente.
            </p>
          </div>
        )}

      </main>
    </div>
  );
}

// ── Card de operação ──────────────────────────────────────────────────────────
function OperationCard({
  op, phase, importedId, onImport, onOpen,
}: {
  op: OperationWithStatus;
  phase: ImportPhase;
  importedId?: string;
  onImport: () => void;
  onOpen: () => void;
}) {
  const isAlreadyDone = op.already_imported && phase !== "done";
  const justDone      = phase === "done" || (op.already_imported && !!importedId);
  const isActive      = phase === "downloading" || phase === "extracting";
  const isError       = phase === "error";

  const [fg, bg] = avatarColor(op.company_name);
  const initials  = companyInitials(op.company_name);

  // Cor da borda esquerda por status
  const leftBorderColor = isError
    ? "#ef4444"
    : justDone || isAlreadyDone
    ? "#22c55e"
    : isActive
    ? "#3b82f6"
    : "#203b88";

  return (
    <div
      className="bg-white rounded-xl border border-cf-border transition-all overflow-hidden"
      style={{
        borderLeft: `3.5px solid ${leftBorderColor}`,
        boxShadow: isActive
          ? "0 0 0 3px rgba(59,130,246,0.07), 0 1px 4px rgba(0,0,0,0.05)"
          : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div className="p-4">
        {/* Linha 1: avatar + info + botão */}
        <div className="flex items-center gap-3">

          {/* Avatar com iniciais */}
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: isAlreadyDone ? "#f1f5f9" : bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em",
            color: isAlreadyDone ? "#94a3b8" : fg,
          }}>
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[14px] font-bold text-cf-text-1 truncate leading-tight">
                {op.company_name}
              </span>
              {(isAlreadyDone || justDone) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 flex-shrink-0">
                  <CheckCircle2 size={9} /> Analisada
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {op.cnpj && (
                <span className="inline-flex items-center gap-1 text-[11px] text-cf-text-3">
                  <Building2 size={9} /> {op.cnpj}
                </span>
              )}
              {op.manager_name && (
                <span className="inline-flex items-center gap-1 text-[11px] text-cf-text-3">
                  <User size={9} /> {op.manager_name}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-cf-text-3">
                <Clock size={9} /> {timeAgo(op.created_at)}
              </span>
            </div>
          </div>

          {/* Botão de ação */}
          <div className="flex-shrink-0">
            {justDone && importedId ? (
              <button
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#1a2f6b,#203b88)" }}
              >
                <ArrowRight size={14} /> Abrir análise
              </button>
            ) : isAlreadyDone ? (
              <button
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cf-navy bg-cf-bg border border-cf-border hover:bg-white transition-colors"
              >
                <ArrowRight size={12} /> Ver análise
              </button>
            ) : isActive ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                <Loader2 size={14} className="animate-spin" />
                {phase === "downloading" ? "Baixando..." : "Extraindo..."}
              </div>
            ) : isError ? (
              <button
                onClick={onImport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <AlertTriangle size={14} /> Tentar novamente
              </button>
            ) : (
              <button
                onClick={onImport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#1a2f6b,#203b88)" }}
              >
                <Sparkles size={14} /> Analisar
              </button>
            )}
          </div>
        </div>

        {/* Barra de progresso */}
        {isActive && (
          <div className="mt-3 pt-3 border-t border-cf-border">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: phase === "downloading" ? "35%" : "80%",
                    background: "linear-gradient(90deg,#3b82f6,#6366f1)",
                  }}
                />
              </div>
              <span className="text-[11px] text-blue-600 font-medium whitespace-nowrap">
                {phase === "downloading"
                  ? `Baixando ${op.document_count} arquivo${op.document_count !== 1 ? "s" : ""}...`
                  : "Extraindo com IA..."}
              </span>
            </div>
          </div>
        )}

        {/* Chips de documentos */}
        {op.documents.length > 0 && !isActive && (
          <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-cf-border">
            {op.documents.map(d => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                style={{
                  background: isAlreadyDone ? "#f8fafc" : "#f0f4ff",
                  color: isAlreadyDone ? "#94a3b8" : "#203b88",
                  border: `1px solid ${isAlreadyDone ? "#e2e8f0" : "#dce8f8"}`,
                }}
              >
                <FileText size={9} /> {docLabel(d.type)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
