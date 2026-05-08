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

// Regex robusta de CNPJ — aceita formatado e cru:
//   12.345.678/0001-99 · 12345678000199 · 12345678/000199 · 12.345.678/0001/99
const CNPJ_RE = /(\d{2}\.?\d{3}\.?\d{3}[\/.-]?\d{4}[-.]?\d{2})/;

/**
 * Extrai um CNPJ embutido em texto livre. Comum quando o extrator concatena
 * razão social + CNPJ no mesmo campo (ex.: "EMPRESA LTDA - 12.345.678/0001-99").
 * Retorna o CNPJ canônico (só dígitos, 14 chars) ou "" se não achar.
 */
export function extractCnpjFromText(text: string | undefined | null): string {
  if (!text) return "";
  const m = String(text).match(CNPJ_RE);
  if (!m) return "";
  const cnpj = onlyDigits(m[1]);
  return isLikelyCnpj(cnpj) ? cnpj : "";
}

/**
 * Limpa razão social removendo o CNPJ embutido + separadores residuais.
 * "EMPRESA LTDA - 12.345.678/0001-99" → "EMPRESA LTDA"
 */
export function stripCnpjFromName(name: string): string {
  if (!name) return "";
  return String(name)
    .replace(CNPJ_RE, "")
    .replace(/[\s\-–—,;:|]+$/, "") // separadores residuais no fim
    .replace(/\s+/g, " ")
    .trim();
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

    // Estratégia em 3 níveis:
    //   1. cnpjCpf populado e válido — caminho feliz
    //   2. cnpjCpf vazio/CPF/lixo, mas tem CNPJ embutido no nome (caso real reportado em prod 2026-05-08)
    //   3. nada — descarta
    let cnpj = onlyDigits(c.cnpjCpf);
    let cleanedName = (c.nome || "").trim();
    let usedFallback = false;

    if (!isLikelyCnpj(cnpj)) {
      const cnpjFromName = extractCnpjFromText(c.nome);
      if (cnpjFromName) {
        cnpj = cnpjFromName;
        cleanedName = stripCnpjFromName(c.nome);
        usedFallback = true;
      } else {
        continue;
      }
    }

    if (seen.has(cnpj)) continue;
    if (!cleanedName) continue;
    seen.add(cnpj);
    out.push(makeEntry(c, cnpj, cleanedName));
    if (usedFallback) {
      console.log(`[extractTopSacados] CNPJ recuperado do nome: ${cnpj} (${cleanedName})`);
    }
  }

  return out;
}

function makeEntry(c: ClienteCurvaABC, cnpj: string, nameOverride?: string): TopSacadoEntry {
  return {
    cnpj,
    razaoSocial: (nameOverride ?? c.nome).trim(),
    posicao: c.posicao,
    valorFaturado: c.valorFaturado,
    participacaoFaturamentoPct: c.percentualReceita,
    classe: c.classe,
    valorNumerico: toNumber(c.valorFaturado),
  };
}
