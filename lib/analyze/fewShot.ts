/**
 * Few-shot examples para a rota /api/analyze.
 *
 * Busca exemplos similares no Supabase (vetorial via embeddings ou
 * por divergência IA-comitê) e formata em bloco textual injetado no
 * prompt do Gemini para calibrar o rating.
 *
 * Importado por `app/api/analyze/route.ts`.
 */

import { createClient } from "@supabase/supabase-js";
import { generateEmbedding, buildEmbeddingText } from "@/lib/embeddings";

type FewShotRow = {
  company_name: string;
  rating_ia: number;
  rating_comite: number;
  delta_rating: number;
  decisao_ia: string;
  decisao_comite: string;
  justificativa_comite: string | null;
  resumo_ia: string | null;
};

export function formatFewShotBlock(rows: FewShotRow[], mode: "vetorial" | "divergencia"): string {
  if (rows.length === 0) return "";

  const header = mode === "vetorial"
    ? "CASOS SIMILARES DO COMITÊ (empresas com perfil parecido — use como referência de rating)"
    : "CALIBRAÇÃO DO COMITÊ (casos com maior divergência IA vs comitê)";

  const exemplos = rows.map((r, i) => {
    const correcao = r.delta_rating > 0
      ? `comitê elevou ${r.rating_ia} → ${r.rating_comite} (+${Number(r.delta_rating).toFixed(1)})`
      : r.delta_rating < 0
      ? `comitê reduziu ${r.rating_ia} → ${r.rating_comite} (${Number(r.delta_rating).toFixed(1)})`
      : `comitê confirmou ${r.rating_comite} (sem correção)`;

    const decisaoMudou = r.decisao_ia !== r.decisao_comite
      ? ` | Decisão: IA=${r.decisao_ia} → Comitê=${r.decisao_comite}`
      : "";

    const justificativa = r.justificativa_comite
      ? `\n   Motivo: "${r.justificativa_comite}"`
      : "";

    return `Caso ${i + 1} — ${r.company_name || "Empresa"}: ${correcao}${decisaoMudou}${justificativa}`;
  }).join("\n\n");

  return `\n\n--- ${header} ---\n${exemplos}\n--- FIM ---\n`;
}

export async function getFewShotExamples(userId: string, currentSnapshot?: Record<string, unknown>): Promise<string> {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "";

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);

  try {
    // ── Fase 2: busca vetorial por similaridade ──────────────────────────────
    // Tenta gerar embedding da empresa atual e buscar casos similares
    if (currentSnapshot) {
      try {
        const text = buildEmbeddingText(currentSnapshot);
        if (text.length >= 30) {
          const vector = await generateEmbedding(text);
          const vectorStr = `[${vector.join(",")}]`;

          // Busca os 5 casos mais similares com embedding populado
          const { data: similar } = await supabase.rpc("match_rating_feedback", {
            p_user_id:       userId,
            p_embedding:     vectorStr,
            p_match_count:   5,
            p_min_similarity: 0.70,
          });

          if (similar && similar.length >= 2) {
            console.log(`[analyze] Fase 2 (vetorial): ${similar.length} casos similares encontrados`);
            return formatFewShotBlock(similar as FewShotRow[], "vetorial");
          }
        }
      } catch (embErr) {
        console.warn("[analyze] Embedding falhou, usando Fase 1:", embErr instanceof Error ? embErr.message : embErr);
      }
    }

    // ── Fase 1 fallback: casos com maior divergência ─────────────────────────
    const { data, error } = await supabase
      .from("vw_few_shot_candidates")
      .select("company_name,rating_ia,rating_comite,delta_rating,decisao_ia,decisao_comite,justificativa_comite,resumo_ia")
      .eq("user_id", userId)
      .limit(5);

    if (error || !data || data.length === 0) return "";
    console.log(`[analyze] Fase 1 (divergência): ${data.length} exemplos injetados`);
    return formatFewShotBlock(data as FewShotRow[], "divergencia");

  } catch {
    return "";
  }
}
