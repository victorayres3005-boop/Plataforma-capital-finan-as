export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Diagnostic endpoint — tests CreditHub with multiple strategies
 * to find what works. Returns all attempts + results.
 *
 * Usage: GET /api/ch-diag?cnpj=06241040000101
 */
export async function GET(req: Request) {
  const cnpj = new URL(req.url).searchParams.get("cnpj") || "06241040000101";
  const KEY = process.env.CREDITHUB_API_KEY || "9d3b1f096fe2b4c5ba9855d286c92d38";
  const cnpjNum = cnpj.replace(/\D/g, "");

  const strategies = [
    {
      name: "1. Direct GET — credithub.com.br (doc default)",
      url: `https://irql.credithub.com.br/simples/${KEY}/${cnpjNum}`,
      init: { method: "GET", headers: { "Content-Type": "application/json" } },
    },
    {
      name: "2. Direct GET — icheques.com.br (lib oficial)",
      url: `https://irql.icheques.com.br/simples/${KEY}/${cnpjNum}`,
      init: { method: "GET", headers: { "Content-Type": "application/json" } },
    },
    {
      name: "3. With browser User-Agent",
      url: `https://irql.credithub.com.br/simples/${KEY}/${cnpjNum}`,
      init: {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      },
    },
    {
      name: "4. With Origin credithub.com.br",
      url: `https://irql.credithub.com.br/simples/${KEY}/${cnpjNum}`,
      init: {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://credithub.com.br",
          "Referer": "https://credithub.com.br/",
        },
      },
    },
    {
      name: "5. POST instead of GET",
      url: `https://irql.credithub.com.br/simples/${KEY}/${cnpjNum}`,
      init: { method: "POST", headers: { "Content-Type": "application/json" } },
    },
    {
      name: "6. BPQL query format",
      url: `https://irql.credithub.com.br/?apiKey=${KEY}&q=${encodeURIComponent(`SELECT FROM 'CREDIT-HUB'.'CONSULTA' WHERE 'documento' = '${cnpjNum}'`)}`,
      init: { method: "GET" },
    },
    {
      name: "7. With Authorization header",
      url: `https://irql.credithub.com.br/simples/${KEY}/${cnpjNum}`,
      init: {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${KEY}`,
          "Content-Type": "application/json",
        },
      },
    },
    {
      name: "8. X-API-Key header",
      url: `https://irql.credithub.com.br/simples/${KEY}/${cnpjNum}`,
      init: {
        method: "GET",
        headers: {
          "X-API-Key": KEY,
          "Content-Type": "application/json",
        },
      },
    },
    {
      name: "9. serasa=true param",
      url: `https://irql.credithub.com.br/simples/${KEY}/${cnpjNum}?serasa=true`,
      init: { method: "GET", headers: { "Content-Type": "application/json" } },
    },
  ];

  const results: Array<{
    name: string;
    status: number;
    contentType: string;
    isJson: boolean;
    hasData: boolean;
    bodyPreview: string;
    bpqlExceptionCode?: string;
    bpqlExceptionText?: string;
  }> = [];

  for (const s of strategies) {
    try {
      const res = await fetch(s.url, s.init as RequestInit);
      const text = await res.text();
      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("json");
      let hasData = false;
      if (isJson) {
        try {
          const j = JSON.parse(text);
          hasData = !!(j?.data || j?.cnpj || j?.razaoSocial);
        } catch {}
      }
      // Extract BPQL exception info
      const codeMatch = text.match(/code="(\d+)"/);
      const textMatch = text.match(/>([^<]+)<\/exception>/);
      results.push({
        name: s.name,
        status: res.status,
        contentType: ct,
        isJson,
        hasData,
        bodyPreview: text.substring(0, 200),
        bpqlExceptionCode: codeMatch?.[1],
        bpqlExceptionText: textMatch?.[1]?.substring(0, 150),
      });
    } catch (err) {
      results.push({
        name: s.name,
        status: 0,
        contentType: "",
        isJson: false,
        hasData: false,
        bodyPreview: String(err).substring(0, 200),
      });
    }
  }

  // Get outbound IP
  let ourIp = "";
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipRes.json();
    ourIp = ipData.ip;
  } catch {}

  return Response.json({
    cnpj: cnpjNum,
    keyPrefix: KEY.substring(0, 8) + "...",
    serverIp: ourIp,
    timestamp: new Date().toISOString(),
    anyWorked: results.some(r => r.hasData),
    results,
  }, { headers: { "Cache-Control": "no-store" } });
}
