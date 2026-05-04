// Formatadores compartilhados — usados em /historico, /pareceres, /operacoes,
// /custos, /metricas, /importar-goalfy e na home.
// Antes existiam 8+ cópias divergentes; consolidadas aqui.

export function fmtBRL(
  value: number | null | undefined,
  opts: { fallback?: string; maximumFractionDigits?: number } = {},
): string {
  const { fallback = "—", maximumFractionDigits = 2 } = opts;
  if (value == null || !isFinite(Number(value))) return fallback;
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: maximumFractionDigits === 0 ? 0 : 2,
    maximumFractionDigits,
  });
}

export function fmtCNPJ(s: string | null | undefined): string {
  if (!s) return "—";
  const d = String(s).replace(/\D/g, "");
  if (d.length !== 14) return s as string;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function fmtCPF(s: string | null | undefined): string {
  if (!s) return "—";
  const d = String(s).replace(/\D/g, "");
  if (d.length !== 11) return s as string;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Aceita ISO ("2026-04-23T10:00:00Z"), date-only ("2026-04-23") e null.
export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

export function fmtNumber(v: number | null | undefined, decimals = 0): string {
  if (v == null || !isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPercent(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export type GradeBadge = {
  letter: "A" | "B" | "C" | "D" | "—";
  bg: string;
  color: string;
  border: string;
  label: string;
};

// Faixas oficiais: A ≥ 8, B 5–7,9, C 3–4,9, D < 3.
export function getGrade(rating: number | null | undefined): GradeBadge {
  if (rating == null || !isFinite(Number(rating))) {
    return { letter: "—", bg: "#F1F5F9", color: "#94A3B8", border: "#E2E8F0", label: "Sem rating" };
  }
  const r = Number(rating);
  if (r >= 8) return { letter: "A", bg: "#DCFCE7", color: "#16A34A", border: "#86EFAC", label: "A · Baixo risco" };
  if (r >= 5) return { letter: "B", bg: "#FEF3C7", color: "#D97706", border: "#FCD34D", label: "B · Risco moderado" };
  if (r >= 3) return { letter: "C", bg: "#FFEDD5", color: "#EA580C", border: "#FDBA74", label: "C · Risco elevado" };
  return { letter: "D", bg: "#FEE2E2", color: "#DC2626", border: "#FCA5A5", label: "D · Alto risco" };
}

export function getGradeTooltip(rating: number | null | undefined): string {
  if (rating == null) return "Sem rating — análise ainda não foi gerada";
  if (rating >= 8) return "A · Baixo risco (rating 8-10): perfil saudável, recomendado";
  if (rating >= 5) return "B · Risco moderado (rating 5-7,9): atenção recomendada";
  if (rating >= 3) return "C · Risco elevado (rating 3-4,9): avaliar condições antes de aprovar";
  return "D · Alto risco (rating 0-2,9): perfil crítico, evitar ou exigir garantias fortes";
}

export function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}
