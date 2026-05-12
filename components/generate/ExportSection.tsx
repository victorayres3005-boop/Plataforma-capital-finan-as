"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, Link2, Copy, Pencil } from "lucide-react";
import { SectionCard } from "@/components/report/ReportComponents";

type Format = "pdf" | "docx" | "xlsx" | "html";

interface ExportSectionProps {
  generatedFormats: Set<Format>;
  generatingFormat: Format | null;
  generatePDF: () => void;
  generateDOCX: () => void;
  generateExcel: () => void;
  generateHTML: () => void;
  generateHTMLView: () => void;
  shareReport: () => void;
  sharingReport?: boolean;
  sharedUrl?: string;
  sharedEditUrl?: string;
}

export default function ExportSection({
  generatedFormats,
  generatingFormat,
  generatePDF,
  generateDOCX,
  generateExcel,
  generateHTML,
  generateHTMLView,
  shareReport,
  sharingReport = false,
  sharedUrl,
  sharedEditUrl,
}: ExportSectionProps) {
  const [copiedKey, setCopiedKey] = useState<"public" | "edit" | null>(null);
  // Cleanup do timer do feedback "copiado!" — evita setState após unmount
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);
  const copyTo = async (key: "public" | "edit", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedKey(c => (c === key ? null : c)), 1600);
    } catch {
      // ignore
    }
  };
  return (
    <SectionCard
      id="sec-ex"
      badge="↓"
      badgeVariant="navy"
      sectionLabel="Download"
      title="Exportar Relatório"
    >
      <div className="px-8 py-6">
        {generatedFormats.size > 0 && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-green-50 border border-green-200 rounded-lg mb-3.5">
            <CheckCircle2 size={14} className="text-green-600" />
            <span className="text-xs font-medium text-green-700">Relatório gerado com sucesso!</span>
          </div>
        )}

        <div className="flex gap-2.5 flex-wrap">
          {([
            { fmt: "pdf"  as Format, label: "PDF",        sub: "Download direto (.pdf)", fn: generatePDF,      ext: ".pdf",  dot: "#dc2626", recommended: true },
            { fmt: "html" as Format, label: "Visualizar", sub: "Abre em nova aba",       fn: generateHTMLView, ext: ".html", dot: "#203b88", recommended: false },
          ]).map(({ fmt, label, sub, fn, ext, dot, recommended }) => {
            const done    = generatedFormats.has(fmt);
            const loading = generatingFormat === fmt;
            return (
              <button
                key={label}
                data-testid={`export-${fmt}-${label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={fn}
                disabled={!!generatingFormat}
                className={`flex-[1_1_140px] flex items-center gap-2.5 px-3.5 py-3 rounded-lg border relative text-left transition-all duration-150 hover:shadow-sm ${
                  done ? "bg-green-50 border-green-200" :
                  recommended ? "bg-blue-50 border-cf-navy" :
                  "bg-white border-gray-200"
                } ${!!generatingFormat ? "cursor-not-allowed" : "cursor-pointer"} ${!!generatingFormat && !loading ? "opacity-55" : "opacity-100"}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: done ? "#16a34a" : dot }} />
                <div className="flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-medium text-cf-text-1">{label}</span>
                    <span className="text-[11px] text-cf-text-4 font-mono">{ext}</span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: loading ? dot : done ? "#16a34a" : undefined }}>
                    {loading ? "Gerando..." : done ? "Pronto!" : <span className="text-cf-text-4">{sub}</span>}
                  </p>
                </div>
                {loading && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: dot }} />}
                {done    && <CheckCircle2 size={14} className="text-green-600 shrink-0" />}
                {recommended && !done && (
                  <span className="absolute -top-2.5 right-2.5 text-[9px] font-bold text-white bg-cf-navy rounded-full px-1.5 py-0.5 tracking-[0.03em]">
                    Recomendado
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Compartilhar — gera link público válido por 90 dias */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={shareReport}
              disabled={sharingReport || !!generatingFormat}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[13px] font-medium transition-all duration-150 hover:shadow-sm
                ${sharedUrl ? "bg-green-50 border-green-200 text-green-700" : "bg-white border-gray-200 text-cf-text-1"}
                ${(sharingReport || !!generatingFormat) ? "opacity-55 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {sharingReport ? (
                <Loader2 size={14} className="animate-spin" />
              ) : sharedUrl ? (
                <CheckCircle2 size={14} className="text-green-600" />
              ) : (
                <Link2 size={14} />
              )}
              {sharingReport ? "Gerando link…" : sharedUrl ? "Link copiado!" : "Compartilhar relatório"}
            </button>

          </div>

          {sharedUrl && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <Link2 size={13} className="text-cf-text-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cf-text-4 mb-0.5">Link público (comitê)</div>
                  <div className="text-[11px] font-mono text-cf-text-2 truncate select-all" title={sharedUrl}>{sharedUrl}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyTo("public", sharedUrl)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-gray-200 hover:bg-white"
                >
                  {copiedKey === "public" ? <CheckCircle2 size={12} className="text-green-600" /> : <Copy size={12} />}
                  {copiedKey === "public" ? "Copiado" : "Copiar"}
                </button>
              </div>

              {sharedEditUrl && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <Pencil size={13} className="text-amber-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-0.5">Link de edição (interno — não compartilhar)</div>
                    <div className="text-[11px] font-mono text-amber-900 truncate select-all" title={sharedEditUrl}>{sharedEditUrl}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyTo("edit", sharedEditUrl)}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-amber-300 bg-white hover:bg-amber-50 text-amber-800"
                  >
                    {copiedKey === "edit" ? <CheckCircle2 size={12} className="text-green-600" /> : <Copy size={12} />}
                    {copiedKey === "edit" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-cf-text-4 mt-2">
            <b>Público:</b> mande pro cliente, válido 90 dias, somente leitura.
            {sharedEditUrl ? (<><br/><b>Edição:</b> abre em modo edição (Pontos Fortes / Fracos / Alertas) — guardar somente com Victor/Vanessa.</>) : null}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
