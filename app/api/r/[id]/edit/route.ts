import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Limites: protegem contra abuso (HTML estourar) e contra texto colado por engano.
const MAX_ITEMS_PER_LIST = 12;
const MAX_CHARS_PER_ITEM = 600;
const MAX_AUTOR_LEN = 40;

type EditPayload = {
  fortes?: unknown;
  fracos?: unknown;
  alertas?: unknown;
  autor?: unknown;
  token?: unknown;
};

function sanitizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length > 0)
    .map(s => (s.length > MAX_CHARS_PER_ITEM ? s.slice(0, MAX_CHARS_PER_ITEM) : s))
    .slice(0, MAX_ITEMS_PER_LIST);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id || !/^[a-z0-9]{8,16}$/.test(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  let body: EditPayload;
  try {
    body = (await req.json()) as EditPayload;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token || !/^[a-z0-9]{8,32}$/.test(token)) {
    return Response.json({ error: "Token inválido" }, { status: 401 });
  }

  const fortes  = sanitizeList(body.fortes);
  const fracos  = sanitizeList(body.fracos);
  const alertas = sanitizeList(body.alertas);
  const autorRaw = typeof body.autor === "string" ? body.autor.trim() : "";
  const autor = autorRaw.slice(0, MAX_AUTOR_LEN) || null;

  const supabase = createClient(url, key);

  const { data: row, error: selErr } = await supabase
    .from("shared_reports")
    .select("edit_token, expires_at")
    .eq("id", id)
    .single();

  if (selErr || !row) {
    return Response.json({ error: "Relatório não encontrado" }, { status: 404 });
  }
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return Response.json({ error: "Link expirado" }, { status: 410 });
  }
  if (!row.edit_token || row.edit_token !== token) {
    return Response.json({ error: "Token incorreto" }, { status: 403 });
  }

  const { error: updErr } = await supabase
    .from("shared_reports")
    .update({
      pontos_fortes: fortes,
      pontos_fracos: fracos,
      alertas,
      updated_at: new Date().toISOString(),
      updated_by: autor,
    })
    .eq("id", id);

  if (updErr) {
    const isColumnMissing = updErr.code === "42703";
    const userMsg = isColumnMissing
      ? "Colunas de edição ausentes — execute migração 16_shared_reports_editable.sql"
      : updErr.message;
    console.error("[r/edit] supabase update error:", updErr.message, updErr.code);
    return Response.json({ error: userMsg }, { status: 500 });
  }

  return Response.json({ ok: true, fortes, fracos, alertas, autor });
}
