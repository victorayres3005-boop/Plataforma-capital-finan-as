"use client";

import { useEffect, useRef } from "react";
import { SectionCard } from "@/components/report/ReportComponents";

interface NotasSectionProps {
  analystNotes: string;
  onNotesChange: (v: string) => void;
  onSave: (v: string) => void;
  savingNotes: boolean;
}

export default function NotasSection({ analystNotes, onNotesChange, onSave, savingNotes }: NotasSectionProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { onSave(analystNotes); }, 2000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analystNotes]);

  return (
    <SectionCard
      id="sec-nt"
      badge="✎"
      badgeVariant="navy"
      sectionLabel="Observações do Analista"
      title="Anotações"
      headerRight={savingNotes ? <span className="text-[11px] text-cf-text-4">Salvando...</span> : undefined}
    >
      <div className="px-8 py-6">
        <textarea
          value={analystNotes}
          onChange={e => onNotesChange(e.target.value)}
          onBlur={() => { if (debounceRef.current) clearTimeout(debounceRef.current); onSave(analystNotes); }}
          placeholder="Registre aqui observações sobre a empresa, pontos de atenção identificados na visita, pendências de documentação, ou qualquer informação relevante para a tomada de decisão de crédito..."
          className="w-full min-h-[180px] resize-y bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3 text-[13px] text-cf-text-1 leading-relaxed font-sans outline-none focus:border-navy-800 focus:ring-1 focus:ring-navy-800/20 placeholder:text-cf-text-4"
        />
        <div className="flex justify-between mt-1.5 px-0.5">
          <span className="text-[11px] text-cf-text-4">Salvo automaticamente</span>
          <span className="text-[11px] text-cf-text-4 font-mono">{analystNotes.length} caracteres</span>
        </div>
      </div>
    </SectionCard>
  );
}
