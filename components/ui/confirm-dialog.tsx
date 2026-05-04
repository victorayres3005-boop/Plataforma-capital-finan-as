"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

// Modal de confirmação reutilizável para ações destrutivas (deletar coleta,
// excluir parecer, descartar política não salva). Substitui o uso de
// `window.confirm()` espalhado no app, que era inconsistente e bloqueava o
// thread.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";

  async function handleConfirm() {
    await onConfirm();
    if (!loading) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showClose={!loading}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            {isDestructive && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-cf-text-2 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-50 inline-flex items-center justify-center gap-2",
              isDestructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-cf-navy hover:bg-cf-navy-dark",
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
