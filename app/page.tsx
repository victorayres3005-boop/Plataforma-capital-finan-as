"use client";

import { useState } from "react";
import UploadStep from "@/components/UploadStep";
import ReviewStep from "@/components/ReviewStep";
import GenerateStep from "@/components/GenerateStep";
import { useAuth } from "@/lib/useAuth";
import { AppStep, ExtractedData } from "@/types";
import { LogOut, User } from "lucide-react";

const defaultData: ExtractedData = {
  cnpj: { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" },
  contrato: { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" },
  scr: { totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",prejuizo:"",coobrigacoes:"",classificacaoRisco:"",modalidadesCredito:"",instituicoesCredoras:"",concentracaoCredito:"",historicoInadimplencia:"" },
  resumoRisco: "",
};

function Logo({ light = false }: { light?: boolean }) {
  const textColor = light ? "#ffffff" : "#203b88";
  return (
    <svg width="196" height="27" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke={textColor} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={textColor} />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.5">
        <tspan fill={textColor}>capital</tspan>
        <tspan fill="#a8d96b">finanças</tspan>
      </text>
    </svg>
  );
}

const stepLabels: Record<AppStep, string> = {
  upload: "Envio de Documentos",
  review: "Revisão dos Dados",
  generate: "Gerar Relatório",
};

export default function HomePage() {
  const [step, setStep] = useState<AppStep>("upload");
  const [extractedData, setExtractedData] = useState<ExtractedData>(defaultData);
  const { user, loading: authLoading, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-cf-bg flex flex-col">

      {/* ── Navbar ── */}
      <header className="bg-white border-b border-cf-border sticky top-0 z-50" style={{ boxShadow: "0 1px 3px rgba(32,59,136,0.06)" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 grid grid-cols-3 items-center">
          <Logo light={false} />
          <div className="hidden sm:flex justify-center">
            <span className="text-sm font-semibold text-cf-navy">Consolidador de Documentos</span>
          </div>
          <div className="flex justify-end gap-3 items-center">
            <a href="/historico" className="text-xs font-semibold text-cf-navy hover:text-cf-green transition-colors hidden sm:block">Histórico</a>
            {!authLoading && user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-cf-text-2">
                  <User size={13} />
                  <span className="font-medium truncate max-w-[120px]">{user.user_metadata?.full_name || user.email?.split("@")[0]}</span>
                </div>
                <button onClick={signOut} className="flex items-center gap-1 text-xs font-semibold text-cf-text-3 hover:text-cf-danger border border-cf-border rounded-full px-2.5 py-1.5 transition-colors">
                  <LogOut size={12} /> Sair
                </button>
              </div>
            ) : !authLoading && !user ? (
              <a href="/login" className="flex items-center gap-1.5 bg-cf-navy text-white text-xs font-semibold rounded-full px-3 py-1.5 hover:bg-cf-navy-dark transition-colors">
                <User size={12} /> Entrar
              </a>
            ) : (
              <div className="flex items-center gap-1.5 bg-cf-green/10 border border-cf-green/25 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cf-green inline-block animate-pulse" />
                <span className="text-xs font-semibold text-cf-green tracking-wide">Online</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="bg-hero-gradient relative overflow-hidden">
        {/* subtle dot pattern */}
        <div className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Consolidador de Documentos
            </h1>
            <p className="text-blue-200 mt-3 text-base max-w-lg mx-auto leading-relaxed">
              Envie seus documentos, extraia os dados automaticamente e gere relatórios consolidados em minutos.
            </p>
          </div>

          {/* Step indicator inside hero */}
          <div className="mt-8 max-w-md mx-auto">
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-2xl border border-white/15 px-6 py-4">
              {(["upload","review","generate"] as AppStep[]).map((s, i) => {
                const idx = ["upload","review","generate"].indexOf(step);
                const done = i < idx;
                const active = s === step;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                      ${done ? "bg-cf-green border-cf-green text-white" : active ? "bg-white border-white text-cf-navy" : "border-white/30 text-white/40"}`}>
                      {done ? "✓" : i + 1}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block transition-all
                      ${active ? "text-white" : done ? "text-cf-green-light" : "text-white/40"}`}>
                      {stepLabels[s]}
                    </span>
                    {i < 2 && <div className="w-8 h-px bg-white/20 mx-1 hidden sm:block" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Wave bottom */}
        <div className="relative h-10 -mb-px">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,20 C240,40 480,0 720,20 C960,40 1200,0 1440,20 L1440,40 L0,40 Z" fill="#f5f7fb" />
          </svg>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-8 py-8">
        <div className="max-w-2xl mx-auto">

          {/* Step header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cf-navy flex items-center justify-center text-white text-sm font-bold">
              {step === "upload" ? "1" : step === "review" ? "2" : "3"}
            </div>
            <div>
              <h2 className="text-lg font-bold text-cf-text-1">{stepLabels[step]}</h2>
              <p className="text-xs text-cf-text-3">
                {step === "upload" && "Envie os documentos para iniciar a extração automática"}
                {step === "review" && "Revise os campos extraídos e corrija se necessário"}
                {step === "generate" && "Adicione o parecer e escolha o formato do relatório"}
              </p>
            </div>
          </div>

          {step === "upload" && (
            <UploadStep onComplete={(d) => { setExtractedData(d); setStep("review"); }} />
          )}
          {step === "review" && (
            <ReviewStep data={extractedData} onComplete={(d) => { setExtractedData(d); setStep("generate"); }} onBack={() => setStep("upload")} />
          )}
          {step === "generate" && (
            <GenerateStep data={extractedData} onBack={() => setStep("review")} />
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-cf-dark mt-12">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo light={true} />
          <div className="text-center sm:text-right">
            <p className="text-xs text-white/40">© {new Date().getFullYear()} Capital Finanças. Todos os direitos reservados.</p>
            <p className="text-xs text-white/25 mt-0.5">Documentos processados localmente com segurança</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
