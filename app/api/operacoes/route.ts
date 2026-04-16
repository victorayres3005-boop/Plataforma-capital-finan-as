/**
 * CRUD de operações fechadas (tabela `operacoes`).
 *
 * - GET  /api/operacoes?cnpj=XX          → lista operações do usuário pra aquele CNPJ
 * - POST /api/operacoes                  → cria nova operação
 * - PATCH /api/operacoes?id=XX           → atualiza status/observações
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface OperacaoInput {
  collection_id?: string | null;
  cnpj: string;
  company_name?: string;
  data_operacao: string;        // YYYY-MM-DD
  modalidade?: "convencional" | "comissaria" | "hibrida" | "outra";
  valor_bruto?: number;
  valor_liquido?: number;
  taxa?: number;
  prazo_dias?: number;
  qtd_titulos?: number;
  sacados_top5?: Array<{ cnpj?: string; nome: string; valor?: number }>;
  status?: "ativa" | "liquidada" | "inadimplente" | "recomprada";
  observacoes?: string;
}

export async function GET(req: NextRequest) {
  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cnpjRaw = req.nextUrl.searchParams.get("cnpj");
  const cnpj = cnpjRaw ? cnpjRaw.replace(/\D/g, "") : null;
  const limit = Math.max(1, Math.min(500, parseInt(req.nextUrl.searchParams.get("limit") || "100")));

  let q = supa.from("operacoes")
    .select("*")
    .eq("user_id", user.id)
    .order("data_operacao", { ascending: false })
    .limit(limit);

  if (cnpj) q = q.eq("cnpj", cnpj);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ operacoes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: OperacaoInput;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  if (!body.cnpj || !body.data_operacao) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const cnpj = body.cnpj.replace(/\D/g, "");

  const insertRow = {
    user_id: user.id,
    collection_id: body.collection_id ?? null,
    cnpj,
    company_name: body.company_name ?? null,
    data_operacao: body.data_operacao,
    modalidade: body.modalidade ?? null,
    valor_bruto: body.valor_bruto ?? null,
    valor_liquido: body.valor_liquido ?? null,
    taxa: body.taxa ?? null,
    prazo_dias: body.prazo_dias ?? null,
    qtd_titulos: body.qtd_titulos ?? null,
    sacados_top5: body.sacados_top5 ?? null,
    status: body.status ?? "ativa",
    observacoes: body.observacoes ?? null,
  };

  const { data, error } = await supa
    .from("operacoes")
    .insert(insertRow)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ operacao: data });
}

export async function PATCH(req: NextRequest) {
  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let body: Partial<OperacaoInput>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (body.status) update.status = body.status;
  if (body.observacoes !== undefined) update.observacoes = body.observacoes;
  if (body.valor_liquido !== undefined) update.valor_liquido = body.valor_liquido;
  update.updated_at = new Date().toISOString();

  const { data, error } = await supa
    .from("operacoes")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ operacao: data });
}

export async function DELETE(req: NextRequest) {
  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { error } = await supa
    .from("operacoes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
