"use client";

import { useState, useCallback } from "react";

const STORAGE_KEY = "cf_tooltips_v1";

function loadSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveSeen(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

// Hook localStorage-only para tooltips de onboarding em componentes
// que não têm acesso ao userId (UploadStep, GenerateStep, histórico).
// Persiste entre sessões sem depender do Supabase.
export function useTooltips() {
  const [seen, setSeen] = useState<string[]>(() => loadSeen());

  const isSeen = useCallback((id: string) => seen.includes(id), [seen]);

  const markSeen = useCallback((id: string) => {
    setSeen(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveSeen(next);
      return next;
    });
  }, []);

  return { isSeen, markSeen };
}
