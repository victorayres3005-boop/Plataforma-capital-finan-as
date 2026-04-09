"use client";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { QSAData, QSASocio } from "@/types";
import { Field, QualityBadge, SectionCard, QualityResult, qualityAccent } from "./shared";

interface Props {
  data: QSAData;
  setField: (k: "capitalSocial", v: string) => void;
  setSocio: (i: number, k: keyof QSASocio, v: string) => void;
  addSocio: () => void;
  removeSocio: (i: number) => void;
  expanded: boolean;
  onToggle: () => void;
  quality: QualityResult;
}

export function SectionQSA({ data, setField, setSocio, addSocio, removeSocio, expanded, onToggle, quality }: Props) {
  return (
    <SectionCard
      number="02"
      title="Quadro de Sócios e Administradores — QSA"
      accentColor={qualityAccent(quality.score)}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: quality.score === "good" ? "#dcfce7" : quality.score === "warning" ? "#fef9c3" : "#fee2e2", color: quality.score === "good" ? "#15803d" : quality.score === "warning" ? "#92400e" : "#991b1b" }}>
          {quality.pct}%
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Field label="Capital Social" value={data.capitalSocial} onChange={v => setField("capitalSocial", v)} />

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6B7280" }}>Quadro Societário</span>
            <button
              onClick={addSocio}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#203b88", background: "white", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#203b88"; (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "white"; }}
            >
              <Plus size={12} /> Adicionar sócio
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.quadroSocietario.map((s, i) => {
              const initial = s.nome ? s.nome.trim().charAt(0).toUpperCase() : String(i + 1);
              const hasCPF = s.cpfCnpj && s.cpfCnpj.trim();
              return (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: "12px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: "12px", padding: "14px" }}
                >
                  {/* Avatar */}
                  <div style={{ width: "40px", height: "40px", borderRadius: "99px", background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "white", fontSize: "15px", fontWeight: 700 }}>
                    {initial}
                  </div>

                  {/* Campos */}
                  <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <input
                        value={s.nome}
                        onChange={e => setSocio(i, "nome", e.target.value)}
                        placeholder="Nome completo"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "13px", fontWeight: 600, border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                    </div>
                    <div>
                      <input
                        value={s.cpfCnpj}
                        onChange={e => setSocio(i, "cpfCnpj", e.target.value)}
                        placeholder="CPF / CNPJ"
                        style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: `1px solid ${hasCPF ? "#E5E7EB" : "#fcd34d"}`, background: hasCPF ? "white" : "#fffbeb", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = hasCPF ? "#E5E7EB" : "#fcd34d"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      {!hasCPF && (
                        <p style={{ fontSize: "10px", color: "#d97706", marginTop: "3px", display: "flex", alignItems: "center", gap: "3px" }}>
                          <AlertTriangle size={9} /> CPF/CNPJ ausente
                        </p>
                      )}
                    </div>
                    <input
                      value={s.qualificacao}
                      onChange={e => setSocio(i, "qualificacao", e.target.value)}
                      placeholder="Qualificação"
                      style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                    <input
                      value={s.participacao}
                      onChange={e => setSocio(i, "participacao", e.target.value)}
                      placeholder="Participação %"
                      style={{ width: "100%", borderRadius: "8px", padding: "7px 11px", fontSize: "12px", border: "1px solid #E5E7EB", background: "white", outline: "none", fontFamily: "inherit" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#203b88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(32,59,136,0.10)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  </div>

                  {/* Remover */}
                  <button
                    onClick={() => removeSocio(i)}
                    style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #E5E7EB", borderRadius: "8px", cursor: "pointer", color: "#9CA3AF", flexShrink: 0, transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#dc2626"; (e.currentTarget as HTMLElement).style.borderColor = "#fca5a5"; (e.currentTarget as HTMLElement).style.background = "#fef2f2"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; (e.currentTarget as HTMLElement).style.background = "white"; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <QualityBadge quality={quality} />
    </SectionCard>
  );
}
