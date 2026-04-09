"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

export const SUSPICIOUS_VALUES = new Set(["N/D", "n/d", "ND", "nd", "N/A", "n/a", "—", "-", "null", "undefined", "NaN"]);

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({ label, value, onChange, multiline = false, span2 = false }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; span2?: boolean;
}) {
  const isEmpty = !value || value === "" || value === "0" || value === "0,00";
  const isSuspicious = !isEmpty && SUSPICIOUS_VALUES.has(value.trim());
  const inputCls = isSuspicious
    ? "input-field border-orange-300 bg-orange-50/40"
    : isEmpty
    ? "input-field border-amber-200 bg-amber-50/30"
    : "input-field";
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <label className="section-label flex items-center gap-1.5 mb-1.5">
        {label}
        {isSuspicious && (
          <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full leading-none">⚠ verificar</span>
        )}
      </label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={4} className={`${inputCls} resize-none`} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
      }
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
    good:    { bg: "bg-green-50", border: "border-green-200", text: "text-green-700",  icon: "✓", label: "Boa qualidade" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700",  icon: "⚠", label: "Revisar campos" },
    error:   { bg: "bg-red-50",   border: "border-red-200",   text: "text-red-700",    icon: "✕", label: "Dados incompletos" },
  };
  const c = cfg[quality.score];
  return (
    <div className={`${c.bg} ${c.border} border rounded-lg p-3 mt-2`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[11px] font-semibold ${c.text} flex items-center gap-1`}>
          <span>{c.icon}</span> {c.label} — {quality.pct}% extraido
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
        <div className={`h-1.5 rounded-full transition-all ${quality.score === "good" ? "bg-green-500" : quality.score === "warning" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${quality.pct}%` }} />
      </div>
      {quality.issues.length > 0 && (
        <ul className="space-y-0.5">
          {quality.issues.map((issue, i) => (
            <li key={i} className={`text-[10px] ${c.text} opacity-80 flex items-start gap-1`}>
              <span className="mt-0.5 flex-shrink-0">→</span>{issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────
export function SectionCard({
  number, icon, title, iconColor, children, expanded, onToggle, badge
}: {
  number: string; icon: React.ReactNode; title: string; iconColor: string;
  children: React.ReactNode; expanded: boolean; onToggle: () => void; badge?: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cf-bg transition-colors text-left">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-cf-text-3 uppercase tracking-widest">Seção {number}</span>
            {badge}
          </div>
          <p className="text-sm font-semibold text-cf-text-1 leading-tight">{title}</p>
        </div>
        {expanded ? <ChevronUp size={15} className="text-cf-text-3 flex-shrink-0" /> : <ChevronDown size={15} className="text-cf-text-3 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-cf-border px-5 pb-5 pt-4 animate-fade-in">
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
      if (data.faturamentoZerado) issues.push("Faturamento zerado no periodo");
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
