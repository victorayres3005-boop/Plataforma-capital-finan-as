"use client";

import { useEffect } from "react";
import Logo from "@/components/Logo";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // removeConsole: false em prod — log fica visível no Vercel.
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cf-bg p-6">
      <div className="card max-w-md w-full p-8 text-center space-y-4">
        <Logo height={22} className="mx-auto" />
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-cf-text-1">Algo deu errado</h2>
        <p className="text-sm text-cf-text-3">
          Ocorreu um erro inesperado. Seus dados salvos automaticamente não foram perdidos.
        </p>
        {error.digest && (
          <p className="text-xs text-cf-text-3 font-mono">Código: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center pt-2 flex-wrap">
          <button onClick={reset} className="btn-primary text-sm px-6">
            Tentar novamente
          </button>
          <button onClick={() => (window.location.href = "/")} className="btn-secondary text-sm px-6">
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  );
}
