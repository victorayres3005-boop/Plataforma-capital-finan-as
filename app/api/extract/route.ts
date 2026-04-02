import { NextRequest, NextResponse } from "next/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, ProtestosData, ProcessosData, GrupoEconomicoData } from "@/types";
import type { SCRModalidade, SCRInstituicao, QSASocio, Socio } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─────────────────────────────────────────
// API Keys & Config (kept for AI fallback)
// ─────────────────────────────────────────
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const GEMINI_MODELS_CRITICAL = ["gemini-2.5-flash", "gemini-2.0-flash"];
const GROQ_MODEL = "llama-3.3-70b-versatile";

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function hasReadableContent(text: string): boolean {
  const sample = text.substring(2000, Math.min(text.length, 8000));
  if (sample.length < 100) return text.trim().length >= 20;
  const commonWords = /\b(de|do|da|dos|das|que|para|com|por|uma|não|são|será|social|capital|sócio|contrato|empresa|sociedade|cnpj|cpf|quotas|artigo|cláusula|objeto|prazo|foro|comarca|administra|faturamento|receita|valor|total|mês|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi;
  const matches = sample.match(commonWords);
  return (matches?.length || 0) >= 5;
}

function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const keepStart = Math.floor(maxChars * 0.6);
  const keepEnd = maxChars - keepStart - 50;
  return text.substring(0, keepStart) + "\n\n[...documento parcialmente omitido por limite de tamanho...]\n\n" + text.substring(text.length - keepEnd);
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

  if (workbook.worksheets.length === 0) throw new Error("Planilha vazia");

  // Estratégia: procurar colunas com meses e valores
  const monthNames: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    janeiro: "01", fevereiro: "02", "março": "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };

  for (const sheet of workbook.worksheets) {
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

          // ISO format: 2025-01
          const isoMatch = str.match(/^(\d{4})-(\d{1,2})$/);
          if (isoMatch && !mesStr) {
            mesStr = `${isoMatch[2].padStart(2, "0")}/${isoMatch[1]}`;
          }

          // Short month format: JAN/25 or jan/2025
          const shortMonthMatch = str.match(/^([a-zç]{3})\/?(\d{2,4})$/i);
          if (shortMonthMatch && !mesStr) {
            const monthNum = monthNames[shortMonthMatch[1].toLowerCase()];
            if (monthNum) {
              const year = shortMonthMatch[2].length === 2 ? `20${shortMonthMatch[2]}` : shortMonthMatch[2];
              mesStr = `${monthNum}/${year}`;
            }
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
  }

  // Calcular soma e média
  const valores = meses.map(m => {
    const num = parseFloat(m.valor.replace(/\./g, "").replace(",", "."));
    return isNaN(num) ? 0 : num;
  });

  const soma = valores.reduce((a, b) => a + b, 0);
  const media = valores.length > 0 ? soma / valores.length : 0;

  // Verificar alertas
  const faturamentoZerado = valores.length === 0 || valores.every(v => v === 0);
  const ultimoMes = meses.length > 0 ? meses[meses.length - 1].mes : "";

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
  };
}

// ─────────────────────────────────────────
// LOCAL EXTRACTION: Regex/pattern-matching
// ─────────────────────────────────────────

/** Helper: match the first pattern that returns a non-empty capture group */
function regexGet(text: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]?.trim()) return m[1].trim();
  }
  return "";
}

/** Helper: find a monetary value near a keyword */
function findValue(text: string, keywords: string[]): string {
  for (const kw of keywords) {
    const pattern = new RegExp(kw + '[:\\s]*(?:R\\$\\s*)?([\\d.,]+)', 'i');
    const m = text.match(pattern);
    if (m) return m[1];
  }
  return "";
}

// ── CNPJ ──
function localExtractCNPJ(text: string): CNPJData {
  const get = (patterns: RegExp[]): string => regexGet(text, patterns);

  const logradouro = get([/LOGRADOURO[:\s]*(.+?)(?:\n|$)/i]);
  const numero = get([/(?:^|\n)\s*N[ÚU]MERO[:\s]*(.+?)(?:\n|$)/i]);
  const complemento = get([/COMPLEMENTO[:\s]*(.+?)(?:\n|$)/i]);
  const bairro = get([/BAIRRO(?:\/DISTRITO)?[:\s]*(.+?)(?:\n|$)/i]);
  const cep = get([/CEP[:\s]*([\d.\-]+)/i]);
  const municipio = get([/MUNIC[ÍI]PIO[:\s]*(.+?)(?:\n|$)/i]);
  const uf = get([/\bUF[:\s]*([A-Z]{2})/i]);

  const enderecoPartes = [logradouro, numero, complemento, bairro, municipio, uf, cep].filter(Boolean);
  const endereco = enderecoPartes.join(", ");

  return {
    cnpj: get([
      /(?:N[ÚU]MERO DE INSCRI[ÇC][ÃA]O|CNPJ)[:\s]*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i,
      /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/,
    ]),
    razaoSocial: get([/(?:NOME EMPRESARIAL|RAZ[ÃA]O SOCIAL)[:\s]*(.+?)(?:\n|$)/i]),
    nomeFantasia: get([
      /(?:NOME DE FANTASIA|T[ÍI]TULO DO ESTABELECIMENTO)[^:]*[:\s]*(.+?)(?:\n|$)/i,
    ]),
    dataAbertura: get([/DATA DE ABERTURA[:\s]*(\d{2}\/\d{2}\/\d{4})/i]),
    situacaoCadastral: get([/SITUA[ÇC][ÃA]O CADASTRAL[:\s]*([A-Z\u00C0-\u00FF]+)/i]),
    dataSituacaoCadastral: get([/DATA DA SITUA[ÇC][ÃA]O CADASTRAL[:\s]*(\d{2}\/\d{2}\/\d{4})/i]),
    motivoSituacao: get([/MOTIVO DE SITUA[ÇC][ÃA]O CADASTRAL[:\s]*(.+?)(?:\n|$)/i]),
    naturezaJuridica: get([
      /(?:C[ÓO]DIGO E DESCRI[ÇC][ÃA]O DA NATUREZA JUR[ÍI]DICA)[:\s]*(.+?)(?:\n|$)/i,
      /(?:NATUREZA JUR[ÍI]DICA)[:\s]*(.+?)(?:\n|$)/i,
    ]),
    cnaePrincipal: get([
      /(?:C[ÓO]DIGO E DESCRI[ÇC][ÃA]O DA ATIVIDADE ECON[ÔO]MICA PRINCIPAL)[:\s]*(.+?)(?:\n|$)/i,
      /(?:ATIVIDADE ECON[ÔO]MICA PRINCIPAL|CNAE PRINCIPAL)[:\s]*(.+?)(?:\n|$)/i,
    ]),
    cnaeSecundarios: get([
      /(?:C[ÓO]DIGO E DESCRI[ÇC][ÃA]O DAS? ATIVIDADES? ECON[ÔO]MICAS? SECUND[ÁA]RIAS?)[:\s]*([\s\S]+?)(?=C[ÓO]DIGO E DESCRI[ÇC][ÃA]O DA NATUREZA|$)/i,
      /(?:ATIVIDADES? ECON[ÔO]MICAS? SECUND[ÁA]RIAS?|CNAE SECUND[ÁA]RI)[:\s]*([\s\S]+?)(?=C[ÓO]DIGO E DESCRI[ÇC][ÃA]O DA NATUREZA|SITUA[ÇC][ÃA]O|$)/i,
    ]),
    porte: get([/PORTE DA EMPRESA[:\s]*(.+?)(?:\n|$)/i, /PORTE[:\s]*(.+?)(?:\n|$)/i]),
    capitalSocialCNPJ: get([/CAPITAL SOCIAL[:\s]*(?:R\$\s*)?([\d.,]+)/i]),
    endereco,
    telefone: get([/TELEFONE[:\s]*([\d\s()\-+.]+)/i]),
    email: get([/(?:ENDERE[ÇC]O ELETR[ÔO]NICO|E-?MAIL)[:\s]*(\S+@\S+)/i]),
  };
}

// ── QSA ──
function extractSociosFromTextQSA(text: string): QSASocio[] {
  const socios: QSASocio[] = [];
  const seen = new Set<string>();

  // Pattern: find all CPFs/CNPJs in the document
  const cpfPattern = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
  let match;
  while ((match = cpfPattern.exec(text)) !== null) {
    const cpf = match[1];
    if (seen.has(cpf)) continue;
    seen.add(cpf);

    // Look for name near this CPF (before or after, within 300 chars)
    const startIdx = Math.max(0, match.index - 300);
    const endIdx = Math.min(text.length, match.index + 300);
    const context = text.substring(startIdx, endIdx);

    // Find name: sequence of uppercase words (at least 6 chars total)
    const nameMatch = context.match(/([A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC\s]{5,})/);
    const qualMatch = context.match(/(S[ÓO]CIO[\s-]*ADMINISTRADOR|S[ÓO]CIO|ADMINISTRADOR|PROCURADOR|DIRETOR|PRESIDENTE|REPRESENTANTE)/i);

    if (nameMatch) {
      socios.push({
        nome: nameMatch[1].trim(),
        cpfCnpj: cpf,
        qualificacao: qualMatch ? qualMatch[1].trim() : "",
        participacao: "",
      });
    }
  }

  // Also look for CNPJs of partner companies (PJ partners)
  const cnpjPattern = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g;
  while ((match = cnpjPattern.exec(text)) !== null) {
    const cnpj = match[1];
    if (seen.has(cnpj)) continue;

    const startIdx = Math.max(0, match.index - 300);
    const endIdx = Math.min(text.length, match.index + 300);
    const context = text.substring(startIdx, endIdx);

    const nameMatch = context.match(/([A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC\s]{5,})/);
    const qualMatch = context.match(/(S[ÓO]CIO[\s-]*ADMINISTRADOR|S[ÓO]CIO|ADMINISTRADOR|PROCURADOR|DIRETOR|PRESIDENTE)/i);

    if (nameMatch) {
      seen.add(cnpj);
      socios.push({
        nome: nameMatch[1].trim(),
        cpfCnpj: cnpj,
        qualificacao: qualMatch ? qualMatch[1].trim() : "",
        participacao: "",
      });
    }
  }

  return socios;
}

function localExtractQSA(text: string): QSAData {
  const socios = extractSociosFromTextQSA(text);

  const capitalMatch = text.match(/CAPITAL\s*(?:SOCIAL)?[:\s]*(?:R\$\s*)?([\d.,]+)/i);

  return {
    capitalSocial: capitalMatch ? capitalMatch[1] : "",
    quadroSocietario: socios.length > 0 ? socios : [{ nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }],
  };
}

// ── CONTRATO SOCIAL ──
function extractSociosFromTextContrato(text: string): Socio[] {
  const socios: Socio[] = [];
  const seen = new Set<string>();

  const cpfPattern = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
  let match;
  while ((match = cpfPattern.exec(text)) !== null) {
    const cpf = match[1];
    if (seen.has(cpf)) continue;
    seen.add(cpf);

    const startIdx = Math.max(0, match.index - 300);
    const endIdx = Math.min(text.length, match.index + 300);
    const context = text.substring(startIdx, endIdx);

    const nameMatch = context.match(/([A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC\s]{5,})/);
    const qualMatch = context.match(/(S[ÓO]CIO[\s-]*ADMINISTRADOR|S[ÓO]CIO|ADMINISTRADOR|PROCURADOR|DIRETOR|PRESIDENTE)/i);

    // Try to find participation percentage or quota info near the CPF
    const partMatch = context.match(/(\d+[.,]?\d*)\s*%/);
    const quotaMatch = context.match(/([\d.]+)\s*(?:quotas?|cotas?)/i);

    if (nameMatch) {
      socios.push({
        nome: nameMatch[1].trim(),
        cpf,
        qualificacao: qualMatch ? qualMatch[1].trim() : "",
        participacao: partMatch ? `${partMatch[1]}%` : (quotaMatch ? `${quotaMatch[1]} quotas` : ""),
      });
    }
  }

  return socios;
}

function localExtractContrato(text: string): ContratoSocialData {
  const get = (patterns: RegExp[]): string => regexGet(text, patterns);
  const socios = extractSociosFromTextContrato(text);

  return {
    socios: socios.length > 0 ? socios : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }],
    capitalSocial: get([/CAPITAL\s*SOCIAL[:\s]*(?:R\$\s*)?([\d.,]+(?:\s*\([^)]+\))?)/i]),
    objetoSocial: get([/OBJETO\s*SOCIAL[:\s]*([\s\S]+?)(?=CL[ÁA]USULA|ART(?:IGO)?\.?\s|CAP[ÍI]TULO|$)/i]),
    dataConstituicao: get([
      /(?:DATA\s*(?:DE\s*)?CONSTITUI[ÇC][ÃA]O|CONSTITU[ÍI]DA\s*EM|REGISTRAD[OA]\s*EM)[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
    ]),
    temAlteracoes: /ALTERA[ÇC][ÃA]O|CONSOLIDA[ÇC][ÃA]O/i.test(text),
    prazoDuracao: get([/PRAZO[:\s]*(?:DE\s*DURA[ÇC][ÃA]O)?[:\s]*(.+?)(?:\.|$)/im]) || (/INDETERMINADO/i.test(text) ? "Indeterminado" : ""),
    administracao: get([/ADMINISTRA[ÇC][ÃA]O[:\s]*([\s\S]+?)(?=CL[ÁA]USULA|ART(?:IGO)?\.?\s|$)/i]),
    foro: get([/FORO[:\s]*(?:DA\s*)?(?:COMARCA\s*(?:DE|DO)?\s*)?(.+?)(?:\.|$)/im]),
  };
}

// ── FATURAMENTO (PDF) ──
function localExtractFaturamento(text: string): FaturamentoData {
  const meses: { mes: string; valor: string }[] = [];
  const monthNames: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    janeiro: "01", fevereiro: "02", "março": "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };

  // Pattern 1: "Janeiro/2025    R$ 1.234.567,89" or "Janeiro 2025  1.234.567,89"
  const pattern1 = /([a-záéíóúçã]+)\/?[\s]*(\d{2,4})\s*(?:R\$\s*)?([\d.,]+)/gi;
  let m;
  while ((m = pattern1.exec(text)) !== null) {
    const monthKey = m[1].toLowerCase().substring(0, 3);
    const monthNum = monthNames[monthKey] || monthNames[m[1].toLowerCase()];
    if (monthNum) {
      const year = m[2].length === 2 ? `20${m[2]}` : m[2];
      meses.push({ mes: `${monthNum}/${year}`, valor: m[3] });
    }
  }

  // Pattern 2: "01/2025    1.234.567,89"
  if (meses.length === 0) {
    const pattern2 = /(\d{1,2})\/(\d{4})\s+(?:R\$\s*)?([\d.,]+)/g;
    while ((m = pattern2.exec(text)) !== null) {
      const monthNum = parseInt(m[1], 10);
      if (monthNum >= 1 && monthNum <= 12) {
        meses.push({ mes: `${m[1].padStart(2, "0")}/${m[2]}`, valor: m[3] });
      }
    }
  }

  // Calculate sum and average
  const values = meses.map(item => {
    const num = parseFloat(item.valor.replace(/\./g, "").replace(",", "."));
    return isNaN(num) ? 0 : num;
  });
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = values.length > 0 ? sum / values.length : 0;

  const faturamentoZerado = values.length === 0 || values.every(v => v === 0);
  const ultimoMes = meses.length > 0 ? meses[meses.length - 1].mes : "";

  // Verificar se dados estão atualizados (últimos 60 dias)
  let dadosAtualizados = true;
  if (ultimoMes) {
    const [mesNum, anoNum] = ultimoMes.split("/").map(Number);
    const lastDataDate = new Date(anoNum, mesNum - 1, 28);
    const now = new Date();
    const diffDays = (now.getTime() - lastDataDate.getTime()) / (1000 * 60 * 60 * 24);
    dadosAtualizados = diffDays <= 75;
  }

  return {
    meses,
    somatoriaAno: sum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    mediaAno: avg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    faturamentoZerado,
    dadosAtualizados,
    ultimoMesComDados: ultimoMes,
  };
}

// ── SCR ──
function localExtractModalidades(text: string): SCRModalidade[] {
  const modalidades: SCRModalidade[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    // Pattern: "Capital de giro...  1.234,56  1.234,56  0,00  50,0%"
    const m = line.match(/([A-Za-z\u00C0-\u00FF\s/\-]{10,}?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+%?)/);
    if (m) {
      modalidades.push({
        nome: m[1].trim(),
        total: m[2],
        aVencer: m[3],
        vencido: m[4],
        participacao: m[5].includes('%') ? m[5] : m[5] + '%',
      });
    }
  }
  return modalidades;
}

function localExtractInstituicoes(text: string): SCRInstituicao[] {
  const instituicoes: SCRInstituicao[] = [];
  const seen = new Set<string>();
  const bankNames = ["BANCO", "CAIXA", "ITAU", "ITA[ÚU]", "BRADESCO", "SANTANDER", "SICOOB", "SICREDI", "BTG", "SAFRA", "ORIGINAL", "INTER", "NUBANK", "C6", "BB", "BNDES", "BRB", "BANRISUL", "VOTORANTIM", "ABC", "BMG", "DAYCOVAL", "PINE", "FIBRA", "SOFISA"];
  for (const bank of bankNames) {
    const pattern = new RegExp(`(${bank}[\\w\\s]*?)\\s+(?:R\\$\\s*)?([\\d.,]{4,})`, 'gi');
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const name = m[1].trim();
      if (!seen.has(name.toUpperCase())) {
        seen.add(name.toUpperCase());
        instituicoes.push({ nome: name, valor: m[2] });
      }
    }
  }
  return instituicoes;
}

function localExtractSCR(text: string): SCRData {
  const get = (patterns: RegExp[]): string => regexGet(text, patterns);

  const modalidades = localExtractModalidades(text);
  const instituicoes = localExtractInstituicoes(text);

  const carteiraAVencer = findValue(text, ["CARTEIRA A VENCER", "A VENCER", "EM DIA"]);
  const vencidos = findValue(text, ["OPERA[ÇC][ÕO]ES VENCIDAS", "VENCID[OA]S?"]);
  const prejuizos = findValue(text, ["PREJU[ÍI]ZO", "BAIXAD[OA]S?"]);
  const limiteCredito = findValue(text, ["LIMITE DE CR[ÉE]DITO", "LIMITE", "CR[ÉE]DITOS A LIBERAR"]);

  return {
    periodoReferencia: get([
      /(?:DATA[\s-]*BASE|REFER[ÊE]NCIA|PER[ÍI]ODO)[:\s]*(\d{2}\/\d{4})/i,
      /(\d{2}\/\d{4})/,
    ]),
    carteiraAVencer,
    vencidos,
    prejuizos,
    limiteCredito,
    qtdeInstituicoes: get([/(?:QUANTIDADE|QTD|QTDE)[\s]*(?:DE\s*)?(?:INSTITUI[ÇC][ÕO]ES|IFs?)[:\s]*(\d+)/i]),
    qtdeOperacoes: get([/(?:QUANTIDADE|QTD|QTDE)[\s]*(?:DE\s*)?OPERA[ÇC][ÕO]ES[:\s]*(\d+)/i]),
    totalDividasAtivas: findValue(text, ["RESPONSABILIDADE TOTAL", "D[ÍI]VIDA TOTAL", "TOTAL"]),
    operacoesAVencer: carteiraAVencer,
    operacoesEmAtraso: findValue(text, ["EM ATRASO"]),
    operacoesVencidas: vencidos,
    tempoAtraso: "",
    coobrigacoes: findValue(text, ["COOBRIGA[ÇC][ÕO]ES", "RESPONSABILIDADE INDIRETA"]),
    classificacaoRisco: get([/CLASSIFICA[ÇC][ÃA]O[:\s]*(?:DE\s*RISCO)?[:\s]*([A-H]{1,2})/i]),
    carteiraCurtoPrazo: findValue(text, ["CURTO PRAZO", "AT[ÉE] 360"]),
    carteiraLongoPrazo: findValue(text, ["LONGO PRAZO", "ACIMA (?:DE )?360"]),
    modalidades,
    instituicoes,
    valoresMoedaEstrangeira: findValue(text, ["MOEDA ESTRANGEIRA"]),
    historicoInadimplencia: "",
  };
}

// ── PROTESTOS ──
function localExtractProtestos(text: string): ProtestosData {
  const get = (patterns: RegExp[]): string => regexGet(text, patterns);

  const detalhes: { data: string; credor: string; valor: string; regularizado: boolean }[] = [];

  // Try to find individual protest entries
  // Pattern: date + credor + value
  const protestPattern = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(?:R\$\s*)?([\d.,]+)/g;
  let m;
  while ((m = protestPattern.exec(text)) !== null) {
    detalhes.push({
      data: m[1],
      credor: m[2].trim(),
      valor: m[3],
      regularizado: false,
    });
  }

  // Mark regularized ones
  for (const d of detalhes) {
    const ctx = text.substring(
      Math.max(0, text.indexOf(d.data) - 50),
      Math.min(text.length, text.indexOf(d.data) + 200)
    );
    if (/regularizado|quitado|cancelado|pago/i.test(ctx)) {
      d.regularizado = true;
    }
  }

  const vigentes = detalhes.filter(d => !d.regularizado);
  const regularizados = detalhes.filter(d => d.regularizado);

  const sumValues = (items: typeof detalhes) => {
    const total = items.reduce((acc, item) => {
      const num = parseFloat(item.valor.replace(/\./g, "").replace(",", "."));
      return acc + (isNaN(num) ? 0 : num);
    }, 0);
    return total > 0 ? total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  };

  return {
    vigentesQtd: get([/(?:PROTESTOS?\s*)?VIGENTES?[:\s]*(\d+)/i]) || (vigentes.length > 0 ? String(vigentes.length) : ""),
    vigentesValor: get([/VIGENTES?[:\s]*(?:R\$\s*)?([\d.,]+)/i]) || sumValues(vigentes),
    regularizadosQtd: get([/REGULARIZADOS?[:\s]*(\d+)/i]) || (regularizados.length > 0 ? String(regularizados.length) : ""),
    regularizadosValor: get([/REGULARIZADOS?[:\s]*(?:R\$\s*)?([\d.,]+)/i]) || sumValues(regularizados),
    detalhes,
  };
}

// ── PROCESSOS ──
function localExtractProcessos(text: string): ProcessosData {
  const get = (patterns: RegExp[]): string => regexGet(text, patterns);

  const distribuicao: { tipo: string; qtd: string; pct: string }[] = [];
  const bancarios: { banco: string; assunto: string; status: string; data: string }[] = [];

  // Try to find process type distribution
  const types = ["TRABALHISTA", "BANCO", "BANC[ÁA]RI", "FISCAL", "TRIBUT[ÁA]RI", "FORNECEDOR", "C[ÍI]VEL", "OUTROS?"];
  for (const tipo of types) {
    const pattern = new RegExp(`(${tipo}[A-Z]*)\\s*[:\\s]*(\\d+)\\s*(?:\\((\\d+[,.]?\\d*%)\\))?`, 'i');
    const m = text.match(pattern);
    if (m) {
      distribuicao.push({
        tipo: m[1].toUpperCase().replace(/[ÁA]RI[OA]?/g, match => match),
        qtd: m[2],
        pct: m[3] || "",
      });
    }
  }

  // Try to find banking processes
  const bankNames = ["ITAU", "ITA[ÚU]", "BRADESCO", "SANTANDER", "CAIXA", "BANCO DO BRASIL", "BB", "SICOOB", "NUBANK", "C6", "SAFRA", "BTG"];
  for (const bank of bankNames) {
    const pattern = new RegExp(`(${bank}[\\w\\s]*?)\\s*[-–]\\s*(.+?)\\s*[-–]\\s*(ARQUIVADO|EM ANDAMENTO|DISTRIBU[ÍI]DO|JULGADO|EM GRAU DE RECURSO|ATIVO)\\s*[-–]?\\s*(\\d{2}\\/\\d{2}\\/\\d{4})?`, 'gi');
    let m;
    while ((m = pattern.exec(text)) !== null) {
      bancarios.push({
        banco: m[1].trim(),
        assunto: m[2].trim(),
        status: m[3].trim(),
        data: m[4] || "",
      });
    }
  }

  return {
    passivosTotal: get([/(?:PASSIVOS?|R[ÉE]U)[:\s]*(\d+)/i, /(\d+)\s*(?:processos?\s*)?(?:como\s*)?r[ée]u/i]),
    ativosTotal: get([/(?:ATIVOS?|AUTOR)[:\s]*(\d+)/i, /(\d+)\s*(?:processos?\s*)?(?:como\s*)?autor/i]),
    valorTotalEstimado: get([/VALOR\s*TOTAL[:\s]*(?:R\$\s*)?([\d.,]+)/i]),
    temRJ: /RECUPERA[ÇC][ÃA]O\s*JUDICIAL/i.test(text),
    distribuicao,
    bancarios,
  };
}

// ── GRUPO ECONOMICO ──
function localExtractGrupoEconomico(text: string): GrupoEconomicoData {
  const empresas: { razaoSocial: string; cnpj: string; relacao: string; scrTotal: string; protestos: string; processos: string }[] = [];

  // Find all CNPJs and try to associate with company names
  const cnpjPattern = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g;
  const seen = new Set<string>();
  let match;
  while ((match = cnpjPattern.exec(text)) !== null) {
    const cnpj = match[1];
    if (seen.has(cnpj)) continue;
    seen.add(cnpj);

    const startIdx = Math.max(0, match.index - 300);
    const endIdx = Math.min(text.length, match.index + 300);
    const context = text.substring(startIdx, endIdx);

    // Find company name near CNPJ
    const nameMatch = context.match(/([A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC\s&.,]{5,}(?:LTDA|S\.?A\.?|EIRELI|ME|EPP|S\/S|INDIVIDUAL)?)/i);
    const relMatch = context.match(/(via\s+S[óo]cio|Controlada|Coligada|Filial|Matriz|Controladora)/i);

    if (nameMatch) {
      empresas.push({
        razaoSocial: nameMatch[1].trim(),
        cnpj,
        relacao: relMatch ? relMatch[1].trim() : "",
        scrTotal: "",
        protestos: "",
        processos: "",
      });
    }
  }

  return { empresas };
}

// ── Dispatcher ──
function localExtract(text: string, docType: string): CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData {
  switch (docType) {
    case "cnpj":           return localExtractCNPJ(text);
    case "qsa":            return localExtractQSA(text);
    case "contrato":       return localExtractContrato(text);
    case "faturamento":    return localExtractFaturamento(text);
    case "scr":            return localExtractSCR(text);
    case "protestos":      return localExtractProtestos(text);
    case "processos":      return localExtractProcessos(text);
    case "grupoEconomico": return localExtractGrupoEconomico(text);
    default:               return localExtractCNPJ(text);
  }
}

// ── Merge: AI fills gaps from local ──
function mergeData(local: Record<string, unknown>, ai: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...local };
  for (const [key, val] of Object.entries(ai)) {
    const localVal = merged[key];
    // Only replace if local field is empty/missing and AI has something
    const localEmpty = localVal === "" || localVal === null || localVal === undefined ||
      (Array.isArray(localVal) && localVal.length === 0);
    const aiHasValue = val !== "" && val !== null && val !== undefined &&
      !(Array.isArray(val) && val.length === 0);
    if (localEmpty && aiHasValue) {
      merged[key] = val;
    }
  }
  return merged;
}

// ─────────────────────────────────────────
// Prompts (kept for AI fallback)
// ─────────────────────────────────────────

const PROMPT_CNPJ = `Você é um especialista em documentos da Receita Federal do Brasil.
Analise o Cartão CNPJ recebido e extraia os dados com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "razaoSocial": "", "nomeFantasia": "", "cnpj": "", "dataAbertura": "",
  "situacaoCadastral": "", "dataSituacaoCadastral": "", "motivoSituacao": "",
  "naturezaJuridica": "", "cnaePrincipal": "", "cnaeSecundarios": "",
  "porte": "", "capitalSocialCNPJ": "", "endereco": "", "telefone": "", "email": ""
}

Regras:
- CNPJ com pontuação (XX.XXX.XXX/XXXX-XX), datas DD/MM/YYYY
- endereco: montar string estruturada no formato "Logradouro, Nº Número, Complemento, Bairro, Município-UF, CEP XXXXX-XXX". Extraia cada componente separadamente do documento (logradouro, número, complemento, bairro, município, UF, CEP) e concatene nesse formato. Se algum componente estiver ausente, omita-o da string sem deixar vírgulas duplas.
- naturezaJuridica: incluir código numérico + descrição (ex: "206-2 - Sociedade Empresária Limitada")
- cnaePrincipal: código completo com pontuação + descrição (ex: "47.61-0-03 - Comércio varejista de artigos de papelaria")
- cnaeSecundarios: todos os CNAEs secundários separados por ";" no mesmo formato código + descrição
- capitalSocialCNPJ: valor formatado em reais (ex: "R$ 100.000,00")
- situacaoCadastral: valor exato do documento (ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA)
- Se a situação NÃO for ATIVA, preencher motivoSituacao com o motivo exato
- porte: MICROEMPRESA, EMPRESA DE PEQUENO PORTE, DEMAIS, ou como consta no documento
- Campos ausentes → ""
- NÃO invente dados`;

const PROMPT_QSA = `Você é um especialista em análise de documentos societários brasileiros.
Analise o documento QSA (Quadro de Sócios e Administradores) recebido e extraia os dados com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "capitalSocial": "",
  "quadroSocietario": [
    {
      "nome": "",
      "cpfCnpj": "",
      "tipo_pessoa": "",
      "qualificacao": "",
      "participacao": "",
      "eh_administrador": false
    }
  ]
}

Regras:
- Liste TODOS os sócios/administradores encontrados no documento, sem exceção
- CPF com pontuação (XXX.XXX.XXX-XX), CNPJ com pontuação (XX.XXX.XXX/XXXX-XX)
- tipo_pessoa: "PF" para pessoa física (CPF), "PJ" para pessoa jurídica (CNPJ)
- qualificacao: valor exato do documento — Sócio-Administrador, Sócio, Administrador, Procurador, Diretor, etc.
- participacao: percentual se disponível (ex: "50%") ou quantidade de quotas (ex: "110.000 quotas")
- eh_administrador: true se a qualificação indica poder de administração (Sócio-Administrador, Administrador, Diretor)
- capitalSocial: valor numérico em reais formatado (ex: "R$ 220.000,00")
- NÃO confunda testemunhas, advogados ou contadores com sócios
- NÃO invente dados`;

const PROMPT_CONTRATO = `Você é um especialista em análise de documentos societários brasileiros.
Analise o Contrato Social (ou Alteração Contratual / Consolidação) recebido e extraia os dados com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "socios": [
    { "nome": "", "cpf": "", "participacao": "", "qualificacao": "" }
  ],
  "capitalSocial": "",
  "objetoSocial": "",
  "dataConstituicao": "",
  "temAlteracoes": false,
  "prazoDuracao": "",
  "administracao": "",
  "foro": "",
  "historico_alteracoes": "",
  "data_inicio_atividades_real": "",
  "administrador_nao_socio": false
}

Regras:
- Liste TODOS os sócios. CPF com pontuação (XXX.XXX.XXX-XX). Não inclua testemunhas/advogados.
- participacao: percentual ou quantidade de quotas (ex: "50%" ou "50.000 quotas de R$ 1,00")
- qualificacao: Sócio-Administrador, Sócio, Administrador, etc.
- capitalSocial: valor em reais formatado (ex: "R$ 500.000,00")
- objetoSocial: resumir em até 2 frases claras e precisas
- dataConstituicao: data de constituição original da empresa (DD/MM/YYYY)
- temAlteracoes: true se o documento é uma alteração contratual ou consolidação (não o contrato original)
- prazoDuracao: "Indeterminado" ou prazo específico se mencionado
- administracao: descrever quem administra (nomes e forma — isolada ou conjunta)
- foro: comarca indicada no contrato
- historico_alteracoes: se for consolidação/alteração, resumir brevemente as alterações mencionadas (ex: "1ª Alt: mudança de endereço; 2ª Alt: inclusão de sócio"). Se não houver, deixar ""
- data_inicio_atividades_real: se mencionada uma data de início de atividades diferente da constituição, informar aqui (DD/MM/YYYY). Caso contrário, ""
- administrador_nao_socio: true se o administrador designado NÃO consta na lista de sócios (administrador externo/terceiro)
- Campos ausentes → "" ou false
- NÃO invente dados`;

const PROMPT_FATURAMENTO = `Você é um especialista em análise financeira de empresas brasileiras.
Analise o documento de faturamento recebido e extraia os valores mensais com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "cnpj_empresa": "",
  "periodo_inicio": "",
  "periodo_fim": "",
  "meses": [
    { "mes": "01/2025", "valor": "1.234.567,89" }
  ],
  "serie_mensal": [
    { "competencia": "01/2025", "valor_total": "1.234.567,89" }
  ],
  "somatoriaAno": "",
  "mediaAno": "",
  "faturamentoZerado": false,
  "dadosAtualizados": true,
  "ultimoMesComDados": ""
}

Regras:
- cnpj_empresa: CNPJ da empresa se constar no documento (para validação cruzada)
- periodo_inicio: primeiro mês com dados (MM/YYYY)
- periodo_fim: último mês com dados (MM/YYYY)
- meses: listar TODOS os meses com faturamento encontrado, em ordem cronológica
- serie_mensal: mesma lista em formato alternativo — competencia (MM/YYYY) e valor_total
- mes/competencia: formato MM/YYYY
- valor/valor_total: formatação brasileira (1.234.567,89) — SEM prefixo "R$"
- somatoriaAno: soma de todos os meses no período
- mediaAno: média aritmética dos meses
- faturamentoZerado: true se todos os valores são zero ou ausentes
- dadosAtualizados: false se o último mês com dados é anterior a 60 dias da data atual
- ultimoMesComDados: último mês que tem valor de faturamento (MM/YYYY)
- Se houver faturamento por CNPJ filial, somar tudo no total mensal
- NÃO invente dados`;

const PROMPT_SCR = `Você é um especialista no Sistema de Informações de Crédito (SCR) do Banco Central do Brasil.

Analise VISUALMENTE este documento SCR oficial do Bacen. O documento contém dados de endividamento bancário da empresa.

ESTRUTURA TÍPICA DO DOCUMENTO SCR:
- Cabeçalho: CNPJ consultado, período de referência (MM/AAAA), % docs e volume processados
- Seção "Carteira a Vencer": tabela com prazos (até 30d, 31-60d, 61-90d, 91-180d, 181-360d, acima 360d)
- Seção "Vencidos": mesmos prazos
- Seção "Prejuízos": até 12m, acima 12m
- Seção "Limite de Crédito": até 360d, acima 360d
- Seção "Outros": coobrigações, responsabilidade total, créditos a liberar, vendor
- Seção "Modalidades": tabela detalhada de tipos de operação
- Pode ter múltiplas páginas

Retorne APENAS JSON:

{
  "periodoReferencia": "MM/AAAA",
  "cnpjConsultado": "",
  "percentualDocsProcessados": "",
  "percentualVolumeProcessado": "",
  "qtdeInstituicoes": "",
  "qtdeOperacoes": "",
  "carteiraAVencer": "",
  "carteiraAVencerDetalhado": {
    "ate30d": "", "de31a60d": "", "de61a90d": "",
    "de91a180d": "", "de181a360d": "", "acima360d": "", "total": ""
  },
  "vencidos": "",
  "vencidosDetalhado": {
    "de15a30d": "", "de31a60d": "", "de61a90d": "",
    "de91a180d": "", "de181a360d": "", "acima360d": "", "total": ""
  },
  "prejuizos": "",
  "prejuizosDetalhado": { "ate12m": "", "acima12m": "", "total": "" },
  "limiteCredito": "",
  "limiteCreditoDetalhado": { "ate360d": "", "acima360d": "", "total": "" },
  "totalDividasAtivas": "",
  "coobrigacoes": "",
  "responsabilidadeTotal": "",
  "creditosALiberar": "",
  "riscoIndiretoVendor": "",
  "classificacaoRisco": "",
  "carteiraCurtoPrazo": "",
  "carteiraLongoPrazo": "",
  "modalidades": [
    { "nome": "", "total": "", "aVencer": "", "vencido": "", "participacao": "" }
  ],
  "instituicoes": [
    { "nome": "", "valor": "" }
  ],
  "valoresMoedaEstrangeira": "",
  "historicoInadimplencia": "",
  "status": "COM_HISTORICO"
}

REGRAS:
- Se TODOS os valores forem zero ou vazios: status = "SEM_HISTORICO_BANCARIO"
- Valores monetários: formatação brasileira (ex: "23.785,80")
- Se valores em "mil R$": converter (multiplicar por 1000)
- Leia CADA tabela, CADA linha, CADA página
- modalidades: listar TODAS as modalidades/operações
- instituicoes: listar TODAS as IFs
- NÃO invente dados`;

const PROMPT_PROTESTOS = `Você é um especialista em análise de crédito.
Analise o documento de certidão de protestos e extraia os dados.
Retorne APENAS JSON válido:

{
  "vigentesQtd": "",
  "vigentesValor": "",
  "regularizadosQtd": "",
  "regularizadosValor": "",
  "detalhes": [
    { "data": "", "credor": "", "valor": "", "regularizado": false }
  ]
}

Regras:
- vigentesQtd/Valor: total de protestos ativos (não regularizados)
- regularizadosQtd/Valor: total de protestos já quitados
- detalhes: listar TODOS os protestos encontrados
- Valores em formatação brasileira
- regularizado: true se consta como pago/regularizado
- NÃO invente dados`;

const PROMPT_PROCESSOS = `Você é um especialista em análise jurídica.
Analise o documento de processos judiciais e extraia os dados.
Retorne APENAS JSON válido:

{
  "passivosTotal": "",
  "ativosTotal": "",
  "valorTotalEstimado": "",
  "temRJ": false,
  "distribuicao": [
    { "tipo": "", "qtd": "", "pct": "" }
  ],
  "bancarios": [
    { "banco": "", "assunto": "", "status": "", "data": "" }
  ]
}

Regras:
- passivosTotal: número total de processos como réu
- ativosTotal: número total de processos como autor
- temRJ: true se houver Recuperação Judicial
- distribuicao: agrupar por tipo (TRABALHISTA, BANCO, FISCAL, FORNECEDOR, OUTROS) com qtd e %
- bancarios: listar processos contra bancos/instituições financeiras com detalhes
- status: ARQUIVADO, EM ANDAMENTO, DISTRIBUIDO, JULGADO, EM GRAU DE RECURSO
- NÃO invente dados`;

const PROMPT_GRUPO_ECONOMICO = `Você é um especialista em análise de crédito.
Analise o documento de grupo econômico e extraia os dados das empresas relacionadas.
Retorne APENAS JSON válido:

{
  "empresas": [
    {
      "razaoSocial": "",
      "cnpj": "",
      "relacao": "",
      "scrTotal": "",
      "protestos": "",
      "processos": ""
    }
  ]
}

Regras:
- Listar TODAS as empresas do grupo econômico
- relacao: "via Sócio", "Controlada", "Coligada" ou como consta no documento
- scrTotal: valor total do SCR da empresa se disponível
- protestos: quantidade ou valor de protestos se disponível
- processos: quantidade de processos se disponível
- Campos ausentes → ""
- NÃO invente dados`;

// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (fallback — kept for AI fallback)
// ─────────────────────────────────────────
async function callGemini(prompt: string, content: string | { mimeType: string; base64: string }, docType?: string): Promise<string> {
  const models = (docType === "scr" || docType === "contrato") ? GEMINI_MODELS_CRITICAL : GEMINI_MODELS;
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (typeof content === "string") {
    parts.push({ text: prompt + "\n\n--- DOCUMENTO ---\n\n" + content });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
    parts.push({ text: prompt });
  }

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 50000);
        try {
          console.log(`[Gemini] key=${apiKey.substring(0, 8)}... model=${model} attempt=${attempt + 1}`);
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
              },
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.status === 429) {
            console.log(`[Gemini] Rate limited on key=${apiKey.substring(0, 8)} model=${model}, waiting before next key...`);
            await sleep(3000);
            break;
          }

          if (!response.ok) {
            const body = await response.text();
            console.error(`[Gemini] HTTP ${response.status}:`, body.substring(0, 300));
            break;
          }

          const result = await response.json();
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            console.error(`[Gemini] Empty response`);
            break;
          }
          return text;
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof Error && err.name === 'AbortError') {
            console.log('[Gemini] Request timed out after 45s');
            break;
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
// PROVEDOR 2: Groq (fallback)
// ─────────────────────────────────────────
async function callGroq(prompt: string, content: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);
    try {
      console.log(`[Groq] Attempt ${attempt + 1}...`);
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "Você é um extrator de dados de documentos brasileiros. Responda SOMENTE com JSON válido. NUNCA repita o documento. Sua resposta deve começar com { e terminar com }." },
            {
              role: "user",
              content: JSON.stringify({ tarefa: prompt, documento: content }),
            },
          ],
          temperature: 0.0,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        await sleep(3000 * Math.pow(2, attempt));
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        console.error(`[Groq] HTTP ${response.status}:`, body.substring(0, 300));
        throw new Error(`Groq ${response.status}`);
      }

      const result = await response.json();
      const text = result?.choices?.[0]?.message?.content;
      if (!text) throw new Error("Resposta vazia");
      return text;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Groq] Request timed out after 45s');
        break;
      }
      if (attempt === 2) throw err;
    }
  }
  throw new Error("GROQ_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada com fallback: Gemini -> Groq (kept for AI fallback)
// ─────────────────────────────────────────
async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string },
  docType?: string
): Promise<string> {
  if (GEMINI_API_KEYS.length > 0) {
    try {
      return await callGemini(prompt, imageContent || textContent, docType);
    } catch (err) {
      console.log(`[AI] Gemini failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (GROQ_API_KEY && textContent) {
    try {
      return await callGroq(prompt, smartTruncate(textContent, 20000));
    } catch (err) {
      console.log(`[AI] Groq failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error("Serviço de IA temporariamente indisponível. Aguarde 1 minuto e tente novamente.");
}

// ─────────────────────────────────────────
// Parse JSON
// ─────────────────────────────────────────
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  return JSON.parse(cleaned);
}

// ─────────────────────────────────────────
// Schema validation
// ─────────────────────────────────────────
function validateAndFixSchema(data: Record<string, unknown>, docType: string): void {
  // Ensure arrays are arrays
  const arrayFields: Record<string, string[]> = {
    scr: ['modalidades', 'instituicoes'],
    qsa: ['quadroSocietario'],
    contrato: ['socios'],
    faturamento: ['meses'],
    protestos: ['detalhes'],
    processos: ['distribuicao', 'bancarios'],
    grupoEconomico: ['empresas'],
  };

  for (const field of (arrayFields[docType] || [])) {
    if (!Array.isArray(data[field])) {
      data[field] = data[field] ? [data[field]] : [];
    }
  }

  // Convert numbers to strings (Gemini sometimes returns numbers)
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'number' && key !== 'temAlteracoes' && key !== 'temRJ' && key !== 'faturamentoZerado' && key !== 'dadosAtualizados') {
      data[key] = String(val);
    }
    if (val === null || val === undefined) {
      data[key] = '';
    }
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

function fillQSADefaults(data: Partial<QSAData>): QSAData {
  const quadro = Array.isArray(data.quadroSocietario) && data.quadroSocietario.length > 0
    ? data.quadroSocietario.map(s => ({
        nome: s.nome || "", cpfCnpj: s.cpfCnpj || "",
        qualificacao: s.qualificacao || "", participacao: s.participacao || "",
      }))
    : [{ nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }];
  return { capitalSocial: data.capitalSocial || "", quadroSocietario: quadro };
}

function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData {
  const socios = Array.isArray(data.socios) && data.socios.length > 0
    ? data.socios.map(s => ({ nome: s.nome || "", cpf: s.cpf || "", participacao: s.participacao || "", qualificacao: s.qualificacao || "" }))
    : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }];
  return {
    socios, capitalSocial: data.capitalSocial || "", objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "", temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "", administracao: data.administracao || "", foro: data.foro || "",
  };
}

function fillFaturamentoDefaults(data: Partial<FaturamentoData>): FaturamentoData {
  return {
    meses: Array.isArray(data.meses) ? data.meses : [],
    somatoriaAno: data.somatoriaAno || "0,00",
    mediaAno: data.mediaAno || "0,00",
    faturamentoZerado: data.faturamentoZerado ?? true,
    dadosAtualizados: data.dadosAtualizados ?? false,
    ultimoMesComDados: data.ultimoMesComDados || "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fillSCRDefaults(data: Record<string, any>): SCRData {
  // Map detailed breakdown totals to top-level fields if top-level is empty
  const carteiraAVencer = data.carteiraAVencer
    || data.carteiraAVencerDetalhado?.total
    || "";
  const vencidos = data.vencidos
    || data.vencidosDetalhado?.total
    || "";
  const prejuizos = data.prejuizos
    || data.prejuizosDetalhado?.total
    || "";
  const limiteCredito = data.limiteCredito
    || data.limiteCreditoDetalhado?.total
    || "";

  // Build detailed breakdown strings to store in existing string fields where useful
  const detailParts: string[] = [];
  if (data.carteiraAVencerDetalhado) {
    const d = data.carteiraAVencerDetalhado;
    const parts = [
      d.ate30d && `até 30d: ${d.ate30d}`,
      d.de31a60d && `31-60d: ${d.de31a60d}`,
      d.de61a90d && `61-90d: ${d.de61a90d}`,
      d.de91a180d && `91-180d: ${d.de91a180d}`,
      d.de181a360d && `181-360d: ${d.de181a360d}`,
      d.acima360d && `>360d: ${d.acima360d}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`A Vencer: ${parts.join("; ")}`);
  }
  if (data.vencidosDetalhado) {
    const d = data.vencidosDetalhado;
    const parts = [
      d.de15a30d && `15-30d: ${d.de15a30d}`,
      d.de31a60d && `31-60d: ${d.de31a60d}`,
      d.de61a90d && `61-90d: ${d.de61a90d}`,
      d.de91a180d && `91-180d: ${d.de91a180d}`,
      d.de181a360d && `181-360d: ${d.de181a360d}`,
      d.acima360d && `>360d: ${d.acima360d}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`Vencidos: ${parts.join("; ")}`);
  }
  if (data.prejuizosDetalhado) {
    const d = data.prejuizosDetalhado;
    const parts = [
      d.ate12m && `até 12m: ${d.ate12m}`,
      d.acima12m && `>12m: ${d.acima12m}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`Prejuízos: ${parts.join("; ")}`);
  }
  if (data.limiteCreditoDetalhado) {
    const d = data.limiteCreditoDetalhado;
    const parts = [
      d.ate360d && `até 360d: ${d.ate360d}`,
      d.acima360d && `>360d: ${d.acima360d}`,
    ].filter(Boolean);
    if (parts.length > 0) detailParts.push(`Limite: ${parts.join("; ")}`);
  }

  // Concatenate extra SCR info into historicoInadimplencia if it was empty
  const extraInfo = detailParts.join(" | ");
  const historicoInadimplencia = data.historicoInadimplencia
    || (extraInfo ? extraInfo : "");

  // Map new fields that don't exist in SCRData to existing fields
  const operacoesAVencer = data.operacoesAVencer || carteiraAVencer || "";
  const coobrigacoes = data.coobrigacoes || data.responsabilidadeTotal || "";
  const tempoAtraso = data.tempoAtraso || "";
  const operacoesEmAtraso = data.operacoesEmAtraso || "";
  const operacoesVencidas = data.operacoesVencidas || vencidos || "";
  const totalDividasAtivas = data.totalDividasAtivas || data.responsabilidadeTotal || "";

  return {
    periodoReferencia: data.periodoReferencia || "",
    carteiraAVencer,
    vencidos,
    prejuizos,
    limiteCredito,
    qtdeInstituicoes: data.qtdeInstituicoes || "",
    qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas,
    operacoesAVencer,
    operacoesEmAtraso,
    operacoesVencidas,
    tempoAtraso,
    coobrigacoes,
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo: data.carteiraCurtoPrazo || "",
    carteiraLongoPrazo: data.carteiraLongoPrazo || "",
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia,
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
  };
}

function fillGrupoEconomicoDefaults(data: Partial<GrupoEconomicoData>): GrupoEconomicoData {
  return { empresas: Array.isArray(data.empresas) ? data.empresas : [] };
}

type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData;

// Used by AI fallback for re-extraction
function getEmptyFields(data: Record<string, unknown>): string[] { // eslint-disable-line @typescript-eslint/no-unused-vars
  const empty: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === "" || value === null || value === undefined) {
      empty.push(key);
    } else if (Array.isArray(value) && value.length === 0) {
      empty.push(key);
    }
  }
  return empty;
}

function validateExtractedData(data: Record<string, unknown>, docType: string): void {
  // Validate CNPJ format
  if (docType === 'cnpj' && typeof data.cnpj === 'string' && data.cnpj) {
    const cnpjClean = data.cnpj.replace(/\D/g, '');
    if (cnpjClean.length !== 14) {
      console.warn(`[validate] CNPJ format invalid: ${data.cnpj}`);
    }
  }

  // SCR: detect empty SCR
  if (docType === 'scr') {
    const scrFields = ['carteiraAVencer', 'vencidos', 'prejuizos', 'totalDividasAtivas'];
    const allZero = scrFields.every(f => {
      const val = data[f];
      if (!val || val === '' || val === '0' || val === '0,00') return true;
      const num = parseFloat(String(val).replace(/[R$\s.]/g, '').replace(',', '.'));
      return isNaN(num) || num === 0;
    });
    if (allZero) {
      data.historicoInadimplencia = (data.historicoInadimplencia || '') + ' [SCR: SEM HISTÓRICO BANCÁRIO - todos os valores zerados]';
      console.log('[validate] SCR detected as SEM_HISTORICO_BANCARIO');
    }
  }
}

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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("type") as string | null;

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
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

    // Validate docType
    const validDocTypes = ["cnpj", "qsa", "contrato", "faturamento", "scr", "protestos", "processos", "grupoEconomico"];
    if (!validDocTypes.includes(docType)) {
      return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Excel: processamento direto sem IA ────
    if (ext === "xlsx" && docType === "faturamento") {
      try {
        console.log(`[extract] Processing Excel: ${file.name}`);
        const faturamento = await extractExcel(buffer);
        const filled = countFilledFields(faturamento);
        return NextResponse.json({
          success: true,
          data: faturamento,
          meta: { rawTextLength: 0, filledFields: filled, isScanned: false, aiPowered: false },
        });
      } catch (err) {
        console.error("[extract] Excel processing failed:", err);
        // Se falhar, continua para tentar via texto
      }
    }

    // ──── Selecionar prompt (para AI fallback) ────
    let prompt: string;
    switch (docType) {
      case "cnpj":           prompt = PROMPT_CNPJ; break;
      case "qsa":            prompt = PROMPT_QSA; break;
      case "contrato":       prompt = PROMPT_CONTRATO; break;
      case "faturamento":    prompt = PROMPT_FATURAMENTO; break;
      case "scr":            prompt = PROMPT_SCR; break;
      case "protestos":      prompt = PROMPT_PROTESTOS; break;
      case "processos":      prompt = PROMPT_PROCESSOS; break;
      case "grupoEconomico": prompt = PROMPT_GRUPO_ECONOMICO; break;
      default:               prompt = PROMPT_CNPJ; break;
    }

    // ──── Preparar conteúdo ────
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    if (isImage) {
      // Images can only be processed by AI
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else {
      // ALWAYS try pdf-parse / mammoth first for all document types
      textContent = await extractText(buffer, ext);
      const isUsableText = textContent.trim().length >= 20 && hasReadableContent(textContent);

      if (!isUsableText && ext === "pdf") {
        // Text not readable — prepare binary for AI fallback
        console.log(`[extract] PDF text not usable, will try AI with binary...`);
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
      } else if (!isUsableText) {
        return NextResponse.json({
          error: "Não foi possível extrair texto do documento. Tente enviar em outro formato.",
        }, { status: 422 });
      }
    }

    console.log(`[extract] ${file.name} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── PRIMARY: Local regex extraction ────
    let data: AnyExtracted;

    if (textContent && textContent.trim().length >= 20) {
      // We have readable text — try local extraction first
      try {
        console.log(`[extract] Trying LOCAL extraction for ${docType}...`);
        const localResult = localExtract(textContent, docType);

        // Apply defaults
        let localData: AnyExtracted;
        switch (docType) {
          case "cnpj":           localData = fillCNPJDefaults(localResult as Partial<CNPJData>); break;
          case "qsa":            localData = fillQSADefaults(localResult as Partial<QSAData>); break;
          case "contrato":       localData = fillContratoDefaults(localResult as Partial<ContratoSocialData>); break;
          case "faturamento":    localData = fillFaturamentoDefaults(localResult as Partial<FaturamentoData>); break;
          case "scr":            localData = fillSCRDefaults(localResult as unknown as Record<string, unknown>); break;
          case "protestos":      localData = fillProtestosDefaults(localResult as Partial<ProtestosData>); break;
          case "processos":      localData = fillProcessosDefaults(localResult as Partial<ProcessosData>); break;
          case "grupoEconomico": localData = fillGrupoEconomicoDefaults(localResult as Partial<GrupoEconomicoData>); break;
          default:               localData = fillCNPJDefaults(localResult as Partial<CNPJData>);
        }

        const filled = countFilledFields(localData);
        console.log(`[extract] LOCAL extraction got ${filled} filled fields`);

        // If local extraction got very few fields, try AI as fallback
        if (filled < 3 && (GEMINI_API_KEYS.length > 0 || GROQ_API_KEY)) {
          console.log(`[extract] Local parsing got only ${filled} fields, trying AI fallback...`);
          try {
            // For PDFs that had readable text but local parsing failed, prepare binary too
            if (!imageContent && ext === "pdf") {
              imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
            }
            const aiResponse = await callAI(prompt, textContent, imageContent, docType);
            const aiParsed = parseJSON<Record<string, unknown>>(aiResponse);
            validateAndFixSchema(aiParsed, docType);

            // Merge: AI fills gaps from local
            const merged = mergeData(localData as unknown as Record<string, unknown>, aiParsed);

            switch (docType) {
              case "cnpj":           data = fillCNPJDefaults(merged as Partial<CNPJData>); break;
              case "qsa":            data = fillQSADefaults(merged as Partial<QSAData>); break;
              case "contrato":       data = fillContratoDefaults(merged as Partial<ContratoSocialData>); break;
              case "faturamento":    data = fillFaturamentoDefaults(merged as Partial<FaturamentoData>); break;
              case "scr":            data = fillSCRDefaults(merged as Record<string, unknown>); break;
              case "protestos":      data = fillProtestosDefaults(merged as Partial<ProtestosData>); break;
              case "processos":      data = fillProcessosDefaults(merged as Partial<ProcessosData>); break;
              case "grupoEconomico": data = fillGrupoEconomicoDefaults(merged as Partial<GrupoEconomicoData>); break;
              default:               data = fillCNPJDefaults(merged as Partial<CNPJData>);
            }

            console.log(`[extract] AI fallback merged, now ${countFilledFields(data)} filled fields`);
          } catch (aiErr) {
            console.log(`[extract] AI fallback failed: ${aiErr instanceof Error ? aiErr.message : aiErr}, using local results`);
            data = localData;
          }
        } else {
          // Local extraction was good enough
          data = localData;
        }
      } catch (localErr) {
        console.error("[extract] Local extraction crashed:", localErr);
        // Local parsing crashed — try AI
        try {
          if (!imageContent && ext === "pdf") {
            imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
          }
          const aiResponse = await callAI(prompt, textContent, imageContent, docType);
          const parsed = parseJSON<Record<string, unknown>>(aiResponse);
          validateAndFixSchema(parsed, docType);

          switch (docType) {
            case "cnpj":           data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
            case "qsa":            data = fillQSADefaults(parsed as Partial<QSAData>); break;
            case "contrato":       data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
            case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
            case "scr":            data = fillSCRDefaults(parsed as Record<string, unknown>); break;
            case "protestos":      data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
            case "processos":      data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
            case "grupoEconomico": data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
            default:               data = fillCNPJDefaults(parsed as Partial<CNPJData>);
          }
        } catch (aiErr2) {
          console.error("[extract] AI also failed after local crash:", aiErr2);
          // Return empty defaults
          switch (docType) {
            case "cnpj":           data = fillCNPJDefaults({}); break;
            case "qsa":            data = fillQSADefaults({}); break;
            case "contrato":       data = fillContratoDefaults({}); break;
            case "faturamento":    data = fillFaturamentoDefaults({}); break;
            case "scr":            data = fillSCRDefaults({}); break;
            case "protestos":      data = fillProtestosDefaults({}); break;
            case "processos":      data = fillProcessosDefaults({}); break;
            case "grupoEconomico": data = fillGrupoEconomicoDefaults({}); break;
            default:               data = fillCNPJDefaults({});
          }
          return NextResponse.json({
            success: true, data,
            meta: { rawTextLength: textContent.length, filledFields: 0, isScanned: isImage, aiError: true },
          });
        }
      }
    } else if (imageContent) {
      // No readable text — must use AI (binary PDF or image)
      console.log(`[extract] No readable text, using AI for binary content...`);
      try {
        const aiResponse = await callAI(prompt, textContent, imageContent, docType);
        const parsed = parseJSON<Record<string, unknown>>(aiResponse);
        validateAndFixSchema(parsed, docType);

        switch (docType) {
          case "cnpj":           data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
          case "qsa":            data = fillQSADefaults(parsed as Partial<QSAData>); break;
          case "contrato":       data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
          case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
          case "scr":            data = fillSCRDefaults(parsed as Record<string, unknown>); break;
          case "protestos":      data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
          case "processos":      data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
          case "grupoEconomico": data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
          default:               data = fillCNPJDefaults(parsed as Partial<CNPJData>);
        }
      } catch (aiError) {
        console.error("[extract] AI failed for binary content:", aiError);

        // Last resort: try to extract text from the PDF anyway
        if (ext === "pdf") {
          try {
            const fallbackText = await extractText(buffer, ext);
            if (fallbackText && fallbackText.trim().length > 50) {
              console.log(`[extract] Attempting local extraction on fallback text (${fallbackText.length} chars)...`);
              const localResult = localExtract(fallbackText, docType);
              switch (docType) {
                case "cnpj":           data = fillCNPJDefaults(localResult as Partial<CNPJData>); break;
                case "qsa":            data = fillQSADefaults(localResult as Partial<QSAData>); break;
                case "contrato":       data = fillContratoDefaults(localResult as Partial<ContratoSocialData>); break;
                case "faturamento":    data = fillFaturamentoDefaults(localResult as Partial<FaturamentoData>); break;
                case "scr":            data = fillSCRDefaults(localResult as unknown as Record<string, unknown>); break;
                case "protestos":      data = fillProtestosDefaults(localResult as Partial<ProtestosData>); break;
                case "processos":      data = fillProcessosDefaults(localResult as Partial<ProcessosData>); break;
                case "grupoEconomico": data = fillGrupoEconomicoDefaults(localResult as Partial<GrupoEconomicoData>); break;
                default:               data = fillCNPJDefaults(localResult as Partial<CNPJData>);
              }
              const filled = countFilledFields(data);
              if (filled >= 2) {
                console.log(`[extract] Fallback local extraction got ${filled} fields`);
                validateExtractedData(data as unknown as Record<string, unknown>, docType);
                return NextResponse.json({
                  success: true, data,
                  meta: { rawTextLength: fallbackText.length, filledFields: filled, isScanned: false, aiPowered: false },
                });
              }
            }
          } catch (fallbackErr) {
            console.error("[extract] Fallback text extraction also failed:", fallbackErr);
          }
        }

        // Return empty defaults
        switch (docType) {
          case "cnpj":           data = fillCNPJDefaults({}); break;
          case "qsa":            data = fillQSADefaults({}); break;
          case "contrato":       data = fillContratoDefaults({}); break;
          case "faturamento":    data = fillFaturamentoDefaults({}); break;
          case "scr":            data = fillSCRDefaults({}); break;
          case "protestos":      data = fillProtestosDefaults({}); break;
          case "processos":      data = fillProcessosDefaults({}); break;
          case "grupoEconomico": data = fillGrupoEconomicoDefaults({}); break;
          default:               data = fillCNPJDefaults({});
        }
        return NextResponse.json({
          success: true, data,
          meta: { rawTextLength: 0, filledFields: 0, isScanned: isImage, aiError: true },
        });
      }
    } else {
      // No text and no image — should not happen, but handle gracefully
      return NextResponse.json({
        error: "Não foi possível extrair conteúdo do documento.",
      }, { status: 422 });
    }

    // ──── Validate extracted data ────
    validateExtractedData(data as unknown as Record<string, unknown>, docType);

    const filled = countFilledFields(data);
    return NextResponse.json({
      success: true, data,
      meta: { rawTextLength: textContent.length, filledFields: filled, isScanned: isImage, aiPowered: false },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
