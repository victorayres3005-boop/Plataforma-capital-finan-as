import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Match exato — tem que bater 100% com pathname
const PUBLIC_EXACT = new Set<string>([
  "/login",
  "/auth/confirm",
]);

// Match por prefixo — pega tudo que começa com esses paths
const PUBLIC_PREFIXES: readonly string[] = [
  "/_next/",
  "/api/public/",
  "/auth/confirm/",
  // Endpoints internos historicamente públicos (diagnóstico, webhooks, cron)
  "/api/diag-credithub",
  "/api/test-credithub",
  "/api/debug-extraction",
  "/api/ch-diag",
  "/api/goalfy/receber",
  "/api/goalfy/webhook",
  "/api/cron/",
  "/api/debug-bureaus",
  // Relatórios públicos compartilháveis (autenticação via edit_token na URL)
  "/r/",
  "/api/r/",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const p of PUBLIC_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── 1. Rotas públicas: passa sem tocar em Supabase ────────────────────────
  // Skip do createServerClient + getSession() em rotas que não dependem de
  // auth (assets, webhooks, cron, diagnóstico). Reduz latência e custo Supabase.
  if (isPublicRoute(pathname) && pathname !== "/login") {
    return NextResponse.next();
  }

  // ─── 2. Resto do app: precisa de sessão ────────────────────────────────────
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getSession() lê o cookie local sem RTT extra — adequado para checar auth no Edge.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  // /login é público mas tem lógica especial: usuário logado é redirecionado pra home
  if (pathname === "/login") {
    if (user) {
      const next = request.nextUrl.searchParams.get("next");
      const homeUrl = request.nextUrl.clone();
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        const parsed = new URL(next, request.nextUrl.origin);
        homeUrl.pathname = parsed.pathname;
        homeUrl.search = parsed.search;
      } else {
        homeUrl.pathname = "/";
        homeUrl.search = "";
      }
      return NextResponse.redirect(homeUrl);
    }
    return response;
  }

  // Demais rotas exigem sessão
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const fullPath = pathname + (request.nextUrl.search || "");
    if (fullPath !== "/" && !fullPath.startsWith("/login")) {
      loginUrl.searchParams.set("next", fullPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
