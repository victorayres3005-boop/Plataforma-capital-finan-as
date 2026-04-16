"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, Minus, Building2, AlertTriangle, FileText, DollarSign } from "lucide-react";

interface Snapshot {
  id: string;
  snapshot_date: string;
  rating: number | null;
  rating_confianca: number | null;
  decisao: string | null;
  fmm_12m: number | null;
  protestos_count: number | null;
  processos_count: number | null;
  ccf_count: number | null;
  nivel_analise: string | null;
  alertas_alta_count: number | null;
}

interface Collection {
  id: string;
  company_name: string | null;
  rating: number | null;
  rating_confianca: number | null;
  decisao: string | null;
  fmm_12m: number | null;
  nivel_analise: string | null;
  analyzed_at: string | null;
  created_at: string;
  status: string;
  alertas_alta_count: number | null;
}

interface Operacao {
  id: string;
  data_operacao: string;
  modalidade: string | null;
  valor_bruto: number | null;
  valor_liquido: number | null;
  taxa: number | null;
  prazo_dias: number | null;
  qtd_titulos: number | null;
  status: string;
}

interface Response {
  cnpj: string;
  company_name: string | null;
  summary: {
    total_analises: number;
    total_operacoes: number;
    rating_atual: number | null;
    decisao_atual: string | null;
    ultima_analise: string | null;
  };
  snapshots: Snapshot[];
  collections: Collection[];
  operacoes: Operacao[];
}

function fmtCnpj(v: string): string {
  const c = v.replace(/\D/g, "");
  if (c.length !== 14) return v;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

function fmtMoney(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function decisaoColor(d: string | null): string {
  if (!d) return "bg-gray-100 text-gray-600";
  if (d === "APROVADO") return "bg-green-100 text-green-800";
  if (d === "APROVACAO_CONDICIONAL") return "bg-blue-100 text-blue-800";
  if (d === "PENDENTE") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

export default function EmpresaPage() {
  const params = useParams<{ cnpj: string }>();
  const [resp, setResp] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.cnpj) return;
    setLoading(true);
    fetch(`/api/empresa/${params.cnpj}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setResp)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [params?.cnpj]);

  const snapshots = resp?.snapshots ?? [];
  const ratingDelta = snapshots.length >= 2
    ? (snapshots[snapshots.length - 1].rating ?? 0) - (snapshots[0].rating ?? 0)
    : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/historico" className="flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-cf-navy">
            <ArrowLeft size={14} /> Histórico
          </Link>
          <div className="h-5 w-px bg-gray-300" />
          <Building2 size={18} className="text-cf-navy" />
          <h1 className="text-xl font-bold text-cf-navy">
            {resp?.company_name ?? "Empresa"}
          </h1>
          <span className="text-[11px] font-mono text-gray-500">{resp?.cnpj ? fmtCnpj(resp.cnpj) : ""}</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-cf-navy" size={28} />
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{error}</div>
        )}

        {!loading && !error && resp && (
          <>
            {/* KPIs de topo */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <TrendingUp size={14} /> Rating atual
                </div>
                <div className="text-2xl font-bold text-cf-navy mt-1.5">
                  {resp.summary.rating_atual?.toFixed(1) ?? "—"}
                </div>
                {ratingDelta != null && (
                  <div className={`text-[11px] mt-0.5 flex items-center gap-0.5 ${ratingDelta > 0 ? "text-green-600" : ratingDelta < 0 ? "text-red-600" : "text-gray-400"}`}>
                    {ratingDelta > 0 ? <TrendingUp size={11} /> : ratingDelta < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                    {ratingDelta > 0 ? "+" : ""}{ratingDelta.toFixed(1)} desde primeira análise
                  </div>
                )}
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <FileText size={14} /> Análises
                </div>
                <div className="text-2xl font-bold text-cf-navy mt-1.5">{resp.summary.total_analises}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {resp.summary.ultima_analise ? `última: ${new Date(resp.summary.ultima_analise).toLocaleDateString("pt-BR")}` : "—"}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <DollarSign size={14} /> Operações
                </div>
                <div className="text-2xl font-bold text-cf-navy mt-1.5">{resp.summary.total_operacoes}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">total realizadas</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <AlertTriangle size={14} /> Decisão
                </div>
                <div className={`text-sm font-bold mt-2 px-2 py-1 rounded inline-block ${decisaoColor(resp.summary.decisao_atual)}`}>
                  {resp.summary.decisao_atual ?? "—"}
                </div>
              </div>
            </div>

            {/* Timeline do rating (gráfico de barras simples) */}
            {snapshots.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
                  Evolução do rating
                </div>
                <div className="flex items-end gap-2 h-40">
                  {snapshots.map((s) => {
                    const r = s.rating ?? 0;
                    const h = Math.max(4, Math.round((r / 10) * 150));
                    const col = r >= 7.5 ? "bg-green-500" : r >= 6 ? "bg-blue-500" : r >= 4 ? "bg-amber-500" : "bg-red-500";
                    return (
                      <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full rounded-t ${col} relative group cursor-default`} style={{ height: `${h}px` }}>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {s.snapshot_date}: {r.toFixed(1)} · {s.decisao ?? "—"}
                          </div>
                        </div>
                        <div className="text-[9px] text-gray-400 font-mono">{s.snapshot_date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Métricas de risco por snapshot */}
            {snapshots.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  Histórico de indicadores
                </div>
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left py-2 px-4 font-semibold uppercase text-[10px]">Data</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Rating</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">FMM 12m</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Protestos</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Processos</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">CCF</th>
                      <th className="text-center py-2 px-3 font-semibold uppercase text-[10px]">Nível</th>
                      <th className="text-center py-2 px-3 font-semibold uppercase text-[10px]">Decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...snapshots].reverse().map(s => (
                      <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-4 font-semibold text-gray-800">{s.snapshot_date}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{s.rating?.toFixed(1) ?? "—"}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-gray-600">{fmtMoney(s.fmm_12m)}</td>
                        <td className="py-2.5 px-3 text-right font-mono"><span className={(s.protestos_count ?? 0) > 0 ? "text-red-600 font-semibold" : "text-gray-400"}>{s.protestos_count ?? "—"}</span></td>
                        <td className="py-2.5 px-3 text-right font-mono"><span className={(s.processos_count ?? 0) > 0 ? "text-amber-600" : "text-gray-400"}>{s.processos_count ?? "—"}</span></td>
                        <td className="py-2.5 px-3 text-right font-mono"><span className={(s.ccf_count ?? 0) > 0 ? "text-red-600 font-bold" : "text-gray-400"}>{s.ccf_count ?? "—"}</span></td>
                        <td className="py-2.5 px-3 text-center text-[10px] font-semibold text-gray-600">{s.nivel_analise ?? "—"}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${decisaoColor(s.decisao)}`}>{s.decisao ?? "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Operações */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                <span>Operações</span>
                <span className="text-[10px] text-gray-400">{resp.operacoes.length} registro(s)</span>
              </div>
              {resp.operacoes.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Nenhuma operação registrada para este CNPJ ainda.
                </div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left py-2 px-4 font-semibold uppercase text-[10px]">Data</th>
                      <th className="text-left py-2 px-3 font-semibold uppercase text-[10px]">Modalidade</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Valor bruto</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Líquido</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Taxa</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Prazo</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Títulos</th>
                      <th className="text-center py-2 px-3 font-semibold uppercase text-[10px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resp.operacoes.map(op => (
                      <tr key={op.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-4">{op.data_operacao}</td>
                        <td className="py-2.5 px-3 text-gray-600 capitalize">{op.modalidade ?? "—"}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{fmtMoney(op.valor_bruto)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{fmtMoney(op.valor_liquido)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{op.taxa != null ? `${op.taxa.toFixed(2)}%` : "—"}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{op.prazo_dias != null ? `${op.prazo_dias}d` : "—"}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{op.qtd_titulos ?? "—"}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            op.status === "liquidada" ? "bg-green-100 text-green-700" :
                            op.status === "ativa" ? "bg-blue-100 text-blue-700" :
                            op.status === "inadimplente" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>{op.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
