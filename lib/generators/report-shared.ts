/**
 * lib/generators/report-shared.ts
 * Utilitários compartilhados para geração de relatório HTML.
 */

/** Escapa caracteres HTML para prevenir XSS */
export function sanitize(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Converte string BRL para número */
export function parseBRL(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const raw = String(v)
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:[,]|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

/** Formata número como BRL completo (R$ 1.234,56) */
export function formatBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "—";
  return (
    "R$\u00a0" +
    Math.abs(v).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Formata número como abreviação (R$ 2,38M / R$ 450k) */
export function formatAbr(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1_000_000)
    return `${s}R$\u00a0${(a / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  if (a >= 1_000)
    return `${s}R$\u00a0${(a / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
  return `${s}R$\u00a0${Math.round(a).toLocaleString("pt-BR")}`;
}

/** Parse e deduplica meses de faturamento */
export function parseFaturamento(
  meses: Array<{ mes: string; valor: string }> | null | undefined
): Array<{ mes: string; valor: number }> {
  if (!meses?.length) return [];
  const map = new Map<string, number>();
  for (const m of meses) {
    if (m?.mes && m?.valor) {
      map.set(m.mes, parseBRL(m.valor));
    }
  }
  return Array.from(map.entries())
    .map(([mes, valor]) => ({ mes, valor }))
    .sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
}

function mesKey(s: string): number {
  const parts = s.split("/");
  if (parts.length !== 2) return 0;
  const [p1, p2] = parts;
  const mm: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  };
  const month = isNaN(Number(p1)) ? mm[p1.toLowerCase()] || 0 : Number(p1);
  const year = Number(p2) < 100 ? Number(p2) + 2000 : Number(p2);
  return year * 100 + month;
}

/** Calcula FMM dos últimos 12 meses */
export function calcFMM(
  meses: Array<{ mes: string; valor: number }>
): number {
  const last12 = meses.slice(-12);
  if (!last12.length) return 0;
  return last12.reduce((s, m) => s + m.valor, 0) / last12.length;
}

/** Retorna tendência dos últimos 3 meses vs 3 anteriores */
export function calcTendencia(
  meses: Array<{ mes: string; valor: number }>
): "alta" | "baixa" | "estavel" {
  if (meses.length < 6) return "estavel";
  const last3 = meses.slice(-3).reduce((s, m) => s + m.valor, 0) / 3;
  const prev3 = meses.slice(-6, -3).reduce((s, m) => s + m.valor, 0) / 3;
  if (prev3 === 0) return "estavel";
  const delta = (last3 - prev3) / prev3;
  if (delta > 0.05) return "alta";
  if (delta < -0.05) return "baixa";
  return "estavel";
}

/** Calcula idade da empresa em anos */
export function calcIdadeEmpresa(dataAbertura: string | null | undefined): number {
  if (!dataAbertura) return 0;
  const d = new Date(dataAbertura);
  if (isNaN(d.getTime())) return 0;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

/** Agrupa protestos por credor */
export function groupProtestosByCredor(
  detalhes: Array<{ credor?: string; valor?: string }> | null | undefined
): Array<{ credor: string; total: number; qtd: number }> {
  if (!detalhes?.length) return [];
  const map = new Map<string, { total: number; qtd: number }>();
  for (const p of detalhes) {
    const k = p.credor || "Desconhecido";
    const v = parseBRL(p.valor);
    const cur = map.get(k) || { total: 0, qtd: 0 };
    map.set(k, { total: cur.total + v, qtd: cur.qtd + 1 });
  }
  return Array.from(map.entries())
    .map(([credor, d]) => ({ credor, ...d }))
    .sort((a, b) => b.total - a.total);
}

/** Agrupa processos por tipo */
export function groupProcessosByTipo(
  processos: Array<{ tipo?: string; valor?: string }> | null | undefined
): Array<{ tipo: string; total: number; qtd: number }> {
  if (!processos?.length) return [];
  const map = new Map<string, { total: number; qtd: number }>();
  for (const p of processos) {
    const k = p.tipo || "Outros";
    const v = parseBRL(p.valor);
    const cur = map.get(k) || { total: 0, qtd: 0 };
    map.set(k, { total: cur.total + v, qtd: cur.qtd + 1 });
  }
  return Array.from(map.entries())
    .map(([tipo, d]) => ({ tipo, ...d }))
    .sort((a, b) => b.total - a.total);
}

/** Classifica processo como cível, trabalhista, fiscal etc */
export function classifyProcesso(tipo: string | null | undefined): string {
  const t = (tipo || "").toLowerCase();
  if (t.includes("trabalhista") || t.includes("reclamação")) return "Trabalhista";
  if (t.includes("fiscal") || t.includes("tributário") || t.includes("fazenda")) return "Fiscal";
  if (t.includes("execução")) return "Execução";
  if (t.includes("cível") || t.includes("civil")) return "Cível";
  return tipo || "Outros";
}
