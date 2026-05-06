"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import {
  Zap, RefreshCw, Loader2, FileText, Building2,
  AlertTriangle, ArrowRight, Clock,
  Sparkles, ChevronDown, ChevronUp,
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
  const [doneOpen, setDoneOpen]       = useState(false);
  const [zumbiOpen, setZumbiOpen]     = useState(false);

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

  // Polling 30s — atualiza lista automaticamente quando novo card chega via
  // webhook do Goalfy. Pausa quando aba está em background pra economizar.
  // Pausa também durante uma importação ativa pra não interromper estado visual.
  useEffect(() => {
    if (authLoading || !user) return;
    const POLL_MS = 30_000;
    const id = setInterval(() => {
      if (document.hidden) return;
      const algumaImportandoAtiva = Object.values(importPhase).some(
        p => p === "downloading" || p === "extracting",
      );
      if (algumaImportandoAtiva) return;
      fetchList();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [authLoading, user, fetchList, importPhase]);

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
      const json = await res.json() as {
        success?: boolean;
        collection_id?: string;
        documents_imported?: number;
        documents_total?: number;
        error?: string;
      };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Erro ao importar");

      setImported(prev => ({ ...prev, [op.id]: json.collection_id! }));
      setImportPhase(p => ({ ...p, [op.id]: "done" }));
      setOperations(prev => prev.map(o => o.id === op.id ? { ...o, already_imported: true } : o));

      // Toast com contagem real de documentos baixados (alguns podem ter falhado download)
      const baixados = json.documents_imported ?? 0;
      const total = json.documents_total ?? op.documents.length;
      if (baixados === total && total > 0) {
        toast.success(`${op.company_name} — ${total} documento${total !== 1 ? "s" : ""} importado${total !== 1 ? "s" : ""}`, {
          description: "Abrindo a coleção para revisão...",
          duration: 2500,
        });
      } else if (baixados > 0) {
        toast.warning(`${op.company_name} — ${baixados} de ${total} documentos importados`, {
          description: `${total - baixados} falharam o download. Revise antes de gerar o relatório.`,
          duration: 4500,
        });
      } else {
        toast.error(`${op.company_name} — nenhum documento foi baixado`, {
          description: "Verifique a URL configurada no Goalfy ou GOALFY_API_KEY no Vercel.",
          duration: 6000,
        });
      }

      // Auto-navega para a coleção após pequeno delay (deixa o usuário ver o "Analisada"
      // verde + ler o toast). Pula auto-nav se nenhum doc foi baixado para evitar tela vazia.
      if (baixados > 0 && json.collection_id) {
        setTimeout(() => router.push(`/?resume=${json.collection_id}`), 1500);
      }
    } catch (e) {
      setImportPhase(p => ({ ...p, [op.id]: "error" }));
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error(`Falha ao importar ${op.company_name}`, {
        description: msg,
        duration: 5000,
      });
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
    <div style={{ minHeight: "100vh", background: "#f5f7fb" }}>

      {/* ── HERO BANNER full-width ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1f5c 0%, #203b88 45%, #2d4fad 100%)",
        position: "relative",
        overflow: "hidden",
        paddingBottom: 80,
      }}>
        {/* Padrão decorativo */}
        <div aria-hidden style={{
          position: "absolute", top: -100, right: -100, width: 380, height: 380, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,217,107,0.18) 0%, transparent 70%)",
        }} />
        <div aria-hidden style={{
          position: "absolute", bottom: -80, left: "30%", width: 260, height: 260, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)",
        }} />

        <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 0", position: "relative", zIndex: 1 }}>
          {/* Título + ações */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14,
                padding: "5px 12px", borderRadius: 99,
                background: "rgba(168,217,107,0.18)", border: "1px solid rgba(168,217,107,0.35)",
              }}>
                <Zap size={12} style={{ color: "#a8d96b" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#a8d96b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Goalfy CRM
                </span>
              </div>
              <h1 style={{
                fontSize: 44, fontWeight: 900, color: "#fff", margin: 0,
                letterSpacing: "-0.035em", lineHeight: 1.02,
              }}>
                Importar do{" "}
                <span style={{
                  background: "linear-gradient(135deg, #a8d96b 0%, #d4ed94 50%, #73b815 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  fontStyle: "italic",
                  letterSpacing: "-0.02em",
                  paddingRight: 4,
                }}>Goalfy</span>
              </h1>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 12, fontWeight: 700, color: "#0f1f5c",
                background: "#fff", border: "none",
                borderRadius: 10, padding: "10px 18px",
                cursor: syncing ? "not-allowed" : "pointer",
                opacity: syncing ? 0.6 : 1,
                transition: "all 0.15s",
                boxShadow: "0 8px 24px -8px rgba(0,0,0,0.4)",
              }}
              onMouseEnter={e => {
                if (!syncing) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 12px 28px -10px rgba(0,0,0,0.5)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 8px 24px -8px rgba(0,0,0,0.4)";
              }}
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </button>
          </div>

          {/* KPIs inline no hero */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)",
            overflow: "hidden",
            backdropFilter: "blur(8px)",
          }}>
            <div style={{
              padding: "20px 22px",
              background: "rgba(15,31,92,0.45)",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#fcd34d",
                textTransform: "uppercase", letterSpacing: "0.1em",
              }}>Pendentes</span>
              <span style={{
                fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1,
                letterSpacing: "-0.02em", fontFeatureSettings: '"tnum"',
              }}>{pending.length}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {pending.length > 0 ? "aguardando análise" : "tudo em dia"}
              </span>
            </div>
            <div style={{
              padding: "20px 22px",
              background: "rgba(15,31,92,0.45)",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#86efac",
                textTransform: "uppercase", letterSpacing: "0.1em",
              }}>Analisadas</span>
              <span style={{
                fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1,
                letterSpacing: "-0.02em", fontFeatureSettings: '"tnum"',
              }}>{done.length}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {done.length > 0 ? "concluídas" : "—"}
              </span>
            </div>
            <div style={{
              padding: "20px 22px",
              background: "rgba(15,31,92,0.45)",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#a8d96b",
                textTransform: "uppercase", letterSpacing: "0.1em",
              }}>Última sync</span>
              <span style={{
                fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1,
                letterSpacing: "-0.02em", fontFeatureSettings: '"tnum"',
              }}>
                {lastSync ? lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {lastSync ? "atualizado" : "não sincronizado"}
              </span>
            </div>
          </div>
        </main>
      </div>

      {/* ── CONTENT (sobe sobre o hero) ── */}
      <main style={{
        maxWidth: 1100, margin: "-50px auto 0",
        padding: "0 24px 80px", position: "relative", zIndex: 2,
        // Pattern sutil dots navy 4% — identidade Capital sem ruído
        backgroundImage: "radial-gradient(circle, rgba(32,59,136,0.06) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        backgroundPosition: "0 60px",
      }}>

        {/* ── Erro global ────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 mb-5">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* ── Pendentes ─ separados em IMPORTÁVEIS e ZUMBI ──────────────── */}
        {(() => {
          const isImportavel = (op: OperationWithStatus) => {
            if (!Array.isArray(op.documents)) return false;
            return op.documents.some(d => {
              if (!d || typeof d.url !== "string") return false;
              return d.url.startsWith("http://") || d.url.startsWith("https://");
            });
          };
          const importaveis = pending.filter(isImportavel);
          const zumbis      = pending.filter(op => !isImportavel(op));

          return (
            <>
              {/* IMPORTÁVEIS — destaque máximo */}
              {importaveis.length > 0 && (
                <section className="mb-6">
                  <div style={{
                    display: "flex", alignItems: "baseline", gap: 10, marginBottom: 24,
                  }}>
                    <h2 style={{
                      fontSize: 18, fontWeight: 900, margin: 0,
                      letterSpacing: "-0.02em",
                      background: "linear-gradient(135deg, #5a9010 0%, #73b815 50%, #a8d96b 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      fontStyle: "italic",
                    }}>
                      Aguardando análise
                    </h2>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: "#94a3b8",
                      fontFeatureSettings: '"tnum"',
                    }}>
                      {importaveis.length}
                    </span>
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                    gap: 16,
                  }}>
                    {importaveis.map(op => (
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

              {/* ZUMBIS — accordion fechado por padrão */}
              {zumbis.length > 0 && (
                <section className="mb-6">
                  <button
                    onClick={() => setZumbiOpen(o => !o)}
                    className="flex items-center gap-3 mb-3 group w-full text-left"
                    style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    <h3 style={{
                      fontSize: 13, fontWeight: 700, color: "#64748b", margin: 0,
                      letterSpacing: "-0.005em",
                    }}>
                      Cards sem documentos baixáveis
                    </h3>
                    <span style={{
                      fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 99,
                      background: "#f1f5f9", color: "#64748b",
                      border: "1px solid #e2e8f0",
                    }}>
                      {zumbis.length}
                    </span>
                    <span style={{ marginLeft: "auto", color: "#94a3b8" }}>
                      {zumbiOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>
                  {!zumbiOpen && (
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px", fontStyle: "italic" }}>
                      Cards antigos do Goalfy sem URLs de documento utilizáveis. Reenvie a automação para reprocessar.
                    </p>
                  )}
                  {zumbiOpen && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                      gap: 12,
                    }}>
                      {zumbis.map(op => (
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
                  )}
                </section>
              )}
            </>
          );
        })()}

        {/* ── Já analisadas — accordion ──────────────────────────────────── */}
        {done.length > 0 && (
          <section>
            <button
              onClick={() => setDoneOpen(o => !o)}
              className="flex items-center gap-3 mb-3 group w-full text-left"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
            >
              <h3 style={{
                fontSize: 13, fontWeight: 700, color: "#64748b", margin: 0,
                letterSpacing: "-0.005em",
              }}>
                Já analisadas
              </h3>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 99,
                background: "#f0fdf4", color: "#16a34a",
                border: "1px solid #86efac",
              }}>
                {done.length}
              </span>
              <span style={{ marginLeft: "auto", color: "#94a3b8" }}>
                {doneOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>

            {doneOpen && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: 12,
              }}>
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
          <div style={{
            position: "relative",
            background: "linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%)",
            border: "1px solid #e8edf5",
            borderRadius: 20,
            padding: "56px 32px",
            textAlign: "center",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
          }}>
            {/* Padrão decorativo no canto */}
            <div aria-hidden style={{
              position: "absolute", top: -40, right: -40, width: 220, height: 220, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(168,217,107,0.12) 0%, transparent 70%)",
            }} />
            <div aria-hidden style={{
              position: "absolute", bottom: -30, left: -30, width: 180, height: 180, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(32,59,136,0.06) 0%, transparent 70%)",
            }} />

            {/* Ilustração SVG ─ funil de webhook → análise */}
            <svg
              width="120" height="120" viewBox="0 0 120 120" fill="none"
              style={{ margin: "0 auto 20px", display: "block", position: "relative", zIndex: 1 }}
              aria-hidden
            >
              <defs>
                <linearGradient id="emptyNavy" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#203b88" />
                  <stop offset="100%" stopColor="#2d4fad" />
                </linearGradient>
                <linearGradient id="emptyGreen" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a8d96b" />
                  <stop offset="100%" stopColor="#73b815" />
                </linearGradient>
              </defs>
              {/* Card de fundo (light) */}
              <rect x="22" y="38" width="76" height="56" rx="10" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" />
              {/* Linhas de placeholder */}
              <rect x="32" y="50" width="32" height="4" rx="2" fill="#cbd5e1" />
              <rect x="32" y="60" width="48" height="3" rx="1.5" fill="#e2e8f0" />
              <rect x="32" y="68" width="24" height="3" rx="1.5" fill="#e2e8f0" />
              {/* Botão raio principal — cor da marca */}
              <circle cx="60" cy="32" r="20" fill="url(#emptyNavy)" />
              <path d="M62 22 L52 36 L60 36 L58 44 L68 30 L60 30 Z" fill="url(#emptyGreen)" />
              {/* Pontos decorativos */}
              <circle cx="20" cy="28" r="3" fill="#a8d96b" opacity="0.6" />
              <circle cx="100" cy="22" r="2.5" fill="#73b815" opacity="0.4" />
              <circle cx="106" cy="100" r="3.5" fill="#203b88" opacity="0.18" />
              <circle cx="14" cy="92" r="2.5" fill="#2d4fad" opacity="0.22" />
            </svg>

            <h3 style={{
              fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 6px",
              letterSpacing: "-0.01em", position: "relative", zIndex: 1,
            }}>
              Nenhuma operação recebida ainda
            </h3>
            <p style={{
              fontSize: 13, color: "#64748b", maxWidth: 380, margin: "0 auto",
              lineHeight: 1.55, position: "relative", zIndex: 1,
            }}>
              Quando um card for criado no Goalfy, ele aparece aqui automaticamente via webhook.
              <br />
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                A página atualiza sozinha a cada 30 segundos.
              </span>
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
  // Card está "zumbi": sem documentos OU todos documentos sem URL utilizável.
  // Acontece quando webhook do Goalfy chegou com payload incompleto OU o card
  // foi criado antes do fix do /receber (URLs S3 já expiradas).
  // Importar não vai trazer nada — bloqueia preventivamente.
  // Defensivo: row.documents pode vir como null/undefined ou string JSON
  // se o Supabase devolver shape inesperado — não pode crashar a página.
  const docsList = Array.isArray(op.documents) ? op.documents : [];
  const semDocsUteis = docsList.length === 0 || docsList.every(d => {
    if (!d || typeof d.url !== "string") return true;
    return !d.url.startsWith("http://") && !d.url.startsWith("https://");
  });
  const isZombie = semDocsUteis && !isAlreadyDone && !justDone;

  const [fg, bg] = avatarColor(op.company_name);
  const initials  = companyInitials(op.company_name);

  // Cor da borda esquerda por status
  const leftBorderColor = isError
    ? "#ef4444"
    : justDone || isAlreadyDone
    ? "#22c55e"
    : isActive
    ? "#3b82f6"
    : isZombie
    ? "#f59e0b"
    : "#203b88";

  // Card "premium" — layout vertical com avatar grande, sombra colorida quando importável
  const isImportavelEstado = !isZombie && !isAlreadyDone && !justDone && !isError && !isActive;
  const cardShadow = isImportavelEstado
    ? "0 1px 3px rgba(32,59,136,0.06), 0 8px 24px -12px rgba(32,59,136,0.18)"
    : isActive
      ? "0 0 0 3px rgba(59,130,246,0.08), 0 4px 12px -4px rgba(59,130,246,0.2)"
      : justDone || isAlreadyDone
        ? "0 1px 3px rgba(34,197,94,0.06), 0 6px 18px -10px rgba(34,197,94,0.15)"
        : isZombie
          ? "0 1px 3px rgba(217,119,6,0.04)"
          : "0 1px 3px rgba(0,0,0,0.04)";

  return (
    <div
      className="rounded-2xl border transition-all overflow-hidden"
      style={{
        background: isImportavelEstado
          ? "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)"
          : isZombie
            ? "#fdfdfb"
            : "#fff",
        borderColor: isImportavelEstado
          ? "rgba(32,59,136,0.18)"
          : isZombie
            ? "#fde68a"
            : "#e5e7eb",
        borderLeft: `4px solid ${leftBorderColor}`,
        boxShadow: cardShadow,
        opacity: isZombie ? 0.78 : 1,
      }}
    >
      <div style={{ padding: "18px 18px 16px" }}>
        {/* Header: avatar grande + nome + tempo + status badge */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
          {/* Avatar grande com gradient */}
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: isAlreadyDone || justDone
              ? "linear-gradient(135deg, #f1f5f9, #e2e8f0)"
              : isZombie
                ? "linear-gradient(135deg, #fef3c7, #fde68a)"
                : `linear-gradient(135deg, ${bg}, ${bg}dd)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 17, letterSpacing: "-0.03em",
            color: isAlreadyDone || justDone ? "#94a3b8" : isZombie ? "#b45309" : fg,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
          }}>
            {initials}
          </div>

          {/* Info nome + tempo + badge */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{
                fontSize: 15, fontWeight: 800, color: "#0f172a",
                letterSpacing: "-0.01em", lineHeight: 1.25,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "100%",
              }}>
                {op.company_name}
              </span>
              {(isAlreadyDone || justDone) && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99,
                  background: "#f0fdf4", color: "#16a34a",
                  border: "1px solid #86efac", flexShrink: 0,
                }}>
                  <CheckCircle2 size={9} /> Analisada
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {op.cnpj && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, color: "#64748b", fontWeight: 500,
                }}>
                  <Building2 size={10} /> {op.cnpj}
                </span>
              )}
              {op.manager_name && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, color: "#64748b", fontWeight: 500,
                }}>
                  <User size={10} /> {op.manager_name}
                </span>
              )}
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, color: "#94a3b8", fontWeight: 500,
              }}>
                <Clock size={10} /> {timeAgo(op.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Barra de progresso */}
        {isActive && (
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 6, background: "#dbeafe", borderRadius: 99, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%", width: phase === "downloading" ? "35%" : "80%",
                    background: "linear-gradient(90deg,#3b82f6,#6366f1)",
                    borderRadius: 99, transition: "width 0.7s cubic-bezier(.4,0,.2,1)",
                  }}
                />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", whiteSpace: "nowrap" }}>
                {phase === "downloading"
                  ? `Baixando ${op.document_count} arq.`
                  : "Extraindo com IA..."}
              </span>
            </div>
          </div>
        )}

        {/* Chips de documentos */}
        {docsList.length > 0 && !isActive && (
          <div style={{
            display: "flex", gap: 6, flexWrap: "wrap",
            marginTop: 4, marginBottom: 14,
          }}>
            {docsList.map(d => (
              <span
                key={d.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                  background: isAlreadyDone || justDone
                    ? "#f1f5f9"
                    : isZombie
                      ? "#fef9c3"
                      : "#f0f9e0",
                  color: isAlreadyDone || justDone
                    ? "#94a3b8"
                    : isZombie
                      ? "#92400e"
                      : "#5a9010",
                  border: `1px solid ${isAlreadyDone || justDone ? "#e2e8f0" : isZombie ? "#fde68a" : "#c4e08a"}`,
                }}
              >
                <FileText size={9} /> {docLabel(d.type)}
              </span>
            ))}
          </div>
        )}

        {/* Botão de ação — full-width no rodapé do card */}
        <div>
          {justDone && importedId ? (
            <button
              onClick={onOpen}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "11px 16px", borderRadius: 11,
                fontSize: 13, fontWeight: 700, color: "#fff",
                background: "linear-gradient(135deg, #0f1f5c, #2d4fad)",
                border: "none", cursor: "pointer",
                boxShadow: "0 4px 12px -4px rgba(32,59,136,0.4)",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 8px 18px -4px rgba(32,59,136,0.5)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px -4px rgba(32,59,136,0.4)";
              }}
            >
              <ArrowRight size={14} /> Abrir análise
            </button>
          ) : isAlreadyDone ? (
            <button
              onClick={onOpen}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                width: "100%", padding: "9px 14px", borderRadius: 10,
                fontSize: 12, fontWeight: 700, color: "#203b88",
                background: "#fff", border: "1.5px solid #c7d2fe",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f0f4ff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
            >
              <ArrowRight size={12} /> Ver análise
            </button>
          ) : isActive ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "11px 16px", borderRadius: 11,
              fontSize: 12, fontWeight: 700, color: "#3b82f6",
              background: "#eff6ff", border: "1px solid #bfdbfe",
            }}>
              <Loader2 size={13} className="animate-spin" />
              {phase === "downloading" ? "Baixando..." : "Extraindo..."}
            </div>
          ) : isError ? (
            <button
              onClick={onImport}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "11px 16px", borderRadius: 11,
                fontSize: 13, fontWeight: 700, color: "#dc2626",
                background: "#fef2f2", border: "1.5px solid #fca5a5",
                cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2"; }}
            >
              <AlertTriangle size={14} /> Tentar novamente
            </button>
          ) : isZombie ? (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "10px 14px", borderRadius: 10,
                fontSize: 12, fontWeight: 700, color: "#92400e",
                background: "#fffbeb", border: "1.5px dashed #fcd34d",
                cursor: "not-allowed",
              }}
              title="Card sem URLs de documento utilizáveis. Reenvie a automação do Goalfy para reprocessar."
            >
              <AlertTriangle size={13} /> Sem documentos baixáveis
            </div>
          ) : (
            <button
              onClick={onImport}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "11px 16px", borderRadius: 11,
                fontSize: 13, fontWeight: 700, color: "#fff",
                background: "linear-gradient(135deg, #0f1f5c 0%, #203b88 50%, #2d4fad 100%)",
                border: "none", cursor: "pointer",
                boxShadow: "0 4px 14px -4px rgba(32,59,136,0.45), inset 0 1px 0 rgba(168,217,107,0.2)",
                transition: "all 0.18s",
              }}
              title="Baixa os documentos do Goalfy e abre a tela de revisão"
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 10px 22px -6px rgba(32,59,136,0.55), inset 0 1px 0 rgba(168,217,107,0.3)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 14px -4px rgba(32,59,136,0.45), inset 0 1px 0 rgba(168,217,107,0.2)";
              }}
            >
              <Sparkles size={14} style={{ color: "#a8d96b" }} /> Importar e revisar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
