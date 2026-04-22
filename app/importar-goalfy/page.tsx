"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import {
  Zap, RefreshCw, Loader2, FileText, Building2,
  CheckCircle2, AlertTriangle, ChevronRight,
  Settings, User, Calendar, Files,
} from "lucide-react";
import type { GoalfyOperation } from "@/app/api/goalfy/listar/route";

type OperationWithStatus = GoalfyOperation & { already_imported: boolean };

const DOC_TYPE_LABEL: Record<string, string> = {
  contrato_social:   "Contrato Social",
  scr:               "SCR",
  balanco:           "Balanço",
  dre:               "DRE",
  faturamento:       "Faturamento",
  qsa:               "QSA",
  ir_socio:          "IR Sócio",
  relatorio_visita:  "Rel. Visita",
  protestos:         "Protestos",
  processos:         "Processos",
};

function docLabel(type: string) {
  return DOC_TYPE_LABEL[type] ?? type;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1) return "há menos de 1h";
  if (h < 24) return `há ${h}h`;
  if (d === 1) return "ontem";
  return `há ${d} dias`;
}

export default function ImportarGoalfyPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [operations, setOperations]   = useState<OperationWithStatus[]>([]);
  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [isMock, setIsMock]           = useState(false);
  const [_setupRequired, setSetupRequired] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [importing, setImporting]     = useState<Record<string, boolean>>({});
  const [imported, setImported]       = useState<Record<string, string>>({});  // opId → collectionId

  const fetchList = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/goalfy/listar");
      if (!res.ok) throw new Error("Falha ao buscar operações");
      const json = await res.json() as { operations: OperationWithStatus[]; mock: boolean; setup_required?: boolean };
      setOperations(json.operations);
      setIsMock(json.mock);
      setSetupRequired(!!json.setup_required);
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
    await fetchList();
    setSyncing(false);
  }

  async function handleImport(op: OperationWithStatus) {
    setImporting(prev => ({ ...prev, [op.id]: true }));
    try {
      const res = await fetch("/api/goalfy/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: op }),
      });
      const json = await res.json() as { success?: boolean; collection_id?: string; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Erro ao importar");
      setImported(prev => ({ ...prev, [op.id]: json.collection_id! }));
      setOperations(prev => prev.map(o => o.id === op.id ? { ...o, already_imported: true } : o));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao importar operação");
    } finally {
      setImporting(prev => ({ ...prev, [op.id]: false }));
    }
  }

  function goToCollection(collectionId: string) {
    router.push(`/?resume=${collectionId}`);
  }

  const pending  = operations.filter(o => !o.already_imported);
  const done     = operations.filter(o =>  o.already_imported);

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB" }}>
      <main style={{ maxWidth: "920px", margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #1a2f6b, #203b88)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={18} style={{ color: "#a8d96b" }} />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>Importar do Goalfy</h1>
              {pending.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}>
                  {pending.length} nova{pending.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
              Operações lançadas pelos gerentes na Goalfy prontas para análise
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer", background: "white", color: "#203b88", border: "1px solid #d1dcf0", transition: "all 0.15s" }}
          >
            <RefreshCw size={14} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>

        {/* ── Banner: configuração da automação Goalfy ── */}
        {(isMock || setupRequired || operations.length === 0) && !error && (
          <div style={{ display: "flex", gap: 12, padding: "16px 18px", borderRadius: 10, background: "#f0f4ff", border: "1px solid #c7d7f5", marginBottom: 20 }}>
            <Settings size={18} style={{ color: "#203b88", flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", margin: "0 0 6px" }}>
                Configure a automação na Goalfy para receber operações aqui
              </p>
              <p style={{ fontSize: 12, color: "#3b5db8", margin: "0 0 8px" }}>
                No painel da Goalfy, crie uma <strong>Automação</strong> com o gatilho "Card criado" (ou "Card entrou em fase") e configure a ação <strong>Webhook HTTP</strong> apontando para a URL abaixo:
              </p>
              <code style={{ display: "block", background: "#dde8fa", color: "#1e3a8a", padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, wordBreak: "break-all", marginBottom: 6 }}>
                {typeof window !== "undefined" ? window.location.origin : "https://seuapp.vercel.app"}/api/goalfy/receber
              </code>
              <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
                Campos recomendados no payload: <code>razaoSocial</code>, <code>cnpj</code>, <code>gerente</code>, <code>documentos</code>
              </p>
            </div>
          </div>
        )}

        {/* ── Erro ── */}
        {error && (
          <div style={{ display: "flex", gap: 12, padding: "14px 18px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", marginBottom: 20 }}>
            <AlertTriangle size={18} style={{ color: "#dc2626", flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>
          </div>
        )}

        {/* ── Operações pendentes ── */}
        {pending.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Aguardando importação · {pending.length}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pending.map(op => (
                <OperationCard
                  key={op.id}
                  op={op}
                  isImporting={!!importing[op.id]}
                  importedId={imported[op.id]}
                  onImport={() => handleImport(op)}
                  onOpen={() => goToCollection(imported[op.id])}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Já importadas ── */}
        {done.length > 0 && (
          <section>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Já importadas · {done.length}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {done.map(op => (
                <OperationCard
                  key={op.id}
                  op={op}
                  isImporting={false}
                  importedId={imported[op.id]}
                  onImport={() => {}}
                  onOpen={() => goToCollection(imported[op.id])}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Empty ── */}
        {operations.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "60px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0" }}>
            <Zap size={36} style={{ color: "#cbd5e1", margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "#64748b", margin: "0 0 4px" }}>Nenhuma operação disponível</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              Quando os gerentes lançarem documentos na Goalfy, eles aparecerão aqui.
            </p>
          </div>
        )}

      </main>
    </div>
  );
}

// ─── Card de operação ──────────────────────────────────────────────────────────
function OperationCard({
  op, isImporting, importedId, onImport, onOpen,
}: {
  op: OperationWithStatus;
  isImporting: boolean;
  importedId?: string;
  onImport: () => void;
  onOpen: () => void;
}) {
  const justImported = !!importedId;
  const isAlreadyDone = op.already_imported && !justImported;

  return (
    <div style={{
      background: "white",
      borderRadius: 12,
      border: `1px solid ${isAlreadyDone ? "#e2e8f0" : justImported ? "#bbf7d0" : "#e2e8f0"}`,
      padding: "18px 20px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
      opacity: isAlreadyDone ? 0.75 : 1,
      transition: "opacity 0.2s",
    }}>

      {/* ── Row 1: empresa + status + botão ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>

        <div style={{ width: 40, height: 40, borderRadius: 10, background: isAlreadyDone ? "#f1f5f9" : "#f0f4ff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Building2 size={18} style={{ color: isAlreadyDone ? "#94a3b8" : "#203b88" }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{op.company_name}</span>
            {isAlreadyDone && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#f0fdf4", color: "#16a34a" }}>
                <CheckCircle2 size={11} /> Importada
              </span>
            )}
            {justImported && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#f0fdf4", color: "#16a34a" }}>
                <CheckCircle2 size={11} /> Importada agora
              </span>
            )}
          </div>

          {/* Meta */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
              <Building2 size={11} /> {op.cnpj || "CNPJ não informado"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
              <User size={11} /> {op.manager_name}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
              <Calendar size={11} /> {timeAgo(op.created_at)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
              <Files size={11} /> {op.document_count} doc{op.document_count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Botão */}
        <div style={{ flexShrink: 0 }}>
          {justImported ? (
            <button
              onClick={onOpen}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#203b88", color: "white", border: "none" }}
            >
              <FileText size={14} /> Abrir análise <ChevronRight size={13} />
            </button>
          ) : isAlreadyDone ? (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>já importada</span>
          ) : (
            <button
              onClick={onImport}
              disabled={isImporting}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isImporting ? "not-allowed" : "pointer", background: isImporting ? "#e2e8f0" : "#203b88", color: isImporting ? "#94a3b8" : "white", border: "none", transition: "all 0.15s" }}
            >
              {isImporting
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Importando...</>
                : <><Zap size={14} /> Importar <ChevronRight size={13} /></>
              }
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: tipos de documento ── */}
      {op.documents.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          {op.documents.map(d => (
            <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "#f0f4ff", color: "#203b88", border: "1px solid #dce8f8" }}>
              <FileText size={10} /> {docLabel(d.type)}
            </span>
          ))}
        </div>
      )}

    </div>
  );
}
