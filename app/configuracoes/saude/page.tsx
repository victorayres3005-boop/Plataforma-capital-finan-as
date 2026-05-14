"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Activity, BarChart2, TrendingUp, CheckCircle2, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import SchemaHealthBanner from "@/components/SchemaHealthBanner";

type HealthResponse = {
  healthy: boolean;
  summary: { ok: number; missing: number; errored: number; total: number };
};

export default function SaudeDoSistemaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/health/schema", { cache: "no-store" })
      .then(r => r.json())
      .then((d: HealthResponse) => setHealth(d))
      .catch(() => setHealth(null));
  }, [user]);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB" }}>
      {/* Banner aparece só quando há problema. Quando tudo OK, retorna null. */}
      <SchemaHealthBanner />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 48px" }}>
        <Breadcrumb
          items={[
            { label: "Configurações", href: "/configuracoes" },
            { label: "Saúde do Sistema" },
          ]}
        />

        <header style={{ marginTop: 16, marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <Activity size={24} style={{ color: "#203b88" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a2f6b" }}>
              Saúde do Sistema
            </h1>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
              Diagnóstico interno da plataforma — status do banco, métricas de extração e calibração da IA.
            </p>
          </div>
        </header>

        {/* Status do banco (quando saudável, mostramos a caixa verde — quando não,
            o SchemaHealthBanner acima já cobre o aviso vermelho/amarelo). */}
        {health?.healthy && (
          <div style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            padding: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}>
            <CheckCircle2 size={20} style={{ color: "#16a34a", flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "#14532d" }}>
                Banco de dados saudável
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#166534" }}>
                Todas as {health.summary.total} colunas críticas verificadas estão presentes no schema.
              </p>
            </div>
          </div>
        )}

        {/* Cards-link pras ferramentas que já existem em /admin/* */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}>
          <DiagCard
            href="/admin/extraction"
            icon={BarChart2}
            title="Métricas de Extração"
            description="Estatísticas dos PDFs processados pela IA: tempo médio, campos preenchidos, taxa de cache, distribuição por tipo de documento."
          />
          <DiagCard
            href="/admin/rating-drift"
            icon={TrendingUp}
            title="Rating IA × Comitê"
            description="Comparação entre o rating sugerido pela IA e a decisão final do comitê. Útil para identificar onde a IA diverge e ajustar o prompt."
          />
        </div>
      </div>
    </div>
  );
}

type DiagCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

function DiagCard({ href, icon: Icon, title, description }: DiagCardProps) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 18,
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.borderColor = "#203b88";
        el.style.boxShadow = "0 4px 12px rgba(32,59,136,0.08)";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.borderColor = "#e5e7eb";
        el.style.boxShadow = "none";
        el.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Icon size={20} style={{ color: "#203b88" }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#1a2f6b" }}>{title}</h3>
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#4b5563" }}>{description}</p>
      <p style={{ margin: "12px 0 0", fontSize: 12, fontWeight: 500, color: "#203b88" }}>
        Abrir →
      </p>
    </Link>
  );
}
