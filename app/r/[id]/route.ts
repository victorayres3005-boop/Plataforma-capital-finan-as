import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Hidrata os inputs do Pleito Comitê (data-pc-key="...") com valores salvos.
// Edição é livre (sem token) — segue decisão de produto.
function injectPleitoComite(html: string, raw: unknown): string {
  if (!raw || typeof raw !== "object") return html;
  const values = raw as Record<string, unknown>;
  const hasAny = Object.values(values).some(v => typeof v === "string" && v.trim());
  if (!hasAny) return html;
  return html.replace(
    /(data-pc-key=")([a-zA-Z]+)(" value=")("\s)/g,
    (match, p1, key, p3, p4) => {
      const v = values[key];
      if (typeof v !== "string" || !v.trim()) return match;
      return `${p1}${key}${p3}${esc(v)}${p4}`;
    }
  );
}

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
    .select("html, expires_at, company, pleito_comite")
    .eq("id", id)
    .single();

  if (error || !data) {
    return new Response(notFoundPage(id), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return new Response(expiredPage(), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Pleito Comitê: edição livre; injeta valores salvos sempre que houver.
  const html = injectPleitoComite(data.html as string, data.pleito_comite);

  // Pleito Comitê é editável sem token: qualquer leitura precisa refletir o último save.
  // Sem pleito preenchido, mantém cache normal pra não onerar o banco.
  const hasPleitoComite = !!data.pleito_comite && Object.values(data.pleito_comite as Record<string, unknown>).some(v => typeof v === "string" && v.trim());

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": hasPleitoComite
        ? "no-store, no-cache, must-revalidate"
        : "public, max-age=3600, s-maxage=3600",
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
