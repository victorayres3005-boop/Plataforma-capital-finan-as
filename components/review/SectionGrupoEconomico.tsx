"use client";
import { GrupoEconomicoData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: GrupoEconomicoData;
  expanded: boolean;
  onToggle: () => void;
}

function parseNum(v: string | undefined | null): number {
  if (!v) return 0;
  return parseFloat(String(v).replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
}

export function SectionGrupoEconomico({ data, expanded, onToggle }: Props) {
  const empresas = data.empresas || [];
  const hasEmpresas = empresas.length > 0;
  const alertaParentesco = data.alertaParentesco;
  const parentescos = data.parentescosDetectados || [];
  const sociosKyc = data.sociosKyc || [];

  const totalSCR = empresas.reduce((acc, e) => acc + parseNum(e.scrTotal), 0);
  const empresasAtivas = empresas.filter(e => !e.situacao || e.situacao === "ATIVA");

  return (
    <SectionCard
      number="08"
      title="Grupo Econômico"
      accentColor={alertaParentesco ? "#d97706" : hasEmpresas ? "#3b82f6" : "#9CA3AF"}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: hasEmpresas ? "#dbeafe" : "#f3f4f6",
          color: hasEmpresas ? "#1e40af" : "#6b7280",
        }}>
          {hasEmpresas ? `${empresas.length} empresa${empresas.length !== 1 ? "s" : ""}` : "sem dados"}
        </span>
      }
    >
      {/* Alerta parentesco */}
      {alertaParentesco && parentescos.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#d97706", fontSize: "14px", flexShrink: 0 }}>⚠</span>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 700, color: "#92400e" }}>Possível parentesco entre sócios detectado</p>
            {parentescos.map((p, i) => (
              <p key={i} style={{ margin: "2px 0 0", fontSize: "11px", color: "#b45309" }}>
                {p.socio1} × {p.socio2} — sobrenome: <strong>{p.sobrenomeComum}</strong>
              </p>
            ))}
          </div>
        </div>
      )}

      {!hasEmpresas && (
        <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "8px", border: "1px dashed #D1D5DB", marginBottom: "16px" }}>
          <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>Nenhuma empresa vinculada encontrada no grupo econômico.</p>
        </div>
      )}

      {/* Resumo do grupo */}
      {hasEmpresas && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
          <ResumoCard label="Empresas no grupo" value={String(empresas.length)} />
          <ResumoCard label="Ativas" value={String(empresasAtivas.length)} />
          <ResumoCard label="SCR Total Grupo" value={totalSCR > 0 ? `R$ ${totalSCR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} />
        </div>
      )}

      {/* Tabela de empresas */}
      {hasEmpresas && (
        <div style={{ marginBottom: sociosKyc.length > 0 ? "20px" : "0" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Empresas Vinculadas
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Razão Social", "CNPJ", "Relação", "Sócio Origem", "SCR Total", "Protestos", "Processos", "Situação"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 4 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresas.map((e, i) => {
                  const baixada = e.situacao && e.situacao !== "ATIVA";
                  const temDivida = parseNum(e.scrTotal) > 0;
                  const temProtesto = parseInt(e.protestos || "0", 10) > 0;
                  const temProcesso = parseInt(e.processos || "0", 10) > 0;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #F3F4F6", opacity: baixada ? 0.6 : 1 }}>
                      <td style={{ padding: "8px 10px", color: "#111827", fontWeight: 600, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.razaoSocial}>{e.razaoSocial || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#6B7280", fontFamily: "ui-monospace, monospace", fontSize: "11px", whiteSpace: "nowrap" }}>{e.cnpj || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#374151", whiteSpace: "nowrap" }}>{e.relacao || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#374151", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.socioOrigem}>
                        {e.socioOrigem || "—"}
                        {e.participacao && <span style={{ fontSize: "10px", color: "#9CA3AF", marginLeft: "4px" }}>({e.participacao})</span>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: temDivida ? "#dc2626" : "#6B7280", fontWeight: temDivida ? 700 : 400, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {e.scrTotal && e.scrTotal !== "0" && e.scrTotal !== "0,00" ? e.scrTotal : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: temProtesto ? "#dc2626" : "#6B7280", fontWeight: temProtesto ? 700 : 400 }}>
                        {e.protestos || "0"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: temProcesso ? "#d97706" : "#6B7280", fontWeight: temProcesso ? 700 : 400 }}>
                        {e.processos || "0"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px",
                          background: baixada ? "#f3f4f6" : "#dcfce7",
                          color: baixada ? "#6b7280" : "#15803d",
                        }}>
                          {e.situacao || "ATIVA"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KYC dos sócios (Credit Hub) */}
      {sociosKyc.length > 0 && (
        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            KYC dos Sócios (Credit Hub)
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["CPF", "Processos Total", "Polo Ativo", "Polo Passivo", "Valor Processos", "Protestos"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "right", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sociosKyc.map((s, i) => {
                  const maskCpf = (cpf: string) => {
                    const d = cpf.replace(/\D/g, "");
                    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf;
                  };
                  const temProblema = (s.processosTotal || 0) > 0 || (s.protestosQtd || 0) > 0;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #F3F4F6", background: temProblema ? "#fffbeb" : "transparent" }}>
                      <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace" }}>{maskCpf(s.cpf)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: (s.processosTotal || 0) > 0 ? "#d97706" : "#6B7280", fontWeight: (s.processosTotal || 0) > 0 ? 700 : 400 }}>{s.processosTotal ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280" }}>{s.processosAtivo ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: (s.processosPassivo || 0) > 0 ? "#dc2626" : "#6B7280", fontWeight: (s.processosPassivo || 0) > 0 ? 700 : 400 }}>{s.processosPassivo ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#374151", fontVariantNumeric: "tabular-nums" }}>{s.processosValorTotal || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: (s.protestosQtd || 0) > 0 ? "#dc2626" : "#6B7280", fontWeight: (s.protestosQtd || 0) > 0 ? 700 : 400 }}>{s.protestosQtd ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ResumoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}
