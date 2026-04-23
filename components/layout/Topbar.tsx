"use client";

import { Bell, Settings, LogOut, Menu, X } from "lucide-react";

type NotificationItem = {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
};

type AuthUser = {
  email?: string;
  user_metadata?: { full_name?: string };
} | null;

type TopbarProps = {
  user: AuthUser;
  authLoading: boolean;
  unreadCount: number;
  notifications: NotificationItem[];
  showNotifications: boolean;
  mobileMenuOpen: boolean;
  onToggleNotifications: () => void;
  onToggleMobileMenu: () => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onSignOut: () => void;
  // logo click on mobile (sidebar hidden)
  onGoToDashboard: () => void;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function LogoSmall({ height = 22 }: { height?: number }) {
  const w = Math.round(height * 7.26);
  return (
    <svg width={w} height={height} viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#203b88" />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill="#203b88">capital</tspan>
        <tspan fill="#73b815">finanças</tspan>
      </text>
    </svg>
  );
}

const iconBtn: React.CSSProperties = {
  width: "34px", height: "34px",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#94A3B8", borderRadius: "8px",
  border: "none", background: "transparent",
  cursor: "pointer", flexShrink: 0,
  transition: "background 0.15s, color 0.15s",
};

export default function Topbar({
  user, authLoading, unreadCount, notifications, showNotifications, mobileMenuOpen,
  onToggleNotifications, onToggleMobileMenu, onMarkAllRead, onClearAll, onSignOut,
  onGoToDashboard,
}: TopbarProps) {
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "U";
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <header
      style={{
        height: "56px",
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #F1F5F9",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Mobile: logo (sidebar is hidden on mobile) */}
      <button
        onClick={onGoToDashboard}
        className="lg:hidden"
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
      >
        <LogoSmall height={22} />
      </button>

      {/* Desktop: spacer so actions stay right */}
      <div className="hidden lg:block" />

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>

        {/* Notifications */}
        {!authLoading && user && (
          <div className="relative">
            <button
              onClick={onToggleNotifications}
              style={iconBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; (e.currentTarget as HTMLElement).style.color = "#475569"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: "7px", right: "7px",
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: "#22c55e", border: "1.5px solid #fff",
                }} />
              )}
            </button>

            {showNotifications && (
              <div
                className="absolute right-0 bg-white rounded-xl border border-[#E5E7EB] shadow-lg z-50 overflow-hidden"
                style={{ top: "44px", width: "300px" }}
              >
                <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] flex items-center justify-between">
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
                    Notificações {unreadCount > 0 && `(${unreadCount})`}
                  </p>
                  {notifications.length > 0 && (
                    <button
                      onClick={onClearAll}
                      style={{ fontSize: "11px", color: "#94A3B8", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Limpar todas
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#94A3B8", textAlign: "center", padding: "28px 16px" }}>
                      Nenhuma notificação
                    </p>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #F1F5F9",
                        background: n.read ? "transparent" : "rgba(32,59,136,0.03)",
                      }}
                    >
                      <p style={{ fontSize: "12px", color: "#374151" }}>{n.message}</p>
                      <p style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px" }}>{timeAgo(n.created_at)}</p>
                    </div>
                  ))}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    style={{
                      width: "100%", fontSize: "12px", fontWeight: 600, color: "#203b88",
                      padding: "10px", border: "none", background: "transparent",
                      borderTop: "1px solid #E5E7EB", cursor: "pointer",
                    }}
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings — hidden on mobile (sidebar not visible) */}
        <a
          href="/configuracoes"
          className="hidden lg:flex"
          style={{ ...iconBtn, textDecoration: "none" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; (e.currentTarget as HTMLElement).style.color = "#475569"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
        >
          <Settings size={17} />
        </a>

        {/* Avatar + name */}
        {!authLoading && user && (
          <a
            href="/perfil"
            className="hidden sm:flex items-center gap-2"
            style={{ padding: "4px 8px", borderRadius: "8px", textDecoration: "none", marginLeft: "4px", transition: "background 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "white" }}>{initials}</span>
            </div>
            <span style={{
              fontSize: "13px", fontWeight: 500, color: "#374151",
              maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {displayName}
            </span>
          </a>
        )}

        {/* Sign out */}
        {!authLoading && user && (
          <button
            onClick={onSignOut}
            style={iconBtn}
            title="Sair"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#FEF2F2"; (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
          >
            <LogOut size={16} />
          </button>
        )}

        {/* Mobile hamburger */}
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden"
          style={{ ...iconBtn, marginLeft: "4px" }}
          aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}
