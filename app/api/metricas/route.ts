export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  // Auth — endpoint expõe collections de todos os usuários (dados de negócio)
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { searchParams } = new URL(req.url);
  const dias = parseInt(searchParams.get("dias") || "30");
  const corte = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();

  const { data: collections, error } = await supabase
    .from("document_collections")
    .select("id, user_id, created_at, status, decisao, rating, company_name, cnpj, fmm_12m")
    .gte("created_at", corte)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Buscar nomes dos usuários via admin API
  const userIds = Array.from(new Set((collections || []).map(c => c.user_id).filter(Boolean)));
  const userMap: Record<string, string> = {};

  if (userIds.length > 0) {
    try {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 200 });
      (users || []).forEach(u => {
        userMap[u.id] = u.user_metadata?.full_name || u.email?.split("@")[0] || u.email || u.id;
      });
    } catch {
      // fallback: usar user_id como nome
    }
  }

  const cols = (collections || []).map(c => ({
    ...c,
    analyst_name: userMap[c.user_id] || c.user_id?.slice(0, 8) || "—",
  }));

  // Métricas por decisão
  const finished = cols.filter(c => c.status === "finished");
  const porDecisao = {
    aprovado:        finished.filter(c => c.decisao === "APROVADO").length,
    condicional:     finished.filter(c => c.decisao === "APROVACAO_CONDICIONAL").length,
    pendente:        finished.filter(c => c.decisao === "PENDENTE").length,
    reprovado:       finished.filter(c => c.decisao === "REPROVADO").length,
    questionamento:  finished.filter(c => c.decisao === "QUESTIONAMENTO").length,
    em_andamento:    cols.filter(c => c.status === "in_progress").length,
  };

  // Ranking de analistas
  const analystMap: Record<string, { name: string; total: number; aprovado: number; reprovado: number; pendente: number; questionamento: number }> = {};
  cols.forEach(c => {
    const k = c.user_id || "unknown";
    if (!analystMap[k]) analystMap[k] = { name: c.analyst_name, total: 0, aprovado: 0, reprovado: 0, pendente: 0, questionamento: 0 };
    analystMap[k].total++;
    if (c.decisao === "APROVADO" || c.decisao === "APROVACAO_CONDICIONAL") analystMap[k].aprovado++;
    else if (c.decisao === "REPROVADO") analystMap[k].reprovado++;
    else if (c.decisao === "PENDENTE") analystMap[k].pendente++;
    else if (c.decisao === "QUESTIONAMENTO") analystMap[k].questionamento++;
  });

  const ranking = Object.values(analystMap).sort((a, b) => b.total - a.total);

  // Rating médio
  const comRating = finished.filter(c => c.rating && c.rating > 0);
  const ratingMedio = comRating.length > 0
    ? comRating.reduce((s, c) => s + (c.rating || 0), 0) / comRating.length
    : 0;

  return Response.json({ porDecisao, ranking, ratingMedio, total: cols.length });
}
