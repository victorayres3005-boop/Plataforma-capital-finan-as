/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SCRData, SCRModalidade } from "@/types";
import { cacheGet, cacheSet } from "./cache";

const DB360_BASE_URL = (process.env.DATABOX360_BASE_URL || "https://sandbox-api.databox360.com.br").trim();
const DB360_API_KEY  = (process.env.DATABOX360_API_KEY  || "").trim();

// ─── JWT token cache (1h TTL) ────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;
// Lock: chamadas concorrentes esperam a mesma promise em vez de gerar N requests
let _tokenFetchPromise: Promise<string | null> | null = null;
// Circuit breaker: quando token falha, não retenta por 60s (evita gastar minutos quando sandbox está fora)
let tokenFailedUntil = 0;

async function fetchTokenOnce(): Promise<string | null> {
  // 1 tentativa só: retry não ajuda quando sandbox está lento ou fora
  // Circuit breaker no getToken cuida de não retentar por 60s após falha
  try {
    const res = await fetch(`${DB360_BASE_URL}/api/sessions/token`, {
      method: "GET",
      headers: { "Authorization": DB360_API_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[databox360] auth falhou: ${res.status}`);
      return null;
    }
    const raw = await res.json() as any;
    const token = raw?.token ?? raw?.access_token ?? raw?.data?.token ?? null;
    if (!token) {
      console.warn("[databox360] token não encontrado na resposta:", JSON.stringify(raw).slice(0, 200));
      return null;
    }
    cachedToken = token;
    tokenExpiresAt = Date.now() + 3_600_000; // 1h
    console.log(`[databox360] token obtido com sucesso`);
    return token;
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    console.warn(`[databox360] erro ao obter token:`, msg);
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (!DB360_API_KEY) return null;

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  // Circuit breaker: token falhou recentemente — não retenta nessa request
  if (Date.now() < tokenFailedUntil) {
    return null;
  }

  // Se já há fetch em andamento, espera ele terminar (evita N requests simultâneos)
  if (_tokenFetchPromise) return _tokenFetchPromise;

  _tokenFetchPromise = fetchTokenOnce().finally(() => { _tokenFetchPromise = null; });
  const result = await _tokenFetchPromise;
  if (result === null) {
    // Falhou — bloqueia novas tentativas por 60s na mesma serverless instance
    tokenFailedUntil = Date.now() + 60_000;
    console.warn(`[databox360] circuit breaker ativado — próximas chamadas SCR pulam por 60s`);
  }
  return result;
}

// ─── Calcula período de referência do SCR ────────────────────────────────────
// Regra BCB: dados SCR do mês M ficam disponíveis por volta do dia 25 do mês M+1.
// Logo: dias 1-25 → usa M-2 (seguro); dias 26-31 → usa M-1 (disponível recentemente).
// `mesesExtras` permite retroceder ainda mais (ex: 12 = mesmo mês ano anterior).
function calcularPeriodo(mesesExtras: number = 0): { mes: string; ano: string } {
  const hoje = new Date();
  const dia = hoje.getDate();
  const mesesAtras = (dia <= 25 ? 2 : 1) + mesesExtras;

  const ref = new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, 1);
  const mes = String(ref.getMonth() + 1).padStart(2, "0");
  const ano = String(ref.getFullYear());
  return { mes, ano };
}

// ─── Formatação ──────────────────────────────────────────────────────────────
function fmtBRL(n: number | undefined | null): string {
  const v = Number(n ?? 0);
  if (!isFinite(v) || isNaN(v)) return "R$ 0,00";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Map DataBox360 response → SCRData ───────────────────────────────────────
// Estrutura real da API DataBox360:
// consulta.resumoDoCliente  → metadados (dataBaseConsultada, qtdeInstituicoes, qtdeOperacoes)
// consulta.resumoDaCarteira → totais financeiros (carteiraVencer, carteiraVencido, prejuizo, etc.)
// consulta.resumoDasModalidades[] → { tipo: "A VENCER"|"VENCIDO", dominio, subdominio, valorVencimento }
// consulta.resumoDasOperacoes[] → operações individuais detalhadas
function mapearSCRData(raw: any, documento: string): SCRData {
  const consulta  = raw?.consulta ?? raw;
  const cliente   = consulta?.resumoDoCliente ?? {};
  const carteira  = consulta?.resumoDaCarteira ?? {};

  // Totais financeiros — em resumoDaCarteira
  const carteiraVencer  = Number(carteira.carteiraVencer  ?? 0);
  const carteiraVencido = Number(carteira.carteiraVencido ?? 0);
  const prejuizo        = Number(carteira.prejuizo        ?? 0);
  const limites         = Number(carteira.limitesdeCredito ?? (carteira.limitesdeCreditoAte360dias ?? 0) + (carteira.limitesdeCreditoAcima360dias ?? 0));
  const totalCarteira   = Number(carteira.carteiradeCredito ?? (carteiraVencer + carteiraVencido + prejuizo));
  const coobrigacoes    = Number(carteira.coobrigacoes    ?? 0);
  const moedaEstr       = Number(carteira.moedaEstrangeiraValor ?? 0);
  const responsTotal    = Number(carteira.responsabilidadeTotal ?? 0);

  // Metadados — em resumoDoCliente
  const qtdeInst  = Number(cliente.quantidadeDeInstituicoes ?? 0);
  const qtdeOps   = Number(cliente.quantidadeDeOperacoes    ?? 0);
  const dataBase  = String(cliente.dataBaseConsultada ?? "");
  const pctDocs   = String(cliente.percentualDocumentosProcessados ?? "");
  const pctVol    = String(cliente.percentualVolumeProcessado      ?? "");

  const periodoRef = dataBase || (() => {
    const p = calcularPeriodo(0);
    return `${p.ano}-${p.mes}`;
  })();

  // Faixas a vencer (buckets BCB)
  const ate30d_n     = Number(carteira.carteiraVencerAte30diasVencidosAte14dias ?? 0);
  const d31_60_n     = Number(carteira.carteiraVencer31a60dias   ?? 0);
  const d61_90_n     = Number(carteira.carteiraVencer61a90dias   ?? 0);
  const d91_180_n    = Number(carteira.carteiraVencer91a180dias  ?? 0);
  const d181_360_n   = Number(carteira.carteiraVencer181a360dias ?? 0);
  const acima360d_n  = Number(carteira.carteiraVencerAcima360dias ?? 0);
  const prazoIndet_n = Number(carteira.carteiraVencerPrazoIndeterminado ?? 0);
  const faixasAVencer = {
    ate30d:             fmtBRL(ate30d_n),
    d31_60:             fmtBRL(d31_60_n),
    d61_90:             fmtBRL(d61_90_n),
    d91_180:            fmtBRL(d91_180_n),
    d181_360:           fmtBRL(d181_360_n),
    acima360d:          fmtBRL(acima360d_n),
    prazoIndeterminado: fmtBRL(prazoIndet_n),
    total:              fmtBRL(carteiraVencer),
  };
  // Curto prazo = até 360 dias; Longo prazo = acima 360 dias + indeterminado (padrão BCB)
  const curtoPrazoN  = ate30d_n + d31_60_n + d61_90_n + d91_180_n + d181_360_n;
  const longoPrazoN  = acima360d_n + prazoIndet_n;

  // Faixas vencidos
  const faixasVencidos = {
    ate30d:    fmtBRL(carteira.carteiraVencido15a30dias  ?? 0),
    d31_60:    fmtBRL(carteira.carteiraVencido31a60dias  ?? 0),
    d61_90:    fmtBRL(carteira.carteiraVencido61a90dias  ?? 0),
    d91_180:   fmtBRL(carteira.carteiraVencido91a180dias ?? 0),
    d181_360:  fmtBRL(carteira.carteiraVencido181a360dias ?? 0),
    acima360d: fmtBRL(carteira.carteiraVencidoAcima360dias ?? 0),
    total:     fmtBRL(carteiraVencido),
  };

  // Modalidades — agrupa por domínio, somando A VENCER vs VENCIDO
  // Formato real: [ { tipo: "A VENCER"|"VENCIDO", dominio, subdominio, valorVencimento } ]
  const modalidadesRaw: any[] = consulta?.resumoDasModalidades ?? [];
  const modalMap = new Map<string, { aVencer: number; vencido: number }>();
  for (const m of modalidadesRaw) {
    const nome  = String(m.dominio ?? m.subdominio ?? m.modalidade ?? "—").trim();
    const valor = Number(m.valorVencimento ?? 0);
    if (valor === 0) continue;
    const tipo  = String(m.tipo ?? "").toUpperCase();
    const entry = modalMap.get(nome) ?? { aVencer: 0, vencido: 0 };
    if (tipo === "A VENCER") entry.aVencer += valor;
    else if (tipo === "VENCIDO") entry.vencido += valor;
    else entry.aVencer += valor;
    modalMap.set(nome, entry);
  }
  const modalidades: SCRModalidade[] = Array.from(modalMap.entries())
    .map(([nome, v]) => {
      const total = v.aVencer + v.vencido;
      return {
        nome,
        total:        fmtBRL(total),
        aVencer:      fmtBRL(v.aVencer),
        vencido:      fmtBRL(v.vencido),
        participacao: totalCarteira > 0 ? `${((total / totalCarteira) * 100).toFixed(1)}%` : "—",
      };
    })
    .sort((a, b) => {
      const ta = Number(a.total.replace(/[^0-9,]/g, "").replace(",", "."));
      const tb = Number(b.total.replace(/[^0-9,]/g, "").replace(",", "."));
      return tb - ta;
    });

  const docNum = documento.replace(/\D/g, "");
  const tipoPessoa = docNum.length === 11 ? "PF" : "PJ";

  return {
    periodoReferencia:   periodoRef,
    carteiraAVencer:     fmtBRL(carteiraVencer),
    vencidos:            fmtBRL(carteiraVencido),
    prejuizos:           fmtBRL(prejuizo),
    limiteCredito:       fmtBRL(limites),
    qtdeInstituicoes:    String(qtdeInst),
    qtdeOperacoes:       String(qtdeOps),
    totalDividasAtivas:  fmtBRL(totalCarteira),
    operacoesAVencer:    fmtBRL(carteiraVencer),
    operacoesEmAtraso:   "R$ 0,00",
    operacoesVencidas:   fmtBRL(carteiraVencido),
    tempoAtraso:         "—",
    coobrigacoes:        fmtBRL(coobrigacoes),
    classificacaoRisco:  "—",
    carteiraCurtoPrazo:  curtoPrazoN > 0 ? fmtBRL(curtoPrazoN) : "—",
    carteiraLongoPrazo:  longoPrazoN > 0 ? fmtBRL(longoPrazoN) : "—",
    modalidades,
    instituicoes:        [],
    valoresMoedaEstrangeira: moedaEstr > 0 ? fmtBRL(moedaEstr) : "—",
    historicoInadimplencia:  "—",
    tipoPessoa,
    fonteBureau:         "DataBox360",
    pctDocumentosProcessados: pctDocs || undefined,
    pctVolumeProcessado:      pctVol  || undefined,
    faixasAVencer,
    faixasVencidos,
    outrosValores: {
      carteiraCredito:      fmtBRL(totalCarteira),
      responsabilidadeTotal: fmtBRL(responsTotal),
      riscoTotal:           fmtBRL(Number(carteira.riscoTotal ?? 0)),
      coobrigacaoAssumida:  fmtBRL(Number(cliente.coobrigacaoAssumida ?? 0)),
      coobrigacaoRecebida:  fmtBRL(Number(cliente.coobrigacaoRecebida ?? 0)),
      creditosALiberar:     fmtBRL(Number(carteira.creditosaLiberar ?? 0)),
    },
    semDados: totalCarteira === 0 && qtdeInst === 0,
  };
}

// ─── Consulta SCR para um documento em um período ───────────────────────────
export async function consultarSCR(
  documento: string,
  mes: string,
  ano: string,
): Promise<SCRData | null> {
  const docNum = documento.replace(/\D/g, "");
  if (!docNum) return null;

  // Cache persistente Supabase (24h TTL) — ajuda quando sandbox cai entre análises
  const cacheKey = `scr:${docNum}:${ano}${mes}`;
  const cached = await cacheGet<SCRData>(cacheKey);
  if (cached) {
    console.log(`[databox360] SCR ${docNum.slice(0, 4)}*** ${mes}/${ano} cache HIT`);
    return cached;
  }

  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${DB360_BASE_URL}/api/scr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ documento: docNum, mes, ano }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[databox360] SCR ${docNum.slice(0, 4)}*** ${mes}/${ano} → ${res.status}: ${txt.slice(0, 100)}`);
      return null;
    }

    const raw = await res.json();
    const scrData = mapearSCRData(raw, docNum);
    console.log(`[databox360] SCR ${docNum.slice(0, 4)}*** ${mes}/${ano} → ok (cacheado)`);
    // Salva no cache (best-effort, não bloqueia)
    cacheSet(cacheKey, scrData).catch(() => {});
    return scrData;
  } catch (err) {
    console.warn(`[databox360] SCR ${docNum.slice(0, 4)}*** erro:`, String(err instanceof Error ? err.message : err));
    return null;
  }
}

// ─── Resultado para a empresa ────────────────────────────────────────────────
export interface DataBox360EmpresaResult {
  scr: SCRData | null;
  scrAnterior: SCRData | null;
  mock: boolean;
}

export async function consultarSCREmpresa(cnpj: string): Promise<DataBox360EmpresaResult> {
  if (!DB360_API_KEY) return { scr: null, scrAnterior: null, mock: true };

  // Comparativo anual: período atual vs mesmo mês 12 meses atrás
  const { mes: mesAtual, ano: anoAtual } = calcularPeriodo(0);
  const { mes: mesAnt,   ano: anoAnt   } = calcularPeriodo(12);

  const [scr, scrAnterior] = await Promise.all([
    consultarSCR(cnpj, mesAtual, anoAtual),
    consultarSCR(cnpj, mesAnt, anoAnt),
  ]);

  return { scr, scrAnterior, mock: false };
}

// ─── Resultado por sócio ─────────────────────────────────────────────────────
export interface DataBox360SocioResult {
  nomeSocio: string;
  cpfSocio: string;
  periodoAtual: SCRData | null;
  periodoAnterior: SCRData | null;
}

export async function consultarSCRSocios(
  socios: { nome: string; cpfCnpj: string }[],
): Promise<DataBox360SocioResult[]> {
  if (!DB360_API_KEY) return [];

  const sociosPF = socios.filter(s => s.cpfCnpj.replace(/\D/g, "").length === 11);
  if (sociosPF.length === 0) return [];

  // Comparativo anual: período atual vs mesmo mês 12 meses atrás
  const { mes: mesAtual, ano: anoAtual } = calcularPeriodo(0);
  const { mes: mesAnt,   ano: anoAnt   } = calcularPeriodo(12);

  const resultados = await Promise.allSettled(
    sociosPF.map(async (s): Promise<DataBox360SocioResult> => {
      const [periodoAtual, periodoAnterior] = await Promise.all([
        consultarSCR(s.cpfCnpj, mesAtual, anoAtual),
        consultarSCR(s.cpfCnpj, mesAnt, anoAnt),
      ]);
      return {
        nomeSocio:       s.nome,
        cpfSocio:        s.cpfCnpj.replace(/\D/g, ""),
        periodoAtual,
        periodoAnterior,
      };
    })
  );

  return resultados
    .filter((r): r is PromiseFulfilledResult<DataBox360SocioResult> => r.status === "fulfilled")
    .map(r => r.value);
}

// ─── SCR para empresas do grupo econômico ───────────────────────────────────
// Busca SCR (período atual apenas) para cada CNPJ vinculado aos sócios.
// Cap 5 empresas para limitar custo + tempo.
export interface DataBox360EmpresaGrupoResult {
  cnpj: string;
  totalDividas: string;       // formatado BRL
  carteiraVencer: string;
  carteiraVencido: string;
  qtdeOperacoes: number;
}

export async function consultarSCRGrupoEconomico(
  cnpjs: string[],
): Promise<DataBox360EmpresaGrupoResult[]> {
  if (!DB360_API_KEY) return [];

  const cnpjsValidos = cnpjs
    .map(c => c.replace(/\D/g, ""))
    .filter(c => c.length === 14)
    .slice(0, 5); // cap

  if (cnpjsValidos.length === 0) return [];

  const { mes, ano } = calcularPeriodo(0);

  const resultados = await Promise.allSettled(
    cnpjsValidos.map(async (cnpj): Promise<DataBox360EmpresaGrupoResult | null> => {
      const scr = await consultarSCR(cnpj, mes, ano);
      if (!scr) return null;
      // Total de dívidas = a vencer + vencido + prejuízos (BACEN responsabilidade)
      const numVal = (s: string | undefined): number => {
        if (!s) return 0;
        const n = Number(s.replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", "."));
        return isNaN(n) ? 0 : n;
      };
      const total = numVal(scr.carteiraAVencer) + numVal(scr.vencidos) + numVal(scr.prejuizos);
      const fmtBRL = (n: number) => total > 0 ? `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
      return {
        cnpj,
        totalDividas:    fmtBRL(total),
        carteiraVencer:  scr.carteiraAVencer ?? "R$ 0,00",
        carteiraVencido: scr.vencidos ?? "R$ 0,00",
        qtdeOperacoes:   Number(scr.qtdeOperacoes ?? 0),
      };
    })
  );

  return resultados
    .filter((r): r is PromiseFulfilledResult<DataBox360EmpresaGrupoResult | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((r): r is DataBox360EmpresaGrupoResult => r !== null);
}
