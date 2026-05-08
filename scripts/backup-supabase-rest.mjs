#!/usr/bin/env node
// Backup defensivo via REST API do Supabase (não precisa de pg_dump nem dashboard).
// Usa SERVICE_ROLE_KEY pra bypassar RLS e exporta todas as tabelas conhecidas
// como NDJSON (uma linha por registro, mais resistente a corrupção que JSON único).
//
// Uso:
//   node scripts/backup-supabase-rest.mjs
//
// Saída:
//   ./backup-supabase-<YYYYMMDD-HHMM>/
//     <tabela>.ndjson    — um JSON por linha
//     _manifest.json     — contagens + timestamp
//     _errors.log        — tabelas que falharam (se houver)
//
// Defensivo:
//   - Falha em uma tabela não para as outras (Promise.allSettled)
//   - Paginação Range header pra tabelas grandes (Supabase corta em 1000 rows)
//   - Logs por tabela com count + duração
//   - Não toca em storage / auth.users — só schema public

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Carrega env ──────────────────────────────────────────────────────────────
function loadEnv() {
  const candidates = [".env.local", ".env"];
  const env = {};
  for (const file of candidates) {
    try {
      const path = resolve(ROOT, file);
      const content = readFileSync(path, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        let val = m[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(m[1] in env)) env[m[1]] = val;
      }
    } catch { /* file ausente, segue */ }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("[backup] ❌ Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

// ── Tabelas a fazer backup (de cerebro/banco-dados.md) ───────────────────────
// Ordem: prioridade descendente — críticas primeiro.
const TABLES = [
  // ── Críticas (perda total se sumir) ──
  "document_collections",
  "score_operacoes",
  "pareceres",
  "shared_reports",
  "politica_credito_config",
  "fund_settings",
  "fund_presets",
  "operacoes",
  "rating_feedback",
  "prompt_versions",
  "analysis_versions",

  // ── Importantes (telemetria + cache persistente) ──
  "company_snapshots",
  "audit_log",
  "api_usage_logs",
  "extraction_metrics",
  "extraction_corrections",
  "extraction_cache",

  // ── Operacionais ──
  "goalfy_pending_operations",
  "user_onboarding",
  "notifications",

  // ── Caches reconstruíveis (backup ainda assim, é dado real) ──
  "bureau_cache",
  "protestos_cache",
  "processos_cache",
  "ccf_cache",
  "credithub_cache",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const ts = new Date()
  .toISOString()
  .replace(/[:T]/g, "-")
  .replace(/\.\d+Z$/, "")
  .replace(/-\d\d$/, "");
const OUT_DIR = resolve(ROOT, `backup-supabase-${ts}`);
mkdirSync(OUT_DIR, { recursive: true });
const ERRORS = resolve(OUT_DIR, "_errors.log");

const PAGE_SIZE = 1000; // Supabase corta default em 1000
// shared_reports tem html completo (até 5MB cada) — paginação MUITO pequena
const SMALL_PAGE_TABLES = new Set(["shared_reports"]);
const TINY_PAGE_SIZE = 5; // shared_reports

async function fetchPage(table, from, to) {
  // Sem order=created_at — algumas tabelas (caches) só têm updated_at;
  // para backup, ordem não importa.
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      Range: `${from}-${to}`,
      "Range-Unit": "items",
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const total = parseInt((res.headers.get("content-range") || "").split("/")[1] || "0", 10);
  const rows = await res.json();
  return { rows, total };
}

async function backupTable(table) {
  const t0 = Date.now();
  let from = 0;
  let total = 0;
  let count = 0;
  const pageSize = SMALL_PAGE_TABLES.has(table) ? TINY_PAGE_SIZE : PAGE_SIZE;
  const file = resolve(OUT_DIR, `${table}.ndjson`);
  // Garante arquivo limpo (overwrite)
  writeFileSync(file, "");

  while (true) {
    const to = from + pageSize - 1;
    const { rows, total: t } = await fetchPage(table, from, to);
    total = t;
    if (rows.length === 0) break;
    appendFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    count += rows.length;
    if (rows.length < pageSize) break;
    from = to + 1;
  }

  const durMs = Date.now() - t0;
  console.log(`[backup] ✓ ${table}: ${count}/${total} linha(s) em ${durMs}ms`);
  return { table, count, total, durMs };
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`[backup] Iniciando — ${TABLES.length} tabelas`);
console.log(`[backup] URL: ${SUPABASE_URL}`);
console.log(`[backup] Saída: ${OUT_DIR}`);
console.log("");

const results = await Promise.allSettled(TABLES.map(backupTable));

const ok = [];
const failed = [];
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const table = TABLES[i];
  if (r.status === "fulfilled") {
    ok.push(r.value);
  } else {
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    failed.push({ table, error: msg });
    appendFileSync(ERRORS, `[${table}] ${msg}\n`);
    console.error(`[backup] ✗ ${table}: ${msg}`);
  }
}

const manifest = {
  timestamp: new Date().toISOString(),
  supabaseUrl: SUPABASE_URL,
  totalTablesAttempted: TABLES.length,
  totalTablesOk: ok.length,
  totalTablesFailed: failed.length,
  totalRows: ok.reduce((sum, r) => sum + r.count, 0),
  tables: ok,
  failures: failed,
};
writeFileSync(resolve(OUT_DIR, "_manifest.json"), JSON.stringify(manifest, null, 2));

console.log("");
console.log(`[backup] ============================================`);
console.log(`[backup] ${ok.length}/${TABLES.length} tabelas OK · ${manifest.totalRows} linhas totais`);
if (failed.length > 0) {
  console.log(`[backup] ⚠ ${failed.length} tabela(s) falharam — ver _errors.log`);
}
console.log(`[backup] Pasta: ${OUT_DIR}`);
console.log(`[backup] ============================================`);

if (failed.length > 0) process.exit(2);
