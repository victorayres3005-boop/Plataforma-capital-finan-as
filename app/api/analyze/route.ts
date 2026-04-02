import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// Chamada Gemini
// ─────────────────────────────────────────
async function callGemini(prompt: string, data: string): Promise<string> {
  const parts = [{ text: prompt + "\n\n--- DADOS EXTRAÍDOS ---\n\n" + data }];

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      try {
        const response = await fetch(geminiUrl(model, apiKey), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
          }),
        });
        if (response.status === 429) { await sleep(2000); break; }
        if (!response.ok) break;
        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } catch { break; }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada Groq
// ─────────────────────────────────────────
async function callGroq(prompt: string, data: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: data },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });
  if (!response.ok) throw new Error(`Groq ${response.status}`);
  const result = await response.json();
  return result?.choices?.[0]?.message?.content || "";
}

// ─────────────────────────────────────────
// PROMPT DE ANÁLISE
// ─────────────────────────────────────────
const ANALYSIS_PROMPT = `Você é um analista de crédito sênior de um FIDC (Fundo de Investimento em Direitos Creditórios) focado em antecipação de recebíveis.

Receberá dados extraídos de documentos de um cedente (empresa que quer vender duplicatas ao fundo). Analise TODOS os dados disponíveis e gere uma análise completa de crédito.

Retorne APENAS um JSON válido com esta estrutura:

{
  "rating": 0.0,
  "ratingMax": 10,
  "decisao": "APROVADO | PENDENTE | REPROVADO",
  "resumoExecutivo": "Texto de 2-4 frases resumindo a empresa, seu perfil e a decisão",
  "alertas": [
    { "severidade": "ALTA | MODERADA | INFO", "descricao": "Descrição do alerta", "impacto": "Impacto no crédito" }
  ],
  "pontosFortes": [
    "Ponto forte com explicação e contexto (ex: '15 anos de operação → empresa com histórico comprovado')"
  ],
  "pontosFracos": [
    "Ponto fraco com explicação (ex: 'Faturamento zerado nos últimos 2 meses → risco de inatividade')"
  ],
  "perguntasVisita": [
    { "pergunta": "Pergunta relevante para visita técnica", "contexto": "Por que essa pergunta é importante" }
  ],
  "indicadores": {
    "idadeEmpresa": "",
    "alavancagem": "",
    "comprometimentoFaturamento": "",
    "concentracaoCredito": ""
  },
  "parecer": "Texto completo do parecer de crédito (3-6 parágrafos detalhados)"
}

CRITÉRIOS DE RATING (0-10):
- Situação cadastral ATIVA (+1, se INAPTA/SUSPENSA: -3)
- Empresa > 10 anos (+1.5), 5-10 anos (+1), < 5 anos (+0.5)
- Faturamento consistente e não-zerado (+1.5)
- Faturamento atualizado (últimos 60 dias) (+0.5)
- SCR sem operações vencidas (+1.5)
- SCR sem prejuízos (+1.5)
- Classificação de risco Bacen A-C (+1)
- Alavancagem saudável (dívida/faturamento < 5x) (+0.5)
- Diversificação de crédito (múltiplas IFs) (+0.5)
- Base (+0.5)

DECISÃO:
- Rating >= 7.0 → APROVADO
- Rating 4.0 a 6.9 → PENDENTE
- Rating < 4.0 → REPROVADO

REGRAS PARA O PARECER:
- Seja factual, baseado apenas nos dados fornecidos
- Identifique riscos específicos com números concretos
- Compare valores quando SCR anterior estiver disponível
- Calcule alavancagem: total dívida SCR / faturamento médio mensal
- Analise a composição da dívida (CP vs LP, modalidades)
- Identifique concentração de crédito
- Avalie a evolução do endividamento se dados anteriores disponíveis
- Pontos fortes e fracos devem incluir contextualização
- Perguntas para visita devem ser específicas e relevantes

NÃO invente dados que não estão nos documentos. Se um dado está ausente, indique como limitação da análise.`;

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.data) {
      return NextResponse.json({ error: "Dados não informados." }, { status: 400 });
    }

    // Serializar os dados extraídos para envio à IA
    const dataStr = JSON.stringify(body.data, null, 2);

    let analysisText: string;

    // Tentar Gemini primeiro, Groq como fallback
    try {
      analysisText = await callGemini(ANALYSIS_PROMPT, dataStr);
    } catch {
      if (GROQ_API_KEY) {
        try {
          analysisText = await callGroq(ANALYSIS_PROMPT, dataStr.substring(0, 10000));
        } catch {
          return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });
        }
      } else {
        return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });
      }
    }

    // Parse do JSON retornado
    let cleaned = analysisText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    if (!cleaned.startsWith("{")) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) cleaned = match[0];
    }

    const analysis = JSON.parse(cleaned);

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    console.error("[analyze] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao gerar análise." }, { status: 500 });
  }
}
