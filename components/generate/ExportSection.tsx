"use client";

import { Loader2, CheckCircle2, Link2 } from "lucide-react";
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
}: ExportSectionProps) {
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
            { fmt: "docx" as Format, label: "Word",       sub: "Editável (.docx)",       fn: generateDOCX,     ext: ".docx", dot: "#2b5eb7", recommended: false },
            { fmt: "xlsx" as Format, label: "Excel",      sub: "Dados tabulados",        fn: generateExcel,    ext: ".xlsx", dot: "#1d6f42", recommended: false },
            { fmt: "html" as Format, label: "HTML",       sub: "Web / impressão",        fn: generateHTML,     ext: ".html", dot: "#e34f26", recommended: false },
          ]).map(({ fmt, label, sub, fn, ext, dot, recommended }) => {
            const done    = generatedFormats.has(fmt);
            const loading = generatingFormat === fmt;
            return (
              <button
                key={label}
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

            {sharedUrl && (
              <span className="text-[11px] text-cf-text-4 font-mono truncate max-w-xs select-all" title={sharedUrl}>
                {sharedUrl}
              </span>
            )}
          </div>
          <p className="text-[11px] text-cf-text-4 mt-1.5">
            Gera um link público válido por 90 dias — qualquer pessoa com o link consegue visualizar.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
