// Cálculo determinístico dos 15 indicadores financeiros consolidados a partir
// de Balanço + DRE. Função pura, sem IA, sem chamada externa — fórmulas fixas.
//
// Decisão de design: retornar `null` (e não NaN/Infinity) quando o cálculo
// não é possível (denominador zero, campo ausente). O renderer e o gerador
// de análise textual interpretam null como "não disponível" e ocultam.
//
// Fallbacks:
//   - despesaFinanceira ausente → Math.abs(resultadoFinanceiro) quando negativo
//   - resultadoOperacional ausente → ebitda - depreciacaoAmortizacao
//   - realizavelLongoPrazo ausente → confia no liquidezGeral que o Gemini
//     já entrega calculado no próprio BalancoAno
//
// Adicionado em 2026-05-10 como parte do plano "Indicadores DRE" (Fase 2).

import type { BalancoAno, BalancoData, DREAno, DREData } from "@/types";
import { parseMoneyToNumber } from "@/lib/generators/pdf/helpers";

const DAYS_IN_YEAR = 360; // convenção contábil-financeira (não 365)

export interface IndicadoresAno {
  ano: string;
  /** Liquidez Corrente: AC ÷ PC. Bom ≥ 1,2. */
  liquidezCorrente: number | null;
  /** Liquidez Seca: (AC − Estoques) ÷ PC. Mais conservador que corrente. */
  liquidezSeca: number | null;
  /** Liquidez Geral: (AC + RLP) ÷ (PC + PNC). Visão de longo prazo. */
  liquidezGeral: number | null;
  /** Capital de Giro Líquido em R$ (valor absoluto, AC − PC). */
  capitalGiroLiquido: number | null;
  /** Receita média mensal: receita líquida ÷ 12 (R$). */
  receitaMediaLiquida: number | null;
  /** ROI = Lucro Líquido ÷ Ativo Total × 100 (%). */
  roi: number | null;
  /** Prazo Médio de Recebimento (dias). */
  pmr: number | null;
  /** Prazo Médio de Estoques (dias). */
  pme: number | null;
  /** Prazo Médio de Pagamento (dias). */
  pmp: number | null;
  /** Ciclo de Caixa = PMR + PME − PMP (dias). Negativo é eficiente. */
  cicloCaixa: number | null;
  /** Endividamento Total = (PC + PNC) ÷ Ativo Total. */
  endividamentoTotal: number | null;
  /** Dívida ÷ PL = PNC ÷ PL. */
  dividaPL: number | null;
  /** Participação de Terceiros = (PC + PNC) ÷ PL (em vezes/múltiplo). */
  participacaoTerceiros: number | null;
  /** Despesa Financeira em R$ (valor absoluto). */
  despesaFinanceira: number | null;
  /** Despesa Financeira ÷ Resultado Operacional × 100 (%). */
  despFinSobreResultadoOp: number | null;
}

export interface IndicadoresFinanceiros {
  /** Anos ordenados do mais antigo pro mais recente. */
  anos: IndicadoresAno[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Converte string monetária BR para number; retorna 0 quando vazio/inválido. */
function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  return parseMoneyToNumber(v);
}

/** Divisão segura: retorna null se denominador zero. */
function safeDiv(numerator: number, denominator: number): number | null {
  if (!denominator || !isFinite(denominator)) return null;
  const r = numerator / denominator;
  return isFinite(r) ? r : null;
}

/** Arredonda pra `decimals` casas. Preserva null. */
function round(v: number | null, decimals: number = 2): number | null {
  if (v == null || !isFinite(v)) return null;
  const m = Math.pow(10, decimals);
  return Math.round(v * m) / m;
}

// ─── Fallback resolvers ─────────────────────────────────────────────────────

/**
 * Despesa Financeira BRUTA (positiva). Prefere o campo dedicado;
 * fallback é abs(resultadoFinanceiro) quando este é negativo (despesa > receita).
 */
function resolverDespesaFinanceira(d: DREAno): number | null {
  if (d.despesaFinanceira) return num(d.despesaFinanceira);
  const rf = num(d.resultadoFinanceiro);
  return rf < 0 ? Math.abs(rf) : null;
}

/**
 * Resultado Operacional (EBIT). Prefere o campo dedicado;
 * fallback é EBITDA − Depreciação/Amortização. Como último recurso, EBITDA cru.
 */
function resolverResultadoOperacional(d: DREAno): number | null {
  if (d.resultadoOperacional) return num(d.resultadoOperacional);
  const ebitda = num(d.ebitda);
  const dep = num(d.depreciacaoAmortizacao);
  if (ebitda) return ebitda - dep;
  return null;
}

// ─── Cálculo ────────────────────────────────────────────────────────────────

/**
 * Calcula os 15 indicadores para UM par balanço/DRE de mesmo ano.
 * Retorna null nos campos que não podem ser calculados (sem dado, denom. zero).
 */
export function calcularIndicadoresAno(
  balanco: BalancoAno | undefined,
  dre: DREAno | undefined,
  ano: string,
): IndicadoresAno {
  const result: IndicadoresAno = {
    ano,
    liquidezCorrente: null,
    liquidezSeca: null,
    liquidezGeral: null,
    capitalGiroLiquido: null,
    receitaMediaLiquida: null,
    roi: null,
    pmr: null,
    pme: null,
    pmp: null,
    cicloCaixa: null,
    endividamentoTotal: null,
    dividaPL: null,
    participacaoTerceiros: null,
    despesaFinanceira: null,
    despFinSobreResultadoOp: null,
  };

  // ── Indicadores que dependem só do Balanço ────────────────────────────────
  if (balanco) {
    const ac = num(balanco.ativoCirculante);
    const pc = num(balanco.passivoCirculante);
    const pnc = num(balanco.passivoNaoCirculante);
    const pl = num(balanco.patrimonioLiquido);
    const at = num(balanco.ativoTotal);
    const estoques = num(balanco.estoques);
    const rlp = balanco.realizavelLongoPrazo ? num(balanco.realizavelLongoPrazo) : null;

    result.liquidezCorrente = round(safeDiv(ac, pc));
    result.liquidezSeca = round(safeDiv(ac - estoques, pc));

    // Liquidez Geral: prefere cálculo exato com RLP; fallback no que Gemini
    // já entrega (campo string `liquidezGeral` no BalancoAno).
    if (rlp != null) {
      result.liquidezGeral = round(safeDiv(ac + rlp, pc + pnc));
    } else if (balanco.liquidezGeral) {
      const fromGemini = num(balanco.liquidezGeral);
      result.liquidezGeral = isFinite(fromGemini) && fromGemini > 0 ? round(fromGemini) : null;
    }

    result.capitalGiroLiquido = isFinite(ac - pc) ? ac - pc : null;
    result.endividamentoTotal = round(safeDiv(pc + pnc, at));
    result.dividaPL = round(safeDiv(pnc, pl));
    result.participacaoTerceiros = round(safeDiv(pc + pnc, pl));
  }

  // ── Indicadores que dependem só do DRE ────────────────────────────────────
  if (dre) {
    const recLiq = num(dre.receitaLiquida);
    if (recLiq) result.receitaMediaLiquida = round(recLiq / 12);

    const despFin = resolverDespesaFinanceira(dre);
    result.despesaFinanceira = despFin != null ? round(despFin) : null;

    const resOp = resolverResultadoOperacional(dre);
    if (despFin != null && resOp != null && resOp !== 0) {
      result.despFinSobreResultadoOp = round((despFin / resOp) * 100);
    }
  }

  // ── Indicadores que dependem dos DOIS ────────────────────────────────────
  if (balanco && dre) {
    const lucroLiq = num(dre.lucroLiquido);
    const at = num(balanco.ativoTotal);
    if (at) result.roi = round((lucroLiq / at) * 100);

    const recBruta = num(dre.receitaBruta) || num(dre.receitaLiquida);
    const cmv = Math.abs(num(dre.custoProdutosServicos));
    const cr = num(balanco.contasAReceber);
    const est = num(balanco.estoques);
    const forn = num(balanco.fornecedores);

    if (recBruta) result.pmr = round((cr / recBruta) * DAYS_IN_YEAR, 0);
    if (cmv) result.pme = round((est / cmv) * DAYS_IN_YEAR, 0);
    if (cmv) result.pmp = round((forn / cmv) * DAYS_IN_YEAR, 0);

    if (result.pmr != null && result.pme != null && result.pmp != null) {
      result.cicloCaixa = result.pmr + result.pme - result.pmp;
    }
  }

  return result;
}

/**
 * Orquestrador: calcula indicadores pra cada ano disponível, casando balanço
 * com DRE pelo campo `ano`. Anos com balanço ou DRE faltando recebem `null`
 * nos indicadores correspondentes (em vez de serem omitidos).
 */
export function calcularIndicadores(
  balanco: BalancoData | undefined | null,
  dre: DREData | undefined | null,
): IndicadoresFinanceiros {
  const balancoAnos = balanco?.anos ?? [];
  const dreAnos = dre?.anos ?? [];

  // União dos anos presentes em qualquer dos dois, ordenada cronologicamente
  const todosAnos = Array.from(
    new Set<string>([
      ...balancoAnos.map((b) => b.ano),
      ...dreAnos.map((d) => d.ano),
    ].filter(Boolean)),
  ).sort();

  const anos = todosAnos.map((ano) => {
    const b = balancoAnos.find((x) => x.ano === ano);
    const d = dreAnos.find((x) => x.ano === ano);
    return calcularIndicadoresAno(b, d, ano);
  });

  return { anos };
}

// ─── Apresentação: classificação por threshold + formatação ─────────────────

export type IndicadorChave =
  | "liquidezCorrente" | "liquidezSeca" | "liquidezGeral"
  | "capitalGiroLiquido" | "receitaMediaLiquida"
  | "roi" | "pmr" | "pme" | "pmp" | "cicloCaixa"
  | "endividamentoTotal" | "dividaPL" | "participacaoTerceiros"
  | "despesaFinanceira" | "despFinSobreResultadoOp";

export type Severidade = "g" | "a" | "r" | "";

/**
 * Classifica um valor de indicador como verde/amarelo/vermelho com base em
 * thresholds conservadores de literatura financeira. Retorna "" pra
 * indicadores informativos (sem julgamento de bom/ruim) ou pra valor null.
 *
 * Decisão de produto (2026-05-10): só usado pra cor da célula. Não dispara
 * alerta nem ponto fraco automaticamente — analista interpreta.
 */
export function classificarIndicador(chave: IndicadorChave, v: number | null): Severidade {
  if (v == null) return "";
  switch (chave) {
    case "liquidezCorrente":
      return v >= 1.2 ? "g" : v >= 0.8 ? "a" : "r";
    case "liquidezSeca":
      return v >= 1.0 ? "g" : v >= 0.5 ? "a" : "r";
    case "liquidezGeral":
      return v >= 1.0 ? "g" : v >= 0.6 ? "a" : "r";
    case "capitalGiroLiquido":
      return v > 0 ? "g" : v === 0 ? "a" : "r";
    case "roi":
      return v >= 10 ? "g" : v >= 0 ? "a" : "r";
    case "pmr":
      return v <= 30 ? "g" : v <= 60 ? "a" : "r";
    case "pme":
      return v <= 30 ? "g" : v <= 60 ? "a" : "r";
    case "pmp":
      // Prazo maior é melhor (financiar com fornecedor)
      return v >= 30 ? "g" : v >= 15 ? "a" : "r";
    case "cicloCaixa":
      // Negativo (recebe antes de pagar) é excelente; ≤30 bom; >90 ruim
      return v <= 30 ? "g" : v <= 90 ? "a" : "r";
    case "endividamentoTotal":
      return v <= 0.6 ? "g" : v <= 0.8 ? "a" : "r";
    case "dividaPL":
      return v <= 0.5 ? "g" : v <= 1.0 ? "a" : "r";
    case "participacaoTerceiros":
      return v <= 1.0 ? "g" : v <= 2.0 ? "a" : "r";
    case "despFinSobreResultadoOp":
      return v <= 30 ? "g" : v <= 80 ? "a" : "r";
    // Sem julgamento — informativos puros
    case "receitaMediaLiquida":
    case "despesaFinanceira":
      return "";
  }
}

/**
 * Formata um valor de indicador pro display na tabela. Cuida de unidade
 * (% / dias / R$ abreviado / vezes) e do null (mostra "—").
 */
export function formatarIndicador(chave: IndicadorChave, v: number | null): string {
  if (v == null) return "—";
  switch (chave) {
    case "liquidezCorrente":
    case "liquidezSeca":
    case "liquidezGeral":
    case "dividaPL":
    case "participacaoTerceiros":
    case "endividamentoTotal":
      return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "roi":
    case "despFinSobreResultadoOp":
      return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
    case "pmr":
    case "pme":
    case "pmp":
    case "cicloCaixa":
      return Math.round(v).toLocaleString("pt-BR") + "d";
    case "capitalGiroLiquido":
    case "receitaMediaLiquida":
    case "despesaFinanceira":
      return formatMoneyAbr(v);
  }
}

function formatMoneyAbr(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (a >= 1_000) return `${s}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return `${s}R$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/**
 * Tendência entre dois anos consecutivos pra mesma chave. "↑" / "↓" / "~".
 * "↑" significa: o número subiu. Não diz se "subir é bom" — depende do
 * indicador. Renderer só mostra a seta sem cor.
 */
export function tendencia(prev: number | null, curr: number | null): "↑" | "↓" | "~" | "" {
  if (prev == null || curr == null) return "";
  const delta = curr - prev;
  if (Math.abs(delta) / (Math.abs(prev) || 1) < 0.02) return "~"; // <2% = estável
  return delta > 0 ? "↑" : "↓";
}

/** Lista ordenada de indicadores pra renderização da tabela. */
export const INDICADORES_TABELA: Array<{ chave: IndicadorChave; nome: string }> = [
  { chave: "liquidezCorrente",          nome: "Liquidez corrente" },
  { chave: "liquidezSeca",              nome: "Liquidez seca" },
  { chave: "liquidezGeral",             nome: "Liquidez geral" },
  { chave: "capitalGiroLiquido",        nome: "Capital de giro líq." },
  { chave: "receitaMediaLiquida",       nome: "Receita média líquida" },
  { chave: "roi",                       nome: "ROI" },
  { chave: "pmr",                       nome: "PMR" },
  { chave: "pme",                       nome: "PME" },
  { chave: "pmp",                       nome: "PMP" },
  { chave: "cicloCaixa",                nome: "Ciclo de Caixa" },
  { chave: "endividamentoTotal",        nome: "Endividamento Total" },
  { chave: "dividaPL",                  nome: "Dívida ÷ PL" },
  { chave: "participacaoTerceiros",     nome: "Participação de Terceiros" },
  { chave: "despesaFinanceira",         nome: "Despesa financeira" },
  { chave: "despFinSobreResultadoOp",   nome: "Despfin ÷ Resultado Op." },
];
