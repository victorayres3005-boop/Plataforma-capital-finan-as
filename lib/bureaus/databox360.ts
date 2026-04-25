/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SCRData, SCRModalidade } from "@/types";

const DB360_BASE_URL = (process.env.DATABOX360_BASE_URL || "https://sandbox-api.databox360.com.br").trim();
const DB360_API_KEY  = (process.env.DATABOX360_API_KEY  || "").trim();

// ─── JWT token cache (1h TTL) ────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getToken(): Promise<string | null> {
  if (!DB360_API_KEY) return null;

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const res = await fetch(`${DB360_BASE_URL}/api/sessions/token`, {
      method: "GET",
      headers: { "Authorization": DB360_API_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
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
    console.log("[databox360] token obtido com sucesso");
    return token;
  } catch (err) {
    console.warn("[databox360] erro ao obter token:", String(err instanceof Error ? err.message : err));
    return null;
  }
}

// ─── Calcula período de referência do SCR ────────────────────────────────────
// Regra BCB: dados SCR do mês M ficam disponíveis por volta do dia 25 do mês M+1.
// Logo: dias 1-25 → usa M-2 (seguro); dias 26-31 → usa M-1 (disponível recentemente).
function calcularPeriodo(offset: number = 0): { mes: string; ano: string } {
  const hoje = new Date();
  const dia = hoje.getDate();
  const mesesAtras = (dia <= 25 ? 2 : 1) + offset;

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
  const faixasAVencer = {
    ate30d:            fmtBRL(carteira.carteiraVencerAte30diasVencidosAte14dias ?? 0),
    d31_60:            fmtBRL(carteira.carteiraVencer31a60dias   ?? 0),
    d61_90:            fmtBRL(carteira.carteiraVencer61a90dias   ?? 0),
    d91_180:           fmtBRL(carteira.carteiraVencer91a180dias  ?? 0),
    d181_360:          fmtBRL(carteira.carteiraVencer181a360dias ?? 0),
    acima360d:         fmtBRL(carteira.carteiraVencerAcima360dias ?? 0),
    prazoIndeterminado: fmtBRL(carteira.carteiraVencerPrazoIndeterminado ?? 0),
    total:             fmtBRL(carteiraVencer),
  };

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
    carteiraCurtoPrazo:  "—",
    carteiraLongoPrazo:  "—",
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
  const token = await getToken();
  if (!token) return null;

  const docNum = documento.replace(/\D/g, "");
  if (!docNum) return null;

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
    console.log(`[databox360] SCR ${docNum.slice(0, 4)}*** ${mes}/${ano} → ok`);
    return mapearSCRData(raw, docNum);
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

  const { mes: mesAtual, ano: anoAtual } = calcularPeriodo(0);
  const { mes: mesAnt,   ano: anoAnt   } = calcularPeriodo(1);

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

  const { mes: mesAtual, ano: anoAtual } = calcularPeriodo(0);
  const { mes: mesAnt,   ano: anoAnt   } = calcularPeriodo(1);

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
