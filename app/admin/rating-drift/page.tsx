"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, Activity } from "lucide-react";

interface WeekBucket {
  week: string;
  count: number;
  avg_ia: number;
  avg_comite: number;
  avg_delta: number;
  mudaram_decisao: number;
}

interface Divergencia {
  id: string;
  cnpj: string;
  company_name: string | null;
  rating_ia: number | null;
  rating_comite: number | null;
  delta_rating: number | null;
  decisao_ia: string | null;
  decisao_comite: string | null;
  created_at: string;
}

interface Response {
  windowWeeks: number;
  totalRows: number;
  totalRevisados: number;
  totalMudaramDecisao: number;
  deltaMedio: number;
  timeline: WeekBucket[];
  topDivergencias: Divergencia[];
}

export default function RatingDriftPage() {
  const [weeks, setWeeks] = useState(12);
  const [resp, setResp] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/rating-drift?weeks=${weeks}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setResp)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [weeks]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-cf-navy">
              <ArrowLeft size={14} /> Voltar
            </Link>
            <div className="h-5 w-px bg-gray-300" />
            <Activity size={18} className="text-cf-navy" />
            <h1 className="text-xl font-bold text-cf-navy">Rating Drift — IA vs Comitê</h1>
          </div>
          <div className="flex items-center gap-2">
            {[4, 12, 26, 52].map(w => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  weeks === w
                    ? "bg-cf-navy text-white border-cf-navy"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {w}sem
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-cf-navy" size={28} />
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{error}</div>}

        {!loading && !error && resp && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Total análises</div>
                <div className="text-2xl font-bold text-cf-navy mt-1.5">{resp.totalRows}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{resp.windowWeeks} semanas</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Revisadas pelo comitê</div>
                <div className="text-2xl font-bold text-cf-navy mt-1.5">{resp.totalRevisados}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {resp.totalRows > 0 ? `${((resp.totalRevisados / resp.totalRows) * 100).toFixed(0)}% das análises` : "—"}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Delta médio (Comitê − IA)</div>
                <div className={`text-2xl font-bold mt-1.5 flex items-center gap-1 ${
                  resp.deltaMedio > 0.3 ? "text-green-600" :
                  resp.deltaMedio < -0.3 ? "text-red-600" :
                  "text-cf-navy"
                }`}>
                  {resp.deltaMedio > 0 ? "+" : ""}{resp.deltaMedio.toFixed(2)}
                  {resp.deltaMedio > 0.3 && <TrendingUp size={18} />}
                  {resp.deltaMedio < -0.3 && <TrendingDown size={18} />}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {Math.abs(resp.deltaMedio) < 0.3 ? "calibrado" : resp.deltaMedio > 0 ? "IA está pessimista" : "IA está otimista"}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Decisão mudou</div>
                <div className="text-2xl font-bold text-amber-600 mt-1.5">{resp.totalMudaramDecisao}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {resp.totalRevisados > 0 ? `${((resp.totalMudaramDecisao / resp.totalRevisados) * 100).toFixed(0)}% das revisadas` : "—"}
                </div>
              </div>
            </div>

            {/* Timeline de drift */}
            {resp.timeline.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
                  Drift semanal (delta médio Comitê − IA)
                </div>
                <div className="flex items-end gap-2 h-36 border-b border-gray-200 relative">
                  {/* Linha do zero */}
                  <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-gray-300" />
                  {resp.timeline.map(w => {
                    const h = Math.abs(w.avg_delta) * 30; // 1pt = 30px
                    const cls = w.avg_delta > 0 ? "bg-green-500" : w.avg_delta < 0 ? "bg-red-500" : "bg-gray-300";
                    const above = w.avg_delta >= 0;
                    return (
                      <div key={w.week} className="flex-1 flex flex-col items-center justify-center h-full relative group">
                        <div
                          className={`w-full ${cls} ${above ? "rounded-t" : "rounded-b"}`}
                          style={{
                            height: `${Math.max(h, 2)}px`,
                            marginTop: above ? "auto" : undefined,
                            marginBottom: above ? undefined : "auto",
                          }}
                        />
                        <div className="absolute bottom-full mb-1 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                          {w.week}: Δ={w.avg_delta > 0 ? "+" : ""}{w.avg_delta.toFixed(2)} ({w.count} análises)
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-mono">
                  <span>{resp.timeline[0]?.week}</span>
                  <span>{resp.timeline[resp.timeline.length - 1]?.week}</span>
                </div>
              </div>
            )}

            {/* Top divergências */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Top 10 maiores divergências (revisões do comitê)
              </div>
              {resp.topDivergencias.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Nenhuma análise foi revisada pelo comitê ainda no período selecionado.
                </div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left py-2 px-4 font-semibold uppercase text-[10px]">Empresa</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">IA</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Comitê</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Δ</th>
                      <th className="text-center py-2 px-3 font-semibold uppercase text-[10px]">Decisão</th>
                      <th className="text-right py-2 px-3 font-semibold uppercase text-[10px]">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resp.topDivergencias.map(d => (
                      <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-4 font-semibold text-gray-800">
                          <Link href={`/empresa/${d.cnpj}`} className="hover:underline text-cf-navy">
                            {d.company_name ?? d.cnpj}
                          </Link>
                          <div className="text-[9px] text-gray-400 font-mono">{d.cnpj}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">{d.rating_ia?.toFixed(1) ?? "—"}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{d.rating_comite?.toFixed(1) ?? "—"}</td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                          (d.delta_rating ?? 0) > 0 ? "text-green-600" : "text-red-600"
                        }`}>
                          {d.delta_rating != null && d.delta_rating > 0 ? "+" : ""}
                          {d.delta_rating?.toFixed(1) ?? "—"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {d.decisao_ia !== d.decisao_comite ? (
                            <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">
                              {d.decisao_ia} → {d.decisao_comite}
                            </span>
                          ) : (
                            <span className="text-[9px] text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[10px] text-gray-500 font-mono">
                          {new Date(d.created_at).toLocaleDateString("pt-BR")}
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
