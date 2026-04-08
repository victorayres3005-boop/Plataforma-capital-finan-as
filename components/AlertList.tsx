import React from "react";

export type AlertSeverity = "ALTA" | "MODERADA" | "INFO";

export interface Alert {
  message: string;
  severity: AlertSeverity;
  impacto?: string;
}

const config: Record<AlertSeverity, {
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  badgeLabel: string;
  border: string;
  icon: React.ReactNode;
}> = {
  ALTA: {
    iconBg: "#FEF0F0",
    badgeBg: "#FEE2E2",
    badgeText: "#A32D2D",
    badgeLabel: "ALTA",
    border: "#FECACA",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L16.5 15H1.5L9 2Z" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 7.5V10.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="12.75" r="0.75" fill="#DC2626" />
      </svg>
    ),
  },
  MODERADA: {
    iconBg: "#FFFBEB",
    badgeBg: "#FEF3C7",
    badgeText: "#854F0B",
    badgeLabel: "MODERADO",
    border: "#FDE68A",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="#D97706" strokeWidth="1.5" />
        <path d="M9 5.5V9.5" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="12" r="0.75" fill="#D97706" />
      </svg>
    ),
  },
  INFO: {
    iconBg: "#EFF6FF",
    badgeBg: "#DBEAFE",
    badgeText: "#185FA5",
    badgeLabel: "INFO",
    border: "#BFDBFE",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="#2563EB" strokeWidth="1.5" />
        <path d="M9 8V13" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="5.75" r="0.75" fill="#2563EB" />
      </svg>
    ),
  },
};

interface AlertListProps {
  alerts: Alert[];
  className?: string;
}

export default function AlertList({ alerts, className = "" }: AlertListProps) {
  if (!alerts.length) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {alerts.map((alert, i) => {
        const c = config[alert.severity] ?? config.INFO;
        return (
          <div
            key={i}
            style={{ border: `0.5px solid ${c.border}`, background: "#ffffff" }}
            className="flex items-start gap-3 rounded-lg px-3 py-2.5"
          >
            {/* Ícone */}
            <div
              style={{ background: c.iconBg, minWidth: 32, minHeight: 32 }}
              className="flex items-center justify-center rounded-md flex-shrink-0"
            >
              {c.icon}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {/* Badge */}
                <span
                  style={{ background: c.badgeBg, color: c.badgeText }}
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none"
                >
                  {c.badgeLabel}
                </span>
              </div>
              <p className="text-[12px] font-medium text-[#111827] leading-snug">
                {alert.message}
              </p>
              {alert.impacto && (
                <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">
                  {alert.impacto}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
