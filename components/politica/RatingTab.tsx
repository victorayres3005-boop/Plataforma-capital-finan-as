"use client";

import type { FaixaRating } from "@/types/politica-credito";

interface Props {
  faixas: FaixaRating[];
  onChange: (faixas: FaixaRating[]) => void;
}

const _RATING_LABELS = { A: "A", B: "B", C: "C", D: "D", E: "E", F: "F" }; void _RATING_LABELS;

export function RatingTab({ faixas, onChange }: Props) {
  const sorted = [...faixas].sort((a, b) => b.score_minimo - a.score_minimo);

  const updateFaixa = (rating: string, updated: Partial<FaixaRating>) =>
    onChange(faixas.map(f => f.rating === rating ? { ...f, ...updated } : f));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Escala visual */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e8edf5", padding: "18px 20px" }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#374151", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Escala de Rating (0–100)
        </p>
        <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", gap: 1 }}>
          {sorted.map(f => (
            <div
              key={f.rating}
              title={`${f.rating}: ${f.score_minimo}–${f.score_maximo} (${f.interpretacao})`}
              style={{ flex: f.score_maximo - f.score_minimo + 1, background: f.cor, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: "white", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{f.rating}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>0</span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>100</span>
        </div>
      </div>

      {/* Faixas editáveis */}
      {sorted.map(faixa => (
        <div key={faixa.rating} style={{ background: "white", borderRadius: 14, border: `1px solid ${faixa.cor}44`, overflow: "hidden" }}>
          <div style={{ height: 3, background: faixa.cor }} />
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: faixa.cor, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: "white" }}>{faixa.rating}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", margin: 0 }}>{faixa.interpretacao}</p>
                <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{faixa.leitura_risco}</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Field label="Score mínimo">
                <input
                  type="number"
                  value={faixa.score_minimo}
                  onChange={e => updateFaixa(faixa.rating, { score_minimo: parseInt(e.target.value) || 0 })}
                  min={0} max={100}
                  style={inputStyle}
                />
              </Field>
              <Field label="Score máximo">
                <input
                  type="number"
                  value={faixa.score_maximo}
                  onChange={e => updateFaixa(faixa.rating, { score_maximo: parseInt(e.target.value) || 0 })}
                  min={0} max={100}
                  style={inputStyle}
                />
              </Field>
              <Field label="Cor">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={faixa.cor}
                    onChange={e => updateFaixa(faixa.rating, { cor: e.target.value })}
                    style={{ width: 36, height: 36, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }}
                  />
                  <input
                    value={faixa.cor}
                    onChange={e => updateFaixa(faixa.rating, { cor: e.target.value })}
                    maxLength={7}
                    style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 12 }}
                  />
                </div>
              </Field>
              <Field label="Reanálise (dias)">
                <input
                  type="number"
                  value={faixa.periodicidade_reanalise_dias}
                  onChange={e => updateFaixa(faixa.rating, { periodicidade_reanalise_dias: parseInt(e.target.value) || 0 })}
                  min={1}
                  style={inputStyle}
                />
              </Field>
              <Field label="Interpretação" style={{ gridColumn: "span 2" }}>
                <input
                  value={faixa.interpretacao}
                  onChange={e => updateFaixa(faixa.rating, { interpretacao: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Leitura de risco" style={{ gridColumn: "span 2" }}>
                <input
                  value={faixa.leitura_risco}
                  onChange={e => updateFaixa(faixa.rating, { leitura_risco: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, border: "1px solid #e5e7eb", borderRadius: 7,
  padding: "0 10px", fontSize: 13, color: "#111827", outline: "none",
  boxSizing: "border-box",
};

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
