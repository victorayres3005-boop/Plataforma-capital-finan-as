// Endpoint de diagnóstico removido por segurança
export async function GET() {
  return Response.json({ error: "Not found" }, { status: 404 });
}
