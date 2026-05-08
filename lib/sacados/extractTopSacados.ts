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

// ── Filtro de lixo na Curva ABC ─────────────────────────────────────────────
// Caso real prod 2026-05-08: Gemini extrai linhas de totalizador como
// "Totais listados ....: 451 16.906.347" e marca como cliente. Sem nome real,
// não há CNPJ pra resolver, então a tabela mostra `—` em todas as colunas.

const TOTAL_HEAD_RE = /^\s*(totais?|total|subtotal|sub\s*total|soma|geral|t\s*o\s*t\s*a\s*l)\b/i;
const TOTAIS_LISTADOS_RE = /totais?\s+listad/i;
const APENAS_NUMEROS_RE = /^[\s\d.,:/\-R$%()]+$/;

/**
 * True se o "nome do cliente" parece linha de totalização ou rodapé da
 * planilha em vez de cliente real. Regras conservadoras — descarta apenas
 * casos claramente inválidos:
 *   - Começa com "Total/Totais/Subtotal/Soma/Geral" como palavra
 *   - Contém "totais listad..."
 *   - Só números/pontuação (provável linha de soma)
 *   - Proporção de letras < 25% para strings com 6+ chars
 */
export function isLinhaTotalCurvaABC(nome: string | undefined | null): boolean {
  if (!nome) return false;
  const t = String(nome).trim();
  if (!t) return false;
  if (APENAS_NUMEROS_RE.test(t)) return true;
  if (TOTAL_HEAD_RE.test(t)) return true;
  if (TOTAIS_LISTADOS_RE.test(t)) return true;
  const letras = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const compact = t.replace(/\s+/g, "").length;
  if (compact >= 6 && letras / compact < 0.25) return true;
  return false;
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

// Padrões observados em prod 2026-05-08 ao consumir Curva ABC do ERP:
//   "000001ALIRIO VIEIRA DA SILVA NETO 847.562"
//   "001124COMERCIAL DE ALIMENTOS SANTA 553.500"
// Prefixo numérico = código do cliente no ERP do cedente, sufixo = qtd vendida.
// Esses ruídos quebram a busca por razão social (publica.cnpj.ws devolve
// 0 candidatos). Limpamos antes de enviar pro resolver e antes de exibir.
const COD_PREFIX_RE = /^(\d{3,})(?=[A-Za-zÀ-ÿ])/;
const TRAILING_NUM_RE = /\s+\d[\d.,]+\s*$/;

/**
 * Limpa ruído de razão social vindo do ERP do cedente:
 *   "000001ALIRIO VIEIRA NETO 847.562" → "ALIRIO VIEIRA NETO"
 *   "001124COMERCIAL ALIMENTOS 553.500" → "COMERCIAL ALIMENTOS"
 *   "EMPRESA REAL LTDA"               → "EMPRESA REAL LTDA" (idempotente)
 *
 * Conservador: só remove dígitos colados em letra (não toca em "3M DO BRASIL")
 * e só remove números trailing precedidos de espaço (não toca em "LJ1").
 */
export function cleanSacadoName(nome: string | undefined | null): string {
  if (!nome) return "";
  let t = String(nome).trim();
  t = t.replace(COD_PREFIX_RE, "");
  // Aplica 2x: alguns ERPs têm "...NETO 847.562 1.234" (qtd + valor)
  t = t.replace(TRAILING_NUM_RE, "");
  t = t.replace(TRAILING_NUM_RE, "");
  return t.replace(/\s+/g, " ").trim();
}

// PF detection: nome 100% sem indicação de empresa (LTDA, S.A, ME, EPP,
// EIRELI, COMERCIAL, INDUSTRIA, etc), com ≥ 2 palavras "humanas". Apenas
// heurística — não substitui a checagem de CPF, mas evita gastar request
// no resolver com nomes claramente PF.
const PJ_INDICATORS_RE = /\b(LTDA|S\.?A|S\/A|ME|EPP|EIRELI|MEI|COMERCIAL|COMERCIO|INDUSTRIAL?|INDUSTRIA|SERVICOS?|TRANSPORTES?|DISTRIBUIDORA|ATACADO|VAREJO|SUPERMERCADO|MERCADO|FARMACIA|POSTO|RESTAURANTE)\b/i;

export function looksLikePF(nome: string): boolean {
  if (!nome) return false;
  if (PJ_INDICATORS_RE.test(nome)) return false;
  const palavras = nome.trim().split(/\s+/);
  // Nome humano típico: 3+ palavras, todas curtas (sobrenomes), sem dígitos
  if (palavras.length < 3) return false;
  if (/\d/.test(nome)) return false;
  return palavras.every((p) => p.length <= 15);
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

export interface ExtractTopSacadosOptions {
  /**
   * Quando true, sacados PJ sem CNPJ válido também passam — com `cnpj: ""`.
   * Caller deve resolver via `resolveCnpjPorNome` antes de consultar bureau.
   * Sacados com CPF (11 dígitos) continuam sendo descartados.
   * Default: false (comportamento legado).
   */
  includeWithoutCnpj?: boolean;
}

/**
 * Pega top N sacados PJ da Curva ABC, ordenados por valor faturado desc.
 *
 * Filtros aplicados:
 *   - cnpjCpf precisa ser CNPJ válido (14 dígitos, não repetido) — exceto se
 *     `includeWithoutCnpj` true, aí passam com `cnpj: ""` para resolução posterior
 *   - sacados com CPF (11 dígitos puros, sem indício de CNPJ) sempre descartados
 *   - nome precisa ser não-vazio
 *   - dedup por CNPJ quando presente; quando ausente, dedup por nome normalizado
 *
 * Empates de valor mantêm ordem estável (preserva `posicao` original).
 */
export function extractTopSacados(
  curva: CurvaABCData | undefined | null,
  limit: number = DEFAULT_LIMIT,
  opts: ExtractTopSacadosOptions = {}
): TopSacadoEntry[] {
  if (!curva?.clientes?.length) return [];

  const seenCnpj = new Set<string>();
  const seenNames = new Set<string>();
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

    // Descarta linhas de totalizador / rodapé que o extrator pegou como cliente
    if (isLinhaTotalCurvaABC(c.nome)) {
      console.log(`[extractTopSacados] descartado lixo de totalização: "${(c.nome || "").slice(0, 50)}"`);
      continue;
    }

    let cnpj = onlyDigits(c.cnpjCpf);
    // Aplica limpeza ANTES de qualquer regra — remove código do ERP no início
    // (ex.: "000001ALIRIO...") e quantidade no fim (ex.: "...NETO 847.562")
    let cleanedName = cleanSacadoName(c.nome);
    let usedFallback = false;

    if (!isLikelyCnpj(cnpj)) {
      // Tenta extrair CNPJ embutido no nome (busca no nome ORIGINAL)
      const cnpjFromName = extractCnpjFromText(c.nome);
      if (cnpjFromName) {
        cnpj = cnpjFromName;
        // strip o CNPJ e depois aplica clean (ordem importa)
        cleanedName = cleanSacadoName(stripCnpjFromName(c.nome));
        usedFallback = true;
      } else if (opts.includeWithoutCnpj) {
        // POC: deixa passar sem CNPJ (caller resolve por nome).
        // Mas só se não for CPF (11 dígitos puros).
        if (cnpj.length === 11) continue;
        // Skip também se o nome limpo parece PF — resolver não busca por CPF
        if (looksLikePF(cleanedName)) {
          console.log(`[extractTopSacados] skip PF (não há resolução automática): "${cleanedName.slice(0, 40)}"`);
          continue;
        }
        cnpj = "";
      } else {
        continue;
      }
    }

    if (cnpj && seenCnpj.has(cnpj)) continue;
    if (!cleanedName) continue;

    // Dedup por nome só quando CNPJ ausente (evita duplicar mesmo sacado em
    // duas linhas com grafias levemente diferentes durante a fase de resolução).
    if (!cnpj) {
      const nk = cleanedName.toUpperCase().replace(/\s+/g, " ").trim();
      if (seenNames.has(nk)) continue;
      seenNames.add(nk);
    } else {
      seenCnpj.add(cnpj);
    }

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
