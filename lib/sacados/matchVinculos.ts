// Detecção de partes relacionadas entre cedente e sacado.
//
// 4 critérios independentes (qualquer hit ⇒ temVinculo=true):
//   1. CPF de sócio em comum     — match exato, sem falso positivo
//   2. Sobrenome + UF coincidente — heurística com lista de sobrenomes comuns
//   3. Endereço idêntico         — normalização agressiva de ambos os lados
//   4. Parentesco via BDC        — interseção de CPFs (parentes ↔ sócios)
//
// Cada matcher é uma função pura. `calcularVinculos` orquestra os 4 e devolve
// um VinculosSacado completo. Defaults aplicados nesta camada (justificados
// no comentário de cada função):
//   - sobrenome+UF exige UF preenchida nas DUAS pontas (else: skip)
//   - endereço idêntico exige logradouro+número+cidade+UF nas duas pontas
//   - sobrenomes na lista comum NÃO disparam vínculo (suprime falso positivo)

import type {
  QSASocio,
  Socio,
  SacadoSocio,
  VinculosSacado,
  VinculoCpfComum,
  VinculoSobrenomeUF,
  VinculoParentescoBDC,
  VinculoMaeComum,
} from "@/types";
import { onlyDigits } from "./extractTopSacados";
import { isCommonSurname } from "./sobrenomes-comuns";

// ────────────────────────────────────────────────────────────────────────────
// Helpers de normalização
// ────────────────────────────────────────────────────────────────────────────

/** Remove acentos, uppercase, colapsa espaço. Retorna "" para entrada vazia. */
export function normalizeName(name: string | undefined | null): string {
  if (!name) return "";
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai sobrenomes "discriminativos" de um nome completo:
 *   "Maria da Silva Souza" → ["SOUZA"]                (último — mais discriminativo)
 *   "João Carlos Bittencourt Almeida" → ["BITTENCOURT", "ALMEIDA"]
 *
 * Regras:
 *   - normaliza (uppercase + sem acento)
 *   - tokeniza por espaço
 *   - remove partículas (DA, DE, DO, DOS, DAS, E, JR, JUNIOR, NETO, FILHO, SOBRINHO)
 *   - mantém os 2 últimos tokens — quando há só 1 sobrenome, devolve 1
 *   - tokens com <2 chars são descartados
 */
export function extractSurnames(fullName: string | undefined | null): string[] {
  const normalized = normalizeName(fullName);
  if (!normalized) return [];

  const PARTICLES = new Set(["DA", "DE", "DO", "DOS", "DAS", "E", "Y"]);
  const SUFFIXES = new Set(["JR", "JUNIOR", "NETO", "FILHO", "SOBRINHO"]);

  const tokens = normalized
    .split(" ")
    .filter((t) => t.length >= 2 && !PARTICLES.has(t) && !SUFFIXES.has(t));

  // Apenas 1 token é ambíguo (nome próprio "Maria" vs sobrenome "Souza"):
  // default conservador é não retornar nada, para não disparar falso match.
  if (tokens.length <= 1) return [];
  // primeiro token é nome próprio — descarta
  const surnames = tokens.slice(1);
  // Mantém os 2 últimos para flexibilidade (ex: "BITTENCOURT ALMEIDA")
  return surnames.slice(-2);
}

/**
 * Normaliza endereço para comparação:
 *   "Rua das Flores, 100 - Centro - São Paulo/SP - CEP 01000-000"
 *   → "RUA DAS FLORES 100 CENTRO SAO PAULO SP"
 *
 * - uppercase + sem acento
 * - remove pontuação (vírgula, ponto, hífen, barra)
 * - remove "CEP" e dígitos de CEP (formato 00000-000 ou 00000000)
 * - colapsa espaços
 */
export function normalizeAddress(addr: string | undefined | null): string {
  if (!addr) return "";
  const normalized = String(addr)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/CEP\s*\d{5}-?\d{3}/g, " ")
    .replace(/\b\d{5}-?\d{3}\b/g, " ")        // CEP solto
    .replace(/[.,;:/\\\-—–]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

/** Tipo unificado de sócio para matchers — aceita QSASocio, Socio ou SacadoSocio. */
type AnySocio = {
  nome?: string;
  cpf?: string;
  cpfCnpj?: string;
};

function getCpf(s: AnySocio): string {
  // QSASocio usa cpfCnpj; Socio/SacadoSocio usam cpf
  const raw = s.cpf ?? s.cpfCnpj ?? "";
  const d = onlyDigits(raw);
  // CPF tem 11 dígitos; descarta CNPJs (14) e lixo
  if (d.length !== 11) return "";
  if (/^(\d)\1{10}$/.test(d)) return ""; // 00000000000, 11111111111, etc.
  return d;
}

function getNome(s: AnySocio): string {
  return (s.nome || "").trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Matcher 1 — CPF de sócio em comum
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a lista de CPFs que aparecem como sócio nas duas pontas.
 * Match exato após normalização (`onlyDigits` + descarta CPFs lixo).
 *
 * Cedente e sacado podem ter MAIS de um sócio com o mesmo CPF (raro mas
 * acontece em QSAs herdados); aqui dedupamos por CPF.
 */
export function matchCPFComum(
  sociosCedente: AnySocio[],
  sociosSacado: AnySocio[]
): VinculoCpfComum[] {
  if (!sociosCedente?.length || !sociosSacado?.length) return [];

  // Indexa cedente por CPF para lookup O(1)
  const indexCedente = new Map<string, AnySocio>();
  for (const s of sociosCedente) {
    const cpf = getCpf(s);
    if (cpf && !indexCedente.has(cpf)) indexCedente.set(cpf, s);
  }
  if (indexCedente.size === 0) return [];

  const seen = new Set<string>();
  const hits: VinculoCpfComum[] = [];
  for (const s of sociosSacado) {
    const cpf = getCpf(s);
    if (!cpf || seen.has(cpf)) continue;
    const ced = indexCedente.get(cpf);
    if (!ced) continue;
    seen.add(cpf);
    hits.push({
      cpf,
      nomeSocioCedente: getNome(ced),
      nomeSocioSacado: getNome(s),
    });
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// Matcher 2 — Sobrenome + UF coincidente
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retorna pares de sócios que compartilham um sobrenome NÃO-comum, quando as
 * duas empresas estão na MESMA UF.
 *
 * Decisão (default conservador):
 *   - Se ufCedente ou ufSacado não preenchida ⇒ não dispara (skip total)
 *   - Sobrenome em `sobrenomes-comuns.ts` ⇒ não dispara
 *   - Mesmo CPF nos dois lados ⇒ não dispara aqui (já é coberto pelo matcher 1)
 *   - Quando um sócio cedente tem 2 sobrenomes, basta UM bater
 *   - Mesmo par (sobrenome, sócio cedente, sócio sacado) só aparece 1x
 *
 * Comportamento dedup: se "Bittencourt" bater com 2 sócios diferentes do
 * sacado, gera 2 hits — isso é informação útil pro analista.
 */
export function matchSobrenomeUF(
  sociosCedente: AnySocio[],
  sociosSacado: AnySocio[],
  ufCedente: string | undefined | null,
  ufSacado: string | undefined | null
): VinculoSobrenomeUF[] {
  const ufA = (ufCedente || "").trim().toUpperCase();
  const ufB = (ufSacado || "").trim().toUpperCase();
  if (!ufA || !ufB) return []; // skip — UF ausente em qualquer ponta
  if (ufA !== ufB) return [];
  if (!sociosCedente?.length || !sociosSacado?.length) return [];

  const cedenteSurnames: Array<{ socio: AnySocio; surnames: Set<string> }> = [];
  for (const s of sociosCedente) {
    const surnames = new Set(extractSurnames(getNome(s)).filter((sn) => !isCommonSurname(sn)));
    if (surnames.size > 0) cedenteSurnames.push({ socio: s, surnames });
  }
  if (cedenteSurnames.length === 0) return [];

  const hits: VinculoSobrenomeUF[] = [];
  const seen = new Set<string>();

  for (const sSacado of sociosSacado) {
    const cpfSacado = getCpf(sSacado);
    const surnamesSacado = extractSurnames(getNome(sSacado)).filter((sn) => !isCommonSurname(sn));
    if (surnamesSacado.length === 0) continue;

    for (const { socio: sCedente, surnames: cedSet } of cedenteSurnames) {
      // mesmo CPF é coberto pelo matcher 1 — pula aqui pra não inflar
      const cpfCedente = getCpf(sCedente);
      if (cpfCedente && cpfSacado && cpfCedente === cpfSacado) continue;

      for (const sn of surnamesSacado) {
        if (!cedSet.has(sn)) continue;
        const key = `${sn}|${getNome(sCedente)}|${getNome(sSacado)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          sobrenome: sn,
          uf: ufA,
          nomeSocioCedente: getNome(sCedente),
          nomeSocioSacado: getNome(sSacado),
        });
      }
    }
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// Matcher 3 — Endereço idêntico
// ────────────────────────────────────────────────────────────────────────────

export interface EnderecoMatchResult {
  identico: boolean;
  enderecoCedente?: string;
  enderecoSacado?: string;
}

/**
 * Considera endereços idênticos quando, após `normalizeAddress`, as duas formas
 * batem por igualdade EXATA. Nada de fuzzy — preferimos zero falsos positivos.
 *
 * Se qualquer ponta vier vazia ou normalizada para <10 chars (ex.: "RUA"
 * isolado), retorna `identico: false`.
 */
export function matchEnderecoIdentico(
  enderecoCedente: string | undefined | null,
  enderecoSacado: string | undefined | null
): EnderecoMatchResult {
  const a = normalizeAddress(enderecoCedente);
  const b = normalizeAddress(enderecoSacado);
  if (!a || !b) return { identico: false };
  if (a.length < 10 || b.length < 10) return { identico: false };
  if (a !== b) return { identico: false, enderecoCedente: a, enderecoSacado: b };
  return { identico: true, enderecoCedente: a, enderecoSacado: b };
}

// ────────────────────────────────────────────────────────────────────────────
// Matcher 4 — Parentesco BDC (interseção parentes ↔ sócios)
// ────────────────────────────────────────────────────────────────────────────

export interface ParenteBDC {
  cpf: string;
  nome: string;
  tipo: string; // "Pai", "Mãe", "Cônjuge", "Irmão", "Filho", etc.
}

/**
 * Detecta vínculo declarado pelo BDC `relationships`/`kinship`:
 *   - parentesCedente: parentes declarados pelo BDC para sócios do cedente
 *   - sociosSacado: sócios do sacado
 *   - parentesSacado: parentes declarados pelo BDC para sócios do sacado
 *   - sociosCedente: sócios do cedente
 *
 * Hit em qualquer direção: parente do cedente vira sócio do sacado, ou
 * parente do sacado vira sócio do cedente. Cada hit conserva a `origem` para o
 * relatório explicar de onde veio.
 *
 * Dedup por CPF.
 */
export function extractParentescoBDC(
  parentesCedente: ParenteBDC[] | undefined,
  sociosSacado: AnySocio[] | undefined,
  parentesSacado: ParenteBDC[] | undefined,
  sociosCedente: AnySocio[] | undefined
): VinculoParentescoBDC[] {
  const cpfsSacado = new Set<string>();
  for (const s of sociosSacado || []) {
    const cpf = getCpf(s);
    if (cpf) cpfsSacado.add(cpf);
  }
  const cpfsCedente = new Set<string>();
  for (const s of sociosCedente || []) {
    const cpf = getCpf(s);
    if (cpf) cpfsCedente.add(cpf);
  }

  const seen = new Set<string>();
  const hits: VinculoParentescoBDC[] = [];

  for (const p of parentesCedente || []) {
    const cpf = onlyDigits(p.cpf);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) continue;
    if (!cpfsSacado.has(cpf)) continue;
    if (seen.has(cpf)) continue;
    seen.add(cpf);
    hits.push({ cpf, nome: p.nome.trim(), tipo: p.tipo, origem: "cedente" });
  }
  for (const p of parentesSacado || []) {
    const cpf = onlyDigits(p.cpf);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) continue;
    if (!cpfsCedente.has(cpf)) continue;
    if (seen.has(cpf)) continue;
    seen.add(cpf);
    hits.push({ cpf, nome: p.nome.trim(), tipo: p.tipo, origem: "sacado" });
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// Matcher 5 — Mãe comum (BDC /pessoas → motherName)
// ────────────────────────────────────────────────────────────────────────────

export interface SocioComMae {
  nome: string;
  cpf?: string;
  motherName?: string;
}

/**
 * Detecta sócios cedente×sacado que compartilham a mesma mãe — sinal forte
 * de irmãos. O critério já é usado dentro do mesmo cedente
 * (lib/bureaus/bigdatacorp.ts → `parentescosDetectados`); aqui estendemos
 * cruzando entre as duas empresas.
 *
 * Comparação: nome da mãe normalizado (uppercase, sem acento, sem espaços extras).
 *
 * Filtros para reduzir falsos positivos:
 *   - mãe normalizada precisa ter ≥ 8 chars e pelo menos 1 espaço
 *     (descarta "MARIA" sozinho, que é frequentíssimo)
 *   - CPFs idênticos não disparam (já é coberto pelo matcher 1)
 */
export function matchMaeComum(
  sociosCedente: SocioComMae[] | undefined,
  sociosSacado: SocioComMae[] | undefined
): VinculoMaeComum[] {
  if (!sociosCedente?.length || !sociosSacado?.length) return [];

  function normalizeMother(m?: string): string {
    const n = normalizeName(m);
    if (n.length < 8) return "";
    if (!n.includes(" ")) return ""; // exige nome+sobrenome
    return n;
  }

  // Indexa cedente por mãe (lista de sócios com aquela mãe)
  const indexCedente = new Map<string, SocioComMae[]>();
  for (const s of sociosCedente) {
    const mae = normalizeMother(s.motherName);
    if (!mae) continue;
    const list = indexCedente.get(mae) ?? [];
    list.push(s);
    indexCedente.set(mae, list);
  }
  if (indexCedente.size === 0) return [];

  const seen = new Set<string>();
  const hits: VinculoMaeComum[] = [];

  for (const sSacado of sociosSacado) {
    const mae = normalizeMother(sSacado.motherName);
    if (!mae) continue;
    const candidatosCed = indexCedente.get(mae);
    if (!candidatosCed) continue;

    const cpfSacado = onlyDigits(sSacado.cpf || "");
    for (const sCed of candidatosCed) {
      const cpfCed = onlyDigits(sCed.cpf || "");
      // Mesmo CPF é coberto pelo matcher 1 — pula
      if (cpfCed && cpfSacado && cpfCed === cpfSacado) continue;

      const key = `${mae}|${(sCed.nome || "").trim()}|${(sSacado.nome || "").trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      hits.push({
        maeComum: mae,
        socioCedenteNome: (sCed.nome || "").trim(),
        socioCedenteCpf: cpfCed || undefined,
        socioSacadoNome: (sSacado.nome || "").trim(),
        socioSacadoCpf: cpfSacado || undefined,
      });
    }
  }

  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestrador
// ────────────────────────────────────────────────────────────────────────────

export interface CalcularVinculosInput {
  sociosCedente: AnySocio[];
  sociosSacado: AnySocio[];
  ufCedente?: string;
  ufSacado?: string;
  enderecoCedente?: string;
  enderecoSacado?: string;
  parentesCedente?: ParenteBDC[];
  parentesSacado?: ParenteBDC[];
  /** Sócios cedente com nome da mãe (vindo do BDC `/pessoas`). */
  sociosCedenteComMae?: SocioComMae[];
  /** Sócios sacado com nome da mãe (vindo do BDC `/pessoas`). */
  sociosSacadoComMae?: SocioComMae[];
}

/**
 * Roda os 5 matchers e devolve VinculosSacado consolidado.
 * `temVinculo` é true se qualquer matcher retornar pelo menos um hit.
 */
export function calcularVinculos(input: CalcularVinculosInput): VinculosSacado {
  const cpfSocioComum = matchCPFComum(input.sociosCedente, input.sociosSacado);
  const sobrenomesUF = matchSobrenomeUF(
    input.sociosCedente,
    input.sociosSacado,
    input.ufCedente,
    input.ufSacado
  );
  const enderecoMatch = matchEnderecoIdentico(input.enderecoCedente, input.enderecoSacado);
  const parentescoBDC = extractParentescoBDC(
    input.parentesCedente,
    input.sociosSacado,
    input.parentesSacado,
    input.sociosCedente
  );
  const maesComuns = matchMaeComum(input.sociosCedenteComMae, input.sociosSacadoComMae);

  const temVinculo =
    cpfSocioComum.length > 0 ||
    sobrenomesUF.length > 0 ||
    enderecoMatch.identico ||
    parentescoBDC.length > 0 ||
    maesComuns.length > 0;

  return {
    cpfSocioComum,
    sobrenomesUF,
    enderecoIdentico: enderecoMatch.identico,
    enderecoCedente: enderecoMatch.enderecoCedente,
    enderecoSacado: enderecoMatch.enderecoSacado,
    parentescoBDC,
    maesComuns,
    temVinculo,
  };
}

// Re-export para conveniência dos chamadores
export type { QSASocio, Socio, SacadoSocio };
