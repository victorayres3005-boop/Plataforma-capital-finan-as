import { NextRequest, NextResponse } from "next/server";
import type { FundSettings, ExtractedData } from "@/types";
import { DEFAULT_FUND_SETTINGS } from "@/types";
import type { ScoreResult, RespostaCriterio, ConfiguracaoPolitica } from "@/types/politica-credito";
import { mergeComDefaults, DEFAULT_POLITICA_V2 } from "@/lib/politica-credito/defaults";

import { createClient } from "@supabase/supabase-js";
import { generateEmbedding, buildEmbeddingText } from "@/lib/embeddings";
import { ANALYSIS_PROMPT } from "@/lib/analyze/prompts";

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

// ─── Payload enriquecido: antes cortava em 8 socios, 10 modalidades etc,
// agora manda ate 20 socios, 25 modalidades, 10 processos, e inclui os campos
// que estavam dropados (nomeFantasia, cnaeSecundarios, carteira CP/LP, etc).
// Objetivo: IA ve ~80% dos dados em vez de 15-20%, rating automatico mais fiel.
function buildPayloadResumo(data: ExtractedData): string {
  return JSON.stringify({
    cnpj: {
      razaoSocial: data.cnpj.razaoSocial,
      nomeFantasia: data.cnpj.nomeFantasia,
      cnpj: data.cnpj.cnpj,
      dataAbertura: data.cnpj.dataAbertura,
      situacaoCadastral: data.cnpj.situacaoCadastral,
      dataSituacaoCadastral: data.cnpj.dataSituacaoCadastral,
      motivoSituacao: data.cnpj.motivoSituacao,
      porte: data.cnpj.porte,
      cnaePrincipal: data.cnpj.cnaePrincipal,
      cnaeSecundarios: data.cnpj.cnaeSecundarios,
      naturezaJuridica: data.cnpj.naturezaJuridica,
      capitalSocialCNPJ: data.cnpj.capitalSocialCNPJ,
      endereco: data.cnpj.endereco,
      tipoEmpresa: data.cnpj.tipoEmpresa,
      funcionarios: data.cnpj.funcionarios,
      regimeTributario: data.cnpj.regimeTributario,
    },
    qsa: {
      capitalSocial: data.qsa.capitalSocial,
      quadroSocietario: data.qsa.quadroSocietario.slice(0, 20).map(s => ({
        nome: s.nome, cpfCnpj: s.cpfCnpj,
        participacao: s.participacao, qualificacao: s.qualificacao,
      })),
    },
    faturamento: {
      fmm12m: data.faturamento.fmm12m, fmmMedio: data.faturamento.fmmMedio,
      fmmAnual: data.faturamento.fmmAnual,
      tendencia: data.faturamento.tendencia,
      somatoriaAno: data.faturamento.somatoriaAno, ultimoMesComDados: data.faturamento.ultimoMesComDados,
      mesesZerados: data.faturamento.mesesZerados?.slice(0, 12),
      meses: data.faturamento.meses.slice(-24).map(m => ({ mes: m.mes, valor: m.valor })),
    },
    scr: {
      totalDividasAtivas: data.scr.totalDividasAtivas, vencidos: data.scr.vencidos,
      prejuizos: data.scr.prejuizos, carteiraAVencer: data.scr.carteiraAVencer,
      carteiraCurtoPrazo: data.scr.carteiraCurtoPrazo,
      carteiraLongoPrazo: data.scr.carteiraLongoPrazo,
      limiteCredito: data.scr.limiteCredito, qtdeInstituicoes: data.scr.qtdeInstituicoes,
      qtdeOperacoes: data.scr.qtdeOperacoes,
      operacoesAVencer: data.scr.operacoesAVencer,
      operacoesEmAtraso: data.scr.operacoesEmAtraso,
      operacoesVencidas: data.scr.operacoesVencidas,
      classificacaoRisco: data.scr.classificacaoRisco,
      historicoInadimplencia: data.scr.historicoInadimplencia,
      tempoAtraso: data.scr.tempoAtraso,
      coobrigacoes: data.scr.coobrigacoes,
      faixasAVencer: data.scr.faixasAVencer,
      faixasVencidos: data.scr.faixasVencidos,
      modalidades: data.scr.modalidades?.slice(0, 25),
      instituicoes: data.scr.instituicoes?.slice(0, 15),
      periodoReferencia: data.scr.periodoReferencia,
    },
    scrAnterior: data.scrAnterior ? {
      totalDividasAtivas: data.scrAnterior.totalDividasAtivas, vencidos: data.scrAnterior.vencidos,
      prejuizos: data.scrAnterior.prejuizos, limiteCredito: data.scrAnterior.limiteCredito,
      carteiraCurtoPrazo: data.scrAnterior.carteiraCurtoPrazo,
      carteiraLongoPrazo: data.scrAnterior.carteiraLongoPrazo,
      periodoReferencia: data.scrAnterior.periodoReferencia,
    } : null,
    protestos: {
      vigentesQtd: data.protestos.vigentesQtd, vigentesValor: data.protestos.vigentesValor,
      regularizadosQtd: data.protestos.regularizadosQtd,
      regularizadosValor: data.protestos.regularizadosValor,
      // Top 5 protestos: analyst enxerga se sao pequenos vs grandes, credor, data
      detalhes: data.protestos.detalhes.slice(0, 10).map(d => ({
        data: d.data, credor: d.credor, valor: d.valor,
        numero: d.numero, apresentante: d.apresentante,
        municipio: d.municipio, uf: d.uf, regularizado: d.regularizado,
      })),
    },
    processos: {
      passivosTotal: data.processos.passivosTotal, ativosTotal: data.processos.ativosTotal,
      valorTotalEstimado: data.processos.valorTotalEstimado, temRJ: data.processos.temRJ,
      distribuicao: data.processos.distribuicao,
      bancarios: data.processos.bancarios?.slice(0, 10),
      fiscais: data.processos.fiscais?.slice(0, 5),
      top10Valor: data.processos.top10Valor?.slice(0, 10).map(p => ({
        tipo: p.tipo, partes: p.partes, polo_passivo: p.polo_passivo, valor: p.valor, status: p.status,
      })),
    },
    ccf: data.ccf ? {
      qtdRegistros: data.ccf.qtdRegistros, bancos: data.ccf.bancos.slice(0, 10),
      tendenciaLabel: data.ccf.tendenciaLabel, tendenciaVariacao: data.ccf.tendenciaVariacao,
    } : null,
    curvaABC: data.curvaABC || null,
    dre: data.dre ? {
      anos: data.dre.anos?.slice(-3),
      tendenciaLucro: data.dre.tendenciaLucro, crescimentoReceita: data.dre.crescimentoReceita,
      observacoes: data.dre.observacoes,
    } : null,
    balanco: data.balanco ? {
      anos: data.balanco.anos?.slice(-3),
      tendenciaPatrimonio: data.balanco.tendenciaPatrimonio,
      observacoes: data.balanco.observacoes,
    } : null,
    irSocios: data.irSocios?.slice(0, 5).map(s => ({
      nomeSocio: s.nomeSocio, anoBase: s.anoBase, rendimentoTotal: s.rendimentoTotal,
      patrimonioLiquido: s.patrimonioLiquido, situacaoMalhas: s.situacaoMalhas, debitosEmAberto: s.debitosEmAberto,
    })),
    contrato: data.contrato ? {
      capitalSocial: data.contrato.capitalSocial,
      dataConstituicao: data.contrato.dataConstituicao,
      objetoSocial: (data.contrato.objetoSocial || "").substring(0, 500),
      administracao: data.contrato.administracao,
      socios: data.contrato.socios?.slice(0, 10),
      temAlteracoes: data.contrato.temAlteracoes,
    } : null,
    relatorioVisita: data.relatorioVisita || null,
    scrSocios: data.scrSocios?.slice(0, 5),
  });
}

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);

// Fase 3: modelo fine-tunado tem prioridade se configurado e ativo
const FINETUNED_MODEL = process.env.GEMINI_FINETUNED_MODEL?.trim() || null;
const GEMINI_MODELS = FINETUNED_MODEL
  ? [FINETUNED_MODEL, "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"]
  : ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"];

function geminiUrl(model: string, key: string) {
  // tunedModels/ usam endpoint diferente de models/
  const prefix = model.startsWith("tunedModels/") ? "" : "models/";
  return `https://generativelanguage.googleapis.com/v1beta/${prefix}${model}:generateContent?key=${key}`;
}

const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS: string[] = [];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────
// Chamada Gemini
// ─────────────────────────────────────────
interface GeminiResult { text: string; inputTokens: number; outputTokens: number; model: string; }

async function callGemini(prompt: string, data: string): Promise<GeminiResult> {
  // Caching implicito do Gemini 2.5: prompt estatico (ANALYSIS_PROMPT + few-shots)
  // como part isolada antes do bloco dinamico de dados. Habilita desconto
  // automatico em input tokens quando o mesmo prompt e reutilizado.
  const parts = [
    { text: prompt },
    { text: "\n\n--- DADOS EXTRAÍDOS ---\n\n" + data },
  ];

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      let rateLimitRetries = 0;
      const MAX_RATE_RETRIES = 1;

      for (let attempt = 0; attempt < 1 + MAX_RATE_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 40000); // 40s — acomoda thinking budget
          let response: Response;
          try {
            response = await fetch(geminiUrl(model, apiKey), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  // temperature: 0 para analise DETERMINISTICA — mesmo input = mesmo rating
                  // sempre. Bug do usuario: "rating muda toda hora ao retomar analise"
                  // era causado por 0.3 + re-analise automatica no mount do GenerateStep.
                  temperature: 0,
                  maxOutputTokens: 16384,
                  responseMimeType: "application/json",
                  ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
                },
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
          if (text) {
            const usage = result?.usageMetadata ?? {};
            return {
              text,
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: usage.candidatesTokenCount ?? 0,
              model,
            };
          }
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
// Calculadora de cobertura documental
// Facilmente ajustável: altere os pesos conforme necessidade
// ─────────────────────────────────────────
const DOC_WEIGHTS: Record<string, number> = {
  cnpj:             15,  // obrigatório
  scr:              25,  // essencial
  faturamento:      20,  // essencial
  dre:              12,  // complementar
  balanco:           8,  // complementar
  irSocios:          6,  // complementar
  curvaABC:         10,  // essencial FIDC — qualidade da carteira de sacados
  relatorio_visita:  4,  // diferencial
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
  const dataAbertura = String(cnpj?.dataAbertura ?? "")
  let idadeAnos = 0

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataAbertura)) {
    // formato DD/MM/YYYY
    const [d, m, a] = dataAbertura.split("/").map(Number)
    idadeAnos = (Date.now() - new Date(a, m - 1, d).getTime())
                / (1000 * 60 * 60 * 24 * 365.25)
  } else if (/^\d{2}\/\d{4}$/.test(dataAbertura)) {
    // formato MM/YYYY — usar dia 1 do mês
    const [m, a] = dataAbertura.split("/").map(Number)
    idadeAnos = (Date.now() - new Date(a, m - 1, 1).getTime())
                / (1000 * 60 * 60 * 24 * 365.25)
  } else if (/^\d{4}$/.test(dataAbertura)) {
    // formato YYYY — usar 1º de janeiro
    const a = parseInt(dataAbertura)
    idadeAnos = (Date.now() - new Date(a, 0, 1).getTime())
                / (1000 * 60 * 60 * 24 * 365.25)
  }

  const motivoReprovacao: string[] = [];
  if (fmm > 0 && fmm < settings.fmm_minimo) {
    motivoReprovacao.push(`FMM de R$ ${fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} abaixo do minimo de R$ ${settings.fmm_minimo.toLocaleString("pt-BR")}/mes`);
  }
  if (idadeAnos === 0) {
    motivoReprovacao.push(
      "Data de abertura ausente ou formato inválido — " +
      "não foi possível verificar critério de idade mínima"
    )
  } else if (idadeAnos < settings.idade_minima_anos) {
    motivoReprovacao.push(`Empresa com ${idadeAnos.toFixed(1)} anos abaixo do minimo de ${settings.idade_minima_anos} anos`);
  }

  // ── Sanções CEIS/CNEP — eliminatório fixo ──
  const sancoes = (data as unknown as Record<string, unknown>).sancoes as Record<string, unknown> | undefined;
  if (sancoes?.consultado) {
    const sancoesCNPJ = (sancoes.sancoesCNPJ as unknown[]) ?? [];
    const sancoesSocios = (sancoes.sancoesSocios as unknown[]) ?? [];
    const ativas = [...sancoesCNPJ, ...sancoesSocios].filter((s: unknown) => (s as Record<string, unknown>).ativa);
    if (ativas.length > 0) {
      motivoReprovacao.push(`${ativas.length} sancao(oes) ativa(s) em CEIS/CNEP (Portal da Transparencia) — criterio eliminatorio`);
    }
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
  const temRJ =
    String(processos.temRecuperacaoJudicial ?? processos.temRJ ?? "")
    .toLowerCase()
  const rjNaDistribuicao = Array.isArray(processos.distribuicao) &&
    processos.distribuicao.some((d: { tipo?: string }) =>
      String(d.tipo ?? "").toUpperCase().includes("RECUPERA") &&
      String(d.tipo ?? "").toUpperCase().includes("JUDICIAL")
    )
  if (temRJ === "sim" || temRJ === "true" || rjNaDistribuicao) {
    motivoReprovacao.push("Recuperação Judicial ativa — critério eliminatório")
  }
  const temRJExt = String(processos.temRecuperacaoExtrajudicial ?? "").toLowerCase();
  if (temRJExt === "sim" || temRJExt === "true") {
    motivoReprovacao.push("Recuperacao Extrajudicial ativa — criterio eliminatorio");
  }

  // ── Razão social — fallback RJ ──
  const razaoSocial = String(cnpj?.razaoSocial ?? "").toUpperCase()
  if (
    razaoSocial.includes("RECUPERACAO JUDICIAL") ||
    razaoSocial.includes("RECUPERAÇÃO JUDICIAL") ||
    razaoSocial.includes("EM RECUPERACAO") ||
    razaoSocial.includes("EM RECUPERAÇÃO")
  ) {
    motivoReprovacao.push(
      "Razão social indica Recuperação Judicial ativa — critério eliminatório"
    )
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
  // Vencidos sem carteira ativa — dado inconsistente, reprova por segurança
  if (vencidosSCR > 0 && totalDividas === 0) {
    motivoReprovacao.push(`SCR vencidos declarados sem carteira ativa registrada — dado inconsistente, criterio eliminatorio por seguranca`);
  }

  // ── SCR prejuízos — eliminatório absoluto ──
  const prejuizosSCR = parseBRL(scr.prejuizos) || 0;
  if (prejuizosSCR > 0) {
    const prejFmt = prejuizosSCR.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    motivoReprovacao.push(`SCR prejuizos registrados: R$ ${prejFmt} — criterio eliminatorio`);
  }

  // ── Alavancagem > máxima — eliminatório da Política V2 ──
  const alavMax = settings.alavancagem_maxima ?? DEFAULT_FUND_SETTINGS.alavancagem_maxima;
  const totalDividasAlav = parseBRL(scr.totalDividasAtivas) || parseBRL(scr.carteiraAVencer) || 0;
  if (fmm > 0 && totalDividasAlav > 0) {
    const alavCalc = totalDividasAlav / fmm;
    if (alavCalc > alavMax) {
      motivoReprovacao.push(`Alavancagem ${alavCalc.toFixed(2)}x acima do limite maximo V2 de ${alavMax}x — criterio eliminatorio`);
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

const pct = (v: string | number | null | undefined): string => {
  if (!v && v !== 0) return "0";
  return String(v).replace(/%/g, "").trim();
};

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

${(data.curvaABC?.maiorCliente || (data.curvaABC?.clientes?.length ?? 0) > 0 || data.curvaABC?.concentracaoTop5) ? `CONCENTRAÇÃO DE CLIENTES:
- Maior cliente: ${data.curvaABC!.maiorCliente || "N/D"} (${pct(data.curvaABC!.maiorClientePct)}%)
- Top 3: ${pct(data.curvaABC!.concentracaoTop3)}% | Top 5: ${pct(data.curvaABC!.concentracaoTop5)}%
- Total clientes: ${data.curvaABC!.totalClientesNaBase || "N/D"}
- Alerta concentração: ${data.curvaABC!.alertaConcentracao ? "SIM — cliente acima de 30%" : "NÃO"}${(data.curvaABC!.clientes?.length ?? 0) > 0 ? `
- Carteira (top ${Math.min(10, data.curvaABC!.clientes.length)}):
${data.curvaABC!.clientes.slice(0, 10).map(c => `  • ${c.nome}: ${pct(c.percentualReceita)}% (R$ ${c.valorFaturado}) — Classe ${c.classe || "N/D"}`).join("\n")}` : ""}` : "CONCENTRAÇÃO DE CLIENTES: Não informada — curva ABC ausente ou não preenchida"}

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

${(() => {
  const san = (data as unknown as Record<string, unknown>).sancoes as Record<string, unknown> | undefined;
  if (!san?.consultado) return "SANÇÕES CADASTRAIS (Portal da Transparência): Não consultado";
  const cnpjLimpo = san.cnpjLimpo as boolean;
  const sociosLimpos = san.sociosLimpos as boolean;
  if (cnpjLimpo && sociosLimpos) return "SANÇÕES CADASTRAIS (Portal da Transparência): Empresa e sócios sem registros em CEIS/CNEP";
  const linhas: string[] = ["SANÇÕES CADASTRAIS — ATENÇÃO: RESTRIÇÕES ENCONTRADAS:"];
  if (!cnpjLimpo) {
    const itens = (san.sancoesCNPJ as Record<string, unknown>[]) ?? [];
    linhas.push(`- CNPJ sancionado: ${itens.length} ocorrência(s) em CEIS/CNEP`);
    itens.slice(0, 3).forEach(s => linhas.push(`  · ${s.tipoSancao || "Sanção"} por ${s.orgaoSancionador} — ${s.dataInicioSancao}${s.dataFinalSancao ? ` até ${s.dataFinalSancao}` : " (sem data fim — vigente)"}`));
  }
  if (!sociosLimpos) {
    const itens = (san.sancoesSocios as Record<string, unknown>[]) ?? [];
    linhas.push(`- Sócios com restrições: ${itens.length} ocorrência(s) pessoais em CEIS`);
    itens.slice(0, 3).forEach(s => linhas.push(`  · ${s.nomeSancionado}: ${s.tipoSancao || "Sanção"} por ${s.orgaoSancionador} (${s.dataInicioSancao})`));
  }
  return linhas.join("\n");
})()}

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
// Score V2 — bloco de contexto para o Gemini
// ─────────────────────────────────────────
const PILAR_LABELS: Record<string, string> = {
  perfil_empresa:    "Perfil da Empresa (peso 15%)",
  saude_financeira:  "Saúde Financeira (peso 15%)",
  risco_compliance:  "Risco e Compliance (peso 25%)",
  socios_governanca: "Sócios e Governança (peso 10%)",
  estrutura_operacao:"Estrutura da Operação (peso 35%)",
};

const CRITERIO_LABELS: Record<string, string> = {
  segmento: "Segmento de Atuação", localizacao: "Localização",
  capacidade_operacional: "Capacidade Operacional (Porte x Faturamento)",
  estrutura_fisica: "Estrutura Física", patrimonio_empresa: "Patrimônio da Empresa",
  qualidade_faturamento: "Faturamento (qualidade e consistência)",
  analise_financeira: "Análise Financeira (DRE / Balanço)",
  alavancagem: "Alavancagem (SCR / FMM)",
  situacao_juridica: "Situação Jurídica (RJ, falência, execuções)",
  protestos: "Protestos Vigentes", scr_endividamento: "SCR — Endividamento e Vencidos",
  pefin_refin: "Negativações (Pefin / Refin / SPC)",
  processos_judiciais: "Processos Judiciais (polo passivo)",
  endividamento_socios: "Endividamento dos Sócios",
  tempo_empresa: "Tempo dos Sócios na Empresa",
  patrimonio_socios: "Patrimônio Declarado dos Sócios",
  risco_sucessao: "Risco de Sucessão / Dependência Operacional",
  confirmacao_lastro: "Confirmação de Lastro",
  perfil_sacados: "Perfil e Qualidade dos Sacados",
  tipo_operacao: "Tipo de Operação (performado / a performar)",
  garantias: "Garantias Adicionais",
  quantidade_fundos: "Relacionamento com Outros Fundos",
};

function buildScoreV2Block(score: ScoreResult, respostas?: RespostaCriterio[]): string {
  const ratingDescricao: Record<string, string> = {
    A: "Excelente (90–100 pts) — aprovação plena recomendada",
    B: "Bom (80–89 pts) — aprovação normal",
    C: "Moderado (70–79 pts) — aprovação condicional",
    D: "Fraco (60–69 pts) — pendente de esclarecimentos",
    E: "Ruim (50–59 pts) — reprovação recomendada",
    F: "Crítico (0–49 pts) — reprovação imediata",
  };

  const pilaresOrdem = ["estrutura_operacao","risco_compliance","perfil_empresa","saude_financeira","socios_governanca"];
  const pilares = pilaresOrdem
    .filter(id => score.pontuacao_ponderada[id] !== undefined || score.pontos_brutos[id] !== undefined)
    .map(id => {
      const contrib = score.pontuacao_ponderada[id] ?? 0;
      const brutos = score.pontos_brutos[id] ?? 0;
      const label = PILAR_LABELS[id] ?? id;
      const pendente = score.pilares_pendentes.includes(id);
      if (pendente) return `  • ${label}: PENDENTE — não preenchido pelo analista`;

      // Critérios respondidos neste pilar
      const criteriosDopilar = (respostas ?? []).filter(r => r.pilar_id === id);
      const criteriosStr = criteriosDopilar.length > 0
        ? "\n" + criteriosDopilar.map(r => {
            const nomeC = CRITERIO_LABELS[r.criterio_id] ?? r.criterio_id;
            const modStr = r.modificador_label ? ` × ${r.modificador_multiplicador} (${r.modificador_label})` : "";
            return `      - ${nomeC}: "${r.opcao_label}" → ${r.pontos_base} pts${modStr} = ${r.pontos_final.toFixed(1)} pts`;
          }).join("\n")
        : "";
      return `  • ${label}: ${brutos.toFixed(1)} pts brutos → ${contrib.toFixed(1)} pts ponderados${criteriosStr}`;
    })
    .join("\n");

  const confiancaDesc = score.confianca_score === "alta"
    ? "alta (todos os pilares preenchidos)"
    : score.confianca_score === "parcial"
    ? "parcial (alguns pilares pendentes)"
    : "baixa (maioria dos pilares pendentes)";

  return `\n\n--- SCORE V2 DA POLÍTICA DE CRÉDITO (preenchido pelo analista) ---
Score final: ${score.score_final.toFixed(1)} / 100
Rating V2: ${score.rating} — ${ratingDescricao[score.rating] || ""}
Confiança do score: ${confiancaDesc}
Pilares pendentes: ${score.pilares_pendentes.length === 0 ? "nenhum" : score.pilares_pendentes.map(p => PILAR_LABELS[p] ?? p).join(", ")}

Detalhamento por pilar (com critérios respondidos pelo analista):
${pilares}

INSTRUÇÕES PARA USO DO SCORE V2:
1. O Score V2 (escala 0–100, rating A–F) É O RATING OFICIAL DA OPERAÇÃO. Retorne "rating": {{SCORE_V2_SCALED}} no JSON — não invente nem recalcule um score próprio.
2. A decisão (APROVADO / APROVACAO_CONDICIONAL / PENDENTE / REPROVADO) deve seguir obrigatoriamente as faixas do Rating V2, exceto quando um critério eliminatório absoluto force REPROVADO ou PENDENTE.
3. Os 5 pilares da política são: Estrutura da Operação (35%), Risco e Compliance (25%), Perfil da Empresa (15%), Saúde Financeira (15%), Sócios e Governança (10%). Seu parecer deve comentar cada pilar com dados concretos.
4. Se houver discrepância relevante entre o Score V2 e os dados brutos (ex: analista deu nota alta mas dados mostram vencidos no SCR), mencione no textoCompleto e aplique o critério eliminatório cabível.
5. Pilares marcados como PENDENTE não foram avaliados — não presuma a nota; trate como ausência de informação para aquela dimensão e registre no textoCompleto.
--- FIM SCORE V2 ---\n`;
}

// ─────────────────────────────────────────
// Carrega a Política de Crédito do banco
// ─────────────────────────────────────────
async function loadPoliticaServidor(userId: string): Promise<ConfiguracaoPolitica> {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.warn("[analyze] loadPoliticaServidor: env Supabase ausente — usando DEFAULT_POLITICA_V2");
    return DEFAULT_POLITICA_V2;
  }
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);
    const { data, error } = await sb
      .from("politica_credito_config")
      .select("*")
      .eq("user_id", userId)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(`[analyze] loadPoliticaServidor: erro Supabase: ${error.message} — usando DEFAULT_POLITICA_V2`);
      return DEFAULT_POLITICA_V2;
    }
    if (!data) {
      console.log(`[analyze] loadPoliticaServidor: nenhuma política para user ${userId} — usando DEFAULT_POLITICA_V2`);
      return DEFAULT_POLITICA_V2;
    }
    console.log(`[analyze] loadPoliticaServidor: política carregada para user ${userId}`);
    return mergeComDefaults(data as Record<string, unknown>);
  } catch (err) {
    console.error("[analyze] loadPoliticaServidor: exceção:", err instanceof Error ? err.message : err);
    return DEFAULT_POLITICA_V2;
  }
}

// ─────────────────────────────────────────
// Serializa a Política completa para o prompt
// ─────────────────────────────────────────
function buildPoliticaBlock(politica: ConfiguracaoPolitica): string {
  const pe = politica.parametros_elegibilidade;
  const pesoMap: Record<string, number> = {
    perfil_empresa:    politica.pesos_pilares.perfil_empresa,
    saude_financeira:  politica.pesos_pilares.saude_financeira,
    risco_compliance:  politica.pesos_pilares.risco_compliance,
    socios_governanca: politica.pesos_pilares.socios_governanca,
    estrutura_operacao:politica.pesos_pilares.estrutura_operacao,
  };

  const pilaresStr = politica.pilares.map(pilar => {
    const peso = pesoMap[pilar.id] ?? 0;
    const criteriosStr = pilar.criterios.map(c => {
      const opcoesStr = c.opcoes.map(o => `      → ${o.label}: ${o.pontos} pts${o.descricao ? ` (${o.descricao})` : ""}`).join("\n");
      const modStr = c.modificadores?.length
        ? "\n    Modificadores: " + c.modificadores.map(m => `${m.label} ×${m.multiplicador}`).join(", ")
        : "";
      return `  [${c.id}] ${c.nome} (máx ${c.pontos_maximos} pts)${c.obrigatorio ? " — obrigatório" : ""}${modStr}\n${opcoesStr}`;
    }).join("\n");
    return `PILAR: ${pilar.nome} | Peso: ${peso}% | Máx: ${pilar.pontos_totais} pts\n${criteriosStr}`;
  }).join("\n\n");

  const faixasStr = politica.faixas_rating
    .map(f => `  ${f.rating} (${f.score_minimo}–${f.score_maximo} pts): ${f.interpretacao} — ${f.leitura_risco}`)
    .join("\n");

  return `\n\n--- POLÍTICA DE CRÉDITO (PARÂMETROS COMPLETOS) ---

PESOS DOS PILARES:
  Estrutura da Operação: ${pesoMap.estrutura_operacao}%
  Risco e Compliance: ${pesoMap.risco_compliance}%
  Perfil da Empresa: ${pesoMap.perfil_empresa}%
  Saúde Financeira: ${pesoMap.saude_financeira}%
  Sócios e Governança: ${pesoMap.socios_governanca}%

CRITÉRIOS E PONTUAÇÃO POR PILAR:
${pilaresStr}

FAIXAS DE RATING:
${faixasStr}

PARÂMETROS DE ELEGIBILIDADE (LIMITES DO FUNDO):
  FMM mínimo: R$ ${pe.fmm_minimo?.toLocaleString("pt-BR") ?? "—"}
  Constituição mínima: ${pe.tempo_constituicao_minimo_anos ?? "—"} anos
  Alavancagem saudável: até ${pe.alavancagem_saudavel ?? "—"}x FMM
  Alavancagem máxima: até ${pe.alavancagem_maxima ?? "—"}x FMM (eliminatório acima disto)
  SCR vencidos máx: ${pe.scr_vencidos_max_pct ?? "—"}%
  Protestos máx: ${pe.protestos_max ?? "—"}
  Processos passivos máx: ${pe.processos_passivos_max ?? "—"}
  Concentração máx por sacado: ${pe.concentracao_max_sacado ?? "—"}%
  Aceita RJ homologada: ${pe.aceita_recuperacao_judicial_homologada ? "sim" : "não"}
  Aceita débitos outros fundos: ${pe.aceita_com_debitos_outros_fundos ? "sim" : "não"}
  Prazo máximo aprovado: ${pe.prazo_maximo_aprovado ?? "—"} dias
  Prazo máximo condicional: ${pe.prazo_maximo_condicional ?? "—"} dias
  Fator limite base: ${pe.fator_limite_base ?? "—"}x FMM

Estes parâmetros são os únicos critérios de avaliação desta operação.
--- FIM POLÍTICA DE CRÉDITO ---\n`;
}

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

    // ──── Política de Crédito — fonte única de verdade ────
    const userId = body.user_id as string | undefined;
    const politica = userId ? await loadPoliticaServidor(userId) : DEFAULT_POLITICA_V2;
    const pe = politica.parametros_elegibilidade;

    // ──── Settings derivados da política (não de body.settings) ────
    const settings: FundSettings = {
      ...DEFAULT_FUND_SETTINGS,
      ...(body.settings || {}),
      fmm_minimo:             pe.fmm_minimo               ?? DEFAULT_FUND_SETTINGS.fmm_minimo,
      idade_minima_anos:      pe.tempo_constituicao_minimo_anos ?? DEFAULT_FUND_SETTINGS.idade_minima_anos,
      alavancagem_saudavel:   pe.alavancagem_saudavel      ?? DEFAULT_FUND_SETTINGS.alavancagem_saudavel,
      alavancagem_maxima:     pe.alavancagem_maxima        ?? DEFAULT_FUND_SETTINGS.alavancagem_maxima,
      protestos_max:          pe.protestos_max             ?? DEFAULT_FUND_SETTINGS.protestos_max,
      processos_passivos_max: pe.processos_passivos_max    ?? DEFAULT_FUND_SETTINGS.processos_passivos_max,
      scr_vencidos_max_pct:   pe.scr_vencidos_max_pct      ?? DEFAULT_FUND_SETTINGS.scr_vencidos_max_pct,
      concentracao_max_sacado:pe.concentracao_max_sacado   ?? DEFAULT_FUND_SETTINGS.concentracao_max_sacado,
      fator_limite_base:      pe.fator_limite_base         ?? DEFAULT_FUND_SETTINGS.fator_limite_base,
      prazo_maximo_aprovado:  pe.prazo_maximo_aprovado     ?? DEFAULT_FUND_SETTINGS.prazo_maximo_aprovado,
      prazo_maximo_condicional:pe.prazo_maximo_condicional ?? DEFAULT_FUND_SETTINGS.prazo_maximo_condicional,
      revisao_aprovado_dias:  pe.revisao_aprovado_dias     ?? DEFAULT_FUND_SETTINGS.revisao_aprovado_dias,
      revisao_condicional_dias:pe.revisao_condicional_dias ?? DEFAULT_FUND_SETTINGS.revisao_condicional_dias,
    };

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

    // ──── Cross-validation determinística (Fase C) ────
    // Gera alertas quando documentos divergentes sugerem erro ou inconsistência.
    // Entra no contexto do prompt pra IA ponderar no rating final.
    try {
      const { crossValidate } = await import("@/lib/crossValidate");
      const crossAlerts = crossValidate(body.data);
      for (const a of crossAlerts) {
        alertasDeterministicos.push(a);
      }
      if (crossAlerts.length > 0) {
        console.log(`[analyze] cross-validate: ${crossAlerts.length} alerta(s) determinístico(s) adicionados`);
      }
    } catch (err) {
      console.warn("[analyze] crossValidate falhou:", err instanceof Error ? err.message : err);
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
    const _politica = politica;

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

          // Impacto de docs ausentes nos pilares V2
          const pilaresSemDados = [
            !temSCR     && "Pilar Saúde Financeira (critério Alavancagem) e Risco e Compliance (critério SCR): SCR ausente — marcar como pendente",
            !temFat     && "Pilar Saúde Financeira (critério Faturamento): dados de receita ausentes — marcar como pendente",
            !temBureau  && "Pilar Risco e Compliance (critérios Protestos, Processos, Negativações): bureaus não consultados — benefício da dúvida, sem penalizar além do previsto",
            !temDRE && !temBal && "Pilar Saúde Financeira (critério Análise Financeira): DRE e Balanço ausentes — usar FMM como proxy",
            !temIR      && "Pilar Sócios e Governança (critério Patrimônio dos Sócios): IR ausente — sem dados patrimoniais",
          ].filter(Boolean).join("\n  ");

          let extras = `\nCOBERTURA DA ANÁLISE — ANÁLISE ${ausentes.length === 0 ? "COMPLETA" : "PARCIAL"}:
Documentos ausentes: ${ausentes.length === 0 ? "nenhum" : ausentes.join(", ")}
${pilaresSemDados ? `Impacto nos pilares V2 por docs ausentes:\n  ${pilaresSemDados}` : ""}
IMPORTANTE: Para documentos ausentes, gere alerta DADOS_PARCIAIS. Não invente dados. Não penalize além do indicado acima.`;
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

          // ── Indicadores determinísticos — sobrescreve o que o Gemini inventaria ──
          const comprometimentoFat = _preReq.fmm > 0 && _alav.totalDivida > 0
            ? ((_alav.totalDivida / _preReq.fmm) * 100).toFixed(1)
            : null;
          const lastBalanco = balanco?.anos?.length ? balanco.anos[balanco.anos.length - 1] : null;
          const lastDre     = dre?.anos?.length     ? dre.anos[dre.anos.length - 1]         : null;
          const endividamentoCalc    = lastBalanco?.endividamentoTotal || null;
          const liquidezCorrenteCalc = lastBalanco?.liquidezCorrente   || null;
          const margemLiquidaCalc    = lastDre?.margemLiquida          || null;

          const calculosInjetados = `
--- CALCULOS PRE-PROCESSADOS ---
FMM: R$ ${_preReq.fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
Idade: ${_preReq.idadeAnos} anos
Alavancagem: ${_alav.label}
Dívida total SCR: R$ ${_alav.totalDivida.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${comprometimentoFat ? `\nComprometimento do faturamento: ${comprometimentoFat}% (dívida SCR / FMM)` : ""}${endividamentoCalc ? `\nEndividamento (balanço): ${endividamentoCalc}%` : ""}${liquidezCorrenteCalc ? `\nLiquidez corrente: ${liquidezCorrenteCalc}` : ""}${margemLiquidaCalc ? `\nMargem líquida: ${margemLiquidaCalc}%` : ""}${extras}
`;

          console.log(`[analyze] Payload: ${dataStr.length} chars (payload compacto) → Gemini`);
          send(controller, "status", { message: "Consultando modelo de IA..." });

          const basePrompt = ANALYSIS_PROMPT
            .replace(/`FMM_MINIMO`/g, `R$ ${_settings.fmm_minimo.toLocaleString("pt-BR")}`)
            .replace(/`IDADE_MINIMA`/g, String(_settings.idade_minima_anos))
            .replace(/`ALAV_SAUDAVEL`/g, String(_settings.alavancagem_saudavel))
            .replace(/`ALAV_MAXIMA`/g, String(_settings.alavancagem_maxima))
            .replace(/\{\{TAXA_RATING_A\}\}/g, String(_settings.taxa_base_rating_a ?? 1.5))
            .replace(/\{\{TAXA_RATING_B\}\}/g, String(_settings.taxa_base_rating_b ?? 2.0))
            .replace(/\{\{TAXA_RATING_C\}\}/g, String(_settings.taxa_base_rating_c ?? 2.5))
            .replace(/\{\{TAXA_RATING_D\}\}/g, String(_settings.taxa_base_rating_d ?? 3.5))
            .replace(/\{\{TAXA_RATING_E\}\}/g, String(_settings.taxa_base_rating_e ?? 5.0))
            .replace(/\{\{CONC_MAX_SACADO\}\}/g, String(_settings.concentracao_max_sacado));

          // Cobertura documental — informa a IA sobre o que está disponível
          const cobertura = calcularCobertura(_body.data as Record<string, unknown>);
          const coberturaBlock = buildCoberturaBlock(cobertura);
          console.log(`[analyze] Cobertura: ${cobertura.cobertura}% docs + ${cobertura.chBonus}pts CH = ${cobertura.coberturaEfetiva}% efetiva | Nível: ${cobertura.nivel} | Confiança base: ${cobertura.confiancaBase}% | CH sinais: ${cobertura.chSinais.map(s => s.chave).join(",")||"nenhum"}`);

          // Fase 1+2: injeta exemplos do comitê (vetorial se possível, divergência como fallback)
          const _userId = _body.user_id as string | undefined;
          const currentSnapshot: Record<string, unknown> = {
            indicadores: { idadeEmpresa: String(_preReq.idadeAnos) + " anos", alavancagem: alav.label },
          };
          const fewShotBlock = _userId ? await getFewShotExamples(_userId, currentSnapshot) : "";

          // ── Score V2 — sempre presente (auto-score se analista não preencheu) ──
          let scoreV2 = _body.scoreV2 as ScoreResult | undefined;
          let scoreV2Respostas = _body.scoreV2Respostas as RespostaCriterio[] | undefined;
          if (scoreV2) {
            console.log(`[analyze] Score V2 recebido do frontend: ${scoreV2.score_final?.toFixed(1)} pts → Rating ${scoreV2.rating}`);
          } else {
            try {
              const { autoPreencherScore } = await import("@/lib/politica-credito/auto-score");
              const resultado = autoPreencherScore(_body.data as ExtractedData, _politica, []);
              scoreV2 = resultado.score;
              scoreV2Respostas = resultado.respostas;
              console.log(`[analyze] Score V2 auto-calculado: ${scoreV2.score_final.toFixed(1)} pts → Rating ${scoreV2.rating}`);
            } catch (err) {
              console.error("[analyze] auto-score FALHOU — Gemini receberá rating='—' e prompt rígido:", err instanceof Error ? err.stack : err);
            }
          }
          if (!scoreV2) {
            console.warn("[analyze] ATENÇÃO: scoreV2 indisponível — Score V2 ausente do prompt, Gemini sem âncora de rating");
          }

          const scoreV2Block = scoreV2 ? buildScoreV2Block(scoreV2, scoreV2Respostas) : "";
          const scoreV2Scaled = scoreV2?.score_final != null
            ? (scoreV2.score_final / 10).toFixed(1)
            : "—";

          // ── Política de Crédito completa — injetada no prompt ──
          const politicaBlock = buildPoliticaBlock(_politica);

          const dynamicPrompt = (basePrompt + politicaBlock + coberturaBlock + (fewShotBlock || "") + scoreV2Block)
            .replace(/\{\{SCORE_V2_SCALED\}\}/g, scoreV2Scaled);

          const sintesePrompt = PROMPT_SINTESE(_body.data as ExtractedData, _settings, _preReq);

          const [analysisSettled, sinteseSettled] = await Promise.allSettled([
            (async () => {
              try {
                return await callGemini(dynamicPrompt, calculosInjetados + "\n" + dataStr);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg === "GEMINI_EXHAUSTED" && OPENROUTER_API_KEYS.length > 0) {
                  console.log("[analyze] Gemini esgotado → OpenRouter");
                  const t = await callOpenRouter(dynamicPrompt, calculosInjetados + "\n" + dataStr);
                  return { text: t, inputTokens: 0, outputTokens: 0, model: "openrouter" } as GeminiResult;
                }
                throw err;
              }
            })(),
            callGemini(sintesePrompt, "").catch(err => {
              console.warn("[analyze] Síntese falhou:", err instanceof Error ? err.message : err);
              return { text: "", inputTokens: 0, outputTokens: 0, model: "" } as GeminiResult;
            }),
          ]);

          if (analysisSettled.status === "rejected") throw analysisSettled.reason;
          const analysisResult = analysisSettled.value as GeminiResult;
          analysisText = analysisResult.text;
          const sinteseExecutiva = sinteseSettled.status === "fulfilled"
            ? ((sinteseSettled.value as GeminiResult)?.text?.trim() || "")
            : "";

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
          analysis.indicadores.alavancagem  = _alav.label;
          analysis.indicadores.idadeEmpresa = `${_preReq.idadeAnos} anos`;
          analysis.indicadores.fmm          = `R$ ${_preReq.fmm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          // Sobrescrever com valores determinísticos — Gemini não inventa esses campos
          if (comprometimentoFat)    analysis.indicadores.comprometimentoFaturamento = `${comprometimentoFat}%`;
          if (endividamentoCalc)     analysis.indicadores.endividamento    = `${endividamentoCalc}%`;
          if (liquidezCorrenteCalc)  analysis.indicadores.liquidezCorrente = liquidezCorrenteCalc;
          if (margemLiquidaCalc)     analysis.indicadores.margemLiquida    = `${margemLiquidaCalc}%`;
          analysis.sinteseExecutiva = sinteseExecutiva;

          // Salvar no cache servidor
          if (_cacheKey) {
            analysisCache.set(_cacheKey, { analysis, expiresAt: Date.now() + ANALYSIS_CACHE_TTL });
            console.log(`[analyze] Cache servidor MISS → armazenado (key: ${_cacheKey.substring(0, 30)})`);
          }

          send(controller, "result", { success: true, analysis });

          // Fire-and-forget: registra uso de tokens para rastreio de custo
          try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            if (supabaseUrl && supabaseKey && analysisResult.inputTokens > 0) {
              const sb = createClient(supabaseUrl, supabaseKey);
              const cnpjData = (_body.data as Record<string, unknown>)?.cnpj as Record<string, string> | undefined;
              await sb.from("api_usage_logs").insert({
                collection_id: (_body as Record<string, unknown>).collection_id ?? null,
                cnpj: cnpjData?.cnpj ?? null,
                company_name: cnpjData?.razaoSocial ?? null,
                log_type: "gemini_analyze",
                model: analysisResult.model,
                input_tokens: analysisResult.inputTokens,
                output_tokens: analysisResult.outputTokens,
              });
            }
          } catch { /* não bloqueia o resultado */ }
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
