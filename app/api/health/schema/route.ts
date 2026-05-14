import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// Healthcheck preventivo: testa coluna a coluna se schema do Supabase está
// alinhado com o que o código espera. Origem: 2026-05-12, memória mentiu
// que migration 17b tinha rodado (coluna 'percepcao' ausente) e o sintoma
// só apareceu horas depois quando Victor tentou editar.
//
// Colunas críticas por feature:
// - Migration 16: pontos_fortes, pontos_fracos, alertas, edit_token, updated_at, updated_by
// - Migration 17a: pleito_comite, pleito_comite_updated_at
// - Migration 17b: percepcao (foi a que faltou!)
// - Migration 18: percepcao_dre, percepcao_faturamento, percepcao_balanco

const CRITICAL_COLUMNS: Array<{ table: string; column: string; migration: string; feature: string }> = [
  { table: "shared_reports", column: "pontos_fortes",         migration: "16",  feature: "Edição inline — Pontos Fortes" },
  { table: "shared_reports", column: "pontos_fracos",         migration: "16",  feature: "Edição inline — Pontos Fracos" },
  { table: "shared_reports", column: "alertas",               migration: "16",  feature: "Edição inline — Alertas" },
  { table: "shared_reports", column: "edit_token",            migration: "16",  feature: "Auth do modo edição" },
  { table: "shared_reports", column: "updated_at",            migration: "16",  feature: "Timestamp último edit" },
  { table: "shared_reports", column: "updated_by",            migration: "16",  feature: "Autor da última edição" },
  { table: "shared_reports", column: "pleito_comite",         migration: "17a", feature: "Pleito do Comitê (quadro editável)" },
  { table: "shared_reports", column: "percepcao",             migration: "17b", feature: "Percepção do Analista (geral)" },
  { table: "shared_reports", column: "percepcao_dre",         migration: "18",  feature: "Percepção DRE" },
  { table: "shared_reports", column: "percepcao_faturamento", migration: "18",  feature: "Percepção Faturamento" },
  { table: "shared_reports", column: "percepcao_balanco",     migration: "18",  feature: "Percepção Balanço" },
];

type ColumnStatus = {
  table: string;
  column: string;
  migration: string;
  feature: string;
  status: "ok" | "missing" | "error";
  error?: string;
};

export async function GET() {
  noStore();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ healthy: false, error: "Supabase não configurado" }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const results: ColumnStatus[] = [];

  // Testa coluna a coluna com LIMIT 0 (não retorna dados, só valida o SELECT).
  // Não precisamos de UM relatório existir — basta o schema responder.
  for (const col of CRITICAL_COLUMNS) {
    const { error } = await supabase
      .from(col.table)
      .select(col.column)
      .limit(0);

    if (!error) {
      results.push({ ...col, status: "ok" });
    } else if (error.code === "42703" || error.code === "PGRST204" || /could not find the .* column/i.test(error.message) || /column .* does not exist/i.test(error.message)) {
      results.push({ ...col, status: "missing", error: error.message });
    } else {
      results.push({ ...col, status: "error", error: error.message });
    }
  }

  const missing = results.filter(r => r.status === "missing");
  const errored = results.filter(r => r.status === "error");
  const healthy = missing.length === 0 && errored.length === 0;

  return NextResponse.json({
    healthy,
    summary: {
      ok: results.filter(r => r.status === "ok").length,
      missing: missing.length,
      errored: errored.length,
      total: results.length,
    },
    missing: missing.map(m => ({ migration: m.migration, column: `${m.table}.${m.column}`, feature: m.feature })),
    errored: errored.map(e => ({ column: `${e.table}.${e.column}`, error: e.error })),
    results,
    checked_at: new Date().toISOString(),
  });
}
