import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
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
          catch (err) { console.error(`Cookie set failed for ${name}:`, err); }
        },
        remove(name: string, options: Record<string, unknown>) {
          try { cookieStore.set({ name, value: "", maxAge: 0, ...options }); }
          catch (err) { console.error(`Cookie remove failed for ${name}:`, err); }
        },
      },
    }
  );
}
