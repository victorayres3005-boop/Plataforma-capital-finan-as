"use client";

interface WelcomeModalProps {
  onClose: () => void;
}

const steps = [
  {
    icon: "01",
    title: "Envie os documentos",
    description: "Faca upload dos 4 documentos obrigatorios: Cartao CNPJ, QSA, Contrato Social e Faturamento. O SCR e consultado automaticamente via API.",
    color: "bg-cf-navy",
  },
  {
    icon: "02",
    title: "A IA extrai e analisa",
    description: "Nossa inteligencia artificial le cada documento e extrai automaticamente os dados relevantes para analise de credito.",
    color: "bg-cf-green",
  },
  {
    icon: "03",
    title: "Gere o relatorio",
    description: "Com um clique, gere o relatorio completo de due diligence em PDF, Word ou Excel para o comite de credito.",
    color: "bg-[#8b5cf6]",
  },
];

export default function WelcomeModal({ onClose }: WelcomeModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden animate-scale-in" style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.15)" }}>
        {/* Header */}
        <div className="bg-hero-gradient px-8 py-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          <div className="relative">
            <svg width="160" height="22" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-4">
              <circle cx="31" cy="27" r="22" stroke="#ffffff" strokeWidth="4.5" fill="none" />
              <circle cx="31" cy="49" r="4.5" fill="#ffffff" />
              <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
                <tspan fill="#ffffff">capital</tspan><tspan fill="#a8d96b">financas</tspan>
              </text>
            </svg>
            <h2 className="text-xl font-bold text-white">Bem-vindo a plataforma</h2>
            <p className="text-blue-200 text-sm mt-1">Veja como e simples analisar um cedente</p>
          </div>
        </div>

        {/* Steps */}
        <div className="px-8 py-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {steps.map((step) => (
              <div key={step.icon} className="text-center">
                <div className={`w-10 h-10 rounded-xl ${step.color} text-white text-sm font-bold flex items-center justify-center mx-auto mb-3`}>
                  {step.icon}
                </div>
                <h3 className="text-sm font-bold text-cf-text-1 mb-1">{step.title}</h3>
                <p className="text-[11px] text-cf-text-3 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onClose}
            className="btn-green w-full h-12 text-sm font-bold"
          >
            Comecar agora
          </button>
          <p className="text-center text-[11px] text-cf-text-4 mt-3">
            Voce pode acessar este tutorial novamente nas configuracoes
          </p>
        </div>
      </div>
    </div>
  );
}
