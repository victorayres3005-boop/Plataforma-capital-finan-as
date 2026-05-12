"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  healthy: boolean;
  summary: { ok: number; missing: number; errored: number; total: number };
  missing: Array<{ migration: string; column: string; feature: string }>;
  errored: Array<{ column: string; error: string }>;
  checked_at: string;
};

export default function SchemaHealthBanner() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/health/schema", { cache: "no-store" })
      .then(r => r.json())
      .then((d: HealthResponse) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data || data.healthy) return null;

  const isCritical = data.missing.length > 0;
  const bg = isCritical ? "#fef2f2" : "#fffbeb";
  const border = isCritical ? "#fecaca" : "#fde68a";
  const fg = isCritical ? "#991b1b" : "#92400e";

  return (
    <div style={{
      padding: "12px 16px",
      background: bg,
      borderBottom: `1px solid ${border}`,
      color: fg,
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 13,
    }}>
      <strong>⚠ Schema do banco fora de sincronia.</strong>{" "}
      {data.missing.length > 0 && (
        <>
          {data.missing.length} coluna{data.missing.length !== 1 ? "s" : ""} ausente{data.missing.length !== 1 ? "s" : ""}:{" "}
          {data.missing.map(m => (
            <span key={m.column} style={{ marginRight: 12 }}>
              <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{m.column}</code>
              <span style={{ fontSize: 11, opacity: 0.75 }}> (mig {m.migration} · {m.feature})</span>
            </span>
          ))}
        </>
      )}
      {data.errored.length > 0 && (
        <span style={{ marginLeft: 8 }}>
          ({data.errored.length} erro{data.errored.length !== 1 ? "s" : ""} de leitura)
        </span>
      )}
      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.75 }}>
        Rode a migration correspondente em <code>supabase/migrations/</code> via SQL Editor do Supabase.
        Verificado em {new Date(data.checked_at).toLocaleString("pt-BR")}.
      </div>
    </div>
  );
}
