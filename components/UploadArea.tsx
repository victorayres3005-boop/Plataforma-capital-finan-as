"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, FileText, FileSpreadsheet, Image as ImageIcon, CheckCircle2, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const EXTRACTION_MESSAGES: Record<string, string[]> = {
  cnpj:        ["Lendo documento...", "Extraindo dados societários...", "Validando CNPJ..."],
  qsa:         ["Lendo documento...", "Extraindo quadro societário...", "Validando sócios..."],
  contrato:    ["Lendo contrato...", "Extraindo cláusulas...", "Validando dados..."],
  faturamento: ["Lendo planilha...", "Calculando FMM...", "Validando meses..."],
  scr:         ["Lendo SCR...", "Extraindo modalidades...", "Calculando alavancagem..."],
  scrAnterior: ["Lendo SCR anterior...", "Extraindo modalidades...", "Calculando comparativo..."],
};
const DEFAULT_MESSAGES = ["Processando...", "Interpretando documento...", "Quase pronto..."];

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
    case ".pdf":   return <FileText size={13} className="text-red-500 flex-shrink-0" />;
    case ".xls":
    case ".xlsx":  return <FileSpreadsheet size={13} className="text-green-600 flex-shrink-0" />;
    case ".doc":
    case ".docx":  return <FileText size={13} className="text-blue-600 flex-shrink-0" />;
    case ".jpg":
    case ".jpeg":
    case ".png":   return <ImageIcon size={13} className="text-purple-500 flex-shrink-0" />;
    default:       return <FileText size={13} className="text-cf-text-3 flex-shrink-0" />;
  }
}

export interface UploadAreaProps {
  title: string;
  description: string;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  processing: boolean;
  doneCount: number;
  errorCount: number;
  errorType?: string;
  onRetry?: () => void;
  onReprocess?: () => void;
  reprocessing?: boolean;
  icon: React.ReactNode;
  docKey: string;
  resumedFilenames?: string[];
  fromCache?: boolean;
  onForceReextract?: () => void;
}

export default function UploadArea({
  title, description, files, onAddFiles, onRemoveFile,
  processing, doneCount, errorCount, errorType,
  onRetry, onReprocess, reprocessing, icon, docKey, resumedFilenames,
  fromCache, onForceReextract,
}: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const dragCounter = useRef(0);

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
  const hasFiles   = files.length > 0;
  const hasResumed = (resumedFilenames?.length ?? 0) > 0;
  const isDone     = doneCount > 0;
  const hasError   = errorCount > 0;

  const filterAndAdd = useCallback((incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const valid: File[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i];
      if (isAcceptedFile(f)) valid.push(f);
      else toast.error(`Formato não suportado: ${f.name}`);
    }
    if (valid.length > 0) onAddFiles(valid);
  }, [onAddFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    filterAndAdd(e.dataTransfer.files);
  }, [filterAndAdd]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    filterAndAdd(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  }, [filterAndAdd]);

  // Left accent color
  const accentColor = isDone  ? "#16a34a"
    : hasError                ? "#dc2626"
    : processing              ? "#3b82f6"
    : dragOver                ? "#203b88"
    : "transparent";

  return (
    <div
      className="relative rounded-xl border border-cf-border bg-white transition-all duration-200 overflow-hidden"
      style={{ borderLeft: `3px solid ${accentColor}` }}
      onDragEnter={() => { dragCounter.current++; setDragOver(true); }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setDragOver(false); }}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={ACCEPT_STRING} multiple className="hidden" onChange={handleInputChange} />

      {/* ── Compact main row ── */}
      <div
        className="flex items-center gap-3 px-4 h-14 cursor-pointer select-none hover:bg-cf-surface/40 transition-colors duration-150"
        onClick={() => inputRef.current?.click()}
      >
        {/* Status icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          isDone     ? "bg-green-50 text-green-600"
          : hasError ? "bg-red-50 text-red-500"
          : processing ? "bg-blue-50 text-blue-500"
          : "bg-cf-surface text-cf-navy"
        }`}>
          {processing
            ? <Loader2 size={15} className="animate-spin" />
            : isDone     ? <CheckCircle2 size={15} />
            : hasError   ? <AlertCircle size={15} />
            : icon}
        </div>

        {/* Title + subtitle */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-cf-text-1 leading-tight">{title}</p>
          <p className="text-[11px] truncate leading-tight mt-0.5 text-cf-text-4">
            {processing
              ? extractionMsg
              : hasFiles
                ? files.length === 1 ? files[0].name : `${files.length} arquivos`
                : hasResumed
                  ? resumedFilenames!.length === 1 ? resumedFilenames![0] : `${resumedFilenames!.length} arquivos`
                  : description}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {/* Remove all */}
          {!processing && hasFiles && (
            <button
              onClick={() => { for (let i = files.length - 1; i >= 0; i--) onRemoveFile(i); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-cf-text-3 hover:text-cf-danger hover:bg-red-50 transition-colors"
              title="Remover arquivo"
            >
              <X size={13} />
            </button>
          )}
          {/* Upload / Adicionar / Trocar button */}
          {!processing && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer ${
                hasFiles
                  ? "text-cf-text-3 border-cf-border hover:border-cf-navy hover:text-cf-navy"
                  : hasResumed
                    ? "text-cf-navy border-cf-navy/30 bg-cf-navy/5 hover:bg-cf-navy/10"
                    : "text-cf-navy border-cf-border hover:border-cf-navy hover:bg-cf-surface"
              }`}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={11} />
              {hasFiles ? "Trocar" : hasResumed ? "Adicionar" : "Upload"}
            </span>
          )}
        </div>
      </div>

      {/* ── File list ── */}
      {hasFiles && (
        <div className="px-4 pb-3 space-y-1">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-1.5 bg-cf-surface/60 rounded-lg">
              {getFileIcon(file.name)}
              <span className="text-[11px] text-cf-text-2 font-medium truncate flex-1 min-w-0">{file.name}</span>
              <span className="text-[10px] text-cf-text-4 flex-shrink-0">{formatSize(file.size)}</span>
              <button
                onClick={e => { e.stopPropagation(); onRemoveFile(index); }}
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-cf-text-4 hover:text-cf-danger hover:bg-red-50 transition-colors"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
            className="w-full text-[10px] font-medium text-cf-text-4 hover:text-cf-navy transition-colors pt-1 flex items-center justify-center gap-1"
          >
            <Upload size={9} /> Adicionar mais arquivos
          </button>
        </div>
      )}

      {/* ── Resumed filenames (when no new files uploaded) ── */}
      {hasResumed && !hasFiles && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {resumedFilenames!.map((name, i) => (
              <span key={i} className="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-md px-2 py-0.5 font-medium">
                ✓ {name}
              </span>
            ))}
          </div>
          <button
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
            className="w-full text-[10px] font-medium text-cf-text-4 hover:text-cf-navy transition-colors pt-2 flex items-center justify-center gap-1"
          >
            <Upload size={9} /> Adicionar novo documento
          </button>
        </div>
      )}

      {/* ── Inline error + retry ── */}
      {hasError && !processing && (
        <div className="px-4 pb-3 flex items-center gap-3">
          <p className="text-[11px] text-red-600 flex-1 leading-snug">
            {errorType === "quota" ? "API indisponível — limite de uso atingido. Tente em alguns minutos."
              : errorType === "parse" ? "Não foi possível interpretar o documento. Verifique o arquivo."
              : errorType === "empty" ? "Arquivo vazio ou ilegível. Envie um arquivo com conteúdo."
              : "Erro na extração. Tente novamente ou use outro formato."}
          </p>
          {onRetry && errorType !== "empty" && (
            <button
              onClick={e => { e.stopPropagation(); onRetry(); }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <RefreshCw size={10} /> Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* ── Reprocess button — visible after successful extraction ── */}
      {onReprocess && isDone && !hasError && !processing && (hasFiles || hasResumed) && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onReprocess(); }}
            disabled={reprocessing}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-cf-navy border border-cf-border rounded-lg px-2.5 py-1.5 hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50"
          >
            {reprocessing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            {reprocessing ? "Reextraindo..." : "Reprocessar extracao"}
          </button>
          {fromCache && onForceReextract && (
            <button
              onClick={e => { e.stopPropagation(); onForceReextract(); }}
              title="Resultado veio do cache — clique para forçar nova extração com o modelo atualizado"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-50 transition-colors"
            >
              <RefreshCw size={10} /> Reextrair (cache)
            </button>
          )}
        </div>
      )}

      {/* ── Drag & drop overlay ── */}
      {dragOver && (
        <div className="absolute inset-0 bg-blue-50/95 border-2 border-dashed border-blue-400 rounded-xl flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <Upload size={20} className="text-blue-500 mx-auto mb-1" />
            <p className="text-sm font-semibold text-blue-600">Solte o arquivo aqui</p>
          </div>
        </div>
      )}
    </div>
  );
}
