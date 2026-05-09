// Fallback Gemini do resolver de CNPJ — POC.
//
// IMPORTANTE: Gemini pode alucinar CNPJs. Esta camada é DELIBERADAMENTE sem
// validação posterior porque foi essa a decisão do produto (2026-05-09). Se
// um CNPJ alucinado vier daqui, ele entra no pipeline de bureau e os dados
// retornados serão de uma empresa diferente da real. Use o log abaixo
// (prefix [cnpj-gemini]) para auditoria batch dos resolves.

import { isLikelyCnpj, onlyDigits } from "./extractTopSacados";

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map((k) => k.trim()).filter(Boolean);

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 12000;

export interface GeminiResolveContext {
  /** Razão social do cedente — ajuda o Gemini ancorar mercado/região. */
  razaoSocialCedente?: string;
  /** UF do cedente — heurística pra UF do sacado. */
  ufCedente?: string;
  /** CNAE / ramo do cedente — pra desambiguar empresas com nome similar. */
  ramoCedente?: string;
  /** Cidade do cedente, se conhecida. */
  cidadeCedente?: string;
}

export interface GeminiResolveResult {
  cnpj: string;          // "" se Gemini não retornou ou alucinou um CNPJ inválido
  modelUsed?: string;
  rawAnswer?: string;    // pra auditoria
}

function buildPrompt(nome: string, ctx: GeminiResolveContext): string {
  const linhas = [
    "Sua tarefa: encontrar o CNPJ (14 dígitos) de uma empresa cliente do nosso cedente.",
    "",
    "Contexto:",
    `- Nosso cedente: ${ctx.razaoSocialCedente ?? "(não informado)"}`,
    `- UF do cedente: ${ctx.ufCedente ?? "(não informado)"}`,
    `- Cidade do cedente: ${ctx.cidadeCedente ?? "(não informado)"}`,
    `- Ramo do cedente: ${ctx.ramoCedente ?? "(não informado)"}`,
    "",
    "Procure o CNPJ desta empresa cliente:",
    `  "${nome}"`,
    "",
    "Heurística: clientes do cedente provavelmente são empresas geograficamente próximas (mesma UF ou UFs vizinhas) e do ramo afim. Se houver múltiplos CNPJs com nome similar, prefira o que faz sentido nesse contexto.",
    "",
    "REGRAS DE RESPOSTA:",
    "1. Se você TEM CERTEZA do CNPJ, retorne JSON: {\"cnpj\": \"NNNNNNNNNNNNNN\"}  (14 dígitos, sem pontuação)",
    "2. Se você não souber ou tiver dúvida, retorne: {\"cnpj\": null}",
    "3. NÃO INVENTE CNPJs. Preferir null a chutar.",
    "4. Resposta deve ser APENAS o JSON, sem markdown, sem explicação.",
  ];
  return linhas.join("\n");
}

export async function resolveCnpjViaGemini(
  nome: string,
  ctx: GeminiResolveContext,
): Promise<GeminiResolveResult> {
  if (!nome || nome.trim().length < 4) return { cnpj: "" };
  if (GEMINI_API_KEYS.length === 0) {
    console.warn("[cnpj-gemini] sem GEMINI_API_KEY configurada");
    return { cnpj: "" };
  }

  const prompt = buildPrompt(nome.trim(), ctx);
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
          temperature: 0.1,         // baixa criatividade — queremos resposta factual
          responseMimeType: "application/json",
          maxOutputTokens: 64,
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      console.warn(`[cnpj-gemini] HTTP ${res.status} para "${nome.slice(0, 40)}"`);
      return { cnpj: "" };
    }

    const json = (await res.json()) as Record<string, unknown>;
    const candidates = (json.candidates as Array<Record<string, unknown>>) ?? [];
    const text =
      ((candidates[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>)?.[0]?.text;
    if (typeof text !== "string") {
      console.warn(`[cnpj-gemini] resposta sem texto para "${nome.slice(0, 40)}"`);
      return { cnpj: "" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // fallback — tenta extrair 14 dígitos da resposta
      const m = text.match(/\d{14}/);
      if (m) parsed = { cnpj: m[0] };
      else parsed = null;
    }

    const cnpjRaw = (parsed as { cnpj?: unknown })?.cnpj;
    const cnpj = typeof cnpjRaw === "string" ? onlyDigits(cnpjRaw) : "";
    if (!isLikelyCnpj(cnpj)) {
      console.log(`[cnpj-gemini] miss "${nome.slice(0, 40)}" — Gemini disse ${JSON.stringify(parsed)}`);
      return { cnpj: "", modelUsed: MODEL, rawAnswer: text };
    }

    console.log(`[cnpj-gemini] resolved "${nome.slice(0, 40)}" → ${cnpj}`);
    return { cnpj, modelUsed: MODEL, rawAnswer: text };
  } catch (err) {
    clearTimeout(tid);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cnpj-gemini] erro "${nome.slice(0, 40)}": ${msg}`);
    return { cnpj: "" };
  }
}
