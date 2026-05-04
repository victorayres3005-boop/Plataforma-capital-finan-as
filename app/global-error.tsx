"use client";

// global-error.tsx é o último fallback do App Router — usado quando o erro
// acontece dentro do layout raiz e o error.tsx normal não consegue renderizar.
// Precisa incluir <html> e <body>.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error.tsx]", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          fontFamily: "'Open Sans', system-ui, -apple-system, sans-serif",
          background: "#F5F7FB",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #E2E8F0",
            boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
            padding: 32,
            maxWidth: 480,
            width: "100%",
            textAlign: "center",
          }}
        >
          <svg
            width="160"
            height="22"
            viewBox="0 0 451 58"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Capital Finanças"
            style={{ display: "block", margin: "0 auto 24px" }}
          >
            <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
            <circle cx="31" cy="49" r="4.5" fill="#203b88" />
            <text
              x="66"
              y="46"
              fontFamily="'Open Sans', Arial, sans-serif"
              fontWeight="700"
              fontSize="38"
              letterSpacing="-0.3"
            >
              <tspan fill="#203b88">capital</tspan>
              <tspan fill="#73b815">finanças</tspan>
            </text>
          </svg>

          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>
            Erro crítico
          </h1>
          <p style={{ fontSize: 14, color: "#64748B", margin: "0 0 16px" }}>
            Ocorreu uma falha grave ao carregar a aplicação. Tente novamente em
            alguns instantes.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#94A3B8", fontFamily: "monospace", marginBottom: 16 }}>
              Código: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              background: "#203b88",
              color: "#fff",
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
