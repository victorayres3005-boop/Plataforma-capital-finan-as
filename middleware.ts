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

  // Verificação inicial rápida se o usuário possui os cookies de autenticação
  const hasSessionCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
  
  let user = null;

  if (hasSessionCookie) {
    try {
      // getUser() é o método seguro recomendado pelo Supabase, e também renova o token se necessário.
      // Como a Vercel Edge derruba a requisição em ~5s se a rede (sa-east-1) estiver instável,
      // usamos um timeout de 3.5s. Se a rede demorar, abortamos a espera aqui e deixamos passar.
      const authPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise<{ timeout: boolean }>((resolve) => 
        setTimeout(() => resolve({ timeout: true }), 3500)
      );
      
      const result = await Promise.race([authPromise, timeoutPromise]) as any;
      
      if (result.timeout) {
        // Timeout atingido: a rede do Supabase está muito lenta.
        // Falha graciosamente ("Fail Open"): não desloga o usuário, apenas deixa a requisição passar.
        // O Server Component (Node.js Serverless) fará o seu próprio getUser() que tem um limite
        // muito maior (10 a 60 segundos), então a página vai carregar sem erro 504!
        console.warn('Middleware: Supabase getUser timeout - repassando validação para o Server Component');
        return response; 
      } else if (result.data?.user) {
        user = result.data.user;
      }
    } catch (error) {
      console.error('Middleware Supabase error:', error);
      // Em caso de outro erro de rede, se tem cookie, deixa o Server Component resolver
      return response;
    }
  }

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
