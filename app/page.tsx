"use client";

import { useState, useEffect } from "react";
import UploadStep, { OriginalFiles } from "@/components/UploadStep";
import ReviewStep from "@/components/ReviewStep";
import GenerateStep from "@/components/GenerateStep";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { AppStep, ExtractedData, DocumentCollection } from "@/types";
import { LogOut, User, Menu, X, Clock, Shield, Plus, FileText, Building2, BarChart3, ArrowRight, ArrowLeft, Calendar, Home, Bell } from "lucide-react";

const defaultData: ExtractedData = {
  cnpj: { razaoSocial:"",nomeFantasia:"",cnpj:"",dataAbertura:"",situacaoCadastral:"",dataSituacaoCadastral:"",motivoSituacao:"",naturezaJuridica:"",cnaePrincipal:"",cnaeSecundarios:"",porte:"",capitalSocialCNPJ:"",endereco:"",telefone:"",email:"" },
  qsa: { capitalSocial:"", quadroSocietario:[{nome:"",cpfCnpj:"",qualificacao:"",participacao:""}] },
  contrato: { socios:[{nome:"",cpf:"",participacao:"",qualificacao:""}],capitalSocial:"",objetoSocial:"",dataConstituicao:"",temAlteracoes:false,prazoDuracao:"",administracao:"",foro:"" },
  faturamento: { meses:[],somatoriaAno:"0,00",mediaAno:"0,00",faturamentoZerado:true,dadosAtualizados:false,ultimoMesComDados:"" },
  scr: { periodoReferencia:"",carteiraAVencer:"",vencidos:"",prejuizos:"",limiteCredito:"",qtdeInstituicoes:"",qtdeOperacoes:"",totalDividasAtivas:"",operacoesAVencer:"",operacoesEmAtraso:"",operacoesVencidas:"",tempoAtraso:"",coobrigacoes:"",classificacaoRisco:"",carteiraCurtoPrazo:"",carteiraLongoPrazo:"",modalidades:[],instituicoes:[],valoresMoedaEstrangeira:"",historicoInadimplencia:"" },
  scrAnterior: null,
  resumoRisco: "",
};

function Logo({ light = false, height = 27 }: { light?: boolean; height?: number }) {
  const blue = light ? "#ffffff" : "#203b88";
  const green = light ? "#a8d96b" : "#73b815";
  const w = Math.round(height * 7.26);
  return (
    <svg width={w} height={height} viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke={blue} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={blue} />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill={blue}>capital</tspan>
        <tspan fill={green}>finanças</tspan>
      </text>
    </svg>
  );
}

const stepLabels: Record<AppStep, string> = {
  upload: "Envio de Documentos",
  review: "Revisão dos Dados",
  generate: "Gerar Relatório",
};

const stepDescriptions: Record<AppStep, string> = {
  upload: "Envie os documentos para iniciar a extração automática",
  review: "Revise os campos extraídos e corrija se necessário",
  generate: "Adicione o parecer e escolha o formato do relatório",
};

export default function HomePage() {
  const [step, setStep] = useState<AppStep>("upload");
  const [extractedData, setExtractedData] = useState<ExtractedData>(defaultData);
  const [originalFiles, setOriginalFiles] = useState<OriginalFiles>({});
  const { user, loading: authLoading, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [dateFilter, setDateFilter] = useState<"hoje" | "7dias" | "30dias" | "custom">("30dias");
  const [customDate, setCustomDate] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; msg: string; time: Date; read: boolean }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Busca coletas do Supabase para o dashboard
  useEffect(() => {
    if (!user) { setLoadingCollections(false); return; }
    const fetchCollections = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("document_collections")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setCollections((data as DocumentCollection[]) || []);
      } catch { /* silent */ }
      finally { setLoadingCollections(false); }
    };
    fetchCollections();
  }, [user]);

  return (
    <div className="min-h-screen bg-cf-bg flex flex-col">

      {/* ══════════════════════════════════════════════
          NAVBAR — Identity Visual Capital Finanças
          ══════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled ? "#ffffff" : "#ffffff",
          boxShadow: scrolled
            ? "0 2px 20px rgba(32,59,136,0.08)"
            : "0 1px 3px rgba(32,59,136,0.04)",
        }}
      >
        {/* Desktop navbar */}
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="h-16 sm:h-[72px] flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex items-center gap-4">
              <Logo height={26} />
              <div className="hidden md:block h-6 w-px bg-cf-border" />
              <span className="hidden md:block text-xs font-semibold text-cf-navy/60 uppercase tracking-wider">
                Consolidador
              </span>
            </div>

            {/* Right: User area + CTAs */}
            <div className="flex items-center gap-3">
              <a
                href="/historico"
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full transition-all duration-200 border"
                style={{
                  color: "#203b88",
                  borderColor: "rgba(32,59,136,0.2)",
                  minHeight: "auto",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#203b88";
                  e.currentTarget.style.backgroundColor = "rgba(32,59,136,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(32,59,136,0.2)";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Clock size={13} />
                Histórico
              </a>

              {!authLoading && user ? (
                <div className="flex items-center gap-2">
                  {/* Notificações */}
                  <div className="relative">
                    <button
                      onClick={() => setShowNotifications(p => !p)}
                      className="relative w-9 h-9 rounded-full flex items-center justify-center text-cf-text-3 hover:bg-cf-surface transition-colors"
                      style={{ minHeight: "auto" }}
                    >
                      <Bell size={16} />
                      {notifications.filter(n => !n.read).length > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cf-green" />
                      )}
                    </button>
                    {showNotifications && (
                      <div className="absolute right-0 top-11 w-72 bg-white rounded-xl border border-cf-border shadow-lg z-50 overflow-hidden">
                        <div className="px-4 py-3 bg-cf-bg border-b border-cf-border">
                          <p className="text-xs font-bold text-cf-text-1">Notificações</p>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <p className="text-xs text-cf-text-3 text-center py-6">Nenhuma notificação</p>
                          ) : notifications.map(n => (
                            <div key={n.id} className={`px-4 py-3 border-b border-cf-border last:border-0 ${n.read ? "" : "bg-cf-green/5"}`}>
                              <p className="text-xs text-cf-text-1">{n.msg}</p>
                              <p className="text-[10px] text-cf-text-4 mt-1">{n.time.toLocaleString("pt-BR")}</p>
                            </div>
                          ))}
                        </div>
                        {notifications.length > 0 && (
                          <button onClick={() => { setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}
                            className="w-full text-xs font-semibold text-cf-navy py-2.5 hover:bg-cf-bg transition-colors border-t border-cf-border" style={{ minHeight: "auto" }}>
                            Marcar todas como lidas
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Perfil link */}
                  <a href="/perfil" className="hidden sm:flex items-center gap-2 bg-cf-surface px-3 py-1.5 rounded-full hover:bg-cf-surface-2 transition-colors" style={{ minHeight: "auto" }}>
                    <div className="w-6 h-6 rounded-full bg-cf-navy flex items-center justify-center">
                      <User size={12} className="text-white" />
                    </div>
                    <span className="text-xs font-semibold text-cf-text-2 truncate max-w-[100px]">
                      {user.user_metadata?.full_name || user.email?.split("@")[0]}
                    </span>
                  </a>
                  <button
                    onClick={signOut}
                    className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-danger px-3 py-2 rounded-full border border-cf-border hover:border-cf-danger/30 transition-all"
                    style={{ minHeight: "auto" }}
                  >
                    <LogOut size={13} /> Sair
                  </button>
                </div>
              ) : !authLoading && !user ? (
                <a
                  href="/login"
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-full text-white transition-opacity duration-200 hover:opacity-80"
                  style={{ backgroundColor: "#73b815", minHeight: "auto" }}
                >
                  <User size={13} /> Entrar
                </a>
              ) : (
                <div className="flex items-center gap-1.5 bg-cf-green/10 border border-cf-green/25 rounded-full px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cf-green inline-block animate-pulse" />
                  <span className="text-xs font-semibold text-cf-green tracking-wide">Online</span>
                </div>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-cf-navy hover:bg-cf-surface transition-colors"
                style={{ minHeight: "auto" }}
                aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          className="lg:hidden overflow-hidden transition-all duration-300"
          style={{
            maxHeight: mobileMenuOpen ? 200 : 0,
            opacity: mobileMenuOpen ? 1 : 0,
            borderTop: mobileMenuOpen ? "1px solid #edf2fb" : "none",
          }}
        >
          <div className="px-5 py-3 space-y-1">
            <a
              href="/historico"
              className="block px-4 py-3 rounded-xl text-sm font-medium text-cf-navy hover:bg-cf-surface transition-colors"
              style={{ minHeight: "auto" }}
              onClick={() => setMobileMenuOpen(false)}
            >
              Histórico
            </a>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          HERO — Brand gradient header
          ══════════════════════════════════════════════ */}
      <div className="bg-hero-gradient relative overflow-hidden">
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/[0.03]" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-[#73b815]/[0.06]" />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-5">
              <Shield size={13} className="text-[#73b815]" />
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                FIDC regulado pela CVM
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Consolidador de Documentos
            </h1>
            <p className="text-blue-200 mt-3 text-base max-w-lg mx-auto leading-relaxed">
              Envie seus documentos, extraia os dados automaticamente e gere relatórios consolidados em minutos.
            </p>
          </div>

          {/* Step indicator */}
          <div className="mt-8 max-w-md mx-auto">
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-2xl border border-white/15 px-6 py-4">
              {(["upload", "review", "generate"] as AppStep[]).map((s, i) => {
                const idx = ["upload", "review", "generate"].indexOf(step);
                const done = i < idx;
                const active = s === step;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                      ${done
                        ? "bg-[#73b815] border-[#73b815] text-white"
                        : active
                          ? "bg-white border-white text-cf-navy"
                          : "border-white/30 text-white/40"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:block transition-all
                      ${active ? "text-white" : done ? "text-[#a8d96b]" : "text-white/40"}`}
                    >
                      {stepLabels[s]}
                    </span>
                    {i < 2 && <div className="w-8 h-px bg-white/20 mx-1 hidden sm:block" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Wave */}
        <div className="relative h-10 -mb-px">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,20 C240,40 480,0 720,20 C960,40 1200,0 1440,20 L1440,40 L0,40 Z" fill="#f5f7fb" />
          </svg>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
          ══════════════════════════════════════════════ */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-8 py-8">

        {/* ══════════════════════════════════════════════
            DASHBOARD
            ══════════════════════════════════════════════ */}
        {showDashboard ? (() => {
          // Filtro de data
          const now = new Date();
          const filterStart = (() => {
            if (dateFilter === "hoje") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
            if (dateFilter === "7dias") { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
            if (dateFilter === "30dias") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
            if (dateFilter === "custom" && customDate) return new Date(customDate);
            return new Date(0);
          })();
          const filterEnd = (() => {
            if (dateFilter === "custom" && customDate) { const d = new Date(customDate); d.setHours(23,59,59,999); return d; }
            return new Date();
          })();
          const filteredByDate = collections.filter(c => {
            const d = new Date(c.created_at);
            return d >= filterStart && d <= filterEnd;
          });
          const filtered = selectedCompany
            ? filteredByDate.filter(c => c.label === selectedCompany)
            : filteredByDate;
          const companies = Array.from(new Set(collections.map(c => c.label).filter((l): l is string => !!l)));

          return (
          <div className="max-w-4xl mx-auto animate-fade-in">

            {/* Header + Filtro de data */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-cf-text-1">
                  {user ? `Olá, ${user.user_metadata?.full_name || user.email?.split("@")[0] || ""}` : "Bem-vindo"}
                </h2>
                <p className="text-sm text-cf-text-3 mt-1">Painel do Consolidador de Documentos</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-white border border-cf-border rounded-xl p-1">
                  {([
                    { key: "hoje", label: "Hoje" },
                    { key: "7dias", label: "7 dias" },
                    { key: "30dias", label: "30 dias" },
                    { key: "custom", label: "" },
                  ] as { key: typeof dateFilter; label: string }[]).map(f => (
                    f.key === "custom" ? (
                      <button key="custom" onClick={() => setDateFilter("custom")}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${dateFilter === "custom" ? "bg-cf-navy text-white" : "text-cf-text-3 hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        <Calendar size={12} />
                      </button>
                    ) : (
                      <button key={f.key} onClick={() => setDateFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dateFilter === f.key ? "bg-cf-navy text-white" : "text-cf-text-3 hover:bg-cf-bg"}`}
                        style={{ minHeight: "auto" }}>
                        {f.label}
                      </button>
                    )
                  ))}
                </div>
                {dateFilter === "custom" && (
                  <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                    className="input-field py-1.5 px-3 text-xs w-[140px]" />
                )}
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total de Coletas", value: String(filtered.length), icon: <FileText size={18} />, color: "bg-cf-navy/10 text-cf-navy" },
                { label: "Finalizadas", value: String(filtered.filter(c => c.status === "finished").length), icon: <BarChart3 size={18} />, color: "bg-cf-green/10 text-cf-green" },
                { label: "Em Andamento", value: String(filtered.filter(c => c.status === "in_progress").length), icon: <Clock size={18} />, color: "bg-amber-100 text-amber-600" },
                { label: "Empresas", value: String(new Set(filtered.map(c => c.label).filter(Boolean)).size), icon: <Building2 size={18} />, color: "bg-cf-navy/10 text-cf-navy" },
              ].map(m => (
                <div key={m.label} className="card p-4">
                  <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center mb-3`}>
                    {m.icon}
                  </div>
                  <p className="text-2xl font-bold text-cf-text-1">{loadingCollections ? "—" : m.value}</p>
                  <p className="text-[11px] text-cf-text-3 uppercase tracking-wider mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>

            {/* Filtro por empresa */}
            {companies.length > 1 && (
              <div className="mb-6">
                <p className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest mb-2">Filtrar por empresa</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCompany(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${!selectedCompany ? "bg-cf-navy text-white border-cf-navy" : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                    style={{ minHeight: "auto" }}
                  >
                    Todas ({filteredByDate.length})
                  </button>
                  {companies.map(c => (
                    <button key={c}
                      onClick={() => setSelectedCompany(selectedCompany === c ? null : c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${selectedCompany === c ? "bg-cf-navy text-white border-cf-navy" : "text-cf-text-3 border-cf-border hover:bg-cf-bg"}`}
                      style={{ minHeight: "auto" }}
                    >
                      <span className="flex items-center gap-1.5">
                        <Building2 size={11} />
                        {c} ({filteredByDate.filter(col => col.label === c).length})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CTA: Nova coleta */}
            <button
              onClick={() => { setShowDashboard(false); setStep("upload"); setExtractedData(defaultData); }}
              className="btn-green w-full sm:w-auto h-12 text-sm px-8 mb-8"
            >
              <Plus size={18} /> Nova Coleta de Documentos
            </button>

            {/* Últimas coletas (filtradas) */}
            {filtered.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-cf-text-1">
                    {dateFilter === "hoje" ? "Coletas de Hoje" : dateFilter === "7dias" ? "Últimos 7 dias" : dateFilter === "custom" ? "Data selecionada" : "Últimas Coletas"}
                  </h3>
                  <a href="/historico" className="text-xs font-semibold text-cf-navy hover:underline">Ver todas</a>
                </div>
                <div className="space-y-2">
                  {filtered.slice(0, 8).map(col => (
                    <div key={col.id} className="card px-5 py-3.5 flex items-center gap-4 hover:shadow-md transition-shadow">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${col.status === "finished" ? "bg-cf-green/10" : "bg-amber-100"}`}>
                        {col.status === "finished"
                          ? <BarChart3 size={14} className="text-cf-green" />
                          : <Clock size={14} className="text-amber-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-cf-text-1 truncate">{col.label || "Sem identificação"}</p>
                        <p className="text-xs text-cf-text-3">
                          {new Date(col.created_at).toLocaleDateString("pt-BR")} · {col.documents?.length || 0} doc(s)
                          {col.status === "finished" && " · Finalizada"}
                        </p>
                      </div>
                      <a href={`/historico?highlight=${col.id}`} className="text-cf-navy hover:text-cf-green transition-colors" style={{ minHeight: "auto" }}>
                        <ArrowRight size={16} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {filtered.length === 0 && !loadingCollections && (
              <div className="text-center py-12 text-cf-text-3">
                <p className="text-sm">Nenhuma coleta encontrada para o período selecionado.</p>
              </div>
            )}
          </div>
          );
        })() : (

        <div className="max-w-2xl mx-auto">

          {/* Botão voltar + Step header */}
          <div className="mb-6">
            <button onClick={() => {
              if (step === "upload") { setShowDashboard(true); }
              else if (step === "review") { setStep("upload"); }
              else { setStep("review"); }
            }} className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-navy mb-4 transition-colors" style={{ minHeight: "auto" }}>
              {step === "upload" ? <><Home size={13} /> Voltar ao painel</> : <><ArrowLeft size={13} /> Voltar</>}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cf-navy flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {step === "upload" ? "1" : step === "review" ? "2" : "3"}
              </div>
              <div>
                <h2 className="text-lg font-bold text-cf-text-1">{stepLabels[step]}</h2>
                <p className="text-xs text-cf-text-3">{stepDescriptions[step]}</p>
              </div>
            </div>
          </div>

          {step === "upload" && (
            <UploadStep onComplete={(d, files) => { setExtractedData(d); setOriginalFiles(files); setStep("review"); }} />
          )}
          {step === "review" && (
            <ReviewStep data={extractedData} onComplete={(d) => { setExtractedData(d); setStep("generate"); }} onBack={() => setStep("upload")} />
          )}
          {step === "generate" && (
            <GenerateStep data={extractedData} originalFiles={originalFiles} onBack={() => setStep("review")} onReset={() => { setShowDashboard(true); setStep("upload"); setExtractedData(defaultData); setOriginalFiles({}); }} onNotify={(msg) => setNotifications(prev => [{ id: Date.now().toString(), msg, time: new Date(), read: false }, ...prev])} />
          )}
        </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════
          FOOTER — Brand footer
          ══════════════════════════════════════════════ */}
      <footer className="mt-12" style={{ background: "linear-gradient(180deg, #162d6e 0%, #0f1f5c 100%)" }}>
        {/* Green accent line */}
        <div className="h-1 bg-gradient-to-r from-[#73b815] via-[#73b815] to-[#a8d96b]" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo light height={24} />
          <div className="text-center sm:text-right">
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} Capital Finanças. Todos os direitos reservados.
            </p>
            <p className="text-xs text-white/25 mt-0.5">
              Documentos processados localmente com segurança
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
