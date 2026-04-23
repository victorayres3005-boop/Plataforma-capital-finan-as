/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const API_KEY = process.env.TRANSPARENCIA_API_KEY || "";

export interface SancaoItem {
  tipo: "CEIS" | "CNEP";
  cpfCnpjSancionado: string;
  nomeSancionado: string;
  tipoSancao: string;
  orgaoSancionador: string;
  fundamentacaoLegal: string;
  dataInicioSancao: string;
  dataFinalSancao: string | null;
  valorMulta: number | null;
  ativa: boolean;
}

export interface SancoesResult {
  success: boolean;
  mock: boolean;
  error?: string;
  sancoesCNPJ: SancaoItem[];
  sancoesSocios: SancaoItem[];
  cnpjLimpo: boolean;
  sociosLimpos: boolean;
  totalSancoes: number;
}

function parseSancao(raw: any, tipo: "CEIS" | "CNEP"): SancaoItem {
  const dataFim = raw.dataFinalSancao || raw.dataFim || null;
  const hoje = new Date().toISOString().split("T")[0];
  return {
    tipo,
    cpfCnpjSancionado: raw.cpfCnpjSancionado || raw.cpf || raw.cnpj || "",
    nomeSancionado: raw.nomeSancionado || raw.nome || "",
    tipoSancao: raw.tipoSancao?.descricao || String(raw.tipoSancao || ""),
    orgaoSancionador: raw.orgaoSancionador?.nome || String(raw.orgaoSancionador || ""),
    fundamentacaoLegal: raw.fundamentacaoLegal || "",
    dataInicioSancao: raw.dataInicioSancao || raw.dataInicio || "",
    dataFinalSancao: dataFim,
    valorMulta: raw.valorMulta != null ? Number(raw.valorMulta) : null,
    ativa: !dataFim || dataFim >= hoje,
  };
}

async function fetchSancoes(
  endpoint: string,
  params: Record<string, string>,
  tipo: "CEIS" | "CNEP"
): Promise<SancaoItem[]> {
  const url = new URL(`${BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("pagina", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { "chave-api": API_KEY, "Accept": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const items: any[] = Array.isArray(data) ? data : (data.data || data.items || []);
    return items.map((i) => parseSancao(i, tipo));
  } catch {
    return [];
  }
}

export async function consultarSancoes(
  cnpj: string,
  socios?: { nome: string; cpfCnpj: string }[]
): Promise<SancoesResult> {
  if (!API_KEY) {
    return {
      success: false,
      mock: true,
      error: "TRANSPARENCIA_API_KEY não configurada — cadastro gratuito em portaldatransparencia.gov.br/api-de-dados/cadastro-usuario",
      sancoesCNPJ: [],
      sancoesSocios: [],
      cnpjLimpo: true,
      sociosLimpos: true,
      totalSancoes: 0,
    };
  }

  const cnpjNum = cnpj.replace(/\D/g, "");

  try {
    const [ceisCNPJ, cnepCNPJ] = await Promise.all([
      fetchSancoes("ceis", { cnpjSancionado: cnpjNum }, "CEIS"),
      fetchSancoes("cnep", { cnpjSancionado: cnpjNum }, "CNEP"),
    ]);
    const sancoesCNPJ = [...ceisCNPJ, ...cnepCNPJ];

    // Consulta CEIS por CPF dos sócios PF (limite 5 para não sobrecarregar)
    const sociosPF = (socios || [])
      .filter((s) => s.cpfCnpj && s.cpfCnpj.replace(/\D/g, "").length === 11)
      .slice(0, 5);

    const sancoesSociosArrays = await Promise.all(
      sociosPF.map((s) =>
        fetchSancoes("ceis", { cpfSancionado: s.cpfCnpj.replace(/\D/g, "") }, "CEIS")
      )
    );
    const sancoesSocios = sancoesSociosArrays.flat();

    return {
      success: true,
      mock: false,
      sancoesCNPJ,
      sancoesSocios,
      cnpjLimpo: sancoesCNPJ.length === 0,
      sociosLimpos: sancoesSocios.length === 0,
      totalSancoes: sancoesCNPJ.length + sancoesSocios.length,
    };
  } catch (err: any) {
    return {
      success: false,
      mock: false,
      error: String(err?.message || err),
      sancoesCNPJ: [],
      sancoesSocios: [],
      cnpjLimpo: true,
      sociosLimpos: true,
      totalSancoes: 0,
    };
  }
}
