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
export function sanitizeMoney(v: string | undefined | null): string {
  if (!v) return "0,00";
  const cleaned = String(v).trim().replace(/[^\d.,\-]/g, "");
  if (!cleaned) return "0,00";

  // Detect American format (1,234,567.89) vs Brazilian (1.234.567,89)
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let num: number;

  if (hasComma && hasDot) {
    // Both separators - check which is decimal
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Brazilian: 1.234.567,89
      num = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    } else {
      // American: 1,234,567.89
      num = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (hasComma) {
    // Only comma - assume Brazilian decimal
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      num = parseFloat(cleaned.replace(",", "."));
    } else {
      // Multiple commas - probably thousand separators (American without cents)
      num = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (hasDot) {
    // Only dot - could be Brazilian thousand or American decimal
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal: 123.45
      num = parseFloat(cleaned);
    } else {
      // Likely thousand: 1.234.567
      num = parseFloat(cleaned.replace(/\./g, ""));
    }
  } else {
    num = parseFloat(cleaned);
  }

  if (isNaN(num)) return "0,00";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
