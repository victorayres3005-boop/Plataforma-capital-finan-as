import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Whitelist dos 15 campos do Pleito (espelho do template.ts:1003-1019).
// Qualquer chave fora dessa lista é descartada antes do upsert.
const ALLOWED_KEYS = [
  "limiteTotal",
  "tranche",
  "limiteConvencional",
  "limiteComissaria",
  "limitePorSacado",
  "limitePrincipaisSacados",
  "taxaConvencional",
  "taxaComissaria",
  "valorCobrancaBoleto",
  "prazoMaximoOp",
  "cobrancaTAC",
  "prazoRecompraCedente",
  "prazoEnvioCartorio",
  "trancheChecagem",
  "prazoTranche",
] as const;

type AllowedKey = typeof ALLOWED_KEYS[number];

const MAX_CHARS_PER_VALUE = 80;

function sanitizeValues(raw: unknown): Record<AllowedKey, string> {
  const out: Partial<Record<AllowedKey, string>> = {};
  if (!raw || typeof raw !== "object") return out as Record<AllowedKey, string>;
  const obj = raw as Record<string, unknown>;
  for (const k of ALLOWED_KEYS) {
    const v = obj[k];
    if (typeof v !== "string") continue;
    const cleaned = v.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_VALUE);
    if (cleaned) out[k] = cleaned;
  }
  return out as Record<AllowedKey, string>;
}

export async function PATCH(
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

  let body: { values?: unknown };
  try {
    body = (await req.json()) as { values?: unknown };
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const values = sanitizeValues(body.values);

  const supabase = createClient(url, key);

  // maybeSingle: distingue "não existe" (404) de erro técnico (500)
  // (auditoria 2026-05-12 #8).
  const { data: row, error: selErr } = await supabase
    .from("shared_reports")
    .select("expires_at")
    .eq("id", id)
    .maybeSingle();

  if (selErr) return Response.json({ error: selErr.message }, { status: 500 });
  if (!row) return Response.json({ error: "Relatório não encontrado" }, { status: 404 });
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return Response.json({ error: "Link expirado" }, { status: 410 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("shared_reports")
    .update({
      pleito_comite: values,
      pleito_comite_updated_at: now,
    })
    .eq("id", id);

  if (updErr) {
    const isColumnMissing = updErr.code === "42703";
    const userMsg = isColumnMissing
      ? "Coluna pleito_comite ausente — execute migração 17_shared_reports_pleito_comite.sql"
      : updErr.message;
    console.error("[r/pleito-comite] supabase update error:", updErr.message, updErr.code);
    return Response.json({ error: userMsg }, { status: 500 });
  }

  return Response.json({ ok: true, values, updatedAt: now });
}
