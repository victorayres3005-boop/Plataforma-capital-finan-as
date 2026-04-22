"use client";

import type { PesosPilares } from "@/types/politica-credito";
import { somarPesos } from "@/lib/politica-credito/validators";

interface Props {
  pesos: PesosPilares;
  onChange: (p: PesosPilares) => void;
}

const PILAR_LABELS: Record<keyof PesosPilares, { nome: string; desc: string; cor: string }> = {
  estrutura_operacao: { nome: "Estrutura da Operação", desc: "Lastro, sacados, garantias", cor: "#203b88" },
  risco_compliance:  { nome: "Risco e Compliance", desc: "SCR, protestos, processos, RJ", cor: "#dc2626" },
  perfil_empresa:    { nome: "Perfil da Empresa", desc: "Segmento, localização, porte", cor: "#73b815" },
  saude_financeira:  { nome: "Saúde Financeira", desc: "DRE, balanço, alavancagem", cor: "#d97706" },
  socios_governanca: { nome: "Sócios e Governança", desc: "Endividamento, patrimônio, sucessão", cor: "#7c3aed" },
};

export function PesosTab({ pesos, onChange }: Props) {
  const soma = somarPesos(pesos);
  const somaOk = Math.round(soma) === 100;

  const set = (key: keyof PesosPilares, value: number) =>
    onChange({ ...pesos, [key]: Math.max(0, Math.min(100, value)) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Indicador de soma */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px",
        background: somaOk ? "#f0fdf4" : "#fef2f2",
        border: `1px solid ${somaOk ? "#bbf7d0" : "#fecaca"}`,
        borderRadius: 12,
      }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: somaOk ? "#166534" : "#991b1b", margin: "0 0 2px" }}>
            {somaOk ? "Soma dos pesos: 100% ✓" : `Soma dos pesos: ${soma.toFixed(1)}% — deve ser exatamente 100%`}
          </p>
          <p style={{ fontSize: 11, color: somaOk ? "#16a34a" : "#dc2626", margin: 0 }}>
            {somaOk
              ? "Configuração válida — salvar habilitado."
              : `Falta ${(100 - soma).toFixed(1)}% para completar.`}
          </p>
        </div>
        {/* Mini bar */}
        <div style={{ width: 120, height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${Math.min(soma, 100)}%`,
            background: somaOk ? "#16a34a" : soma > 100 ? "#dc2626" : "#d97706",
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Sliders por pilar */}
      {(Object.entries(pesos) as [keyof PesosPilares, number][]).map(([key, valor]) => {
        const meta = PILAR_LABELS[key];
        return (
          <div key={key} style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: meta.cor, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{meta.nome}</p>
                  <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>{meta.desc}</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  value={valor}
                  onChange={e => set(key, parseFloat(e.target.value) || 0)}
                  min={0} max={100} step={1}
                  style={{
                    width: 64, height: 34, border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: "0 8px", fontSize: 14, fontWeight: 800, color: meta.cor,
                    textAlign: "center", outline: "none",
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>%</span>
              </div>
            </div>
            {/* Track */}
            <div style={{ position: "relative", height: 8, background: "#f1f5f9", borderRadius: 4 }}>
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${Math.min(valor, 100)}%`,
                background: meta.cor, borderRadius: 4, transition: "width 0.2s",
              }} />
              <input
                type="range"
                min={0} max={100} step={1}
                value={valor}
                onChange={e => set(key, parseInt(e.target.value))}
                style={{
                  position: "absolute", top: -4, left: 0, width: "100%", height: "16px",
                  opacity: 0, cursor: "pointer",
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Distribuição visual */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", padding: "18px 20px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Distribuição Visual
        </p>
        <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", gap: 1 }}>
          {(Object.entries(pesos) as [keyof PesosPilares, number][])
            .filter(([, v]) => v > 0)
            .map(([key, valor]) => (
              <div
                key={key}
                title={`${PILAR_LABELS[key].nome}: ${valor}%`}
                style={{ flex: valor, background: PILAR_LABELS[key].cor, minWidth: 2, transition: "flex 0.3s" }}
              />
            ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
          {(Object.entries(pesos) as [keyof PesosPilares, number][]).map(([key, valor]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: PILAR_LABELS[key].cor }} />
              <span style={{ fontSize: 11, color: "#374151" }}>{PILAR_LABELS[key].nome.split(" ")[0]}: <b>{valor}%</b></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
