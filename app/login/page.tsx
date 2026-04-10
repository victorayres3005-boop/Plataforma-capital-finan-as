"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Lock, ArrowRight, UserPlus, Shield, BarChart3, FileText, CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

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

// ── Error mapping ──
const errorMap: Record<string, string> = {
  "invalid login credentials": "Email ou senha incorretos.",
  "email not confirmed": "Confirme seu email antes de entrar. Verifique sua caixa de entrada.",
  "user already registered": "Este email já está cadastrado. Tente fazer login.",
  "password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres.",
  "unable to validate email address: invalid format": "Formato de email inválido.",
  "email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos.",
  "invalid email or password": "Email ou senha incorretos.",
  "user not found": "Email ou senha incorretos.",
  "signup_disabled": "Cadastro temporariamente desabilitado.",
  "email_address_not_authorized": "Este email não está autorizado.",
};

function mapAuthError(error: Error): string {
  const msg = (error.message || "").toLowerCase();
  for (const [key, value] of Object.entries(errorMap)) {
    if (msg.includes(key)) return value;
  }
  return "Ocorreu um erro. Tente novamente.";
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function withMinDelay(fn: () => Promise<void>, setLoading: (v: boolean) => void) {
  setLoading(true);
  const [result] = await Promise.allSettled([fn(), new Promise(r => setTimeout(r, 500))]);
  setLoading(false);
  if (result.status === "rejected") throw result.reason;
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-cf-bg"><Loader2 size={24} className="animate-spin text-cf-navy" /></div>}><LoginContent /></Suspense>;
}

function LoginContent() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loadingSignup, setLoadingSignup] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmMessage = searchParams.get("message");

  const validateEmail = (): boolean => {
    if (!email.trim()) { toast.error("Digite seu email."); return false; }
    if (!EMAIL_REGEX.test(email)) { toast.error("Formato de email inválido."); return false; }
    return true;
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail()) return;
    await withMinDelay(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=/perfil` });
      if (error) { toast.error("Erro ao enviar email. Tente novamente."); return; }
      // Mensagem genérica — nunca confirma se o email existe
      toast.success("Se este email estiver cadastrado, você receberá as instruções em breve.");
      setMode("login");
    }, setLoadingReset);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "reset") { handleReset(e); return; }
    if (!validateEmail()) return;

    if (mode === "login") {
      if (!password) { toast.error("Digite sua senha."); return; }
      try {
        await withMinDelay(async () => {
          const supabase = createClient();
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          toast.success("Login realizado!");
          router.push("/");
        }, setLoadingLogin);
      } catch (err) {
        toast.error(mapAuthError(err instanceof Error ? err : new Error(String(err))));
      }
    } else {
      if (!name.trim()) { toast.error("Digite seu nome."); return; }
      if (password.length < 6) { toast.error("A senha deve ter no mínimo 6 caracteres."); return; }
      try {
        await withMinDelay(async () => {
          const supabase = createClient();
          const { error } = await supabase.auth.signUp({
            email, password,
            options: {
              data: { full_name: name },
              emailRedirectTo: `${window.location.origin}/auth/confirm`,
            },
          });
          if (error) throw error;
          toast.success("Conta criada! Verifique seu email para confirmar.");
          setMode("login");
        }, setLoadingSignup);
      } catch (err) {
        toast.error(mapAuthError(err instanceof Error ? err : new Error(String(err))));
      }
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

            {/* Confirmation banner */}
            {confirmMessage && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                <p className="text-sm font-medium text-green-700">{confirmMessage}</p>
              </div>
            )}

            {/* Header */}
            <div>
              <h2 className="text-2xl font-bold text-cf-text-1">
                {mode === "login" ? "Bem-vindo de volta" : mode === "signup" ? "Crie sua conta" : "Recuperar senha"}
              </h2>
              <p className="text-sm text-cf-text-3 mt-1.5">
                {mode === "login" ? "Acesse a plataforma com suas credenciais"
                  : mode === "signup" ? "Preencha os dados abaixo para começar"
                  : "Digite seu e-mail para receber o link de recuperação"}
              </p>
            </div>

            {/* Tabs */}
            {mode !== "reset" && (
              <div className="flex bg-cf-surface rounded-xl p-1 border border-cf-border">
                {(["login", "signup"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mode === m ? "bg-white text-cf-navy shadow-sm" : "text-cf-text-3 hover:text-cf-text-1"}`}>
                    {m === "login" ? "Entrar" : "Cadastrar"}
                  </button>
                ))}
              </div>
            )}

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

              {mode !== "reset" && (
              <div>
                <label className="text-xs font-semibold text-cf-text-2 block mb-1.5">Senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cf-text-4" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Mínimo 6 caracteres" : "Sua senha"}
                    className="input-field pl-10 h-11" autoComplete={mode === "login" ? "current-password" : "new-password"} />
                </div>
              </div>
              )}

              <button type="submit" disabled={loadingLogin || loadingSignup || loadingReset} className="btn-primary w-full h-11 text-sm">
                {mode === "login" && loadingLogin ? <Loader2 size={17} className="animate-spin" />
                  : mode === "signup" && loadingSignup ? <Loader2 size={17} className="animate-spin" />
                  : mode === "reset" && loadingReset ? <Loader2 size={17} className="animate-spin" />
                  : mode === "login" ? <><ArrowRight size={17} /> Entrar na plataforma</>
                  : mode === "reset" ? <><ArrowRight size={17} /> Enviar email de recuperacao</>
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
            <div className="text-center space-y-2">
              {mode === "login" ? (
                <>
                  <p className="text-sm text-cf-text-3">
                    Ainda não tem conta?{" "}
                    <button onClick={() => setMode("signup")} className="text-cf-navy font-semibold hover:underline">
                      Cadastre-se grátis
                    </button>
                  </p>
                  <p>
                    <button onClick={() => setMode("reset")} className="text-xs text-cf-text-4 hover:text-cf-navy hover:underline transition-colors">
                      Esqueci minha senha
                    </button>
                  </p>
                </>
              ) : (
                <p className="text-sm text-cf-text-3">
                  {mode === "reset" ? "Lembrou a senha?" : "Já possui uma conta?"}{" "}
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
