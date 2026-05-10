// Gera parágrafo interpretativo dos 15 indicadores financeiros via Gemini.
// Determinístico nos números (cálculo já foi feito), criativo só na análise
// textual: tendências, leitura de risco, observações curtas.
//
// Uso: chamado por /api/indicadores-analise. Cache no bureau_cache por hash
// dos indicadores (24h TTL). Falha silenciosa: se Gemini errar, retorna "".
//
// Adicionado em 2026-05-10 como Fase 4 do plano de Indicadores DRE.

import type { IndicadoresFinanceiros } from "./indicadoresFinanceiros";
import { cacheGet, cacheSet } from "@/lib/bureaus/cache";

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map((k) => k.trim()).filter(Boolean);
const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 15000;
const CACHE_PREFIX = "indicadores-analise:";

export interface InterpretarContexto {
  /** Razão social do cedente — ajuda a IA a contextualizar a análise. */
  razaoSocialCedente?: string;
  /** Ramo / CNAE — pra adaptar a leitura ao setor. */
  ramoCedente?: string;
}

/**
 * Hash determinístico dos indicadores pra chave de cache. Não-cripto;
 * basta ser estável pra mesma entrada gerar mesma chave.
 */
function hashIndicadores(ind: IndicadoresFinanceiros): string {
  const flat = ind.anos.map((a) => {
    return [a.ano, a.liquidezCorrente, a.liquidezSeca, a.roi, a.endividamentoTotal, a.cicloCaixa, a.despFinSobreResultadoOp].join("|");
  }).join("::");
  let h = 0;
  for (let i = 0; i < flat.length; i++) h = ((h << 5) - h + flat.charCodeAt(i)) | 0;
  return `${CACHE_PREFIX}${(h >>> 0).toString(16)}`;
}

function buildPrompt(ind: IndicadoresFinanceiros, ctx: InterpretarContexto): string {
  const linhasTabela = ind.anos.map((a) => {
    const fmt = (v: number | null) => v == null ? "—" : v.toString();
    return [
      `  ${a.ano}:`,
      `    Liquidez Corrente: ${fmt(a.liquidezCorrente)}`,
      `    Liquidez Seca: ${fmt(a.liquidezSeca)}`,
      `    Liquidez Geral: ${fmt(a.liquidezGeral)}`,
      `    Capital de Giro Líquido: ${fmt(a.capitalGiroLiquido)} (R$)`,
      `    Receita Média Líquida: ${fmt(a.receitaMediaLiquida)} (R$)`,
      `    ROI: ${fmt(a.roi)} (%)`,
      `    PMR / PME / PMP: ${fmt(a.pmr)} / ${fmt(a.pme)} / ${fmt(a.pmp)} (dias)`,
      `    Ciclo de Caixa: ${fmt(a.cicloCaixa)} (dias)`,
      `    Endividamento Total: ${fmt(a.endividamentoTotal)}`,
      `    Dívida ÷ PL: ${fmt(a.dividaPL)}`,
      `    Participação de Terceiros: ${fmt(a.participacaoTerceiros)}`,
      `    Despesa Financeira: ${fmt(a.despesaFinanceira)} (R$)`,
      `    Despfin ÷ Resultado Op.: ${fmt(a.despFinSobreResultadoOp)} (%)`,
    ].join("\n");
  }).join("\n\n");

  return [
    "Você é analista de crédito sênior.",
    "Sua tarefa: escrever 1 parágrafo (≤150 palavras) interpretando os indicadores financeiros abaixo.",
    "",
    "Contexto da empresa:",
    `- Razão social: ${ctx.razaoSocialCedente ?? "(não informada)"}`,
    `- Ramo: ${ctx.ramoCedente ?? "(não informado)"}`,
    "",
    "Indicadores por ano:",
    linhasTabela,
    "",
    "Foco da análise (na ordem):",
    "1. Tendência de liquidez — corrente, seca, geral",
    "2. Endividamento — nível e composição (Dívida÷PL, terceiros)",
    "3. Eficiência de capital de giro — PMR, PME, PMP, ciclo de caixa",
    "4. Rentabilidade — ROI",
    "5. Pressão financeira — despesa financeira sobre resultado operacional",
    "",
    "REGRAS:",
    "- Use APENAS os dados fornecidos. Nunca invente número.",
    "- Tom analítico e direto, sem floreios. Português Brasil.",
    "- Cite no máximo 3-4 indicadores no parágrafo (os mais relevantes).",
    "- Não mencione faixas ideais genéricas (\"liquidez ideal é >1\"). Foque em o que ESTES números dizem dessa empresa.",
    "- Não use bullet points. Um parágrafo corrido.",
    "- Não use markdown. Texto puro.",
    "- Se há tendência clara (melhora ou piora), sinalize.",
    "- ≤150 palavras.",
  ].join("\n");
}

/**
 * Gera o parágrafo. Retorna "" em qualquer falha (timeout, sem chave,
 * resposta inválida) — caller renderiza só a tabela sem interpretação.
 */
export async function interpretarIndicadoresFinanceiros(
  ind: IndicadoresFinanceiros,
  ctx: InterpretarContexto = {},
  opts: { skipCache?: boolean } = {},
): Promise<string> {
  if (!ind.anos.length) return "";
  if (GEMINI_API_KEYS.length === 0) {
    console.warn("[indicadores-analise] sem GEMINI_API_KEY configurada");
    return "";
  }

  const cacheKey = hashIndicadores(ind);

  if (!opts.skipCache) {
    const cached = await cacheGet<{ texto: string; ts: number }>(cacheKey);
    if (cached?.texto) {
      console.log(`[indicadores-analise] cache-hit hash=${cacheKey.slice(-8)}`);
      return cached.texto;
    }
  }

  const prompt = buildPrompt(ind, ctx);
  const apiKey = GEMINI_API_KEYS[0];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 400,
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      console.warn(`[indicadores-analise] HTTP ${res.status}`);
      return "";
    }

    const json = (await res.json()) as Record<string, unknown>;
    const candidates = (json.candidates as Array<Record<string, unknown>>) ?? [];
    const text = ((candidates[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>)?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) return "";

    const limpo = text.trim().replace(/^[*#\s>-]+/, "").replace(/\s+/g, " ");
    if (!opts.skipCache) {
      await cacheSet(cacheKey, { texto: limpo, ts: Date.now() });
    }
    console.log(`[indicadores-analise] gerado ${limpo.length} chars`);
    return limpo;
  } catch (err) {
    clearTimeout(tid);
    console.warn(`[indicadores-analise] erro: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}
