import { NextRequest, NextResponse } from "next/server";
import type { FundSettings } from "@/types";
import { DEFAULT_FUND_SETTINGS } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// Chamada Gemini (único provedor)
// ─────────────────────────────────────────
async function callGemini(prompt: string, data: string): Promise<string> {
  const parts = [{ text: prompt + "\n\n--- DADOS EXTRAÍDOS ---\n\n" + data }];

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      let rateLimitRetries = 0;
      const MAX_RATE_RETRIES = 2;

      for (let attempt = 0; attempt < 2 + MAX_RATE_RETRIES; attempt++) {
        try {
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
            }),
          });

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
              waitMs = Math.min(Math.max(waitMs, 2000), 60000);
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
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
          console.error(`[analyze] Gemini model=${model} returned empty response`);
        } catch (err) {
          console.error(`[analyze] Gemini model=${model} error:`, err instanceof Error ? err.message : err);
          break;
        }
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────
// PROMPT DE ANÁLISE
// ─────────────────────────────────────────
const ANALYSIS_PROMPT = `Você é um analista de crédito sênior de um FIDC (Fundo de Investimento em Direitos Creditórios) focado em antecipação de recebíveis.

Receberá dados extraídos de documentos de um cedente (empresa que quer vender duplicatas ao fundo) E cálculos pré-processados. Analise TODOS os dados disponíveis e gere uma análise completa.

Retorne APENAS um JSON válido com esta estrutura:

{
  "rating": 0.0,
  "ratingMax": 10,
  "decisao": "APROVADO | APROVACAO_CONDICIONAL | PENDENTE | REPROVADO",
  "alertas": [
    { "severidade": "ALTA | MODERADA | INFO", "descricao": "", "impacto": "", "mitigacao": "" }
  ],
  "indicadores": {
    "idadeEmpresa": "", "alavancagem": "", "fmm": "",
    "comprometimentoFaturamento": "", "concentracaoCredito": ""
  },
  "parametrosOperacionais": {
    "limiteAproximado": "",
    "prazoMaximo": "",
    "concentracaoSacado": "",
    "garantias": "",
    "revisao": ""
  },
  "parecer": {
    "resumoExecutivo": "",
    "pontosFortes": [],
    "pontosNegativosOuFracos": [],
    "perguntasVisita": [
      { "pergunta": "", "contexto": "" }
    ],
    "textoCompleto": ""
  }
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

DECISÃO (use OBRIGATORIAMENTE estes critérios — não use o rating):
- "APROVADO": FMM >= ${"`FMM_MINIMO`"}, idade >= ${"`IDADE_MINIMA`"} anos, sem SCR vencido, sem protestos críticos, alavancagem <= ${"`ALAV_SAUDAVEL`"}x
- "APROVACAO_CONDICIONAL": atende pré-requisitos mas tem 1 alerta moderado ou alavancagem entre ${"`ALAV_SAUDAVEL`"}x e ${"`ALAV_MAXIMA`"}x
- "PENDENTE": atende pré-requisitos mas tem 2+ alertas moderados ou dados insuficientes para decidir
- "REPROVADO": FMM < ${"`FMM_MINIMO`"} OU idade < ${"`IDADE_MINIMA`"} anos OU SCR vencido > 0 OU prejuízo SCR > 0 OU alavancagem > ${"`ALAV_MAXIMA`"}x

PARECER ESCRITO — Instruções de geração:
Use linguagem técnica, direta e factual. Não use markdown. Base-se APENAS nos dados fornecidos.

parecer.resumoExecutivo (1 parágrafo de 3-5 linhas):
Descreva setor de atuação, tempo de operação, faturamento mensal, perfil de endividamento e decisão com justificativa principal.
Formato: "[Empresa] é uma [setor] com [X] anos de operação e faturamento médio de R$ [FMM]/mês. [Situação do SCR]. [Decisão] — [motivo principal]."

parecer.pontosFortes (array de 3-6 strings):
Cada item: dado concreto + " → " + implicação para o fundo.
Exemplo: "Alavancagem de 3,38x dentro do limite saudável → empresa não está sobrecarregada de dívida bancária"
Só liste se o dado realmente existir nos documentos.

parecer.pontosNegativosOuFracos (array de 3-8 strings):
Mesmo formato dos fortes. Inclua obrigatoriamente se existirem: protestos vigentes com valor e % do FMM, SCR vencido ou prejuízo, alavancagem elevada, sócios com restrições, alterações societárias recentes.

parecer.perguntasVisita (array de 3-5 objetos { pergunta, contexto }):
Foque em: origem de protestos, capacidade produtiva vs faturamento, concentração de sacados, histórico de crises, garantias disponíveis.

parecer.textoCompleto (texto corrido, 3-4 parágrafos):
Parágrafo 1: Capacidade financeira — SCR, alavancagem, composição CP/LP, tendência.
Parágrafo 2: Disciplina de pagamento — protestos, processos, histórico de regularização.
Parágrafo 3: Estrutura societária — sócios, administração, grupo econômico, alertas.
Parágrafo 4 (se aplicável): Faturamento — validação, sazonalidade, tendência.

indicadores: use os valores pré-calculados fornecidos no início do prompt. Não recalcule.

alertas[].mitigacao: para cada alerta, inclua uma ação concreta e objetiva que o analista deve tomar para endereçar o risco. Ex: "Solicitar IRPF dos últimos 3 anos dos sócios", "Exigir certidão negativa de débitos atualizada".

parametrosOperacionais: calcule com base no rating, FMM, alavancagem e alertas identificados.
- limiteAproximado: FMM × fator_score × fator_risco — apresente o valor estimado e o raciocínio resumido (ex: "~0,6x FMM (R$ 4,2 milhões)")
- prazoMaximo: baseado no rating — rating >= 8.0: "90 dias", rating 6.0-7.9: "60-75 dias", rating < 6.0: "30-45 dias"
- concentracaoSacado: baseado no perfil de risco — baixo: "25%", moderado: "15%", alto: "10%"
- garantias: baseado nos alertas de sócios e estrutura societária (ex: "Aval dos sócios + garantia real")
- revisao: baseado na quantidade de alertas ativos (0-1: "180 dias", 2-3: "90 dias", 4+: "30-60 dias")

NÃO invente dados que não estão nos documentos. Se um dado está ausente, indique como limitação da análise.`;

// ─────────────────────────────────────────
// Helpers: parse de valores BR
// ─────────────────────────────────────────
function parseBRL(val: unknown): number {
  if (typeof val === "number") return val;
  if (!val || typeof val !== "string") return 0;
  return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
}

// ─────────────────────────────────────────
// Pré-requisitos determinísticos
// ─────────────────────────────────────────
function calcularPreRequisitos(data: Record<string, unknown>, settings: FundSettings) {
  const fat = (data.faturamento ?? {}) as Record<string, unknown>;

  // Recalcular FMM diretamente dos meses — ignora mediaAno cached
  const parseDateKey = (s: string): number => {
    if (!s) return 0;
    const parts = s.split("/");
    if (parts.length !== 2) return 0;
    const [p1, p2] = parts;
    const monthMap: Record<string, number> = {
      jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,
      jul:7,ago:8,set:9,out:10,nov:11,dez:12
    };
    const month = isNaN(Number(p1))
      ? (monthMap[p1.toLowerCase()] || 0)
      : Number(p1);
    const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
    return year * 100 + month;
  };

  const mesesValidos = [...((fat.meses as Array<{mes:string;valor:string}>) || [])]
    .filter((m) => m?.mes && m?.valor)
    .sort((a, b) => parseDateKey(a.mes) - parseDateKey(b.mes))
    .slice(-12);

  const fmm = mesesValidos.length > 0
    ? mesesValidos.reduce((s, m) => s + parseBRL(m.valor), 0) / mesesValidos.length
    : parseBRL(fat.mediaAno) || parseBRL(fat.mediaMensal) || 0;

  const cnpj = (data.cnpj ?? {}) as Record<string, unknown>;
  const dataAbertura = String(cnpj.dataAbertura ?? "");
  let idadeAnos = 0;
  if (/\d{2}\/\d{2}\/\d{4}/.test(dataAbertura)) {
    const [d, m, a] = dataAbertura.split("/").map(Number);
    const abertura = new Date(a, m - 1, d);
    idadeAnos = (Date.now() - abertura.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  }

  const motivoReprovacao: string[] = [];
  if (fmm > 0 && fmm < settings.fmm_minimo) {
    motivoReprovacao.push(`FMM de R$ ${fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} abaixo do minimo de R$ ${settings.fmm_minimo.toLocaleString("pt-BR")}/mes`);
  }
  if (idadeAnos > 0 && idadeAnos < settings.idade_minima_anos) {
    motivoReprovacao.push(`Empresa com ${idadeAnos.toFixed(1)} anos abaixo do minimo de ${settings.idade_minima_anos} anos`);
  }

  return {
    fmm,
    idadeAnos: Math.round(idadeAnos * 10) / 10,
    aprovadoPorPreRequisito: motivoReprovacao.length === 0,
    reprovadoPorPreRequisito: motivoReprovacao.length > 0,
    motivoReprovacao,
  };
}

// ─────────────────────────────────────────
// Cálculo de alavancagem
// ─────────────────────────────────────────
function calcularAlavancagem(data: Record<string, unknown>, settings: FundSettings) {
  const scr = (data.scr ?? {}) as Record<string, unknown>;
  const fat = (data.faturamento ?? {}) as Record<string, unknown>;

  const totalDivida = parseBRL(scr.totalDividasAtivas) || parseBRL(scr.carteiraAVencer);
  const fmm = parseBRL(fat.mediaAno) || parseBRL(fat.mediaMensal) || parseBRL(fat.fmm12m);

  if (fmm === 0 || totalDivida === 0) {
    return { alavancagem: null, totalDivida, fmm, label: "Nao calculavel (FMM ou divida zerados)" };
  }

  const alavancagem = totalDivida / fmm;
  const label = alavancagem <= settings.alavancagem_saudavel
    ? `${alavancagem.toFixed(2)}x — dentro do limite saudavel`
    : alavancagem <= settings.alavancagem_maxima
    ? `${alavancagem.toFixed(2)}x — elevado (limite aceitavel ate ${settings.alavancagem_maxima}x)`
    : `${alavancagem.toFixed(2)}x — CRITICO (acima de ${settings.alavancagem_maxima}x)`;

  return { alavancagem: Math.round(alavancagem * 100) / 100, totalDivida, fmm, label };
}

// ─────────────────────────────────────────
// Validação de dados de entrada
// ─────────────────────────────────────────
function countEmptyFieldRatio(obj: Record<string, unknown>): number {
  let total = 0;
  let empty = 0;

  function walk(value: unknown) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const v of Object.values(value as Record<string, unknown>)) {
        walk(v);
      }
    } else if (typeof value === "string") {
      total++;
      if (value === "") empty++;
    } else if (value === null || value === undefined) {
      total++;
      empty++;
    }
  }

  walk(obj);
  return total > 0 ? empty / total : 1;
}

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  let analysisText = "";
  let dataStr = "";

  try {
    const body = await request.json();

    if (!body.data) {
      return NextResponse.json({ error: "Dados não informados." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
    }

    // ──── Settings do fundo (defaults se não enviados) ────
    const settings: FundSettings = { ...DEFAULT_FUND_SETTINGS, ...(body.settings || {}) };

    // ──── Validação dos dados de entrada ────
    const docsWithError = Object.entries(body.data)
      .filter(([, v]) => (v as Record<string, unknown>)?.aiError === true)
      .map(([k]) => k);

    const emptyFieldRatio = countEmptyFieldRatio(body.data);

    if (docsWithError.length > 0 || emptyFieldRatio > 0.7) {
      console.log(`[analyze] Insufficient data: docs with error = [${docsWithError.join(", ")}], empty field ratio = ${(emptyFieldRatio * 100).toFixed(1)}%`);
      return NextResponse.json({
        error: "Dados insuficientes para análise.",
        docsWithError,
        emptyFieldRatio: Math.round(emptyFieldRatio * 100),
      }, { status: 400 });
    }

    // ──── Pré-requisitos determinísticos ────
    const preReq = calcularPreRequisitos(body.data, settings);
    const alav = calcularAlavancagem(body.data, settings);

    console.log(`[analyze] Pre-requisitos: fmm=${preReq.fmm}, idade=${preReq.idadeAnos}, aprovado=${preReq.aprovadoPorPreRequisito}`);
    console.log(`[analyze] Alavancagem: ${alav.label}`);

    // Se reprovado por pré-requisito, retorna sem chamar a IA
    if (preReq.reprovadoPorPreRequisito) {
      console.log(`[analyze] Reprovado por pre-requisito: ${preReq.motivoReprovacao.join("; ")}`);

      const faturamento = body.data?.faturamento as Record<string, string> | undefined;
      const cnpjData = body.data?.cnpj as Record<string, string> | undefined;
      const contratoData = body.data?.contrato as Record<string, string> | undefined;

      const fmm12mReal = faturamento?.fmm12m || faturamento?.mediaAno || "N/D";
      const idadeEmpresaAnos = contratoData?.dataConstituicao
        ? Math.floor(
            (Date.now() - new Date(contratoData.dataConstituicao.split("/").reverse().join("-")).getTime()) /
            (1000 * 60 * 60 * 24 * 365)
          )
        : null;

      const resumoExecutivo = [
        `A empresa ${cnpjData?.razaoSocial || "analisada"} (CNPJ: ${cnpjData?.cnpj || "N/D"}) foi reprovada na triagem de pre-requisitos do fundo e nao seguiu para analise de credito detalhada.`,
        ``,
        `Motivos da reprovacao:`,
        ...preReq.motivoReprovacao.map((m: string) => `• ${m}`),
        ``,
        `Parametros minimos exigidos pelo fundo:`,
        `• FMM minimo: R$ ${settings.fmm_minimo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `• Idade minima da empresa: ${settings.idade_minima_anos} anos`,
        ``,
        `Valores encontrados:`,
        `• FMM 12M: R$ ${fmm12mReal}`,
        idadeEmpresaAnos !== null ? `• Idade da empresa: ${idadeEmpresaAnos} anos` : null,
        ``,
        `Recomendacao: reanalisar em 6 meses caso a empresa apresente melhora nos indicadores reprovados.`,
      ]
        .filter((l) => l !== null)
        .join("\n");

      const perguntasVisita = [
        { pergunta: "O faturamento abaixo do mínimo reflete sazonalidade ou é uma tendência estrutural do negócio?", contexto: "Verificar histórico de meses e comparar com setor" },
        { pergunta: "Existem contratos assinados ou pedidos firmes que justifiquem recuperação de faturamento nos próximos 6 meses?", contexto: "Avaliar pipeline comercial e backlog" },
        { pergunta: "Quais são os principais clientes e qual a concentração de receita por sacado?", contexto: "Risco de concentração e dependência" },
        { pergunta: "A empresa possui outras fontes de receita não refletidas no faturamento apresentado?", contexto: "Receitas não operacionais ou subsidiárias" },
        { pergunta: "Houve algum evento pontual que explique o resultado abaixo do esperado?", contexto: "Perda de cliente, reestruturação, eventos externos" },
      ];

      const parametrosOperacionais = {
        limiteAproximado: "Não aplicável — empresa reprovada",
        prazoMaximo: `${settings.prazo_maximo_aprovado} dias (referência)`,
        concentracaoSacado: `${settings.concentracao_max_sacado}%`,
        garantias: "N/A",
        revisao: `Reavaliar em 6 meses`,
      };

      const analysis = {
        rating: 0,
        ratingMax: 10,
        decisao: "REPROVADO",
        motivoPreRequisito: preReq.motivoReprovacao,
        parecer: {
          resumoExecutivo,
          pontosFortes: [],
          pontosNegativosOuFracos: preReq.motivoReprovacao,
          perguntasVisita,
          textoCompleto: resumoExecutivo,
        },
        alertas: preReq.motivoReprovacao.map((motivo: string) => ({
          severidade: "ALTA",
          descricao: motivo,
          impacto: "Empresa nao elegivel para operacao neste fundo",
          mitigacao: "Reanalisar apos melhora nos indicadores reprovados",
        })),
        indicadores: {
          idadeEmpresa: idadeEmpresaAnos !== null ? `${idadeEmpresaAnos} anos` : `${preReq.idadeAnos} anos`,
          alavancagem: alav.label,
          fmm: `R$ ${fmm12mReal}`,
          comprometimentoFaturamento: "",
          concentracaoCredito: "",
        },
        parametrosOperacionais,
        variacoes: {
          emDia: "", carteiraCurtoPrazo: "", carteiraLongoPrazo: "",
          totalDividasAtivas: "", vencidos: "", prejuizos: "",
          limiteCredito: "", numeroIfs: "",
        },
        // backward compat
        resumoExecutivo,
        pontosFortes: [],
        pontosFracos: preReq.motivoReprovacao,
        perguntasVisita,
      };

      return NextResponse.json({ success: true, analysis });
    }

    // ──── Alerta automático: meses com faturamento zero ────
    const fatData = (body.data?.faturamento ?? {}) as Record<string, unknown>;
    const alertasMesesZerados: Array<{ severidade: string; descricao: string; impacto: string; mitigacao: string }> = [];
    if (fatData.temMesesZerados === true) {
      const qtd = Number(fatData.quantidadeMesesZerados || 0);
      const lista = ((fatData.mesesZerados as Array<{ mes: string }>) || []).map(m => m.mes).join(", ");
      alertasMesesZerados.push({
        severidade: "MODERADA",
        descricao: `${qtd} mês(es) com faturamento zero: ${lista}`,
        impacto: "FMM pode estar subestimado — verificar sazonalidade ou interrupção operacional",
        mitigacao: "Solicitar extrato bancário ou NF-e dos meses zerados para confirmar",
      });
    }

    // ──── Cache validation ────
    if (body.cachedAnalysis) {
      const aiAnalysis = body.cachedAnalysis;
      const cacheValido =
        aiAnalysis &&
        aiAnalysis.parametrosOperacionais &&
        aiAnalysis.alertas?.[0]?.mitigacao !== undefined;
      if (cacheValido) {
        console.log(`[analyze] Cache válido — retornando análise salva sem chamar Gemini`);
        return NextResponse.json({ success: true, analysis: aiAnalysis });
      }
      console.log(`[analyze] Cache inválido (sem parametrosOperacionais ou mitigacao) — forçando nova análise`);
    }

    // ──── Serializar dados + injetar cálculos ────
    dataStr = JSON.stringify(body.data, null, 2);

    const calculosInjetados = `
--- CALCULOS PRE-PROCESSADOS (use estes valores, nao recalcule) ---
FMM (Faturamento Medio Mensal): R$ ${preReq.fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
Idade da empresa: ${preReq.idadeAnos} anos
Alavancagem (divida total / FMM): ${alav.label}
Total divida SCR: R$ ${alav.totalDivida.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
`;

    console.log(`[analyze] Sending ${dataStr.length} chars + calculos to Gemini`);

    // ──── Chamar Gemini ────
    // Inject settings into prompt
    const dynamicPrompt = ANALYSIS_PROMPT
      .replace(/`FMM_MINIMO`/g, `R$ ${settings.fmm_minimo.toLocaleString("pt-BR")}`)
      .replace(/`IDADE_MINIMA`/g, String(settings.idade_minima_anos))
      .replace(/`ALAV_SAUDAVEL`/g, String(settings.alavancagem_saudavel))
      .replace(/`ALAV_MAXIMA`/g, String(settings.alavancagem_maxima));

    analysisText = await callGemini(dynamicPrompt, calculosInjetados + "\n" + dataStr);

    // ──── Parse do JSON retornado ────
    console.log(`[analyze] Gemini raw response (first 1000 chars):`, analysisText.substring(0, 1000));

    let cleaned = analysisText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    if (!cleaned.startsWith("{")) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) cleaned = match[0];
    }

    const analysis = JSON.parse(cleaned);

    // ──── Injetar alertas determinísticos antes dos da IA ────
    if (alertasMesesZerados.length > 0) {
      analysis.alertas = [...alertasMesesZerados, ...(analysis.alertas ?? [])];
    }

    // ──── Defaults para campos críticos ────
    analysis.rating = analysis.rating ?? 0;
    analysis.semaforo = analysis.semaforo ?? "VERMELHO";
    analysis.decisao = analysis.decisao ?? "PENDENTE";
    analysis.alertas = (analysis.alertas ?? []).map((a: Record<string, string>) => ({
      ...a,
      mitigacao: a.mitigacao ?? "",
    }));
    analysis.parametrosOperacionais = {
      limiteAproximado: "",
      prazoMaximo: "",
      concentracaoSacado: "",
      garantias: "",
      revisao: "",
      ...(analysis.parametrosOperacionais ?? {}),
    };

    // Normalizar parecer — suporta formato antigo (string) e novo (objeto)
    if (typeof analysis.parecer === "string") {
      analysis.parecer = {
        resumoExecutivo: analysis.resumoExecutivo || "",
        pontosFortes: analysis.pontosFortes || [],
        pontosNegativosOuFracos: analysis.pontosFracos || [],
        perguntasVisita: analysis.perguntasVisita || [],
        textoCompleto: analysis.parecer,
      };
    } else {
      analysis.parecer = analysis.parecer ?? {};
      analysis.parecer.resumoExecutivo = analysis.parecer.resumoExecutivo || analysis.resumoExecutivo || "";
      analysis.parecer.pontosFortes = analysis.parecer.pontosFortes || analysis.pontosFortes || [];
      analysis.parecer.pontosNegativosOuFracos = analysis.parecer.pontosNegativosOuFracos || analysis.pontosFracos || [];
      analysis.parecer.perguntasVisita = analysis.parecer.perguntasVisita || analysis.perguntasVisita || [];
      analysis.parecer.textoCompleto = analysis.parecer.textoCompleto || "";
    }

    // Copiar para campos top-level para backward compat com GenerateStep
    analysis.resumoExecutivo = analysis.parecer.resumoExecutivo;
    analysis.pontosFortes = analysis.parecer.pontosFortes;
    analysis.pontosFracos = analysis.parecer.pontosNegativosOuFracos;
    analysis.perguntasVisita = analysis.parecer.perguntasVisita;

    // ──── Injetar cálculos determinísticos nos indicadores ────
    analysis.indicadores = analysis.indicadores ?? {};
    analysis.indicadores.alavancagem = alav.label;
    analysis.indicadores.idadeEmpresa = `${preReq.idadeAnos} anos`;
    analysis.indicadores.fmm = `R$ ${preReq.fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[analyze] Error: ${errMsg}`);
    if (analysisText) {
      console.error(`[analyze] Raw AI response (first 300 chars):`, analysisText.substring(0, 300));
    }
    console.error(`[analyze] Input data size: ${dataStr.length} chars`);
    return NextResponse.json({ error: "Erro ao gerar análise." }, { status: 500 });
  }
}
