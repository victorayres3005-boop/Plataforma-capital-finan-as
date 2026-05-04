"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { PoliticaCreditoTab } from "@/components/politica/PoliticaCreditoTab";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export default function ConfiguracoesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#203b88" }} />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", display: "flex", flexDirection: "column" }}>

      {/* ── Hero header ── */}
      <div style={{ background: "linear-gradient(135deg, #1a2f6b 0%, #203b88 60%, #1e3a8a 100%)", padding: "32px 32px 28px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "rgba(168,217,107,0.15)", border: "1px solid rgba(168,217,107,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <SlidersHorizontal size={22} style={{ color: "#a8d96b" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.3px" }}>
                  Política de Crédito
                </h1>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: "#fbbf24",
                  background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)",
                  borderRadius: 4, padding: "2px 7px",
                }}>V2</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "3px 0 0" }}>
                Configure os critérios, pesos e parâmetros aplicados nas análises de crédito
              </p>
            </div>
          </div>
        </div>
      </div>

      <main style={{ flex: 1, maxWidth: "1200px", margin: "0 auto", width: "100%", padding: "20px 32px 28px", boxSizing: "border-box" }}>
        <Breadcrumb items={[{ label: "Política de Crédito", current: true }]} className="mb-4" />
        <PoliticaCreditoTab userId={user.id} />
      </main>
    </div>
  );
}
