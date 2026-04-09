"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

export const SUSPICIOUS_VALUES = new Set(["N/D", "n/d", "ND", "nd", "N/A", "n/a", "—", "-", "null", "undefined", "NaN"]);

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({ label, value, onChange, multiline = false, span2 = false }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; span2?: boolean;
}) {
  const isEmpty = !value || value === "" || value === "0" || value === "0,00";
  const isSuspicious = !isEmpty && SUSPICIOUS_VALUES.has(value.trim());

  const baseBorder = isSuspicious ? "#fb923c" : isEmpty ? "#fcd34d" : "#E5E7EB";
  const baseBg    = isSuspicious ? "#fff7ed" : isEmpty ? "#fffbeb" : "#ffffff";

  return (
    <div className={span2 ? "col-span-2" : ""}>
      <label style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6B7280" }}>
        {label}
        {isSuspicious && (
          <span style={{ fontSize: "9px", fontWeight: 700, color: "#ea580c", background: "#ffedd5", padding: "1px 6px", borderRadius: "99px" }}>⚠ verificar</span>
        )}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ width: "100%", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", border: `1px solid ${baseBorder}`, background: baseBg, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: "1.5", transition: "border-color 0.15s, box-shadow 0.15s" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = baseBorder; e.currentTarget.style.boxShadow = "none"; }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: "100%", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", border: `1px solid ${baseBorder}`, background: baseBg, outline: "none", fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = baseBorder; e.currentTarget.style.boxShadow = "none"; }}
        />
      )}
    </div>
  );
}

// ── QualityResult ─────────────────────────────────────────────────────────────
export interface QualityResult {
  score: "good" | "warning" | "error";
  filledFields: number;
  totalFields: number;
  pct: number;
  issues: string[];
}

export function QualityBadge({ quality }: { quality: QualityResult }) {
  const cfg = {
    good:    { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d",  bar: "#22c55e", label: "Boa qualidade" },
    warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e",  bar: "#f59e0b", label: "Revisar" },
    error:   { bg: "#fef2f2", border: "#fecaca", text: "#991b1b",  bar: "#ef4444", label: "Incompleto" },
  };
  const c = cfg[quality.score];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "10px", padding: "10px 14px", marginTop: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: c.text }}>{c.label} — {quality.pct}%</span>
      </div>
      <div style={{ height: "4px", borderRadius: "99px", background: "#e5e7eb", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: "99px", background: c.bar, width: `${quality.pct}%`, transition: "width 0.4s ease" }} />
      </div>
      {quality.issues.length > 0 && (
        <ul style={{ marginTop: "6px" }}>
          {quality.issues.map((issue, i) => (
            <li key={i} style={{ fontSize: "10px", color: c.text, opacity: 0.85, display: "flex", alignItems: "flex-start", gap: "4px" }}>
              <span style={{ marginTop: "1px", flexShrink: 0 }}>→</span>{issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────
export function SectionCard({
  number, title, children, expanded, onToggle, badge, accentColor = "#9CA3AF"
}: {
  number: string; icon?: React.ReactNode; title: string; iconColor?: string;
  children: React.ReactNode; expanded: boolean; onToggle: () => void;
  badge?: React.ReactNode; accentColor?: string;
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #E5E7EB",
        borderLeft: `3px solid ${accentColor}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.2s",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          textAlign: "left",
          background: expanded ? "#F8FAFC" : "white",
          cursor: "pointer",
          border: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "white"; }}
      >
        {/* Pill número */}
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "99px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: "10px",
            fontWeight: 700,
            color: "white",
            background: accentColor,
          }}
        >
          {number}
        </div>

        {/* Título */}
        <p style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "#111827", lineHeight: "1.4", margin: 0 }}>
          {title}
        </p>

        {/* Badge */}
        {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}

        {/* Chevron */}
        <div style={{ flexShrink: 0, color: "#9CA3AF" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div
          style={{ padding: "20px 20px 20px", background: "white", borderTop: "1px solid #F3F4F6", animationName: "fadeIn", animationDuration: "0.15s" }}
          className="animate-fade-in"
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Quality assessment ─────────────────────────────────────────────────────────
export function avaliarQualidade(type: string, data: Record<string, unknown>): QualityResult {
  const issues: string[] = [];
  let filled = 0;
  let total = 0;

  const check = (field: unknown, label: string, required = false) => {
    total++;
    const isEmpty = !field || field === "" || field === "0" || field === "0,00" || (Array.isArray(field) && field.length === 0);
    if (!isEmpty) { filled++; }
    else if (required) { issues.push(`${label} nao encontrado`); }
  };

  switch (type) {
    case "cnpj":
      check(data.razaoSocial, "Razao Social", true);
      check(data.cnpj, "CNPJ", true);
      check(data.situacaoCadastral, "Situacao Cadastral", true);
      check(data.dataAbertura, "Data de Abertura");
      check(data.cnaePrincipal, "CNAE Principal");
      check(data.porte, "Porte");
      check(data.endereco, "Endereco");
      check(data.capitalSocialCNPJ, "Capital Social");
      break;
    case "qsa": {
      check(data.quadroSocietario, "Quadro Societario", true);
      const socios = (data.quadroSocietario || []) as Record<string, unknown>[];
      if (socios.filter(s => s.nome).length === 0) issues.push("Nenhum socio identificado");
      else socios.forEach((s, i) => { if (!s.cpfCnpj) issues.push(`Socio ${i + 1}: CPF/CNPJ ausente`); });
      break;
    }
    case "contrato":
      check(data.capitalSocial, "Capital Social", true);
      check(data.dataConstituicao, "Data de Constituicao");
      check(data.administracao, "Administracao");
      check(data.objetoSocial, "Objeto Social");
      { const sc = (data.socios || []) as Record<string, unknown>[]; total++; if (sc.filter(s => s.nome).length > 0) filled++; else issues.push("Nenhum socio no contrato"); }
      break;
    case "faturamento":
      check(data.mediaAno || data.mediaMensal, "Media Mensal", true);
      { const m = (data.meses || []) as unknown[]; total++;
        if (m.length === 0) issues.push("Nenhum mes de faturamento extraido");
        else if (m.length < 6) { issues.push(`Apenas ${m.length} meses — ideal 12+`); filled += 0.5; }
        else filled++;
      }
      // Recomputa a partir dos meses reais — não confia no flag armazenado (pode ser default true)
      const mesesFat = (data.meses || []) as { valor: string }[];
      const parseFatVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
      const fatZeradoReal = mesesFat.length > 0 && mesesFat.every(m => parseFatVal(m.valor) === 0);
      if (fatZeradoReal) issues.push("Faturamento zerado no periodo");
      break;
    case "scr":
      check(data.periodoReferencia, "Periodo de Referencia", true);
      check(data.totalDividasAtivas, "Total de Dividas");
      check(data.carteiraAVencer, "Carteira a Vencer");
      check(data.qtdeInstituicoes, "N de Instituicoes");
      break;
    default:
      total = 1; filled = data && Object.keys(data).length > 0 ? 1 : 0;
  }

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const score: QualityResult["score"] = issues.some(i => i.includes("nao encontrado") || i.includes("Nenhum")) ? "error" : pct >= 70 ? "good" : "warning";
  return { score, filledFields: Math.round(filled), totalFields: total, pct, issues };
}

export function podeAvancar(qm: Record<string, QualityResult>): { pode: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (qm.cnpj?.score === "error") motivos.push("Cartao CNPJ com dados criticos faltando");
  if (qm.faturamento?.score === "error") motivos.push("Faturamento sem dados de media mensal");
  const total = Object.keys(qm).length;
  const errs = Object.values(qm).filter(q => q.score === "error").length;
  if (total > 0 && errs === total) motivos.push("Nenhum documento foi extraido com sucesso");
  return { pode: motivos.length === 0, motivos };
}

export function getAvisos(qm: Record<string, QualityResult>): string[] {
  const labels: Record<string, string> = { cnpj: "Cartao CNPJ", qsa: "QSA", contrato: "Contrato Social", faturamento: "Faturamento", scr: "SCR" };
  return Object.entries(qm)
    .filter(([, q]) => q.score === "warning")
    .map(([type, q]) => `${labels[type] || type}: ${q.issues[0] || "dados incompletos"}`);
}

// ── Helper: accent color from quality score ───────────────────────────────────
export function qualityAccent(score: QualityResult["score"]): string {
  return score === "good" ? "#16a34a" : score === "warning" ? "#d97706" : "#dc2626";
}
