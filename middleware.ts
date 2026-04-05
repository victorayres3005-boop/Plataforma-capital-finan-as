import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/auth/confirm", "/api/extract", "/api/analyze"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Response mutável para setar cookies
  let response = NextResponse.next({ request });

  // 2. Client Supabase com getter/setter de cookies na request/response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Set on request (for SSR downstream)
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // Recreate response with updated request
          response = NextResponse.next({ request });
          // Set on response (for browser)
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // 3. getUser() — also refreshes token if needed
  const { data: { user } } = await supabase.auth.getUser();

  // 4. Check if route is public
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // 5. Redirect logic
  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  // 6. Return response with updated cookies
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
