import { NextRequest, NextResponse } from "next/server";
import type { FundSettings, ExtractedData } from "@/types";
import { DEFAULT_FUND_SETTINGS } from "@/types";

import { createClient } from "@supabase/supabase-js";
import { generateEmbedding, buildEmbeddingText } from "@/lib/embeddings";

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

// Fase 3: modelo fine-tunado tem prioridade se configurado e ativo
const FINETUNED_MODEL = process.env.GEMINI_FINETUNED_MODEL?.trim() || null;
const GEMINI_MODELS = FINETUNED_MODEL
  ? [FINETUNED_MODEL, "gemini-2.5-flash", "gemini-2.0-flash-lite"]
  : ["gemini-2.5-flash", "gemini-2.0-flash-lite"];

function geminiUrl(model: string, key: string) {
  // tunedModels/ usam endpoint diferente de models/
  const prefix = model.startsWith("tunedModels/") ? "" : "models/";
  return `https://generativelanguage.googleapis.com/v1beta/${prefix}${model}:generateContent?key=${key}`;
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
          // gemini-2.5-flash pode retornar "thinking" parts - pegar a última text part
          const resParts = result?.candidates?.[0]?.content?.parts || [];
          const textP = [...resParts].reverse().find((p: { text?: string; thought?: boolean }) => p.text && !p.thought);
          const text = textP?.text || resParts?.[resParts.length - 1]?.text || resParts?.[0]?.text;
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
  "ratingConfianca": 80,
  "nivelAnalise": "PRELIMINAR | BASICO | PADRAO | COMPLETO",
  "impactoDocsFaltantes": "",
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
NÃO gere alertas sobre concentração de clientes/sacados (Curva ABC) — esses alertas são gerados automaticamente pelo sistema com formato próprio.

REGRA DE OURO DOS ALERTAS: cada alerta DEVE conter o valor exato e, quando possível, o percentual em relação ao FMM ou faturamento.
Exemplo BOM: "SCR com R$ 162.834 em operações vencidas — representa 4,6% do FMM mensal de R$ 3.506.158"
Exemplo RUIM: "SCR com operações vencidas" (genérico demais, não ajuda o comitê a decidir)

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

parecer.textoCompleto (5–6 parágrafos corridos, SEM markdown, SEM bullets, SEM listas — apenas texto corrido):
P1 — Perfil e contexto: quem é a empresa, setor, tempo de operação, porte, FMM. Contextualize para o comitê entender o negócio.
P2 — Capacidade financeira: SCR detalhado (cite valores exatos), alavancagem (X,Xx), composição CP/LP, tendência entre períodos. Compare com FMM.
P3 — Disciplina de pagamento: protestos (cite quantidade, valor total e % do FMM), processos judiciais (cite tipos e quantidades), CCF se houver. Seja específico com números.
P4 — Estrutura societária e governança: sócios (cite nomes), participações, IR dos sócios (cite restrições), grupo econômico se houver. Identifique riscos de concentração de gestão.
P5 — Balanço e DRE: patrimônio líquido, liquidez corrente, endividamento, margens. Compare anos se disponível. Identifique tendências.
P6 — Conclusão e recomendação: decisão fundamentada com condições específicas. O que precisa ser esclarecido antes de aprovar. Prazo de revisão sugerido.
IMPORTANTE: Cada parágrafo deve ter 3-5 frases com dados concretos. NÃO seja genérico. Cite valores em R$, percentuais e quantidades sempre que disponíveis.

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
NÃO invente dados. Se ausente: "—" e alerta DADOS_PARCIAIS quando relevante.

=== ANÁLISE COM DOCUMENTAÇÃO PARCIAL ===

Você receberá um bloco "COBERTURA DOCUMENTAL" indicando quais documentos estão disponíveis, o nível de análise e a confiança base. Siga estas regras por nível:

NÍVEL PRELIMINAR (cobertura < 45%) — apenas bureaus e CNPJ:
- Base da análise: dados de bureau (Serasa, SCR, CreditHub) + informações cadastrais
- O SCR e o score de bureau são os principais indicadores de risco
- Gere rating entre 3.0 e 7.5 (nunca acima de 7.5 sem dados financeiros próprios)
- ratingConfianca deve refletir a limitação: máximo 55%
- Seja explícito no resumoExecutivo: "Análise baseada exclusivamente em dados de bureau"
- impactoDocsFaltantes: liste os documentos que mais aumentariam a confiança

NÍVEL BÁSICO (cobertura 45–65%) — CNPJ + SCR + Faturamento:
- Base: faturamento real + histórico bancário
- FMM 12M é o principal indicador de capacidade operacional
- Alavancagem SCR vs FMM é o principal indicador de risco
- ratingConfianca: 55–72%
- Gere rating completo mas destaque limitações no textoCompleto

NÍVEL PADRÃO (cobertura 65–85%) — inclui DRE ou Balanço:
- Análise financeira estruturada possível
- Cruze DRE (se disponível) com SCR e Faturamento
- ratingConfianca: 72–88%
- Gere análise normal com nota sobre docs faltantes

NÍVEL COMPLETO (cobertura > 85%) — documentação plena:
- Análise sem restrições
- ratingConfianca: 88–100%
- Comportamento padrão

COMPENSAÇÕES quando docs financeiros estão ausentes:
- Sem DRE → use FMM 12M como proxy de receita; alavancagem SCR como proxy de endividamento
- Sem Balanço → use histórico SCR (vencidos, prejuízos) como proxy de liquidez
- Sem IR dos Sócios → use score bureau dos sócios (se disponível) como proxy patrimonial
- Sem Curva ABC → use concentração SCR como proxy de diversificação

Adicione ao JSON de resposta:
"ratingConfianca": número inteiro 0-100 (confiança do rating dado a documentação disponível),
"nivelAnalise": "PRELIMINAR" | "BASICO" | "PADRAO" | "COMPLETO",
"impactoDocsFaltantes": string descrevendo quais docs faltantes teriam maior impacto e quanto aumentariam a confiança`;

// ─────────────────────────────────────────
// Calculadora de cobertura documental
// Facilmente ajustável: altere os pesos conforme necessidade
// ─────────────────────────────────────────
const DOC_WEIGHTS: Record<string, number> = {
  cnpj:             15,  // obrigatório
  scr:              25,  // essencial
  faturamento:      20,  // essencial
  dre:              15,  // complementar
  balanco:          10,  // complementar
  irSocios:          8,  // complementar
  curvaABC:          4,  // diferencial
  relatorio_visita:  3,  // diferencial
};

// Pesos dos sinais CreditHub (bônus de cobertura — máx 18pts)
const CH_WEIGHTS = {
  protestos:         5,  // bureau de protestos consultado
  ccf:               5,  // cheque sem fundo consultado
  processos:         4,  // processos judiciais consultados
  capitalSocial:     2,  // capital social informado → proxy financeiro
  porteFuncionarios: 2,  // porte + funcionários → proxy operacional
};

type CreditHubSinal = {
  chave: string;
  label: string;
  valor: string;        // valor textual para injetar no prompt
  limpo: boolean;       // true = sinal positivo (sem ocorrências)
};

type CoberturaResult = {
  cobertura: number;           // 0–100 (apenas documentos)
  coberturaEfetiva: number;    // 0–100 (documentos + bônus CreditHub)
  nivel: "PRELIMINAR" | "BASICO" | "PADRAO" | "COMPLETO";
  docsPresentes: string[];
  docsFaltantes: string[];
  confiancaBase: number;       // 0–100
  chBonus: number;             // pontos extras do CreditHub (0–18)
  chSinais: CreditHubSinal[];  // sinais CH disponíveis para o prompt
};

function calcularCobertura(data: Record<string, unknown>): CoberturaResult {
  const docsPresentes: string[] = [];
  const docsFaltantes: string[] = [];
  let pesoTotal = 0;
  let pesoPresente = 0;

  for (const [doc, peso] of Object.entries(DOC_WEIGHTS)) {
    pesoTotal += peso;
    const val = data[doc];
    // Considera presente se tem dados extraídos e não é só erro de IA
    const temDados = val && typeof val === "object" &&
      !(val as Record<string, unknown>).aiError &&
      Object.values(val as Record<string, unknown>).some(v => v !== null && v !== "" && v !== undefined);

    if (temDados) {
      docsPresentes.push(doc);
      pesoPresente += peso;
    } else {
      docsFaltantes.push(doc);
    }
  }

  const cobertura = Math.round((pesoPresente / pesoTotal) * 100);

  // ── CreditHub: bônus de cobertura ──────────────────────────────
  let chBonus = 0;
  const chSinais: CreditHubSinal[] = [];

  // Protestos
  const protestos = data.protestos as Record<string, unknown> | null | undefined;
  const protestosConsultado = protestos &&
    (protestos.vigentesQtd !== undefined || protestos.detalhes !== undefined);
  if (protestosConsultado) {
    chBonus += CH_WEIGHTS.protestos;
    const qtd = parseInt(String(protestos?.vigentesQtd ?? "0"), 10) || 0;
    const val = String(protestos?.vigentesValor ?? "0").replace(/\D/g, "");
    const limpo = qtd === 0;
    chSinais.push({
      chave: "protestos",
      label: "Protestos",
      valor: limpo
        ? "Sem protestos vigentes"
        : `${qtd} protesto(s) vigente(s) — R$ ${parseInt(val || "0").toLocaleString("pt-BR")}`,
      limpo,
    });
  }

  // CCF
  const ccf = data.ccf as Record<string, unknown> | null | undefined;
  if (ccf) {
    chBonus += CH_WEIGHTS.ccf;
    const qtd = Number(ccf.qtdRegistros ?? 0);
    const limpo = qtd === 0;
    chSinais.push({
      chave: "ccf",
      label: "CCF (Cheque Sem Fundo)",
      valor: limpo
        ? "Sem registros de cheque sem fundo"
        : `${qtd} registro(s) de CCF`,
      limpo,
    });
  }

  // Processos
  const processos = data.processos as Record<string, unknown> | null | undefined;
  const processosConsultado = processos &&
    (processos.passivosTotal !== undefined || processos.ativosTotal !== undefined);
  if (processosConsultado) {
    chBonus += CH_WEIGHTS.processos;
    const passivos = parseInt(String(processos?.passivosTotal ?? "0"), 10) || 0;
    const temRJ = Boolean(processos?.temRJ);
    const limpo = passivos === 0 && !temRJ;
    chSinais.push({
      chave: "processos",
      label: "Processos Judiciais",
      valor: limpo
        ? "Sem processos passivos relevantes"
        : temRJ
          ? `RECUPERAÇÃO JUDICIAL — ${passivos} processo(s) passivo(s)`
          : `${passivos} processo(s) passivo(s)`,
      limpo,
    });
  }

  // Capital Social (proxy financeiro para quando DRE/Balanço não estão disponíveis)
  const cnpj = data.cnpj as Record<string, unknown> | null | undefined;
  const capitalSocial = cnpj?.capitalSocialCNPJ as string | undefined;
  if (capitalSocial && capitalSocial !== "0" && capitalSocial !== "") {
    chBonus += CH_WEIGHTS.capitalSocial;
    chSinais.push({
      chave: "capitalSocial",
      label: "Capital Social",
      valor: `R$ ${capitalSocial} (proxy de porte financeiro)`,
      limpo: true,
    });
  }

  // Porte + Funcionários (proxy operacional)
  const porte = cnpj?.porte as string | undefined;
  const funcionarios = cnpj?.funcionarios as string | undefined;
  if (porte || funcionarios) {
    chBonus += CH_WEIGHTS.porteFuncionarios;
    const partes = [
      porte ? `Porte: ${porte}` : null,
      funcionarios ? `Funcionários: ${funcionarios}` : null,
    ].filter(Boolean).join(" | ");
    chSinais.push({
      chave: "porteFuncionarios",
      label: "Porte / Funcionários",
      valor: partes,
      limpo: true,
    });
  }

  // ── Cobertura efetiva = docs + bônus CH (máx 100) ──────────────
  const coberturaEfetiva = Math.min(100, cobertura + chBonus);

  const nivel: CoberturaResult["nivel"] =
    coberturaEfetiva < 45 ? "PRELIMINAR" :
    coberturaEfetiva < 65 ? "BASICO" :
    coberturaEfetiva < 85 ? "PADRAO" : "COMPLETO";

  // Confiança base: cobertura efetiva ponderada com teto por nível
  const confiancaBase =
    nivel === "PRELIMINAR" ? Math.min(55, Math.round(coberturaEfetiva * 1.1)) :
    nivel === "BASICO"     ? Math.min(72, Math.round(40 + coberturaEfetiva * 0.5)) :
    nivel === "PADRAO"     ? Math.min(88, Math.round(55 + coberturaEfetiva * 0.4)) :
    Math.min(100, Math.round(70 + coberturaEfetiva * 0.3));

  return { cobertura, coberturaEfetiva, nivel, docsPresentes, docsFaltantes, confiancaBase, chBonus, chSinais };
}

const DOC_LABELS: Record<string, string> = {
  cnpj: "Cartão CNPJ", scr: "SCR/Bacen", faturamento: "Extrato de Faturamento",
  dre: "DRE", balanco: "Balanço Patrimonial", irSocios: "IR dos Sócios",
  curvaABC: "Curva ABC de Clientes", relatorio_visita: "Relatório de Visita",
};

function buildCoberturaBlock(cob: CoberturaResult): string {
  const presentesStr = cob.docsPresentes.map(d => DOC_LABELS[d] ?? d).join(", ") || "Nenhum";
  const faltantesStr = cob.docsFaltantes.map(d => DOC_LABELS[d] ?? d).join(", ") || "Nenhum";

  // Bloco CreditHub — só exibe se houver sinais
  let chBlock = "";
  if (cob.chSinais.length > 0) {
    const sinaisStr = cob.chSinais
      .map(s => `  • ${s.label}: ${s.valor}`)
      .join("\n");

    // Regras de compensação: quando docs financeiros faltam, o que o CH pode suprir
    const compensacoes: string[] = [];
    const temCapital = cob.chSinais.find(s => s.chave === "capitalSocial");
    const protestosLimpo = cob.chSinais.find(s => s.chave === "protestos" && s.limpo);
    const ccfLimpo = cob.chSinais.find(s => s.chave === "ccf" && s.limpo);
    const processosLimpo = cob.chSinais.find(s => s.chave === "processos" && s.limpo);
    const protestosSujo = cob.chSinais.find(s => s.chave === "protestos" && !s.limpo);
    const ccfSujo = cob.chSinais.find(s => s.chave === "ccf" && !s.limpo);
    const processosSujo = cob.chSinais.find(s => s.chave === "processos" && !s.limpo);

    const docsFaltantes = new Set(cob.docsFaltantes);
    if (temCapital && (docsFaltantes.has("dre") || docsFaltantes.has("balanco"))) {
      compensacoes.push(`Capital social disponível — use como referência de porte financeiro mínimo na ausência de DRE/Balanço`);
    }
    if (protestosLimpo && ccfLimpo) {
      compensacoes.push(`Bureau limpo (sem protestos + sem CCF) — sinal positivo de histórico de pagamentos; pode atenuar limitação documental em até 0.5 ponto no rating`);
    }
    if (processosLimpo && (docsFaltantes.has("dre") || docsFaltantes.has("faturamento"))) {
      compensacoes.push(`Sem passivos judiciais — reduz risco oculto; considere como fator positivo na análise`);
    }
    if (protestosSujo) {
      compensacoes.push(`ATENÇÃO: ${protestosSujo.valor} — penalize o rating mesmo sem documentos financeiros`);
    }
    if (ccfSujo) {
      compensacoes.push(`ATENÇÃO: ${ccfSujo.valor} — histórico de inadimplência bancária; limite rating a no máximo 6.0`);
    }
    if (processosSujo) {
      compensacoes.push(`ATENÇÃO: ${processosSujo.valor} — penalize conforme gravidade dos processos`);
    }

    const compensacoesStr = compensacoes.length > 0
      ? `\nRegras de compensação CH:\n${compensacoes.map(c => `  → ${c}`).join("\n")}`
      : "";

    chBlock = `\nDados CreditHub disponíveis (bônus +${cob.chBonus}pts na cobertura):\n${sinaisStr}${compensacoesStr}`;
  }

  return `\n\n--- COBERTURA DOCUMENTAL ---
Nível de análise: ${cob.nivel}
Cobertura documentos: ${cob.cobertura}% | Cobertura efetiva (c/ CreditHub): ${cob.coberturaEfetiva}%
Confiança base: ${cob.confiancaBase}%
Documentos disponíveis: ${presentesStr}
Documentos ausentes: ${faltantesStr}${chBlock}
--- FIM COBERTURA ---\n`;
}

// ─────────────────────────────────────────
// Few-shot: calibração do rating via histórico do comitê
// Fase 2 (vetorial) com fallback automático para Fase 1 (divergência)
// ─────────────────────────────────────────
type FewShotRow = {
  company_name: string;
  rating_ia: number;
  rating_comite: number;
  delta_rating: number;
  decisao_ia: string;
  decisao_comite: string;
  justificativa_comite: string | null;
  resumo_ia: string | null;
};

function formatFewShotBlock(rows: FewShotRow[], mode: "vetorial" | "divergencia"): string {
  if (rows.length === 0) return "";

  const header = mode === "vetorial"
    ? "CASOS SIMILARES DO COMITÊ (empresas com perfil parecido — use como referência de rating)"
    : "CALIBRAÇÃO DO COMITÊ (casos com maior divergência IA vs comitê)";

  const exemplos = rows.map((r, i) => {
    const correcao = r.delta_rating > 0
      ? `comitê elevou ${r.rating_ia} → ${r.rating_comite} (+${Number(r.delta_rating).toFixed(1)})`
      : r.delta_rating < 0
      ? `comitê reduziu ${r.rating_ia} → ${r.rating_comite} (${Number(r.delta_rating).toFixed(1)})`
      : `comitê confirmou ${r.rating_comite} (sem correção)`;

    const decisaoMudou = r.decisao_ia !== r.decisao_comite
      ? ` | Decisão: IA=${r.decisao_ia} → Comitê=${r.decisao_comite}`
      : "";

    const justificativa = r.justificativa_comite
      ? `\n   Motivo: "${r.justificativa_comite}"`
      : "";

    return `Caso ${i + 1} — ${r.company_name || "Empresa"}: ${correcao}${decisaoMudou}${justificativa}`;
  }).join("\n\n");

  return `\n\n--- ${header} ---\n${exemplos}\n--- FIM ---\n`;
}

async function getFewShotExamples(userId: string, currentSnapshot?: Record<string, unknown>): Promise<string> {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "";

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);

  try {
    // ── Fase 2: busca vetorial por similaridade ──────────────────────────────
    // Tenta gerar embedding da empresa atual e buscar casos similares
    if (currentSnapshot) {
      try {
        const text = buildEmbeddingText(currentSnapshot);
        if (text.length >= 30) {
          const vector = await generateEmbedding(text);
          const vectorStr = `[${vector.join(",")}]`;

          // Busca os 5 casos mais similares com embedding populado
          const { data: similar } = await supabase.rpc("match_rating_feedback", {
            p_user_id:       userId,
            p_embedding:     vectorStr,
            p_match_count:   5,
            p_min_similarity: 0.70,
          });

          if (similar && similar.length >= 2) {
            console.log(`[analyze] Fase 2 (vetorial): ${similar.length} casos similares encontrados`);
            return formatFewShotBlock(similar as FewShotRow[], "vetorial");
          }
        }
      } catch (embErr) {
        console.warn("[analyze] Embedding falhou, usando Fase 1:", embErr instanceof Error ? embErr.message : embErr);
      }
    }

    // ── Fase 1 fallback: casos com maior divergência ─────────────────────────
    const { data, error } = await supabase
      .from("vw_few_shot_candidates")
      .select("company_name,rating_ia,rating_comite,delta_rating,decisao_ia,decisao_comite,justificativa_comite,resumo_ia")
      .eq("user_id", userId)
      .limit(5);

    if (error || !data || data.length === 0) return "";
    console.log(`[analyze] Fase 1 (divergência): ${data.length} exemplos injetados`);
    return formatFewShotBlock(data as FewShotRow[], "divergencia");

  } catch {
    return "";
  }
}

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

  // ── CCF — eliminatório fixo ──
  const protestos = (data.protestos ?? {}) as Record<string, unknown>;
  const processos = (data.processos ?? {}) as Record<string, unknown>;
  const scr = (data.scr ?? {}) as Record<string, unknown>;

  const ccfQtd = Number(protestos.ccfQuantidade ?? 0);
  if (ccfQtd > 0) {
    motivoReprovacao.push(`CCF: ${ccfQtd} ocorrencia(s) de cheques sem fundos — criterio eliminatorio`);
  }

  // ── Recuperação Judicial / Falência — eliminatório fixo ──
  const temRJ = String(processos.temRecuperacaoJudicial ?? "").toLowerCase();
  const temRJExt = String(processos.temRecuperacaoExtrajudicial ?? "").toLowerCase();
  if (temRJ === "sim" || temRJ === "true") {
    motivoReprovacao.push("Recuperacao Judicial ativa — criterio eliminatorio");
  }
  if (temRJExt === "sim" || temRJExt === "true") {
    motivoReprovacao.push("Recuperacao Extrajudicial ativa — criterio eliminatorio");
  }

  // ── Protestos vigentes — eliminatório configurável ──
  const protestosVigentes = Number(protestos.quantidadeVigentes ?? protestos.quantidade ?? 0);
  const protestosMax = settings.protestos_max ?? DEFAULT_FUND_SETTINGS.protestos_max;
  if (protestosVigentes > protestosMax) {
    motivoReprovacao.push(`${protestosVigentes} protestos vigentes acima do limite de ${protestosMax}`);
  }

  // ── Processos passivos — eliminatório configurável ──
  const processosLista = (processos.processos as Array<Record<string, unknown>>) ?? [];
  const processosPassivos = processosLista.filter(p =>
    String(p.tipo ?? "").toLowerCase().includes("passivo") ||
    String(p.polo ?? "").toLowerCase().includes("passivo") ||
    String(p.polo ?? "").toLowerCase().includes("reu") ||
    String(p.polo ?? "").toLowerCase().includes("réu")
  ).length;
  const processosMax = settings.processos_passivos_max ?? DEFAULT_FUND_SETTINGS.processos_passivos_max;
  if (processosPassivos > processosMax) {
    motivoReprovacao.push(`${processosPassivos} processos passivos acima do limite de ${processosMax}`);
  }

  // ── SCR vencidos % — eliminatório configurável ──
  const totalDividas = parseBRL(scr.totalDividasAtivas) || parseBRL(scr.carteiraAVencer) || 0;
  const vencidosSCR = parseBRL(scr.vencidos) || 0;
  const scrMaxPct = settings.scr_vencidos_max_pct ?? DEFAULT_FUND_SETTINGS.scr_vencidos_max_pct;
  if (totalDividas > 0 && vencidosSCR > 0) {
    const pctVencidos = (vencidosSCR / totalDividas) * 100;
    if (pctVencidos > scrMaxPct) {
      motivoReprovacao.push(`SCR vencidos em ${pctVencidos.toFixed(1)}% do total (limite: ${scrMaxPct}%)`);
    }
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
    // Bloqueia apenas se CNPJ não puder ser identificado (mínimo absoluto)
    const temCNPJ = !!(body.data?.cnpj?.cnpj || body.data?.cnpj?.razaoSocial);
    if (!temCNPJ) {
      console.log(`[analyze] Bloqueado: CNPJ ausente — impossível identificar o cedente`);
      return NextResponse.json({
        error: "CNPJ do cedente não identificado. Verifique o Cartão CNPJ.",
      }, { status: 400 });
    }

    // Docs com erro de extração viram alertas DADOS_PARCIAIS (não bloqueiam mais)
    const docsWithError = Object.entries(body.data)
      .filter(([, v]) => (v as Record<string, unknown>)?.aiError === true)
      .map(([k]) => k);

    const emptyFieldRatio = countEmptyFieldRatio(body.data);
    console.log(`[analyze] Cobertura: docs_com_erro=[${docsWithError.join(", ")}], empty_ratio=${(emptyFieldRatio * 100).toFixed(1)}%`);

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

    // ──── Alertas determinísticos ────
    const fatData = (body.data?.faturamento ?? {}) as Record<string, unknown>;
    const alertasDeterministicos: Array<{ codigo: string; severidade: string; descricao: string; impacto: string; mitigacao: string }> = [];

    // Meses com faturamento zero
    if (fatData.temMesesZerados === true) {
      const qtd = Number(fatData.quantidadeMesesZerados || 0);
      const lista = ((fatData.mesesZerados as Array<{ mes: string }>) || []).map(m => m.mes).join(", ");
      alertasDeterministicos.push({
        codigo: "FAT_ZERADO",
        severidade: "MODERADA",
        descricao: `${qtd} mês(es) com faturamento zero: ${lista}`,
        impacto: "FMM pode estar subestimado — verificar sazonalidade ou interrupção operacional",
        mitigacao: "Solicitar extrato bancário ou NF-e dos meses zerados para confirmar",
      });
    }

    // Concentração de receita por cliente
    const abcData = (body.data?.curvaABC ?? {}) as Record<string, unknown>;
    if (abcData.alertaConcentracao === true && abcData.maiorCliente) {
      const periodo = (abcData.periodoReferencia as string) || "—";
      const pct = (abcData.maiorClientePct as string) || "—";
      alertasDeterministicos.push({
        codigo: "ABC_CONCENTRACAO_ALTA",
        severidade: "ALTA",
        descricao: `${abcData.maiorCliente} representa ${pct}% da receita total`,
        impacto: `Limite de concentração: 30% · Período: ${periodo}`,
        mitigacao: "Avaliar dependência operacional do cliente e estratégia de diversificação",
      });
    }

    // ──── Docs com erro de extração → alertas DADOS_PARCIAIS ────
    const docErrorLabels: Record<string, string> = {
      scr: "SCR/Bacen", faturamento: "Faturamento", contrato: "Contrato Social",
      qsa: "QSA (Quadro Societário)", dre: "DRE", balanco: "Balanço Patrimonial",
      irSocios: "IR dos Sócios", curvaABC: "Curva ABC",
    };
    for (const doc of docsWithError) {
      const label = docErrorLabels[doc] || doc;
      alertasDeterministicos.push({
        codigo: "DADOS_PARCIAIS",
        severidade: "INFO",
        descricao: `Extração com erro no documento: ${label}`,
        impacto: "Dados deste documento podem estar incompletos ou ausentes",
        mitigacao: `Verificar o arquivo original de ${label} e reprocessar se necessário`,
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
    const _alertas = alertasDeterministicos; const _body = body;
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

          // Cobertura — informa à IA o que está presente/ausente
          const _data = _body.data as ExtractedData;
          const temSCR = !!(_data.scr?.periodoReferencia);
          const temFat = !!(_data.faturamento && !_data.faturamento.faturamentoZerado && (_data.faturamento.meses?.length ?? 0) > 0);
          const temDRE = (_data.dre?.anos?.length ?? 0) > 0;
          const temBal = (_data.balanco?.anos?.length ?? 0) > 0;
          const temIR  = (_data.irSocios?.length ?? 0) > 0;
          const temABC = (_data.curvaABC?.clientes?.length ?? 0) > 0;
          const temBureau = (_data.bureausConsultados?.length ?? 0) > 0;
          const ausentes = [
            !temSCR && "SCR/Bacen",
            !temFat && "Faturamento",
            !temBureau && "Bureaus (CCF/Protestos/Processos)",
            !temDRE && "DRE",
            !temBal && "Balanço",
            !temIR  && "IR dos Sócios",
            !temABC && "Curva ABC",
          ].filter(Boolean) as string[];

          // Tabela de notas neutras para componentes ausentes
          const notasNeutras = [
            !temSCR     && "SCR (peso 25%): usar nota neutra 3,0 — ausência é sinal de alerta",
            !temFat     && "Faturamento (peso 20%): usar nota neutra 3,0 — sem dados de receita",
            !temBureau  && "CCF (peso 15%): usar nota neutra 7,0 — benefício da dúvida moderado",
            !temBureau  && "Protestos (peso 15%): usar nota neutra 5,0",
            !temBureau  && "Processos (peso 10%): usar nota neutra 5,0",
            !temDRE && !temBal && "Balanço/DRE (peso 10%): usar nota neutra 5,0",
            !temIR      && "Sócios/Governança (peso 5%): usar nota neutra 4,0",
          ].filter(Boolean).join("\n  ");

          let extras = `\nCOBERTURA DA ANÁLISE — ANÁLISE ${ausentes.length === 0 ? "COMPLETA" : "PARCIAL"}:
Documentos ausentes: ${ausentes.length === 0 ? "nenhum" : ausentes.join(", ")}
${notasNeutras ? `Notas neutras a aplicar nos componentes ausentes:\n  ${notasNeutras}` : ""}
IMPORTANTE: Para componentes ausentes, aplique EXATAMENTE as notas neutras acima e inclua alerta DADOS_PARCIAIS. Não invente dados. Não penalize além do previsto.`;
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

          const basePrompt = ANALYSIS_PROMPT
            .replace(/`FMM_MINIMO`/g, `R$ ${_settings.fmm_minimo.toLocaleString("pt-BR")}`)
            .replace(/`IDADE_MINIMA`/g, String(_settings.idade_minima_anos))
            .replace(/`ALAV_SAUDAVEL`/g, String(_settings.alavancagem_saudavel))
            .replace(/`ALAV_MAXIMA`/g, String(_settings.alavancagem_maxima));

          // Cobertura documental — informa a IA sobre o que está disponível
          const cobertura = calcularCobertura(_body.data as Record<string, unknown>);
          const coberturaBlock = buildCoberturaBlock(cobertura);
          console.log(`[analyze] Cobertura: ${cobertura.cobertura}% docs + ${cobertura.chBonus}pts CH = ${cobertura.coberturaEfetiva}% efetiva | Nível: ${cobertura.nivel} | Confiança base: ${cobertura.confiancaBase}% | CH sinais: ${cobertura.chSinais.map(s => s.chave).join(",")||"nenhum"}`);

          // Fase 1+2: injeta exemplos do comitê (vetorial se possível, divergência como fallback)
          const userId = _body.user_id as string | undefined;
          const currentSnapshot: Record<string, unknown> = {
            indicadores: { idadeEmpresa: String(_preReq.idadeAnos) + " anos", alavancagem: alav.label },
          };
          const fewShotBlock = userId ? await getFewShotExamples(userId, currentSnapshot) : "";
          const dynamicPrompt = basePrompt + coberturaBlock + (fewShotBlock || "");

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

          // Alertas determinísticos — têm prioridade sobre os da IA
          // Remove da IA qualquer alerta cujo código já existe nos determinísticos
          const codigosDeterministicos = new Set(_alertas.map((a: { codigo: string }) => a.codigo));
          const alertasIA = (analysis.alertas ?? []).filter((a: Record<string, string>) => {
            const cod = (a.codigo ?? "").toUpperCase();
            // Remove duplicatas e qualquer variante de concentração gerada livremente pela IA
            return !codigosDeterministicos.has(cod) && !cod.includes("CONCENTRACAO") && !cod.includes("ABC");
          });
          analysis.alertas = [..._alertas, ...alertasIA];

          // Cobertura determinística — sobrescreve com valores calculados (mais confiável que a IA)
          analysis.nivelAnalise    = cobertura.nivel;
          analysis.ratingConfianca = analysis.ratingConfianca
            ? Math.min(cobertura.confiancaBase + 5, Math.max(cobertura.confiancaBase - 5, Number(analysis.ratingConfianca)))
            : cobertura.confiancaBase;
          analysis.coberturaDocumental = {
            cobertura:         cobertura.cobertura,
            coberturaEfetiva:  cobertura.coberturaEfetiva,
            nivel:             cobertura.nivel,
            docsPresentes:     cobertura.docsPresentes,
            docsFaltantes:     cobertura.docsFaltantes,
            confiancaBase:     cobertura.confiancaBase,
            chBonus:           cobertura.chBonus,
            chSinais:          cobertura.chSinais.map(s => ({ label: s.label, valor: s.valor, limpo: s.limpo })),
          };

          // ── Cap de decisão por cobertura (segurança do analista) ──
          // SCR ausente: não pode aprovar sem saber o endividamento bancário
          if (!_data.scr?.periodoReferencia) {
            if (analysis.decisao === "APROVADO" || analysis.decisao === "APROVACAO_CONDICIONAL") {
              analysis.decisao = "PENDENTE";
              analysis.alertas = [...(analysis.alertas ?? []), {
                severidade: "ALTA",
                codigo: "DADOS_PARCIAIS_SCR",
                descricao: "SCR/Bacen não informado — endividamento bancário desconhecido",
                impacto: "Impossível avaliar alavancagem e capacidade de pagamento sem dados do Bacen",
                mitigacao: "Solicitar SCR atualizado (máximo 60 dias) antes de aprovar a operação",
              }];
              console.log(`[analyze] Decisão capada para PENDENTE (SCR ausente)`);
            }
          }
          // Faturamento ausente: no máximo condicional
          if (!_data.faturamento || _data.faturamento.faturamentoZerado || (_data.faturamento.meses?.length ?? 0) === 0) {
            if (analysis.decisao === "APROVADO") {
              analysis.decisao = "APROVACAO_CONDICIONAL";
              analysis.alertas = [...(analysis.alertas ?? []), {
                severidade: "ALTA",
                codigo: "DADOS_PARCIAIS_FAT",
                descricao: "Faturamento não informado ou zerado — receita não verificada",
                impacto: "FMM não calculável — parâmetros operacionais são estimativas",
                mitigacao: "Solicitar extrato bancário ou NF-e dos últimos 12 meses",
              }];
              console.log(`[analyze] Decisão capada para APROVACAO_CONDICIONAL (Faturamento ausente)`);
            }
          }

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
