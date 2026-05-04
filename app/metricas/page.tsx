"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart2, CheckCircle, XCircle, Clock, AlertTriangle, TrendingUp, Users, RefreshCw, HelpCircle } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type Periodo = "7" | "30" | "90";

interface Metricas {
  porDecisao: {
    aprovado: number;
    condicional: number;
    pendente: number;
    reprovado: number;
    questionamento: number;
    em_andamento: number;
  };
  ranking: { name: string; total: number; aprovado: number; reprovado: number; pendente: number; questionamento: number }[];
  ratingMedio: number;
  total: number;
}

export default function MetricasPage() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [data, setData] = useState<Metricas | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (p: Periodo) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metricas?dias=${p}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(periodo); }, [periodo, fetch_]);

  const total = data ? (data.porDecisao.aprovado + data.porDecisao.condicional + data.porDecisao.pendente + data.porDecisao.reprovado + data.porDecisao.questionamento) : 0;
  const taxaAprov = total > 0 ? Math.round(((data!.porDecisao.aprovado + data!.porDecisao.condicional) / total) * 100) : 0;

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-8">

      <Breadcrumb items={[{ label: "Métricas", current: true }]} className="mb-4" />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#163269] flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#163269]">Métricas</h1>
            <p className="text-xs text-slate-400">Visão consolidada da equipe</p>
          </div>
        </div>

        {/* Filtro de período */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["7", "30", "90"] as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                periodo === p ? "bg-white text-[#163269] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p === "7" ? "7 dias" : p === "30" ? "30 dias" : "90 dias"}
            </button>
          ))}
          <button onClick={() => fetch_(periodo)} className="ml-1 p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Carregando métricas...</div>
      ) : data ? (
        <>
          {/* Cards de decisão */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <Card
              icon={<CheckCircle className="w-5 h-5" />}
              label="Aprovados"
              value={data.porDecisao.aprovado + data.porDecisao.condicional}
              sub={data.porDecisao.condicional > 0 ? `${data.porDecisao.condicional} cond.` : undefined}
              color="green"
              pct={total > 0 ? Math.round(((data.porDecisao.aprovado + data.porDecisao.condicional) / total) * 100) : 0}
            />
            <Card
              icon={<XCircle className="w-5 h-5" />}
              label="Reprovados"
              value={data.porDecisao.reprovado}
              color="red"
              pct={total > 0 ? Math.round((data.porDecisao.reprovado / total) * 100) : 0}
            />
            <Card
              icon={<Clock className="w-5 h-5" />}
              label="Pendentes"
              value={data.porDecisao.pendente}
              color="amber"
              pct={total > 0 ? Math.round((data.porDecisao.pendente / total) * 100) : 0}
            />
            <Card
              icon={<HelpCircle className="w-5 h-5" />}
              label="Questionamentos"
              value={data.porDecisao.questionamento}
              color="cyan"
              pct={total > 0 ? Math.round((data.porDecisao.questionamento / total) * 100) : 0}
            />
            <Card
              icon={<AlertTriangle className="w-5 h-5" />}
              label="Em Andamento"
              value={data.porDecisao.em_andamento}
              color="blue"
            />
          </div>

          {/* KPIs secundários */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-[#84BF41]" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Taxa de Aprovação</span>
              </div>
              <div className="text-3xl font-bold text-[#163269]">{taxaAprov}%</div>
              <div className="text-xs text-slate-400 mt-1">{total} análises finalizadas</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="w-4 h-4 text-[#163269]" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rating Médio</span>
              </div>
              <div className="text-3xl font-bold text-[#163269]">
                {data.ratingMedio > 0 ? data.ratingMedio.toFixed(1) : "—"}
              </div>
              <div className="text-xs text-slate-400 mt-1">das análises com IA</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-[#163269]" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total no Período</span>
              </div>
              <div className="text-3xl font-bold text-[#163269]">{data.total}</div>
              <div className="text-xs text-slate-400 mt-1">últimos {periodo} dias</div>
            </div>
          </div>

          {/* Ranking de analistas */}
          {data.ranking.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#163269]" />
                <h2 className="font-semibold text-[#163269] text-sm">Ranking de Analistas</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">#</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Analista</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-green-600 uppercase tracking-wide">Aprov.</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-red-500 uppercase tracking-wide">Reprov.</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-amber-500 uppercase tracking-wide">Pend.</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-cyan-600 uppercase tracking-wide">Quest.</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Taxa Aprov.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((a, i) => {
                    const taxa = a.total > 0 ? Math.round((a.aprovado / a.total) * 100) : 0;
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{i + 1}</td>
                        <td className="px-5 py-3.5 font-medium text-slate-700">{a.name}</td>
                        <td className="px-4 py-3.5 text-center font-bold text-[#163269]">{a.total}</td>
                        <td className="px-4 py-3.5 text-center text-green-600 font-semibold">{a.aprovado}</td>
                        <td className="px-4 py-3.5 text-center text-red-500 font-semibold">{a.reprovado}</td>
                        <td className="px-4 py-3.5 text-center text-amber-500 font-semibold">{a.pendente}</td>
                        <td className="px-4 py-3.5 text-center text-cyan-600 font-semibold">{a.questionamento ?? 0}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                            taxa >= 70 ? "bg-green-100 text-green-700" :
                            taxa >= 40 ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-600"
                          }`}>{taxa}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Card({ icon, label, value, sub, color, pct }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: "green" | "red" | "amber" | "blue" | "cyan";
  pct?: number;
}) {
  const colors = {
    green: { bg: "bg-green-50", border: "border-green-100", icon: "text-green-600", value: "text-green-700", bar: "bg-green-500" },
    red:   { bg: "bg-red-50",   border: "border-red-100",   icon: "text-red-500",   value: "text-red-600",   bar: "bg-red-500" },
    amber: { bg: "bg-amber-50", border: "border-amber-100", icon: "text-amber-500", value: "text-amber-600", bar: "bg-amber-500" },
    blue:  { bg: "bg-blue-50",  border: "border-blue-100",  icon: "text-blue-500",  value: "text-blue-600",  bar: "bg-blue-500" },
    cyan:  { bg: "bg-cyan-50",  border: "border-cyan-100",  icon: "text-cyan-600",  value: "text-cyan-700",  bar: "bg-cyan-500" },
  }[color];

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-xl p-4 shadow-sm`}>
      <div className={`${colors.icon} mb-2`}>{icon}</div>
      <div className={`text-3xl font-bold ${colors.value}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1 font-medium">{label}{sub ? <span className="text-slate-400 ml-1">({sub})</span> : null}</div>
      {pct !== undefined && (
        <div className="mt-3">
          <div className="h-1 bg-white rounded-full overflow-hidden">
            <div className={`h-full ${colors.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{pct}% do total</div>
        </div>
      )}
    </div>
  );
}
