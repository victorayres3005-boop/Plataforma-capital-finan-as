"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Operacao, OperacaoStatus, OperacaoModalidade } from "@/types";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, X, Loader2, Search, TrendingUp,
  Clock, Settings, HelpCircle, Bell, LogOut, User,
  ChevronDown, AlertTriangle, CheckCircle2, Activity,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import Logo from "@/components/Logo";
import { fmtBRL, fmtCNPJ, fmtDate } from "@/lib/formatters";

// ── Helpers ──
const STATUS_LABEL: Record<OperacaoStatus, string> = {
  ativa:        "Ativa",
  liquidada:    "Liquidada",
  inadimplente: "Inadimplente",
  prorrogada:   "Prorrogada",
};
const STATUS_STYLE: Record<OperacaoStatus, { bg: string; color: string; border: string }> = {
  ativa:        { bg: "#DCFCE7", color: "#16A34A", border: "#86EFAC" },
  liquidada:    { bg: "#E0F2FE", color: "#0369A1", border: "#7DD3FC" },
  inadimplente: { bg: "#FEE2E2", color: "#DC2626", border: "#FCA5A5" },
  prorrogada:   { bg: "#FEF3C7", color: "#D97706", border: "#FCD34D" },
};
const MODALIDADES: OperacaoModalidade[] = ["duplicata", "CCB", "CRI", "NF", "LC", "outros"];


// ── Empty form ──
const EMPTY: Omit<Operacao, "id" | "user_id" | "created_at" | "updated_at"> = {
  cnpj: "",
  company_name: "",
  collection_id: null,
  numero_operacao: "",
  data_operacao: new Date().toISOString().split("T")[0],
  data_vencimento: "",
  valor: 0,
  taxa_mensal: null,
  prazo: null,
  modalidade: "duplicata",
  status: "ativa",
  sacado: "",
  observacoes: "",
};

// ── Modal de cadastro/edição ──
function OperacaoModal({
  initial, onSave, onClose,
}: {
  initial: Omit<Operacao, "id" | "user_id" | "created_at" | "updated_at"> & { id?: string };
  onSave: (op: typeof initial) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  // Erros inline por campo — mostrados abaixo de cada input em vermelho.
  const [errors, setErrors] = useState<{ cnpj?: string; company_name?: string; valor?: string; data_operacao?: string }>({});

  const set = (k: string, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }));
    // Limpa o erro do campo assim que o usuário começa a corrigir.
    if (errors[k as keyof typeof errors]) setErrors(prev => ({ ...prev, [k]: undefined }));
  };

  const validate = () => {
    const next: typeof errors = {};
    if (!form.cnpj.trim()) next.cnpj = "CNPJ obrigatório";
    else if (form.cnpj.replace(/\D/g, "").length !== 14) next.cnpj = "CNPJ deve ter 14 dígitos";
    if (!form.company_name.trim()) next.company_name = "Empresa obrigatória";
    if (!form.valor || form.valor <= 0) next.valor = "Valor deve ser maior que zero";
    if (!form.data_operacao) next.data_operacao = "Data obrigatória";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const inputStyle = {
    width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0",
    borderRadius: "7px", fontSize: "13px", outline: "none",
    background: "#FAFBFC", color: "#1E293B",
  };
  const errorInputStyle = { ...inputStyle, border: "1px solid #FCA5A5", background: "#FEF2F2" };
  const labelStyle = { fontSize: "11px", fontWeight: 700 as const, color: "#64748B", display: "block" as const, marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: ".04em" };
  const errorMsgStyle = { fontSize: "11px", color: "#DC2626", marginTop: "4px", display: "block" as const };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "620px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #F1F5F9" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#1E293B" }}>{form.id ? "Editar Operação" : "Nova Operação"}</div>
            <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "2px" }}>Registre os dados da operação com o cedente</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: "4px" }}><X size={18} /></button>
        </div>
        <form onSubmit={handle} style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Empresa *</label>
              <input
                style={errors.company_name ? errorInputStyle : inputStyle}
                value={form.company_name}
                onChange={e => set("company_name", e.target.value)}
                placeholder="Razão social"
                aria-invalid={!!errors.company_name}
              />
              {errors.company_name && <span style={errorMsgStyle}>{errors.company_name}</span>}
            </div>
            <div>
              <label style={labelStyle}>CNPJ *</label>
              <input
                style={errors.cnpj ? errorInputStyle : inputStyle}
                value={form.cnpj}
                onChange={e => set("cnpj", e.target.value.replace(/\D/g, ""))}
                placeholder="00000000000000"
                maxLength={14}
                aria-invalid={!!errors.cnpj}
              />
              {errors.cnpj && <span style={errorMsgStyle}>{errors.cnpj}</span>}
            </div>
            <div>
              <label style={labelStyle}>Nº da Operação</label>
              <input style={inputStyle} value={form.numero_operacao || ""} onChange={e => set("numero_operacao", e.target.value)} placeholder="OP-2024-001" />
            </div>
            <div>
              <label style={labelStyle}>Data da Operação *</label>
              <input
                style={errors.data_operacao ? errorInputStyle : inputStyle}
                type="date"
                value={form.data_operacao}
                onChange={e => set("data_operacao", e.target.value)}
                aria-invalid={!!errors.data_operacao}
              />
              {errors.data_operacao && <span style={errorMsgStyle}>{errors.data_operacao}</span>}
            </div>
            <div>
              <label style={labelStyle}>Data de Vencimento</label>
              <input style={inputStyle} type="date" value={form.data_vencimento || ""} onChange={e => set("data_vencimento", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Valor (R$) *</label>
              <input
                style={errors.valor ? errorInputStyle : inputStyle}
                type="number"
                step="0.01"
                min="0"
                value={form.valor || ""}
                onChange={e => set("valor", parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                aria-invalid={!!errors.valor}
              />
              {errors.valor && <span style={errorMsgStyle}>{errors.valor}</span>}
            </div>
            <div>
              <label style={labelStyle}>Taxa a.m. (%)</label>
              <input style={inputStyle} type="number" step="0.01" min="0" value={form.taxa_mensal ?? ""} onChange={e => set("taxa_mensal", e.target.value ? parseFloat(e.target.value) : null)} placeholder="2,50" />
            </div>
            <div>
              <label style={labelStyle}>Prazo (dias)</label>
              <input style={inputStyle} type="number" min="1" value={form.prazo ?? ""} onChange={e => set("prazo", e.target.value ? parseInt(e.target.value) : null)} placeholder="90" />
            </div>
            <div>
              <label style={labelStyle}>Modalidade *</label>
              <select style={inputStyle} value={form.modalidade} onChange={e => set("modalidade", e.target.value as OperacaoModalidade)}>
                {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status *</label>
              <select style={inputStyle} value={form.status} onChange={e => set("status", e.target.value as OperacaoStatus)}>
                {(Object.entries(STATUS_LABEL) as [OperacaoStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Sacado Principal</label>
              <input style={inputStyle} value={form.sacado || ""} onChange={e => set("sacado", e.target.value)} placeholder="Nome do sacado" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Observações</label>
              <textarea style={{ ...inputStyle, resize: "vertical", minHeight: "64px" }} value={form.observacoes || ""} onChange={e => set("observacoes", e.target.value)} placeholder="Condições especiais, garantias, etc." />
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
            <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #E2E8F0", background: "#fff", fontSize: "13px", fontWeight: 600, color: "#64748B", cursor: "pointer" }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ padding: "9px 22px", borderRadius: "8px", border: "none", background: "#1a2744", fontSize: "13px", fontWeight: 700, color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1, display: "flex", alignItems: "center", gap: "7px" }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {form.id ? "Salvar Alterações" : "Registrar Operação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──
export default function OperacoesPage() {
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterModalidade, setFilterModalidade] = useState<string>("");
  const [modal, setModal] = useState<null | (Omit<Operacao, "id" | "user_id" | "created_at" | "updated_at"> & { id?: string })>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; message: string; read: boolean }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const userInitial = userName.charAt(0).toUpperCase() || "U";
  const unreadCount = notifications.filter(n => !n.read).length;

  const load = async () => {
    try {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const { data, error } = await supabase
        .from("operacoes")
        .select("*")
        .eq("user_id", u.id)
        .order("data_operacao", { ascending: false });
      if (error) throw error;
      setOperacoes((data || []) as Operacao[]);
    } catch (err) {
      toast.error("Erro ao carregar operações: " + (err instanceof Error ? err.message : String(err)));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setNotifications(data); });
  }, [user]);

  const filtered = useMemo(() => {
    return operacoes.filter(o => {
      const q = search.toLowerCase().trim();
      if (q && !o.company_name.toLowerCase().includes(q) && !o.cnpj.includes(q) && !(o.sacado || "").toLowerCase().includes(q)) return false;
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterModalidade && o.modalidade !== filterModalidade) return false;
      return true;
    });
  }, [operacoes, search, filterStatus, filterModalidade]);

  // KPIs
  const totalVolume = filtered.reduce((s, o) => s + o.valor, 0);
  const inadimplentes = filtered.filter(o => o.status === "inadimplente");
  const volumeInad = inadimplentes.reduce((s, o) => s + o.valor, 0);
  const inadPct = totalVolume > 0 ? ((volumeInad / totalVolume) * 100).toFixed(1) : "0.0";
  const taxaMediaArr = filtered.filter(o => o.taxa_mensal != null);
  const taxaMedia = taxaMediaArr.length > 0 ? (taxaMediaArr.reduce((s, o) => s + (o.taxa_mensal || 0), 0) / taxaMediaArr.length).toFixed(2) : null;

  const handleSave = async (form: Omit<Operacao, "id" | "user_id" | "created_at" | "updated_at"> & { id?: string }) => {
    const supabase = createClient();
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { toast.error("Não autenticado"); return; }

    const payload = {
      user_id: u.id,
      cnpj: form.cnpj.replace(/\D/g, ""),
      company_name: form.company_name.trim(),
      collection_id: form.collection_id || null,
      numero_operacao: form.numero_operacao?.trim() || null,
      data_operacao: form.data_operacao,
      data_vencimento: form.data_vencimento || null,
      valor: form.valor,
      taxa_mensal: form.taxa_mensal ?? null,
      prazo: form.prazo ?? null,
      modalidade: form.modalidade,
      status: form.status,
      sacado: form.sacado?.trim() || null,
      observacoes: form.observacoes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (form.id) {
      const { error } = await supabase.from("operacoes").update(payload).eq("id", form.id).eq("user_id", u.id);
      if (error) { toast.error("Erro ao salvar: " + error.message); return; }
      toast.success("Operação atualizada");
    } else {
      const { error } = await supabase.from("operacoes").insert({ ...payload, created_at: new Date().toISOString() });
      if (error) { toast.error("Erro ao registrar: " + error.message); return; }
      toast.success("Operação registrada");
    }
    setModal(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta operação permanentemente?")) return;
    setDeleting(id);
    const supabase = createClient();
    const { error } = await supabase.from("operacoes").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir: " + error.message); }
    else { toast.success("Operação excluída"); setOperacoes(prev => prev.filter(o => o.id !== id)); }
    setDeleting(null);
  };

  const kpiCard = (icon: React.ReactNode, label: string, value: string, sub?: string, accent?: string) => (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: accent ? `${accent}15` : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: accent || "#2563EB" }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "11px", color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
        <div style={{ fontSize: "22px", fontWeight: 800, color: accent || "#1E293B", lineHeight: 1.2, marginTop: "2px" }}>{value}</div>
        {sub && <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px" }}>{sub}</div>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex flex-col">
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-6 py-8">
        {/* ══ CABEÇALHO ══ */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#1E293B", margin: 0 }}>Histórico de Operações</h1>
            <p style={{ fontSize: "13px", color: "#94A3B8", marginTop: "4px" }}>Registre e acompanhe todas as operações realizadas com os cedentes do fundo</p>
          </div>
          <button
            onClick={() => setModal({ ...EMPTY })}
            style={{ display: "flex", alignItems: "center", gap: "7px", background: "#1a2744", color: "#fff", border: "none", borderRadius: "9px", padding: "10px 18px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={15} /> Nova Operação
          </button>
        </div>

        {/* ══ KPIs ══ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "24px" }}>
          {kpiCard(<Activity size={18} />, "Total", String(filtered.length), `${operacoes.length} no total`)}
          {kpiCard(<TrendingUp size={18} />, "Volume", fmtBRL(totalVolume), `${filtered.length} operações`)}
          {kpiCard(<CheckCircle2 size={18} />, "Taxa Média", taxaMedia ? `${taxaMedia}% a.m.` : "—", "sobre operações com taxa")}
          {kpiCard(<AlertTriangle size={18} />, "Inadimplência", `${inadPct}%`, `${fmtBRL(volumeInad)} em risco`, parseFloat(inadPct) > 5 ? "#DC2626" : undefined)}
        </div>

        {/* ══ FILTROS ══ */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 200px" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresa, CNPJ, sacado..."
              style={{ width: "100%", paddingLeft: "30px", paddingRight: "10px", height: "36px", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#FAFBFC" }}
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ height: "36px", padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "13px", background: "#FAFBFC", color: filterStatus ? "#1E293B" : "#94A3B8" }}
          >
            <option value="">Todos os status</option>
            {(Object.entries(STATUS_LABEL) as [OperacaoStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={filterModalidade}
            onChange={e => setFilterModalidade(e.target.value)}
            style={{ height: "36px", padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "13px", background: "#FAFBFC", color: filterModalidade ? "#1E293B" : "#94A3B8" }}
          >
            <option value="">Todas as modalidades</option>
            {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {(search || filterStatus || filterModalidade) && (
            <button onClick={() => { setSearch(""); setFilterStatus(""); setFilterModalidade(""); }}
              style={{ display: "flex", alignItems: "center", gap: "5px", height: "36px", padding: "0 12px", border: "1px solid #FCA5A5", borderRadius: "8px", background: "#FEF2F2", color: "#DC2626", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              <X size={12} /> Limpar
            </button>
          )}
        </div>

        {/* ══ TABELA ══ */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px", color: "#94A3B8", gap: "10px" }}>
              <Loader2 size={20} className="animate-spin" /> Carregando operações...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", color: "#94A3B8", gap: "12px" }}>
              <TrendingUp size={32} style={{ opacity: .3 }} />
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#CBD5E1" }}>{operacoes.length === 0 ? "Nenhuma operação registrada" : "Nenhuma operação encontrada"}</div>
              {operacoes.length === 0 && (
                <button onClick={() => setModal({ ...EMPTY })} style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "7px", background: "#1a2744", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={14} /> Registrar primeira operação
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    {["Data", "Empresa", "Modalidade", "Valor", "Taxa a.m.", "Prazo", "Vencimento", "Sacado", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const st = STATUS_STYLE[o.status];
                    return (
                      <tr key={o.id} style={{ borderBottom: "1px solid #F8FAFC" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#FAFBFC"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#64748B" }}>{fmtDate(o.data_operacao)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 700, color: "#1E293B", fontSize: "12.5px" }}>{o.company_name}</div>
                          <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "1px" }}>{fmtCNPJ(o.cnpj)}</div>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1a2744" }}>{o.modalidade}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(o.valor)}</td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{o.taxa_mensal != null ? `${o.taxa_mensal.toFixed(2)}%` : "—"}</td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{o.prazo != null ? `${o.prazo}d` : "—"}</td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#64748B" }}>{fmtDate(o.data_vencimento)}</td>
                        <td style={{ padding: "10px 12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{o.sacado || "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                            {STATUS_LABEL[o.status]}
                          </span>
                        </td>
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          <button onClick={() => setModal({ ...o })} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: "4px 6px", borderRadius: "6px" }}
                            title="Editar"><Pencil size={13} /></button>
                          <button onClick={() => handleDelete(o.id)} disabled={deleting === o.id} style={{ background: "none", border: "none", cursor: "pointer", color: "#FCA5A5", padding: "4px 6px", borderRadius: "6px" }}
                            title="Excluir">{deleting === o.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid #F8FAFC", fontSize: "11px", color: "#94A3B8" }}>
              {filtered.length} operação(ões) · Volume: {fmtBRL(totalVolume)}
            </div>
          )}
        </div>
      </main>

      {/* ══ MODAL ══ */}
      {modal && (
        <OperacaoModal
          initial={modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
