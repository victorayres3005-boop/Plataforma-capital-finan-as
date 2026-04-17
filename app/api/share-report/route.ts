import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ error: "Supabase não configurado" }, { status: 500 });
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

  // ID de 10 chars alfanuméricos — curto o suficiente para o link
  const id = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("");

  const supabase = createClient(url, key);
  const { error } = await supabase.from("shared_reports").insert({
    id,
    html,
    cnpj: cnpj ?? null,
    company: company ?? null,
  });

  if (error) {
    console.error("[share-report] supabase insert error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return Response.json({ id, url: `${baseUrl}/r/${id}` });
}
