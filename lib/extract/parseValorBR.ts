/**
 * parseValorBR — converte string de valor monetário (BR ou EN) em número.
 *
 * Substitui o `parseBR` local que era sensível a separador decimal — caso real:
 * Gemini retornou "1234.56" (formato EN) em vez de "1.234,56" (formato BR);
 * o algoritmo antigo (`replace(/\./g, "").replace(",", ".")`) transformava
 * "1234.56" em 123456 (100× maior). Sintoma observado: PRANDOPEL Fev/2025
 * com R$ 29.499.805,06 num mês onde os outros eram R$ 2 milhões.
 *
 * Regras de decisão (do mais específico ao mais genérico):
 * 1. Se tem vírgula E ponto → o ÚLTIMO entre os dois é o decimal.
 * 2. Se só tem vírgula → vírgula é decimal (BR clássico sem milhares).
 * 3. Se só tem ponto:
 *    a. Múltiplos pontos → todos são milhares, sem decimal (BR "1.234.567").
 *    b. Um ponto seguido de 1-2 dígitos → ponto é decimal (EN "1234.56").
 *    c. Um ponto seguido de 3+ dígitos → ponto é milhar (BR "1.234").
 * 4. Sem separador → inteiro puro.
 *
 * Sempre retorna número finito. Entradas inválidas/vazias retornam 0.
 */
export function parseValorBR(input: string | number | null | undefined): number {
  if (input == null) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;

  const raw = String(input).trim();
  if (!raw) return 0;

  // Remove tudo que não é dígito, ponto, vírgula ou sinal negativo.
  const cleaned = raw.replace(/[^\d.,\-]/g, "");
  if (!cleaned) return 0;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  // Caso 4: sem separador → inteiro.
  if (lastDot === -1 && lastComma === -1) {
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  // Caso 1: ambos presentes — o último é o decimal.
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // BR: pontos = milhares, vírgula = decimal.
      const n = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    } else {
      // EN: vírgulas = milhares, ponto = decimal.
      const n = parseFloat(cleaned.replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
  }

  // Caso 2: só vírgula → decimal BR.
  if (lastComma !== -1) {
    const n = parseFloat(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  // Caso 3: só ponto — três sub-casos.
  const dotCount = (cleaned.match(/\./g) || []).length;
  const digitsAfterLastDot = cleaned.length - lastDot - 1;

  if (dotCount > 1) {
    // 3a: múltiplos pontos = milhares BR ("1.234.567").
    const n = parseFloat(cleaned.replace(/\./g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  if (digitsAfterLastDot <= 2) {
    // 3b: um ponto com 1-2 dígitos = decimal EN ("1234.56", "0.5").
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  // 3c: um ponto com 3+ dígitos = milhar BR ("1.234", "12.000").
  const n = parseFloat(cleaned.replace(/\./g, ""));
  return Number.isFinite(n) ? n : 0;
}
