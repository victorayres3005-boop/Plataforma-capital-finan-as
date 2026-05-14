import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB — limita armazenamento e XSS abuse

export async function POST(req: Request) {
  // Auth — qualquer um podia subir HTML arbitrário (XSS armazenado + spam)
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // SERVICE_ROLE-only: ANON_KEY é pública (exposta no bundle) e permitiria
  // dump da tabela shared_reports via curl. Quando RLS for habilitado,
  // ANON será bloqueado de qualquer forma — exigir SERVICE_ROLE aqui já fail-closed.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY ausente — necessário para acesso a shared_reports" }, { status: 500 });
  }

  let html: string;
  let cnpj: string | undefined;
  let company: string | undefined;
  try {
    const body = await req.json() as { html: string; cnpj?: string; company?: string };
    html = body.html;
    cnpj = body.cnpj;
    company = body.company;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!html || typeof html !== "string") {
    return Response.json({ error: "html obrigatório" }, { status: 400 });
  }
  if (html.length > MAX_HTML_BYTES) {
    return Response.json({ error: `HTML excede ${MAX_HTML_BYTES} bytes` }, { status: 413 });
  }

  // ID de 10 chars alfanuméricos — curto o suficiente para o link
  const id = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("");

  // edit_token de 16 chars — habilita /r/[id]?k=<token> em modo edição
  const edit_token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("");

  const supabase = createClient(url, key);

  // FALLBACK GRACIOSO 2026-05-11: tenta INSERT com edit_token; se a coluna
  // não existe (migration 16 pendente), retenta sem — gera só o link público
  // (leitura), edição inline fica indisponível até a migration rodar.
  let editAvailable = true;
  let { error } = await supabase.from("shared_reports").insert({
    id,
    html,
    cnpj: cnpj ?? null,
    company: company ?? null,
    edit_token,
  });

  // Detecta "coluna ausente" em qualquer formato que o Supabase devolve:
  // - 42703: erro Postgres direto
  // - PGRST204: PostgREST schema cache miss (ocorre via supabase-js client)
  // - Mensagens: "Could not find the 'X' column" ou "column X does not exist"
  const isColMissing = (e: typeof error): boolean => {
    if (!e) return false;
    if (e.code === "42703" || e.code === "PGRST204") return true;
    const msg = e.message ?? "";
    return /could not find the .* column/i.test(msg) || /column .* does not exist/i.test(msg);
  };

  if (isColMissing(error)) {
    console.warn("[share-report] migration 16 pendente — fallback sem edit_token");
    editAvailable = false;
    const retry = await supabase.from("shared_reports").insert({
      id,
      html,
      cnpj: cnpj ?? null,
      company: company ?? null,
    });
    error = retry.error;
  }

  if (error) {
    const isTableMissing = error.message?.includes("does not exist") || error.code === "42P01";
    const isColumnMissing = error.code === "42703";
    const userMsg = isTableMissing
      ? "Tabela 'shared_reports' não existe — execute a migração SQL no Supabase (supabase/migrations/15_shared_reports.sql)"
      : isColumnMissing
      ? "Colunas de edição inline ausentes — execute a migração SQL 16_shared_reports_editable.sql no Supabase"
      : error.message;
    console.error("[share-report] supabase insert error:", error.message, error.code);
    return Response.json({ error: userMsg }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return Response.json({
    id,
    url: `${baseUrl}/r/${id}`,
    // editUrl/editToken só aparecem quando a coluna edit_token existe no banco.
    // Sem migration 16, frontend recebe undefined nos dois — o card âmbar
    // de edição simplesmente não aparece.
    ...(editAvailable ? {
      editUrl: `${baseUrl}/r/${id}?k=${edit_token}`,
      editToken: edit_token,
    } : {
      editDisabled: true,
      editDisabledReason: "Edição inline indisponível — rodar migration 16 no Supabase.",
    }),
  });
}
