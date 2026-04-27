export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/supabase/server";
import { syncGoalfyCards } from "@/lib/goalfy/sync";

// POST /api/goalfy/sync — disparo manual pelo botão "Sincronizar" na UI
export async function POST() {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const result = await syncGoalfyCards();

    if (result.error) {
      return Response.json({ success: false, error: result.error }, { status: 502 });
    }

    return Response.json({ success: true, synced: result.synced, total: result.total });
  } catch (err) {
    console.error("[goalfy/sync]", err);
    return Response.json({ success: false, error: "Erro interno ao sincronizar" }, { status: 500 });
  }
}
