/**
 * POST /api/collections/[id]/reopen
 *
 * Reabre uma coleta finalizada para edição. Aceita dois casos:
 *
 *  1) Dono retomando a própria coleta — UPDATE via cliente autenticado
 *     (passa pela policy dc_update_own).
 *  2) Colega retomando coleta de outro analista (Fase 1 do histórico
 *     compartilhado) — UPDATE via service role, registrando reopened_by /
 *     reopened_at / last_reopened_at e gravando audit_log com a ação
 *     `reopen_by_other`.
 *
 * Em ambos os casos retorna `{ ok: true, redirect: '/?resume=<id>' }` para
 * o cliente fazer o window.location na sequência.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params?.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const supa = createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // SELECT passa pela policy dc_select_team — qualquer authenticated lê tudo.
  const { data: col, error: selErr } = await supa
    .from("document_collections")
    .select("id, user_id, status, created_by_name")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!col) {
    return NextResponse.json({ error: "coleta não encontrada" }, { status: 404 });
  }

  const isOwner = col.user_id === user.id;
  const now = new Date().toISOString();

  if (isOwner) {
    // Caminho A — dono: passa pela RLS normal (dc_update_own).
    const { error: updErr } = await supa
      .from("document_collections")
      .update({
        status: "in_progress",
        finished_at: null,
        last_reopened_at: now,
      })
      .eq("id", id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      redirect: `/?resume=${id}`,
      mode: "owner",
    });
  }

  // Caminho B — colega: precisa de service role para passar pela RLS
  // (dc_update_own bloqueia auth.uid() != user_id). Registra quem reabriu.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Service role não configurado para retomada cruzada" },
      { status: 500 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: adminUpdErr } = await admin
    .from("document_collections")
    .update({
      status: "in_progress",
      finished_at: null,
      reopened_by: user.id,
      reopened_at: now,
      last_reopened_at: now,
    })
    .eq("id", id);

  if (adminUpdErr) {
    return NextResponse.json({ error: adminUpdErr.message }, { status: 500 });
  }

  // Audit log — tabela só aceita INSERT por SECURITY DEFINER ou service role
  // (migration 12). Falha aqui não deve abortar a retomada, só logar.
  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: "document_collection",
      entity_id: id,
      action: "reopen_by_other",
      changed_fields: ["status", "reopened_by", "reopened_at"],
      before_values: { status: col.status, user_id: col.user_id },
      after_values: { status: "in_progress", reopened_by: user.id, reopened_at: now },
      reason: `Coleta de ${col.created_by_name || "outro analista"} reaberta por usuário ${user.id}`,
    });
  } catch (err) {
    console.error("[reopen] falha ao gravar audit_log:", err);
  }

  return NextResponse.json({
    ok: true,
    redirect: `/?resume=${id}`,
    mode: "team",
    original_owner_id: col.user_id,
    original_owner_name: col.created_by_name,
  });
}
