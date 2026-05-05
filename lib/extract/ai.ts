/**
 * Clientes de IA para extração de documentos.
 *
 * Provedor primário: Gemini (Google) — melhor qualidade.
 * Fallback: OpenRouter (free tier — rotação de modelos comunitários).
 *
 * `callAI` é o ponto de entrada público:
 *   1. Tenta Gemini com rotação de chaves (GEMINI_API_KEYS) e modelos
 *      (Flash → Flash Lite → Pro como fallback).
 *   2. Para PDFs > 500KB usa Gemini Files API (fileUri) em vez de inline base64.
 *   3. Em caso de falha, cai para OpenRouter SE conteúdo for puramente textual
 *      (OpenRouter free não suporta inline image/PDF).
 *
 * `GEMINI_API_KEYS` é exportado pra route.ts checar configuração antes
 * de aceitar a request (evita 500 desnecessário no caller).
 */

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
export const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

// Flash 2.5 primário (mais rápido, cabe no timeout 60s do Hobby plan), Pro como fallback.
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];

const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS = ["google/gemini-2.5-flash-preview:free", "google/gemini-2.0-flash-exp:free", "meta-llama/llama-4-maverick:free"];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}
// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Gemini Files API — upload para fileUri (evita inline base64 para PDFs grandes)
// ─────────────────────────────────────────
async function uploadToGeminiFiles(buffer: Buffer, mimeType: string, displayName: string, apiKey: string, timeoutMs = 10000): Promise<string> {
  const boundary = "cap_gemini_boundary_x7z";
  const metaJson = JSON.stringify({ file: { display_name: displayName } });
  // Google Files API exige X-Goog-Upload-Protocol: multipart e dados em base64 com Content-Transfer-Encoding
  const base64Data = buffer.toString("base64");
  const body = [
    `--${boundary}`,
    `Content-Type: application/json; charset=utf-8`,
    ``,
    metaJson,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Data,
    `--${boundary}--`,
  ].join("\r\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "X-Goog-Upload-Protocol": "multipart",
        },
        body,
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Gemini Files API ${response.status}: ${txt.substring(0, 200)}`);
    }
    const result = await response.json();
    const fileUri = result?.file?.uri;
    if (!fileUri) throw new Error("Gemini Files API não retornou fileUri");
    return fileUri as string;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gemini Files API timeout (${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Tenta upload com rotação de chaves: percorre todas as GEMINI_API_KEYS até uma funcionar.
async function uploadToGeminiFilesWithRotation(buffer: Buffer, mimeType: string, displayName: string): Promise<string> {
  if (GEMINI_API_KEYS.length === 0) throw new Error("GEMINI_API_KEYS não configurada");
  const startIdx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
  const rotated = [...GEMINI_API_KEYS.slice(startIdx), ...GEMINI_API_KEYS.slice(0, startIdx)];
  let lastErr: unknown = null;
  for (const apiKey of rotated) {
    try {
      const t0 = Date.now();
      const fileUri = await uploadToGeminiFiles(buffer, mimeType, displayName, apiKey, 10000);
      console.log(`[extract] Files API upload OK key=${apiKey.substring(0, 8)} (${Date.now() - t0}ms)`);
      return fileUri;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[extract] Files API upload falhou key=${apiKey.substring(0, 8)}: ${msg}`);
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Todas as chaves Gemini falharam no Files API upload");
}

async function callGemini(prompt: string, content: string | { mimeType: string; base64: string } | { mimeType: string; fileUri: string }, maxOutputTokens = 2048, thinkingBudget = 0, perAttemptMsOverride = 0): Promise<string> {
  // Estrutura otimizada para o caching implicito do Gemini 2.5:
  // o PROMPT (estatico, ~400 linhas no CONTRATO) vai PRIMEIRO em uma part isolada,
  // e o conteudo dinamico vai depois. Quando a mesma extracao se repete (mesmo
  // prompt = mesmo prefixo), o Gemini aplica desconto de ~70-90% em input tokens
  // automaticamente, sem precisar de cached content endpoint.
  type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; fileData?: { mimeType: string; fileUri: string } };
  const parts: Array<GeminiPart> = [];
  parts.push({ text: prompt });
  if (typeof content === "string") {
    parts.push({ text: "\n\n--- DOCUMENTO ---\n\n" + content });
  } else if ("fileUri" in content) {
    parts.push({ fileData: { mimeType: content.mimeType, fileUri: content.fileUri } });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
  }

  const startIdx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
  const rotatedKeys = [...GEMINI_API_KEYS.slice(startIdx), ...GEMINI_API_KEYS.slice(0, startIdx)];
  // Hobby plan: 52s outer timeout. Para binário: 1 tentativa × 40s = 40s + upload (~8s) = 48s, cabe.
  // Texto: 1 tentativa × 20s ou 2 × 15s para pequeno (cabe em 52s).
  // perAttemptMsOverride > 0: docType pediu timeout maior (ex: ir_socio → 30s) — usa 1 tentativa.
  const isBinaryContent = typeof content === "object";
  const isLargeContent  = typeof content === "string" && content.length > 20000;
  const MAX_ATTEMPTS = perAttemptMsOverride > 0 ? 1 : (isBinaryContent ? 1 : 2);
  const perAttemptMs  = perAttemptMsOverride > 0 ? perAttemptMsOverride : (isBinaryContent ? 40000 : isLargeContent ? 20000 : 15000);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  keyLoop: for (const apiKey of rotatedKeys) {
    for (const model of GEMINI_MODELS) {
      // flash-lite rejeita thinkingBudget entre 1-511 com HTTP 400 — pular modelo e usar o próximo
      if (model.includes("lite") && thinkingBudget > 0 && thinkingBudget < 512) continue;
      // gemini-2.5-pro rejeita thinkingBudget=0 — exige thinking mode obrigatório
      const effectiveBudget = (model.includes("2.5-pro") && thinkingBudget === 0) ? 1024 : thinkingBudget;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const t0 = Date.now();
        try {
          const contentSize = typeof content === "string" ? `${content.length}c` : ("base64" in content ? `${(content.base64.length / 1024).toFixed(0)}KB-b64` : `fileUri`);
          console.log(`[Gemini] key=${apiKey.substring(0, 8)}... model=${model} attempt=${attempt + 1}/${MAX_ATTEMPTS} payload=${contentSize} timeout=${perAttemptMs}ms`);
          const controller = new AbortController();
          const fetchTimeout = setTimeout(() => controller.abort(), perAttemptMs);
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens,
                responseMimeType: "application/json",
                ...((model.includes("2.5") || model.includes("3.")) ? {
                  thinkingConfig: {
                    thinkingBudget: effectiveBudget,
                  },
                } : {}),
              },
            }),
          });
          clearTimeout(fetchTimeout);

          // 403: chave inválida/vazada — não adianta tentar outros modelos, pula para próxima chave
          if (response.status === 403) {
            const body = await response.text();
            console.error(`[Gemini] HTTP 403 key=${apiKey.substring(0, 8)} — chave revogada/vazada, skip key:`, body.substring(0, 200));
            continue keyLoop;
          }

          // 503: servidor fora — não adianta retry, pula modelo imediatamente
          if (response.status === 503) {
            console.log(`[Gemini] HTTP 503 key=${apiKey.substring(0, 8)} model=${model} — skip`);
            break;
          }
          // 429: rate limit — vale esperar e tentar de novo
          if (response.status === 429) {
            if (attempt < MAX_ATTEMPTS - 1) {
              const backoffMs = 3000 * Math.pow(2, attempt);
              console.log(`[Gemini] HTTP 429 key=${apiKey.substring(0, 8)} model=${model}, backoff ${backoffMs}ms`);
              await sleep(backoffMs);
              continue;
            }
            break;
          }

          // 404: modelo nao existe — nao adianta retry, pula direto
          if (response.status === 404) {
            console.error(`[Gemini] HTTP 404 model=${model} — modelo invalido, skip`);
            break;
          }

          if (!response.ok) {
            const body = await response.text();
            console.error(`[Gemini] HTTP ${response.status}:`, body.substring(0, 300));
            break;
          }

          const result = await response.json();
          // gemini-2.5-flash pode retornar "thinking" parts - pegar a última text part (não thought)
          const parts2 = result?.candidates?.[0]?.content?.parts || [];
          const textPart = [...parts2].reverse().find((p: { text?: string; thought?: boolean }) => p.text && !p.thought);
          const text = textPart?.text || parts2?.[parts2.length - 1]?.text || parts2?.[0]?.text;
          if (!text) {
            console.error(`[Gemini] Empty response after ${Date.now() - t0}ms, parts:`, JSON.stringify(parts2).substring(0, 200));
            break;
          }
          console.log(`[Gemini] OK model=${model} ${Date.now() - t0}ms ${text.length} chars`);
          return text;
        } catch (err) {
          // AbortError (timeout) e erros de rede: retry uma vez
          const isAbort = err instanceof Error && err.name === "AbortError";
          if (isAbort && attempt < MAX_ATTEMPTS - 1) {
            console.warn(`[Gemini] timeout key=${apiKey.substring(0, 8)} model=${model} após ${Date.now() - t0}ms, tentando de novo`);
            await sleep(500);
            continue;
          }
          console.error(`[Gemini] Error após ${Date.now() - t0}ms:`, err instanceof Error ? err.message : err);
          break;
        }
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada OpenRouter (fallback text-only)
// ─────────────────────────────────────────
async function callOpenRouter(prompt: string, textContent: string): Promise<string> {
  if (OPENROUTER_API_KEYS.length === 0) throw new Error("OPENROUTER_API_KEYS não configurada");
  for (const apiKey of OPENROUTER_API_KEYS) {
    for (const model of OPENROUTER_MODELS) {
      try {
        console.log(`[OpenRouter/extract] key=${apiKey.substring(0, 16)}... model=${model}`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://plataformacapital.vercel.app",
            "X-Title": "Capital Financas",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt + "\n\n--- DOCUMENTO ---\n\n" + textContent }],
            temperature: 0.1,
            max_tokens: 8192,
          }),
        });
        if (!response.ok) { console.error(`[OpenRouter/extract] HTTP ${response.status}`); continue; }
        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content;
        if (!text) { console.error(`[OpenRouter/extract] Empty response`); continue; }
        console.log(`[OpenRouter/extract] Success model=${model}`);
        return text;
      } catch (err) {
        console.error(`[OpenRouter/extract] Error:`, err instanceof Error ? err.message : err);
      }
    }
  }
  throw new Error("OPENROUTER_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada AI — Gemini primário, OpenRouter fallback (texto)
// ─────────────────────────────────────────
export async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string },
  maxOutputTokens = 2048,
  fileBuffer?: Buffer,
  thinkingBudget = 0,
  perAttemptMsOverride = 0,
): Promise<string> {
  // Para PDFs com imagem (> 500KB): usa Gemini Files API (fileUri) em vez de inline base64.
  // Abaixo de 500KB vai inline — elimina latência e 503 do upload. Acima, Files API é mais estável.
  const FILES_API_THRESHOLD = 500 * 1024;
  let resolvedContent: string | { mimeType: string; base64: string } | { mimeType: string; fileUri: string };

  if (imageContent && fileBuffer && fileBuffer.length > FILES_API_THRESHOLD && GEMINI_API_KEYS.length > 0) {
    try {
      console.log(`[extract] Arquivo grande (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB) — usando Gemini Files API`);
      const fileUri = await uploadToGeminiFiles(fileBuffer, imageContent.mimeType, "document.pdf", GEMINI_API_KEYS[0]);
      console.log(`[extract] Gemini Files API upload OK: ${fileUri}`);
      resolvedContent = { mimeType: imageContent.mimeType, fileUri };
    } catch (uploadErr) {
      console.warn(`[extract] Gemini Files API upload falhou, caindo pro inline base64:`, uploadErr instanceof Error ? uploadErr.message : uploadErr);
      resolvedContent = imageContent;
    }
  } else {
    resolvedContent = imageContent ?? textContent;
  }

  // Hobby plan: 60s max total — 52s deixa margem para overhead do Vercel
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT_52s")), 52000)
  );

  const aiCall = async (): Promise<string> => {
    try {
      return await callGemini(prompt, resolvedContent, maxOutputTokens, thinkingBudget, perAttemptMsOverride);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (imageContent || OPENROUTER_API_KEYS.length === 0) throw err;
      console.warn(`[extract] Gemini falhou (${msg}), tentando OpenRouter...`);
      return await callOpenRouter(prompt, textContent);
    }
  };

  return Promise.race([aiCall(), timeoutPromise]);
}
