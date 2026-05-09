// Consulta CreditHub + BDC para os top sacados PJ da Curva ABC e calcula
// vínculos com o cedente. Cache de 24h por CNPJ via bureau_cache.
//
// Estratégia:
//   1. Para cada sacado, paraleliza CH + BDC empresa (ambos sempre — chefe pediu
//      explicitamente "tanto CreditHub quanto BigData"). NÃO segue o padrão
//      CreditHub-first (ADR-011) porque os dois trazem dados complementares
//      úteis no cruzamento (CH = QSA/score; BDC = relationships/processos).
//   2. Depois do BDC empresa, extrai CPFs dos sócios PF do sacado e dispara
//      consultarBDCSocios para pegar `motherName` (necessário pro matcher
//      de mãe comum).
//   3. Cache `sacado:<cnpj>` 24h reaproveita entre análises.

import type {
  SacadoAnalisado,
  SacadoSocio,
  VinculosSacado,
  ProtestosData,
  ProcessosData,
} from "@/types";
import { consultarCreditHub, type CreditHubResult } from "@/lib/bureaus/credithub";
import {
  consultarEmpresa as consultarBigDataCorpEmpresa,
  consultarSocios as consultarBigDataCorpSocios,
  type BigDataCorpResult,
  type BigDataCorpSocioData,
} from "@/lib/bureaus/bigdatacorp";
import {
  consultarEmpresa as consultarAssertivaEmpresa,
  type AssertivaResult,
} from "@/lib/bureaus/assertiva";
import { cacheGet, cacheSet } from "@/lib/bureaus/cache";
import { calcularVinculos, type SocioComMae } from "./matchVinculos";
import { onlyDigits, type TopSacadoEntry } from "./extractTopSacados";
import {
  resolveCnpjPorNome,
  emptyMetrics,
  recordMetric,
  formatMetrics,
} from "./resolveCnpjPorNome";

// ────────────────────────────────────────────────────────────────────────────
// Helpers de extração
// ────────────────────────────────────────────────────────────────────────────

// UFs válidas do Brasil (27) — usadas pra validar o match e evitar capturar
// quaisquer 2 letras maiúsculas como "UF".
const UFS_BR = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/** Extrai UF de uma string de endereço. Retorna undefined se não achou. */
export function extractUFFromEndereco(endereco: string | undefined): string | undefined {
  if (!endereco) return undefined;
  // procura todas as ocorrências de 2 letras maiúsculas isoladas e devolve a
  // PRIMEIRA que estiver na lista de UFs reais. "BR-101 ... /SP" → "SP".
  const re = /(?:[\s\-/,(])([A-Z]{2})(?:[\s,)\-/]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(endereco)) !== null) {
    const candidate = m[1];
    if (UFS_BR.has(candidate)) return candidate;
  }
  return undefined;
}

/** Soma protestos vigentes em qtd + valor (formato BR). */
function summarizeProtestos(p: ProtestosData | undefined): { qtd: number; valor?: string } {
  if (!p) return { qtd: 0 };
  const qtd = parseInt(String(p.vigentesQtd ?? "0").replace(/\D/g, ""), 10) || 0;
  const valor = p.vigentesValor && p.vigentesValor !== "R$ 0,00" ? p.vigentesValor : undefined;
  return { qtd, valor };
}

/** Resumo de processos para o card do sacado. */
function summarizeProcessos(p: ProcessosData | undefined): { passivos: number; valorTotal?: string } {
  if (!p) return { passivos: 0 };
  const passivos =
    parseInt(String(p.passivosTotal ?? "0").replace(/\D/g, ""), 10) ||
    parseInt(String(p.poloPassivoQtd ?? "0").replace(/\D/g, ""), 10) ||
    0;
  const valorTotal =
    p.valorTotalEstimado && p.valorTotalEstimado !== "R$ 0,00" ? p.valorTotalEstimado : undefined;
  return { passivos, valorTotal };
}

/** Top 10 protestos individuais para detalhamento na pág 9 do PDF. */
function listProtestos(p: ProtestosData | undefined): NonNullable<SacadoAnalisado["protestosDetalhes"]> {
  if (!p?.detalhes?.length) return [];
  return p.detalhes.slice(0, 10).map((d) => ({
    data: d.data || "",
    credor: d.credor || "",
    valor: d.valor || "",
    cidade: d.municipio || undefined,
    uf: d.uf || undefined,
    regularizado: !!d.regularizado,
  }));
}

/** Top 10 processos individuais (junta bancarios + fiscais + fornecedores + outros). */
function listProcessos(p: ProcessosData | undefined): NonNullable<SacadoAnalisado["processosDetalhes"]> {
  if (!p) return [];
  const all = [
    ...(p.bancarios ?? []).map((x) => ({ ...x, tipo: "BANCÁRIO", contraparte: x.banco || "—" })),
    ...(p.fiscais ?? []).map((x) => ({ ...x, tipo: "FISCAL" })),
    ...(p.fornecedores ?? []).map((x) => ({ ...x, tipo: "FORNECEDOR" })),
    ...(p.outros ?? []).map((x) => ({ ...x, tipo: "OUTROS" })),
  ];
  // Ordena por valor descendente quando possível (parse defensivo)
  const parseV = (s: string) => Number(String(s ?? "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
  all.sort((a, b) => parseV(b.valor || "") - parseV(a.valor || ""));
  return all.slice(0, 10).map((x) => ({
    data: x.data || "",
    contraparte: ("contraparte" in x ? x.contraparte : "") || "—",
    valor: x.valor || "",
    status: x.status || undefined,
    tipo: x.tipo,
  }));
}

/** Razão social do sacado: BDC > CH (CH não traz razão social diretamente). */
function pickRazaoSocial(
  fallback: string,
  bdc: BigDataCorpResult | undefined,
  ch: CreditHubResult | undefined
): string {
  const bdcRazao = bdc?.cnpjEnrichment?.razaoSocial;
  if (bdcRazao && bdcRazao.trim()) return bdcRazao.trim();
  // CreditHub não tem razão social no enrichment — mantém fallback (nome da Curva ABC)
  void ch; // silencia eslint
  return fallback;
}

/**
 * Extrai sócios do sacado. Combina CH + BDC; CH costuma estar mais completo,
 * BDC entra quando CH veio vazio.
 */
function pickSocios(
  bdc: BigDataCorpResult | undefined,
  ch: CreditHubResult | undefined
): SacadoSocio[] {
  const fromCh = (ch?.qsaEnrichment?.quadroSocietario ?? []).map((s) => ({
    nome: s.nome,
    cpf: onlyDigits(s.cpfCnpj),
    participacao: s.participacao || undefined,
  }));
  if (fromCh.length > 0) return fromCh;
  const fromBdc = (bdc?.qsaEnrichment?.quadroSocietario ?? []).map((s) => ({
    nome: s.nome,
    cpf: onlyDigits(s.cpfCnpj),
    participacao: s.participacao || undefined,
  }));
  return fromBdc;
}

/** Endereço completo: prefere CH, BDC fallback. */
function pickEndereco(
  bdc: BigDataCorpResult | undefined,
  ch: CreditHubResult | undefined
): string | undefined {
  return ch?.cnpjEnrichment?.endereco || bdc?.cnpjEnrichment?.endereco || undefined;
}

/** Determina fonte (CH/BDC/ambos) para auditoria. Assertiva entra à parte. */
function determineFonte(
  ch: CreditHubResult | undefined,
  bdc: BigDataCorpResult | undefined
): "credithub" | "bdc" | "ambos" | undefined {
  const chOk = !!ch?.success && !ch.mock;
  const bdcOk = !!bdc?.success && !bdc.mock;
  if (chOk && bdcOk) return "ambos";
  if (chOk) return "credithub";
  if (bdcOk) return "bdc";
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Mapeamento puro (testável com fixtures)
// ────────────────────────────────────────────────────────────────────────────

export interface MapearSacadoInput {
  topSacado: TopSacadoEntry;
  ch: CreditHubResult | undefined;
  bdc: BigDataCorpResult | undefined;
  /** Quando ausente, score/scoreClasse ficam undefined. */
  assertiva?: AssertivaResult | undefined;
}

export type SacadoMapeado = Omit<SacadoAnalisado, "vinculos">;

/**
 * Função pura: mapeia respostas dos bureaus para SacadoAnalisado (sem vínculos).
 * Não consulta nada — recebe os resultados prontos.
 */
export function mapearSacado(input: MapearSacadoInput): SacadoMapeado {
  const { topSacado, ch, bdc, assertiva } = input;
  const protestosFonte = ch?.protestos ?? bdc?.protestos;
  const processosFonte = ch?.processos ?? bdc?.processos;
  const protestos = summarizeProtestos(protestosFonte);
  const processos = summarizeProcessos(processosFonte);
  const protestosDetalhes = listProtestos(protestosFonte);
  const processosDetalhes = listProcessos(processosFonte);
  const enderecoCompleto = pickEndereco(bdc, ch);
  const uf = extractUFFromEndereco(enderecoCompleto);
  const fonteBureau = determineFonte(ch, bdc);
  // Score PJ vem do Assertiva (`resposta.score.pontos`). CreditHub `/simples`
  // não devolve score numérico hoje.
  const score = assertiva?.empresa?.scoreAssertivaPJ;
  const scoreClasse = assertiva?.empresa?.scoreClasse;

  return {
    cnpj: topSacado.cnpj,
    razaoSocial: pickRazaoSocial(topSacado.razaoSocial, bdc, ch),
    posicao: topSacado.posicao,
    participacaoFaturamentoPct: topSacado.participacaoFaturamentoPct,
    valorFaturado: topSacado.valorFaturado,
    classe: topSacado.classe,
    socios: pickSocios(bdc, ch),
    enderecoCompleto,
    uf,
    score: typeof score === "number" && score > 0 ? score : undefined,
    scoreClasse: scoreClasse || undefined,
    protestosQtd: protestos.qtd,
    protestosValorTotal: protestos.valor,
    protestosDetalhes: protestosDetalhes.length > 0 ? protestosDetalhes : undefined,
    processosPassivos: processos.passivos,
    processosValorTotal: processos.valorTotal,
    processosDetalhes: processosDetalhes.length > 0 ? processosDetalhes : undefined,
    fonteBureau,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Consulta de um sacado individual (com cache)
// ────────────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = "sacado:";

interface SacadoCachedData {
  mapeado: SacadoMapeado;
  sociosComMae: SocioComMae[];
}

export interface ConsultarSacadoOpts {
  /** Pula cache (útil em tests + debug). */
  skipCache?: boolean;
}

/**
 * Consulta CH + BDC para um único sacado e devolve mapeamento + sócios com mãe.
 * NÃO calcula vínculos — isso é responsabilidade do orquestrador que tem o
 * contexto do cedente.
 */
export async function consultarSacado(
  topSacado: TopSacadoEntry,
  opts: ConsultarSacadoOpts = {}
): Promise<SacadoCachedData> {
  const cnpj = topSacado.cnpj;
  const cacheKey = `${CACHE_PREFIX}${cnpj}`;

  if (!opts.skipCache) {
    const cached = await cacheGet<SacadoCachedData>(cacheKey);
    if (cached) {
      console.log(`[sacados] cache HIT ${cnpj}`);
      return cached;
    }
  }

  console.log(`[sacados] consultando ${cnpj} (CH + BDC + Assertiva paralelo)`);
  const [chRes, bdcRes, assRes] = await Promise.allSettled([
    consultarCreditHub(cnpj),
    consultarBigDataCorpEmpresa(cnpj),
    consultarAssertivaEmpresa(cnpj),
  ]);

  const ch = chRes.status === "fulfilled" ? chRes.value : undefined;
  const bdc = bdcRes.status === "fulfilled" ? bdcRes.value : undefined;
  const assertiva = assRes.status === "fulfilled" ? assRes.value : undefined;

  // Extrai CPFs dos sócios PF do sacado (preferência CH; BDC se CH vazio)
  const sociosPJ = ch?.qsaEnrichment?.quadroSocietario ?? bdc?.qsaEnrichment?.quadroSocietario ?? [];
  const cpfsPF = sociosPJ
    .map((s) => onlyDigits(s.cpfCnpj))
    .filter((cpf) => cpf.length === 11)
    .filter((cpf, i, arr) => arr.indexOf(cpf) === i); // dedup

  // BDC /pessoas — pega motherName (necessário p/ matcher de mãe comum)
  let sociosBdcDetalhe: BigDataCorpSocioData[] = [];
  if (cpfsPF.length > 0) {
    try {
      const r = await consultarBigDataCorpSocios(cpfsPF);
      sociosBdcDetalhe = r.socios;
    } catch (err) {
      console.warn(`[sacados] BDC sócios falhou para ${cnpj}:`, err instanceof Error ? err.message : err);
    }
  }

  const sociosComMae: SocioComMae[] = sociosBdcDetalhe.map((s) => ({
    nome: s.nome,
    cpf: onlyDigits(s.cpf),
    motherName: s.motherName,
  }));

  const mapeado = mapearSacado({ topSacado, ch, bdc, assertiva });
  const data: SacadoCachedData = { mapeado, sociosComMae };

  if (!opts.skipCache && (ch?.success || bdc?.success || assertiva?.success)) {
    await cacheSet(cacheKey, data);
  }
  return data;
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestrador: consulta os top sacados + calcula vínculos com o cedente
// ────────────────────────────────────────────────────────────────────────────

export interface ConsultarSacadosAnalisadosInput {
  topSacados: TopSacadoEntry[];
  cedente: {
    sociosCedente: Array<{ nome: string; cpf?: string; cpfCnpj?: string }>;
    ufCedente?: string;
    enderecoCedente?: string;
    /** Sócios do cedente com motherName (vindo do BDC `/pessoas`). */
    sociosCedenteComMae?: SocioComMae[];
    /** Razão social, ramo e cidade — usados como contexto pro Gemini fallback. */
    razaoSocialCedente?: string;
    ramoCedente?: string;
    cidadeCedente?: string;
  };
  /** Pula cache em todas as consultas — uso em tests + debug. */
  skipCache?: boolean;
  /**
   * POC: tenta resolver CNPJ por razão social para sacados que vieram da
   * Curva ABC sem CNPJ. Resolução é sequencial (rate limit publica.cnpj.ws).
   * Default: false (mantém comportamento legado — sacados sem CNPJ não
   * passam por aqui porque `extractTopSacados` os descarta a menos que
   * `includeWithoutCnpj` esteja ligado).
   */
  resolveCnpjFromName?: boolean;
}

/**
 * Consulta os top sacados em paralelo e devolve SacadoAnalisado[] com vínculos
 * calculados contra o cedente. Sacado com falha total nos dois bureaus é
 * descartado (sem dados, sem vínculo a calcular).
 */
export async function consultarSacadosAnalisados(
  input: ConsultarSacadosAnalisadosInput
): Promise<SacadoAnalisado[]> {
  if (!input.topSacados?.length) return [];

  // ── Pré-passo POC: resolver CNPJ por razão social ──
  // Sequencial pra respeitar rate limit gratuito do publica.cnpj.ws (~3req/s).
  // Sacados que não resolvem ficam com cnpj="" e serão descartados na consulta.
  let topSacados = input.topSacados;
  if (input.resolveCnpjFromName) {
    const semCnpj = input.topSacados.filter((s) => !s.cnpj || s.cnpj.length !== 14);
    if (semCnpj.length > 0) {
      const metrics = emptyMetrics();
      const resolvedMap = new Map<string, string>(); // razaoSocial → cnpj
      for (const s of semCnpj) {
        const r = await resolveCnpjPorNome(s.razaoSocial, {
          ufCedente: input.cedente.ufCedente,
          skipCache: input.skipCache,
          geminiContext: {
            razaoSocialCedente: input.cedente.razaoSocialCedente,
            ufCedente: input.cedente.ufCedente,
            ramoCedente: input.cedente.ramoCedente,
            cidadeCedente: input.cedente.cidadeCedente,
          },
        });
        recordMetric(metrics, r);
        if (r.cnpj) resolvedMap.set(s.razaoSocial, r.cnpj);
      }
      console.log(formatMetrics(metrics));
      topSacados = input.topSacados.map((s) => {
        if (s.cnpj && s.cnpj.length === 14) return s;
        const resolved = resolvedMap.get(s.razaoSocial);
        return resolved ? { ...s, cnpj: resolved } : s;
      });
    }
  }

  // Filtra sacados que ainda não têm CNPJ resolvido — não tem como consultar
  // bureau sem documento. Eles aparecerão na tabela ABC da UI mas sem dados
  // enriquecidos (igual ao comportamento atual quando o documento original
  // já não tinha CNPJ).
  const consultaveis = topSacados.filter((s) => s.cnpj && s.cnpj.length === 14);
  if (consultaveis.length === 0) return [];

  const results = await Promise.allSettled(
    consultaveis.map((s) =>
      consultarSacado(s, { skipCache: input.skipCache })
    )
  );

  const out: SacadoAnalisado[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled") {
      console.warn(`[sacados] consulta falhou ${consultaveis[i].cnpj}:`, r.reason);
      continue;
    }
    const { mapeado, sociosComMae } = r.value;
    // Se nenhum bureau retornou nada útil, descarta — incluir um sacado vazio
    // só polui o relatório.
    if (!mapeado.fonteBureau && mapeado.socios.length === 0) {
      console.log(`[sacados] descartado ${mapeado.cnpj} — sem dados nos bureaus`);
      continue;
    }

    const vinculos: VinculosSacado = calcularVinculos({
      sociosCedente: input.cedente.sociosCedente,
      sociosSacado: mapeado.socios,
      ufCedente: input.cedente.ufCedente,
      ufSacado: mapeado.uf,
      enderecoCedente: input.cedente.enderecoCedente,
      enderecoSacado: mapeado.enderecoCompleto,
      sociosCedenteComMae: input.cedente.sociosCedenteComMae,
      sociosSacadoComMae: sociosComMae,
    });

    out.push({ ...mapeado, vinculos });
  }
  return out;
}
