/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import Image from "next/image";

interface GoalfyButtonProps {
  data: any;
  aiAnalysis: any;
  settings: any;
  disabled?: boolean;
}

export default function GoalfyButton({ data, aiAnalysis, settings, disabled }: GoalfyButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleEnviar() {
    setStatus("loading");
    try {
      const res = await fetch("/api/goalfy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, aiAnalysis, settings }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus("success");
        setMessage(json.mock ? "Modo mock — configure GOALFY_WEBHOOK_URL para ativar" : "Enviado com sucesso!");
      } else {
        setStatus("error");
        setMessage(json.error || "Erro ao enviar");
      }
    } catch {
      setStatus("error");
      setMessage("Erro de conexão");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleEnviar}
        disabled={disabled || status === "loading" || status === "success"}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
          ${status === "success" ? "bg-green-100 text-green-700 cursor-default" :
            status === "error" ? "bg-red-100 text-red-700" :
            status === "loading" ? "bg-blue-50 text-blue-500 cursor-wait" :
            "bg-blue-600 text-white hover:bg-blue-700"}
        `}
      >
        {status === "loading" && <span className="animate-spin">⟳</span>}
        {status === "success" && "✅"}
        {status === "error" && "⚠️"}
        {status === "idle" && (
          <Image src="/logos/goalfy.svg" alt="Goalfy" width={52} height={18} className="object-contain" />
        )}
        {status === "loading" ? "Enviando para Goalfy..." :
         status === "success" ? "Enviado para Goalfy" :
         status === "error" ? "Tentar novamente" :
         "Enviar para Goalfy"}
      </button>
      {message && (
        <p className={`text-xs ${status === "success" ? "text-green-600" : "text-red-500"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
