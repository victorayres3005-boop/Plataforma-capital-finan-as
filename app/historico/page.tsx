"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DocumentCollection, CollectionDocument } from "@/types";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, ChevronUp, FileText, Building2, BarChart3, ScrollText,
  Loader2, Pencil, Check, RotateCcw, Inbox, LogOut, User
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

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

function CollectionCard({ col, highlight }: { col: DocumentCollection; highlight: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState(col.label || "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  const saveLabel = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from("document_collections").update({ label: label || null }).eq("id", col.id);
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
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-green hover:bg-cf-green/5 border border-cf-green/20 rounded-lg px-3 py-1.5 transition-colors">
                <RotateCcw size={12} /> Retomar
              </Link>
            )}
            <button onClick={() => setExpanded(p => !p)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cf-navy hover:bg-cf-navy/5 border border-cf-navy/15 rounded-lg px-3 py-1.5 transition-colors">
              {expanded ? <><ChevronUp size={12} /> Fechar</> : <><ChevronDown size={12} /> Ver detalhes</>}
            </button>
          </div>
        </div>
      </div>

      {/* Accordion: documentos */}
      {expanded && (
        <div className="border-t border-cf-border px-5 pb-5 pt-3 space-y-2 animate-fade-in">
          {docs.length === 0 ? (
            <p className="text-xs text-cf-text-3 italic">Nenhum documento nesta coleta.</p>
          ) : docs.map((doc, i) => (
            <div key={i} className="flex items-center gap-3 bg-cf-bg rounded-xl px-4 py-3 border border-cf-border">
              <div className="w-7 h-7 rounded-lg bg-white border border-cf-border flex items-center justify-center flex-shrink-0">
                {docIcon[doc.type] || docIcon.outro}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-cf-text-1">{docLabel[doc.type] || doc.type}</p>
                <p className="text-xs text-cf-text-3 truncate">{doc.filename} — {new Date(doc.uploaded_at).toLocaleDateString("pt-BR")}</p>
              </div>
              <span className="text-[10px] font-bold text-cf-text-3 bg-cf-surface px-2 py-0.5 rounded-full">
                {Object.keys(doc.extracted_data || {}).length} campos
              </span>
            </div>
          ))}
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

        let query = supabase.from("document_collections").select("*").order("created_at", { ascending: false });
        if (user) query = query.eq("user_id", user.id);

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
              <CollectionCard key={col.id} col={col} highlight={col.id === highlightId} />
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
