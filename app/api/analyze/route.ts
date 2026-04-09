import { NextRequest, NextResponse } from "next/server";
import type { FundSettings, ExtractedData } from "@/types";
import { DEFAULT_FUND_SETTINGS } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 90;

// ─── Cache em memória das análises IA (evita re-chamar Gemini para o mesmo CNPJ) ───
const analysisCache = new Map<string, { analysis: object; expiresAt: number }>();
const ANALYSIS_CACHE_TTL = 90 * 60 * 1000; // 90 min

function getAnalysisCacheKey(data: unknown): string {
  try {
    const d = data as Record<string, unknown>;
    const cnpj = ((d.cnpj as Record<string, string>)?.cnpj || "").replace(/\D/g, "");
    const fmm = (d.faturamento as Record<string, string>)?.fmm12m || (d.faturamento as Record<string, string>)?.mediaAno || "";
    const scr = (d.scr as Record<string, string>)?.totalDividasAtivas || "";
    return `${cnpj}|${fmm}|${scr}`.substring(0, 120);
  } catch { return ""; }
}

// ─── Payload compacto: reduz de ~80kb para ~12kb antes de enviar ao Gemini ───
function buildPayloadResumo(data: ExtractedData): string {
  return JSON.stringify({
    cnpj: {
      razaoSocial: data.cnpj.razaoSocial, cnpj: data.cnpj.cnpj,
      dataAbertura: data.cnpj.dataAbertura, situacaoCadastral: data.cnpj.situacaoCadastral,
      porte: data.cnpj.porte, cnaePrincipal: data.cnpj.cnaePrincipal,
      naturezaJuridica: data.cnpj.naturezaJuridica, capitalSocialCNPJ: data.cnpj.capitalSocialCNPJ,
      tipoEmpresa: data.cnpj.tipoEmpresa, funcionarios: data.cnpj.funcionarios,
      regimeTributario: data.cnpj.regimeTributario,
    },
    qsa: {
      capitalSocial: data.qsa.capitalSocial,
      quadroSocietario: data.qsa.quadroSocietario.slice(0, 8).map(s => ({
        nome: s.nome, participacao: s.participacao, qualificacao: s.qualificacao,
      })),
    },
    faturamento: {
      fmm12m: data.faturamento.fmm12m, fmmMedio: data.faturamento.fmmMedio,
      somatoriaAno: data.faturamento.somatoriaAno, ultimoMesComDados: data.faturamento.ultimoMesComDados,
      mesesZerados: data.faturamento.mesesZerados?.slice(0, 5),
      meses: data.faturamento.meses.slice(-12).map(m => ({ mes: m.mes, valor: m.valor })),
    },
    scr: {
      totalDividasAtivas: data.scr.totalDividasAtivas, vencidos: data.scr.vencidos,
      prejuizos: data.scr.prejuizos, carteiraAVencer: data.scr.carteiraAVencer,
      limiteCredito: data.scr.limiteCredito, qtdeInstituicoes: data.scr.qtdeInstituicoes,
      qtdeOperacoes: data.scr.qtdeOperacoes, classificacaoRisco: data.scr.classificacaoRisco,
      historicoInadimplencia: data.scr.historicoInadimplencia, tempoAtraso: data.scr.tempoAtraso,
      modalidades: data.scr.modalidades?.slice(0, 10),
      instituicoes: data.scr.instituicoes?.slice(0, 8),
    },
    scrAnterior: data.scrAnterior ? {
      totalDividasAtivas: data.scrAnterior.totalDividasAtivas, vencidos: data.scrAnterior.vencidos,
      prejuizos: data.scrAnterior.prejuizos, limiteCredito: data.scrAnterior.limiteCredito,
    } : null,
    protestos: {
      vigentesQtd: data.protestos.vigentesQtd, vigentesValor: data.protestos.vigentesValor,
      regularizadosQtd: data.protestos.regularizadosQtd,
      detalhes: data.protestos.detalhes.slice(0, 5),
    },
    processos: {
      passivosTotal: data.processos.passivosTotal, ativosTotal: data.processos.ativosTotal,
      valorTotalEstimado: data.processos.valorTotalEstimado, temRJ: data.processos.temRJ,
      distribuicao: data.processos.distribuicao,
      bancarios: data.processos.bancarios?.slice(0, 5),
      fiscais: data.processos.fiscais?.slice(0, 3),
      top10Valor: data.processos.top10Valor?.slice(0, 5).map(p => ({
        tipo: p.tipo, partes: p.partes, polo_passivo: p.polo_passivo, valor: p.valor, status: p.status,
      })),
    },
    ccf: data.ccf ? {
      qtdRegistros: data.ccf.qtdRegistros, bancos: data.ccf.bancos.slice(0, 5),
      tendenciaLabel: data.ccf.tendenciaLabel, tendenciaVariacao: data.ccf.tendenciaVariacao,
    } : null,
    curvaABC: data.curvaABC || null,
    dre: data.dre ? {
      anos: data.dre.anos?.slice(-3),
      tendenciaLucro: data.dre.tendenciaLucro, crescimentoReceita: data.dre.crescimentoReceita,
    } : null,
    balanco: data.balanco ? {
      anos: data.balanco.anos?.slice(-3),
      tendenciaPatrimonio: data.balanco.tendenciaPatrimonio,
    } : null,
    irSocios: data.irSocios?.slice(0, 3).map(s => ({
      nomeSocio: s.nomeSocio, anoBase: s.anoBase, rendimentoTotal: s.rendimentoTotal,
      patrimonioLiquido: s.patrimonioLiquido, situacaoMalhas: s.situacaoMalhas, debitosEmAberto: s.debitosEmAberto,
    })),
    contrato: data.contrato ? {
      capitalSocial: data.contrato.capitalSocial, dataConstituicao: data.contrato.dataConstituicao,
      objetoSocial: (data.contrato.objetoSocial || "").substring(0, 200),
    } : null,
    relatorioVisita: data.relatorioVisita || null,
    scrSocios: data.scrSocios?.slice(0, 3),
  });
}

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS = ["google/gemini-2.0-flash-exp:free", "google/gemini-2.5-pro-exp-03-25:free"];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// Chamada Gemini
// ─────────────────────────────────────────
async function callGemini(prompt: string, data: string): Promise<string> {
  const parts = [{ text: prompt + "\n\n--- DADOS EXTRAÍDOS ---\n\n" + data }];

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      let rateLimitRetries = 0;
      const MAX_RATE_RETRIES = 1;

      for (let attempt = 0; attempt < 1 + MAX_RATE_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000); // 25s por chamada
          let response: Response;
          try {
            response = await fetch(geminiUrl(model, apiKey), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
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
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
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
async function callOpenRouter(prompt: string, data: string): Promise<string> {
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

// ─────────────────────────────────────────
// PROMPT DE ANÁLISE
// ─────────────────────────────────────────
const ANALYSIS_PROMPT = `Você é o motor de análise de crédito da plataforma Capital Finanças, especializado em due diligence de cedentes para operações de FIDC (Fundo de Investimento em Direitos Creditórios).

Receberá dados extraídos de documentos de um cedente e cálculos pré-processados. Analise TODOS os dados disponíveis e gere uma análise completa e estruturada.

Você não inventa dados. Se um dado não está nos documentos, use "—" ou sinalize como "não disponível".

Retorne APENAS um JSON válido com esta estrutura exata:

{
  "rating": 0.0,
  "ratingMax": 10,
  "decisao": "APROVADO | APROVACAO_CONDICIONAL | PENDENTE | REPROVADO",
  "alertas": [
    {
      "severidade": "ALTA | MODERADA | INFO",
      "codigo": "SCR_VENCIDO",
      "descricao": "Descrição objetiva com valor numérico quando disponível",
      "impacto": "Impacto concreto para o fundo",
      "mitigacao": "Ação concreta e objetiva para o analista"
    }
  ],
  "indicadores": {
    "idadeEmpresa": "",
    "alavancagem": "",
    "fmm": "",
    "comprometimentoFaturamento": "",
    "concentracaoCredito": "",
    "liquidezCorrente": "",
    "endividamento": "",
    "margemLiquida": ""
  },
  "parametrosOperacionais": {
    "limiteAproximado": "",
    "prazoMaximo": "",
    "concentracaoSacado": "",
    "garantias": "",
    "revisao": "",
    "baseCalculo": ""
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

=== SISTEMA DE ALERTAS ===

Use OBRIGATORIAMENTE os códigos abaixo. Inclua todos os alertas que se aplicam aos dados fornecidos.

Critérios para [ALTA] — severidade "ALTA":
— CCF_REGISTRADO: qualquer registro de CCF (Cheque Sem Fundo) identificado — CRÍTICO: indica inadimplência intencional com o sistema bancário, sinal de gestão financeira gravemente comprometida
— CCF_REINCIDENTE: múltiplos bancos ou alto volume de CCF — indica padrão sistêmico de inadimplência, praticamente inviabiliza a operação
— SCR_VENCIDO: SCR com valor vencido > R$ 0
— SCR_PREJUIZO: operações em prejuízo no SCR
— BALANCO_PL_NEGATIVO: Patrimônio Líquido negativo
— BALANCO_LIQUIDEZ_BAIXA: Liquidez Corrente < 0,20
— SOCIO_DEBITO_RF: sócio com débitos em aberto na Receita Federal / PGFN
— PROC_RJ: Recuperação Judicial ativa
— FAT_ZERADO: faturamento zerado em algum mês do período analisado
— SCR_PREJUIZO_DUPLO: prejuízo SCR presente em dois períodos consecutivos

Critérios para [MODERADA] — severidade "MODERADA":
— MOD_SOCIETARIA_RECENTE: alteração societária nos últimos 12 meses
— SCR_REDUCAO_LIMITE: limite de crédito reduzido > 50% no SCR
— BALANCO_CAPITAL_GIRO_NEG: Capital de Giro negativo
— BALANCO_ENDIVIDAMENTO_ALTO: endividamento > 150%
— DRE_EBITDA_AUSENTE: EBITDA não calculável por falta de dados
— SOCIO_IR_DESATUALIZADO: IR do sócio com ano-base > 2 anos atrás
— MOD_SOCIO_UNICO: sócio único (concentração de gestão)
— SCR_ALAVANCAGEM_ALTA: alavancagem entre o limite saudável e o máximo
— PROC_TRABALHISTA: processos trabalhistas identificados
— PROC_BANCO: processos bancários identificados
— PROC_FISCAL: processos fiscais identificados

— ABC_CONCENTRACAO_ALTA: maior cliente concentra acima do limite de 30% da receita
  descricao: "{Nome do cliente} representa {X}% da receita total"
  impacto: "Limite de concentração: 30% · Período: {período}"

Critérios para [INFO] — severidade "INFO":
— SCR_REDUCAO_DIVIDA: redução expressiva de dívida (pode indicar renegociação)
— SCR_REDUCAO_IFS: saída de IFs no SCR (redução de crédito disponível)
— GRUPO_GAP_SOCIETARIO: grupo econômico identificado mas sem dados completos
— SOCIO_IR_AUSENTE: IR dos sócios não enviado
— DADOS_PARCIAIS: dados parcialmente disponíveis — revisar documento fonte

=== CÁLCULO DO SCORE (0–10) ===

Calcule o score por componentes ponderados:

1. SCR (peso 25%):
   — Sem vencidos e sem prejuízo: 10,0
   — Sem vencidos, com prejuízo leve: 6,0
   — Com vencidos: 2,0
   — Com RJ: 0,0

2. Faturamento (peso 20%):
   — FMM acima do mínimo, consistente, sem zeros: 10,0
   — FMM acima do mínimo com irregularidades: 7,0
   — FMM abaixo do mínimo: 2,0
   — Faturamento não informado: 3,0

3. CCF — Cheques Sem Fundo (peso 15%):
   ATENÇÃO: CCF (Cheque Sem Fundo) é o indicador mais decisivo de disciplina de pagamento no sistema bancário. Um único registro indica que o sacador emitiu cheque sem cobertura, o que compromete gravemente a credibilidade financeira da empresa.
   — Sem nenhum registro de CCF: 10,0
   — 1–3 registros em banco único, sem reincidência: 3,0
   — 4+ registros OU múltiplos bancos OU reincidência: 0,0
   — CCF não consultado: 7,0 (neutro — benefício da dúvida moderado)

4. Protestos (peso 15%):
   — Sem protestos vigentes: 10,0
   — 1–2 protestos de valor baixo (< 5% FMM): 6,0
   — Protestos de valor significativo (> 5% FMM): 2,0
   — Não consultado: 5,0

5. Processos (peso 10%):
   — Sem processos: 10,0
   — Processos de baixo valor / trabalhista isolado: 7,0
   — Múltiplos processos ou valores altos: 4,0
   — RJ ativo: 0,0
   — Não consultado: 5,0

6. Balanço/DRE (peso 10%):
   — PL positivo, liquidez > 1,0, margem positiva: 10,0
   — PL positivo, liquidez 0,5–1,0: 7,0
   — PL positivo, liquidez < 0,5: 4,0
   — PL negativo: 1,0
   — Não informado: 5,0

7. Sócios/Governança (peso 5%):
   — IR atualizado, sem restrições, múltiplos sócios: 10,0
   — IR com ressalvas ou desatualizado: 6,0
   — Débitos em aberto / restrições: 2,0
   — IR não informado: 4,0

Score final = média ponderada dos componentes (SCR 25% + Fat 20% + CCF 15% + Protestos 15% + Processos 10% + Balanço 10% + Sócios 5% = 100%)
Penalidades adicionais: -1,5 por cada alerta CCF [ALTA]; -1,0 por cada outro alerta [ALTA]; -0,3 por cada alerta [MODERADA] (mínimo 0)

Faixas de decisão por score:
— score >= 7,5: APROVADO
— score 6,0–7,4: APROVACAO_CONDICIONAL
— score 4,0–5,9: PENDENTE
— score < 4,0: REPROVADO

=== DECISÃO ===

A decisão TAMBÉM deve obedecer regras absolutas independentes do score:
— REPROVADO obrigatório se: CCF com qualquer registro (qtdRegistros > 0) OU SCR vencido > 0 OU prejuízo SCR > 0 OU RJ ativo OU alavancagem > ALAV_MAXIMA
— PENDENTE obrigatório se: 2+ alertas [ALTA] sem mitigação clara OU dados críticos ausentes
— ATENÇÃO ESPECIAL CCF: se houver qualquer registro de CCF, o parecer deve destacar isso como fator determinante para reprovação, explicando que cheques sem fundo indicam incapacidade ou recusa de honrar compromissos bancários, o que inviabiliza a confiança necessária para uma operação de FIDC
— Use o score como guia, mas respeite os critérios absolutos acima

=== FORMATAÇÃO DOS VALORES ===

— Monetários: sempre com R$ e separador de milhar. Ex: R$ 1.234.567,89
— Percentuais: duas casas decimais. Ex: 12,34%
— Variações: com + ou -. Ex: +7,6% / -21,5%
— Datas: MM/AAAA ou DD/MM/AAAA
— Dados ausentes: sempre "—", nunca "N/A", "null" ou vazio

=== INSTRUÇÕES DO PARECER ===

parecer.resumoExecutivo (1 parágrafo, 3–5 linhas):
Perfil da empresa → situação de crédito → decisão com justificativa.
Formato: "[Empresa] é uma [setor] com [X] anos de operação e FMM de R$ [valor]/mês. [Situação SCR/dívidas]. [Decisão] — [motivo principal]."

parecer.pontosFortes (3–6 itens):
Formato: "dado concreto com número → implicação para o fundo"
Exemplo: "37 anos de operação → empresa com resiliência comprovada, atravessou múltiplos ciclos econômicos"
Só inclua se o dado estiver nos documentos.

parecer.pontosNegativosOuFracos (3–8 itens):
Mesmo formato. Inclua OBRIGATORIAMENTE se existirem: protestos com valor e % do FMM, SCR vencido/prejuízo, alavancagem elevada, sócios com restrições, alterações societárias recentes, margens negativas.

parecer.perguntasVisita (3–6 objetos { pergunta, contexto }):
Foque nos alertas [ALTA] e [MODERADA] identificados. Tom direto de analista experiente.
Contexto entre parênteses explica por que a pergunta importa para a operação.

parecer.textoCompleto (3–4 parágrafos corridos, sem markdown, sem bullets):
P1 — Capacidade financeira: SCR, alavancagem, CP/LP, tendência
P2 — Disciplina de pagamento: protestos, processos, histórico
P3 — Estrutura societária: sócios, administração, grupo econômico
P4 — Faturamento (se disponível): validação, sazonalidade, tendência

=== PARÂMETROS OPERACIONAIS ===

limiteAproximado: calcule como FMM × fator baseado no score e alertas.
  — score >= 8,0 e sem [ALTA]: FMM × 0,8
  — score 6,0–7,9 ou 1 alerta [ALTA]: FMM × 0,5
  — score < 6,0 ou 2+ alertas [ALTA]: FMM × 0,3
  — Apresente: "~R$ [valor] (aproximadamente [X]x FMM — [raciocínio])"

prazoMaximo:
  — score >= 8,0: "90 dias"
  — score 6,0–7,9: "60–75 dias"
  — score 4,0–5,9: "30–45 dias"
  — score < 4,0: "Não recomendado"

concentracaoSacado:
  — Risco baixo (score >= 7,5): "até 25% por sacado"
  — Risco moderado (score 5,0–7,4): "até 15% por sacado"
  — Risco alto (score < 5,0): "até 10% por sacado"

garantias: baseado nos alertas de sócios e estrutura
  — Sem alertas críticos: "Aval dos sócios"
  — Com alertas moderados: "Aval dos sócios + cessão fiduciária de recebíveis"
  — Com alertas altos: "Aval dos sócios + garantia real + duplicatas em garantia"

revisao:
  — 0–1 alertas: "180 dias"
  — 2–3 alertas: "90 dias"
  — 4+ alertas: "30–60 dias"

baseCalculo: descreva resumidamente o raciocínio do limite (ex: "FMM de R$ X × 0,6 pelo score de Y/10 com Z alertas [ALTA]")

NÃO recalcule os indicadores já fornecidos no início do prompt. Use os valores pré-calculados.
NÃO invente dados. Se ausente: "—" e alerta DADOS_PARCIAIS quando relevante.`;

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

const PROMPT_SINTESE = (data: ExtractedData, settings: FundSettings, preReq: ReturnType<typeof calcularPreRequisitos>) => `
Você é um analista de crédito sênior especializado em FIDCs (Fundos de Investimento em Direitos Creditórios).
Escreva uma síntese executiva completa sobre o cedente abaixo para embasar a decisão de crédito do fundo.

DADOS DA EMPRESA:
- Razão Social: ${data.cnpj?.razaoSocial || "N/D"}
- CNPJ: ${data.cnpj?.cnpj || "N/D"}
- Setor: ${data.cnpj?.cnaePrincipal || "N/D"}
- Data de Abertura: ${data.cnpj?.dataAbertura || "N/D"}
- Situação: ${data.cnpj?.situacaoCadastral || "N/D"}
- Sócios: ${(data.qsa?.quadroSocietario || data.contrato?.socios || []).map((s: { nome?: string; participacao?: string; qualificacao?: string }) => `${s.nome} (${s.participacao || s.qualificacao || ""})`).join(", ") || "N/D"}

FATURAMENTO:
- FMM 12M: R$ ${data.faturamento?.fmm12m || data.faturamento?.mediaAno || "N/D"}
- FMM Médio: R$ ${data.faturamento?.fmmMedio || "N/D"}
- Tendência: ${data.faturamento?.tendencia || "N/D"}
- Mínimo exigido pelo fundo: R$ ${settings.fmm_minimo?.toLocaleString("pt-BR") || "N/D"}
- Pré-requisito FMM: ${preReq.reprovadoPorPreRequisito ? "REPROVADO" : "APROVADO"}

SCR DA EMPRESA (${data.scr?.periodoReferencia || "N/D"}):
- Total dívidas: R$ ${data.scr?.totalDividasAtivas || "0,00"}
- Vencidos: R$ ${data.scr?.vencidos || "0,00"}
- Prejuízos: R$ ${data.scr?.prejuizos || "0,00"}
- Qtde IFs: ${data.scr?.qtdeInstituicoes || "0"}

${data.scrSocios && data.scrSocios.length > 0 ? `SCR DOS SÓCIOS:
${data.scrSocios.map((s) => `- ${s.nomeSocio}: Dívidas R$ ${s.periodoAtual?.totalDividasAtivas || "0,00"}, Vencidos R$ ${s.periodoAtual?.vencidos || "0,00"}, Prejuízos R$ ${s.periodoAtual?.prejuizos || "0,00"}`).join("\n")}` : "SCR DOS SÓCIOS: Não informado"}

${(data.dre?.anos?.length ?? 0) > 0 ? `DRE — ÚLTIMOS ${data.dre!.anos.length} ANOS:
${data.dre!.anos.map((a: { ano: string; receitaBruta: string; lucroLiquido: string; margemLiquida: string }) => `- ${a.ano}: Receita R$ ${a.receitaBruta}, Lucro R$ ${a.lucroLiquido}, Margem ${a.margemLiquida}%`).join("\n")}
- Tendência: ${data.dre!.tendenciaLucro}
- Crescimento receita: ${data.dre!.crescimentoReceita}%
${data.dre!.observacoes ? `- Observações: ${data.dre!.observacoes}` : ""}` : "DRE: Não informado"}

${(data.balanco?.anos?.length ?? 0) > 0 ? `BALANÇO — ÚLTIMOS ${data.balanco!.anos.length} ANOS:
${data.balanco!.anos.map((a: { ano: string; ativoTotal: string; patrimonioLiquido: string; liquidezCorrente: string; endividamentoTotal: string }) => `- ${a.ano}: Ativo R$ ${a.ativoTotal}, PL R$ ${a.patrimonioLiquido}, Liquidez ${a.liquidezCorrente}, Endividamento ${a.endividamentoTotal}%`).join("\n")}
- Tendência PL: ${data.balanco!.tendenciaPatrimonio}
${data.balanco!.observacoes ? `- Observações: ${data.balanco!.observacoes}` : ""}` : "BALANÇO: Não informado"}

${data.curvaABC ? `CONCENTRAÇÃO DE CLIENTES:
- Maior cliente: ${data.curvaABC.maiorCliente} (${data.curvaABC.maiorClientePct}%)
- Top 3: ${data.curvaABC.concentracaoTop3}% | Top 5: ${data.curvaABC.concentracaoTop5}%
- Total clientes: ${data.curvaABC.totalClientesNaBase || "N/D"}
- Alerta concentração: ${data.curvaABC.alertaConcentracao ? "SIM — cliente acima de 30%" : "NÃO"}` : "CURVA ABC: Não informada"}

${(data.irSocios?.length ?? 0) > 0 ? `IR DOS SÓCIOS:
${data.irSocios!.map((s) => `- ${s.nomeSocio} (${s.anoBase}): Renda R$ ${s.rendimentoTotal}, PL R$ ${s.patrimonioLiquido}${s.situacaoMalhas ? " — MALHAS FISCAIS" : ""}${s.debitosEmAberto ? " — DÉBITOS EM ABERTO" : ""}`).join("\n")}` : "IR DOS SÓCIOS: Não informado"}

${data.relatorioVisita?.dataVisita ? `RELATÓRIO DE VISITA (${data.relatorioVisita.dataVisita}):
- Estrutura confirmada: ${data.relatorioVisita.estruturaFisicaConfirmada ? "Sim" : "Não"}
- Operação compatível com faturamento: ${data.relatorioVisita.operacaoCompativelFaturamento ? "Sim" : "Não"}
- Recomendação do visitante: ${data.relatorioVisita.recomendacaoVisitante?.toUpperCase() || "N/D"}
${data.relatorioVisita.pontosAtencao?.length > 0 ? `- Pontos de atenção: ${data.relatorioVisita.pontosAtencao.join("; ")}` : ""}` : "RELATÓRIO DE VISITA: Não realizado"}

${(data.protestos && (parseInt(data.protestos.vigentesQtd || "0") > 0 || (data.protestos.detalhes || []).length > 0)) ? `PROTESTOS (Bureau de Crédito):
- Quantidade vigente: ${data.protestos.vigentesQtd || "0"}
- Valor vigente: R$ ${data.protestos.vigentesValor || "0,00"}
- Principais cedentes/apresentantes: ${(data.protestos.detalhes || []).slice(0, 3).map(p => `${p.apresentante || p.credor || "N/D"} — R$ ${p.valor || "0"}${p.municipio ? ` (${p.municipio}/${p.uf || ""})` : ""}`).join("; ")}` : "PROTESTOS: Não consultado ou sem ocorrências"}

${(data.processos && parseInt(data.processos.passivosTotal || "0") > 0) ? `PROCESSOS JUDICIAIS (Bureau):
- Total passivos: ${data.processos.passivosTotal}
- Recuperação judicial: ${data.processos.temRJ ? "SIM — SITUAÇÃO CRÍTICA" : "Não"}
- Processos de maior valor: ${(data.processos.top10Valor || []).slice(0, 3).map(p => `${p.tipo || "—"}: ${p.partes || "—"} vs ${p.polo_passivo || "—"} (R$ ${p.valor || "0"})`).join("; ")}` : "PROCESSOS: Não consultado ou sem passivos relevantes"}

${(data.ccf && data.ccf.qtdRegistros > 0) ? `CCF — CHEQUES SEM FUNDO (Bureau):
- Total de ocorrências: ${data.ccf.qtdRegistros}
- Bancos com registro: ${data.ccf.bancos.map(b => `${b.banco || "N/D"}: ${b.quantidade || 0} ocorr.${b.motivo ? " (" + b.motivo + ")" : ""}${b.dataUltimo ? " — último: " + b.dataUltimo : ""}`).join("; ")}
- Tendência: ${data.ccf.tendenciaLabel || "estável"}${(data.ccf.tendenciaVariacao ?? 0) !== 0 ? ` (${(data.ccf.tendenciaVariacao ?? 0) > 0 ? "+" : ""}${data.ccf.tendenciaVariacao}% vs período anterior)` : ""}` : "CCF: Não consultado ou sem ocorrências"}

PARÂMETROS DO FUNDO:
- FMM mínimo: R$ ${settings.fmm_minimo?.toLocaleString("pt-BR")}
- Idade mínima: ${settings.idade_minima_anos} anos
- Alavancagem saudável: até ${settings.alavancagem_saudavel}x
- Alavancagem máxima: até ${settings.alavancagem_maxima}x
- Concentração máxima por sacado: ${settings.concentracao_max_sacado}%
- Fator limite base: ${settings.fator_limite_base}x o FMM

INSTRUÇÃO:
Escreva a síntese executiva em 5 parágrafos, em português brasileiro formal.
Use linguagem de analista de crédito sênior. Seja direto, objetivo e técnico.
Não use bullet points — escreva em parágrafos corridos.
Cruze os dados entre si — por exemplo, compare o DRE com o faturamento, o SCR com a alavancagem, o IR dos sócios com o porte da empresa.
Quando DRE ou Balanço não estiverem disponíveis, baseie a análise nos dados disponíveis e mencione a ausência como limitação.

ESTRUTURA OBRIGATÓRIA:

Parágrafo 1 — PERFIL DA EMPRESA
Apresente a empresa: razão social, setor de atuação, tempo de operação, porte, estrutura societária e situação cadastral.

Parágrafo 2 — SAÚDE FINANCEIRA
Analise o faturamento (FMM 12M e tendência), compare com o mínimo do fundo.
Se DRE disponível: comente receita, lucro, margens e tendência.
Se Balanço disponível: comente patrimônio líquido, liquidez e endividamento.
Identifique se a empresa é financeiramente saudável para operar com o fundo.

Parágrafo 3 — PERFIL DE CRÉDITO
Analise o SCR da empresa e dos sócios.
Comente alavancagem, histórico de inadimplência, prejuízos e vencidos.
Compare o endividamento bancário com o faturamento.
Se IR dos sócios disponível, comente a coerência patrimonial.

Parágrafo 4 — RISCOS IDENTIFICADOS
Liste e analise os principais riscos: concentração de clientes (Curva ABC),
processos judiciais, protestos, SCR adverso, PL negativo, margens baixas.
Se relatório de visita disponível, inclua os pontos de atenção observados.

Parágrafo 5 — CONCLUSÃO E RECOMENDAÇÃO
Emita parecer claro: APROVADO, CONDICIONAL ou REPROVADO.
Justifique com base nos dados analisados.
Se aprovado: sugira limite de crédito (FMM × fator do fundo), prazo máximo e prazo de revisão.
Se condicional: liste as condições específicas.
Se reprovado: explique o motivo principal e sugira prazo para reanálise.
`;

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.data) {
      return NextResponse.json({ error: "Dados não informados." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0 && OPENROUTER_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhum provedor de IA configurado." }, { status: 500 });
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

    // ──── Cache servidor (Map em memória) ────
    const cacheKey = getAnalysisCacheKey(body.data);
    if (cacheKey) {
      const cached = analysisCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[analyze] Cache servidor HIT para ${cacheKey.substring(0, 30)}`);
        return NextResponse.json({ success: true, analysis: cached.analysis, fromCache: true });
      }
    }

    // ──── SSE stream — feedback em tempo real para o cliente ────
    const enc = new TextEncoder();
    const send = (ctrl: ReadableStreamDefaultController, ev: string, d: object) =>
      ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));

    // captura variáveis do escopo externo para uso dentro do stream
    const _preReq = preReq; const _alav = alav;
    const _alertas = alertasMesesZerados; const _body = body;
    const _settings = settings; const _cacheKey = cacheKey;

    const stream = new ReadableStream({
      async start(controller) {
        let analysisText = "";
        let dataStr = "";
        try {
          send(controller, "status", { message: "Preparando análise..." });

          // Payload compacto (~12kb vs ~80kb do JSON completo)
          dataStr = buildPayloadResumo(_body.data as ExtractedData);

          // ── Extras DRE / Balanço / CurvaABC ──
          const d = _body.data as Record<string, unknown>;
          const dre = d.dre as { anos?: Array<Record<string, string>>; crescimentoReceita?: string; tendenciaLucro?: string } | undefined;
          const balanco = d.balanco as { anos?: Array<Record<string, string>>; tendenciaPatrimonio?: string } | undefined;
          const curvaABC = d.curvaABC as { concentracaoTop3?: string; concentracaoTop5?: string; maiorClientePct?: string; alertaConcentracao?: boolean; totalClientesNaBase?: number } | undefined;

          let extras = "";
          if (dre?.anos && dre.anos.length > 0) {
            const a = dre.anos[dre.anos.length - 1];
            extras += `\nDRE (${a.ano ?? ""}): Receita R$ ${a.receitaBruta ?? "—"}, Lucro R$ ${a.lucroLiquido ?? "—"}, Margem ${a.margemLiquida ?? "—"}, EBITDA R$ ${a.ebitda ?? "—"}. Tendência: ${dre.tendenciaLucro ?? "—"}. Crescimento: ${dre.crescimentoReceita ?? "—"}.`;
          }
          if (balanco?.anos && balanco.anos.length > 0) {
            const a = balanco.anos[balanco.anos.length - 1];
            extras += `\nBalanço (${a.ano ?? ""}): Ativo R$ ${a.ativoTotal ?? "—"}, PL R$ ${a.patrimonioLiquido ?? "—"}, Liquidez ${a.liquidezCorrente ?? "—"}, Endividamento ${a.endividamentoTotal ?? "—"}. Tendência PL: ${balanco.tendenciaPatrimonio ?? "—"}.`;
          }
          if (curvaABC) {
            extras += `\nCurva ABC: Top3 ${curvaABC.concentracaoTop3 ?? "—"}, Top5 ${curvaABC.concentracaoTop5 ?? "—"}, Maior cliente ${curvaABC.maiorClientePct ?? "—"}. Clientes: ${curvaABC.totalClientesNaBase ?? "—"}. Alerta: ${curvaABC.alertaConcentracao ? "SIM" : "NÃO"}.`;
          }

          const calculosInjetados = `
--- CALCULOS PRE-PROCESSADOS ---
FMM: R$ ${_preReq.fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
Idade: ${_preReq.idadeAnos} anos
Alavancagem: ${_alav.label}
Dívida total SCR: R$ ${_alav.totalDivida.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${extras}
`;

          console.log(`[analyze] Payload: ${dataStr.length} chars (payload compacto) → Gemini`);
          send(controller, "status", { message: "Consultando modelo de IA..." });

          const dynamicPrompt = ANALYSIS_PROMPT
            .replace(/`FMM_MINIMO`/g, `R$ ${_settings.fmm_minimo.toLocaleString("pt-BR")}`)
            .replace(/`IDADE_MINIMA`/g, String(_settings.idade_minima_anos))
            .replace(/`ALAV_SAUDAVEL`/g, String(_settings.alavancagem_saudavel))
            .replace(/`ALAV_MAXIMA`/g, String(_settings.alavancagem_maxima));

          const sintesePrompt = PROMPT_SINTESE(_body.data as ExtractedData, _settings, _preReq);

          const [analysisSettled, sinteseSettled] = await Promise.allSettled([
            (async () => {
              try {
                return await callGemini(dynamicPrompt, calculosInjetados + "\n" + dataStr);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg === "GEMINI_EXHAUSTED" && OPENROUTER_API_KEYS.length > 0) {
                  console.log("[analyze] Gemini esgotado → OpenRouter");
                  return await callOpenRouter(dynamicPrompt, calculosInjetados + "\n" + dataStr);
                }
                throw err;
              }
            })(),
            callGemini(sintesePrompt, "").catch(err => {
              console.warn("[analyze] Síntese falhou:", err instanceof Error ? err.message : err);
              return "";
            }),
          ]);

          if (analysisSettled.status === "rejected") throw analysisSettled.reason;
          analysisText = analysisSettled.value;
          const sinteseExecutiva = sinteseSettled.status === "fulfilled" ? (sinteseSettled.value?.trim() || "") : "";

          send(controller, "status", { message: "Processando resultado..." });

          // Parse
          console.log(`[analyze] Gemini raw (first 500):`, analysisText.substring(0, 500));
          let cleaned = analysisText.trim();
          if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          if (!cleaned.startsWith("{")) { const m = cleaned.match(/\{[\s\S]*\}/); if (m) cleaned = m[0]; }
          const analysis = JSON.parse(cleaned);

          // Alertas determinísticos
          if (_alertas.length > 0) analysis.alertas = [..._alertas, ...(analysis.alertas ?? [])];

          // Defaults
          analysis.rating = analysis.rating ?? 0;
          analysis.semaforo = analysis.semaforo ?? "VERMELHO";
          analysis.decisao = analysis.decisao ?? "PENDENTE";
          analysis.alertas = (analysis.alertas ?? []).map((a: Record<string, string>) => ({ ...a, mitigacao: a.mitigacao ?? "" }));
          analysis.parametrosOperacionais = { limiteAproximado: "", prazoMaximo: "", concentracaoSacado: "", garantias: "", revisao: "", ...(analysis.parametrosOperacionais ?? {}) };

          // Normalizar parecer
          if (typeof analysis.parecer === "string") {
            analysis.parecer = { resumoExecutivo: analysis.resumoExecutivo || "", pontosFortes: analysis.pontosFortes || [], pontosNegativosOuFracos: analysis.pontosFracos || [], perguntasVisita: analysis.perguntasVisita || [], textoCompleto: analysis.parecer };
          } else {
            analysis.parecer = analysis.parecer ?? {};
            analysis.parecer.resumoExecutivo = analysis.parecer.resumoExecutivo || analysis.resumoExecutivo || "";
            analysis.parecer.pontosFortes = analysis.parecer.pontosFortes || analysis.pontosFortes || [];
            analysis.parecer.pontosNegativosOuFracos = analysis.parecer.pontosNegativosOuFracos || analysis.pontosFracos || [];
            analysis.parecer.perguntasVisita = analysis.parecer.perguntasVisita || analysis.perguntasVisita || [];
            analysis.parecer.textoCompleto = analysis.parecer.textoCompleto || "";
          }
          analysis.resumoExecutivo = analysis.parecer.resumoExecutivo;
          analysis.pontosFortes = analysis.parecer.pontosFortes;
          analysis.pontosFracos = analysis.parecer.pontosNegativosOuFracos;
          analysis.perguntasVisita = analysis.parecer.perguntasVisita;
          analysis.indicadores = analysis.indicadores ?? {};
          analysis.indicadores.alavancagem = _alav.label;
          analysis.indicadores.idadeEmpresa = `${_preReq.idadeAnos} anos`;
          analysis.indicadores.fmm = `R$ ${_preReq.fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          analysis.sinteseExecutiva = sinteseExecutiva;

          // Salvar no cache servidor
          if (_cacheKey) {
            analysisCache.set(_cacheKey, { analysis, expiresAt: Date.now() + ANALYSIS_CACHE_TTL });
            console.log(`[analyze] Cache servidor MISS → armazenado (key: ${_cacheKey.substring(0, 30)})`);
          }

          send(controller, "result", { success: true, analysis });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[analyze] Stream error: ${errMsg}`);
          if (analysisText) console.error(`[analyze] Raw AI (first 300):`, analysisText.substring(0, 300));
          console.error(`[analyze] Payload size: ${dataStr.length} chars`);
          send(controller, "error", { error: "Erro ao gerar análise — tente novamente." });
        } finally {
          controller.close();
        }
      },
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
