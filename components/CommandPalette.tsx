"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, ClipboardList, X, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";

// Resultado vindo de document_collections + pareceres (busca por empresa/CNPJ).
type Result =
  | { kind: "coleta"; id: string; company: string; cnpj: string | null; status: string }
  | { kind: "parecer"; id: string; collectionId: string; company: string; cnpj: string | null; decisao: string };

const KEY = "k";

// Detecta Ctrl+K (Win/Linux) ou Cmd+K (Mac). Ignora se foco está em <input>/<textarea>
// que já está digitando — exceto quando combo é explícito com modifier.
function isShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === KEY;
}

export default function CommandPalette() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hotkey global Ctrl/Cmd+K — abre o palette de qualquer página com sessão.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isShortcut(e)) {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Foca no input quando abre, limpa estado quando fecha.
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      // pequeno timeout para não competir com a animação
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Busca debounced — 250ms — em coletas e pareceres.
  const search = useCallback(async (q: string) => {
    if (!user || !q.trim() || q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const term = q.trim();
      const cnpjDigits = term.replace(/\D/g, "");
      // OR entre company_name LIKE e cnpj LIKE (precisa virgular escapada).
      const safe = term.replace(/,/g, " ").replace(/%/g, "").replace(/'/g, "''");
      const orFilter = cnpjDigits.length >= 3
        ? `company_name.ilike.%${safe}%,cnpj.ilike.%${cnpjDigits}%`
        : `company_name.ilike.%${safe}%`;

      const [colRes, parRes] = await Promise.all([
        supabase
          .from("document_collections")
          .select("id, company_name, cnpj, label, status")
          .eq("user_id", user.id)
          .or(orFilter)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("pareceres")
          .select("id, collection_id, razao_social, cnpj, decisao_comite")
          .eq("user_id", user.id)
          .or(
            cnpjDigits.length >= 3
              ? `razao_social.ilike.%${safe}%,cnpj.ilike.%${cnpjDigits}%`
              : `razao_social.ilike.%${safe}%`,
          )
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const next: Result[] = [];
      for (const c of colRes.data ?? []) {
        next.push({
          kind: "coleta",
          id: c.id,
          company: c.company_name || c.label || "Empresa sem nome",
          cnpj: c.cnpj,
          status: c.status,
        });
      }
      for (const p of parRes.data ?? []) {
        next.push({
          kind: "parecer",
          id: p.id,
          collectionId: p.collection_id,
          company: p.razao_social || "Empresa sem nome",
          cnpj: p.cnpj,
          decisao: p.decisao_comite,
        });
      }
      setResults(next);
      setActiveIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const flatResults = useMemo(() => results, [results]);

  const navigate = useCallback((r: Result) => {
    setOpen(false);
    if (r.kind === "coleta") {
      router.push(`/historico?highlight=${r.id}`);
    } else {
      router.push(`/parecer?id=${r.collectionId}`);
    }
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flatResults[activeIdx];
      if (r) navigate(r);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Busca global"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-scale-in"
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar coletas e pareceres por empresa ou CNPJ"
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />}
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
            aria-label="Fechar busca"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Digite pelo menos 2 caracteres para buscar.
              <p className="text-xs text-slate-400 mt-2">
                Atalho: <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px]">Ctrl</kbd>
                {" + "}
                <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px]">K</kbd>
              </p>
            </div>
          ) : flatResults.length === 0 && !loading ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          ) : (
            <ul role="listbox">
              {flatResults.map((r, idx) => {
                const Icon = r.kind === "coleta" ? Building2 : ClipboardList;
                const isActive = idx === activeIdx;
                const subtitle = r.kind === "coleta"
                  ? `Coleta · ${r.cnpj ?? "sem CNPJ"} · ${r.status}`
                  : `Parecer · ${r.cnpj ?? "sem CNPJ"} · ${r.decisao.replace("_", " ")}`;
                return (
                  <li key={`${r.kind}-${r.id}`} role="option" aria-selected={isActive}>
                    <button
                      onClick={() => navigate(r)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isActive ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        r.kind === "coleta" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{r.company}</p>
                        <p className="text-xs text-slate-500 truncate">{subtitle}</p>
                      </div>
                      <ArrowRight className={`w-4 h-4 shrink-0 ${isActive ? "text-slate-700" : "text-slate-300"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">
          <span><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">↑↓</kbd> navegar</span>
          <span><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">↵</kbd> abrir</span>
          <span><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}
