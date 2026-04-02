"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cf-bg p-6">
      <div className="card max-w-md w-full p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2 className="text-xl font-bold text-cf-text-1">Algo deu errado</h2>
        <p className="text-sm text-cf-text-3">Ocorreu um erro inesperado. Seus dados salvos automaticamente não foram perdidos.</p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={reset} className="btn-primary text-sm px-6">Tentar novamente</button>
          <button onClick={() => window.location.href = "/"} className="btn-secondary text-sm px-6">Voltar ao início</button>
        </div>
      </div>
    </div>
  );
}
