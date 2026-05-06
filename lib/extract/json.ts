/**
 * Parse JSON resilientes para resposta da IA.
 *
 * - `parseJSON`: remove markdown ```json``` wrappers, tenta JSON.parse,
 *   e em caso de truncamento (Gemini cortou no meio) tenta recuperar
 *   via `tryRecoverTruncatedJSON` antes de desistir.
 * - `tryRecoverTruncatedJSON`: balanceia `{` e `[` cortando no último
 *   delimitador completo. Devolve null se não for recuperável.
 */

export function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  // Remove markdown code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  // Tenta extrair JSON se resposta veio com texto antes/depois
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  // Números no formato brasileiro (ex: 9.498.394) com 2+ grupos de 3 dígitos são
  // separadores de milhar e jamais decimais JSON válidos. Se o Gemini os retornar
  // sem aspas, o JSON.parse falha. Removemos os pontos antes de parsear.
  cleaned = cleaned.replace(/\b(\d{1,3}(?:\.\d{3}){2,})\b/g, (m) => m.replace(/\./g, ""));
  // Remove "$" espúrio após dígitos — OCR do SCR/BACEN às vezes gera "R$ 200.419,62$"
  cleaned = cleaned.replace(/(\d)\$/g, "$1");
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Recovery — quando Gemini trunca o output em meio a array (ex: maxOutputTokens estourado),
    // tenta recuperar fechando o JSON no último item completo. Salva extrações parciais
    // em vez de retornar objeto vazio.
    const recovered = tryRecoverTruncatedJSON<T>(cleaned);
    if (recovered) {
      console.warn("[parseJSON] JSON truncado — recuperado parcialmente. Erro original:", (err as Error).message);
      return recovered;
    }
    console.error("[parseJSON] Falha ao parsear resposta da IA:", (err as Error).message, "| raw (primeiros 500 chars):", raw.slice(0, 500));
    // Retorna objeto vazio ao invés de crash — fillXxxDefaults vai preencher campos padrão
    return {} as T;
  }
}

/** Última posição de `}` que ocorre fora de uma string JSON, ou -1. */
function findLastBraceOutsideString(s: string): number {
  let last = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "}") last = i;
  }
  return last;
}

/**
 * Tenta recuperar JSON truncado pelo modelo cortando no último objeto completo.
 * Estratégia: encontra a última posição onde a string termina em "}" (fechando
 * um item de array) e fecha tudo (`]` para arrays abertos + `}` final).
 *
 * Funciona pra schemas comuns onde o corte ocorre no meio de um array de objetos
 * (curva_abc_clientes, faturamento_por_mes, anos[], etc.).
 */
function tryRecoverTruncatedJSON<T>(s: string): T | null {
  // Acha o último "}" que fecha um item de objeto FORA de string —
  // strings podem conter "}" literal (ex: "obs": "valor 1.000} aprox")
  // e lastIndexOf("}") sem contexto pode cair lá e produzir lixo.
  const lastObjClose = findLastBraceOutsideString(s);
  if (lastObjClose < 0) return null;
  let candidate = s.slice(0, lastObjClose + 1);

  // Conta chaves/colchetes pendentes
  let openBraces = 0, openBrackets = 0;
  let inString = false, escape = false;
  for (let i = 0; i < candidate.length; i++) {
    const c = candidate[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") openBraces++;
    else if (c === "}") openBraces--;
    else if (c === "[") openBrackets++;
    else if (c === "]") openBrackets--;
  }
  // Fecha colchetes (arrays) e chaves (objetos) pendentes na ordem correta
  candidate += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
