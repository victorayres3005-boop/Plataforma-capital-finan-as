"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";

const NO_SHELL_ROUTES = ["/login", "/auth"];
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

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const noShell = NO_SHELL_ROUTES.some(r => pathname.startsWith(r));
  if (noShell) return <>{children}</>;

  const hasResume      = searchParams.has("resume");
  const hasStep        = searchParams.has("step");
  const isInsideColeta = pathname === "/" && (hasResume || hasStep);
  const showDashboard  = pathname === "/" && !isInsideColeta;

  function goToDashboard() {
    if (pathname === "/") {
      try { sessionStorage.removeItem("cf_nav_state"); } catch {/* */}
      window.history.replaceState({}, "", "/");
      window.location.reload();
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
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
        onGoToDashboard={goToDashboard}
        onNewColeta={startNewColeta}
        showDashboard={showDashboard}
        isInsideColeta={isInsideColeta}
      />
      <div
        id="cf-right-col"
        className="flex flex-col flex-1 min-w-0 overflow-y-auto transition-all duration-300"
        style={{ marginLeft: 0 }}
      >
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
