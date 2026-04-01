import { NextRequest, NextResponse } from "next/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];
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
// Prompts
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
- endereco: concatenar logradouro, nº, complemento, bairro, município, UF, CEP
- cnaePrincipal: código + descrição. cnaeSecundarios: todos separados por ;
- Campos ausentes → ""
- NÃO invente dados`;

const PROMPT_QSA = `Você é um especialista em análise de documentos societários brasileiros.
Analise o documento QSA (Quadro de Sócios e Administradores) recebido e extraia os dados.
Retorne APENAS JSON válido, sem texto adicional:

{
  "capitalSocial": "",
  "quadroSocietario": [
    { "nome": "", "cpfCnpj": "", "qualificacao": "", "participacao": "" }
  ]
}

Regras:
- Liste TODOS os sócios/administradores encontrados
- CPF com pontuação (XXX.XXX.XXX-XX), CNPJ com pontuação
- qualificacao: Sócio-Administrador, Sócio, Administrador, Procurador, etc. (valor exato do documento)
- participacao: percentual ou quantidade de quotas se disponível
- capitalSocial: valor em reais formatado (ex: "R$ 220.000,00")
- NÃO confunda testemunhas ou advogados com sócios
- NÃO invente dados`;

const PROMPT_CONTRATO = `Você é um especialista em análise de documentos societários brasileiros.
Analise o Contrato Social recebido e extraia os dados.
Retorne APENAS JSON válido, sem texto adicional:

{
  "socios": [{ "nome": "", "cpf": "", "participacao": "", "qualificacao": "" }],
  "capitalSocial": "", "objetoSocial": "", "dataConstituicao": "",
  "temAlteracoes": false, "prazoDuracao": "", "administracao": "", "foro": ""
}

Regras:
- Liste TODOS os sócios. CPF com pontuação. Não inclua testemunhas/advogados.
- objetoSocial: resumir em até 2 frases
- temAlteracoes: true se for alteração/consolidação
- Campos ausentes → "" ou false
- NÃO invente dados`;

const PROMPT_FATURAMENTO = `Você é um especialista em análise financeira.
Analise o documento de faturamento recebido e extraia os valores mensais.
Retorne APENAS JSON válido, sem texto adicional:

{
  "meses": [
    { "mes": "01/2025", "valor": "1.234.567,89" }
  ],
  "somatoriaAno": "",
  "mediaAno": "",
  "faturamentoZerado": false,
  "dadosAtualizados": true,
  "ultimoMesComDados": ""
}

Regras:
- meses: listar TODOS os meses com faturamento encontrado, em ordem cronológica
- mes: formato MM/YYYY
- valor: formatação brasileira (1.234.567,89)
- somatoriaAno: soma de todos os meses
- mediaAno: média aritmética dos meses
- faturamentoZerado: true se todos os valores são zero ou ausentes
- dadosAtualizados: false se o último mês com dados é anterior a 60 dias
- ultimoMesComDados: último mês que tem valor de faturamento
- NÃO invente dados`;

const PROMPT_SCR = `Você é um especialista em análise de crédito e documentos do SCR do Banco Central do Brasil.
Analise o relatório SCR e extraia TODOS os dados disponíveis com máxima precisão.
Retorne APENAS JSON válido, sem texto adicional:

{
  "carteiraAVencer": "",
  "vencidos": "",
  "prejuizos": "",
  "limiteCredito": "",
  "qtdeInstituicoes": "",
  "qtdeOperacoes": "",
  "totalDividasAtivas": "",
  "operacoesAVencer": "",
  "operacoesEmAtraso": "",
  "operacoesVencidas": "",
  "tempoAtraso": "",
  "coobrigacoes": "",
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
  "historicoInadimplencia": ""
}

Regras:
- Valores monetários: formatação brasileira (ex: "23.785,80")
- carteiraAVencer: total de operações a vencer (em dia)
- vencidos: total de operações vencidas
- prejuizos: créditos baixados como prejuízo
- limiteCredito: limite de crédito disponível
- qtdeInstituicoes: número total de instituições financeiras
- qtdeOperacoes: número total de operações
- carteiraCurtoPrazo: vencimento até 360 dias
- carteiraLongoPrazo: vencimento acima de 360 dias
- classificacaoRisco: letra A-H ou AA
- modalidades: listar TODAS as modalidades com total, a vencer, vencido e % participação
- instituicoes: listar TODAS as instituições financeiras com valores
- tempoAtraso: faixas "15-30 dias", "31-60 dias", etc.
- coobrigacoes: passivo contingente (NÃO confundir com dívida direta)
- Campos ausentes → "" ou arrays vazios
- NÃO invente dados`;

// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
async function callGemini(prompt: string, content: string | { mimeType: string; base64: string }): Promise<string> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (typeof content === "string") {
    parts.push({ text: prompt + "\n\n--- DOCUMENTO ---\n\n" + content });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
    parts.push({ text: prompt });
  }

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
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
          });

          if (response.status === 429) {
            console.log(`[Gemini] Rate limited on key=${apiKey.substring(0, 8)} model=${model}, trying next...`);
            await sleep(2000);
            break; // Próximo modelo ou key
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
      });

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
      if (attempt === 2) throw err;
    }
  }
  throw new Error("GROQ_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada com fallback: Gemini → Groq
// ─────────────────────────────────────────
async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string }
): Promise<string> {
  if (GEMINI_API_KEYS.length > 0) {
    try {
      return await callGemini(prompt, imageContent || textContent);
    } catch (err) {
      console.log(`[AI] Gemini failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (GROQ_API_KEY && textContent) {
    try {
      return await callGroq(prompt, textContent.substring(0, 10000));
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

function fillSCRDefaults(data: Partial<SCRData>): SCRData {
  return {
    carteiraAVencer: data.carteiraAVencer || "", vencidos: data.vencidos || "",
    prejuizos: data.prejuizos || "", limiteCredito: data.limiteCredito || "",
    qtdeInstituicoes: data.qtdeInstituicoes || "", qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas: data.totalDividasAtivas || "", operacoesAVencer: data.operacoesAVencer || "",
    operacoesEmAtraso: data.operacoesEmAtraso || "", operacoesVencidas: data.operacoesVencidas || "",
    tempoAtraso: data.tempoAtraso || "", coobrigacoes: data.coobrigacoes || "",
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo: data.carteiraCurtoPrazo || "", carteiraLongoPrazo: data.carteiraLongoPrazo || "",
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia: data.historicoInadimplencia || "",
  };
}

function countFilledFields(data: CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData): number {
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

    if (GEMINI_API_KEYS.length === 0 && !GROQ_API_KEY) {
      return NextResponse.json({ error: "Nenhuma API key configurada." }, { status: 500 });
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
      case "scr":        prompt = PROMPT_SCR; break;
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
      textContent = await extractText(buffer, ext);
      const isUsableText = textContent.trim().length >= 20 && hasReadableContent(textContent);

      if (!isUsableText && ext === "pdf") {
        console.log(`[extract] PDF text not usable, sending as binary...`);
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
      } else if (!isUsableText) {
        return NextResponse.json({
          error: "Não foi possível extrair texto do documento. Tente enviar em outro formato.",
        }, { status: 422 });
      }
    }

    if (textContent) {
      const maxChars: Record<string, number> = {
        cnpj: 8000, qsa: 15000, contrato: 40000, faturamento: 20000, scr: 40000,
      };
      textContent = textContent.substring(0, maxChars[docType] || 25000);
    }

    console.log(`[extract] ${file.name} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── Chamar IA ────
    type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData;
    let data: AnyExtracted;

    try {
      const aiResponse = await callAI(prompt, textContent, imageContent);
      console.log(`[extract] AI response length: ${aiResponse.length}`);
      const parsed = parseJSON<Record<string, unknown>>(aiResponse);

      switch (docType) {
        case "cnpj":       data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
        case "qsa":        data = fillQSADefaults(parsed as Partial<QSAData>); break;
        case "contrato":   data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
        case "faturamento": data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
        case "scr":        data = fillSCRDefaults(parsed as Partial<SCRData>); break;
        default:           data = fillCNPJDefaults(parsed as Partial<CNPJData>);
      }
    } catch (aiError) {
      console.error("[extract] AI failed:", aiError);

      switch (docType) {
        case "cnpj":       data = fillCNPJDefaults({}); break;
        case "qsa":        data = fillQSADefaults({}); break;
        case "contrato":   data = fillContratoDefaults({}); break;
        case "faturamento": data = fillFaturamentoDefaults({}); break;
        case "scr":        data = fillSCRDefaults({}); break;
        default:           data = fillCNPJDefaults({});
      }
      return NextResponse.json({
        success: true, data,
        meta: { rawTextLength: textContent.length, filledFields: 0, isScanned: isImage, aiError: true },
      });
    }

    const filled = countFilledFields(data);
    return NextResponse.json({
      success: true, data,
      meta: { rawTextLength: textContent.length, filledFields: filled, isScanned: isImage, aiPowered: true },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
