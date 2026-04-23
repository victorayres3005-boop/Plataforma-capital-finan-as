/* eslint-disable @typescript-eslint/no-explicit-any */

const BRASILAPI_BASE = "https://brasilapi.com.br/api/cnpj/v1";

export interface BrasilApiCNPJData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;   // "ATIVA" | "BAIXADA" | "SUSPENSA" | "INAPTA" | ...
  dataSituacaoCadastral: string;
  motivoSituacaoCadastral: string;
  porte: string;
  naturezaJuridica: string;
  descricaoNaturezaJuridica: string;
  cnaePrincipal: string;       // "código — descrição"
  capitalSocial: number;
  endereco: string;
  telefones: string[];
  emails: string[];
  dataAbertura: string;
  ativa: boolean;
  qsa: {
    nome: string;
    cpfCnpj: string;
    qualificacao: string;
    dataEntrada: string;
    percentualCapital: number;
  }[];
}

export interface BrasilApiResult {
  success: boolean;
  mock: boolean;
  error?: string;
  data?: BrasilApiCNPJData;
}

export async function consultarBrasilApi(cnpj: string): Promise<BrasilApiResult> {
  const cnpjNum = cnpj.replace(/\D/g, "");
  if (cnpjNum.length !== 14) {
    return { success: false, mock: false, error: "CNPJ inválido" };
  }

  try {
    const res = await fetch(`${BRASILAPI_BASE}/${cnpjNum}`, {
      headers: { "User-Agent": "capitalfinancas/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { success: false, mock: false, error: `BrasilAPI ${res.status}: ${errText.slice(0, 120)}` };
    }

    const raw: any = await res.json();

    const enderecoParts = [
      raw.logradouro,
      raw.numero,
      raw.complemento,
      raw.bairro,
      raw.municipio && raw.uf ? `${raw.municipio}/${raw.uf}` : (raw.municipio || raw.uf || ""),
      raw.cep,
    ].filter(Boolean);

    const cnaePrincipal = raw.cnae_fiscal
      ? `${raw.cnae_fiscal}${raw.cnae_fiscal_descricao ? ` — ${raw.cnae_fiscal_descricao}` : ""}`
      : "";

    const situacao = (raw.descricao_situacao_cadastral || "").toUpperCase();

    const data: BrasilApiCNPJData = {
      cnpj: cnpjNum,
      razaoSocial: raw.razao_social || "",
      nomeFantasia: raw.nome_fantasia || "",
      situacaoCadastral: raw.descricao_situacao_cadastral || "",
      dataSituacaoCadastral: raw.data_situacao_cadastral || "",
      motivoSituacaoCadastral: raw.descricao_motivo_situacao_cadastral || "",
      porte: raw.descricao_porte || raw.porte || "",
      naturezaJuridica: String(raw.natureza_juridica || ""),
      descricaoNaturezaJuridica: raw.descricao_natureza_juridica || "",
      cnaePrincipal,
      capitalSocial: Number(raw.capital_social || 0),
      endereco: enderecoParts.join(", "),
      telefones: [raw.ddd_telefone_1, raw.ddd_telefone_2].filter(Boolean),
      emails: raw.email ? [raw.email] : [],
      dataAbertura: raw.data_inicio_atividade || "",
      ativa: situacao === "ATIVA",
      qsa: (raw.qsa || []).map((s: any) => ({
        nome: s.nome_socio || "",
        cpfCnpj: s.cnpj_cpf_do_socio || "",
        qualificacao: s.descricao_qualificacao_socio || "",
        dataEntrada: s.data_entrada_sociedade || "",
        percentualCapital: Number(s.percentual_capital_social || 0),
      })),
    };

    return { success: true, mock: false, data };
  } catch (err: any) {
    return { success: false, mock: false, error: String(err?.message || err) };
  }
}
