"use client";

import { SectionCard, KpiCard } from "@/components/report/ReportComponents";
import type { ExtractedData } from "@/types";

interface VisitaSectionProps {
  data: ExtractedData;
}

export default function VisitaSection({ data }: VisitaSectionProps) {
  if (!data.relatorioVisita) return null;

  const rv = data.relatorioVisita;

  return (
    <SectionCard
      id="sec-op"
      badge="OP"
      badgeVariant="teal"
      sectionLabel="Parâmetros Operacionais"
      title="Relatório de Visita"
    >
      <div className="px-8 py-6 flex flex-col gap-6">

        {/* Taxas e Limites */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Taxas e Limites</p>
          <div className="kpi-grid">
            {([
              ["Taxa Convencional",    rv.taxaConvencional],
              ["Taxa Comissária",      rv.taxaComissaria],
              ["Limite Total",         rv.limiteTotal        ? `R$ ${rv.limiteTotal}` : ""],
              ["Limite Convencional",  rv.limiteConvencional ? `R$ ${rv.limiteConvencional}` : ""],
              ["Limite Comissária",    rv.limiteComissaria   ? `R$ ${rv.limiteComissaria}` : ""],
              ["Limite por Sacado",    rv.limitePorSacado    ? `R$ ${rv.limitePorSacado}` : ""],
              ["Ticket Médio",         rv.ticketMedio        ? `R$ ${rv.ticketMedio}` : ""],
              ["Cobr. Boleto",         rv.valorCobrancaBoleto ? `R$ ${rv.valorCobrancaBoleto}` : ""],
            ] as [string, string | undefined][]).map(([label, value]) => (
              <KpiCard key={label} label={label} value={value || "—"} />
            ))}
          </div>
        </div>

        {/* Condições e Prazos */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Condições e Prazos</p>
          <div className="kpi-grid">
            {([
              ["Prazo Recompra",   rv.prazoRecompraCedente ? `${rv.prazoRecompraCedente} dias` : ""],
              ["Envio Cartório",   rv.prazoEnvioCartorio   ? `${rv.prazoEnvioCartorio} dias` : ""],
              ["Prazo Máximo Op.", rv.prazoMaximoOp        ? `${rv.prazoMaximoOp} dias` : ""],
              ["Cobrança TAC",     rv.cobrancaTAC],
              ["Tranche",          rv.tranche              ? `R$ ${rv.tranche}` : ""],
              ["Prazo Tranche",    rv.prazoTranche         ? `${rv.prazoTranche} dias` : ""],
            ] as [string, string | undefined][]).map(([label, value]) => (
              <KpiCard key={label} label={label} value={value || "—"} />
            ))}
          </div>
        </div>

        {/* Dados da Empresa */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Dados da Empresa</p>
          <div className="kpi-grid">
            {([
              ["Funcionários",        String(rv.funcionariosObservados || "—")],
              ["Folha Pagamento",     rv.folhaPagamento         ? `R$ ${rv.folhaPagamento}` : ""],
              ["Endiv. Banco",        rv.endividamentoBanco],
              ["Endiv. Factoring",    rv.endividamentoFactoring],
              ["Vendas Cheque",       rv.vendasCheque],
              ["Vendas Duplicata",    rv.vendasDuplicata],
              ["Vendas Outras",       rv.vendasOutras],
              ["Prazo Faturamento",   rv.prazoMedioFaturamento  ? `${rv.prazoMedioFaturamento} dias` : ""],
              ["Prazo Entrega",       rv.prazoMedioEntrega      ? `${rv.prazoMedioEntrega} dias` : ""],
            ] as [string, string | undefined][]).map(([label, value]) => (
              <KpiCard key={label} label={label} value={value || "—"} />
            ))}
          </div>
          {rv.referenciasFornecedores && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-1">Referências Comerciais (texto)</p>
              <p className="text-[13px] text-cf-text-2 leading-relaxed">{rv.referenciasFornecedores}</p>
            </div>
          )}
        </div>

        {/* Referências Comerciais Estruturadas */}
        {rv.referenciasComerciais && rv.referenciasComerciais.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-500 pb-2 mb-2.5 border-b border-gray-200">Referências Comerciais</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Empresa</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Tipo</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Tempo</th>
                    <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Contato</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Limite</th>
                    <th className="text-center py-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">Pgto.</th>
                  </tr>
                </thead>
                <tbody>
                  {rv.referenciasComerciais.map((ref, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-800">
                        <div>{ref.empresa}</div>
                        {ref.cnpj && <div className="text-[10px] text-gray-400 font-mono">{ref.cnpj}</div>}
                      </td>
                      <td className="py-2 px-3 text-gray-600">{ref.tipoRelacionamento || "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{ref.tempoRelacionamento || "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{ref.contato || "—"}</td>
                      <td className="py-2 px-3 text-right font-mono text-gray-700">{ref.limiteConcelidado || "—"}</td>
                      <td className="py-2 px-3 text-center">
                        {ref.avaliacaoPagamento ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ref.avaliacaoPagamento === "boa" ? "bg-green-100 text-green-700" :
                            ref.avaliacaoPagamento === "regular" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {ref.avaliacaoPagamento}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
