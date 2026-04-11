"use client";
import React from "react";
import { Check, X, AlertTriangle } from "lucide-react";

// ── Badge variants ──────────────────────────────────────────────────────────
type BadgeVariant = "navy" | "teal" | "blue" | "amber" | "red";
const BADGE_BG: Record<BadgeVariant, string> = {
  navy:  "#132952",
  teal:  "#0891b2",
  blue:  "#3b82f6",
  amber: "#d4940a",
  red:   "#c53030",
};

// ── SectionCard ─────────────────────────────────────────────────────────────
export interface SectionCardProps {
  id?: string;
  badge: string;
  badgeVariant?: BadgeVariant;
  sectionLabel: string;
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({
  id, badge, badgeVariant = "navy", sectionLabel, title, headerRight, children, className = "",
}: SectionCardProps) {
  return (
    <div
      id={id}
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between px-8 py-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: BADGE_BG[badgeVariant] }}
          >
            <span className="text-[15px] font-bold text-white tracking-wide">{badge}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.08em] mb-0.5">
              {sectionLabel}
            </p>
            <p className="text-xl font-bold text-navy-900 leading-tight">{title}</p>
          </div>
        </div>
        {headerRight && (
          <div className="flex items-center gap-2.5 flex-shrink-0">{headerRight}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── KpiCard ─────────────────────────────────────────────────────────────────
type KpiVariant = "default" | "danger" | "warning" | "success";

const KPI_STYLES: Record<KpiVariant, { bg: string; border: string; valueColor: string }> = {
  default: { bg: "bg-white",       border: "border-gray-200",    valueColor: "text-navy-900" },
  danger:  { bg: "bg-red-50",      border: "border-red-100",     valueColor: "text-red-600" },
  warning: { bg: "bg-amber-50",    border: "border-amber-100",   valueColor: "text-amber-500" },
  success: { bg: "bg-green-50",    border: "border-green-100",   valueColor: "text-green-600" },
};

export interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  variant?: KpiVariant;
}

export function KpiCard({ label, value, sub, variant = "default" }: KpiCardProps) {
  const s = KPI_STYLES[variant];
  const isMoney = /^R\$|^\d/.test(value);
  return (
    <div className={`${s.bg} ${s.border} border rounded-2xl p-6`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.08em] mb-3">
        {label}
      </p>
      <p className={`text-2xl font-bold leading-tight ${s.valueColor} ${isMoney ? "font-mono" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-[13px] text-gray-500 mt-2.5">{sub}</p>}
    </div>
  );
}

// ── StatusPill ──────────────────────────────────────────────────────────────
type PillVariant = "red" | "yellow" | "green" | "gray";

const PILL_STYLES: Record<PillVariant, { bg: string; text: string; border: string; dot: string }> = {
  red:    { bg: "bg-red-50",    text: "text-red-600",    border: "border-red-100",    dot: "bg-red-600" },
  yellow: { bg: "bg-amber-50",  text: "text-amber-500",  border: "border-amber-100",  dot: "bg-amber-500" },
  green:  { bg: "bg-green-50",  text: "text-green-600",  border: "border-green-100",  dot: "bg-green-600" },
  gray:   { bg: "bg-gray-100",  text: "text-gray-500",   border: "border-gray-200",   dot: "bg-gray-400" },
};

export interface StatusPillProps {
  label: string;
  variant: PillVariant;
  dot?: boolean;
}

export function StatusPill({ label, variant, dot = false }: StatusPillProps) {
  const s = PILL_STYLES[variant];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium border whitespace-nowrap ${s.bg} ${s.text} ${s.border}`}>
      {dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />}
      {label}
    </span>
  );
}

// ── CriteriaItem ────────────────────────────────────────────────────────────
type CriterionStatus = "ok" | "warning" | "error" | "unknown";

export interface CriteriaItemProps {
  status: CriterionStatus;
  name: string;
  eliminatorio?: boolean;
  limit: string;
  value: string;
  detail?: string;
}

export function CriteriaItem({ status, name, eliminatorio, limit, value, detail }: CriteriaItemProps) {
  const isOk      = status === "ok";
  const isWarn    = status === "warning";
  const isError   = status === "error";

  const iconClasses = isOk
    ? "bg-green-50 border-green-200 text-green-600"
    : isWarn
    ? "bg-amber-50 border-amber-200 text-amber-500"
    : isError
    ? "bg-red-50 border-red-200 text-red-600"
    : "bg-gray-100 border-gray-200 text-gray-400";

  const valueColor = isOk ? "text-green-600" : isWarn ? "text-amber-500" : isError ? "text-red-600" : "text-gray-400";
  const rowBg = isError ? "bg-red-50/50" : isWarn ? "bg-amber-50/30" : "";

  return (
    <div className={`grid grid-cols-[32px_1.2fr_1fr_1fr] items-center gap-4 px-6 py-4 ${rowBg}`}>
      <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 ${iconClasses}`}>
        {isOk      && <Check size={14} />}
        {isWarn    && <span className="text-sm font-bold">!</span>}
        {isError   && <X size={14} />}
        {status === "unknown" && <span className="text-sm">?</span>}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-0.5">{name}</p>
        {eliminatorio && isError && (
          <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-100 px-2 py-0.5 rounded">
            ELIMINATÓRIO
          </span>
        )}
        {detail && !isError && (
          <p className="text-[11px] text-gray-400 mt-0.5">{detail}</p>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] mb-1">Limite do Fundo</p>
        <p className="text-sm font-medium text-gray-700">{limit}</p>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] mb-1">Apurado</p>
        <p className={`text-sm font-semibold ${valueColor}`}>{value}</p>
        {detail && isError && (
          <p className={`text-[11px] mt-0.5 ${valueColor} opacity-80`}>{detail}</p>
        )}
      </div>
    </div>
  );
}

// ── MetricBarChart ───────────────────────────────────────────────────────────
export interface MetricBarItem {
  label: string;
  count: number;
  pct: number;
  highlight?: boolean;
}

export function MetricBarChart({ items }: { items: MetricBarItem[] }) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="text-[13px] font-medium text-gray-700 w-48 flex-shrink-0 truncate">
            {item.label}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-[6px]">
            <div
              className={`h-[6px] rounded-full transition-all duration-400 ${
                item.highlight ? "bg-red-600" : "bg-navy-800"
              }`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="text-[13px] font-semibold text-gray-700 w-8 text-right flex-shrink-0">
            {item.count}
          </span>
          <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">
            {item.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── ScrTable ────────────────────────────────────────────────────────────────
export interface ScrTableProps {
  columns: string[];
  rows: (string | React.ReactNode)[][];
}

export function ScrTable({ columns, rows }: ScrTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-navy-900">
            {columns.map((col, i) => (
              <th
                key={i}
                className="text-[11px] font-semibold text-white uppercase tracking-[0.06em] text-left px-4 py-3"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={`${ri % 2 === 1 ? "bg-gray-50/70" : "bg-white"} hover:bg-gray-50 transition-colors`}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`text-[13px] text-gray-900 px-4 py-3 ${
                    ri < rows.length - 1 ? "border-b border-gray-100" : ""
                  } ${ci > 0 ? "font-mono" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── AlertBanner ──────────────────────────────────────────────────────────────
export interface AlertBannerProps {
  variant: "danger" | "warn";
  label: string;
  message: string;
}

export function AlertBanner({ variant, label, message }: AlertBannerProps) {
  const isDanger = variant === "danger";
  return (
    <div className={`flex items-start gap-3.5 px-6 py-5 rounded-xl border ${
      isDanger ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
    }`}>
      <AlertTriangle size={18} className={`flex-shrink-0 mt-0.5 ${isDanger ? "text-red-600" : "text-amber-500"}`} />
      <div className="flex gap-2 flex-wrap items-baseline">
        <span className={`text-sm font-bold ${isDanger ? "text-red-600" : "text-amber-500"}`}>{label}</span>
        <span className={`text-sm ${isDanger ? "text-red-900" : "text-amber-900"}`}>{message}</span>
      </div>
    </div>
  );
}

// ── ResultadoBox ────────────────────────────────────────────────────────────
type ResultadoVariant = "aprovado" | "reprovado" | "pendente";

const RESULTADO_STYLES: Record<ResultadoVariant, { container: string; text: string; badge: string }> = {
  aprovado:  { container: "bg-green-50 border-green-100", text: "text-green-600", badge: "bg-green-600" },
  reprovado: { container: "bg-red-50 border-red-100",     text: "text-red-600",   badge: "bg-red-600" },
  pendente:  { container: "bg-amber-50 border-amber-100", text: "text-amber-500", badge: "bg-amber-500" },
};

export interface ResultadoBoxProps {
  title: string;
  sub: string;
  badge: string;
  variant: ResultadoVariant;
}

export function ResultadoBox({ title, sub, badge, variant }: ResultadoBoxProps) {
  const s = RESULTADO_STYLES[variant];
  return (
    <div className={`flex items-center justify-between gap-4 px-6 py-5 rounded-xl border ${s.container}`}>
      <div>
        <p className={`text-base font-semibold ${s.text} mb-1`}>{title}</p>
        <p className={`text-sm ${s.text} opacity-75`}>{sub}</p>
      </div>
      <span className={`text-sm font-bold text-white rounded-md px-4 py-2 whitespace-nowrap flex-shrink-0 uppercase tracking-wide ${s.badge}`}>
        {badge}
      </span>
    </div>
  );
}
