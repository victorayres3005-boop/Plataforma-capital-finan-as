export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, FaturamentoMensal, ProtestosData, ProcessosData, GrupoEconomicoData, CurvaABCData, DREData, BalancoData, IRSocioData, RelatorioVisitaData, SCRModalidade, Socio, Filial, SocioRetirante, DREAno, BalancoAno, ClienteCurvaABC, SociedadeIR } from "@/types";
import { sanitizeDescricaoDebitos, sanitizeStr, sanitizeEnum, sanitizeMoney } from "@/lib/extract/sanitize";
import {
  CNPJDataSchema, QSADataSchema, ContratoSocialDataSchema, FaturamentoDataSchema, SCRDataSchema,
  RelatorioVisitaSchema,
  safeParseExtracted, auditBusinessRules,
} from "@/lib/extract/schemas";
import {
  PROMPT_CNPJ, PROMPT_QSA, PROMPT_CONTRATO, PROMPT_FATURAMENTO,
  PROMPT_SCR, PROMPT_SCR_SEM_DADOS, PROMPT_SCR_BUREAU,
  PROMPT_FAT_DAS, PROMPT_FAT_BANCARIO,
  PROMPT_IR_RECIBO, PROMPT_IR_SOCIOS,
  PROMPT_PROTESTOS, PROMPT_PROCESSOS, PROMPT_GRUPO_ECONOMICO,
  PROMPT_CURVA_ABC, PROMPT_DRE, PROMPT_BALANCO,
  PROMPT_RELATORIO_VISITA,
} from "@/lib/extract/prompts";
import {
  adaptCNPJNew, adaptQSANew, adaptContratoNew, adaptFaturamentoNew,
  adaptSCRNew, adaptCurvaABCNew, adaptDRENew, adaptBalancoNew,
  adaptIRNew, adaptVisitaNew, directParseCurvaABC,
} from "@/lib/extract/adapters";

export const runtime = "nodejs";

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
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
// Helpers
// ─────────────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function getFileExt(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}




// ─────────────────────────────────────────
// Extração de texto (PDF e DOCX)
// ─────────────────────────────────────────
async function extractText(buffer: Buffer, ext: string): Promise<string> {
  try {
    if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const data = await pdfParse(buffer);
      return data.text ?? "";
    }
    if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    }
    if (ext === "xlsx" || ext === "xls") {
      // Converte planilha em texto tabular para envio ao Gemini quando o
      // parser dedicado de faturamento não conseguiu extrair os dados.
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const lines: string[] = [];
      for (const sheet of workbook.worksheets.slice(0, 3)) {
        lines.push(`=== Planilha: ${sheet.name} ===`);
        sheet.eachRow(row => {
          const cells = (row.values as unknown[])
            .slice(1)
            .map(c => (c == null ? "" : String(c).trim()))
            .join("\t");
          if (cells.replace(/\t/g, "").trim()) lines.push(cells);
        });
      }
      return lines.join("\n");
    }
    return "";
  } catch (err) {
    console.error(`[extractText] Failed for .${ext}:`, err);
    return "";
  }
}

// ─────────────────────────────────────────
// Extração de Excel (Faturamento)
// ─────────────────────────────────────────
async function extractExcel(buffer: Buffer): Promise<FaturamentoData> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const meses: { mes: string; valor: string }[] = [];

  // Tentar encontrar dados de faturamento na primeira sheet
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Planilha vazia");

  // Estratégia: procurar colunas com meses e valores
  const monthNames: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    janeiro: "01", fevereiro: "02", "março": "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // pular cabeçalho
    const cells = row.values as (string | number | null)[];
    if (!cells || cells.length < 2) return;

    // Procurar uma célula com mês e outra com valor numérico
    let mesStr = "";
    let valorNum = 0;

    for (const cell of cells) {
      if (cell === null || cell === undefined) continue;
      const str = String(cell).trim().toLowerCase();

      // Verificar se é um mês
      if (!mesStr) {
        for (const [name, num] of Object.entries(monthNames)) {
          if (str.includes(name)) {
            // Tentar pegar o ano do texto
            const yearMatch = str.match(/(\d{4})/);
            const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
            mesStr = `${num}/${year}`;
            break;
          }
        }
        // Verificar formato MM/YYYY ou MM/YY
        const dateMatch = str.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
        if (dateMatch && !mesStr) {
          const m = dateMatch[1].padStart(2, "0");
          const y = dateMatch[2].length === 2 ? `20${dateMatch[2]}` : dateMatch[2];
          mesStr = `${m}/${y}`;
        }
      }

      // Verificar se é valor numérico
      if (typeof cell === "number" && cell > 0) {
        valorNum = cell;
      } else if (typeof cell === "string") {
        const numStr = cell.replace(/[R$\s.]/g, "").replace(",", ".");
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed) && parsed > 0 && parsed > valorNum) {
          valorNum = parsed;
        }
      }
    }

    if (mesStr && valorNum > 0) {
      meses.push({
        mes: mesStr,
        valor: valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      });
    }
  });

  // Ordenar meses por data crescente (mais antigo primeiro)
  const mesesOrdenados = [...meses].sort((a, b) => {
    const [ma, ya] = a.mes.split("/").map(Number);
    const [mb, yb] = b.mes.split("/").map(Number);
    return (ya - yb) || (ma - mb);
  });
  // Últimos 12 meses (independente de valor)
  const mesesFMM = mesesOrdenados.slice(-12);

  const parseBRVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;

  // somatoriaAno = soma dos ÚLTIMOS 12 meses (valor anualizado)
  const valoresAll = meses.map(m => parseBRVal(m.valor));
  const valores12 = mesesFMM.map(m => parseBRVal(m.valor));
  const soma = valores12.reduce((a, b) => a + b, 0);

  // FMM = soma / quantidade real de meses (não fixo em 12)
  const valoresFMM = mesesFMM.map(m => parseBRVal(m.valor));
  const media = mesesFMM.length > 0 ? valoresFMM.reduce((a, b) => a + b, 0) / mesesFMM.length : 0;

  // Meses zerados nos últimos 12
  const mesesZeradosExcel = mesesFMM
    .filter((_, i) => valoresFMM[i] === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  // Verificar alertas
  const faturamentoZerado = valoresAll.length === 0 || valoresAll.every(v => v === 0);
  const ultimoMes = mesesOrdenados.length > 0 ? mesesOrdenados[mesesOrdenados.length - 1].mes : "";

  // Verificar se dados estão atualizados (últimos 60 dias)
  let dadosAtualizados = true;
  if (ultimoMes) {
    const [m, y] = ultimoMes.split("/").map(Number);
    const lastDataDate = new Date(y, m - 1, 28); // último dia do mês dos dados
    const now = new Date();
    const diffDays = (now.getTime() - lastDataDate.getTime()) / (1000 * 60 * 60 * 24);
    dadosAtualizados = diffDays <= 75; // ~60 dias + margem
  }

  return {
    meses,
    somatoriaAno: soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    mediaAno: media.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    faturamentoZerado,
    dadosAtualizados,
    ultimoMesComDados: ultimoMes,
    mesesZerados: mesesZeradosExcel,
    quantidadeMesesZerados: mesesZeradosExcel.length,
    temMesesZerados: mesesZeradosExcel.length > 0,
  };
}

// ─────────────────────────────────────────
// Layer 3 — Detecção de subformato (determinística, sem chamada IA)
// ─────────────────────────────────────────
type Subformat =
  | "SCR_BACEN_SEM_DADOS"
  | "SCR_BUREAU"
  | "FAT_DAS"
  | "FAT_BANCARIO"
  | "IR_RECIBO"
  | "DEFAULT";

function detectSubformat(docType: string, text: string): Subformat {
  const t = text.toUpperCase();

  if (docType === "scr") {
    if (
      t.includes("NAO POSSUI DADOS NO SCR") || t.includes("NÃO POSSUI DADOS NO SCR") ||
      t.includes("SEM OPERACOES REGISTRADAS") || t.includes("SEM OPERAÇÕES REGISTRADAS") ||
      (t.includes("CLIENTE") && t.includes("NAO POSSUI") && t.includes("SCR"))
    ) return "SCR_BACEN_SEM_DADOS";
    if (
      t.includes("CREDIT HUB") || t.includes("CONSULTA SIMPLES") ||
      t.includes("BOA VISTA SCPC") || t.includes("QUOD") ||
      (t.includes("PEFIN") && t.includes("REFIN")) ||
      (t.includes("NEGATIVAC") && !t.includes("CARTEIRA A VENCER"))
    ) return "SCR_BUREAU";
  }

  if (docType === "faturamento") {
    if (t.includes("PGDAS") || (t.includes("SIMPLES NACIONAL") && t.includes("RECEITA BRUTA"))) return "FAT_DAS";
    if (
      t.includes("SALDO ANTERIOR") &&
      (t.includes("CRÉDITO") || t.includes("CREDITO")) &&
      (t.includes("DÉBITO") || t.includes("DEBITO"))
    ) return "FAT_BANCARIO";
  }

  if (docType === "ir_socio") {
    if (
      (t.includes("RECIBO DE ENTREGA") || t.includes("RECIBO DA DECLARACAO")) &&
      !t.includes("BENS E DIREITOS") && !t.includes("RENDIMENTOS TRIBUTAVEIS")
    ) return "IR_RECIBO";
  }

  return "DEFAULT";
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
async function callAI(
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

// ─────────────────────────────────────────
// Parse JSON
// ─────────────────────────────────────────
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  // Remove markdown code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  // Tenta extrair JSON se resposta veio com texto antes/depois
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  // Números no formato brasileiro (ex: 9.498.394) com 2+ grupos de 3 dígitos são
  // separadores de milhar e jamais decimais JSON válidos. Se o Gemini os retornar
  // sem aspas, o JSON.parse falha. Removemos os pontos antes de parsear.
  cleaned = cleaned.replace(/\b(\d{1,3}(?:\.\d{3}){2,})\b/g, (m) => m.replace(/\./g, ""));
  // Remove "$" espúrio após dígitos — OCR do SCR/BACEN às vezes gera "R$ 200.419,62$"
  cleaned = cleaned.replace(/(\d)\$/g, "$1");
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Recovery — quando Gemini trunca o output em meio a array (ex: maxOutputTokens estourado),
    // tenta recuperar fechando o JSON no último item completo. Salva extrações parciais
    // em vez de retornar objeto vazio.
    const recovered = tryRecoverTruncatedJSON<T>(cleaned);
    if (recovered) {
      console.warn("[parseJSON] JSON truncado — recuperado parcialmente. Erro original:", (err as Error).message);
      return recovered;
    }
    console.error("[parseJSON] Falha ao parsear resposta da IA:", (err as Error).message, "| raw (primeiros 500 chars):", raw.slice(0, 500));
    // Retorna objeto vazio ao invés de crash — fillXxxDefaults vai preencher campos padrão
    return {} as T;
  }
}

/**
 * Tenta recuperar JSON truncado pelo modelo cortando no último objeto completo.
 * Estratégia: encontra a última posição onde a string termina em "}" (fechando
 * um item de array) e fecha tudo (`]` para arrays abertos + `}` final).
 *
 * Funciona pra schemas comuns onde o corte ocorre no meio de um array de objetos
 * (curva_abc_clientes, faturamento_por_mes, anos[], etc.).
 */
function tryRecoverTruncatedJSON<T>(s: string): T | null {
  // Acha o último "}" que fecha um item de objeto (não a chave externa do JSON)
  const lastObjClose = s.lastIndexOf("}");
  if (lastObjClose < 0) return null;
  let candidate = s.slice(0, lastObjClose + 1);

  // Conta chaves/colchetes pendentes
  let openBraces = 0, openBrackets = 0;
  let inString = false, escape = false;
  for (let i = 0; i < candidate.length; i++) {
    const c = candidate[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") openBraces++;
    else if (c === "}") openBraces--;
    else if (c === "[") openBrackets++;
    else if (c === "]") openBrackets--;
  }
  // Fecha colchetes (arrays) e chaves (objetos) pendentes na ordem correta
  candidate += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────

function fillCNPJDefaults(data: Partial<CNPJData>): CNPJData {
  return {
    razaoSocial: data.razaoSocial || "", nomeFantasia: data.nomeFantasia || "",
    cnpj: data.cnpj || "", dataAbertura: data.dataAbertura || "",
    situacaoCadastral: data.situacaoCadastral || "", dataSituacaoCadastral: data.dataSituacaoCadastral || "",
    motivoSituacao: data.motivoSituacao || "", naturezaJuridica: data.naturezaJuridica || "",
    cnaePrincipal: data.cnaePrincipal || "", cnaeSecundarios: data.cnaeSecundarios || "",
    porte: data.porte || "", capitalSocialCNPJ: data.capitalSocialCNPJ || "",
    endereco: data.endereco || "", telefone: data.telefone || "", email: data.email || "",
  };
}

function fillQSADefaults(data: Partial<QSAData>): QSAData & { _incompleteCount?: number } {
  // Descarta socios totalmente vazios MAS conta quantos foram descartados
  // pra que a Review possa exibir "N socios foram detectados parcialmente".
  const raw = Array.isArray(data.quadroSocietario) ? data.quadroSocietario : [];
  let incompleteCount = 0;
  const quadro = raw
    .filter(s => {
      if (!s) { incompleteCount++; return false; }
      const hasName = !!(s.nome && s.nome.trim());
      const hasCpf = !!(s.cpfCnpj && s.cpfCnpj.trim());
      const hasQual = !!(s.qualificacao && s.qualificacao.trim());
      // Se so tem qualificacao/participacao e nada identificavel, e ruido
      if (!hasName && !hasCpf && !hasQual) { incompleteCount++; return false; }
      // Se so tem nome OU so tem CPF, mantem com warning no log
      if (!hasName || !hasCpf) {
        console.warn(`[extract][qsa] socio parcial mantido: nome="${s.nome ? s.nome.split(" ")[0] : "—"}" cpf="${s.cpfCnpj ? s.cpfCnpj.replace(/\D/g,"").slice(0,3)+"***" : "—"}"`);
      }
      return true;
    })
    .map(s => ({
      nome: s.nome || "", cpfCnpj: s.cpfCnpj || "",
      qualificacao: s.qualificacao || "", participacao: s.participacao || "",
    }));
  if (incompleteCount > 0) {
    console.warn(`[extract][qsa] ${incompleteCount} entrada(s) totalmente vazia(s) descartada(s)`);
  }
  const result: QSAData & { _incompleteCount?: number } = {
    capitalSocial: data.capitalSocial || "", quadroSocietario: quadro,
  };
  if (incompleteCount > 0) result._incompleteCount = incompleteCount;
  return result;
}

function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData & { _incompleteCount?: number } {
  const raw = Array.isArray(data.socios) ? data.socios : [];
  let incompleteCount = 0;
  const socios = raw
    .filter(s => {
      if (!s) { incompleteCount++; return false; }
      const hasName = !!(s.nome && s.nome.trim());
      const hasCpf = !!(s.cpf && s.cpf.trim());
      const hasPart = !!(s.participacao && s.participacao.trim());
      if (!hasName && !hasCpf && !hasPart) { incompleteCount++; return false; }
      if (!hasName || !hasCpf) {
        console.warn(`[extract][contrato] socio parcial mantido: nome="${s.nome ? s.nome.split(" ")[0] : "—"}" cpf="${s.cpf ? s.cpf.replace(/\D/g,"").slice(0,3)+"***" : "—"}"`);
      }
      return true;
    })
    .map(s => ({ nome: s.nome || "", cpf: s.cpf || "", participacao: s.participacao || "", qualificacao: s.qualificacao || "" }));
  if (incompleteCount > 0) {
    console.warn(`[extract][contrato] ${incompleteCount} entrada(s) totalmente vazia(s) descartada(s)`);
  }
  const result: ContratoSocialData & { _incompleteCount?: number } = {
    socios, capitalSocial: data.capitalSocial || "", objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "", temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "", administracao: data.administracao || "", foro: data.foro || "",
  };
  if (incompleteCount > 0) result._incompleteCount = incompleteCount;
  return result;
}

function fillFaturamentoDefaults(data: Partial<FaturamentoData>): FaturamentoData {
  const _mesAtualFiltro = new Date().getMonth() + 1;
  const _anoAtualFiltro = new Date().getFullYear();

  const _mesesFuturosDropados: string[] = [];
  const meses = (Array.isArray(data.meses) ? data.meses : [])
    .filter(m => {
      if (!m.mes) return false;
      const [mesNum, anoNum] = m.mes.split("/").map(Number);
      if (!mesNum || !anoNum) return false;

      // Meses futuros: marca como dropado pra expor na Review, nao silencia
      if (anoNum > _anoAtualFiltro || (anoNum === _anoAtualFiltro && mesNum > _mesAtualFiltro)) {
        _mesesFuturosDropados.push(m.mes);
        return false;
      }
      return true;
    });
  if (_mesesFuturosDropados.length > 0) {
    console.warn(`[extract][faturamento] ${_mesesFuturosDropados.length} mes(es) futuro(s) descartado(s): ${_mesesFuturosDropados.join(", ")}`);
  }
  const parseBR = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const fmtBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenados = [...meses].sort((a, b) => {
    const [mesA, anoA] = (a.mes || "").split("/").map(Number);
    const [mesB, anoB] = (b.mes || "").split("/").map(Number);
    return (anoA - anoB) || (mesA - mesB);
  });

  const meses12 = ordenados.slice(-12);
  const soma12 = meses12.reduce((s, m) => s + parseBR(m.valor), 0);
  const fmm12m = meses12.length > 0 ? soma12 / meses12.length : 0;

  const porAno: Record<string, number[]> = {};
  for (const m of ordenados) {
    const parts = (m.mes || "").split("/");
    const anoRaw = parts[1] || "";
    const ano = anoRaw.length === 2 ? "20" + anoRaw : anoRaw;
    if (!ano) continue;
    if (!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(parseBR(m.valor));
  }

  const fmmAnual: Record<string, number> = {};
  for (const [ano, valores] of Object.entries(porAno)) {
    const somaAno = valores.reduce((s, v) => s + v, 0);
    fmmAnual[ano] = somaAno / valores.length;
  }

  const anosCompletos = Object.entries(porAno).filter(([, v]) => v.length === 12);
  const fmmMedio = anosCompletos.length > 0
    ? anosCompletos.reduce((s, [ano]) => s + fmmAnual[ano], 0) / anosCompletos.length
    : fmm12m;

  const anoAtual = String(new Date().getFullYear());
  const fmmAnoAtual = fmmAnual[anoAtual];
  let tendencia: "crescimento" | "estavel" | "queda" | "indefinido" = "indefinido";
  if (fmmAnoAtual && fmm12m > 0) {
    const delta = (fmmAnoAtual - fmm12m) / fmm12m;
    if (delta > 0.05) tendencia = "crescimento";
    else if (delta < -0.05) tendencia = "queda";
    else tendencia = "estavel";
  }

  // somatoriaAno = soma dos últimos 12 meses (valor anualizado, não total histórico)
  const soma12m = meses12.reduce((s, m) => s + parseBR(m.valor), 0);

  const mesesZerados = meses12
    .filter(m => parseBR(m.valor) === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  const result = {
    meses,
    somatoriaAno: fmtBR(soma12m),
    mediaAno: fmtBR(fmm12m),
    fmm12m: fmtBR(fmm12m),
    fmmAnual: Object.fromEntries(
      Object.entries(fmmAnual).map(([ano, v]) => [ano, fmtBR(v)])
    ),
    fmmMedio: fmtBR(fmmMedio),
    tendencia,
    faturamentoZerado: meses.length === 0 || meses.every(m => parseBR(m.valor) === 0),
    dadosAtualizados: data.dadosAtualizados ?? false,
    ultimoMesComDados: data.ultimoMesComDados || (ordenados.length > 0 ? ordenados[ordenados.length - 1].mes : ""),
    mesesZerados,
    quantidadeMesesZerados: mesesZerados.length,
    temMesesZerados: mesesZerados.length > 0,
  } as FaturamentoData & { _mesesFuturosIgnorados?: string[] };
  if (_mesesFuturosDropados.length > 0) result._mesesFuturosIgnorados = _mesesFuturosDropados;
  return result;
}

function fillSCRDefaults(data: Partial<SCRData>): SCRData {
  // Normaliza faixas key-por-key para evitar objetos vazios {} que passam pelo ||
  const f = data.faixasAVencer as Record<string, string> | undefined;
  const fv = data.faixasVencidos as Record<string, string> | undefined;
  const faixasAVencer: SCRData["faixasAVencer"] = {
    ate30d: f?.ate30d || "", d31_60: f?.d31_60 || "", d61_90: f?.d61_90 || "",
    d91_180: f?.d91_180 || "", d181_360: f?.d181_360 || "", acima360d: f?.acima360d || "",
    prazoIndeterminado: f?.prazoIndeterminado || "", total: f?.total || "",
  };
  const faixasVencidos: SCRData["faixasVencidos"] = {
    ate30d: fv?.ate30d || "", d31_60: fv?.d31_60 || "", d61_90: fv?.d61_90 || "",
    d91_180: fv?.d91_180 || "", d181_360: fv?.d181_360 || "", acima360d: fv?.acima360d || "",
    total: fv?.total || "",
  };

  // ─── FALLBACK: curto/longo prazo quando faixas não foram extraídas ───
  // Se o prompt não encontrou a seção "Discriminação A Vencer por Faixa de
  // Prazo", carteiraCurtoPrazo fica vazia mas carteiraAVencer pode ter valor.
  // Deriva: curto = aVencer - acima360d (fallback mínimo: tudo é curto prazo).
  const parseMoney = (s: unknown): number => {
    if (s == null || s === "") return 0;
    const str = String(s).trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  };
  let carteiraCurtoPrazo = data.carteiraCurtoPrazo || "";
  let carteiraLongoPrazo = data.carteiraLongoPrazo || "";
  const aVencerNum = parseMoney(data.carteiraAVencer);
  const curtoNum   = parseMoney(carteiraCurtoPrazo);
  const longoNum   = parseMoney(carteiraLongoPrazo);
  if (curtoNum === 0 && longoNum === 0 && aVencerNum > 0) {
    // Nenhum dado de faixa — assume 100% curto prazo (cenário conservador)
    const acima360 = parseMoney(faixasAVencer.acima360d);
    const curtoDerivado = Math.max(0, aVencerNum - acima360);
    carteiraCurtoPrazo = curtoDerivado.toFixed(2).replace(".", ",");
    carteiraLongoPrazo = acima360.toFixed(2).replace(".", ",");
    console.log(`[scr-fallback] curto/longo derivados de carteiraAVencer=${aVencerNum} (curto=${curtoDerivado}, longo=${acima360})`);
  }

  return {
    // Identificação — preservar para roteamento PJ vs PF
    tipoPessoa: data.tipoPessoa || undefined,
    nomeCliente: data.nomeCliente || "",
    cpfSCR: data.cpfSCR || "",
    periodoReferencia: data.periodoReferencia || "",
    carteiraAVencer: data.carteiraAVencer || "", vencidos: data.vencidos || "",
    prejuizos: data.prejuizos || "", limiteCredito: data.limiteCredito || "",
    qtdeInstituicoes: data.qtdeInstituicoes || "", qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas: data.totalDividasAtivas || "", operacoesAVencer: data.operacoesAVencer || "",
    operacoesEmAtraso: data.operacoesEmAtraso || "", operacoesVencidas: data.operacoesVencidas || "",
    tempoAtraso: data.tempoAtraso || "", coobrigacoes: data.coobrigacoes || "",
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo, carteiraLongoPrazo,
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia: data.historicoInadimplencia || "",
    // Campos detalhados
    cnpjSCR: data.cnpjSCR || "",
    pctDocumentosProcessados: data.pctDocumentosProcessados || "",
    pctVolumeProcessado: data.pctVolumeProcessado || "",
    faixasAVencer,
    faixasVencidos,
    faixasPrejuizos: { ate12m: data.faixasPrejuizos?.ate12m || "", acima12m: data.faixasPrejuizos?.acima12m || "", total: data.faixasPrejuizos?.total || "" },
    faixasLimite: { ate360d: data.faixasLimite?.ate360d || "", acima360d: data.faixasLimite?.acima360d || "", total: data.faixasLimite?.total || "" },
    outrosValores: {
      carteiraCredito: data.outrosValores?.carteiraCredito || "",
      responsabilidadeTotal: data.outrosValores?.responsabilidadeTotal || "",
      riscoTotal: data.outrosValores?.riscoTotal || "",
      coobrigacaoAssumida: data.outrosValores?.coobrigacaoAssumida || "",
      coobrigacaoRecebida: data.outrosValores?.coobrigacaoRecebida || "",
      creditosALiberar: data.outrosValores?.creditosALiberar || "",
    },
    emDia: data.emDia || "",
    semHistorico: data.semHistorico ?? (!data.totalDividasAtivas && !data.carteiraAVencer && !data.vencidos && !data.prejuizos && !data.limiteCredito),
    numeroIfs: data.numeroIfs || "",
  };
}

function fillProtestosDefaults(data: Partial<ProtestosData>): ProtestosData {
  return {
    vigentesQtd: data.vigentesQtd || "", vigentesValor: data.vigentesValor || "",
    regularizadosQtd: data.regularizadosQtd || "", regularizadosValor: data.regularizadosValor || "",
    detalhes: Array.isArray(data.detalhes) ? data.detalhes : [],
  };
}

function fillProcessosDefaults(data: Partial<ProcessosData>): ProcessosData {
  return {
    passivosTotal: data.passivosTotal || "", ativosTotal: data.ativosTotal || "",
    valorTotalEstimado: data.valorTotalEstimado || "", temRJ: data.temRJ || false,
    distribuicao: Array.isArray(data.distribuicao) ? data.distribuicao : [],
    bancarios: Array.isArray(data.bancarios) ? data.bancarios : [],
    fiscais: Array.isArray(data.fiscais) ? data.fiscais : [],
    fornecedores: Array.isArray(data.fornecedores) ? data.fornecedores : [],
    outros: Array.isArray(data.outros) ? data.outros : [],
  };
}

function fillGrupoEconomicoDefaults(data: Partial<GrupoEconomicoData>): GrupoEconomicoData {
  return { empresas: Array.isArray(data.empresas) ? data.empresas : [] };
}

function fillCurvaABCDefaults(data: Partial<CurvaABCData>): CurvaABCData {
  return {
    clientes: data.clientes ?? [],
    totalClientesNaBase: data.totalClientesNaBase ?? 0,
    totalClientesExtraidos: data.totalClientesExtraidos ?? 0,
    periodoReferencia: data.periodoReferencia ?? "",
    receitaTotalBase: data.receitaTotalBase ?? "0,00",
    concentracaoTop3: data.concentracaoTop3 ?? "0.00",
    concentracaoTop5: data.concentracaoTop5 ?? "0.00",
    concentracaoTop10: data.concentracaoTop10 ?? "0.00",
    totalClientesClasseA: data.totalClientesClasseA ?? 0,
    receitaClasseA: data.receitaClasseA ?? "0,00",
    maiorCliente: data.maiorCliente ?? "",
    maiorClientePct: data.maiorClientePct ?? "0.00",
    alertaConcentracao: data.alertaConcentracao ?? false,
  };
}

function fillDREDefaults(data: Partial<DREData>): DREData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    crescimentoReceita: data.crescimentoReceita || "0,00",
    tendenciaLucro: data.tendenciaLucro || "estavel",
    periodoMaisRecente: data.periodoMaisRecente || "",
    observacoes: data.observacoes || "",
  };
}

function fillBalancoDefaults(data: Partial<BalancoData>): BalancoData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    periodoMaisRecente: data.periodoMaisRecente || "",
    tendenciaPatrimonio: data.tendenciaPatrimonio || "estavel",
    observacoes: data.observacoes || "",
  };
}

function fillIRSocioDefaults(data: Partial<IRSocioData>): IRSocioData {
  const parseMoney = (v: string | undefined | null): number => {
    if (!v || v === "0,00") return 0;
    const s = String(v).replace(/[R$\s]/g, "").trim();
    const lastComma = s.lastIndexOf(",");
    const lastDot   = s.lastIndexOf(".");
    if (lastComma > lastDot) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(s.replace(/,/g, "")) || 0;
  };
  const fmtMoney = (n: number): string =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const bensImoveis        = sanitizeMoney(data.bensImoveis);
  const bensVeiculos       = sanitizeMoney(data.bensVeiculos);
  const aplicacoes         = sanitizeMoney(data.aplicacoesFinanceiras);
  const outrosBens         = sanitizeMoney(data.outrosBens);
  // participacoesSocietarias: novo campo (grupo 03). Dados antigos usam outrosBens para isso.
  const participacoes      = sanitizeMoney(data.participacoesSocietarias);
  const dividasOnus        = sanitizeMoney(data.dividasOnus);

  // Reconciliação de totalBensDireitos.
  // O Gemini às vezes retorna um total que é só o primeiro item da lista (ex: "640k" quando
  // na verdade o total é 1.2M), ou retorna subcategorias incompletas. Quando há divergência
  // significativa, usamos o MAIOR dos dois — parte-se da premissa de que o menor está
  // incompleto (o agregador raramente inventa valor, mas frequentemente perde itens).
  const totalDoc   = parseMoney(data.totalBensDireitos);
  const totalCalc  = parseMoney(bensImoveis) + parseMoney(bensVeiculos) + parseMoney(aplicacoes) + parseMoney(outrosBens) + parseMoney(participacoes);
  const maxTotal   = Math.max(totalDoc, totalCalc);
  const diverges   = totalDoc > 0 && totalCalc > 0 && Math.abs(totalDoc - totalCalc) > maxTotal * 0.05;
  if (diverges) {
    console.warn(
      `[IR extract] totalBensDireitos divergente: doc=${totalDoc}, calc=${totalCalc}. ` +
      `Usando o maior (${maxTotal}). Subcategorias provavelmente incompletas.`,
    );
  }
  const totalBens = maxTotal > 0 ? fmtMoney(maxTotal) : "0,00";

  // patrimonioLiquido: recalcula server-side para garantir consistência
  const totalBensN = parseMoney(totalBens);
  const dividasN   = parseMoney(dividasOnus);
  const plDocN     = parseMoney(data.patrimonioLiquido);
  // Usa o valor do Gemini se razoável (diferença < 1% do total), senão recalcula
  const plFinal = (plDocN !== 0 && Math.abs(plDocN - (totalBensN - dividasN)) < totalBensN * 0.01)
    ? sanitizeMoney(data.patrimonioLiquido)
    : fmtMoney(Math.max(0, totalBensN - dividasN));

  return {
    nomeSocio: sanitizeStr(data.nomeSocio, 100),
    cpf: data.cpf || "",
    anoBase: data.anoBase || "",
    tipoDocumento: sanitizeEnum(data.tipoDocumento, ["recibo", "declaracao", "extrato"] as const, "recibo"),
    numeroRecibo: data.numeroRecibo || "",
    dataEntrega: data.dataEntrega || "",
    situacaoMalhas: data.situacaoMalhas ?? false,
    debitosEmAberto: data.debitosEmAberto ?? false,
    descricaoDebitos: sanitizeDescricaoDebitos(data.descricaoDebitos),
    rendimentosTributaveis: sanitizeMoney(data.rendimentosTributaveis),
    rendimentosIsentos: sanitizeMoney(data.rendimentosIsentos),
    rendimentoTotal: sanitizeMoney(data.rendimentoTotal),
    bensImoveis,
    bensVeiculos,
    aplicacoesFinanceiras: aplicacoes,
    outrosBens,
    ...(parseMoney(participacoes) > 0 ? { participacoesSocietarias: participacoes } : {}),
    totalBensDireitos: totalBens,
    dividasOnus,
    patrimonioLiquido: plFinal,
    impostoDefinido: sanitizeMoney(data.impostoDefinido),
    valorQuota: sanitizeMoney(data.valorQuota),
    impostoPago: sanitizeMoney(data.impostoPago),
    impostoRestituir: sanitizeMoney(data.impostoRestituir),
    temSociedades: data.temSociedades ?? false,
    sociedades: Array.isArray(data.sociedades) ? data.sociedades : [],
    coerenciaComEmpresa: data.coerenciaComEmpresa ?? true,
    observacoes: sanitizeStr(data.observacoes, 500),
    bensEDireitos: Array.isArray(data.bensEDireitos) ? data.bensEDireitos : [],
    dividasOnusReais: Array.isArray(data.dividasOnusReais) ? data.dividasOnusReais : [],
    pagamentosEfetuados: Array.isArray(data.pagamentosEfetuados) ? data.pagamentosEfetuados : [],
  };
}

function fillRelatorioVisitaDefaults(data: Partial<RelatorioVisitaData>): RelatorioVisitaData {
  return {
    dataVisita: data.dataVisita || "",
    responsavelVisita: data.responsavelVisita || "",
    localVisita: data.localVisita || "",
    duracaoVisita: data.duracaoVisita || "",
    estruturaFisicaConfirmada: data.estruturaFisicaConfirmada ?? true,
    funcionariosObservados: data.funcionariosObservados ?? 0,
    estoqueVisivel: data.estoqueVisivel ?? false,
    estimativaEstoque: data.estimativaEstoque || "",
    operacaoCompativelFaturamento: data.operacaoCompativelFaturamento ?? true,
    maquinasEquipamentos: data.maquinasEquipamentos ?? false,
    descricaoEstrutura: data.descricaoEstrutura || "",
    pontosPositivos: Array.isArray(data.pontosPositivos) ? data.pontosPositivos : [],
    pontosAtencao: Array.isArray(data.pontosAtencao) ? data.pontosAtencao : [],
    recomendacaoVisitante: data.recomendacaoVisitante || "aprovado",
    nivelConfiancaVisita: data.nivelConfiancaVisita || "alto",
    presencaSocios: data.presencaSocios ?? false,
    sociosPresentes: Array.isArray(data.sociosPresentes) ? data.sociosPresentes : [],
    documentosVerificados: Array.isArray(data.documentosVerificados) ? data.documentosVerificados : [],
    observacoesLivres: data.observacoesLivres || "",
    pleito: data.pleito || "",
    modalidade: data.modalidade || undefined,
    taxaConvencional: data.taxaConvencional || "",
    taxaComissaria: data.taxaComissaria || "",
    limiteTotal: data.limiteTotal || "",
    limiteConvencional: data.limiteConvencional || "",
    limiteComissaria: data.limiteComissaria || "",
    limitePorSacado: data.limitePorSacado || "",
    limiteDuplicatasPJ: data.limiteDuplicatasPJ || "",
    limiteChequesPJ: data.limiteChequesPJ || "",
    limitePrincipaisSacados: data.limitePrincipaisSacados || "",
    ticketMedio: data.ticketMedio || "",
    valorCobrancaBoleto: data.valorCobrancaBoleto || "",
    prazoRecompraCedente: data.prazoRecompraCedente || "",
    prazoEnvioCartorio: data.prazoEnvioCartorio || "",
    prazoMaximoOp: data.prazoMaximoOp || "",
    cobrancaTAC: data.cobrancaTAC || "",
    tranche: data.tranche || "",
    trancheChecagem: data.trancheChecagem || "",
    prazoTranche: data.prazoTranche || "",
    folhaPagamento: data.folhaPagamento || "",
    endividamentoBanco: data.endividamentoBanco || "",
    endividamentoFactoring: data.endividamentoFactoring || "",
    vendasCheque: data.vendasCheque || "",
    vendasDuplicata: data.vendasDuplicata || "",
    vendasOutras: data.vendasOutras || "",
    prazoMedioFaturamento: data.prazoMedioFaturamento || "",
    prazoMedioEntrega: data.prazoMedioEntrega || "",
    referenciasFornecedores: data.referenciasFornecedores || (data as Record<string, unknown>).referenciaComercial as string || "",
    referenciasComerciais: Array.isArray(data.referenciasComerciais) ? data.referenciasComerciais : [],
  };
}

type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData | CurvaABCData | DREData | BalancoData | IRSocioData | RelatorioVisitaData;

function countFilledFields(data: AnyExtracted): number {
  const obj = data as unknown as Record<string, unknown>;
  return Object.values(obj).filter(v =>
    typeof v === "string" ? v.length > 0 :
    Array.isArray(v) ? v.length > 0 :
    typeof v === "boolean" ? true : false
  ).length;
}

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // ── Caminho 2: arquivo via Vercel Blob URL (JSON body) ──────────────────
    // Usado para arquivos grandes que não cabem no corpo de uma função serverless.
    // O cliente faz upload direto para o Blob e nos envia só a URL.
    if (contentType.includes("application/json")) {
      let body: { blobUrl?: string; type?: string; slot?: string; fileName?: string };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
      }
      const { blobUrl, type: docTypeJson, slot: slotJson, fileName, bypass_cache: bypassCacheJson } = body as { blobUrl?: string; type?: string; slot?: string; fileName?: string; bypass_cache?: boolean };
      if (!blobUrl || !docTypeJson) {
        return NextResponse.json({ error: "blobUrl e type são obrigatórios." }, { status: 400 });
      }
      if (GEMINI_API_KEYS.length === 0) {
        return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
      }
      // Fetch do blob (URL pública temporária do Vercel Blob)
      const blobResp = await fetch(blobUrl);
      if (!blobResp.ok) {
        return NextResponse.json({ error: "Não foi possível baixar o arquivo do blob." }, { status: 400 });
      }
      const blobBuffer = Buffer.from(await blobResp.arrayBuffer());
      const blobFileName = fileName ?? blobUrl.split("/").pop() ?? "document.pdf";
      const blobExt = getFileExt(blobFileName);
      const blobMime = EXT_TO_MIME[blobExt];
      if (!blobMime) {
        return NextResponse.json({ error: `Formato .${blobExt} não suportado.` }, { status: 400 });
      }
      // Caminho Blob: variáveis já prontas, pula o bloco FormData
      if (GEMINI_API_KEYS.length === 0) {
        return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
      }
      return processExtract(request, blobBuffer, blobFileName, blobMime, docTypeJson, slotJson ?? null, bypassCacheJson === true);
    }

    // ── Caminho 1: arquivo via multipart/form-data (upload direto) ──────────
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "Request deve ser multipart/form-data ou JSON com blobUrl.", success: false },
        { status: 400 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error("[extract] FormData parse failed:", formErr instanceof Error ? formErr.message : formErr);
      return NextResponse.json(
        { error: "Falha ao processar o upload. Verifique o arquivo e tente novamente.", success: false },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const docType = formData.get("type") as string | null;
    const slot = formData.get("slot") as string | null;
    const bypassCache = formData.get("bypass_cache") === "true";

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
    }

    const MAX_SIZE = 30 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 30MB. Comprima o PDF antes de enviar." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return NextResponse.json({ error: `Formato .${ext} não suportado.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return processExtract(request, buffer, file.name, mimeType, docType, slot, bypassCache);
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// Lógica de extração compartilhada (FormData e Blob)
// ─────────────────────────────────────────
// Cache version — bump aqui ao atualizar prompts para invalidar extrações antigas.
// v3 = Layer 3 (subformatos especializados, SCR texto, IR/FAT/SCR novos prompts).
const CACHE_VERSION = "v4";
// TTL do cache: extrações mais antigas que N dias são ignoradas e refeitas.
const CACHE_TTL_DAYS = 30;

async function processExtract(
  request: NextRequest,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  docType: string,
  slot: string | null,
  bypassCache = false,
): Promise<Response> {
  const ext = getFileExt(fileName);
  try {
    // ──── Cache de extracao por hash (sha256 do arquivo) ────
    // Versão = CACHE_VERSION, TTL = CACHE_TTL_DAYS dias.
    // bypassCache=true pula a leitura (mas ainda escreve após extração bem-sucedida).
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const cacheDocType = `${docType}_${CACHE_VERSION}`;
    const cacheTTLDate = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
    let cachedUserId: string | null = null;
    try {
      const supaCache = createServerSupabase();
      const { data: userData } = await supaCache.auth.getUser();
      cachedUserId = userData.user?.id || null;
      if (cachedUserId && !bypassCache) {
        const { data: cached } = await supaCache
          .from("extraction_cache")
          .select("extracted_data, filled_fields")
          .eq("user_id", cachedUserId)
          .eq("file_hash", fileHash)
          .eq("doc_type", cacheDocType)
          .gte("created_at", cacheTTLDate)
          .maybeSingle();
        if (cached?.extracted_data) {
          console.log(`[extract][cache] HIT ${cacheDocType} hash=${fileHash.substring(0, 12)} (${cached.filled_fields ?? "?"} campos)`);
          return NextResponse.json({
            success: true,
            data: cached.extracted_data,
            meta: { rawTextLength: 0, filledFields: cached.filled_fields ?? 0, isScanned: false, aiPowered: false, cached: true },
          });
        }
      } else if (bypassCache) {
        console.log(`[extract][cache] BYPASS ${cacheDocType} hash=${fileHash.substring(0, 12)}`);
      }
    } catch (cacheErr) {
      console.warn(`[extract][cache] lookup falhou (seguindo sem cache):`, cacheErr instanceof Error ? cacheErr.message : cacheErr);
    }

    // ──── Excel: processamento direto sem IA ────
    // Se o parser Excel retornar vazio OU lancar erro, cai pro Gemini como fallback
    // (evita que analista veja "faturamento vazio" sem aviso quando o XLSX foge do formato).
    if (ext === "xlsx" && docType === "faturamento") {
      try {
        console.log(`[extract] Processing Excel: ${fileName}`);
        const faturamento = await extractExcel(buffer);
        const filled = countFilledFields(faturamento);
        const hasMeses = Array.isArray(faturamento.meses) && faturamento.meses.length > 0;
        if (!hasMeses || filled === 0) {
          console.warn(`[extract] Excel parser retornou vazio (meses=${faturamento.meses?.length ?? 0}, filled=${filled}) — caindo pro Gemini como fallback`);
          // Prossegue para fluxo Gemini (nao retorna aqui)
        } else {
          return NextResponse.json({
            success: true,
            data: faturamento,
            meta: { rawTextLength: 0, filledFields: filled, isScanned: false, aiPowered: false },
          });
        }
      } catch (err) {
        console.error("[extract] Excel processing failed:", err);
        // Se falhar, tentar via IA
      }
    }

    // ──── Layer 3: extrair texto para detecção de subformato ────
    // PDFs textuais têm extração rápida (pdf-parse). O texto extraído aqui é reutilizado
    // no modo texto para Gemini, evitando dupla extração.
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let rawPdfText = "";
    let pdfParseMs = 0;
    if (ext === "pdf") {
      const t0 = Date.now();
      rawPdfText = await extractText(buffer, "pdf");
      pdfParseMs = Date.now() - t0;
      console.log(`[extract] pdf-parse ${docType} ${(buffer.length / 1024).toFixed(0)}KB → ${rawPdfText.length} chars em ${pdfParseMs}ms`);
    }
    const subformat = detectSubformat(docType, rawPdfText);
    if (subformat !== "DEFAULT") {
      console.log(`[extract] subformat detected: ${subformat}`);
    }

    // ──── Selecionar prompt (Layer 3: especializado por subformato) ────
    let prompt: string;
    switch (docType) {
      case "cnpj":       prompt = PROMPT_CNPJ; break;
      case "qsa":        prompt = PROMPT_QSA; break;
      case "contrato":   prompt = PROMPT_CONTRATO; break;
      case "faturamento":
        if (subformat === "FAT_DAS")      prompt = PROMPT_FAT_DAS;
        else if (subformat === "FAT_BANCARIO") prompt = PROMPT_FAT_BANCARIO;
        else                               prompt = PROMPT_FATURAMENTO;
        break;
      case "scr": {
        if (subformat === "SCR_BACEN_SEM_DADOS") prompt = PROMPT_SCR_SEM_DADOS;
        else if (subformat === "SCR_BUREAU")     prompt = PROMPT_SCR_BUREAU;
        else {
          const tipoEsperado = slot === "scr_socio" ? "PF" : "PJ";
          prompt = PROMPT_SCR.replace("{{TIPO_ESPERADO}}", tipoEsperado);
        }
        break;
      }
      case "protestos":      prompt = PROMPT_PROTESTOS; break;
      case "processos":      prompt = PROMPT_PROCESSOS; break;
      case "grupoEconomico": prompt = PROMPT_GRUPO_ECONOMICO; break;
      case "curva_abc":      prompt = PROMPT_CURVA_ABC; break;
      case "dre":            prompt = PROMPT_DRE; break;
      case "balanco":        prompt = PROMPT_BALANCO; break;
      case "ir_socio":
        prompt = subformat === "IR_RECIBO" ? PROMPT_IR_RECIBO : PROMPT_IR_SOCIOS;
        break;
      case "relatorio_visita": prompt = PROMPT_RELATORIO_VISITA; break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Preparar conteúdo ────
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    // Estratégia: TEXTO PRIMEIRO sempre que pdf-parse extraiu conteúdo útil.
    // Modo texto é 3-5x mais rápido que visual e cabe folgado nos 52s.
    // Visual é reservado para tipos onde layout/assinaturas importam (contrato, relatório de visita)
    // ou quando pdf-parse não conseguiu extrair texto útil (PDF escaneado).
    const VISUAL_ONLY_TYPES = ["contrato", "relatorio_visita"];
    // PDF escaneado heurística: arquivo grande (>50KB) mas texto extraído muito escasso (<1500 chars)
    // indica que pdf-parse só leu metadados/cabeçalho — o conteúdo real está em imagem.
    const isLikelyScanned = buffer.length > 51200 && rawPdfText.trim().length < 1500;
    const hasUsefulText = !isLikelyScanned && rawPdfText.trim().length > 200 && /\d/.test(rawPdfText);
    // Fallback visual reservado apenas para faturamento com texto muito grande.
    // curva_abc removida: maxChars=60k suporta PDFs grandes em modo texto, e modo visual
    // falha silenciosamente (retorna clientes:[]) quando o PDF tem centenas de linhas.
    const LARGE_TEXT_FALLBACK_VISUAL = ["faturamento"];
    const isLargeText = rawPdfText.length > 25000;
    const shouldFallbackToVisual = LARGE_TEXT_FALLBACK_VISUAL.includes(docType) && isLargeText;

    if (isImage) {
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else if (ext === "pdf") {
      if (VISUAL_ONLY_TYPES.includes(docType)) {
        // Tipos onde o visual importa (assinaturas em contrato, layout em relatório de visita)
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
        console.log(`[extract] ${docType} — modo visual (tipo requer leitura visual)`);
      } else if (shouldFallbackToVisual) {
        // Texto muito grande (>25k chars) — modo texto trava no prompt; cai pra visual
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
        console.log(`[extract] ${docType} — modo visual (fallback: texto grande, ${rawPdfText.length} chars)`);
      } else if (hasUsefulText) {
        // PDF digital com texto útil → modo texto rápido (cabe em ~5-8s)
        textContent = rawPdfText;
        console.log(`[extract] ${docType}/${subformat} — modo TEXTO (${rawPdfText.length} chars, ${pdfParseMs}ms)`);
      } else {
        // PDF escaneado/sem texto útil → cai pro Gemini visual
        if (isLikelyScanned) {
          console.log(`[extract] ${docType} — modo visual (PDF escaneado detectado: ${rawPdfText.trim().length} chars em ${Math.round(buffer.length/1024)}KB)`);
        } else {
          console.log(`[extract] ${docType} — modo visual (texto insuficiente: ${rawPdfText.trim().length} chars)`);
        }
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
      }
    } else {
      // Formatos não-PDF (xlsx, docx, txt…): extrai texto normalmente
      textContent = await extractText(buffer, ext);
      if (!textContent.trim()) {
        if (docType !== "faturamento") {
          return NextResponse.json({
            error: "Não foi possível extrair texto do documento. Tente enviar em formato PDF.",
          }, { status: 422 });
        }
        console.warn(`[extract] faturamento: texto vazio para ext=${ext} — tentando Gemini sem conteúdo textual`);
      }
    }

    // Injeta hint do nome do arquivo no prompt para SCR — quando periodoReferencia
    // nao aparece no documento, Gemini pode usar o filename como pista de ultimo recurso.
    if (docType === "scr" && fileName) {
      prompt = `${prompt}\n\n═══ HINT DO NOME DO ARQUIVO ═══\nO arquivo foi enviado com o nome: "${fileName}"\nSe o documento nao declarar periodoReferencia claramente mas o nome do arquivo contem uma data (ex: "scr-11-2025.pdf", "bacen-2024-12.pdf"), use essa data como periodoReferencia (formato MM/AAAA). NUNCA retorne periodoReferencia vazio.`;
    }

    if (textContent) {
      const maxChars: Record<string, number> = {
        cnpj: 4000, qsa: 6000, faturamento: 20000, scr: 15000,
        protestos: 8000, processos: 12000, grupoEconomico: 8000,
        dre: 30000, balanco: 30000, ir_socio: 15000,
        curva_abc: 60000,
        // relatorio_visita / contrato → modo visual, não chegam aqui
      };
      textContent = textContent.substring(0, maxChars[docType] || 10000);
    }

    // Curva ABC com texto grande (>15k chars): tenta parser direto antes de chamar Gemini.
    // Parser direto extrai clientes via regex em <10ms, evitando timeout do modelo (400+ clientes
    // geram 10k+ tokens de output, ultrapassam os 45s disponíveis no Hobby plan).
    //
    // IMPORTANTE: usar `rawPdfText` (texto completo) e não `textContent` (truncado em 60k para
    // o Gemini). PDFs com 1000+ clientes ultrapassam 60k chars; truncar antes do regex faria
    // o parser ver só os primeiros clientes e devolver lista parcial silenciosamente.
    let _directCurvaABC: ReturnType<typeof directParseCurvaABC> | undefined;
    if (docType === "curva_abc" && textContent.length > 15000) {
      const sourceText = rawPdfText && rawPdfText.length > textContent.length ? rawPdfText : textContent;
      const dp = directParseCurvaABC(sourceText);
      if (dp && dp.clientes.length >= 5) {
        _directCurvaABC = dp;
        console.log(`[extract][curva_abc] Direct parse: ${dp.clientes.length} clientes, periodo="${dp.periodoReferencia}", total=${dp.totalFaturado} (sourceLen=${sourceText.length})`);
      } else {
        console.log(`[extract][curva_abc] Direct parse insuficiente (${dp?.clientes.length ?? 0} clientes) — usando Gemini`);
      }
    }

    console.log(`[extract] ${fileName} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── SSE stream — mantém conexão viva enquanto Gemini processa ────
    const enc = new TextEncoder();
    const _send = (ctrl: ReadableStreamDefaultController, ev: string, d: object) => {
      try { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); } catch { /* ignore if closed */ }
    };

    // Para documentos enviados como binário (vision), injeta instrução de leitura completa.
    // Sem isso, modelos multimodais podem processar só as primeiras páginas de PDFs longos.
    if (imageContent) {
      prompt = `INSTRUÇÃO CRÍTICA: Leia TODAS as páginas deste documento do início ao fim antes de extrair qualquer dado. Não pare nas primeiras páginas. Seções importantes como parâmetros, quadro societário, bens e direitos e conclusões geralmente estão nas últimas páginas.\n\n${prompt}`;
    }

    const _prompt = prompt;
    const _textContent = textContent;
    const _imageContent = imageContent;
    const _docType = docType;
    const _directCurvaABCBypass = _directCurvaABC;
    const _cacheDocType = cacheDocType;
    const _isImage = isImage;
    const _buffer = buffer;
    const maxOutputTokensMap: Record<string, number> = {
      cnpj: 4096, qsa: 4096, grupoEconomico: 4096, protestos: 4096,
      faturamento: 8192, scr: 8192, processos: 8192,
      dre: 8192, balanco: 8192,
      contrato: 8192, curva_abc: 32000, ir_socio: 8192, relatorio_visita: 8192,
    };
    const _maxOutputTokens = maxOutputTokensMap[docType] ?? 2048;

    // Thinking budget calibrado para Hobby plan (60s max total).
    // 2.5 Pro com 1024 tokens completa em ~15-35s; 512 em ~10-20s; 0 em ~5-15s.
    const thinkingBudgetMap: Record<string, number> = {
      relatorio_visita:  512,  // reduzido de 1024 — Files API + 3.1 Pro cascade pode exceder 52s
      contrato:          512,
      ir_socio:            0,  // tabelas/listas — thinking sem ganho; evita timeout no Hobby plan
      curva_abc:           0,  // tabela de clientes — sem raciocínio necessário
      faturamento:         0,  // extração de tabela simples — thinking adiciona latência sem ganho
      scr:               128,
      dre:               128,
      balanco:           128,
      processos:         128,
      protestos:           0,
      qsa:                 0,
      grupoEconomico:      0,
      cnpj:                0,
    };
    const _thinkingBudget = thinkingBudgetMap[docType] ?? 256;

    // Documentos que precisam de mais tempo por tentativa (texto longo + estrutura densa).
    // Override > 0 → callGemini usa 1 tentativa com esse timeout em vez de 2 × 15s.
    const perAttemptMsMap: Record<string, number> = {
      ir_socio: 30000,  // DIRPF pode ter 100+ linhas de bens/rendimentos — 30s por tentativa
      curva_abc: 45000, // Curva ABC pode ter 500+ clientes; texto 40k+ chars + saída 10k tokens — 45s
    };
    const _perAttemptMsOverride = perAttemptMsMap[docType] ?? 0;

    const stream = new ReadableStream({
      async start(controller) {
        const keepalive = setInterval(() => _send(controller, "keepalive", { ts: Date.now() }), 5000);

        const startTimeMs = Date.now();
        const zodWarnings: Array<{field: string; message: string}> = [];
        try {
          let data: AnyExtracted;
          let _rawAiResponse = "";
          const inputMode = _imageContent ? "binary" : "text";
          _send(controller, "status", { message: "Processando documento...", inputMode, textLen: _textContent.length, docType: _docType });

          if (_docType === "curva_abc" && _directCurvaABCBypass && _directCurvaABCBypass.clientes.length >= 5) {
            // Bypass: parser direto evitou timeout Gemini em arquivo com 400+ clientes
            data = fillCurvaABCDefaults(adaptCurvaABCNew({
              curva_abc_clientes: _directCurvaABCBypass.clientes,
              total_faturado: _directCurvaABCBypass.totalFaturado,
              periodo_referencia: _directCurvaABCBypass.periodoReferencia,
            }) as Partial<CurvaABCData>);
            console.log(`[extract][curva_abc] ${(data as CurvaABCData).clientes?.length ?? 0} clientes via parser direto — Gemini skipped`);
          } else {
          try {
            const aiResponse = await callAI(_prompt, _textContent, _imageContent, _maxOutputTokens, _imageContent ? _buffer : undefined, _thinkingBudget, _perAttemptMsOverride);
            _rawAiResponse = aiResponse;
            console.log(`[extract] AI response length: ${aiResponse.length}`);
            console.log(`[extract] AI raw response (first 1000 chars):`, aiResponse.substring(0, 1000));
            const rawParsed = parseJSON<Record<string, unknown>>(aiResponse);

            // ──── Validacao Zod por doc type (leniente + warnings) ────
            // Coerciona tipos, aplica defaults e acumula avisos de formato/negocio.
            // Nao bloqueia a resposta — so documenta problemas.
            let parsed: Record<string, unknown> = rawParsed;
            try {
              if (_docType === "cnpj") {
                // Adapter: novo prompt do Cartão CNPJ retorna snake_case + estrutura aninhada.
                // Converte para camelCase flat esperado pelo CNPJDataSchema antes da validação.
                const adapted = adaptCNPJNew(rawParsed);
                const r = safeParseExtracted(CNPJDataSchema, adapted as Record<string, unknown>, "cnpj");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "qsa") {
                const adapted = adaptQSANew(rawParsed);
                const r = safeParseExtracted(QSADataSchema, adapted as Record<string, unknown>, "qsa");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "contrato") {
                const adapted = adaptContratoNew(rawParsed);
                const r = safeParseExtracted(ContratoSocialDataSchema, adapted as Record<string, unknown>, "contrato");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "faturamento") {
                const adapted = adaptFaturamentoNew(rawParsed);
                const r = safeParseExtracted(FaturamentoDataSchema, adapted as Record<string, unknown>, "faturamento");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "scr") {
                const adapted = adaptSCRNew(rawParsed);
                const r = safeParseExtracted(SCRDataSchema, adapted as Record<string, unknown>, "scr");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              }
              // Docs sem schema Zod: roda o adapter direto (hydrator cuida dos defaults)
              if (_docType === "curva_abc")        parsed = adaptCurvaABCNew(rawParsed) as Record<string, unknown>;
              else if (_docType === "dre")         parsed = adaptDRENew(rawParsed)      as Record<string, unknown>;
              else if (_docType === "balanco")     parsed = adaptBalancoNew(rawParsed)  as Record<string, unknown>;
              else if (_docType === "ir_socio")    parsed = adaptIRNew(rawParsed)       as Record<string, unknown>;
              else if (_docType === "relatorio_visita") {
                const adaptedVisita = adaptVisitaNew(rawParsed) as Record<string, unknown>;
                const rv = safeParseExtracted(RelatorioVisitaSchema, adaptedVisita, "relatorio_visita");
                parsed = rv.data as unknown as Record<string, unknown>;
                zodWarnings.push(...rv.warnings);
              }
              // Audit de regras de negocio (range, coerencia, formato)
              const businessWarnings = auditBusinessRules(_docType, parsed);
              zodWarnings.push(...businessWarnings);
              if (zodWarnings.length > 0) {
                console.warn(`[extract][${_docType}] ${zodWarnings.length} warning(s) de validacao`);
              }
            } catch (zodErr) {
              console.warn(`[extract][${_docType}] zod falhou, seguindo com rawParsed:`, zodErr instanceof Error ? zodErr.message : zodErr);
              parsed = rawParsed;
            }

            switch (_docType) {
              case "cnpj": {
                data = fillCNPJDefaults(parsed as Partial<CNPJData>);
                // Bonus: se o Cartão CNPJ incluir QSA detectado, guarda para usar como QSA automático
                const qsaDetectado = (parsed as Record<string, unknown>).qsaDetectado as Array<{nome?:string;cpfCnpj?:string;qualificacao?:string;dataEntrada?:string}> | undefined;
                if (Array.isArray(qsaDetectado) && qsaDetectado.length > 0) {
                  const validSocios = qsaDetectado.filter(s => s && s.nome && s.nome.trim().length > 2);
                  if (validSocios.length > 0) {
                    (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado = {
                      capitalSocial: (parsed as Record<string, unknown>).capitalSocialCNPJ as string || "",
                      quadroSocietario: validSocios.map(s => ({
                        nome: s.nome || "",
                        cpfCnpj: s.cpfCnpj || "",
                        qualificacao: s.qualificacao || "",
                        participacao: "",
                        dataEntrada: s.dataEntrada || "",
                      })),
                    };
                    console.log(`[extract][cnpj] QSA detectado no cartão: ${validSocios.length} sócios`);
                  }
                }
                break;
              }
              case "qsa": {
                data = fillQSADefaults(parsed as Partial<QSAData>);
                const n = (data as QSAData).quadroSocietario?.length ?? 0;
                console.log(`[extract][qsa] Gemini retornou ${n} socio(s) apos filtro. capitalSocial="${(data as QSAData).capitalSocial || "vazio"}"`);
                if (n === 0) {
                  console.warn(`[extract][qsa] NENHUM SOCIO EXTRAIDO — verifique o documento e o prompt. parsed keys: ${Object.keys(parsed as object).join(", ")}`);
                }
                break;
              }
              case "contrato": {
                data = fillContratoDefaults(parsed as Partial<ContratoSocialData>);
                const cd = data as ContratoSocialData;
                const n = cd.socios?.length ?? 0;
                console.log(`[extract][contrato] socios=${n} capitalSocial="${cd.capitalSocial || "vazio"}" objetoSocial=${cd.objetoSocial ? `${cd.objetoSocial.length}c` : "vazio"} dataConst="${cd.dataConstituicao || "vazio"}" temAlteracoes=${cd.temAlteracoes}`);
                if (n === 0 && !cd.capitalSocial && !cd.objetoSocial) {
                  console.warn(`[extract][contrato] NENHUM CAMPO EXTRAIDO — verifique documento. parsed keys: ${Object.keys(parsed as object).join(", ")}`);
                }
                break;
              }
              case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
              case "scr": {
                data = fillSCRDefaults(parsed as Partial<SCRData>);
                const scrData = data as SCRData;
                // Override de tipoPessoa baseado no slot do frontend — elimina a dependencia
                // do Gemini inferir PJ/PF corretamente.
                if (slot === "scr_socio" || slot === "scr_socio_anterior") {
                  if (scrData.tipoPessoa !== "PF") {
                    console.log(`[extract][scr] slot=${slot} forcando tipoPessoa=PF (Gemini retornou "${scrData.tipoPessoa || "vazio"}")`);
                  }
                  scrData.tipoPessoa = "PF";
                } else if (slot === "scr" || slot === "scrAnterior") {
                  if (scrData.tipoPessoa !== "PJ") {
                    console.log(`[extract][scr] slot=${slot} forcando tipoPessoa=PJ (Gemini retornou "${scrData.tipoPessoa || "vazio"}")`);
                  }
                  scrData.tipoPessoa = "PJ";
                }
                // Persiste o slot original do upload como hint determinístico para
                // a hidratação decidir atual/anterior quando periodoReferencia falhar.
                if (slot) {
                  (scrData as SCRData & { _slotHint?: string })._slotHint = slot;
                }
                console.log(`[extract][scr] slot=${slot || "nenhum"} periodoRef="${scrData.periodoReferencia || "VAZIO"}" tipoPessoa="${scrData.tipoPessoa || "VAZIO"}" cnpjSCR="${scrData.cnpjSCR || ""}" cpfSCR="${scrData.cpfSCR || ""}" totalDividas="${scrData.totalDividasAtivas || "0"}"`);
                if (!scrData.periodoReferencia) {
                  console.warn(`[extract][scr] SEM periodoReferencia — ordenacao atual/anterior vai falhar`);
                }
                const periodoAnterior = (parsed as Record<string, unknown>).periodoAnterior as Partial<SCRData> | undefined;
                if (periodoAnterior && periodoAnterior.periodoReferencia) {
                  (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior = fillSCRDefaults(periodoAnterior);
                  (data as SCRData & { _variacoes?: Record<string, string> })._variacoes =
                    ((parsed as Record<string, unknown>).variacoes as Record<string, string>) || {};
                  console.log(`[extract][scr] Periodo anterior detectado no mesmo doc: ${periodoAnterior.periodoReferencia}`);
                }
                break;
              }
              case "protestos":        data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
              case "processos":        data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
              case "grupoEconomico":   data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
              case "curva_abc":        data = fillCurvaABCDefaults(parsed as Partial<CurvaABCData>); break;
              case "dre":              data = fillDREDefaults(parsed as Partial<DREData>); break;
              case "balanco":          data = fillBalancoDefaults(parsed as Partial<BalancoData>); break;
              case "ir_socio":         data = fillIRSocioDefaults(parsed as Partial<IRSocioData>); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults(parsed as Partial<RelatorioVisitaData>); break;
              default:                 data = fillCNPJDefaults(parsed as Partial<CNPJData>);
            }
          } catch (aiError) {
            const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
            console.error(`[extract] AI failed:`, errMsg);
            console.error(`[extract] Context: inputMode=${inputMode} | docType=${_docType}`);
            console.error(`[extract] Input preview:`, inputMode === "text"
              ? _textContent.substring(0, 200)
              : `[binary ${_imageContent?.mimeType}, base64 len: ${_imageContent?.base64.length}]`
            );

            switch (_docType) {
              case "cnpj":           data = fillCNPJDefaults({}); break;
              case "qsa":            data = fillQSADefaults({}); break;
              case "contrato":       data = fillContratoDefaults({}); break;
              case "faturamento":    data = fillFaturamentoDefaults({}); break;
              case "scr":            data = fillSCRDefaults({}); break;
              case "protestos":      data = fillProtestosDefaults({}); break;
              case "processos":      data = fillProcessosDefaults({}); break;
              case "grupoEconomico": data = fillGrupoEconomicoDefaults({}); break;
              case "curva_abc":      data = fillCurvaABCDefaults({}); break;
              case "dre":            data = fillDREDefaults({}); break;
              case "balanco":        data = fillBalancoDefaults({}); break;
              case "ir_socio":       data = fillIRSocioDefaults({}); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults({}); break;
              default:               data = fillCNPJDefaults({});
            }

            let errorType: "quota" | "parse" | "empty" | "unknown" = "unknown";
            if (errMsg.includes("429") || errMsg.includes("EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("rate")) {
              errorType = "quota";
            } else if (errMsg.includes("TIMEOUT") || errMsg.includes("timed out") || errMsg.includes("AbortError")) {
              errorType = "quota"; // timeout → "API indisponível" é mais útil que "formato inválido"
            } else if (errMsg.includes("JSON") || errMsg.includes("parse") || errMsg.includes("SyntaxError")) {
              errorType = "parse";
            } else if (errMsg.includes("empty") || errMsg.includes("length: 0") || errMsg.includes("Empty")) {
              errorType = "empty";
            }

            // success: false quando IA falhou — o frontend trata como erro visivel
            // em vez de fingir sucesso com dados vazios
            _send(controller, "result", {
              success: false, data,
              error: errMsg.substring(0, 200),
              meta: { rawTextLength: _textContent.length, filledFields: 0, isScanned: _isImage, aiError: true, errorType, errorMessage: errMsg.substring(0, 200) },
            });
            return;
          }
          } // end else (AI path — skipped when curva_abc bypass active)

          const filled = countFilledFields(data);
          const scrAnteriorExtra = (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
          const variacoesExtra = (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          if (scrAnteriorExtra) {
            delete (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
            delete (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          }
          // QSA detectado automaticamente no Cartão CNPJ
          const qsaDetectadoExtra = (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado;
          if (qsaDetectadoExtra) {
            delete (data as CNPJData & { _qsaDetectado?: QSAData })._qsaDetectado;
          }

          // Injeta warnings de validação dentro do próprio data com prefixo
          // "_warnings" (meta-field, strippado na hidratação). Permite que o
          // histórico/UI exibam badges por documento sem mexer no fluxo de estado.
          const dataWithMeta = zodWarnings.length > 0
            ? { ...(data as unknown as Record<string, unknown>), _warnings: zodWarnings }
            : data;

          _send(controller, "result", {
            success: true, data: dataWithMeta,
            ...(scrAnteriorExtra ? { scrAnterior: scrAnteriorExtra, variacoes: variacoesExtra } : {}),
            ...(qsaDetectadoExtra ? { qsaDetectado: qsaDetectadoExtra } : {}),
            meta: { rawTextLength: _textContent.length, filledFields: filled, isScanned: _isImage, aiPowered: true, warningsCount: zodWarnings.length },
          });

          // Grava no cache de extracao — fire-and-forget, nunca bloqueia a resposta.
          // So cacheia quando a extracao veio util (filled > 0).
          if (cachedUserId && filled > 0) {
            (async () => {
              try {
                const supaCacheWrite = createServerSupabase();
                await supaCacheWrite.from("extraction_cache").upsert({
                  user_id: cachedUserId,
                  file_hash: fileHash,
                  doc_type: cacheDocType,
                  extracted_data: data as unknown as Record<string, unknown>,
                  filled_fields: filled,
                }, { onConflict: "user_id,file_hash,doc_type" });
                console.log(`[extract][cache] gravado ${_cacheDocType} hash=${fileHash.substring(0, 12)} filled=${filled}`);
              } catch (e) {
                console.warn(`[extract][cache] falha ao gravar (ignorado):`, e instanceof Error ? e.message : e);
              }
            })();
          }

          // Metricas de extracao — fire-and-forget. Captura cada extracao para
          // futuro diagnostico de quais campos falham mais por doc type.
          if (cachedUserId) {
            const duracaoMs = Date.now() - startTimeMs;
            (async () => {
              try {
                const supaMetrics = createServerSupabase();
                await supaMetrics.from("extraction_metrics").insert({
                  user_id: cachedUserId,
                  doc_type: _docType,
                  filled_fields: filled,
                  input_mode: inputMode,
                  text_length: _textContent.length,
                  duration_ms: duracaoMs,
                  ai_powered: true,
                  cached: false,
                  zod_warnings: zodWarnings.length > 0 ? zodWarnings : null,
                  input_chars: _textContent.length || null,
                  raw_response: (filled === 0 || _docType === "relatorio_visita") ? _rawAiResponse.slice(0, 5000) || null : null,
                });
              } catch { /* nunca falha a requisicao */ }
            })();
          }
        } catch (err) {
          console.error("[extract] Stream error:", err instanceof Error ? err.message : err);
          _send(controller, "result", { success: false, error: "Erro interno ao processar o documento." });
        } finally {
          clearInterval(keepalive);
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
