/**
 * Clientes de IA da rota /api/analyze.
 *
 * Específicos da rota — diferentes do `lib/extract/ai.ts` porque suportam
 * `GEMINI_FINETUNED_MODEL` (modelo fine-tuned configurável via env) e
 * retornam um objeto `GeminiResult` com tokens (necessário para
 * contabilidade de custo da análise).
 *
 * Importados por `app/api/analyze/route.ts` (POST handler).
 */

export const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);

// Fase 3: modelo fine-tunado tem prioridade se configurado e ativo
const FINETUNED_MODEL = process.env.GEMINI_FINETUNED_MODEL?.trim() || null;
const GEMINI_MODELS = FINETUNED_MODEL
  ? [FINETUNED_MODEL, "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"]
  : ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"];

function geminiUrl(model: string, key: string) {
  // tunedModels/ usam endpoint diferente de models/
  const prefix = model.startsWith("tunedModels/") ? "" : "models/";
  return `https://generativelanguage.googleapis.com/v1beta/${prefix}${model}:generateContent?key=${key}`;
}

export const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS: string[] = [];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// Chamada Gemini
// ─────────────────────────────────────────
export interface GeminiResult { text: string; inputTokens: number; outputTokens: number; model: string; }

export async function callGemini(prompt: string, data: string): Promise<GeminiResult> {
  // Caching implicito do Gemini 2.5: prompt estatico (ANALYSIS_PROMPT + few-shots)
  // como part isolada antes do bloco dinamico de dados. Habilita desconto
  // automatico em input tokens quando o mesmo prompt e reutilizado.
  const parts = [
    { text: prompt },
    { text: "\n\n--- DADOS EXTRAÍDOS ---\n\n" + data },
  ];

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      let rateLimitRetries = 0;
      const MAX_RATE_RETRIES = 1;

      for (let attempt = 0; attempt < 1 + MAX_RATE_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 40000); // 40s — acomoda thinking budget
          let response: Response;
          try {
            response = await fetch(geminiUrl(model, apiKey), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  // temperature: 0 para analise DETERMINISTICA — mesmo input = mesmo rating
                  // sempre. Bug do usuario: "rating muda toda hora ao retomar analise"
                  // era causado por 0.3 + re-analise automatica no mount do GenerateStep.
                  temperature: 0,
                  maxOutputTokens: 16384,
                  responseMimeType: "application/json",
                  ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
                },
              }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }

          if (response.status === 429) {
            if (rateLimitRetries < MAX_RATE_RETRIES) {
              rateLimitRetries++;
              let waitMs = 3000;
              const retryAfterMs = response.headers.get("retry-after-ms");
              const retryAfter = response.headers.get("retry-after");
              if (retryAfterMs) {
                waitMs = parseInt(retryAfterMs);
              } else if (retryAfter) {
                waitMs = parseInt(retryAfter) * 1000;
              } else {
                try {
                  const errBody = await response.clone().json();
                  const msg = errBody?.error?.message || "";
                  const match = msg.match(/retry\s+(?:in|after)\s+(\d+(?:\.\d+)?)\s*s/i);
                  if (match) waitMs = Math.ceil(parseFloat(match[1]) * 1000);
                } catch { /* ignore */ }
              }
              waitMs = Math.min(Math.max(waitMs, 1000), 8000); // máx 8s de espera
              console.error(`[analyze] Gemini model=${model} rate limited (429), waiting ${waitMs}ms (retry ${rateLimitRetries}/${MAX_RATE_RETRIES})...`);
              await sleep(waitMs);
              continue;
            } else {
              console.error(`[analyze] Gemini model=${model} max rate-limit retries, moving on`);
              break;
            }
          }

          if (!response.ok) {
            console.error(`[analyze] Gemini model=${model} failed: status=${response.status}`);
            break;
          }
          const result = await response.json();
          // gemini-2.5-flash pode retornar "thinking" parts - pegar a última text part
          const resParts = result?.candidates?.[0]?.content?.parts || [];
          const textP = [...resParts].reverse().find((p: { text?: string; thought?: boolean }) => p.text && !p.thought);
          const text = textP?.text || resParts?.[resParts.length - 1]?.text || resParts?.[0]?.text;
          if (text) {
            const usage = result?.usageMetadata ?? {};
            return {
              text,
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: usage.candidatesTokenCount ?? 0,
              model,
            };
          }
          console.error(`[analyze] Gemini model=${model} returned empty response`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[analyze] Gemini model=${model} error:`, msg);
          if (msg.includes("abort") || msg.includes("timeout")) break; // próximo modelo
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
export async function callOpenRouter(prompt: string, data: string): Promise<string> {
  if (OPENROUTER_API_KEYS.length === 0) throw new Error("OPENROUTER_API_KEYS não configurada");
  for (const apiKey of OPENROUTER_API_KEYS) {
    for (const model of OPENROUTER_MODELS) {
      try {
        console.log(`[OpenRouter/analyze] key=${apiKey.substring(0, 16)}... model=${model}`);
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
            messages: [{ role: "user", content: prompt + "\n\n--- DADOS EXTRAÍDOS ---\n\n" + data }],
            temperature: 0.1,
            max_tokens: 8192,
          }),
        });
        if (!response.ok) { console.error(`[OpenRouter/analyze] HTTP ${response.status}`); continue; }
        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content;
        if (!text) { console.error(`[OpenRouter/analyze] Empty response`); continue; }
        console.log(`[OpenRouter/analyze] Success with key=${apiKey.substring(0, 16)} model=${model}`);
        return text;
      } catch (err) {
        console.error(`[OpenRouter/analyze] Error:`, err instanceof Error ? err.message : err);
      }
    }
  }
  throw new Error("OPENROUTER_EXHAUSTED");
}



