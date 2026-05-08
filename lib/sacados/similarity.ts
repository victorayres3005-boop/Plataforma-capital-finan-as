// Similaridade entre nomes de empresa para o resolver CNPJ por razão social.
//
// Levenshtein normalizado (1 - distance/maxLen) — funciona melhor para nomes
// curtos com pequenos erros (abreviações, plural, "&" vs "E"). Não usa
// pesos por token porque razão social tem ordem importante: "Alpha Beta LTDA"
// e "Beta Alpha LTDA" são empresas diferentes mesmo que compartilhem palavras.

const STOPWORDS = new Set([
  "LTDA", "ME", "EPP", "EIRELI", "SA", "S.A", "S/A",
  "COMERCIO", "INDUSTRIA", "SERVICOS", "TRANSPORTES",
  "DE", "DA", "DO", "E", "&",
]);

/**
 * Normaliza nome para comparação:
 * - Uppercase + remove diacríticos
 * - Remove pontuação
 * - Tira stopwords corporativas (LTDA, ME, etc) e conjunções
 * - Compacta espaços
 */
export function normalizeCompanyName(s: string): string {
  if (!s) return "";
  const upper = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  return upper
    .replace(/[^A-Z0-9\s&]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/** Distância de Levenshtein clássica. O(n*m). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Similaridade normalizada entre dois nomes de empresa, no intervalo [0, 1].
 * 1 = idênticos após normalização. 0 = totalmente diferentes.
 *
 * Aplica `normalizeCompanyName` antes — então "Empresa Alpha LTDA" e
 * "EMPRESA ALPHA" devolvem 1.0.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}
