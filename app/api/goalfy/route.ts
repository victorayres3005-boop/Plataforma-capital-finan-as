export const runtime = "edge";

const GOALFY_WEBHOOK_URL = process.env.GOALFY_WEBHOOK_URL || "";

export async function POST(req: Request) {
  try {
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

    const res = await fetch(GOALFY_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
