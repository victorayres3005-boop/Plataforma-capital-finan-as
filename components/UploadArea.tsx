"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { DocStatus } from "@/types";

interface UploadAreaProps {
  title: string;
  description: string;
  status: DocStatus;
  fileName?: string;
  meta?: { filledFields: number; isScanned: boolean };
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  icon: React.ReactNode;
  stepNumber: string;
}

const ACCEPTED_EXTS = [".pdf", ".docx", ".jpg", ".jpeg", ".png", ".xlsx"];
const ACCEPTED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
const ACCEPT_STRING = ".pdf,.docx,.jpg,.jpeg,.png,.xlsx,application/pdf,image/jpeg,image/png";

function isAcceptedFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTS.includes(ext) || ACCEPTED_TYPES.includes(file.type);
}

export default function UploadArea({ title, description, status, fileName, meta, onFileSelect, onRemove, icon, stepNumber }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && isAcceptedFile(file)) onFileSelect(file);
    else if (file) toast.error("Formato não aceito. Use PDF, Word (.docx), Excel (.xlsx), JPG ou PNG.");
  }, [onFileSelect]);

  const isClickable = status === "idle";

  // Border + background by status
  const wrapperClass = {
    idle:       dragOver
                  ? "border-cf-navy bg-cf-surface"
                  : "border-cf-border bg-white hover:border-cf-navy hover:bg-cf-surface",
    processing: "border-cf-navy bg-cf-surface",
    done:       "border-cf-green bg-cf-green-pale",
    error:      "border-cf-danger bg-cf-danger-bg",
  }[status];

  const iconWrapClass = {
    idle:       "bg-cf-surface text-cf-navy",
    processing: "bg-cf-navy/10 text-cf-navy",
    done:       "bg-cf-green/10 text-cf-green",
    error:      "bg-cf-danger/10 text-cf-danger",
  }[status];

  return (
    <div
      className={`relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${wrapperClass} ${isClickable ? "cursor-pointer" : ""}`}
      onClick={() => isClickable && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (isClickable) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={ACCEPT_STRING} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && isAcceptedFile(f)) onFileSelect(f); }} />

      {/* Step number badge */}
      <div className="absolute -top-3 -left-2">
        <span className="w-5 h-5 rounded-full bg-cf-navy text-white text-[10px] font-bold flex items-center justify-center shadow-sm">{stepNumber}</span>
      </div>

      {/* Icon */}
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${iconWrapClass}`}>
        {status === "processing" ? <Loader2 size={20} className="animate-spin" />
         : status === "done"      ? <CheckCircle2 size={20} />
         : status === "error"     ? <AlertCircle size={20} />
         : icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-cf-text-1">{title}</span>
          {status === "processing" && (
            <span className="text-[11px] font-semibold text-cf-navy bg-cf-navy/10 px-2 py-0.5 rounded-full">Extraindo...</span>
          )}
          {status === "done" && (
            <span className="text-[11px] font-semibold text-cf-green bg-cf-green/10 px-2 py-0.5 rounded-full">Concluído ✓</span>
          )}
          {status === "done" && meta && meta.filledFields > 0 && (
            <span className="text-[11px] font-semibold text-cf-navy bg-cf-navy/10 px-2 py-0.5 rounded-full border border-cf-navy/15">
              {meta.filledFields} campos extraídos
            </span>
          )}
          {status === "done" && meta && meta.isScanned && (
            <span className="text-[11px] font-semibold text-cf-warning bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
              PDF escaneado — revise
            </span>
          )}
          {status === "error" && (
            <span className="text-[11px] font-semibold text-cf-danger bg-cf-danger/10 px-2 py-0.5 rounded-full">Erro</span>
          )}
        </div>
        <p className="text-xs text-cf-text-3 mt-0.5 leading-snug">{description}</p>
        {fileName && (
          <p className="text-xs text-cf-text-2 mt-1 font-mono flex items-center gap-1 truncate">
            <FileText size={10} className="flex-shrink-0" />{fileName}
          </p>
        )}
        {status === "idle" && !fileName && (
          <p className="text-xs text-cf-text-4 mt-1 flex items-center gap-1">
            <Upload size={10} />Clique ou arraste o arquivo aqui (PDF, Word, Excel ou imagem)
          </p>
        )}
      </div>

      {/* Remove button */}
      {(status === "done" || status === "error") && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="flex-shrink-0 w-7 h-7 rounded-lg border border-cf-border bg-white flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:border-cf-danger transition-colors"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
