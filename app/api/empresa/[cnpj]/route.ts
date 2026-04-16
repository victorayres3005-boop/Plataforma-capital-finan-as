/**
 * GET /api/empresa/[cnpj]
 * Retorna histórico consolidado de uma empresa pelo CNPJ.
 * Combina company_snapshots (evolução) + document_collections (análises) + operacoes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { cnpj: string } }) {
  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cnpjRaw = params.cnpj;
  const cnpj = cnpjRaw.replace(/\D/g, "");
  if (!cnpj) return NextResponse.json({ error: "invalid_cnpj" }, { status: 400 });

  // 1) Snapshots (série temporal)
  const { data: snapshots, error: snapErr } = await supa
    .from("company_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .eq("cnpj", cnpj)
    .order("snapshot_date", { ascending: true });

  if (snapErr) {
    console.error("[api/empresa] snapshots:", snapErr);
  }

  // 2) Coletas (análises completas) — últimas 20
  const { data: collections, error: colErr } = await supa
    .from("document_collections")
    .select("id, cnpj, company_name, rating, rating_confianca, decisao, fmm_12m, nivel_analise, analyzed_at, status, finished_at, created_at, alertas_alta_count, alertas_mod_count")
    .eq("user_id", user.id)
    .eq("cnpj", cnpj)
    .order("created_at", { ascending: false })
    .limit(20);

  if (colErr) {
    console.error("[api/empresa] collections:", colErr);
  }

  // 3) Operações do cedente
  const { data: operacoes, error: opErr } = await supa
    .from("operacoes")
    .select("*")
    .eq("user_id", user.id)
    .eq("cnpj", cnpj)
    .order("data_operacao", { ascending: false })
    .limit(50);

  if (opErr) {
    console.warn("[api/empresa] operacoes indisponível:", opErr.message);
  }

  const lastCollection = collections?.[0];

  return NextResponse.json({
    cnpj,
    company_name: lastCollection?.company_name ?? snapshots?.[snapshots.length - 1]?.company_name ?? null,
    summary: {
      total_analises: collections?.length ?? 0,
      total_operacoes: operacoes?.length ?? 0,
      rating_atual: lastCollection?.rating ?? null,
      decisao_atual: lastCollection?.decisao ?? null,
      ultima_analise: lastCollection?.analyzed_at ?? lastCollection?.created_at ?? null,
    },
    snapshots: snapshots ?? [],
    collections: collections ?? [],
    operacoes: operacoes ?? [],
  });
}
