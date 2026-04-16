/**
 * GET /api/admin/rating-drift?weeks=12
 * Compara rating_ia vs rating_comite ao longo do tempo (tabela rating_feedback).
 * Retorna série semanal com médias e contagens, + top 10 casos de maior divergência.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface FeedbackRow {
  id: string;
  cnpj: string;
  company_name: string | null;
  rating_ia: number | null;
  rating_comite: number | null;
  delta_rating: number | null;
  decisao_ia: string | null;
  decisao_comite: string | null;
  reviewed: boolean;
  reviewed_at: string | null;
  created_at: string;
}

interface WeekBucket {
  week: string;           // ex: "2026-W15"
  count: number;
  avg_ia: number;
  avg_comite: number;
  avg_delta: number;
  mudaram_decisao: number;
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const weeks = Math.max(1, Math.min(52, parseInt(req.nextUrl.searchParams.get("weeks") || "12")));
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supa
    .from("rating_feedback")
    .select("id, cnpj, company_name, rating_ia, rating_comite, delta_rating, decisao_ia, decisao_comite, reviewed, reviewed_at, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[rating-drift]", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (data ?? []) as FeedbackRow[];

  // Bucket semanal
  const weekMap = new Map<string, FeedbackRow[]>();
  for (const r of rows) {
    const w = isoWeek(new Date(r.created_at));
    if (!weekMap.has(w)) weekMap.set(w, []);
    weekMap.get(w)!.push(r);
  }

  const timeline: WeekBucket[] = Array.from(weekMap.entries())
    .map(([week, group]) => {
      const reviewed = group.filter(g => g.rating_comite != null);
      const avg_ia = reviewed.length > 0
        ? reviewed.reduce((a, g) => a + (g.rating_ia ?? 0), 0) / reviewed.length
        : 0;
      const avg_comite = reviewed.length > 0
        ? reviewed.reduce((a, g) => a + (g.rating_comite ?? 0), 0) / reviewed.length
        : 0;
      const avg_delta = reviewed.length > 0
        ? reviewed.reduce((a, g) => a + (g.delta_rating ?? 0), 0) / reviewed.length
        : 0;
      const mudaram_decisao = group.filter(g =>
        g.decisao_ia && g.decisao_comite && g.decisao_ia !== g.decisao_comite
      ).length;
      return {
        week,
        count: group.length,
        avg_ia,
        avg_comite,
        avg_delta,
        mudaram_decisao,
      };
    })
    .sort((a, b) => a.week.localeCompare(b.week));

  // Top 10 maior divergência (rating_comite disponível)
  const topDivergencias = rows
    .filter(r => r.delta_rating != null && Math.abs(r.delta_rating) > 0)
    .sort((a, b) => Math.abs(b.delta_rating!) - Math.abs(a.delta_rating!))
    .slice(0, 10);

  const totalRevisados = rows.filter(r => r.rating_comite != null).length;
  const totalMudaramDecisao = rows.filter(r => r.decisao_ia && r.decisao_comite && r.decisao_ia !== r.decisao_comite).length;
  const deltaMedio = totalRevisados > 0
    ? rows.filter(r => r.delta_rating != null).reduce((a, r) => a + r.delta_rating!, 0) / totalRevisados
    : 0;

  return NextResponse.json({
    windowWeeks: weeks,
    totalRows: rows.length,
    totalRevisados,
    totalMudaramDecisao,
    deltaMedio,
    timeline,
    topDivergencias,
  });
}
