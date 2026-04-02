import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// LOCAL CALCULATION FUNCTIONS
// ─────────────────────────────────────────

function parseBRL(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateFaturamentoMetrics(faturamento: any) {
  const meses = faturamento?.meses || [];
  const valores = meses.map((m: { valor?: string }) => parseBRL(m.valor || "")).filter((v: number) => v > 0);

  if (valores.length === 0) return { fmm: 0, total: 0, media: 0, tendencia: "SEM_DADOS", cv: 0, mesesDesdeUltimoDado: 99 };

  const total = valores.reduce((a: number, b: number) => a + b, 0);
  const media = total / valores.length;
  const fmm = valores.length >= 12
    ? valores.slice(-12).reduce((a: number, b: number) => a + b, 0) / Math.min(12, valores.slice(-12).length)
    : media;

  // Coefficient of variation
  const variance = valores.reduce((sum: number, v: number) => sum + Math.pow(v - media, 2), 0) / valores.length;
  const cv = media > 0 ? Math.sqrt(variance) / media : 0;

  // Trend (last 6 months)
  const last6 = valores.slice(-6);
  let tendencia = "ESTAVEL";
  if (last6.length >= 3) {
    const firstHalf = last6.slice(0, Math.floor(last6.length / 2));
    const secondHalf = last6.slice(Math.floor(last6.length / 2));
    const avgFirst = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
    if (avgSecond > avgFirst * 1.1) tendencia = "CRESCENTE";
    else if (avgSecond < avgFirst * 0.9) tendencia = "DECRESCENTE";
  }

  return { fmm, total, media, tendencia, cv: Math.round(cv * 100) / 100, mesesDesdeUltimoDado: 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateSCRMetrics(scr: any, fmm: number) {
  const carteira = parseBRL(scr?.carteiraAVencer || scr?.totalDividasAtivas || "");
  const vencidos = parseBRL(scr?.vencidos || "");
  const prejuizos = parseBRL(scr?.prejuizos || "");
  const limite = parseBRL(scr?.limiteCredito || "");
  const cp = parseBRL(scr?.carteiraCurtoPrazo || "");
  const lp = parseBRL(scr?.carteiraLongoPrazo || "");

  const alavancagem = fmm > 0 ? Math.round((carteira / fmm) * 100) / 100 : null;
  const comprometimento = fmm > 0 ? Math.round((carteira / (fmm * 12)) * 10000) / 100 : null;

  return { carteira, vencidos, prejuizos, limite, cp, lp, alavancagem, comprometimento };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateLocalAlerts(data: any, fatMetrics: any, scrMetrics: any) {
  const alerts: Array<{ severidade: string; codigo: string; mensagem: string; origem: string }> = [];

  // CNPJ alerts
  if (data.cnpj?.situacaoCadastral && !data.cnpj.situacaoCadastral.toUpperCase().includes("ATIVA")) {
    alerts.push({ severidade: "ALTA", codigo: "EMPRESA_INATIVA", mensagem: `Situação cadastral: ${data.cnpj.situacaoCadastral}`, origem: "CNPJ" });
  }

  // Faturamento alerts
  if (data.faturamento?.faturamentoZerado) {
    alerts.push({ severidade: "ALTA", codigo: "FATURAMENTO_ZERADO", mensagem: "Faturamento zerado no período analisado", origem: "FATURAMENTO" });
  }
  if (!data.faturamento?.dadosAtualizados) {
    alerts.push({ severidade: "MODERADA", codigo: "DADOS_DESATUALIZADOS", mensagem: `Faturamento disponível até ${data.faturamento?.ultimoMesComDados || "N/D"}`, origem: "FATURAMENTO" });
  }
  if (fatMetrics.tendencia === "DECRESCENTE") {
    alerts.push({ severidade: "MODERADA", codigo: "TENDENCIA_QUEDA", mensagem: "Tendência de queda no faturamento dos últimos 6 meses", origem: "FATURAMENTO" });
  }
  if (fatMetrics.cv > 0.4) {
    alerts.push({ severidade: "MODERADA", codigo: "VOLATILIDADE_ALTA", mensagem: `Coeficiente de variação: ${(fatMetrics.cv * 100).toFixed(0)}%`, origem: "FATURAMENTO" });
  }

  // SCR alerts
  if (scrMetrics.vencidos > 0) {
    alerts.push({ severidade: "ALTA", codigo: "SCR_VENCIDOS", mensagem: `Operações vencidas: R$ ${scrMetrics.vencidos.toLocaleString("pt-BR")}`, origem: "SCR" });
  }
  if (scrMetrics.prejuizos > 0) {
    alerts.push({ severidade: "ALTA", codigo: "SCR_PREJUIZO", mensagem: `Prejuízos registrados: R$ ${scrMetrics.prejuizos.toLocaleString("pt-BR")}`, origem: "SCR" });
  }
  if (scrMetrics.alavancagem !== null && scrMetrics.alavancagem > 5) {
    alerts.push({ severidade: "MODERADA", codigo: "ALAVANCAGEM_ALTA", mensagem: `Alavancagem: ${scrMetrics.alavancagem}x (carteira/FMM)`, origem: "SCR" });
  }

  const cl = data.scr?.classificacaoRisco?.toUpperCase();
  if (cl && ["D", "E", "F", "G", "H"].includes(cl)) {
    alerts.push({ severidade: "MODERADA", codigo: "CLASSIFICACAO_RISCO", mensagem: `Classificação de risco Bacen: ${cl}`, origem: "SCR" });
  }

  return alerts;
}

// ─────────────────────────────────────────
// Chamada Gemini
// ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            generationConfig: { temperature: 0.15, maxOutputTokens: 8192, responseMimeType: "application/json" },
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ANALYSIS_PROMPT = `Você é um analista de crédito sênior de um FIDC (Fundo de Investimento em Direitos Creditórios) focado em antecipação de recebíveis.

Receberá dados extraídos de documentos de um cedente (empresa que quer vender duplicatas ao fundo), INCLUINDO indicadores pré-calculados no campo "_indicadores_calculados" e alertas detectados automaticamente no campo "_alertas_detectados".

IMPORTANTE - INDICADORES PRÉ-CALCULADOS:
- Use o FMM (Faturamento Médio Mensal) do campo _indicadores_calculados.fmm como base para cálculos de alavancagem e comprometimento. NÃO recalcule.
- Use a alavancagem pré-calculada (_indicadores_calculados.alavancagem) = carteira SCR / FMM.
- Use o comprometimento pré-calculado (_indicadores_calculados.comprometimento_fmm_pct) = (carteira SCR / faturamento anual) * 100.
- A tendência de faturamento dos últimos 6 meses já foi calculada (_indicadores_calculados.tendencia_6m): CRESCENTE, ESTAVEL, DECRESCENTE ou SEM_DADOS.
- O coeficiente de variação (_indicadores_calculados.coeficiente_variacao) mede a volatilidade do faturamento (>0.4 = alta volatilidade).

IMPORTANTE - ALERTAS DETECTADOS:
- O campo _alertas_detectados contém alertas já identificados automaticamente com severidade, código, mensagem e origem.
- Valide esses alertas com base nos dados brutos e expanda-os com contexto adicional na sua análise.
- Incorpore todos os alertas de severidade ALTA obrigatoriamente na sua resposta.

Analise TODOS os dados disponíveis e gere uma análise completa de crédito.

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
    "Ponto forte com números concretos (ex: 'FMM de R$ 150.000 com tendência CRESCENTE → empresa em expansão com receita previsível')"
  ],
  "pontosFracos": [
    "Ponto fraco com números concretos (ex: 'Alavancagem de 3.5x o FMM → endividamento acima do ideal para o porte')"
  ],
  "perguntasVisita": [
    { "pergunta": "Pergunta específica baseada nos alertas e dados detectados", "contexto": "Referência ao dado ou alerta que motivou a pergunta" }
  ],
  "indicadores": {
    "idadeEmpresa": "",
    "fmm": "",
    "alavancagem": "",
    "comprometimentoFaturamento": "",
    "tendenciaFaturamento": "",
    "concentracaoCredito": ""
  },
  "parecer": "Texto completo do parecer de crédito (3-6 parágrafos detalhados, mencionando valores concretos do FMM, alavancagem, comprometimento, tendência e alertas detectados)"
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
- Seja factual, baseado apenas nos dados fornecidos e nos indicadores pré-calculados
- Use os valores concretos do FMM, alavancagem e comprometimento nos parágrafos
- Mencione a tendência de faturamento e o coeficiente de variação quando relevantes
- Incorpore e expanda os alertas detectados automaticamente (_alertas_detectados)
- Compare valores quando SCR anterior estiver disponível
- Analise a composição da dívida (CP vs LP, modalidades)
- Identifique concentração de crédito
- Avalie a evolução do endividamento se dados anteriores disponíveis
- Pontos fortes e fracos DEVEM incluir números concretos extraídos dos indicadores
- Perguntas para visita devem ser específicas e baseadas nos alertas detectados

REGRAS PARA PERGUNTAS DE VISITA:
- Se houver alerta de FATURAMENTO_ZERADO, pergunte sobre a causa e projeção de retomada
- Se houver alerta de SCR_VENCIDOS ou SCR_PREJUIZO, pergunte sobre plano de regularização
- Se houver alerta de TENDENCIA_QUEDA, pergunte sobre fatores que causaram a queda e expectativa
- Se houver alerta de ALAVANCAGEM_ALTA, pergunte sobre a estratégia de desalavancagem
- Se houver alerta de DADOS_DESATUALIZADOS, pergunte sobre faturamento recente não registrado

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

    // Calculate local metrics
    const fatMetrics = calculateFaturamentoMetrics(body.data.faturamento);
    const scrMetrics = calculateSCRMetrics(body.data.scr, fatMetrics.fmm);
    const localAlerts = generateLocalAlerts(body.data, fatMetrics, scrMetrics);

    // ── GERAR ANÁLISE 100% LOCAL ──
    const d = body.data;
    const empresa = d.cnpj?.razaoSocial || "Empresa";
    const cnpj = d.cnpj?.cnpj || "";

    // Rating local (0-10)
    let rating = 0.5; // base
    if (d.cnpj?.situacaoCadastral?.toUpperCase().includes("ATIVA")) rating += 1;
    if (d.cnpj?.dataAbertura) {
      const parts = d.cnpj.dataAbertura.split("/");
      const year = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(year)) {
        const age = new Date().getFullYear() - year;
        if (age > 10) rating += 1.5;
        else if (age > 5) rating += 1;
        else rating += 0.5;
      }
    }
    if (!d.faturamento?.faturamentoZerado && fatMetrics.fmm > 0) rating += 1.5;
    if (d.faturamento?.dadosAtualizados) rating += 0.5;
    if (scrMetrics.vencidos === 0) rating += 1.5;
    if (scrMetrics.prejuizos === 0) rating += 1.5;
    const cl = d.scr?.classificacaoRisco?.toUpperCase();
    if (cl && ["A", "AA", "B", "C"].includes(cl)) rating += 1;
    if (scrMetrics.alavancagem !== null && scrMetrics.alavancagem < 5) rating += 0.5;

    // Penalidades
    if (scrMetrics.vencidos > 0) rating -= 2;
    if (scrMetrics.prejuizos > 0) rating -= 2;
    if (d.faturamento?.faturamentoZerado) rating -= 2;

    rating = Math.max(0, Math.min(10, Math.round(rating * 10) / 10));

    const decisao = rating >= 7 ? "APROVADO" : rating >= 4 ? "PENDENTE" : "REPROVADO";

    // Pontos fortes
    const pontosFortes: string[] = [];
    if (d.cnpj?.dataAbertura) {
      const parts = d.cnpj.dataAbertura.split("/");
      const year = parseInt(parts[parts.length - 1], 10);
      const age = new Date().getFullYear() - year;
      if (age > 5) pontosFortes.push(`${age} anos de operação — empresa com histórico comprovado`);
    }
    if (fatMetrics.fmm > 0) pontosFortes.push(`FMM de R$ ${fatMetrics.fmm.toLocaleString("pt-BR", {minimumFractionDigits: 2})} — faturamento recorrente`);
    if (fatMetrics.tendencia === "CRESCENTE") pontosFortes.push("Tendência de faturamento crescente nos últimos 6 meses");
    if (scrMetrics.vencidos === 0 && scrMetrics.prejuizos === 0) pontosFortes.push("SCR limpo — sem operações vencidas ou prejuízos");
    if (scrMetrics.alavancagem !== null && scrMetrics.alavancagem < 3) pontosFortes.push(`Alavancagem de ${scrMetrics.alavancagem}x — nível saudável`);
    if (d.cnpj?.situacaoCadastral?.toUpperCase().includes("ATIVA")) pontosFortes.push("Empresa com situação cadastral ATIVA na Receita Federal");

    // Pontos fracos
    const pontosFracos: string[] = [];
    if (scrMetrics.vencidos > 0) pontosFracos.push(`Operações vencidas no SCR: R$ ${scrMetrics.vencidos.toLocaleString("pt-BR")}`);
    if (scrMetrics.prejuizos > 0) pontosFracos.push(`Prejuízos registrados no SCR: R$ ${scrMetrics.prejuizos.toLocaleString("pt-BR")}`);
    if (d.faturamento?.faturamentoZerado) pontosFracos.push("Faturamento zerado — risco de inatividade operacional");
    if (!d.faturamento?.dadosAtualizados) pontosFracos.push(`Dados de faturamento desatualizados (último: ${d.faturamento?.ultimoMesComDados || "N/D"})`);
    if (fatMetrics.tendencia === "DECRESCENTE") pontosFracos.push("Tendência de queda no faturamento dos últimos 6 meses");
    if (scrMetrics.alavancagem !== null && scrMetrics.alavancagem > 5) pontosFracos.push(`Alavancagem elevada: ${scrMetrics.alavancagem}x (carteira/FMM)`);
    if (cl && ["D", "E", "F", "G", "H"].includes(cl)) pontosFracos.push(`Classificação de risco Bacen: ${cl}`);

    // Resumo executivo
    const resumo = `${empresa} (CNPJ: ${cnpj}). ${fatMetrics.fmm > 0 ? `FMM de R$ ${(fatMetrics.fmm/1000).toFixed(0)} mil` : "Faturamento não disponível"}. ${scrMetrics.carteira > 0 ? `Carteira SCR de R$ ${(scrMetrics.carteira/1000).toFixed(0)} mil` : "Sem histórico bancário no SCR"}. Decisão: ${decisao} (Rating ${rating}/10).`;

    // Parecer
    const parecerParts: string[] = [];
    parecerParts.push(`A empresa ${empresa} apresenta rating de ${rating}/10, resultando em decisão ${decisao}.`);
    if (pontosFortes.length > 0) parecerParts.push(`Pontos positivos identificados: ${pontosFortes.join("; ")}.`);
    if (pontosFracos.length > 0) parecerParts.push(`Pontos de atenção: ${pontosFracos.join("; ")}.`);
    if (scrMetrics.alavancagem !== null) parecerParts.push(`A alavancagem atual é de ${scrMetrics.alavancagem}x o FMM${scrMetrics.alavancagem < 5 ? ", dentro de parâmetros aceitáveis" : ", acima do recomendado"}.`);
    if (fatMetrics.tendencia !== "SEM_DADOS") parecerParts.push(`A tendência de faturamento dos últimos 6 meses é ${fatMetrics.tendencia.toLowerCase()}.`);

    const analysis = {
      rating,
      ratingMax: 10,
      decisao,
      resumoExecutivo: resumo,
      alertas: localAlerts.map(a => ({ severidade: a.severidade, descricao: a.mensagem, impacto: a.codigo })),
      pontosFortes,
      pontosFracos,
      perguntasVisita: [] as Array<{pergunta: string; contexto: string}>,
      indicadores: {
        fmm: fatMetrics.fmm > 0 ? `R$ ${fatMetrics.fmm.toLocaleString("pt-BR", {minimumFractionDigits: 2})}` : "N/D",
        alavancagem: scrMetrics.alavancagem !== null ? `${scrMetrics.alavancagem}x` : "N/D",
        comprometimento: scrMetrics.comprometimento !== null ? `${scrMetrics.comprometimento}%` : "N/D",
        tendencia: fatMetrics.tendencia,
      },
      parecer: parecerParts.join(" "),
    };

    // Validar e corrigir campos críticos
    if (typeof analysis.rating === 'number') {
      analysis.rating = Math.max(0, Math.min(10, Math.round(analysis.rating * 10) / 10));
    } else {
      analysis.rating = 5.0;
    }
    analysis.ratingMax = 10;
    const validDecisions = ['APROVADO', 'PENDENTE', 'REPROVADO'];
    if (!validDecisions.includes(analysis.decisao)) {
      analysis.decisao = analysis.rating >= 7 ? 'APROVADO' : analysis.rating >= 4 ? 'PENDENTE' : 'REPROVADO';
    }
    if (!Array.isArray(analysis.alertas)) analysis.alertas = [];
    if (!Array.isArray(analysis.pontosFortes)) analysis.pontosFortes = [];
    if (!Array.isArray(analysis.pontosFracos)) analysis.pontosFracos = [];
    if (!Array.isArray(analysis.perguntasVisita)) analysis.perguntasVisita = [];
    if (!analysis.resumoExecutivo) analysis.resumoExecutivo = '';
    if (!analysis.parecer) analysis.parecer = '';

    return NextResponse.json({
      success: true,
      analysis,
      indicadores: {
        fmm: fatMetrics.fmm,
        alavancagem: scrMetrics.alavancagem,
        comprometimento: scrMetrics.comprometimento,
        tendencia: fatMetrics.tendencia,
        cv: fatMetrics.cv,
      },
      alertas: localAlerts,
    });
  } catch (err) {
    console.error("[analyze] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao gerar análise." }, { status: 500 });
  }
}
