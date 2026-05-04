"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Plus, Clock, Activity, ClipboardList,
  BarChart2, ReceiptText, Zap, Settings, HelpCircle,
  ChevronLeft, ChevronRight, LogOut, type LucideIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { T } from "../theme";

const COLLAPSED_KEY = "v2_sidebar_collapsed";

type NavItem = { icon: LucideIcon; label: string; href: string };

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Visão Geral", href: "/v2" },
      { icon: Plus,            label: "Nova Coleta", href: "/" },
    ],
  },
  {
    label: "Operações",
    items: [
      { icon: Clock,         label: "Histórico",    href: "/historico" },
      { icon: Activity,      label: "Em Andamento", href: "/operacoes" },
      { icon: ClipboardList, label: "Pareceres",    href: "/v2/pareceres" },
      { icon: BarChart2,     label: "Métricas",     href: "/v2/metricas" },
      { icon: ReceiptText,   label: "Custos",       href: "/custos" },
    ],
  },
  {
    label: "Integrações",
    items: [{ icon: Zap, label: "Goalfy", href: "/importar-goalfy" }],
  },
  {
    label: "Configurações",
    items: [
      { icon: Settings,   label: "Política de Fundo", href: "/configuracoes" },
      { icon: HelpCircle, label: "Suporte",            href: "/ajuda" },
    ],
  },
];

function Logo({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <svg width={26} height={26} viewBox="0 0 62 62" fill="none">
        <circle cx="31" cy="27" r="22" stroke={T.accent} strokeWidth="4.5" fill="none" />
        <circle cx="31" cy="49" r="4.5" fill={T.accent} />
      </svg>
    );
  }
  return (
    <svg width={144} height={20} viewBox="0 0 451 58" fill="none">
      <circle cx="31" cy="27" r="22" stroke={T.accent} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={T.accent} />
      <text x="66" y="46" fontFamily="'DM Sans', sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill={T.textPrimary}>capital</tspan>
        <tspan fill={T.accent}>finanças</tspan>
      </text>
    </svg>
  );
}

export default function SidebarV2() {
  const pathname = usePathname();
  const router   = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  function toggle() {
    setCollapsed(c => {
      localStorage.setItem(COLLAPSED_KEY, String(!c));
      return !c;
    });
  }

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) => {
    if (href === "/v2") return pathname === "/v2";
    return pathname.startsWith(href) && href !== "/";
  };

  const w = collapsed ? 64 : 240;

  return (
    <aside style={{
      width: w, minWidth: w, height: "100vh",
      display: "flex", flexDirection: "column",
      background: T.bgSidebar,
      borderRight: `1px solid ${T.borderSidebar}`,
      transition: "width 0.2s ease",
      overflow: "hidden", flexShrink: 0, zIndex: 40,
    }}>

      {/* Logo + toggle */}
      <div style={{
        height: 56, display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "0" : "0 12px 0 16px",
        borderBottom: `1px solid ${T.borderSidebar}`,
        flexShrink: 0,
      }}>
        <Link href="/v2" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <Logo collapsed={collapsed} />
        </Link>
        {!collapsed && (
          <button onClick={toggle} style={toggleBtnStyle}>
            <ChevronLeft size={13} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? "12px 6px" : "12px 8px", overflowY: "auto", overflowX: "hidden" }}>
        {NAV.map(section => (
          <div key={section.label} style={{ marginBottom: 20 }}>
            {!collapsed && (
              <p style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.12em", color: T.textMuted,
                padding: "0 8px", marginBottom: 4,
              }}>
                {section.label}
              </p>
            )}
            {section.items.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  style={navItemStyle(active, collapsed)}
                  onMouseEnter={e => !active && hoverIn(e)}
                  onMouseLeave={e => !active && hoverOut(e)}
                >
                  <item.icon
                    size={15}
                    style={{
                      flexShrink: 0,
                      color: active ? T.accent : T.textMuted,
                      filter: active ? `drop-shadow(${T.accentGlowSm})` : "none",
                      transition: "color 0.15s, filter 0.15s",
                    }}
                  />
                  {!collapsed && (
                    <span style={{
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      color: active ? T.textPrimary : T.textSecondary,
                    }}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{
        padding: collapsed ? "10px 6px" : "10px 8px",
        borderTop: `1px solid ${T.borderSidebar}`,
        flexShrink: 0, display: "flex", flexDirection: "column", gap: 4,
      }}>
        {collapsed && (
          <button
            onClick={toggle}
            title="Expandir"
            style={{ ...navItemStyle(false, true), border: "none", cursor: "pointer", justifyContent: "center" }}
            onMouseEnter={e => hoverIn(e)}
            onMouseLeave={e => hoverOut(e)}
          >
            <ChevronRight size={13} style={{ color: T.textMuted }} />
          </button>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Sair" : undefined}
          style={{
            ...navItemStyle(false, collapsed),
            border: "none", cursor: "pointer",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(239,68,68,0.10)";
            el.querySelectorAll("svg").forEach(s => ((s as SVGElement).style.color = "#F87171"));
            const span = el.querySelector("span");
            if (span) span.style.color = "#F87171";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "transparent";
            el.querySelectorAll("svg").forEach(s => ((s as SVGElement).style.color = T.textMuted));
            const span = el.querySelector("span");
            if (span) span.style.color = T.textSecondary;
          }}
        >
          <LogOut size={14} style={{ flexShrink: 0, color: T.textMuted }} />
          {!collapsed && <span style={{ fontSize: 13, whiteSpace: "nowrap", color: T.textSecondary }}>Sair da conta</span>}
        </button>
      </div>
    </aside>
  );
}

const toggleBtnStyle: React.CSSProperties = {
  width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.04)", border: `1px solid ${T.borderSidebar}`,
  borderRadius: 6, cursor: "pointer", color: T.textMuted, flexShrink: 0,
};

function navItemStyle(active: boolean, collapsed: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    gap: 10,
    padding: collapsed ? "8px 0" : "7px 10px",
    borderRadius: 6,
    borderLeft: active && !collapsed ? `2px solid ${T.accent}` : "2px solid transparent",
    paddingLeft: active && !collapsed ? 8 : collapsed ? 0 : 10,
    background: active ? T.accentDim : "transparent",
    boxShadow: active && !collapsed ? `inset 0 0 20px rgba(132,191,65,0.04)` : "none",
    textDecoration: "none", fontSize: 13,
    fontWeight: active ? 500 : 400,
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
    width: "100%", textAlign: "left",
  };
}

function hoverIn(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget as HTMLElement;
  el.style.background = "rgba(255,255,255,0.04)";
}
function hoverOut(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget as HTMLElement;
  el.style.background = "transparent";
}
