// Assertiva Soluções — Assertiva Score v3
//
// Produto: Análise Restritiva (Score PJ + Score PF)
// Auth: OAuth2 client_credentials, Basic Auth header
// Token URL: https://api.assertivasolucoes.com.br/oauth2/v3/token
//
// Endpoints confirmados pela spec + teste real:
//   GET /score/v3/pj/credito/{cnpj}?idFinalidade=2  → score PJ, protestos, faturamento estimado
//   GET /score/v3/pf/credito/{cpf}?idFinalidade=2   → score PF, renda presumida, protestos
//
// Variáveis de ambiente: ASSERTIVA_CLIENT_ID, ASSERTIVA_CLIENT_SECRET

const ASSERTIVA_BASE     = "https://api.assertivasolucoes.com.br";
const ASSERTIVA_AUTH_URL = `${ASSERTIVA_BASE}/oauth2/v3/token`;

// ── Token cache ───────────────────────────────────────────────────────────────
let _tokenCache: { token: string; expiresAt: number } | null = null;
let _tokenFetchPromise: Promise<string | null> | null = null;

async function getToken(): Promise<string | null> {
  const clientId     = process.env.ASSERTIVA_CLIENT_ID;
  const clientSecret = process.env.ASSERTIVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;
  const cleanId     = clientId.trim();
  const cleanSecret = clientSecret.trim();

  if (_tokenCache && Date.now() < _tokenCache.expiresAt) return _tokenCache.token;
  if (_tokenFetchPromise) return _tokenFetchPromise;

  _tokenFetchPromise = (async () => {
    try {
      const basicCred = Buffer.from(`${cleanId}:${cleanSecret}`).toString("base64");
      const res = await fetch(ASSERTIVA_AUTH_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicCred}`,
        },
        body:   new URLSearchParams({ grant_type: "client_credentials" }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.warn(`[assertiva] token HTTP ${res.status} — ${await res.text().catch(() => "")}`);
        return null;
      }

      const json = await res.json() as { access_token: string; expires_in: number };
      const expiresAt = Date.now() + (json.expires_in - 60) * 1000;
      _tokenCache = { token: json.access_token, expiresAt };
      console.log(`[assertiva] token obtido — expira em ${json.expires_in}s`);
      return json.access_token;

    } catch (err) {
      console.warn("[assertiva] erro ao obter token:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      _tokenFetchPromise = null;
    }
  })();

  return _tokenFetchPromise;
}

function assertivaHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept":        "application/json",
  };
}

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface AssertivaSocioData {
  cpf:              string;
  nome:             string;
  scoreAssertivaPF: number;   // 0-1000
  scoreClasse:      string;   // A-F
  rendaPresumida:   string;   // "R$ X.XXX,XX"
  patrimonioEstimado: string;
  validacaoIdentidade: "ok" | "alerta" | "reprovado";
  // protestos do sócio (PF)
  protestosQtd:    number;
  protestosValor:  number;
  protestosLista:  AssertivaProtesto[];
  bensVeiculos: Array<{
    placa: string; modelo: string; ano: number; valorFipe: string; situacao: string;
  }>;
  bensImoveis: Array<{
    municipio: string; uf: string; areaM2?: number; valorEstimado?: string; matricula?: string;
  }>;
}

export interface AssertivaProtesto {
  uf:       string;
  cidade:   string;
  data:     string;
  valor:    number;
  cartorio: string;
}

export interface AssertivaConsulta {
  consultante: string;
  data:        string;
}

export interface AssertivaEmpresaData {
  cnpj:                  string;
  scoreAssertivaPJ:      number;  // 0-1000
  scoreClasse:           string;  // A-F
  negativacoesAssertiva: number;
  rendaPresumidaPJ:      string;  // faturamento estimado formatado
  // protestos
  protestosQtd:      number;
  protestosValor:    number;      // em reais
  protestoCompleto:  boolean;
  protestosLista:    AssertivaProtesto[];
  // últimas consultas ao mercado
  consultasTotal:    number;
  consultasRecentes: AssertivaConsulta[];
  consultasUltima:   string;
}

export interface AssertivaResult {
  success: boolean;
  mock:    boolean;
  error?:  string;
  empresa?: AssertivaEmpresaData;
  socios?:  AssertivaSocioData[];
}

// ── consultarEmpresa ──────────────────────────────────────────────────────────
export async function consultarEmpresa(cnpj: string): Promise<AssertivaResult> {
  const cnpjNum = cnpj.replace(/\D/g, "");
  if (!cnpjNum) return { success: false, mock: false, error: "CNPJ inválido" };

  const token = await getToken();
  if (!token) {
    return { success: false, mock: true, error: "ASSERTIVA_CLIENT_ID/ASSERTIVA_CLIENT_SECRET não configurados" };
  }

  try {
    const res = await fetch(
      `${ASSERTIVA_BASE}/score/v3/pj/credito/${cnpjNum}?idFinalidade=2`,
      { headers: assertivaHeaders(token), signal: AbortSignal.timeout(25000) },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[assertiva] consultarEmpresa HTTP ${res.status} — ${body.slice(0, 200)}`);
      return { success: false, mock: false, error: `Assertiva HTTP ${res.status}` };
    }

    const json = await res.json();
    console.log("[assertiva] raw empresa:", JSON.stringify(json, null, 2));
    return { success: true, mock: false, empresa: parseEmpresaResponse(cnpjNum, json) };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[assertiva] consultarEmpresa erro:", msg);
    return { success: false, mock: false, error: msg };
  }
}

// ── consultarSocios ───────────────────────────────────────────────────────────
export async function consultarSocios(
  socios: { cpf: string; nome: string }[],
): Promise<AssertivaSocioData[]> {
  const cpfsValidos = socios.filter(s => s.cpf.replace(/\D/g, "").length === 11);
  if (cpfsValidos.length === 0) return [];

  const token = await getToken();
  if (!token) return [];

  const settled = await Promise.allSettled(
    cpfsValidos.map(async ({ cpf, nome }): Promise<AssertivaSocioData | null> => {
      const cpfNum = cpf.replace(/\D/g, "");
      try {
        const res = await fetch(
          `${ASSERTIVA_BASE}/score/v3/pf/credito/${cpfNum}?idFinalidade=2`,
          { headers: assertivaHeaders(token), signal: AbortSignal.timeout(25000) },
        );

        if (!res.ok) {
          console.warn(`[assertiva] consultarSocios CPF ${cpfNum.slice(0, 3)}*** HTTP ${res.status}`);
          return null;
        }

        const json = await res.json();
        console.log(`[assertiva] raw sócio ${cpfNum.slice(0, 3)}***:`, JSON.stringify(json, null, 2));
        return parseSocioResponse(cpfNum, nome, json);

      } catch (err) {
        console.warn(`[assertiva] consultarSocios CPF ${cpfNum.slice(0, 3)}*** erro:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<AssertivaSocioData | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((r): r is AssertivaSocioData => r !== null);
}

// ── parseEmpresaResponse ──────────────────────────────────────────────────────
// Estrutura confirmada pela resposta real da API:
// { cabecalho, resposta: { score, protestosPublicos, faturamentoEstimado, registrosDebitos, ultimasConsultas } }
function parseEmpresaResponse(cnpj: string, json: unknown): AssertivaEmpresaData {
  const root     = json as Record<string, unknown>;
  const resposta = (root.resposta ?? {}) as Record<string, unknown>;
  const score    = (resposta.score ?? {}) as Record<string, unknown>;
  const fat      = (resposta.faturamentoEstimado ?? {}) as Record<string, unknown>;
  const debits   = (resposta.registrosDebitos ?? {}) as Record<string, unknown>;
  const prot     = (resposta.protestosPublicos ?? {}) as Record<string, unknown>;
  const consult  = (resposta.ultimasConsultas ?? {}) as Record<string, unknown>;

  const scoreAssertivaPJ      = _num(score.pontos);
  const scoreClasse           = _str(score.classe);
  const negativacoesAssertiva = _num(debits.qtdRegistros ?? debits.quantidade ?? debits.total);

  const fatValor     = _num(fat.valor);
  const rendaPresumidaPJ = fatValor > 0
    ? `R$ ${fatValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "";

  // Protestos
  const protestosQtd     = _num(prot.qtdProtestos);
  const protestosValorRaw = prot.valorTotal;
  const protestosValor   = typeof protestosValorRaw === "number"
    ? protestosValorRaw
    : parseFloat(String(protestosValorRaw).replace(",", ".") || "0") || 0;
  const protestoCompleto = Boolean(prot.protestoCompleto);
  const protestosLista: AssertivaProtesto[] = Array.isArray(prot.list)
    ? (prot.list as Record<string, unknown>[]).map(p => ({
        uf:       _str(p.uf),
        cidade:   _str(p.cidade),
        data:     _str(p.data),
        valor:    _num(p.valor),
        cartorio: _str(p.cartorio),
      }))
    : [];

  // Últimas consultas ao mercado
  const consultasTotal     = _num(consult.qtdUltConsultas);
  const consultasUltima    = _str(consult.ultimaOcorrencia);
  const consultasRecentes: AssertivaConsulta[] = Array.isArray(consult.list)
    ? (consult.list as Record<string, unknown>[]).slice(0, 10).map(c => ({
        consultante: _str(c.consultante),
        data:        _str(c.dataOcorrencia),
      }))
    : [];

  return {
    cnpj, scoreAssertivaPJ, scoreClasse, negativacoesAssertiva, rendaPresumidaPJ,
    protestosQtd, protestosValor, protestoCompleto, protestosLista,
    consultasTotal, consultasRecentes, consultasUltima,
  };
}

// ── parseSocioResponse ────────────────────────────────────────────────────────
// PF: { resposta: { score, protestosPublicos, registrosDebitos, rendaPresumida, cheques } }
function parseSocioResponse(cpf: string, nome: string, json: unknown): AssertivaSocioData {
  const root     = json as Record<string, unknown>;
  const resposta = (root.resposta ?? {}) as Record<string, unknown>;
  const score    = (resposta.score ?? {}) as Record<string, unknown>;
  const renda    = (resposta.rendaPresumida ?? {}) as Record<string, unknown>;

  const scoreAssertivaPF = _num(score.pontos);
  const scoreClasse      = _str(score.classe);

  // Renda presumida mensal em reais
  const rendaValor = _num(renda.valor);
  const rendaPresumida = rendaValor > 0
    ? `R$ ${rendaValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "";

  // validação de identidade via score (classe E ou F = alerta)
  const validacaoIdentidade: AssertivaSocioData["validacaoIdentidade"] =
    scoreClasse === "F" ? "reprovado" :
    scoreClasse === "E" ? "alerta" :
    "ok";

  // Protestos do sócio PF
  const protPF     = (resposta.protestosPublicos ?? {}) as Record<string, unknown>;
  const protestosQtd   = _num(protPF.qtdProtestos);
  const protValorRaw   = protPF.valorTotal;
  const protestosValor = typeof protValorRaw === "number"
    ? protValorRaw
    : parseFloat(String(protValorRaw).replace(",", ".") || "0") || 0;
  const protestosLista: AssertivaProtesto[] = Array.isArray(protPF.list)
    ? (protPF.list as Record<string, unknown>[]).map(p => ({
        uf: _str(p.uf), cidade: _str(p.cidade), data: _str(p.data),
        valor: _num(p.valor), cartorio: _str(p.cartorio),
      }))
    : [];

  return {
    cpf,
    nome,
    scoreAssertivaPF,
    scoreClasse,
    rendaPresumida,
    patrimonioEstimado: "",
    validacaoIdentidade,
    protestosQtd,
    protestosValor,
    protestosLista,
    bensVeiculos: [],
    bensImoveis:  [],
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function _str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function _num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ── mapearEmpresaParaExtractedData ────────────────────────────────────────────
export function mapearEmpresaParaExtractedData(empresa: AssertivaEmpresaData): {
  scoreAssertivaPJ?:      number;
  negativacoesAssertiva?: number;
  rendaPresumidaPJ?:      string;
} {
  return {
    scoreAssertivaPJ:      empresa.scoreAssertivaPJ      || undefined,
    negativacoesAssertiva: empresa.negativacoesAssertiva  || undefined,
    rendaPresumidaPJ:      empresa.rendaPresumidaPJ       || undefined,
  };
}
