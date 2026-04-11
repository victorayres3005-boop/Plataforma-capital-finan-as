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
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-cf-text-4 mb-1">Referências Comerciais / Fornecedores</p>
              <p className="text-[13px] text-cf-text-2 leading-relaxed">{rv.referenciasFornecedores}</p>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
