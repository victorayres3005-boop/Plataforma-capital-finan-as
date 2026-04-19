export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, ProtestosData, ProcessosData, GrupoEconomicoData, CurvaABCData, DREData, BalancoData, IRSocioData, RelatorioVisitaData } from "@/types";
import { sanitizeDescricaoDebitos, sanitizeStr, sanitizeEnum, sanitizeMoney } from "@/lib/extract/sanitize";
import {
  CNPJDataSchema, QSADataSchema, ContratoSocialDataSchema, FaturamentoDataSchema, SCRDataSchema,
  safeParseExtracted, auditBusinessRules,
} from "@/lib/extract/schemas";
import {
  PROMPT_CNPJ, PROMPT_QSA, PROMPT_CONTRATO, PROMPT_FATURAMENTO, PROMPT_SCR,
  PROMPT_PROTESTOS, PROMPT_PROCESSOS, PROMPT_GRUPO_ECONOMICO, PROMPT_CURVA_ABC,
  PROMPT_DRE, PROMPT_BALANCO, PROMPT_IR_SOCIOS, PROMPT_RELATORIO_VISITA,
} from "@/lib/prompts/extract";

export const runtime = "nodejs";

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];

const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS: string[] = [];

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



function hasReadableContent(text: string): boolean {
  const sample = text.substring(2000, Math.min(text.length, 8000));
  if (sample.length < 100) return text.trim().length >= 20;

  // Check 1: ratio de caracteres estranhos (fora ASCII 32-126 + acentuados PT-BR)
  const validChars = /[\x20-\x7EÀ-ÿçÇãÃõÕáéíóúâêîôûàèìòùäëïöü\n\r\t]/;
  let strangeCount = 0;
  for (let i = 0; i < sample.length; i++) {
    if (!validChars.test(sample[i])) strangeCount++;
  }
  if (strangeCount / sample.length > 0.3) {
    console.log(`[hasReadableContent] Failed: ${(strangeCount / sample.length * 100).toFixed(1)}% strange chars`);
    return false;
  }

  // Check 2: sequências longas sem espaço (encoding quebrado)
  const longSequences = sample.match(/\S{50,}/g);
  if (longSequences && longSequences.length >= 3) {
    console.log(`[hasReadableContent] Failed: ${longSequences.length} sequences with 50+ chars without spaces`);
    return false;
  }

  // Check 3: ratio de palavras reconhecíveis (PT-BR)
  const words = sample.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 0) {
    const recognizable = /^[a-zA-ZÀ-ÿçÇ0-9.,;:!?()\-/]+$/;
    const recognizedCount = words.filter(w => recognizable.test(w)).length;
    const ratio = recognizedCount / words.length;
    if (ratio < 0.4) {
      console.log(`[hasReadableContent] Failed: only ${(ratio * 100).toFixed(1)}% recognizable words (${recognizedCount}/${words.length})`);
      return false;
    }
  }

  // Check 4: palavras comuns em português (check original)
  const commonWords = /\b(de|do|da|dos|das|que|para|com|por|uma|não|são|será|social|capital|sócio|contrato|empresa|sociedade|cnpj|cpf|quotas|artigo|cláusula|objeto|prazo|foro|comarca|administra|faturamento|receita|valor|total|mês|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi;
  const matches = sample.match(commonWords);
  return (matches?.length || 0) >= 5;
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
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
async function callGemini(prompt: string, content: string | { mimeType: string; base64: string }, maxOutputTokens = 2048): Promise<string> {
  // Estrutura otimizada para o caching implicito do Gemini 2.5:
  // o PROMPT (estatico, ~400 linhas no CONTRATO) vai PRIMEIRO em uma part isolada,
  // e o conteudo dinamico vai depois. Quando a mesma extracao se repete (mesmo
  // prompt = mesmo prefixo), o Gemini aplica desconto de ~70-90% em input tokens
  // automaticamente, sem precisar de cached content endpoint.
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  parts.push({ text: prompt });
  if (typeof content === "string") {
    parts.push({ text: "\n\n--- DOCUMENTO ---\n\n" + content });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
  }

  const startIdx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
  const rotatedKeys = [...GEMINI_API_KEYS.slice(startIdx), ...GEMINI_API_KEYS.slice(0, startIdx)];
  const MAX_ATTEMPTS = 2; // 1 tentativa + 1 retry com backoff em 503/429
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  for (const apiKey of rotatedKeys) {
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`[Gemini] key=${apiKey.substring(0, 8)}... model=${model} attempt=${attempt + 1}/${MAX_ATTEMPTS}`);
          const controller = new AbortController();
          const fetchTimeout = setTimeout(() => controller.abort(), 25000);
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens,
                responseMimeType: "application/json",
                ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
          });
          clearTimeout(fetchTimeout);

          // 429/503: erros transitorios — backoff exponencial e tenta de novo
          if (response.status === 429 || response.status === 503) {
            if (attempt < MAX_ATTEMPTS - 1) {
              const backoffMs = 1000 * Math.pow(2, attempt); // 1s, 2s
              console.log(`[Gemini] HTTP ${response.status} key=${apiKey.substring(0, 8)} model=${model}, backoff ${backoffMs}ms`);
              await sleep(backoffMs);
              continue;
            }
            console.log(`[Gemini] HTTP ${response.status} esgotou retries — skip para proximo model/key`);
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
            console.error(`[Gemini] Empty response, parts:`, JSON.stringify(parts2).substring(0, 200));
            break;
          }
          return text;
        } catch (err) {
          // AbortError (timeout) e erros de rede: retry uma vez
          const isAbort = err instanceof Error && err.name === "AbortError";
          if (isAbort && attempt < MAX_ATTEMPTS - 1) {
            console.warn(`[Gemini] timeout key=${apiKey.substring(0, 8)} model=${model}, tentando de novo`);
            await sleep(500);
            continue;
          }
          console.error(`[Gemini] Error:`, err instanceof Error ? err.message : err);
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
): Promise<string> {
  const content: string | { mimeType: string; base64: string } = imageContent ?? textContent;

  // Timeout global de 45s — evita que a função fique pendurada
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT_55s")), 55000)
  );

  const aiCall = async (): Promise<string> => {
    try {
      return await callGemini(prompt, content, maxOutputTokens);
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
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[parseJSON] Falha ao parsear resposta da IA:", (err as Error).message, "| raw (primeiros 500 chars):", raw.slice(0, 500));
    // Retorna objeto vazio ao invés de crash — fillXxxDefaults vai preencher campos padrão
    return {} as T;
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
        console.warn(`[extract][qsa] socio parcial mantido: nome="${s.nome || "—"}" cpf="${s.cpfCnpj || "—"}"`);
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
        console.warn(`[extract][contrato] socio parcial mantido: nome="${s.nome || "—"}" cpf="${s.cpf || "—"}"`);
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
  const dividasOnus        = sanitizeMoney(data.dividasOnus);

  // Reconciliação de totalBensDireitos.
  // O Gemini às vezes retorna um total que é só o primeiro item da lista (ex: "640k" quando
  // na verdade o total é 1.2M), ou retorna subcategorias incompletas. Quando há divergência
  // significativa, usamos o MAIOR dos dois — parte-se da premissa de que o menor está
  // incompleto (o agregador raramente inventa valor, mas frequentemente perde itens).
  const totalDoc   = parseMoney(data.totalBensDireitos);
  const totalCalc  = parseMoney(bensImoveis) + parseMoney(bensVeiculos) + parseMoney(aplicacoes) + parseMoney(outrosBens);
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
    // Validar Content-Type antes de tentar parsear FormData
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "Request deve ser multipart/form-data com o arquivo anexado.", success: false },
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

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 20MB." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return NextResponse.json({ error: `Formato .${ext} não suportado.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ──── Cache de extracao por hash (sha256 do arquivo) ────
    // Se o mesmo PDF ja foi extraido antes pelo mesmo usuario e doc_type,
    // retorna o resultado cacheado instantaneamente (zero tokens Gemini).
    // Gracioso: se a tabela ainda nao existe ou o query falha, segue fluxo normal.
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    let cachedUserId: string | null = null;
    try {
      const supaCache = createServerSupabase();
      const { data: userData } = await supaCache.auth.getUser();
      cachedUserId = userData.user?.id || null;
      if (cachedUserId) {
        const { data: cached } = await supaCache
          .from("extraction_cache")
          .select("extracted_data, filled_fields")
          .eq("user_id", cachedUserId)
          .eq("file_hash", fileHash)
          .eq("doc_type", docType)
          .maybeSingle();
        if (cached?.extracted_data) {
          console.log(`[extract][cache] HIT ${docType} hash=${fileHash.substring(0, 12)} (${cached.filled_fields ?? "?"} campos)`);
          return NextResponse.json({
            success: true,
            data: cached.extracted_data,
            meta: { rawTextLength: 0, filledFields: cached.filled_fields ?? 0, isScanned: false, aiPowered: false, cached: true },
          });
        }
      }
    } catch (cacheErr) {
      console.warn(`[extract][cache] lookup falhou (seguindo sem cache):`, cacheErr instanceof Error ? cacheErr.message : cacheErr);
    }

    // ──── Excel: processamento direto sem IA ────
    // Se o parser Excel retornar vazio OU lancar erro, cai pro Gemini como fallback
    // (evita que analista veja "faturamento vazio" sem aviso quando o XLSX foge do formato).
    if (ext === "xlsx" && docType === "faturamento") {
      try {
        console.log(`[extract] Processing Excel: ${file.name}`);
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

    // ──── Selecionar prompt ────
    let prompt: string;
    switch (docType) {
      case "cnpj":       prompt = PROMPT_CNPJ; break;
      case "qsa":        prompt = PROMPT_QSA; break;
      case "contrato":   prompt = PROMPT_CONTRATO; break;
      case "faturamento": prompt = PROMPT_FATURAMENTO; break;
      case "scr":            prompt = PROMPT_SCR; break;
      case "protestos":      prompt = PROMPT_PROTESTOS; break;
      case "processos":      prompt = PROMPT_PROCESSOS; break;
      case "grupoEconomico": prompt = PROMPT_GRUPO_ECONOMICO; break;
      case "curva_abc":      prompt = PROMPT_CURVA_ABC; break;
      case "dre":            prompt = PROMPT_DRE; break;
      case "balanco":        prompt = PROMPT_BALANCO; break;
      case "ir_socio":       prompt = PROMPT_IR_SOCIOS; break;
      case "relatorio_visita": prompt = PROMPT_RELATORIO_VISITA; break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Preparar conteúdo ────
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    if (isImage) {
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else {
      // Sempre tenta extrair texto primeiro (muito mais barato em tokens)
      textContent = await extractText(buffer, ext);
      // Mínimos por tipo de doc — quando pdf-parse falha em layouts com tabelas/colunas,
      // o texto sai suspeitosamente curto. Abaixo do limiar, cai pro Gemini multimodal
      // (que lê o PDF nativo e ignora o text extractor).
      const minTextByDoc: Record<string, number> = {
        cnpj: 500, qsa: 500, contrato: 5000, faturamento: 800,
        scr: 800, protestos: 500, processos: 1000, grupoEconomico: 800,
        dre: 1500, balanco: 1500, curva_abc: 800, ir_socio: 1500,
        relatorio_visita: 800,
      };
      const minRequired = minTextByDoc[docType] ?? 500;
      const trimmedLen = textContent.trim().length;
      const hasContent = hasReadableContent(textContent);
      const isUsableText = trimmedLen >= minRequired && hasContent;

      if (!isUsableText && ext === "pdf") {
        console.log(`[extract] PDF text insuficiente (${trimmedLen} < ${minRequired} para ${docType}), enviando como binario`);
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
      } else if (!isUsableText) {
        return NextResponse.json({
          error: "Não foi possível extrair texto do documento. Tente enviar em outro formato.",
        }, { status: 422 });
      }
    }

    // Injeta hint do nome do arquivo no prompt para SCR — quando periodoReferencia
    // nao aparece no documento, Gemini pode usar o filename como pista de ultimo recurso.
    if (docType === "scr" && file.name) {
      prompt = `${prompt}\n\n═══ HINT DO NOME DO ARQUIVO ═══\nO arquivo foi enviado com o nome: "${file.name}"\nSe o documento nao declarar periodoReferencia claramente mas o nome do arquivo contem uma data (ex: "scr-11-2025.pdf", "bacen-2024-12.pdf"), use essa data como periodoReferencia (formato MM/AAAA). NUNCA retorne periodoReferencia vazio.`;
    }

    if (textContent) {
      const maxChars: Record<string, number> = {
        cnpj: 4000, qsa: 6000, contrato: 12000, faturamento: 10000, scr: 15000,
        protestos: 8000, processos: 12000, grupoEconomico: 8000,
        curva_abc: 6000, dre: 12000, balanco: 12000, ir_socio: 5000, relatorio_visita: 8000,
      };
      textContent = textContent.substring(0, maxChars[docType] || 10000);
    }

    console.log(`[extract] ${file.name} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── SSE stream — mantém conexão viva enquanto Gemini processa ────
    const enc = new TextEncoder();
    const _send = (ctrl: ReadableStreamDefaultController, ev: string, d: object) => {
      try { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); } catch { /* ignore if closed */ }
    };

    const _prompt = prompt;
    const _textContent = textContent;
    const _imageContent = imageContent;
    const _docType = docType;
    const _isImage = isImage;
    const maxOutputTokensMap: Record<string, number> = {
      cnpj: 4096, qsa: 4096, contrato: 4096, faturamento: 8192, scr: 8192,
      protestos: 8192, processos: 8192, grupoEconomico: 4096,
      curva_abc: 8192, dre: 8192, balanco: 8192, ir_socio: 4096, relatorio_visita: 4096,
    };
    const _maxOutputTokens = maxOutputTokensMap[docType] ?? 2048;

    const stream = new ReadableStream({
      async start(controller) {
        const keepalive = setInterval(() => _send(controller, "keepalive", { ts: Date.now() }), 5000);

        const startTimeMs = Date.now();
        const zodWarnings: Array<{field: string; message: string}> = [];
        try {
          let data: AnyExtracted;
          const inputMode = _imageContent ? "binary" : "text";
          _send(controller, "status", { message: "Processando documento...", inputMode, textLen: _textContent.length, docType: _docType });

          try {
            const aiResponse = await callAI(_prompt, _textContent, _imageContent, _maxOutputTokens);
            console.log(`[extract] AI response length: ${aiResponse.length}`);
            console.log(`[extract] AI raw response (first 1000 chars):`, aiResponse.substring(0, 1000));
            const rawParsed = parseJSON<Record<string, unknown>>(aiResponse);

            // ──── Validacao Zod por doc type (leniente + warnings) ────
            // Coerciona tipos, aplica defaults e acumula avisos de formato/negocio.
            // Nao bloqueia a resposta — so documenta problemas.
            let parsed: Record<string, unknown> = rawParsed;
            try {
              if (_docType === "cnpj") {
                const r = safeParseExtracted(CNPJDataSchema, rawParsed, "cnpj");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "qsa") {
                const r = safeParseExtracted(QSADataSchema, rawParsed, "qsa");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "contrato") {
                const r = safeParseExtracted(ContratoSocialDataSchema, rawParsed, "contrato");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "faturamento") {
                const r = safeParseExtracted(FaturamentoDataSchema, rawParsed, "faturamento");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
              } else if (_docType === "scr") {
                const r = safeParseExtracted(SCRDataSchema, rawParsed, "scr");
                parsed = r.data as unknown as Record<string, unknown>;
                zodWarnings.push(...r.warnings);
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
                  doc_type: _docType,
                  extracted_data: data as unknown as Record<string, unknown>,
                  filled_fields: filled,
                }, { onConflict: "user_id,file_hash,doc_type" });
                console.log(`[extract][cache] gravado ${_docType} hash=${fileHash.substring(0, 12)} filled=${filled}`);
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
