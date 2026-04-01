"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Lock, ArrowRight, UserPlus, Shield, BarChart3, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const w = size === "lg" ? 260 : 180;
  const h = size === "lg" ? 36 : 24;
  return (
    <svg width={w} height={h} viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke="#ffffff" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#ffffff" />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.5">
        <tspan fill="#ffffff">capital</tspan>
        <tspan fill="#a8d96b">finanças</tspan>
      </text>
    </svg>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Preencha todos os campos"); return; }
    if (mode === "signup" && password.length < 6) { toast.error("A senha deve ter no mínimo 6 caracteres"); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado!");
        router.push("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
        setMode("login");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      if (msg.includes("Invalid login")) toast.error("E-mail ou senha incorretos");
      else if (msg.includes("already registered")) toast.error("E-mail já cadastrado");
      else toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Lado esquerdo: branding ── */}
      <div className="hidden lg:flex lg:w-[55%] bg-hero-gradient relative overflow-hidden flex-col justify-between p-12">
        {/* Dot pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        {/* Círculos decorativos */}
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full border border-white/[0.06]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full border border-white/[0.06]" />
        <div className="absolute top-1/2 right-12 w-40 h-40 rounded-full border border-white/[0.04]" />

        {/* Top: Logo */}
        <div className="relative">
          <Logo size="lg" />
        </div>

        {/* Center: value proposition */}
        <div className="relative space-y-8 max-w-md">
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight">
              Consolidador de<br />Documentos
            </h1>
            <div className="w-16 h-1 bg-cf-green rounded-full mt-4" />
          </div>

          <p className="text-blue-200 text-base leading-relaxed">
            Envie seus documentos, extraia dados automaticamente e gere relatórios consolidados profissionais em minutos.
          </p>

          <div className="space-y-4">
            {[
              { icon: <FileText size={18} />, title: "Upload Inteligente", desc: "PDF, Word e imagens com OCR automático" },
              { icon: <BarChart3 size={18} />, title: "Extração Automática", desc: "CNPJ, Contrato Social e SCR/Bacen" },
              { icon: <Shield size={18} />, title: "Relatórios Profissionais", desc: "PDF, Word e Excel com identidade visual" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 text-cf-green-light">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-blue-300/70">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: footer */}
        <div className="relative flex items-center justify-between">
          <p className="text-xs text-white/25">&copy; {new Date().getFullYear()} Capital Finanças</p>
          <p className="text-xs text-white/20">Documentos processados com segurança</p>
        </div>
      </div>

      {/* ── Lado direito: formulário ── */}
      <div className="flex-1 flex flex-col bg-cf-bg">

        {/* Mobile header (só aparece em telas pequenas) */}
        <div className="lg:hidden bg-hero-gradient px-6 py-8 text-center">
          <div className="flex justify-center mb-3">
            <Logo size="sm" />
          </div>
          <p className="text-blue-200 text-xs">Consolidador de Documentos</p>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm space-y-6">

            {/* Header */}
            <div>
              <h2 className="text-2xl font-bold text-cf-text-1">
                {mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
              </h2>
              <p className="text-sm text-cf-text-3 mt-1.5">
                {mode === "login"
                  ? "Acesse a plataforma com suas credenciais"
                  : "Preencha os dados abaixo para começar"}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex bg-cf-surface rounded-xl p-1 border border-cf-border">
              {(["login", "signup"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mode === m ? "bg-white text-cf-navy shadow-sm" : "text-cf-text-3 hover:text-cf-text-1"}`}>
                  {m === "login" ? "Entrar" : "Cadastrar"}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="text-xs font-semibold text-cf-text-2 block mb-1.5">Nome completo</label>
                  <div className="relative">
                    <UserPlus size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cf-text-4" />
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="Seu nome" className="input-field pl-10 h-11" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-cf-text-2 block mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cf-text-4" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com" className="input-field pl-10 h-11" autoComplete="email" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-cf-text-2 block mb-1.5">Senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cf-text-4" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Mínimo 6 caracteres" : "Sua senha"}
                    className="input-field pl-10 h-11" autoComplete={mode === "login" ? "current-password" : "new-password"} />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full h-11 text-sm">
                {loading ? <Loader2 size={17} className="animate-spin" />
                  : mode === "login" ? <><ArrowRight size={17} /> Entrar na plataforma</>
                  : <><UserPlus size={17} /> Criar minha conta</>}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-cf-border" />
              <span className="text-[10px] text-cf-text-4 uppercase tracking-widest">ou</span>
              <div className="flex-1 h-px bg-cf-border" />
            </div>

            {/* Switch mode */}
            <div className="text-center">
              {mode === "login" ? (
                <p className="text-sm text-cf-text-3">
                  Ainda não tem conta?{" "}
                  <button onClick={() => setMode("signup")} className="text-cf-navy font-semibold hover:underline">
                    Cadastre-se grátis
                  </button>
                </p>
              ) : (
                <p className="text-sm text-cf-text-3">
                  Já possui uma conta?{" "}
                  <button onClick={() => setMode("login")} className="text-cf-navy font-semibold hover:underline">
                    Fazer login
                  </button>
                </p>
              )}
            </div>

            {/* Footer info */}
            <div className="pt-4 border-t border-cf-border">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-cf-text-4">
                <Shield size={11} />
                <span>Seus dados estão protegidos com criptografia</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom copyright (mobile) */}
        <div className="lg:hidden text-center pb-6">
          <p className="text-xs text-cf-text-4">&copy; {new Date().getFullYear()} Capital Finanças</p>
        </div>
      </div>
    </div>
  );
}
