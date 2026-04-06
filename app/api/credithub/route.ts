export const runtime = "edge";

const CREDITHUB_API_URL = process.env.CREDITHUB_API_URL || "https://api.credithub.com.br"; // TODO: confirmar URL real
const CREDITHUB_API_KEY = process.env.CREDITHUB_API_KEY || "";

export async function POST(req: Request) {
  try {
    const { cnpj } = await req.json();

    if (!cnpj) {
      return Response.json({ error: "CNPJ obrigatório" }, { status: 400 });
    }

    if (!CREDITHUB_API_KEY) {
      // Modo mock — retorna dados vazios enquanto não temos credenciais
      return Response.json({
        success: true,
        mock: true,
        protestos: {
          totalProtestos: 0,
          valorTotal: "0,00",
          distribuicaoTemporal: [],
          topCartorios: [],
          semProtestos: true,
          fonte: "credithub",
          consultadoEm: new Date().toISOString(),
        },
        processos: {
          totalProcessos: 0,
          processosBancarios: 0,
          processosFiscais: 0,
          processosTrabalhistas: 0,
          processosOutros: 0,
          valorTotalEstimado: "0,00",
          semProcessos: true,
          fonte: "credithub",
          consultadoEm: new Date().toISOString(),
        },
      });
    }

    // TODO: ajustar endpoints reais quando tivermos documentação
    const [protestosRes, processosRes] = await Promise.all([
      fetch(`${CREDITHUB_API_URL}/protestos/${cnpj}`, {
        headers: { Authorization: `Bearer ${CREDITHUB_API_KEY}` },
      }),
      fetch(`${CREDITHUB_API_URL}/processos/${cnpj}`, {
        headers: { Authorization: `Bearer ${CREDITHUB_API_KEY}` },
      }),
    ]);

    const protestosRaw = await protestosRes.json();
    const processosRaw = await processosRes.json();

    const { parseProtestosResponse, parseProcessosResponse } = await import("@/lib/credithub/parser");

    return Response.json({
      success: true,
      mock: false,
      protestos: parseProtestosResponse(protestosRaw),
      processos: parseProcessosResponse(processosRaw),
    });
  } catch (error) {
    console.error("[credithub] erro:", error);
    return Response.json({ error: "Erro ao consultar Credit Hub" }, { status: 500 });
  }
}
