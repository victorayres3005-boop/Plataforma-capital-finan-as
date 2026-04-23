export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(request: Request) {
  // Verificar header de autorização do Vercel Cron
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hoje = new Date().toISOString().split("T")[0];
  const em15Dias = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Buscar pareceres com reanálise vencendo nos próximos 15 dias
  const { data: vencendo, error } = await supabase
    .from("pareceres")
    .select("id, user_id, razao_social, rating_v2, data_proxima_reanalise")
    .not("data_proxima_reanalise", "is", null)
    .lte("data_proxima_reanalise", em15Dias)
    .gte("data_proxima_reanalise", hoje);

  if (error) {
    console.error("[cron/reanalise] erro ao buscar pareceres:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!vencendo?.length) {
    return Response.json({ notificacoes: 0 });
  }

  // Criar notificação para cada parecer vencendo
  const notificacoes = vencendo.map(p => {
    const diasRestantes = Math.ceil(
      (new Date(p.data_proxima_reanalise as string).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    );
    const razaoSocial =
      (p.razao_social as string | null) ?? "Cedente";

    const message =
      diasRestantes <= 3
        ? `⚠️ Reanálise URGENTE: ${razaoSocial} vence em ${diasRestantes} dia(s) — Rating ${p.rating_v2 ?? "—"}`
        : `📅 Reanálise em ${diasRestantes} dias: ${razaoSocial} — Rating ${p.rating_v2 ?? "—"}`;

    return {
      user_id: p.user_id as string,
      message,
      read: false,
    };
  });

  const { error: insertError } = await supabase
    .from("notifications")
    .insert(notificacoes);

  if (insertError) {
    console.error("[cron/reanalise] erro ao inserir notificações:", insertError.message);
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  console.log(`[cron/reanalise] ${notificacoes.length} notificação(ões) criada(s)`);
  return Response.json({ notificacoes: notificacoes.length });
}
