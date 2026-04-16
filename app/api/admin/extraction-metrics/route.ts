/**
 * GET /api/admin/extraction-metrics?days=30
 * Agrega métricas da tabela extraction_metrics para o dashboard /admin/extraction.
 * Retorna totais por doc_type: count, avg_filled, avg_duration, warnings_ratio.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface MetricRow {
  doc_type: string;
  filled_fields: number | null;
  duration_ms: number | null;
  input_mode: string | null;
  zod_warnings: unknown;
  ai_powered: boolean | null;
  cached: boolean | null;
  created_at: string;
}

interface AggregateStats {
  docType: string;
  total: number;
  avgFilledFields: number;
  avgDurationMs: number;
  warningsRatio: number;     // % de extrações com ao menos 1 warning
  cachedRatio: number;       // % que veio do cache
  aiRatio: number;           // % que usou IA
  byInputMode: Record<string, number>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const days = Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "30")));

  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Janela temporal
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supa
    .from("extraction_metrics")
    .select("doc_type, filled_fields, duration_ms, input_mode, zod_warnings, ai_powered, cached, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("[admin-metrics] supabase error:", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (data ?? []) as MetricRow[];

  // Agregação por doc_type
  const byType: Record<string, MetricRow[]> = {};
  for (const r of rows) {
    const k = r.doc_type || "unknown";
    if (!byType[k]) byType[k] = [];
    byType[k].push(r);
  }

  const stats: AggregateStats[] = Object.entries(byType).map(([docType, group]) => {
    const total = group.length;
    const filledSum = group.reduce((a, r) => a + (r.filled_fields ?? 0), 0);
    const durSum = group.reduce((a, r) => a + (r.duration_ms ?? 0), 0);
    const warningsCount = group.filter(r => {
      const w = r.zod_warnings;
      return Array.isArray(w) && w.length > 0;
    }).length;
    const cachedCount = group.filter(r => r.cached === true).length;
    const aiCount = group.filter(r => r.ai_powered === true).length;
    const byInputMode: Record<string, number> = {};
    group.forEach(r => {
      const m = r.input_mode ?? "unknown";
      byInputMode[m] = (byInputMode[m] ?? 0) + 1;
    });
    return {
      docType,
      total,
      avgFilledFields: total > 0 ? filledSum / total : 0,
      avgDurationMs: total > 0 ? durSum / total : 0,
      warningsRatio: total > 0 ? warningsCount / total : 0,
      cachedRatio: total > 0 ? cachedCount / total : 0,
      aiRatio: total > 0 ? aiCount / total : 0,
      byInputMode,
    };
  }).sort((a, b) => b.total - a.total);

  // Série temporal diária (total extrações por dia)
  const dayBuckets: Record<string, number> = {};
  for (const r of rows) {
    const d = (r.created_at || "").substring(0, 10);
    if (!d) continue;
    dayBuckets[d] = (dayBuckets[d] ?? 0) + 1;
  }
  const timeline = Object.entries(dayBuckets)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    windowDays: days,
    totalRows: rows.length,
    stats,
    timeline,
  });
}
