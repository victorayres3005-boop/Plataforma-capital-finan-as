"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, TrendingUp, AlertTriangle, Database, Clock } from "lucide-react";

interface AggregateStats {
  docType: string;
  total: number;
  avgFilledFields: number;
  avgDurationMs: number;
  warningsRatio: number;
  cachedRatio: number;
  aiRatio: number;
  byInputMode: Record<string, number>;
}

interface Response {
  windowDays: number;
  totalRows: number;
  stats: AggregateStats[];
  timeline: Array<{ date: string; count: number }>;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cnpj: "CNPJ",
  qsa: "QSA",
  contrato_social: "Contrato Social",
  faturamento: "Faturamento",
  scr: "SCR",
  protestos: "Protestos",
  processos: "Processos",
  dre: "DRE",
  balanco: "Balanço",
  ir_socio: "IR Sócio",
  curva_abc: "Curva ABC",
  relatorio_visita: "Rel. Visita",
  ccf: "CCF",
  grupo_economico: "Grupo Econ.",
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function ms(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

export default function AdminExtractionPage() {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<Response | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/extraction-metrics?days=${days}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setResp)
      .catch(e => setError(e.message || "Erro"))
      .finally(() => setLoading(false));
  }, [days]);

  const totalExtractions = resp?.stats.reduce((a, s) => a + s.total, 0) ?? 0;
  const avgWarningsRatio = resp && resp.stats.length > 0
    ? resp.stats.reduce((a, s) => a + s.warningsRatio * s.total, 0) / totalExtractions
    : 0;
  const avgCachedRatio = resp && resp.stats.length > 0
    ? resp.stats.reduce((a, s) => a + s.cachedRatio * s.total, 0) / totalExtractions
    : 0;
  const avgDurationMs = resp && resp.stats.length > 0
    ? resp.stats.reduce((a, s) => a + s.avgDurationMs * s.total, 0) / totalExtractions
    : 0;

  const maxTimeline = Math.max(1, ...(resp?.timeline.map(t => t.count) ?? [1]));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-cf-navy transition-colors"
            >
              <ArrowLeft size={14} /> Voltar
            </Link>
            <div className="h-5 w-px bg-gray-300" />
            <h1 className="text-xl font-bold text-cf-navy">Dashboard de Extração</h1>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  days === d
                    ? "bg-cf-navy text-white border-cf-navy"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-cf-navy" size={28} />
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && resp && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <KpiBox
                icon={<Database size={16} className="text-cf-navy" />}
                label="Total extrações"
                value={totalExtractions.toLocaleString("pt-BR")}
                sub={`${resp.windowDays} dias`}
              />
              <KpiBox
                icon={<AlertTriangle size={16} className="text-amber-600" />}
                label="Com warnings"
                value={pct(avgWarningsRatio)}
                sub="média ponderada"
              />
              <KpiBox
                icon={<TrendingUp size={16} className="text-green-600" />}
                label="Cache hit"
                value={pct(avgCachedRatio)}
                sub="economia de tokens"
              />
              <KpiBox
                icon={<Clock size={16} className="text-blue-600" />}
                label="Duração média"
                value={ms(avgDurationMs)}
                sub="por extração"
              />
            </div>

            {/* Timeline */}
            {resp.timeline.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
                  Extrações por dia
                </div>
                <div className="flex items-end gap-1 h-32">
                  {resp.timeline.map((t) => {
                    const h = Math.max(2, Math.round((t.count / maxTimeline) * 120));
                    return (
                      <div
                        key={t.date}
                        className="flex-1 bg-cf-navy/70 rounded-t hover:bg-cf-navy transition-colors relative group cursor-default"
                        style={{ height: `${h}px` }}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {t.date}: {t.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-mono">
                  <span>{resp.timeline[0]?.date}</span>
                  <span>{resp.timeline[resp.timeline.length - 1]?.date}</span>
                </div>
              </div>
            )}

            {/* Table por tipo */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  Detalhes por tipo de documento
                </div>
              </div>
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left py-2 px-4 font-semibold uppercase text-[10px] tracking-wide">Tipo</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase text-[10px] tracking-wide">Total</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase text-[10px] tracking-wide">Campos</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase text-[10px] tracking-wide">Duração</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase text-[10px] tracking-wide">Warnings</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase text-[10px] tracking-wide">Cache</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase text-[10px] tracking-wide">Modo</th>
                  </tr>
                </thead>
                <tbody>
                  {resp.stats.map((s) => (
                    <tr key={s.docType} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-semibold text-gray-800">
                        {DOC_TYPE_LABELS[s.docType] ?? s.docType}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">{s.total.toLocaleString("pt-BR")}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-600">{s.avgFilledFields.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-600">{ms(s.avgDurationMs)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-mono ${s.warningsRatio > 0.3 ? "text-red-600 font-semibold" : s.warningsRatio > 0.1 ? "text-amber-600" : "text-gray-500"}`}>
                          {pct(s.warningsRatio)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-green-600">{pct(s.cachedRatio)}</td>
                      <td className="py-2.5 px-3 text-right text-[10px] text-gray-500">
                        {Object.entries(s.byInputMode)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 2)
                          .map(([m, c]) => `${m}:${c}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resp.stats.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">
                Nenhuma extração nos últimos {resp.windowDays} dias.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KpiBox({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-cf-navy mt-1.5">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
