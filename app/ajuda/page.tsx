"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, Search, HelpCircle, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

function Logo() {
  return (
    <svg width="160" height="22" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#203b88" />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill="#203b88">capital</tspan><tspan fill="#73b815">finanças</tspan>
      </text>
    </svg>
  );
}

const faqs = [
  {
    categoria: "Documentos",
    perguntas: [
      { pergunta: "Quais documentos devo enviar?", resposta: "Para uma analise completa, envie: Cartao CNPJ, QSA (Quadro de Socios), Contrato Social, SCR do Banco Central (atual e anterior se possivel), Relatorio de Faturamento dos ultimos 12 meses. Quanto mais documentos, mais completa sera a analise." },
      { pergunta: "Por que meu documento deu erro na extracao?", resposta: "Isso pode acontecer por tres motivos: (1) O PDF e uma imagem escaneada de baixa qualidade — tente um PDF com texto selecionavel; (2) A API de IA atingiu o limite temporario — aguarde alguns minutos e tente novamente; (3) O arquivo esta corrompido — tente exportar o documento novamente da fonte original." },
      { pergunta: "Quais formatos de arquivo sao aceitos?", resposta: "PDF e o formato principal e recomendado. DOCX e imagens (JPG, PNG) tambem sao aceitos, mas PDFs com texto selecionavel tem melhor qualidade de extracao. O tamanho maximo por arquivo e 20MB." },
      { pergunta: "Posso enviar o SCR de dois periodos diferentes?", resposta: "Sim. Envie os dois arquivos SCR separadamente — a plataforma identifica automaticamente o periodo de cada um e gera o comparativo de evolucao no relatorio." },
    ],
  },
  {
    categoria: "Analise de credito",
    perguntas: [
      { pergunta: "O que significa cada decisao?", resposta: "APROVADO: empresa atende todos os pre-requisitos e nao tem alertas criticos. APROVACAO CONDICIONAL: atende os pre-requisitos mas tem pontos que precisam ser esclarecidos antes da operacao. PENDENTE: dados insuficientes ou multiplos alertas moderados — necessita documentacao adicional. REPROVADO: nao atende os pre-requisitos minimos do fundo (FMM abaixo do minimo ou empresa muito nova)." },
      { pergunta: "O que e FMM e como e calculado?", resposta: "FMM e o Faturamento Medio Mensal — a media do faturamento mensal dos ultimos 12 meses disponiveis. E a principal metrica para avaliar o porte da empresa e calcular a alavancagem financeira." },
      { pergunta: "O que e alavancagem e qual o limite saudavel?", resposta: "Alavancagem e a relacao entre a divida total (SCR) e o FMM da empresa. Indica quantos meses de faturamento seriam necessarios para quitar toda a divida bancaria. O limite saudavel padrao e 3,5x e o limite maximo aceitavel e 5,0x — valores configuraveis em Configuracoes." },
      { pergunta: "A analise da IA pode estar errada?", resposta: "Sim. A analise e preliminar e automatizada — serve como base para o analista humano, nao como decisao final. Sempre revise os dados extraidos na etapa de Revisao e valide as informacoes criticas diretamente nos documentos originais." },
    ],
  },
  {
    categoria: "Relatorio",
    perguntas: [
      { pergunta: "Qual a diferenca entre PDF, Word e Excel?", resposta: "PDF: relatorio formatado completo, ideal para apresentar ao comite. Word (DOCX): relatorio editavel, util para adicionar comentarios do analista. Excel: dados estruturados em planilha, ideal para consolidar varias analises ou alimentar outros sistemas." },
      { pergunta: "Posso editar os dados antes de gerar o relatorio?", resposta: "Sim. Na etapa de Revisao, todos os campos extraidos pela IA sao editaveis. Corrija qualquer dado incorreto antes de gerar o relatorio. As edicoes ficam salvas e voce pode tambem editar pelo Historico de Coletas." },
      { pergunta: "O relatorio e gerado novamente toda vez?", resposta: "A analise de IA e gerada uma vez e fica em cache — nas proximas vezes que voce abrir a coleta, ela carrega instantaneamente. Para forcar uma nova analise (por exemplo, apos editar dados), clique em 'Reanalisar' na tela de geracao." },
    ],
  },
  {
    categoria: "Conta e configuracoes",
    perguntas: [
      { pergunta: "Como altero os parametros de aprovacao do fundo?", resposta: "Acesse Configuracoes (icone de engrenagem na barra superior). La voce pode ajustar FMM minimo, limites de alavancagem, prazos maximos e concentracao maxima por sacado. As alteracoes se aplicam a todas as analises futuras." },
      { pergunta: "O historico fica salvo para sempre?", resposta: "Sim. Todas as coletas ficam salvas no seu historico com os documentos originais e a analise gerada. Voce pode acessar, editar e baixar relatorios de qualquer coleta anterior a qualquer momento." },
      { pergunta: "Outros analistas da equipe veem minhas coletas?", resposta: "Atualmente cada usuario ve apenas suas proprias coletas. Funcionalidade de equipe com coletas compartilhadas esta prevista para versoes futuras da plataforma." },
    ],
  },
];

export default function AjudaPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<number>(0);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const q = searchQuery.toLowerCase().trim();
  const filtered = q
    ? faqs.map(cat => ({
        ...cat,
        perguntas: cat.perguntas.filter(
          p => p.pergunta.toLowerCase().includes(q) || p.resposta.toLowerCase().includes(q),
        ),
      })).filter(cat => cat.perguntas.length > 0)
    : faqs;

  return (
    <div className="min-h-screen bg-cf-bg flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-cf-border sticky top-0 z-50" style={{ boxShadow: "0 1px 3px rgba(32,59,136,0.06)" }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" style={{ minHeight: "auto" }}><Logo /></Link>
          <span className="text-xs font-semibold text-cf-navy/60 uppercase tracking-wider">Ajuda</span>
          <div className="flex items-center gap-2">
            {!authLoading && user ? (
              <button onClick={signOut} className="flex items-center gap-1 text-xs font-semibold text-cf-text-3 hover:text-cf-danger border border-cf-border rounded-full px-2.5 py-1.5 transition-colors" style={{ minHeight: "auto" }}>
                <LogOut size={12} /> Sair
              </button>
            ) : !authLoading ? (
              <Link href="/login" className="flex items-center gap-1.5 bg-cf-navy text-white text-xs font-semibold rounded-full px-3 py-1.5 hover:bg-cf-navy-dark transition-colors" style={{ minHeight: "auto" }}>
                <User size={12} /> Entrar
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-hero-gradient">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/10 mb-4">
            <HelpCircle size={14} className="text-white/70" />
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">FAQ</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Central de Ajuda</h1>
          <p className="text-blue-200 mt-2 text-sm">Tire suas duvidas sobre a plataforma</p>
        </div>
        <div className="relative h-10 -mb-px">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,20 C240,40 480,0 720,20 C960,40 1200,0 1440,20 L1440,40 L0,40 Z" fill="#f5f7fb" />
          </svg>
        </div>
      </div>

      <main className="flex-1 max-w-3xl mx-auto w-full px-5 sm:px-8 py-8 space-y-6">
        <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-navy transition-colors" style={{ minHeight: "auto" }}>
          <ArrowLeft size={13} /> Voltar ao painel
        </Link>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-cf-text-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar pergunta..."
            className="input-field pl-11 h-12 text-sm w-full"
          />
        </div>

        {/* FAQs */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-cf-text-3">Nenhuma pergunta encontrada para &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((cat, ci) => {
              const isOpen = q ? true : openCategory === ci;
              return (
                <div key={cat.categoria} className="card overflow-hidden">
                  <button
                    onClick={() => setOpenCategory(isOpen && !q ? -1 : ci)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-cf-bg transition-colors text-left"
                    style={{ minHeight: "auto" }}
                  >
                    <span className="text-sm font-bold text-cf-text-1">{cat.categoria}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-cf-text-4 bg-cf-surface px-2 py-0.5 rounded-full">{cat.perguntas.length}</span>
                      {isOpen ? <ChevronUp size={14} className="text-cf-text-3" /> : <ChevronDown size={14} className="text-cf-text-3" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-cf-border animate-fade-in">
                      {cat.perguntas.map(p => {
                        const qOpen = openQuestion === p.pergunta;
                        return (
                          <div key={p.pergunta} className="border-b border-cf-border/50 last:border-0">
                            <button
                              onClick={() => setOpenQuestion(qOpen ? null : p.pergunta)}
                              className="w-full flex items-center justify-between px-5 py-3 hover:bg-cf-bg/50 transition-colors text-left"
                              style={{ minHeight: "auto" }}
                            >
                              <span className="text-xs font-semibold text-cf-text-2 pr-4">{p.pergunta}</span>
                              {qOpen ? <ChevronUp size={12} className="text-cf-text-4 flex-shrink-0" /> : <ChevronDown size={12} className="text-cf-text-4 flex-shrink-0" />}
                            </button>
                            {qOpen && (
                              <div className="px-5 pb-4 animate-fade-in">
                                <p className="text-xs text-cf-text-3 leading-relaxed">{p.resposta}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer CTA */}
        <div className="card p-6 text-center">
          <p className="text-sm font-semibold text-cf-text-1 mb-1">Nao encontrou o que procurava?</p>
          <p className="text-xs text-cf-text-3 mb-4">Entre em contato com o suporte tecnico</p>
          <a href="mailto:suporte@capitalfinancas.com.br" className="btn-primary text-xs px-6">
            Falar com suporte
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-cf-dark mt-8">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-6 flex items-center justify-between">
          <Logo />
          <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Capital Financas</p>
        </div>
      </footer>
    </div>
  );
}
