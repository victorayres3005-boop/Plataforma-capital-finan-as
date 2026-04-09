/**
 * Cache persistente para resultados de bureau — usa Supabase como backend.
 * Substitui o Map em memória que resetava a cada deploy na Vercel.
 *
 * Setup: executar a migration SQL abaixo no Supabase SQL Editor:
 *
 *   create table if not exists bureau_cache (
 *     cnpj      text primary key,
 *     result    jsonb not null,
 *     expires_at timestamptz not null,
 *     created_at timestamptz default now()
 *   );
 *   -- Limpeza automática de registros expirados (opcional)
 *   create index if not exists bureau_cache_expires_idx on bureau_cache (expires_at);
 */

import { createClient } from "@supabase/supabase-js";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

// Cliente server-side sem contexto de cookies (service role quando disponível)
function getClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function cacheGet<T>(cnpj: string): Promise<T | null> {
  const db = getClient();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("bureau_cache")
      .select("result, expires_at")
      .eq("cnpj", cnpj)
      .single();
    if (error || !data) return null;
    if (new Date(data.expires_at) <= new Date()) {
      // Expirado — limpa assincronamente
      db.from("bureau_cache").delete().eq("cnpj", cnpj).then(() => {});
      return null;
    }
    return data.result as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(cnpj: string, result: T): Promise<void> {
  const db = getClient();
  if (!db) return;
  const expires_at = new Date(Date.now() + TTL_MS).toISOString();
  try {
    await db.from("bureau_cache").upsert({ cnpj, result, expires_at });
  } catch {
    // Falha silenciosa — cache é best-effort
  }
}

export async function cacheClear(cnpj: string): Promise<void> {
  const db = getClient();
  if (!db) return;
  try {
    await db.from("bureau_cache").delete().eq("cnpj", cnpj);
  } catch {
    // Silencioso
  }
}

export async function cacheSize(): Promise<number> {
  const db = getClient();
  if (!db) return 0;
  try {
    const { count } = await db
      .from("bureau_cache")
      .select("*", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}
