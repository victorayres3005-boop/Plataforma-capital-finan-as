// Endpoint temporário de diagnóstico — NÃO USAR EM PRODUÇÃO COM DADOS REAIS
// Remove após identificar a estrutura da API CreditHub

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cnpj = (url.searchParams.get("cnpj") || "").replace(/\D/g, "");

  if (!cnpj || cnpj.length !== 14) {
    return Response.json({ error: "Informe ?cnpj=00000000000000 (14 dígitos)" }, { status: 400 });
  }

  const apiUrl = process.env.CREDITHUB_API_URL;
  const apiKey = process.env.CREDITHUB_API_KEY;

  if (!apiUrl || !apiKey) {
    return Response.json({ error: "CREDITHUB_API_URL ou CREDITHUB_API_KEY não configurados" }, { status: 500 });
  }

  try {
    const endpoint = `${apiUrl}/simples/${apiKey}/${cnpj}`;
    const res = await fetch(endpoint, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return Response.json({ error: `CreditHub retornou ${res.status}`, body: await res.text() }, { status: 502 });
    }

    const raw = await res.json();
    const d = raw?.data ?? raw;

    const mapStructure = (obj: unknown, depth = 0): unknown => {
      if (depth > 3) return typeof obj;
      if (obj === null || obj === undefined) return null;
      if (Array.isArray(obj)) {
        return `array[${obj.length}]` + (obj.length > 0 ? ` → ${typeof obj[0] === "object" ? `{${Object.keys(obj[0] as object).join(",")}}` : typeof obj[0]}` : "");
      }
      if (typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          result[k] = mapStructure(v, depth + 1);
        }
        return result;
      }
      return typeof obj === "string" ? `string(${(obj as string).length})` : typeof obj;
    };

    return Response.json({
      status: res.status,
      hasDataWrapper: !!raw?.data,
      topLevelKeys: Object.keys(raw ?? {}),
      dataKeys: Object.keys(d ?? {}),
      structure: mapStructure(d),
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
