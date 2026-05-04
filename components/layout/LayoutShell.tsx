"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import CommandPalette from "@/components/CommandPalette";
import ThemeToggle from "@/components/ThemeToggle";

const NO_SHELL_ROUTES = ["/login", "/auth", "/v2"];
const COLLAPSED_KEY   = "cf_sidebar_collapsed";


function RouteProgress({ pathname }: { pathname: string }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const prev = useRef(pathname);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;

    timers.current.forEach(clearTimeout);
    timers.current = [];

    setVisible(true);
    setWidth(25);
    timers.current.push(setTimeout(() => setWidth(60), 120));
    timers.current.push(setTimeout(() => setWidth(85), 350));
    timers.current.push(setTimeout(() => setWidth(100), 600));
    timers.current.push(setTimeout(() => { setVisible(false); setWidth(0); }, 800));

    return () => timers.current.forEach(clearTimeout);
  }, [pathname]);

  if (!visible) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 9999, pointerEvents: "none" }}>
      <div
        style={{
          height: "100%",
          background: "linear-gradient(90deg, #73b815, #a8d96b)",
          width: `${width}%`,
          transition: width === 0 ? "none" : "width 0.4s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "0 0 8px rgba(168,217,107,0.6)",
        }}
      />
    </div>
  );
}

function PageContent({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  return (
    <div key={pathname} className="animate-slide-up flex flex-col flex-1 min-w-0">
      {children}
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const router      = useRouter();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });

  // Mobile drawer (sidebar overlay) — fechado por padrão. Em <lg sidebar
  // some do layout normal e só abre como overlay quando o usuário toca
  // no botão hambúrguer.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Fecha o drawer ao navegar.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Bloqueia scroll do body quando drawer está aberto.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const noShell = NO_SHELL_ROUTES.some(r => pathname.startsWith(r));
  if (noShell) return <>{children}</>;
  // CommandPalette só faz sentido com sessão; ele próprio checa user via useAuth.

  const hasResume      = searchParams.has("resume");
  const hasStep        = searchParams.has("step");
  const isInsideColeta = pathname === "/" && (hasResume || hasStep);
  const showDashboard  = pathname === "/" && !isInsideColeta;

  function goToDashboard() {
    try { sessionStorage.removeItem("cf_nav_state"); } catch {/* */}
    if (pathname === "/") {
      // já em "/" — limpa querystring (resume/step) e recarrega dados sem dropar SPA state
      window.history.replaceState({}, "", "/");
      router.refresh();
    } else {
      router.push("/");
    }
  }

  function startNewColeta() {
    try { sessionStorage.removeItem("cf_nav_state"); } catch {/* */}
    window.location.href = "/?nova=true";
  }

  return (
    <div className="bg-cf-bg flex h-screen overflow-hidden">
      <RouteProgress pathname={pathname} />
      <CommandPalette />
      <ThemeToggle />
      {/* Sidebar desktop (visível >= lg) */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
        onGoToDashboard={goToDashboard}
        onNewColeta={startNewColeta}
        showDashboard={showDashboard}
        isInsideColeta={isInsideColeta}
      />

      {/* Sidebar mobile (overlay drawer) — só renderiza quando aberta para
          evitar foco/teclado capturado em desktop. */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="lg:hidden fixed inset-y-0 left-0 z-50 animate-slide-up">
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => setMobileOpen(false)}
              onGoToDashboard={() => { goToDashboard(); setMobileOpen(false); }}
              onNewColeta={() => { startNewColeta(); setMobileOpen(false); }}
              showDashboard={showDashboard}
              isInsideColeta={isInsideColeta}
              forceVisible
            />
          </div>
        </>
      )}

      <div
        id="cf-right-col"
        className="flex flex-col flex-1 min-w-0 overflow-y-auto"
        style={{ marginLeft: 0 }}
      >
        {/* Topbar mobile com hambúrguer — só aparece em <lg */}
        <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="p-2 -ml-1 rounded-md text-slate-600 hover:bg-slate-100 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
          <svg
            width="120" height="18" viewBox="0 0 451 58"
            xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças"
          >
            <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
            <circle cx="31" cy="49" r="4.5" fill="#203b88" />
            <text x="66" y="46" fontFamily="'Open Sans',Arial,sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
              <tspan fill="#203b88">capital</tspan>
              <tspan fill="#73b815">finanças</tspan>
            </text>
          </svg>
          <div className="w-9" />
        </div>
        <PageContent pathname={pathname}>
          {children}
        </PageContent>
      </div>
    </div>
  );
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cf-bg">{children}</div>}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
