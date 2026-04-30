export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { syncGoalfyCards } from "@/lib/goalfy/sync";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  // Fail-closed: sem CRON_SECRET, ninguém roda
  if (!CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncGoalfyCards();
    if (result.error) {
      console.error("[goalfy-sync]", result.error);
      return Response.json({ error: result.error }, { status: 502 });
    }
    console.log(`[goalfy-sync] ${result.synced}/${result.total} cards`);
    return Response.json({ synced: result.synced, total: result.total });
  } catch (err) {
    console.error("[goalfy-sync]", err);
    return Response.json({ error: "Erro interno" }, { status: 500 });
  }
}
