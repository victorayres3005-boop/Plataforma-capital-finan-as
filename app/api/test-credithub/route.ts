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

  // 2. Test direct API call
  if (apiUrl && apiKey) {
    try {
      const testUrl = `${apiUrl}/simples/${apiKey}/${cnpj}`;
      const res = await fetch(testUrl, { headers: { "Content-Type": "application/json" } });
      const text = await res.text();
      result.api = {
        status: res.status,
        ok: res.ok,
        bodyPreview: text.substring(0, 300),
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
