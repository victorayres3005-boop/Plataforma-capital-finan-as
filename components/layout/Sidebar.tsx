"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Plus, Clock, Settings, HelpCircle, Activity, ClipboardList, Zap, ReceiptText, BarChart2,
  ChevronLeft, ChevronRight, LogOut,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onGoToDashboard: () => void;
  onNewColeta: () => void;
  showDashboard: boolean;
  isInsideColeta: boolean;
};

function LogoFull({ height = 22 }: { height?: number }) {
  const w = Math.round(height * 7.26);
  return (
    <svg width={w} height={height} viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke="#fff" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#fff" />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill="#fff">capital</tspan>
        <tspan fill="#a8d96b">finanças</tspan>
      </text>
    </svg>
  );
}

function LogoIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 62 62" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="31" cy="27" r="22" stroke="#fff" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#fff" />
    </svg>
  );
}

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  action?: "dashboard" | "coleta";
};

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "PRINCIPAL",
    items: [
      { icon: Home,     label: "Visão Geral", action: "dashboard", href: "/" },
      { icon: Plus,     label: "Nova Coleta", action: "coleta",    href: "/" },
    ],
  },
  {
    label: "OPERAÇÕES",
    items: [
      { icon: Clock,         label: "Histórico",    href: "/historico" },
      { icon: Activity,      label: "Em Andamento", href: "/operacoes" },
      { icon: ClipboardList, label: "Pareceres",    href: "/pareceres" },
      { icon: BarChart2,     label: "Métricas",     href: "/metricas" },
      { icon: ReceiptText,   label: "Custos",       href: "/custos" },
    ],
  },
  {
    label: "INTEGRAÇÕES",
    items: [
      { icon: Zap, label: "Goalfy", href: "/importar-goalfy" },
    ],
  },
  {
    label: "CONFIGURAÇÕES",
    items: [
      { icon: Settings,   label: "Política de Fundo", href: "/configuracoes" },
      { icon: HelpCircle, label: "Suporte",        href: "/ajuda" },
    ],
  },
];

const NAVY = "#1a2f6b";
const ACTIVE_BG  = "rgba(255,255,255,0.14)";
const HOVER_BG   = "rgba(255,255,255,0.07)";
const TEXT_IDLE  = "rgba(255,255,255,0.62)";
const TEXT_ACT   = "#ffffff";
const ICON_IDLE  = "rgba(255,255,255,0.50)";

export default function Sidebar({
  collapsed, onToggleCollapse,
  onGoToDashboard, onNewColeta,
  showDashboard, isInsideColeta,
}: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string, action?: "dashboard" | "coleta") => {
    if (action === "dashboard") return pathname === "/" && showDashboard && !isInsideColeta;
    if (action === "coleta")   return pathname === "/" && isInsideColeta;
    return pathname === href.split("?")[0];
  };

  function itemStyle(active: boolean, center = false): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: center ? "center" : "flex-start",
      gap: "9px",
      padding: collapsed ? "9px 0" : "8px 10px 8px 8px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: active ? 600 : 400,
      color: active ? TEXT_ACT : TEXT_IDLE,
      background: active ? ACTIVE_BG : "transparent",
      cursor: "pointer",
      border: "none",
      borderLeft: center ? undefined : (active ? "2px solid #a8d96b" : "2px solid transparent"),
      width: "100%",
      textAlign: "left",
      textDecoration: "none",
      transition: "background 0.15s, color 0.15s, border-left-color 0.15s",
    };
  }

  function onHover(e: React.MouseEvent<HTMLElement>, active: boolean, enter: boolean) {
    if (active) return;
    const el = e.currentTarget as HTMLElement;
    el.style.background = enter ? HOVER_BG  : "transparent";
    el.style.color       = enter ? "#fff"    : TEXT_IDLE;
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href, item.action);
    const Icon   = item.icon;
    const style  = itemStyle(active, collapsed);
    const iconEl = (
      <Icon
        size={collapsed ? 18 : 15}
        style={{ flexShrink: 0, color: active ? "#fff" : ICON_IDLE }}
      />
    );

    const content = (
      <>
        {iconEl}
        {!collapsed && item.label}
      </>
    );

    const hoverProps = {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => onHover(e, active, true),
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => onHover(e, active, false),
    };

    const title = collapsed ? item.label : undefined;

    if (item.action === "dashboard") {
      return (
        <button key={item.label} onClick={onGoToDashboard} style={style} title={title} {...hoverProps}>
          {content}
        </button>
      );
    }
    if (item.action === "coleta") {
      return (
        <button key={item.label} onClick={onNewColeta} style={style} title={title} {...hoverProps}>
          {content}
        </button>
      );
    }
    return (
      <Link key={item.label} href={item.href} style={style} title={title} {...hoverProps}>
        {content}
      </Link>
    );
  }

  return (
    <aside
      className="hidden lg:flex flex-col flex-shrink-0"
      style={{
        width: collapsed ? 60 : 220,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        background: `linear-gradient(180deg, ${NAVY} 0%, #132055 100%)`,
        zIndex: 40,
        transition: "width 0.25s ease",
      }}
    >
      {/* Logo + toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "18px 0 16px" : "18px 12px 16px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={collapsed ? onToggleCollapse : onGoToDashboard}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          title={collapsed ? "Expandir menu" : "Visão Geral"}
        >
          {collapsed ? <LogoIcon size={26} /> : <LogoFull height={22} />}
        </button>

        {/* Toggle chevron — só visível quando expandido */}
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            title="Minimizar menu"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              color: "rgba(255,255,255,0.5)",
              flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
            }}
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ padding: collapsed ? "14px 6px" : "14px 10px", flex: 1 }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: collapsed ? "16px" : "22px" }}>
            {!collapsed && (
              <p style={{
                fontSize: "10px", fontWeight: 700,
                color: "rgba(255,255,255,0.28)",
                letterSpacing: "0.08em",
                padding: "0 10px", marginBottom: "4px",
              }}>
                {section.label}
              </p>
            )}
            {collapsed && <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0 0 8px" }} />}
            {section.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Rodapé — expand (collapsed) ou logout (expanded) */}
      <div style={{ padding: collapsed ? "12px 6px" : "12px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
        {collapsed ? (
          <>
            <button
              onClick={onToggleCollapse}
              title="Expandir menu"
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                padding: "8px 0", borderRadius: "8px",
                background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.5)", transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)";
                (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
              }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={handleLogout}
              title="Sair da conta"
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                padding: "8px 0", borderRadius: "8px",
                background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.4)", transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.18)";
                (e.currentTarget as HTMLElement).style.color = "#fca5a5";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)";
              }}
            >
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <button
            onClick={handleLogout}
            title="Sair da conta"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "9px",
              padding: "8px 10px 8px 8px", borderRadius: "8px",
              background: "rgba(255,255,255,0.04)", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.45)", fontSize: "13px", fontWeight: 400,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.18)";
              (e.currentTarget as HTMLElement).style.color = "#fca5a5";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
            }}
          >
            <LogOut size={15} style={{ flexShrink: 0 }} />
            Sair da conta
          </button>
        )}
      </div>
    </aside>
  );
}
