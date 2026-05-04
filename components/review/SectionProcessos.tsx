"use client";
import { ProcessosData } from "@/types";
import { SectionCard } from "./shared";

interface Props {
  data: ProcessosData;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionProcessos({ data, expanded, onToggle }: Props) {
  const passivos = parseInt(data.passivosTotal || "0", 10);
  const ativos = parseInt(data.ativosTotal || "0", 10);
  const temRJ = data.temRJ;
  const temFalencia = data.temFalencia;
  const hasProcessos = passivos > 0;
  const temDistribuicao = data.distribuicao && data.distribuicao.length > 0;
  const temBancarios = data.bancarios && data.bancarios.length > 0;
  const temFiscais = data.fiscais && data.fiscais.length > 0;
  const temFornecedores = data.fornecedores && data.fornecedores.length > 0;
  const temOutros = data.outros && data.outros.length > 0;

  const accentColor = temRJ || temFalencia ? "#7c3aed" : passivos > 5 ? "#dc2626" : passivos > 0 ? "#d97706" : "#16a34a";

  return (
    <SectionCard
      number="07"
      title="Processos Judiciais"
      accentColor={accentColor}
      expanded={expanded}
      onToggle={onToggle}
      badge={
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
          background: passivos > 0 ? "#fef3c7" : "#dcfce7",
          color: passivos > 0 ? "#92400e" : "#15803d",
        }}>
          {passivos > 0 ? `${passivos} processo${passivos !== 1 ? "s" : ""}` : "sem processos"}
        </span>
      }
    >
      {/* Alertas RJ / Falência */}
      {(temRJ || temFalencia) && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#7c3aed", fontSize: "14px", flexShrink: 0 }}>⚠</span>
          <div>
            {temRJ && <p style={{ margin: "0 0 2px", fontSize: "12px", fontWeight: 700, color: "#6d28d9" }}>Recuperação Judicial identificada</p>}
            {temFalencia && <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#6d28d9" }}>Pedido de Falência identificado</p>}
          </div>
        </div>
      )}

      {!hasProcessos && !temRJ && !temFalencia && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "16px" }}>
          <span style={{ color: "#16a34a", fontSize: "14px", flexShrink: 0 }}>✓</span>
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#15803d" }}>Nenhum processo judicial encontrado</p>
        </div>
      )}

      {/* Cards resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px" }}>
        <SummaryCard label="Total Passivos" value={data.passivosTotal || "0"} danger={passivos > 0} />
        <SummaryCard label="Em Andamento" value={data.ativosTotal || "0"} danger={ativos > 0} />
        <SummaryCard label="Valor Estimado" value={data.valorTotalEstimado || "—"} />
        {data.poloPassivoQtd && <SummaryCard label="Polo Passivo (réu)" value={data.poloPassivoQtd} danger />}
        {data.poloAtivoQtd && <SummaryCard label="Polo Ativo (autor)" value={data.poloAtivoQtd} />}
        {data.arquivadosQtd && <SummaryCard label="Arquivados" value={data.arquivadosQtd} muted />}
      </div>

      {/* Distribuição por tipo */}
      {temDistribuicao && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Distribuição por Tipo
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Tipo", "Qtd", "%"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i === 0 ? "left" : "right", fontSize: "11px", fontWeight: 600, color: "#6B7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.distribuicao.map((d, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", color: "#374151", fontWeight: 500 }}>{d.tipo}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#111827", fontWeight: 600 }}>{d.qtd}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#6B7280" }}>{d.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bancários */}
      {temBancarios && (
        <ProcessoTable
          title={`Bancários (${data.bancarios.length})`}
          colunas={["Banco", "Assunto", "Data", "Valor", "Status"]}
          rows={data.bancarios.map(b => [b.banco, b.assunto, b.data, b.valor, b.status])}
        />
      )}

      {/* Fiscais */}
      {temFiscais && (
        <ProcessoTable
          title={`Fiscais (${data.fiscais.length})`}
          colunas={["Contraparte", "Data", "Valor", "Status"]}
          rows={data.fiscais.map(f => [f.contraparte, f.data, f.valor, f.status])}
        />
      )}

      {/* Fornecedores */}
      {temFornecedores && (
        <ProcessoTable
          title={`Fornecedores (${data.fornecedores.length})`}
          colunas={["Contraparte", "Assunto", "Data", "Valor", "Status"]}
          rows={data.fornecedores.map(f => [f.contraparte, f.assunto, f.data, f.valor, f.status])}
        />
      )}

      {/* Outros */}
      {temOutros && (
        <ProcessoTable
          title={`Outros (${data.outros.length})`}
          colunas={["Contraparte", "Assunto", "Data", "Valor", "Status"]}
          rows={data.outros.map(o => [o.contraparte, o.assunto, o.data, o.valor, o.status])}
        />
      )}

      {/* Top 10 por valor */}
      {data.top10Valor && data.top10Valor.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>
            Top 10 por Valor
          </p>
          <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Número", "Tipo", "Assunto", "Data", "Valor", "Status"].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 3 ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.top10Valor.map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 10px", color: "#6B7280", fontSize: "11px", fontFamily: "monospace" }}>{p.numero || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151" }}>{p.tipo || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.assunto}>{p.assunto || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280", whiteSpace: "nowrap" }}>{p.data || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#111827", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.valor || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "99px", background: "#F3F4F6", color: "#374151" }}>{p.status || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function SummaryCard({ label, value, danger, muted }: { label: string; value: string; danger?: boolean; muted?: boolean }) {
  const isZero = value === "0" || value === "0,00" || value === "—";
  const isHighlight = danger && !isZero;
  return (
    <div style={{
      padding: "12px 14px", borderRadius: "8px",
      background: isHighlight ? "#fef3c7" : "#F9FAFB",
      border: `1px solid ${isHighlight ? "#fde68a" : "#E5E7EB"}`,
    }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: isHighlight ? "#92400e" : muted ? "#9CA3AF" : "#111827", fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}

function ProcessoTable({ title, colunas, rows }: { title: string; colunas: string[]; rows: (string | undefined)[][] }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 8px" }}>{title}</p>
      <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB" }}>
              {colunas.map((h, i) => (
                <th key={i} style={{ padding: "7px 10px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: "7px 10px", color: j === 0 ? "#111827" : "#374151", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cell}>{cell || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
