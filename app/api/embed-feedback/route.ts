// Job: gera embeddings para rating_feedback sem vetor (Fase 2)
// Chamada manual: POST /api/embed-feedback  (requer auth)
// Retorna: { processed, skipped, errors }

export const runtime = "nodejs";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { generateEmbedding, buildEmbeddingText } from "@/lib/embeddings";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST() {
  // Verifica autenticação
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });

  // Cliente admin para bypassar RLS nas operações de escrita
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);

  // Busca registros do usuário sem embedding (máx 20 por execução)
  const { data: rows, error } = await supabase
    .from("rating_feedback")
    .select("id, ai_analysis_snapshot, company_name, cnpj, rating_ia, decisao_ia")
    .eq("user_id", user.id)
    .eq("reviewed", true)
    .is("embedding", null)
    .limit(20);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) return Response.json({ processed: 0, skipped: 0, errors: 0, message: "Nenhum registro pendente" });

  let processed = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    try {
      const snapshot = (row.ai_analysis_snapshot as Record<string, unknown>) ?? {};
      const text = buildEmbeddingText(snapshot);

      if (!text.trim() || text.length < 30) { skipped++; continue; }

      const vector = await generateEmbedding(text);

      // Formata como string pgvector: [0.1, 0.2, ...]
      const { error: updateError } = await supabase
        .from("rating_feedback")
        .update({ embedding: `[${vector.join(",")}]` })
        .eq("id", row.id);

      if (updateError) { errors++; console.error(`[embed-feedback] Update error ${row.id}:`, updateError.message); }
      else processed++;

      // Pausa entre requests para não esgotar a API
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errors++;
      console.error(`[embed-feedback] Erro no registro ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return Response.json({ processed, skipped, errors, total: rows.length });
}
