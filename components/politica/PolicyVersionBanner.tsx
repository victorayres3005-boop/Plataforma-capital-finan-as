"use client";

import { AlertTriangle } from "lucide-react";

interface PolicyVersionBannerProps {
  version?: string;
  lastUpdated?: string;
  compact?: boolean;
}

export function PolicyVersionBanner({ version = "V2", lastUpdated, compact = false }: PolicyVersionBannerProps) {
  if (compact) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "#fffbeb", border: "1px solid #fbbf24",
        borderRadius: 6, padding: "3px 10px",
        fontSize: 11, fontWeight: 700, color: "#92400e",
      }}>
        <AlertTriangle size={11} />
        Política {version} — Em construção
      </span>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14,
      background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
      border: "1px solid #fbbf24",
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 20,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: "#fef3c7", border: "1px solid #fbbf24",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <AlertTriangle size={18} style={{ color: "#d97706" }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#92400e", margin: "0 0 4px" }}>
          Política de Crédito {version} — Em Construção
        </p>
        <p style={{ fontSize: 12, color: "#b45309", margin: 0, lineHeight: 1.6 }}>
          Esta política está na versão {version} e passará por alterações. Os parâmetros abaixo são
          configuráveis e serão refinados conforme aprendizados operacionais.
          {lastUpdated && (
            <span style={{ marginLeft: 6, fontWeight: 600 }}>
              Última atualização: {lastUpdated}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
