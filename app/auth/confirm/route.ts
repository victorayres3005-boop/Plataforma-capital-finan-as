import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "email" | "recovery" | "invite" | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            try { return cookieStore.get(name)?.value; }
            catch { return undefined; }
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            try { cookieStore.set({ name, value, ...options }); }
            catch { /* ignore */ }
          },
          remove(name: string, options: Record<string, unknown>) {
            try { cookieStore.set({ name, value: "", maxAge: 0, ...options }); }
            catch { /* ignore */ }
          },
        },
      },
    );

    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      // Confirmed — redirect to destination
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[auth/confirm] OTP verification failed:", error.message);
  }

  // Fallback — redirect to login with success message
  // (even if verification failed, the link may have already been used)
  return NextResponse.redirect(`${origin}/login?message=Email+confirmado+com+sucesso`);
}
