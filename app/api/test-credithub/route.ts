export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const urlParams = new URL(req.url).searchParams;
  const cnpj = urlParams.get("cnpj") || "33570033000126";

  const apiUrl = process.env.CREDITHUB_API_URL;
  const apiKey = process.env.CREDITHUB_API_KEY;

  const result: Record<string, unknown> = { cnpj };

  // 1. Check Supabase cache
  try {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supaUrl && supaKey) {
      const db = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
      // Count total cache entries
      const { count } = await db.from("bureau_cache").select("*", { count: "exact", head: true });
      result.totalCachedEntries = count;
      // Get most recent entries
      const { data: recent } = await db.from("bureau_cache").select("cnpj, created_at, expires_at").order("created_at", { ascending: false }).limit(5);
      result.recentCached = recent;
      const { data: cached } = await db.from("bureau_cache").select("result, expires_at, created_at").eq("cnpj", cnpj).single();
      if (cached) {
        const r = cached.result as { protestos?: unknown; processos?: unknown; ccf?: unknown };
        result.cache = {
          exists: true,
          expires_at: cached.expires_at,
          created_at: cached.created_at,
          expired: new Date(cached.expires_at) < new Date(),
          hasProtestos: !!r?.protestos,
          hasProcessos: !!r?.processos,
          hasCCF: !!r?.ccf,
        };
      } else {
        result.cache = { exists: false };
      }
    }
  } catch (e) {
    result.cacheError = String(e);
  }

  // Also get our outbound IP
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipRes.json();
    result.ourIp = ipData.ip;
  } catch {}

  // 2. Test direct API call
  if (apiUrl && apiKey) {
    try {
      const testUrl = `${apiUrl}/simples/${apiKey}/${cnpj}`;
      const res = await fetch(testUrl, { headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; CapitalFinancas/1.0)" } });
      const text = await res.text();
      result.api = {
        status: res.status,
        ok: res.ok,
        bodyPreview: text.substring(0, 500),
        contentType: res.headers.get("content-type"),
      };
    } catch (e) {
      result.apiError = String(e);
    }
  } else {
    result.envError = { hasUrl: !!apiUrl, hasKey: !!apiKey };
  }

  return Response.json(result);
}
