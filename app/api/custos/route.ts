export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/custos?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns all api_usage_logs enriched with collection company info
export async function GET(req: NextRequest) {
  try {
    // Auth check via server supabase
    const authSb = await createServerSupabase();
    const { data: { user } } = await authSb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
    }
    const sb = createClient(supabaseUrl, supabaseKey);

    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to   = searchParams.get("to");

    // Fetch logs
    let logsQuery = sb
      .from("api_usage_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (from) logsQuery = logsQuery.gte("created_at", from);
    if (to)   logsQuery = logsQuery.lte("created_at", to + "T23:59:59Z");

    const { data: logs, error: logsError } = await logsQuery;
    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    // Enrich: fetch company info for collection_ids that are missing company_name
    const collectionIds = [...new Set(
      (logs ?? [])
        .filter(l => l.collection_id && !l.company_name)
        .map(l => l.collection_id as string)
    )];

    const collectionMap: Record<string, { company_name: string | null; cnpj: string | null }> = {};
    if (collectionIds.length > 0) {
      const { data: cols } = await sb
        .from("document_collections")
        .select("id, company_name, cnpj")
        .in("id", collectionIds);
      (cols ?? []).forEach(c => {
        collectionMap[c.id] = { company_name: c.company_name, cnpj: c.cnpj };
      });
    }

    const enrichedLogs = (logs ?? []).map(l => ({
      ...l,
      company_name: l.company_name ?? collectionMap[l.collection_id]?.company_name ?? null,
      cnpj: l.cnpj ?? collectionMap[l.collection_id]?.cnpj ?? null,
    }));

    // Also return collections that have NO logs (for the "all analyses" view)
    // These are analyses without real cost data — estimated on frontend
    const loggedCollectionIds = new Set(
      enrichedLogs.filter(l => l.collection_id).map(l => l.collection_id)
    );

    const { data: allCollections } = await sb
      .from("document_collections")
      .select("id, company_name, cnpj, created_at, ai_analysis")
      .order("created_at", { ascending: false })
      .limit(200);

    const collectionsWithoutLogs = (allCollections ?? [])
      .filter(c => !loggedCollectionIds.has(c.id))
      .map(c => ({
        id: c.id,
        company_name: c.company_name,
        cnpj: c.cnpj,
        created_at: c.created_at,
        has_ai_analysis: c.ai_analysis !== null,
      }));

    return NextResponse.json({
      success: true,
      logs: enrichedLogs,
      collectionsWithoutLogs,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
