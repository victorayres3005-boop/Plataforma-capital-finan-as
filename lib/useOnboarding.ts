"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface OnboardingState {
  welcomeSeen: boolean;
  firstCollectionDone: boolean;
  tooltipsSeen: string[];
  loaded: boolean;
}

export function useOnboarding(userId: string | undefined) {
  const [onboarding, setOnboarding] = useState<OnboardingState>({
    welcomeSeen: false,
    firstCollectionDone: false,
    tooltipsSeen: [],
    loaded: false,
  });

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_onboarding")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (data) {
        setOnboarding({
          welcomeSeen: data.welcome_seen,
          firstCollectionDone: data.first_collection_done,
          tooltipsSeen: data.tooltips_seen || [],
          loaded: true,
        });
      } else {
        await supabase.from("user_onboarding").insert({ user_id: userId });
        setOnboarding(prev => ({ ...prev, loaded: true }));
      }
    };
    load();
  }, [userId]);

  const markWelcomeSeen = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("user_onboarding").update({ welcome_seen: true, updated_at: new Date().toISOString() }).eq("user_id", userId);
    setOnboarding(prev => ({ ...prev, welcomeSeen: true }));
  }, [userId]);

  const markTooltipSeen = useCallback(async (tooltipId: string) => {
    if (!userId) return;
    setOnboarding(prev => {
      if (prev.tooltipsSeen.includes(tooltipId)) return prev;
      const newSeen = [...prev.tooltipsSeen, tooltipId];
      const supabase = createClient();
      supabase.from("user_onboarding").update({ tooltips_seen: newSeen, updated_at: new Date().toISOString() }).eq("user_id", userId).then(() => {});
      return { ...prev, tooltipsSeen: newSeen };
    });
  }, [userId]);

  const markFirstCollectionDone = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("user_onboarding").update({ first_collection_done: true, updated_at: new Date().toISOString() }).eq("user_id", userId);
    setOnboarding(prev => ({ ...prev, firstCollectionDone: true }));
  }, [userId]);

  const isTooltipSeen = useCallback((tooltipId: string) => onboarding.tooltipsSeen.includes(tooltipId), [onboarding.tooltipsSeen]);

  return {
    ...onboarding,
    markWelcomeSeen,
    markTooltipSeen,
    markFirstCollectionDone,
    isTooltipSeen,
  };
}
