// Cria/atualiza o usuário de teste E2E via Supabase Admin API.
// Mais robusto que SQL direto porque usa o caminho oficial — senha é encriptada
// pelo próprio Supabase e identity é criada do jeito certo.
//
// Uso:
//   node scripts/setup-e2e-user.mjs
//
// Lê NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY do .env.local.
// Usuário criado/atualizado:
//   email:    e2e@capitalfinancas.test
//   password: e2e-test-2026
//
// Idempotente: se existe, atualiza a senha.

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env.local");

const E2E_EMAIL    = process.env.E2E_USER_EMAIL    || "e2e@capitalfinancas.test";
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || "e2e-test-2026";

// Em CI as vars vêm de process.env (job env / GitHub Secrets).
// Localmente, lê do .env.local. Process.env tem prioridade quando setado.
function loadEnv() {
  const env = { ...process.env };
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}
const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// 1) Procura usuário existente
async function findUser() {
  const url = `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(E2E_EMAIL)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error("Erro listando users:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = await res.json();
  const users = Array.isArray(json.users) ? json.users : [];
  return users.find(u => u.email === E2E_EMAIL) ?? null;
}

// 2a) Cria
async function createUser() {
  const url = `${SUPABASE_URL}/auth/v1/admin/users`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "e2e", note: "usuário automatizado — não usar em produção" },
    }),
  });
  if (!res.ok) {
    console.error("Erro criando user:", res.status, await res.text().catch(() => ""));
    process.exit(1);
  }
  const j = await res.json();
  console.log(`✅ Usuário E2E criado — id=${j.id}`);
  return j;
}

// 2b) Atualiza senha (caso já exista)
async function updatePassword(userId) {
  const url = `${SUPABASE_URL}/auth/v1/admin/users/${userId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      password: E2E_PASSWORD,
      email_confirm: true,
    }),
  });
  if (!res.ok) {
    console.error("Erro atualizando senha:", res.status, await res.text().catch(() => ""));
    process.exit(1);
  }
  console.log(`✅ Senha do usuário E2E atualizada — id=${userId}`);
}

// 3) Validar fazendo login real (signInWithPassword)
async function validateLogin() {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  });
  if (!res.ok) {
    console.error(`❌ Login de validação falhou (${res.status}):`, await res.text().catch(() => ""));
    process.exit(1);
  }
  const j = await res.json();
  console.log(`✅ Login validado — access_token recebido (len=${(j.access_token ?? "").length})`);
}

console.log(`→ Supabase: ${SUPABASE_URL}`);
const existing = await findUser();
if (existing) {
  console.log(`→ Usuário já existe (id=${existing.id}, created=${existing.created_at}). Atualizando senha…`);
  await updatePassword(existing.id);
} else {
  console.log("→ Usuário não existe. Criando…");
  await createUser();
}
await validateLogin();
console.log("\nPronto. Pode rodar `npm run test:e2e`.");
