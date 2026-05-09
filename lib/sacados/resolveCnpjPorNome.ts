// Resolver CNPJ a partir de razão social — POC para enriquecer sacados da
// Curva ABC quando o documento original não traz o CNPJ.
//
// Estratégia em camadas:
//   C1. Cache global (`bureau_cache` chave `name-resolve:<hash>`)
//   C2. publica.cnpj.ws ?q=NOME — gratuita, fonte oficial Receita Federal
//   C3. Gemini (fallback) — quando publica.cnpj.ws falha. Risco de
//       alucinação aceito pelo produto em 2026-05-09.

import { cacheGet, cacheSet } from "@/lib/bureaus/cache";
import { isLikelyCnpj, onlyDigits } from "./extractTopSacados";
import { nameSimilarity, normalizeCompanyName } from "./similarity";
import { resolveCnpjViaGemini, type GeminiResolveContext } from "./resolveCnpjGemini";

const CACHE_PREFIX = "name-resolve:";
const ACCEPT_THRESHOLD = 0.85;     // top1 precisa ter pelo menos este score
const AMBIGUITY_THRESHOLD = 0.75;  // se top2 >= isto, marca como ambíguo
const MAX_NAME_LEN = 60;
const FETCH_TIMEOUT_MS = 5000;
const PUBLICA_CNPJ_QUANT = 5;      // pega top 5 e desambigua localmente

export type ResolveSource = "cache" | "publica-cnpj-ws" | "gemini";
export type ResolveStatus =
  | "resolved"
  | "miss-not-found"
  | "miss-ambiguous"
  | "miss-low-score"
  | "miss-rate-limited"
  | "miss-error";

export interface ResolveResult {
  cnpj: string;            // "" se não resolveu
  status: ResolveStatus;
  source?: ResolveSource;
  score?: number;          // similaridade do match aceito
  candidates?: number;     // total de candidatos vistos (debug)
  resolvedName?: string;   // razão social oficial do CNPJ encontrado
}

interface CachedResolve {
  cnpj: string;
  status: ResolveStatus;
  score?: number;
  resolvedName?: string;
  /** Marca de tempo Unix ms — útil pra debug/análise. */
  ts: number;
}

interface PublicaCnpjEstabelecimento {
  cnpj?: string;
  cnpj_basico?: string;
  razao_social?: string;
  nome_fantasia?: string;
  uf?: string;
  estado?: { sigla?: string };
}

interface PublicaCnpjResponse {
  estabelecimentos?: PublicaCnpjEstabelecimento[];
}

function nameCacheKey(name: string): string {
  // Hash simples — basta ser determinístico. Não-cripto.
  const norm = normalizeCompanyName(name).slice(0, 80);
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) - h + norm.charCodeAt(i)) | 0;
  }
  return `${CACHE_PREFIX}${(h >>> 0).toString(16)}-${norm.slice(0, 32)}`;
}

/**
 * Tenta resolver `nomeEmpresa` para um CNPJ válido. UF do cedente é usada
 * apenas como tiebreaker quando há candidatos com score similar — nunca
 * filtra agressivamente, porque sacado pode ser de outro estado.
 */
export async function resolveCnpjPorNome(
  nomeEmpresa: string,
  opts: {
    ufCedente?: string;
    skipCache?: boolean;
    /** Contexto do cedente — usado APENAS no fallback Gemini. */
    geminiContext?: GeminiResolveContext;
  } = {}
): Promise<ResolveResult> {
  const nameTrimmed = (nomeEmpresa || "").trim();
  if (!nameTrimmed || nameTrimmed.length < 4) {
    return { cnpj: "", status: "miss-not-found" };
  }

  const cacheKey = nameCacheKey(nameTrimmed);

  // C1 — cache
  if (!opts.skipCache) {
    const cached = await cacheGet<CachedResolve>(cacheKey);
    if (cached) {
      console.log(
        `[cnpj-resolver] cache-hit name="${nameTrimmed.slice(0, 40)}" status=${cached.status} cnpj=${cached.cnpj || "—"}`
      );
      return {
        cnpj: cached.cnpj,
        status: cached.status,
        source: "cache",
        score: cached.score,
        resolvedName: cached.resolvedName,
      };
    }
  }

  // C2 — publica.cnpj.ws (fonte oficial)
  let result = await tryPublicaCnpjWs(nameTrimmed, opts.ufCedente);
  result.source = result.source ?? "publica-cnpj-ws";

  // C3 — Gemini fallback (só quando publica.cnpj.ws não resolveu).
  // RISCO: Gemini pode alucinar CNPJs. Aceito pelo produto em 2026-05-09.
  // Logs com prefix [cnpj-gemini] permitem auditoria batch posterior.
  if (result.status !== "resolved" && opts.geminiContext) {
    console.log(`[cnpj-resolver] tentando fallback Gemini para "${nameTrimmed.slice(0, 40)}"`);
    const g = await resolveCnpjViaGemini(nameTrimmed, opts.geminiContext);
    if (g.cnpj) {
      result = {
        cnpj: g.cnpj,
        status: "resolved",
        source: "gemini",
        candidates: 1,
      };
    }
  }

  // Cache resultado (sucesso e miss; cache.ts usa TTL fixo 24h pros dois)
  // Miss em cache também ajuda — evita martelar API no caso de nome impossível
  if (!opts.skipCache) {
    const toCache: CachedResolve = {
      cnpj: result.cnpj,
      status: result.status,
      score: result.score,
      resolvedName: result.resolvedName,
      ts: Date.now(),
    };
    await cacheSet(cacheKey, toCache);
  }

  console.log(
    `[cnpj-resolver] ${result.status} via=${result.source} name="${nameTrimmed.slice(0, 40)}"` +
      ` cnpj=${result.cnpj || "—"} score=${result.score?.toFixed(2) ?? "—"}` +
      ` candidates=${result.candidates ?? 0}`
  );
  return result;
}

async function tryPublicaCnpjWs(
  nome: string,
  ufCedente?: string
): Promise<ResolveResult> {
  const q = encodeURIComponent(nome.slice(0, MAX_NAME_LEN));
  const url = `https://publica.cnpj.ws/cnpj?q=${q}&quantidade=${PUBLICA_CNPJ_QUANT}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return {
      cnpj: "",
      status: "miss-error",
      candidates: 0,
    };
  }

  if (res.status === 429) {
    return { cnpj: "", status: "miss-rate-limited", candidates: 0 };
  }
  if (!res.ok) {
    return { cnpj: "", status: "miss-error", candidates: 0 };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { cnpj: "", status: "miss-error", candidates: 0 };
  }

  // API às vezes retorna { estabelecimentos: [...] }, às vezes array direto
  const arr: PublicaCnpjEstabelecimento[] = Array.isArray(payload)
    ? (payload as PublicaCnpjEstabelecimento[])
    : (payload as PublicaCnpjResponse)?.estabelecimentos ?? [];

  if (!Array.isArray(arr) || arr.length === 0) {
    return { cnpj: "", status: "miss-not-found", candidates: 0 };
  }

  // Calcula similaridade pra cada candidato
  const scored = arr
    .map((e) => {
      const cand = String(e.razao_social ?? e.nome_fantasia ?? "");
      const cnpj = onlyDigits(String(e.cnpj ?? e.cnpj_basico ?? ""));
      const uf = String(e.uf ?? e.estado?.sigla ?? "").toUpperCase();
      const score = nameSimilarity(nome, cand);
      return { cand, cnpj, uf, score };
    })
    .filter((c) => isLikelyCnpj(c.cnpj))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { cnpj: "", status: "miss-not-found", candidates: arr.length };
  }

  // UF como tiebreaker conservador: se top1 < threshold mas há candidato com
  // mesma UF do cedente E score >= threshold, usa esse.
  const topByUf = ufCedente
    ? scored.find((c) => c.uf === ufCedente.toUpperCase() && c.score >= ACCEPT_THRESHOLD)
    : undefined;
  const top1 = topByUf ?? scored[0];
  const top2 = scored.find((c) => c.cnpj !== top1.cnpj);

  if (top1.score < ACCEPT_THRESHOLD) {
    return {
      cnpj: "",
      status: "miss-low-score",
      candidates: scored.length,
      score: top1.score,
    };
  }
  if (top2 && top2.score >= AMBIGUITY_THRESHOLD) {
    return {
      cnpj: "",
      status: "miss-ambiguous",
      candidates: scored.length,
      score: top1.score,
    };
  }

  return {
    cnpj: top1.cnpj,
    status: "resolved",
    score: top1.score,
    candidates: scored.length,
    resolvedName: top1.cand,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Métricas em memória pra POC — caller pode logar agregado no fim do request.
// Reset a cada novo orquestrador (não persistente).
// ────────────────────────────────────────────────────────────────────────────

export interface ResolverMetrics {
  total: number;
  resolved: number;
  cacheHit: number;
  missNotFound: number;
  missAmbiguous: number;
  missLowScore: number;
  missRateLimited: number;
  missError: number;
}

export function emptyMetrics(): ResolverMetrics {
  return {
    total: 0,
    resolved: 0,
    cacheHit: 0,
    missNotFound: 0,
    missAmbiguous: 0,
    missLowScore: 0,
    missRateLimited: 0,
    missError: 0,
  };
}

export function recordMetric(m: ResolverMetrics, r: ResolveResult): void {
  m.total++;
  if (r.source === "cache" && r.status === "resolved") {
    m.cacheHit++;
    m.resolved++;
    return;
  }
  switch (r.status) {
    case "resolved": m.resolved++; break;
    case "miss-not-found": m.missNotFound++; break;
    case "miss-ambiguous": m.missAmbiguous++; break;
    case "miss-low-score": m.missLowScore++; break;
    case "miss-rate-limited": m.missRateLimited++; break;
    case "miss-error": m.missError++; break;
  }
}

export function formatMetrics(m: ResolverMetrics): string {
  if (m.total === 0) return "[cnpj-resolver] no resolution attempted";
  const hitRate = ((m.resolved / m.total) * 100).toFixed(1);
  return (
    `[cnpj-resolver] total=${m.total} resolved=${m.resolved} (${hitRate}%)` +
    ` cache=${m.cacheHit} not-found=${m.missNotFound}` +
    ` ambiguous=${m.missAmbiguous} low-score=${m.missLowScore}` +
    ` rate-limited=${m.missRateLimited} error=${m.missError}`
  );
}
