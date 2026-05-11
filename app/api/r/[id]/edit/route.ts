import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Limites: protegem contra abuso (HTML estourar) e contra texto colado por engano.
const MAX_ITEMS_PER_LIST = 12;
const MAX_CHARS_PER_ITEM = 600;
const MAX_AUTOR_LEN = 40;
const MAX_PERCEPCAO_LEN = 4000; // ~600 palavras — espaço suficiente p/ parecer livre

type EditPayload = {
  fortes?: unknown;
  fracos?: unknown;
  alertas?: unknown;
  percepcao?: unknown;
  /** Percepções por seção do relatório (DRE, Faturamento, Balanço). */
  percepcaoDre?: unknown;
  percepcaoFaturamento?: unknown;
  percepcaoBalanco?: unknown;
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

// Percepção é texto livre (não lista). Preserva quebras de linha, comprime
// espaços horizontais e limita comprimento.
function sanitizeText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t) return null;
  return t.length > MAX_PERCEPCAO_LEN ? t.slice(0, MAX_PERCEPCAO_LEN) : t;
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
  const percepcao = sanitizeText(body.percepcao);
  const percepcaoDre = sanitizeText(body.percepcaoDre);
  const percepcaoFaturamento = sanitizeText(body.percepcaoFaturamento);
  const percepcaoBalanco = sanitizeText(body.percepcaoBalanco);
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

  // FALLBACK GRACIOSO 2026-05-11: se PostgREST não recarregou o schema cache
  // após uma migration recente (PGRST204 "Could not find the 'X' column"),
  // detecta qual coluna está faltando, remove do payload e retenta. Até 5
  // tentativas — cada uma resolve uma coluna. Evita que uma única coluna
  // pendente bloqueie todo o save.
  const fullPayload: Record<string, unknown> = {
    pontos_fortes: fortes,
    pontos_fracos: fracos,
    alertas,
    percepcao,
    percepcao_dre: percepcaoDre,
    percepcao_faturamento: percepcaoFaturamento,
    percepcao_balanco: percepcaoBalanco,
    updated_at: new Date().toISOString(),
    updated_by: autor,
  };
  const skipped: string[] = [];
  let updErr: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase
      .from("shared_reports")
      .update(fullPayload)
      .eq("id", id);
    updErr = error;
    if (!error) break;
    // PGRST204 trazem mensagem "Could not find the 'X' column of 'shared_reports' in the schema cache"
    // 42703 trazem "column \"X\" of relation ... does not exist"
    const msg = error.message || "";
    const m = msg.match(/find the '([^']+)' column/i) || msg.match(/column "([^"]+)"/i);
    const col = m?.[1];
    if (!col || !(col in fullPayload)) break;
    delete fullPayload[col];
    skipped.push(col);
    console.warn(`[r/edit] coluna ${col} indisponível no schema cache — pulando e retentando`);
  }

  if (updErr) {
    console.error("[r/edit] supabase update error:", updErr.message, updErr.code);
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    fortes, fracos, alertas, percepcao,
    percepcaoDre, percepcaoFaturamento, percepcaoBalanco,
    autor,
  });
}
