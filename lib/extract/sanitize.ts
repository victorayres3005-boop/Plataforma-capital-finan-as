/**
 * Sanitização pós-extração da IA.
 * Remove boilerplate, normaliza formatos e protege contra alucinações.
 */

// ─── Boilerplate conhecidos da Receita Federal / órgãos públicos ────────────
const BOILERPLATE_PATTERNS: RegExp[] = [
  // Texto padrão de débitos RF
  /constavam débitos em aberto no âmbito da secretaria/i,
  /procuradoria-geral da fazenda nacional/i,
  /secretaria especial da receita federal do brasil/i,
  // Placeholders de IA
  /^(n\/a|n\.a\.|não disponível|não informado|não consta|sem informação|sem dados)$/i,
  // Data seguida de texto longo RF
  /^em \d{2}\/\d{2}\/\d{4},\s+constavam/i,
];

function isBoilerplate(text: string): boolean {
  return BOILERPLATE_PATTERNS.some(p => p.test(text.trim()));
}

/** Remove boilerplate da Receita Federal do descricaoDebitos. */
export function sanitizeDescricaoDebitos(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Se for o boilerplate longo da RF, descarta — a flag debitosEmAberto já sinaliza o problema
  if (isBoilerplate(trimmed)) return "";
  // Trunca textos longos demais (mais de 200 chars não servem como subtitle)
  return trimmed.length > 200 ? trimmed.substring(0, 197) + "..." : trimmed;
}

/** Garante que valor monetário BR está no formato correto ("1.234,56"). */
export function sanitizeMoney(raw: string | undefined | null): string {
  if (!raw) return "0,00";
  const trimmed = raw.trim();
  // Aceita "0,00", "1.234,56", "-500,00"
  if (/^-?\d{1,3}(\.\d{3})*(,\d{2})?$/.test(trimmed)) return trimmed;
  // Tenta converter formato americano "1,234.56" → "1.234,56"
  const americanFmt = /^-?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(trimmed);
  if (americanFmt) {
    return trimmed.replace(/,/g, "X").replace(/\./g, ",").replace(/X/g, ".");
  }
  // Remove caracteres inválidos e retorna como está se reconhecível
  const cleaned = trimmed.replace(/[^\d,.\-]/g, "");
  return cleaned || "0,00";
}

/** Valida enum de string, retorna fallback se valor inválido. */
export function sanitizeEnum<T extends string>(
  raw: string | undefined | null,
  valid: readonly T[],
  fallback: T
): T {
  if (!raw) return fallback;
  const lower = raw.toLowerCase().trim();
  const match = valid.find(v => v.toLowerCase() === lower);
  return match ?? fallback;
}

/** Limpa string simples — remove espaços extras e descarta boilerplate. */
export function sanitizeStr(raw: string | undefined | null, maxLen = 500): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (isBoilerplate(trimmed)) return "";
  return trimmed.length > maxLen ? trimmed.substring(0, maxLen - 3) + "..." : trimmed;
}

/** Garante que arrays de objetos são realmente arrays. */
export function sanitizeArray<T>(raw: unknown, itemFn: (item: unknown) => T): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(itemFn);
}
