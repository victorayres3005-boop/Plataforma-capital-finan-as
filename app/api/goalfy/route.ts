import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const GOALFY_WEBHOOK_URL = process.env.GOALFY_WEBHOOK_URL || "";
const GOALFY_API_KEY = process.env.GOALFY_API_KEY || "";

export async function POST(req: Request) {
  try {
    // Auth check
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { try { return cookieStore.get(name)?.value; } catch { return undefined; } }, set() {}, remove() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data, aiAnalysis, settings } = await req.json();

    if (!GOALFY_WEBHOOK_URL) {
      return Response.json({
        success: false,
        mock: true,
        message: "GOALFY_WEBHOOK_URL não configurado — integração pendente de credenciais",
      });
    }

    const { mapToGoalfyPayload } = await import("@/lib/goalfy/mapper");
    const payload = mapToGoalfyPayload(data, aiAnalysis, settings);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (GOALFY_API_KEY) headers["Authorization"] = `Bearer ${GOALFY_API_KEY}`;

    const res = await fetch(GOALFY_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const erro = await res.text();
      console.error("[goalfy] erro no envio:", erro);
      return Response.json({ success: false, error: erro }, { status: res.status });
    }

    return Response.json({ success: true, message: "Dados enviados para a Goalfy com sucesso" });

  } catch (error) {
    console.error("[goalfy] erro:", error);
    return Response.json({ error: "Erro ao enviar para Goalfy" }, { status: 500 });
  }
}
