export const runtime = "nodejs";
export const maxDuration = 60;

import { consultarCreditHub } from "@/lib/bureaus/credithub";

export async function GET(req: Request) {
  const cnpj = new URL(req.url).searchParams.get("cnpj") || "06241040000101";
  const hasUrl = !!process.env.CREDITHUB_API_URL;
  const hasKey = !!process.env.CREDITHUB_API_KEY;
  const url = process.env.CREDITHUB_API_URL;

  try {
    const result = await consultarCreditHub(cnpj);
    return Response.json({
      env: { hasUrl, hasKey, url },
      success: result.success,
      error: result.error,
      hasProtestos: !!result.protestos,
      vigentesQtd: result.protestos?.vigentesQtd,
      vigentesValor: result.protestos?.vigentesValor,
      detalhesCount: result.protestos?.detalhes?.length,
      hasProcessos: !!result.processos,
      passivosTotal: result.processos?.passivosTotal,
      ativosTotal: result.processos?.ativosTotal,
      hasCCF: !!result.ccf,
      ccfQtd: result.ccf?.qtdRegistros,
    });
  } catch (e) {
    return Response.json({ env: { hasUrl, hasKey, url }, error: String(e) });
  }
}
