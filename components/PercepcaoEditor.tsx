"use client";

import { useRef, useState, useCallback } from "react";
import { Bold, Italic, List, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Editor leve para o campo "Percepção do Analista" (e textos similares).
 * Renderiza um <textarea> com toolbar acima que insere sintaxe markdown:
 *  - Negrito (B / Ctrl+B)
 *  - Itálico (I / Ctrl+I)
 *  - Lista (☰)
 *  - Alerta/Atenção/Positivo (cores semânticas: `:alerta[...]`, etc)
 *
 * Não renderiza preview — o relatório (PDF/HTML) já faz isso via
 * `lib/markdown/percepcao.ts`. Aqui o foco é apenas a edição.
 *
 * O valor salvo no banco é o markdown puro — retro-compatível com
 * textos antigos (sem marcação = renderiza como parágrafo).
 */
export interface PercepcaoEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}

export default function PercepcaoEditor({
  value,
  onChange,
  placeholder = "Percepção do analista...",
  rows = 4,
  autoFocus = false,
  disabled = false,
}: PercepcaoEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [hint, setHint] = useState(false);

  // Wrapper que insere `before...after` ao redor da seleção atual.
  // Se nada selecionado, insere "texto" como placeholder dentro.
  const wrap = useCallback((before: string, after: string, placeholderText = "texto") => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end) || placeholderText;
    const next = ta.value.slice(0, start) + before + sel + after + ta.value.slice(end);
    onChange(next);
    // Seleção fica sobre o texto inserido (não os marcadores)
    requestAnimationFrame(() => {
      ta.focus();
      const newStart = start + before.length;
      ta.setSelectionRange(newStart, newStart + sel.length);
    });
  }, [onChange]);

  // Prefixa cada linha da seleção (ou linha do cursor) com `- `
  const prefixList = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
    const next = ta.value.slice(0, lineStart) + "- " + ta.value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart + 2, lineStart + 2);
    });
  }, [onChange]);

  // Atalhos de teclado (Ctrl+B, Ctrl+I) — funcionam em Windows e Mac (metaKey).
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); wrap("**", "**"); }
    else if (k === "i") { e.preventDefault(); wrap("_", "_"); }
  }, [wrap]);

  const btn = "inline-flex items-center justify-center w-7 h-7 rounded-md text-[#6B7280] hover:text-[#111827] hover:bg-[#F1F5F9] border border-transparent hover:border-[#E5E7EB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const colorBtn = "inline-flex items-center gap-1 px-2 h-7 rounded-md text-[10.5px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 bg-[#FAFAFA] border border-[#E5E7EB] border-b-0 rounded-t-lg">
        <button type="button" onClick={() => wrap("**", "**")} disabled={disabled} className={btn} title="Negrito (Ctrl+B)">
          <Bold size={13} strokeWidth={2.5} />
        </button>
        <button type="button" onClick={() => wrap("_", "_")} disabled={disabled} className={btn} title="Itálico (Ctrl+I)">
          <Italic size={13} strokeWidth={2.5} />
        </button>
        <div className="w-px h-4 bg-[#E5E7EB] mx-1" />
        <button type="button" onClick={prefixList} disabled={disabled} className={btn} title="Lista com marcador">
          <List size={13} strokeWidth={2.5} />
        </button>
        <div className="w-px h-4 bg-[#E5E7EB] mx-1" />
        <button type="button" onClick={() => wrap(":alerta[", "]")} disabled={disabled} className={`${colorBtn} text-red-700 border-red-200 bg-red-50 hover:bg-red-100`} title="Marcar como alerta (vermelho)">
          <AlertCircle size={11} /> Alerta
        </button>
        <button type="button" onClick={() => wrap(":atencao[", "]")} disabled={disabled} className={`${colorBtn} text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100`} title="Marcar como atenção (amarelo)">
          <AlertTriangle size={11} /> Atenção
        </button>
        <button type="button" onClick={() => wrap(":positivo[", "]")} disabled={disabled} className={`${colorBtn} text-green-700 border-green-200 bg-green-50 hover:bg-green-100`} title="Marcar como positivo (verde)">
          <CheckCircle2 size={11} /> Positivo
        </button>
        <button
          type="button"
          onClick={() => setHint(p => !p)}
          className="ml-auto text-[10px] text-[#9CA3AF] hover:text-[#6B7280] underline-offset-2 hover:underline"
          title="Ajuda da sintaxe"
        >
          {hint ? "Ocultar ajuda" : "Ajuda"}
        </button>
      </div>

      {/* Textarea */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        disabled={disabled}
        className="w-full text-xs text-[#1F2937] bg-white border border-[#E5E7EB] rounded-b-lg px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-[#203b88]/20 placeholder:text-[#9CA3AF] font-mono"
        spellCheck
      />

      {/* Painel de ajuda (oculto por padrão) */}
      {hint && (
        <div className="mt-1.5 px-3 py-2 bg-[#F8FAFC] border border-[#F1F5F9] rounded-md text-[10.5px] text-[#6B7280] leading-relaxed">
          <b>**texto**</b> = negrito · <b>_texto_</b> = itálico · <b>- item</b> no início da linha = lista<br />
          <b>:alerta[texto]</b> · <b>:atencao[texto]</b> · <b>:positivo[texto]</b> = destaques com cor
        </div>
      )}
    </div>
  );
}
