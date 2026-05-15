"use client";
import { useEffect, useState } from "react";

/**
 * Modal reusável "Ver dados BDC" — exibe o JSON raw das consultas BigDataCorp.
 *
 * Replica funcionalmente o botão "🔗 Ver consulta original DataBox360"
 * (SectionSCR.tsx:31-42), mas como o BDC não retorna URL de relatório, o
 * conteúdo é renderizado aqui mesmo a partir do JSON persistido em
 * `data.rawBDC.{empresa,socios,grupo}`.
 *
 * Decisão 2026-05-15 (chefe Victor: Andressa).
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  raw: unknown;
}

export function BDCDataModal({ isOpen, onClose, title, subtitle, raw }: Props) {
  const [copied, setCopied] = useState(false);

  // ESC fecha o modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const jsonStr = JSON.stringify(raw, null, 2);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* fallback silencioso */ }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, padding: "32px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "12px", maxWidth: "900px", width: "100%",
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{title}</div>
            {subtitle && <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: "24px", lineHeight: 1,
              color: "#64748b", cursor: "pointer", padding: "0 8px",
            }}
            aria-label="Fechar"
          >×</button>
        </div>

        {/* Body — JSON formatado */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", background: "#f8fafc" }}>
          <pre
            style={{
              fontFamily: "'JetBrains Mono', 'Consolas', monospace",
              fontSize: "11px", lineHeight: 1.5, color: "#1e293b",
              margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}
          >
            {jsonStr}
          </pre>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }}>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Dados crus da consulta BigDataCorp · {jsonStr.length.toLocaleString("pt-BR")} caracteres
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleCopy}
              style={{
                fontSize: "12px", fontWeight: 600, padding: "6px 14px",
                background: copied ? "#dcfce7" : "#eef2fb", color: copied ? "#15803d" : "#203b88",
                border: "1px solid", borderColor: copied ? "#86efac" : "#c7d3f0",
                borderRadius: "6px", cursor: "pointer",
              }}
            >
              {copied ? "✓ Copiado" : "📋 Copiar JSON"}
            </button>
            <button
              onClick={onClose}
              style={{
                fontSize: "12px", fontWeight: 600, padding: "6px 14px",
                background: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer",
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Botão padronizado "Ver dados BDC" — usado nas Sections de revisão.
 * Quando clicado, abre o BDCDataModal com o raw passado.
 */
export function BDCDataButton({ title, subtitle, raw }: { title: string; subtitle?: string; raw: unknown }) {
  const [open, setOpen] = useState(false);
  if (!raw) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: "11px", fontWeight: 600, color: "#203b88",
          textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px",
          padding: "4px 10px", border: "1px solid #c7d3f0", borderRadius: "6px",
          background: "#eef2fb", cursor: "pointer",
        }}
      >
        🔎 Ver dados BDC
      </button>
      <BDCDataModal isOpen={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle} raw={raw} />
    </>
  );
}
