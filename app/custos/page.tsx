"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import {
  ReceiptText, Settings2, TrendingDown, Cpu, Building2,
  ChevronDown, ChevronUp, Save, Info, AlertCircle,
  RefreshCw, Calendar, FileText, DollarSign,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface BureauPrices {
  credithub_empresa: number;
  assertiva_pj: number;
  assertiva_pf: number;
  bdc_empresa: number;
  bdc_socio: number;
  gemini_input_per_1m: number;
  gemini_output_per_1m: number;
}

interface AnaliseRow {
  id: string;
  company_name: string | null;
  cnpj: string | null;
  created_at: string;
  ai_analysis: Record<string, unknown> | null;
  // API usage — populated when backend is ready
  bureauCalls?: BureauCalls;
  geminiTokens?: GeminiTokens;
}

interface BureauCalls {
  credithub: number;
  assertiva_pj: number;
  assertiva_pf: number;
  bdc_empresa: number;
  bdc_socio: number;
}

interface GeminiTokens {
  input: number;
  output: number;
  model: "flash" | "pro";
}

interface CustoRow {
  id: string;
  company_name: string;
  cnpj: string;
  created_at: string;
  custo_ia: number;
  custo_bureau: number;
  total: number;
  bureauCalls: BureauCalls;
  geminiTokens: GeminiTokens | null;
  hasRealCosts: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const DEFAULT_PRICES: BureauPrices = {
  credithub_empresa: 0.80,
  assertiva_pj: 1.20,
  assertiva_pf: 0.60,
  bdc_empresa: 0.50,
  bdc_socio: 0.30,
  gemini_input_per_1m: 0.075,
  gemini_output_per_1m: 0.30,
};

const STORAGE_KEY = "capital_bureau_prices";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtBRL(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtUSD(val: number): string {
  return "$" + val.toFixed(4);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function calcCustoBureau(calls: BureauCalls, prices: BureauPrices): number {
  return (
    calls.credithub * prices.credithub_empresa +
    calls.assertiva_pj * prices.assertiva_pj +
    calls.assertiva_pf * prices.assertiva_pf +
    calls.bdc_empresa * prices.bdc_empresa +
    calls.bdc_socio * prices.bdc_socio
  );
}

function calcCustoIA(tokens: GeminiTokens | null, prices: BureauPrices): number {
  if (!tokens) return 0;
  const rate = tokens.model === "pro"
    ? { in: 1.25, out: 10.0 }
    : { in: prices.gemini_input_per_1m, out: prices.gemini_output_per_1m };
  return (tokens.input / 1_000_000) * rate.in + (tokens.output / 1_000_000) * rate.out;
}

// Estimate costs for analyses that don't have real API logs yet
function estimateBureauCalls(aiAnalysis: Record<string, unknown> | null): BureauCalls {
  const hasAI = aiAnalysis !== null;
  return {
    credithub: hasAI ? 1 : 0,
    assertiva_pj: hasAI ? 1 : 0,
    assertiva_pf: 0,    // unknown without logs
    bdc_empresa: hasAI ? 1 : 0,
    bdc_socio: 0,       // unknown without logs
  };
}

// ── Components ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, color = "#1a2f6b",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px",
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#6b7280", fontSize: "12px", fontWeight: 500 }}>
        <Icon size={14} color={color} />
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "#9ca3af" }}>{sub}</div>}
    </div>
  );
}

function PriceInput({
  label, value, onChange, prefix = "R$",
}: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string;
}) {
  const [local, setLocal] = useState(value.toFixed(prefix === "R$" ? 2 : 4));

  useEffect(() => {
    setLocal(value.toFixed(prefix === "R$" ? 2 : 4));
  }, [value, prefix]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #d1d5db", borderRadius: "6px", overflow: "hidden" }}>
        <span style={{ padding: "6px 8px", background: "#f9fafb", fontSize: "11px", color: "#9ca3af", borderRight: "1px solid #d1d5db", whiteSpace: "nowrap" }}>
          {prefix}
        </span>
        <input
          type="number"
          min={0}
          step={prefix === "R$" ? 0.01 : 0.0001}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(local);
            if (!isNaN(v) && v >= 0) onChange(v);
            else setLocal(value.toFixed(prefix === "R$" ? 2 : 4));
          }}
          style={{
            flex: 1, padding: "6px 8px", fontSize: "12px", border: "none", outline: "none",
            width: "80px", background: "transparent",
          }}
        />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CustosPage() {
  const { user, loading: authLoading } = useAuth();
  const [analyses, setAnalyses] = useState<AnaliseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<BureauPrices>(DEFAULT_PRICES);
  const [showConfig, setShowConfig] = useState(false);
  const [draftPrices, setDraftPrices] = useState<BureauPrices>(DEFAULT_PRICES);
  const [savedMsg, setSavedMsg] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [usdBrl, setUsdBrl] = useState<number>(5.0);

  // Load prices from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BureauPrices;
        setPrices(parsed);
        setDraftPrices(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch analyses from Supabase
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("document_collections")
      .select("id, company_name, cnpj, created_at, ai_analysis")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error && data) {
      setAnalyses(data as AnaliseRow[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) fetchData();
  }, [authLoading, user, fetchData]);

  // Build cost rows
  const costRows: CustoRow[] = analyses.map(a => {
    const calls = a.bureauCalls ?? estimateBureauCalls(a.ai_analysis);
    const tokens = a.geminiTokens ?? null;
    const custo_bureau = calcCustoBureau(calls, prices) * usdBrl;
    const custo_ia = calcCustoIA(tokens, prices) * usdBrl;
    return {
      id: a.id,
      company_name: a.company_name ?? "—",
      cnpj: a.cnpj ?? "—",
      created_at: a.created_at,
      custo_ia,
      custo_bureau,
      total: custo_ia + custo_bureau,
      bureauCalls: calls,
      geminiTokens: tokens,
      hasRealCosts: !!(a.bureauCalls || a.geminiTokens),
    };
  });

  // Filter by month
  const filtered = selectedMonth === "all"
    ? costRows
    : costRows.filter(r => {
        const d = new Date(r.created_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === selectedMonth;
      });

  // Available months
  const monthsAvailable = Array.from(new Set(
    analyses.map(a => {
      const d = new Date(a.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })
  )).sort((a, b) => b.localeCompare(a));

  // KPIs
  const totalCusto = filtered.reduce((s, r) => s + r.total, 0);
  const totalBureau = filtered.reduce((s, r) => s + r.custo_bureau, 0);
  const totalIA = filtered.reduce((s, r) => s + r.custo_ia, 0);
  const mediaAnalise = filtered.length > 0 ? totalCusto / filtered.length : 0;
  const totalTokens = filtered.reduce((s, r) => s + (r.geminiTokens ? r.geminiTokens.input + r.geminiTokens.output : 0), 0);
  const hasAnyRealCosts = filtered.some(r => r.hasRealCosts);

  function savePrices() {
    setPrices(draftPrices);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draftPrices));
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  const monthLabel = (key: string) => {
    const [year, month] = key.split("-");
    return `${MONTHS[parseInt(month) - 1]} ${year}`;
  };

  if (authLoading || loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: "10px", color: "#6b7280" }}>
        <RefreshCw size={18} className="animate-spin" />
        <span style={{ fontSize: "14px" }}>Carregando...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1200px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <ReceiptText size={20} color="#1a2f6b" />
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>Custos por Análise</h1>
          </div>
          <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>
            Acompanhe os custos de APIs de bureau e IA por operação de crédito
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Month filter */}
          <div style={{ position: "relative" }}>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{
                appearance: "none", padding: "8px 32px 8px 12px", fontSize: "13px",
                border: "1px solid #d1d5db", borderRadius: "8px", background: "#fff",
                color: "#374151", cursor: "pointer", outline: "none",
              }}
            >
              <option value="all">Todos os períodos</option>
              {monthsAvailable.map(m => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <Calendar size={14} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
          </div>

          {/* USD/BRL */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", background: "#fff", fontSize: "13px" }}>
            <span style={{ color: "#6b7280" }}>USD/BRL</span>
            <input
              type="number"
              min={1}
              step={0.01}
              value={usdBrl}
              onChange={e => setUsdBrl(parseFloat(e.target.value) || 5.0)}
              style={{ width: "52px", border: "none", outline: "none", fontSize: "13px", fontWeight: 600, color: "#111827", textAlign: "right" }}
            />
          </div>

          {/* Config button */}
          <button
            onClick={() => { setShowConfig(c => !c); setDraftPrices(prices); }}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", fontSize: "13px", fontWeight: 500,
              border: "1px solid #d1d5db", borderRadius: "8px",
              background: showConfig ? "#1a2f6b" : "#fff",
              color: showConfig ? "#fff" : "#374151",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <Settings2 size={14} />
            Preços
          </button>
        </div>
      </div>

      {/* Backend notice */}
      {!hasAnyRealCosts && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 16px",
          background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "10px",
          marginBottom: "20px", fontSize: "13px",
        }}>
          <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: "1px" }} />
          <div style={{ color: "#92400e", lineHeight: 1.5 }}>
            <strong>Logging de API ainda não ativado.</strong>{" "}
            Os custos exibidos são <strong>estimativas</strong> com base nos bureaus tipicamente consultados por análise.
            Ative o registro no backend para ver custos reais por chamada.
          </div>
        </div>
      )}

      {/* Price configurator */}
      {showConfig && (
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px",
          padding: "20px 24px", marginBottom: "20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#111827", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <Settings2 size={14} color="#6b7280" />
              Configurar Preços por Consulta
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {savedMsg && (
                <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 500 }}>✓ Salvo</span>
              )}
              <button
                onClick={savePrices}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "7px 14px", fontSize: "12px", fontWeight: 600,
                  background: "#1a2f6b", color: "#fff", border: "none",
                  borderRadius: "7px", cursor: "pointer",
                }}
              >
                <Save size={13} />
                Salvar
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "8px" }}>BUREAUS</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <PriceInput label="CreditHub (empresa)" value={draftPrices.credithub_empresa} onChange={v => setDraftPrices(p => ({ ...p, credithub_empresa: v }))} />
                <PriceInput label="Assertiva PJ" value={draftPrices.assertiva_pj} onChange={v => setDraftPrices(p => ({ ...p, assertiva_pj: v }))} />
                <PriceInput label="Assertiva PF (sócio)" value={draftPrices.assertiva_pf} onChange={v => setDraftPrices(p => ({ ...p, assertiva_pf: v }))} />
                <PriceInput label="BDC Empresa" value={draftPrices.bdc_empresa} onChange={v => setDraftPrices(p => ({ ...p, bdc_empresa: v }))} />
                <PriceInput label="BDC Sócio" value={draftPrices.bdc_socio} onChange={v => setDraftPrices(p => ({ ...p, bdc_socio: v }))} />
              </div>
            </div>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "8px" }}>IA — GEMINI (USD / 1M tokens)</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <PriceInput label="Flash — Input" value={draftPrices.gemini_input_per_1m} onChange={v => setDraftPrices(p => ({ ...p, gemini_input_per_1m: v }))} prefix="USD" />
                <PriceInput label="Flash — Output" value={draftPrices.gemini_output_per_1m} onChange={v => setDraftPrices(p => ({ ...p, gemini_output_per_1m: v }))} prefix="USD" />
                <div style={{ padding: "8px 10px", background: "#f9fafb", borderRadius: "6px", fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "flex-start", gap: "5px" }}>
                  <Info size={11} style={{ flexShrink: 0, marginTop: "1px" }} />
                  Gemini Pro: $1.25 input / $10.00 output (fixo)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px", marginBottom: "24px" }}>
        <KpiCard
          icon={DollarSign}
          label={`Custo Total ${selectedMonth !== "all" ? monthLabel(selectedMonth) : "(todos)"}`}
          value={fmtBRL(totalCusto)}
          sub={filtered.length + " análises"}
          color="#1a2f6b"
        />
        <KpiCard
          icon={TrendingDown}
          label="Custo Médio / Análise"
          value={fmtBRL(mediaAnalise)}
          sub="bureau + IA"
          color="#7c3aed"
        />
        <KpiCard
          icon={Building2}
          label="Custo Bureau"
          value={fmtBRL(totalBureau)}
          sub={Math.round(totalBureau / (totalCusto || 1) * 100) + "% do total"}
          color="#0891b2"
        />
        <KpiCard
          icon={Cpu}
          label="Custo IA (Gemini)"
          value={fmtBRL(totalIA)}
          sub={totalTokens > 0 ? (totalTokens / 1000).toFixed(0) + "k tokens" : "sem logs de tokens"}
          color="#d97706"
        />
      </div>

      {/* Bureau cost breakdown */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px",
        padding: "18px 20px", marginBottom: "20px",
      }}>
        <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#374151", margin: "0 0 14px", display: "flex", alignItems: "center", gap: "7px" }}>
          <Building2 size={14} color="#6b7280" />
          Estimativa por Bureau
          <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 400 }}>({filtered.length} análises)</span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
          {[
            { label: "CreditHub", key: "credithub" as const, price: prices.credithub_empresa },
            { label: "Assertiva PJ", key: "assertiva_pj" as const, price: prices.assertiva_pj },
            { label: "Assertiva PF", key: "assertiva_pf" as const, price: prices.assertiva_pf },
            { label: "BDC Empresa", key: "bdc_empresa" as const, price: prices.bdc_empresa },
            { label: "BDC Sócio", key: "bdc_socio" as const, price: prices.bdc_socio },
          ].map(({ label, key, price }) => {
            const totalCalls = filtered.reduce((s, r) => s + (r.bureauCalls[key] ?? 0), 0);
            const custoTotal = totalCalls * price * usdBrl;
            return (
              <div key={key} style={{ padding: "12px 14px", background: "#f9fafb", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>{label}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>{fmtBRL(custoTotal)}</div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{totalCalls} consultas · {fmtBRL(price * usdBrl)}/un</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-analysis table */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "8px" }}>
          <FileText size={14} color="#6b7280" />
          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#374151", margin: 0 }}>Por Análise</h3>
          {!hasAnyRealCosts && (
            <span style={{ fontSize: "11px", color: "#d97706", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "4px", padding: "2px 6px" }}>
              estimativas
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>
            Nenhuma análise encontrada para o período selecionado.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Empresa", "Data", "Bureau", "IA", "Total", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "10px 16px", textAlign: i >= 2 ? "right" : "left",
                      fontSize: "11px", fontWeight: 600, color: "#9ca3af",
                      letterSpacing: "0.05em", borderBottom: "1px solid #f3f4f6",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const expanded = expandedRow === row.id;
                  return (
                    <>
                      <tr
                        key={row.id}
                        style={{ borderBottom: "1px solid #f9fafb", cursor: "pointer" }}
                        onClick={() => setExpandedRow(expanded ? null : row.id)}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 500, color: "#111827" }}>{row.company_name}</div>
                          <div style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace" }}>{row.cnpj}</div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>
                          {fmtDate(row.created_at)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#0891b2", fontWeight: 500 }}>
                          {fmtBRL(row.custo_bureau)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#d97706", fontWeight: 500 }}>
                          {row.custo_ia > 0 ? fmtBRL(row.custo_ia) : <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#111827" }}>
                          {fmtBRL(row.total)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          {expanded ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={row.id + "-exp"} style={{ background: "#f9fafb" }}>
                          <td colSpan={6} style={{ padding: "14px 20px 16px" }}>
                            <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", fontSize: "12px" }}>
                              <div>
                                <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "8px" }}>
                                  CONSULTAS BUREAU
                                </p>
                                {[
                                  { label: "CreditHub", val: row.bureauCalls.credithub, price: prices.credithub_empresa },
                                  { label: "Assertiva PJ", val: row.bureauCalls.assertiva_pj, price: prices.assertiva_pj },
                                  { label: "Assertiva PF", val: row.bureauCalls.assertiva_pf, price: prices.assertiva_pf },
                                  { label: "BDC Empresa", val: row.bureauCalls.bdc_empresa, price: prices.bdc_empresa },
                                  { label: "BDC Sócio", val: row.bureauCalls.bdc_socio, price: prices.bdc_socio },
                                ].map(({ label, val, price }) => (
                                  <div key={label} style={{ display: "flex", gap: "16px", marginBottom: "4px", color: val > 0 ? "#374151" : "#d1d5db" }}>
                                    <span style={{ minWidth: "120px" }}>{label}</span>
                                    <span>{val} × {fmtBRL(price * usdBrl)}</span>
                                    <span style={{ fontWeight: 600 }}>{fmtBRL(val * price * usdBrl)}</span>
                                  </div>
                                ))}
                              </div>

                              <div>
                                <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "8px" }}>
                                  IA — GEMINI
                                </p>
                                {row.geminiTokens ? (
                                  <>
                                    <div style={{ color: "#374151", marginBottom: "4px" }}>
                                      Modelo: <strong>{row.geminiTokens.model === "pro" ? "Gemini Pro" : "Gemini Flash"}</strong>
                                    </div>
                                    <div style={{ color: "#374151", marginBottom: "4px" }}>
                                      Input: {row.geminiTokens.input.toLocaleString("pt-BR")} tokens
                                      · {fmtUSD(row.geminiTokens.input / 1_000_000 * (row.geminiTokens.model === "pro" ? 1.25 : prices.gemini_input_per_1m))}
                                    </div>
                                    <div style={{ color: "#374151", marginBottom: "4px" }}>
                                      Output: {row.geminiTokens.output.toLocaleString("pt-BR")} tokens
                                      · {fmtUSD(row.geminiTokens.output / 1_000_000 * (row.geminiTokens.model === "pro" ? 10.0 : prices.gemini_output_per_1m))}
                                    </div>
                                    <div style={{ fontWeight: 700, color: "#374151" }}>
                                      Total IA: {fmtBRL(row.custo_ia)}
                                    </div>
                                  </>
                                ) : (
                                  <div style={{ color: "#d1d5db" }}>Sem logs de tokens — ative o logging no backend</div>
                                )}
                              </div>

                              {!row.hasRealCosts && (
                                <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", padding: "8px 12px", background: "#fffbeb", borderRadius: "7px", fontSize: "11px", color: "#92400e" }}>
                                  <Info size={12} style={{ flexShrink: 0, marginTop: "1px" }} />
                                  Estimativa baseada no padrão de consultas da plataforma
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb" }}>
                  <td colSpan={2} style={{ padding: "12px 16px", fontSize: "12px", fontWeight: 600, color: "#374151" }}>
                    Total ({filtered.length} análises)
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#0891b2" }}>{fmtBRL(totalBureau)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#d97706" }}>{totalIA > 0 ? fmtBRL(totalIA) : "—"}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#111827", fontSize: "14px" }}>{fmtBRL(totalCusto)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
