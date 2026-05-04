// Cálculo único de "SCR Total" para garantir que o mesmo número aparece em
// todos os lugares (cards, alavancagem, score V2, comparativo, parecer).
//
// PROBLEMA HISTÓRICO (caso CRAVINFOODS, 2026-05-04): o campo `totalDividasAtivas`
// vinha incompleto de algumas fontes (DataBox360 só populava carteira ativa, sem
// somar prejuízos write-off). O cartão "SCR Total" em Risco Consolidado mostrava
// R$ 1,97M enquanto o comparativo somava certo (incluindo prejuízos). Resultado:
// alavancagem subestimada → decisão de crédito errada.
//
// FÓRMULA OFICIAL: Total = carteira (curto+longo OU "a vencer") + vencidos + prejuízos.
// Fallback para `totalDividasAtivas` apenas quando todos os componentes vêm vazios
// (não é seguro confiar no campo agregado da fonte).

type ScrLike = {
  carteiraAVencer?:    string;
  carteiraCurtoPrazo?: string;
  carteiraLongoPrazo?: string;
  vencidos?:           string;
  prejuizos?:          string;
  totalDividasAtivas?: string;
} | null | undefined;

// Converte string BR ("1.234.567,89", "R$ 1.234,56") para número. Tolerante.
export function parseBR(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^\d,.\-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

// Retorna número total da dívida SCR. Sempre soma componentes; fallback no
// agregado da fonte só quando nada de componente foi preenchido.
export function calcScrTotal(scr: ScrLike): number {
  if (!scr) return 0;
  const carteira =
    parseBR(scr.carteiraCurtoPrazo) +
    parseBR(scr.carteiraLongoPrazo);
  // Se não veio dividido em curto/longo, usa "a vencer" como agregado.
  const carteiraEffective =
    carteira > 0 ? carteira : parseBR(scr.carteiraAVencer);
  const venc = parseBR(scr.vencidos);
  const prej = parseBR(scr.prejuizos);
  const soma = carteiraEffective + venc + prej;
  if (soma > 0) return soma;
  // Fallback: campo agregado da fonte (último recurso).
  return parseBR(scr.totalDividasAtivas);
}

// Formata para BR ("1.234.567,89"). Devolve "—" se zero/inválido.
export function fmtScrTotalBR(scr: ScrLike, opts: { dash?: string } = {}): string {
  const dash = opts.dash ?? "—";
  const n = calcScrTotal(scr);
  if (n <= 0) return dash;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Calcula alavancagem (SCR Total / FMM). Retorna 0 se FMM inválido.
export function calcAlavancagem(scr: ScrLike, fmm: number | string | null | undefined): number {
  const total = calcScrTotal(scr);
  const fmmN = typeof fmm === "number" ? fmm : parseBR(fmm);
  if (!fmmN || fmmN <= 0 || total <= 0) return 0;
  return total / fmmN;
}
