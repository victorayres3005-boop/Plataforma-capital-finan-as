"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, FileText, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

const EXTRACTION_MESSAGES: Record<string, string[]> = {
  cnpj:        ["Lendo documento...", "Extraindo dados societários...", "Validando CNPJ..."],
  qsa:         ["Lendo documento...", "Extraindo dados societários...", "Validando CNPJ..."],
  contrato:    ["Lendo documento...", "Extraindo dados societários...", "Validando CNPJ..."],
  faturamento: ["Lendo planilha...", "Calculando FMM...", "Validando meses..."],
  scr:         ["Lendo SCR...", "Extraindo modalidades...", "Calculando alavancagem..."],
  scrAnterior: ["Lendo SCR...", "Extraindo modalidades...", "Calculando alavancagem..."],
};
const DEFAULT_MESSAGES = ["Processando...", "Interpretando documento...", "Quase pronto..."];

interface UploadAreaProps {
  title: string;
  description: string;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  processing: boolean;
  doneCount: number;
  errorCount: number;
  icon: React.ReactNode;
  stepNumber: string;
  docKey: string;
}

const ACCEPTED_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"];
const ACCEPT_STRING = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg";

function isAcceptedFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTS.includes(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  switch (ext) {
    case ".pdf":
      return <FileText size={16} className="text-red-500 flex-shrink-0" />;
    case ".xls":
    case ".xlsx":
      return <FileSpreadsheet size={16} className="text-green-600 flex-shrink-0" />;
    case ".doc":
    case ".docx":
      return <FileText size={16} className="text-blue-600 flex-shrink-0" />;
    case ".jpg":
    case ".jpeg":
    case ".png":
      return <ImageIcon size={16} className="text-purple-500 flex-shrink-0" />;
    default:
      return <FileText size={16} className="text-cf-text-3 flex-shrink-0" />;
  }
}

export default function UploadArea({
  title,
  description,
  files,
  onAddFiles,
  onRemoveFile,
  processing,
  doneCount,
  errorCount,
  icon,
  stepNumber,
  docKey,
}: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!processing) { setMsgIndex(0); return; }
    const id = setInterval(() => {
      setMsgIndex(i => {
        const msgs = EXTRACTION_MESSAGES[docKey] ?? DEFAULT_MESSAGES;
        return (i + 1) % msgs.length;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [processing, docKey]);

  const extractionMsg = (EXTRACTION_MESSAGES[docKey] ?? DEFAULT_MESSAGES)[msgIndex];

  const hasFiles = files.length > 0;

  const filterAndAdd = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;
      const valid: File[] = [];
      for (let i = 0; i < incoming.length; i++) {
        const f = incoming[i];
        if (isAcceptedFile(f)) {
          valid.push(f);
        } else {
          toast.error(`Formato não suportado: ${f.name}`);
        }
      }
      if (valid.length > 0) {
        onAddFiles(valid);
      }
    },
    [onAddFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      filterAndAdd(e.dataTransfer.files);
    },
    [filterAndAdd]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      filterAndAdd(e.target.files);
      // Reset input so re-selecting the same file works
      if (inputRef.current) inputRef.current.value = "";
    },
    [filterAndAdd]
  );

  // Border style depends on state
  const borderClass = hasFiles
    ? "border-cf-navy bg-white"
    : dragOver
      ? "border-cf-navy bg-cf-surface"
      : "border-cf-border bg-white hover:border-cf-navy hover:bg-cf-surface";

  return (
    <div className={`relative rounded-xl border-2 transition-all duration-200 ${hasFiles ? borderClass : ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_STRING}
        multiple
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Step number badge */}
      <div className="absolute -top-3 -left-2 z-10">
        <span className="w-5 h-5 rounded-full bg-cf-navy text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
          {stepNumber}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 p-4 pb-2">
        {/* Icon */}
        <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-cf-surface text-cf-navy transition-colors">
          {icon}
        </div>

        {/* Title + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-cf-text-1">{title}</span>
            {hasFiles && (
              <span className="text-[11px] font-semibold text-cf-navy bg-cf-navy/10 px-2 py-0.5 rounded-full">
                {files.length} arquivo{files.length !== 1 ? "s" : ""}
              </span>
            )}
            {processing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cf-navy bg-cf-navy/10 px-2 py-0.5 rounded-full">
                <svg className="animate-spin flex-shrink-0" width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                  <path d="M10 5.5A4.5 4.5 0 0 0 5.5 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {extractionMsg}
              </span>
            )}
            {doneCount > 0 && (
              <span className="text-[11px] font-semibold text-cf-green bg-cf-green/10 px-2 py-0.5 rounded-full">
                {doneCount} concluído{doneCount !== 1 ? "s" : ""} ✓
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-[11px] font-semibold text-cf-danger bg-cf-danger/10 px-2 py-0.5 rounded-full">
                {errorCount} erro{errorCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-cf-text-3 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="px-4 pb-2 space-y-1.5">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-cf-border rounded-lg"
            >
              {getFileIcon(file.name)}
              <span className="text-xs text-cf-text-1 font-medium truncate flex-1 min-w-0">
                {file.name}
              </span>
              <span className="text-[11px] text-cf-text-3 flex-shrink-0">
                {formatSize(file.size)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(index);
                }}
                className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-cf-danger/10 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`mx-4 mb-4 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all duration-200 ${
          hasFiles
            ? "py-3 border-cf-border bg-cf-surface/50 hover:border-cf-navy hover:bg-cf-surface"
            : `py-6 ${borderClass}`
        } ${dragOver ? "border-cf-navy bg-cf-surface" : ""} ${!hasFiles ? "mt-0 rounded-xl" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <p className="text-xs text-cf-text-4 flex items-center gap-1.5">
          <Upload size={hasFiles ? 12 : 14} />
          {hasFiles
            ? "+ Adicionar mais arquivos"
            : "Clique ou arraste arquivos aqui (PDF, Word, Excel ou imagem)"}
        </p>
      </div>
    </div>
  );
}
