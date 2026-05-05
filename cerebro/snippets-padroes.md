---
tags: [capital-financas, snippets, padroes, codigo]
---

> Hub: [[CAPITAL]]


# Snippets & padrões de código

Padrões que se repetem no codebase. Quando criar código novo na plataforma, seguir estes templates.

## Auth em rotas API (server-side)

```typescript
import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // ... lógica
}
```

**Quando aplicar:** todo endpoint que toca dados de cliente, dispara API paga, ou consome compute. Padrão pós-hardening 2026-04-30.

## Auth em middleware

```typescript
// middleware.ts — usar getSession, NÃO getUser
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user ?? null;
```

`getSession()` lê do cookie sem rede (instantâneo). `getUser()` faz HTTP no Edge → 504 timeout em 1.5s.

## Auth em cron route

```typescript
const auth = req.headers.get("authorization");
if (!process.env.CRON_SECRET) {
  return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
}
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Fail-closed sem secret. Vercel auto-injeta `Authorization: Bearer ${CRON_SECRET}`.

## safeNum — defensivo contra `undefined`/`NaN`

```typescript
function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
```

**Onde usar:** `BureauPrices`, `BureauCalls`, qualquer cálculo a partir de campo opcional vindo de localStorage ou banco antigo. Padrão pós-crash `/custos` 2026-04-26.

## fmtBRL / fmtUSD — formatadores defensivos

```typescript
export function fmtBRL(v: unknown): string {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
```

`lib/formatters.ts` (criado 2026-05-04). Usar em vez de inline.

## parseBRL — string monetária → número

```typescript
function parseBRL(s: string | number | undefined | null): number {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const cleaned = String(s).replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
```

Usar antes de comparações numéricas em strings vindas do Gemini.

## Atualização otimista — UI antes de Supabase

```typescript
// ✅ Correto — atualização otimista
function markWelcomeSeen() {
  setOnboarding(prev => ({ ...prev, welcome_seen: true }));  // estado local primeiro
  supabase.from("user_onboarding")
    .update({ welcome_seen: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .then(() => {});  // background, fire and forget
}

// ❌ Errado — modal trava se Supabase demora
async function markWelcomeSeen() {
  await supabase.from("user_onboarding").update(...);  // bloqueia UI
  setOnboarding(...);
}
```

Padrão obrigatório em hooks de onboarding (bug 2026-04-25).

## Promise.allSettled para bureaus paralelos

```typescript
const results = await Promise.allSettled([
  withTimeout(consultarBDC(cnpj), BUREAU_TIMEOUT, "BDC"),
  withTimeout(consultarAssertivaPJ(cnpj), BUREAU_TIMEOUT, "AssertivaPJ"),
  withTimeout(consultarCredHub(cnpj), BUREAU_TIMEOUT, "CredHub"),
  withTimeout(consultarSCREmpresa(cnpj), BUREAU_TIMEOUT, "DataBox360"),
]);

// Cada bureau falha independente, sem derrubar o conjunto
const bdc = results[0].status === "fulfilled" ? results[0].value : null;
```

Padrão estabelecido em 2026-04-26 (504 fix `/api/bureaus`).

## withTimeout helper

```typescript
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]);
}
```

## Cache helper bureau (Supabase 24h)

```typescript
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function cacheGet(key: string): Promise<any | null> {
  const { data } = await supabase
    .from("bureau_cache")
    .select("payload, created_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  const age = Date.now() - new Date(data.created_at).getTime();
  if (age > CACHE_TTL_MS) return null;
  return data.payload;
}

async function cacheSet(key: string, payload: any) {
  await supabase
    .from("bureau_cache")
    .upsert({ key, payload, created_at: new Date().toISOString() }, { onConflict: "key" });
}
```

Chave: `<bureau>:<documento>:<periodo>`. Ex: `scr:50434055000188:202603`.

## Token cache com renovação proativa

```typescript
let tokenCache: { token: string; expiresAt: number } | null = null;
let _tokenFetchPromise: Promise<string> | null = null;

async function getToken(): Promise<string> {
  // Lock anti-concorrência
  if (_tokenFetchPromise) return _tokenFetchPromise;

  // Cache hit (renova 60s antes de expirar)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  _tokenFetchPromise = (async () => {
    try {
      const res = await fetch(TOKEN_URL, { /* ... */ });
      const { access_token, expires_in } = await res.json();
      tokenCache = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
      return access_token;
    } finally {
      _tokenFetchPromise = null;
    }
  })();

  return _tokenFetchPromise;
}
```

Padrão Assertiva, DataBox360.

## Circuit breaker

```typescript
let circuitOpenUntil = 0;

async function consultar(...) {
  if (Date.now() < circuitOpenUntil) {
    return null;  // skip, breaker aberto
  }
  try {
    const result = await /* ... */;
    return result;
  } catch (err) {
    if (isAuthError(err)) {
      circuitOpenUntil = Date.now() + 60_000;  // 60s
    }
    throw err;
  }
}
```

Padrão DataBox360 — evita gastar minutos quando sandbox está fora.

## Trim em credenciais Vercel

```typescript
const clientId = (process.env.ASSERTIVA_CLIENT_ID || "").trim();
const clientSecret = (process.env.ASSERTIVA_CLIENT_SECRET || "").trim();
```

Vercel salva `\n` ao final quando inserido interativamente. **Sempre `.trim()`** em credenciais de OAuth.

## Falha silenciosa de bureau (não bloqueia)

```typescript
let bdcResult: BdcResult | null = null;
try {
  bdcResult = await consultarBDC(cnpj);
} catch (err) {
  console.warn("[bureaus] BDC falhou:", err);
  // continua sem bdcResult — relatório aparece com seções faltantes condicionais
}
```

**Princípio:** todas as seções do PDF são condicionais. Bureau falhar não pode quebrar a análise.

## Condicional no template PDF

```typescript
// lib/pdf/template.ts — sempre verificar antes de renderizar
function pageProtestos(p: PDFReportParams): string {
  const protestos = p.data.protestos;
  if (!protestos?.vigentes?.qtd && !protestos?.regularizados?.qtd) return "";  // omit
  return `<div class="page">...</div>`;
}
```

Sem placeholders "—". Seção some inteira se não tiver dado.

## parseJSON com recovery de truncamento

```typescript
function parseJSON<T>(raw: string): T {
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Tenta recuperar JSON truncado (cortado pelo maxOutputTokens)
    const recovered = tryRecoverTruncatedJSON(raw);
    if (recovered) return recovered;
    throw err;
  }
}

function tryRecoverTruncatedJSON(raw: string): any | null {
  // Corta no último } completo
  const lastClose = raw.lastIndexOf("}");
  if (lastClose < 0) return null;
  let candidate = raw.slice(0, lastClose + 1);
  // Fecha arrays/objects abertos
  // ... lógica balanceando { } e [ ]
  try { return JSON.parse(candidate); } catch { return null; }
}
```

Padrão pós-2026-04-30 para Curva ABC e outros prompts grandes.

## Sanitização de HTML interpolado

```typescript
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Uso em template:
const html = `<td>${escapeHtml(empresa.razaoSocial)}</td>`;
```

**Sempre escapar** valores que vem do banco/Gemini antes de interpolar em HTML.

## Logo no template

```typescript
// lib/pdf/template.ts — constante topo
const LOGO_B64 = "data:image/png;base64,...";

// Uso (SEMPRE referenciar pela constante):
<img src="${LOGO_B64}" style="filter: invert(1); height: 32px;" />
```

Nunca inline o base64 na função de página — fica enorme e duplica.

## Logs estruturados

```typescript
console.log(`[extract] pdf-parse ${docType} ${kb}kb → ${chars} chars em ${ms}ms`);
console.log(`[Gemini] key=${keyId} model=${model} attempt=${i}/${total} payload=${size} timeout=${timeout}ms`);
console.log(`[Gemini] OK model=${model} ${ms}ms ${chars}`);
console.log(`[Gemini] timeout key=${keyId} model=${model} após ${ms}ms`);
console.log(`[curva_abc] Direct parse: ${n} clientes`);
console.log(`[parseJSON] JSON truncado — recuperado parcialmente`);
```

Prefixos `[modulo]` permitem filtrar nos logs Vercel.

## Deploy

```bash
npx tsc --noEmit       # type-check antes
npx vercel --prod      # NÃO usa git push integrado
```

Build local é Vite (Framework Preset errado no painel — `vercel.json` compensa).
