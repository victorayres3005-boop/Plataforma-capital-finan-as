"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Plus, Clock, Settings, HelpCircle, ClipboardList, Zap, ReceiptText, BarChart2,
  ChevronLeft, ChevronRight, ChevronDown, Activity, LogOut,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onGoToDashboard: () => void;
  onNewColeta: () => void;
  showDashboard: boolean;
  isInsideColeta: boolean;
  // Quando true, ignora a media-query "hidden lg:flex" e força visibilidade.
  // Usado pelo overlay mobile (drawer) renderizado em <lg.
  forceVisible?: boolean;
};

// LogoFull/LogoIcon antigos foram substituídos pelo componente <Logo /> compartilhado
// (variant "full"/"icon", light=true para fundo navy do sidebar).

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  action?: "dashboard" | "coleta";
  children?: Array<{ icon: LucideIcon; label: string; href: string }>;
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
      {
        icon: Settings,
        label: "Política de Fundo",
        href: "/configuracoes",
        children: [
          { icon: Settings,  label: "Política",          href: "/configuracoes" },
          { icon: Activity,  label: "Saúde do Sistema",  href: "/configuracoes/saude" },
        ],
      },
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
  forceVisible = false,
}: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  // Sub-menus expansíveis. `expandedKeys` controla quais pais estão abertos
  // (modo expandido da sidebar). `popupKey` controla qual pai tem popup aberto
  // (modo minimizado). Auto-expande o pai se a rota atual bate com algum filho.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    NAV_SECTIONS.forEach(sec => sec.items.forEach(it => {
      if (it.children?.some(c => pathname === c.href.split("?")[0])) {
        initial.add(it.label);
      }
    }));
    return initial;
  });
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Fecha popup quando clica fora dele
  useEffect(() => {
    if (!popupKey) return;
    function onDocClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopupKey(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [popupKey]);

  function toggleExpanded(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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
    const hasChildren = !!item.children && item.children.length > 0;
    const childActive = hasChildren && item.children!.some(c => pathname === c.href.split("?")[0]);
    const active = isActive(item.href, item.action) || childActive;
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

    // Item com sub-menu (children): comportamento diferente expandido vs minimizado.
    if (hasChildren) {
      const expanded = expandedKeys.has(item.label);
      const popupOpen = popupKey === item.label;

      // Modo expandido: clica no pai abre/fecha; filhos aparecem indentados.
      if (!collapsed) {
        return (
          <div key={item.label}>
            <button
              onClick={() => toggleExpanded(item.label)}
              style={{ ...style, justifyContent: "space-between" }}
              {...hoverProps}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                {iconEl}
                {item.label}
              </span>
              <ChevronDown
                size={14}
                style={{
                  flexShrink: 0,
                  color: active ? "#fff" : ICON_IDLE,
                  transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 0.15s",
                }}
              />
            </button>
            {expanded && (
              <div style={{ marginLeft: "18px", marginTop: "2px", display: "flex", flexDirection: "column", gap: "2px" }}>
                {item.children!.map(child => {
                  const cActive = pathname === child.href.split("?")[0];
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.label}
                      href={child.href}
                      style={{
                        ...itemStyle(cActive, false),
                        padding: "6px 10px 6px 8px",
                        fontSize: "12.5px",
                      }}
                      onMouseEnter={e => onHover(e, cActive, true)}
                      onMouseLeave={e => onHover(e, cActive, false)}
                    >
                      <ChildIcon size={13} style={{ flexShrink: 0, color: cActive ? "#fff" : ICON_IDLE }} />
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      // Modo minimizado: clica no ícone abre popup à direita com os filhos.
      return (
        <div key={item.label} style={{ position: "relative" }}>
          <button
            onClick={() => setPopupKey(popupOpen ? null : item.label)}
            style={style}
            title={title}
            {...hoverProps}
          >
            {iconEl}
          </button>
          {popupOpen && (
            <div
              ref={popupRef}
              style={{
                position: "absolute",
                left: "100%",
                top: 0,
                marginLeft: "8px",
                background: "#132055",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "8px",
                padding: "6px",
                minWidth: "180px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                zIndex: 50,
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <p style={{
                fontSize: "10px", fontWeight: 700,
                color: "rgba(255,255,255,0.4)",
                letterSpacing: "0.08em",
                padding: "4px 10px 6px",
                margin: 0,
              }}>
                {item.label.toUpperCase()}
              </p>
              {item.children!.map(child => {
                const cActive = pathname === child.href.split("?")[0];
                const ChildIcon = child.icon;
                return (
                  <Link
                    key={child.label}
                    href={child.href}
                    onClick={() => setPopupKey(null)}
                    style={{ ...itemStyle(cActive, false), fontSize: "13px" }}
                    onMouseEnter={e => onHover(e, cActive, true)}
                    onMouseLeave={e => onHover(e, cActive, false)}
                  >
                    <ChildIcon size={14} style={{ flexShrink: 0, color: cActive ? "#fff" : ICON_IDLE }} />
                    {child.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

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
      className={forceVisible ? "flex flex-col flex-shrink-0" : "hidden lg:flex flex-col flex-shrink-0"}
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
          onClick={onGoToDashboard}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          title="Visão Geral"
        >
          {collapsed ? <Logo variant="icon" light height={26} /> : <Logo light height={22} />}
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
