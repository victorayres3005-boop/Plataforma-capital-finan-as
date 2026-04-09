/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";

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
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/goalfy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, aiAnalysis, settings }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus("success");
        setMessage(json.mock ? "Webhook não configurado" : "Enviado!");
      } else {
        setStatus("error");
        setMessage(json.error || "Erro ao enviar");
      }
    } catch {
      setStatus("error");
      setMessage("Erro de conexão");
    }
  }

  const icon =
    status === "loading" ? <Loader2 size={13} className="animate-spin" /> :
    status === "success" ? <CheckCircle2 size={13} /> :
    status === "error"   ? <AlertCircle size={13} /> :
                           <Send size={13} />;

  const label =
    status === "loading" ? "Enviando..." :
    status === "success" ? (message || "Enviado!") :
    status === "error"   ? "Tentar novamente" :
                           "Enviar ao Goalfy";

  const cls =
    status === "success" ? "text-green-600 border-green-200 hover:bg-green-50" :
    status === "error"   ? "text-red-500 border-red-200 hover:bg-red-50" :
                           "text-cf-text-2 border-cf-border hover:bg-cf-bg hover:text-cf-navy";

  return (
    <button
      onClick={handleEnviar}
      disabled={disabled || status === "loading" || status === "success"}
      title={status === "success" && message ? message : undefined}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-default ${cls}`}
      style={{ minHeight: "auto" }}
    >
      {icon}
      {label}
    </button>
  );
}
