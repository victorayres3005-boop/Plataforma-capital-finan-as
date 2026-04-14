"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    // Encerra todos os canais realtime (evita receber eventos do usuario antigo)
    try { await supabase.removeAllChannels(); } catch { /* ignore */ }
    await supabase.auth.signOut();
    // Limpa storage do navegador para evitar vazamento entre contas no mesmo browser
    try {
      const localKeysToRemove = [
        "cf_review_draft_v2",
        "cf_analyst_notes_draft",
        "cf_committee_draft",
        "cf_nav_state",
      ];
      for (const k of localKeysToRemove) localStorage.removeItem(k);
      // Limpa qualquer chave especifica de coleta (cf_parecer_pending_*, etc)
      const allKeys = Object.keys(localStorage);
      for (const k of allKeys) {
        if (k.startsWith("cf_parecer_pending_") || k.startsWith("cf_")) {
          localStorage.removeItem(k);
        }
      }
      sessionStorage.clear();
    } catch { /* ignore */ }
    window.location.href = "/login";
  };

  return { user, loading, signOut };
}
