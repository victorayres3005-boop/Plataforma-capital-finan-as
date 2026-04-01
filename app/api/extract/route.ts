import { NextRequest, NextResponse } from "next/server";
import type { CNPJData, ContratoSocialData, SCRData } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

function geminiUrl(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

// ─────────────────────────────────────────
// MIME types
// ─────────────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getFileExt(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

// ─────────────────────────────────────────
// Extração de texto (fallback para DOCX ou quando multimodal falhar)
// ─────────────────────────────────────────
async function extractTextFallback(buffer: Buffer, ext: string): Promise<string> {
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
    console.error(`[fallback] Text extraction failed for .${ext}:`, err);
    return "";
  }
}

// ─────────────────────────────────────────
// Prompts especializados por tipo de documento
// ─────────────────────────────────────────

const PROMPT_CNPJ = `Você é um especialista em documentos da Receita Federal do Brasil.

Você vai receber um documento — um Comprovante de Inscrição e Situação Cadastral (Cartão CNPJ). Analise o documento VISUALMENTE, observando layout, campos, rótulos e valores.

Retorne APENAS um JSON válido, sem texto adicional, com esta estrutura exata:

{
  "razaoSocial": "",
  "nomeFantasia": "",
  "cnpj": "",
  "dataAbertura": "",
  "situacaoCadastral": "",
  "dataSituacaoCadastral": "",
  "motivoSituacao": "",
  "naturezaJuridica": "",
  "cnaePrincipal": "",
  "cnaeSecundarios": "",
  "porte": "",
  "capitalSocialCNPJ": "",
  "endereco": "",
  "telefone": "",
  "email": ""
}

Regras:
- Leia TODOS os campos visíveis no documento com atenção máxima
- Campos com "********" ou ilegíveis → string vazia ""
- Datas: manter no formato DD/MM/YYYY como aparece no documento
- CNPJ: manter com pontuação (XX.XXX.XXX/XXXX-XX)
- Situação cadastral: retornar o valor EXATO encontrado no documento
- endereco: concatenar logradouro, número, complemento, bairro, município, UF e CEP em uma string única separada por vírgula
- cnaePrincipal: incluir código e descrição juntos
- cnaeSecundarios: incluir TODOS os códigos e descrições, separados por ponto e vírgula
- capitalSocialCNPJ: incluir valor formatado em reais (ex: "1.000,00")
- Campos ausentes no documento → string vazia ""
- NÃO invente dados — extraia apenas o que está visível no documento`;

const PROMPT_CONTRATO = `Você é um especialista em análise de documentos societários brasileiros para operações de crédito em FIDC.

Você vai receber um Contrato Social (ou Alteração/Consolidação Contratual). Analise o documento VISUALMENTE, observando cada cláusula, assinaturas e dados dos sócios.

Retorne APENAS um JSON válido, sem texto adicional, com esta estrutura exata:

{
  "socios": [
    {
      "nome": "",
      "cpf": "",
      "participacao": "",
      "qualificacao": ""
    }
  ],
  "capitalSocial": "",
  "objetoSocial": "",
  "dataConstituicao": "",
  "temAlteracoes": false,
  "prazoDuracao": "",
  "administracao": "",
  "foro": ""
}

Regras:
- Leia o documento INTEIRO antes de responder — dados de sócios podem estar em diferentes páginas
- socios: listar TODOS os sócios com nome completo, CPF (com pontuação XXX.XXX.XXX-XX), participação (quotas e/ou percentual) e qualificação (Sócio-Administrador, Sócio, etc.)
- capitalSocial: incluir valor em reais e por extenso se disponível (ex: "R$ 100.000,00 (cem mil reais)")
- objetoSocial: resumir em no máximo 2 frases, preservando atividades principais
- dataConstituicao: data de constituição ou registro na Junta, formato DD/MM/YYYY ou por extenso
- temAlteracoes: true se o documento é uma alteração contratual ou consolidação
- prazoDuracao: "Indeterminado" ou período específico
- administracao: descrever quem administra, modelo (individual/conjunta) e poderes de representação
- foro: comarca eleita
- Campos ausentes → string vazia "" ou false para booleanos
- NÃO confundir CPF de testemunhas com CPF de sócios
- NÃO incluir advogados ou testemunhas como sócios
- NÃO invente dados — extraia apenas o que está visível no documento`;

const PROMPT_SCR = `Você é um especialista em análise de crédito e documentos do Sistema de Informações de Crédito (SCR) do Banco Central do Brasil.

Você vai receber um relatório SCR. Analise o documento VISUALMENTE, prestando atenção especial a TABELAS, valores numéricos, colunas e linhas.

Retorne APENAS um JSON válido, sem texto adicional, com esta estrutura exata:

{
  "totalDividasAtivas": "",
  "operacoesAVencer": "",
  "operacoesEmAtraso": "",
  "operacoesVencidas": "",
  "tempoAtraso": "",
  "prejuizo": "",
  "coobrigacoes": "",
  "classificacaoRisco": "",
  "modalidadesCredito": "",
  "instituicoesCredoras": "",
  "concentracaoCredito": "",
  "historicoInadimplencia": ""
}

Regras:
- Analise CADA tabela e seção do documento com cuidado — dados podem estar espalhados em várias páginas
- Valores monetários: manter formatação brasileira com vírgula decimal (ex: "34.170,50")
- totalDividasAtivas: somar responsabilidade total ativa se não explicitado
- operacoesAVencer: valor das operações a vencer (adimplentes/em dia)
- operacoesEmAtraso: valor das operações em atraso (1-14 dias ou conforme documento)
- operacoesVencidas: valor das operações vencidas (15+ dias)
- tempoAtraso: classificar em faixas "15-30 dias", "31-60 dias", "61-90 dias", "91-180 dias" ou "180+ dias"
- classificacaoRisco: letra A-H do Bacen, ou AA se disponível. Se houver múltiplas, listar a predominante
- modalidadesCredito: listar TODAS as modalidades encontradas separadas por vírgula
- instituicoesCredoras: listar TODAS as instituições encontradas separadas por vírgula
- concentracaoCredito: percentual do maior credor se disponível
- coobrigacoes: são passivo contingente — NÃO confundir com dívida direta
- prejuizo: créditos já baixados pela instituição financeira
- historicoInadimplencia: resumir ocorrências relevantes
- Campos ausentes → string vazia ""
- NÃO invente dados — extraia apenas o que está visível no documento`;

// ─────────────────────────────────────────
// Chamada ao Gemini — MULTIMODAL (envia arquivo direto)
// ─────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function callGeminiMultimodal(
  model: string,
  systemPrompt: string,
  fileParts: GeminiPart[]
): Promise<string> {
  const parts: GeminiPart[] = [
    ...fileParts,
    { text: systemPrompt },
  ];

  const response = await fetch(geminiUrl(model), {
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

  if (response.status === 429) throw new Error("RATE_LIMIT");

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Gemini][${model}] HTTP ${response.status}:`, errorBody.substring(0, 500));
    throw new Error(`Gemini API retornou status ${response.status}`);
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = result?.candidates?.[0]?.finishReason;
    console.error(`[Gemini][${model}] Empty response. finishReason: ${finishReason}`);
    throw new Error("Resposta vazia do Gemini");
  }

  return text;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(systemPrompt: string, fileParts: GeminiPart[]): Promise<string> {
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`[Gemini] Trying ${model}, attempt ${attempt + 1}`);
        return await callGeminiMultimodal(model, systemPrompt, fileParts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "RATE_LIMIT") {
          const waitMs = 3000 * Math.pow(2, attempt);
          console.log(`[Gemini] Rate limited on ${model}, waiting ${waitMs}ms...`);
          await sleep(waitMs);
          continue;
        }
        console.log(`[Gemini] ${model} failed: ${msg}, trying next model...`);
        break;
      }
    }
  }
  throw new Error("Serviço de IA temporariamente indisponível. Aguarde 1 minuto e tente novamente.");
}

function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

// ─────────────────────────────────────────
// Preparar parts do arquivo para o Gemini
// ─────────────────────────────────────────

async function prepareFileParts(
  buffer: Buffer,
  ext: string,
  mimeType: string
): Promise<{ parts: GeminiPart[]; mode: "multimodal" | "text"; isScanned: boolean }> {

  // DOCX não é suportado como inlineData no Gemini — extrair texto
  if (ext === "docx") {
    const text = await extractTextFallback(buffer, ext);
    if (text && text.trim().length >= 10) {
      return {
        parts: [{ text: "--- DOCUMENTO (texto extraído) ---\n\n" + text }],
        mode: "text",
        isScanned: false,
      };
    }
    throw new Error("Não foi possível extrair texto do documento DOCX.");
  }

  // PDF e imagens: enviar como inlineData (multimodal)
  const base64 = buffer.toString("base64");

  // Verificar tamanho — Gemini tem limite de ~20MB para inline data
  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > 15) {
    // Arquivo muito grande para inline — tentar fallback texto para PDF
    if (ext === "pdf") {
      console.log(`[prepare] PDF too large for inline (${sizeMB.toFixed(1)}MB), falling back to text`);
      const text = await extractTextFallback(buffer, ext);
      if (text && text.trim().length >= 10) {
        return {
          parts: [{ text: "--- DOCUMENTO (texto extraído) ---\n\n" + text }],
          mode: "text",
          isScanned: false,
        };
      }
    }
    throw new Error("Arquivo muito grande para processamento.");
  }

  return {
    parts: [{ inlineData: { mimeType, data: base64 } }],
    mode: "multimodal",
    isScanned: ["jpg", "jpeg", "png"].includes(ext),
  };
}

// ─────────────────────────────────────────
// Defaults para campos ausentes
// ─────────────────────────────────────────
function fillCNPJDefaults(data: Partial<CNPJData>): CNPJData {
  return {
    razaoSocial: data.razaoSocial || "",
    nomeFantasia: data.nomeFantasia || "",
    cnpj: data.cnpj || "",
    dataAbertura: data.dataAbertura || "",
    situacaoCadastral: data.situacaoCadastral || "",
    dataSituacaoCadastral: data.dataSituacaoCadastral || "",
    motivoSituacao: data.motivoSituacao || "",
    naturezaJuridica: data.naturezaJuridica || "",
    cnaePrincipal: data.cnaePrincipal || "",
    cnaeSecundarios: data.cnaeSecundarios || "",
    porte: data.porte || "",
    capitalSocialCNPJ: data.capitalSocialCNPJ || "",
    endereco: data.endereco || "",
    telefone: data.telefone || "",
    email: data.email || "",
  };
}

function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData {
  const socios = Array.isArray(data.socios) && data.socios.length > 0
    ? data.socios.map(s => ({
        nome: s.nome || "",
        cpf: s.cpf || "",
        participacao: s.participacao || "",
        qualificacao: s.qualificacao || "",
      }))
    : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }];

  return {
    socios,
    capitalSocial: data.capitalSocial || "",
    objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "",
    temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "",
    administracao: data.administracao || "",
    foro: data.foro || "",
  };
}

function fillSCRDefaults(data: Partial<SCRData>): SCRData {
  return {
    totalDividasAtivas: data.totalDividasAtivas || "",
    operacoesAVencer: data.operacoesAVencer || "",
    operacoesEmAtraso: data.operacoesEmAtraso || "",
    operacoesVencidas: data.operacoesVencidas || "",
    tempoAtraso: data.tempoAtraso || "",
    prejuizo: data.prejuizo || "",
    coobrigacoes: data.coobrigacoes || "",
    classificacaoRisco: data.classificacaoRisco || "",
    modalidadesCredito: data.modalidadesCredito || "",
    instituicoesCredoras: data.instituicoesCredoras || "",
    concentracaoCredito: data.concentracaoCredito || "",
    historicoInadimplencia: data.historicoInadimplencia || "",
  };
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

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada no servidor." }, { status: 500 });
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 20MB." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return NextResponse.json({ error: `Formato .${ext} não suportado. Use PDF, DOCX, JPG ou PNG.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Preparar arquivo para envio ao Gemini
    let filePrepared: { parts: GeminiPart[]; mode: "multimodal" | "text"; isScanned: boolean };
    try {
      filePrepared = await prepareFileParts(buffer, ext, mimeType);
    } catch (prepErr) {
      console.error("[prepare] Failed:", prepErr);
      return NextResponse.json({
        error: prepErr instanceof Error ? prepErr.message : "Não foi possível processar o documento.",
      }, { status: 422 });
    }

    console.log(`[extract] ${file.name} | type=${docType} | ext=${ext} | mode=${filePrepared.mode} | size=${(file.size / 1024).toFixed(0)}KB`);

    let prompt: string;
    switch (docType) {
      case "cnpj":     prompt = PROMPT_CNPJ; break;
      case "contrato": prompt = PROMPT_CONTRATO; break;
      case "scr":      prompt = PROMPT_SCR; break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    let data: CNPJData | ContratoSocialData | SCRData;

    try {
      const geminiResponse = await callGemini(prompt, filePrepared.parts);
      console.log(`[extract] Gemini response length: ${geminiResponse.length}`);
      const parsed = parseJSON<Record<string, unknown>>(geminiResponse);

      switch (docType) {
        case "cnpj":     data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
        case "contrato": data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
        case "scr":      data = fillSCRDefaults(parsed as Partial<SCRData>); break;
        default:         data = fillCNPJDefaults(parsed as Partial<CNPJData>);
      }
    } catch (aiError) {
      console.error("[extract] Gemini failed:", aiError);

      // FALLBACK: se multimodal falhou e é PDF, tentar com texto extraído
      if (filePrepared.mode === "multimodal" && ext === "pdf") {
        console.log("[extract] Trying text fallback for PDF...");
        try {
          const fallbackText = await extractTextFallback(buffer, ext);
          if (fallbackText && fallbackText.trim().length >= 10) {
            const textParts: GeminiPart[] = [{ text: "--- DOCUMENTO (texto extraído) ---\n\n" + fallbackText }];
            const geminiResponse = await callGemini(prompt, textParts);
            const parsed = parseJSON<Record<string, unknown>>(geminiResponse);

            switch (docType) {
              case "cnpj":     data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
              case "contrato": data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
              case "scr":      data = fillSCRDefaults(parsed as Partial<SCRData>); break;
              default:         data = fillCNPJDefaults(parsed as Partial<CNPJData>);
            }

            console.log("[extract] Text fallback succeeded!");
            const filled = countFilledFields(data);
            return NextResponse.json({
              success: true,
              data,
              meta: { rawTextLength: fallbackText.length, filledFields: filled, isScanned: false, aiPowered: true, usedFallback: true },
            });
          }
        } catch (fallbackErr) {
          console.error("[extract] Text fallback also failed:", fallbackErr);
        }
      }

      // Retorna estrutura vazia para preenchimento manual
      switch (docType) {
        case "cnpj":     data = fillCNPJDefaults({}); break;
        case "contrato": data = fillContratoDefaults({}); break;
        case "scr":      data = fillSCRDefaults({}); break;
        default: data = fillCNPJDefaults({});
      }
      return NextResponse.json({
        success: true,
        data,
        meta: { rawTextLength: 0, filledFields: 0, isScanned: filePrepared.isScanned, aiError: true },
      });
    }

    const filled = countFilledFields(data);

    return NextResponse.json({
      success: true,
      data,
      meta: {
        rawTextLength: 0,
        filledFields: filled,
        isScanned: filePrepared.isScanned,
        aiPowered: true,
        multimodal: filePrepared.mode === "multimodal",
      },
    });
  } catch (err) {
    console.error("[extract] Unhandled error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}

function countFilledFields(data: CNPJData | ContratoSocialData | SCRData): number {
  const obj = data as unknown as Record<string, unknown>;
  return Object.values(obj).filter(v =>
    typeof v === "string" ? v.length > 0 :
    Array.isArray(v) ? v.some((s: { nome?: string }) => s.nome) :
    typeof v === "boolean" ? true : false
  ).length;
}
