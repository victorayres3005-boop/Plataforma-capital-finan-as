import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id || !/^[a-z0-9]{8,16}$/.test(id)) {
    return new Response("Link inválido.", { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new Response("Configuração de banco indisponível.", { status: 500 });
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("shared_reports")
    .select("html, expires_at, company")
    .eq("id", id)
    .single();

  if (error || !data) {
    return new Response(notFoundPage(id), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Verifica expiração
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return new Response(expiredPage(), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(data.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function notFoundPage(id: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório não encontrado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155}
.box{text-align:center;padding:40px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;max-width:420px}
h1{font-size:20px;margin-bottom:8px;color:#1e293b}p{font-size:14px;color:#64748b;margin-bottom:4px}code{font-size:12px;color:#94a3b8}</style>
</head><body><div class="box"><h1>Relatório não encontrado</h1>
<p>O link que você acessou não existe ou foi removido.</p>
<code>${id}</code></div></body></html>`;
}

function expiredPage(): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link expirado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155}
.box{text-align:center;padding:40px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;max-width:420px}
h1{font-size:20px;margin-bottom:8px;color:#1e293b}p{font-size:14px;color:#64748b}</style>
</head><body><div class="box"><h1>Link expirado</h1>
<p>Este relatório não está mais disponível. Solicite um novo link à equipe que o enviou.</p></div></body></html>`;
}
