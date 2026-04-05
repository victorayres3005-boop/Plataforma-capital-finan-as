"use client";

import { X, Check } from "lucide-react";

interface FirstCollectionChecklistProps {
  currentStep: 1 | 2 | 3;
  onDismiss: () => void;
}

const steps = [
  { id: 1, title: "Enviar documentos", description: "Faca upload dos PDFs da empresa" },
  { id: 2, title: "Revisar dados extraidos", description: "Confira o que a IA identificou" },
  { id: 3, title: "Gerar relatorio", description: "Exporte em PDF, Word ou Excel" },
];

export default function FirstCollectionChecklist({ currentStep, onDismiss }: FirstCollectionChecklistProps) {
  const progress = Math.max(0, currentStep - 1);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[280px] bg-white rounded-xl border border-cf-border shadow-lg animate-slide-up overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-cf-bg border-b border-cf-border">
        <p className="text-xs font-bold text-cf-text-1">Sua primeira analise</p>
        <button onClick={onDismiss} className="w-5 h-5 rounded flex items-center justify-center text-cf-text-4 hover:text-cf-text-2 hover:bg-cf-surface transition-colors" style={{ minHeight: "auto" }}>
          <X size={12} />
        </button>
      </div>

      {/* Steps */}
      <div className="px-4 py-3 space-y-3">
        {steps.map(s => {
          const done = s.id < currentStep;
          const active = s.id === currentStep;

          return (
            <div key={s.id} className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {done ? (
                  <div className="w-5 h-5 rounded-full bg-cf-green flex items-center justify-center">
                    <Check size={10} className="text-white" strokeWidth={3} />
                  </div>
                ) : active ? (
                  <div className="w-5 h-5 rounded-full bg-cf-navy flex items-center justify-center animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-cf-border" />
                )}
              </div>

              {/* Text */}
              <div>
                <p className={`text-xs font-semibold leading-tight ${done ? "text-cf-green line-through" : active ? "text-cf-text-1" : "text-cf-text-4"}`}>
                  {s.title}
                </p>
                <p className={`text-[10px] leading-snug mt-0.5 ${active ? "text-cf-text-3" : "text-cf-text-4"}`}>
                  {s.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-cf-text-4">{progress}/3 concluido{progress !== 1 ? "s" : ""}</span>
        </div>
        <div className="h-1.5 bg-cf-border rounded-full overflow-hidden">
          <div
            className="h-full bg-cf-green rounded-full transition-all duration-500"
            style={{ width: `${(progress / 3) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
