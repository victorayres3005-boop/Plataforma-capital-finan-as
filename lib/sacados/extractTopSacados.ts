// Top sacados PJ da Curva ABC para consulta de bureaus.
//
// Filtra clientes da Curva ABC mantendo só CNPJs válidos (descarta CPFs e lixo
// como "—", "n/d"), ordena por valor faturado desc e devolve os top N.
//
// O parser da Curva ABC entrega `cnpjCpf` como string única — pode ser CPF, CNPJ
// ou texto qualquer. Aqui isolamos sacados PJ por contagem de dígitos (14).

import type { ClienteCurvaABC, CurvaABCData } from "@/types";

const DEFAULT_LIMIT = 5;

export interface TopSacadoEntry {
  cnpj: string;          // só dígitos, 14 chars
  razaoSocial: string;
  posicao: number;       // posição na Curva ABC
  valorFaturado: string;
  participacaoFaturamentoPct: string;
  classe: string;
  valorNumerico: number; // usado para ordenação
}

/** Remove pontuação e espaços de um documento. */
export function onlyDigits(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).replace(/\D+/g, "");
}

/** True se a string parece um CNPJ válido (14 dígitos, não-zero). */
export function isLikelyCnpj(doc: string | undefined | null): boolean {
  const d = onlyDigits(doc);
  if (d.length !== 14) return false;
  // CNPJs zerados ou repetidos uniformemente são lixo
  if (/^(\d)\1{13}$/.test(d)) return false;
  return true;
}

/**
 * Converte string monetária BR para número.
 * "R$ 1.234.567,89" -> 1234567.89
 * "12,3%"           -> 12.3
 * Aceita Number direto.
 */
function toNumber(v: string | number | undefined | null): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const cleaned = String(v)
    .replace(/[R$\s%]/gi, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "") // remove pontos de milhar (assume 3 dígitos depois)
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pega top N sacados PJ da Curva ABC, ordenados por valor faturado desc.
 *
 * Filtros aplicados:
 *   - cnpjCpf precisa ser CNPJ válido (14 dígitos, não repetido)
 *   - nome precisa ser não-vazio
 *   - dedup por CNPJ (mantém a primeira ocorrência — geralmente a de maior valor)
 *
 * Empates de valor mantêm ordem estável (preserva `posicao` original).
 */
export function extractTopSacados(
  curva: CurvaABCData | undefined | null,
  limit: number = DEFAULT_LIMIT
): TopSacadoEntry[] {
  if (!curva?.clientes?.length) return [];

  const seen = new Set<string>();
  const out: TopSacadoEntry[] = [];

  // Indexa com posição original para ordenação estável quando valor empata
  const indexed = curva.clientes.map((c, idx) => ({ c, idx }));

  // Ordena por valor desc, mantendo idx como tiebreaker
  indexed.sort((a, b) => {
    const va = toNumber(a.c.valorFaturado);
    const vb = toNumber(b.c.valorFaturado);
    if (vb !== va) return vb - va;
    return a.idx - b.idx;
  });

  for (const { c } of indexed) {
    if (out.length >= limit) break;
    const cnpj = onlyDigits(c.cnpjCpf);
    if (!isLikelyCnpj(cnpj)) continue;
    if (seen.has(cnpj)) continue;
    const nome = (c.nome || "").trim();
    if (!nome) continue;
    seen.add(cnpj);
    out.push(makeEntry(c, cnpj));
  }

  return out;
}

function makeEntry(c: ClienteCurvaABC, cnpj: string): TopSacadoEntry {
  return {
    cnpj,
    razaoSocial: c.nome.trim(),
    posicao: c.posicao,
    valorFaturado: c.valorFaturado,
    participacaoFaturamentoPct: c.percentualReceita,
    classe: c.classe,
    valorNumerico: toNumber(c.valorFaturado),
  };
}
