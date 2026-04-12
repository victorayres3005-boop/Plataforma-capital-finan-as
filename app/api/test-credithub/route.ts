export const runtime = "nodejs";

export async function GET() {
  const url = process.env.CREDITHUB_API_URL;
  const key = process.env.CREDITHUB_API_KEY;
  if (!url || !key) {
    return Response.json({ error: "env not set", hasUrl: !!url, hasKey: !!key });
  }
  try {
    const testUrl = `${url}/simples/${key}/33570033000126`;
    const res = await fetch(testUrl, { headers: { "Content-Type": "application/json" } });
    const text = await res.text();
    return Response.json({
      status: res.status,
      ok: res.ok,
      url: testUrl.replace(key, "***"),
      body: text.substring(0, 2000),
      contentType: res.headers.get("content-type"),
    });
  } catch (e) {
    return Response.json({ error: String(e) });
  }
}
