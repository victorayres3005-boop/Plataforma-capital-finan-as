#!/usr/bin/env node
/**
 * Test runner para fixtures de extração.
 *
 * Uso: node test-fixtures/run.mjs
 * Ou:  npm run test:extraction
 *
 * Formato esperado de cada fixture:
 *   test-fixtures/<docType>/<slug>.input.json
 *   test-fixtures/<docType>/<slug>.expected.json
 *
 * Campos do expected:
 *   - criticalFields: { path: "a.b.c", expected: "valor" | "regex:..." | "notEmpty" }
 *   - minWarnings, maxWarnings (opcional)
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = __dirname;

// ─── Utilitários ─────────────────────────────────────────────────────────────
const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function getPath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function compareValue(actual, expected) {
  if (expected === "notEmpty") {
    if (actual == null || actual === "") return { ok: false, reason: "vazio" };
    return { ok: true };
  }
  if (typeof expected === "string" && expected.startsWith("regex:")) {
    const pattern = expected.slice(6);
    const re = new RegExp(pattern);
    return re.test(String(actual))
      ? { ok: true }
      : { ok: false, reason: `não casa com /${pattern}/` };
  }
  if (String(actual) === String(expected)) return { ok: true };
  return { ok: false, reason: `esperado "${expected}", recebido "${actual}"` };
}

// ─── Core ─────────────────────────────────────────────────────────────────────
async function findFixtures() {
  const fixtures = [];
  const entries = await readdir(FIXTURES_ROOT);
  for (const entry of entries) {
    const full = join(FIXTURES_ROOT, entry);
    const st = await stat(full).catch(() => null);
    if (!st?.isDirectory()) continue;
    const files = await readdir(full);
    const inputs = files.filter((f) => f.endsWith(".input.json"));
    for (const inp of inputs) {
      const slug = inp.replace(/\.input\.json$/, "");
      const expectedFile = `${slug}.expected.json`;
      if (!files.includes(expectedFile)) continue;
      fixtures.push({
        docType: entry,
        slug,
        inputPath: join(full, inp),
        expectedPath: join(full, expectedFile),
      });
    }
  }
  return fixtures;
}

async function runFixture(fx) {
  const input = JSON.parse(await readFile(fx.inputPath, "utf8"));
  const expected = JSON.parse(await readFile(fx.expectedPath, "utf8"));

  // Estratégia: usa a URL configurada (local dev ou produção) para chamar /api/extract
  const baseUrl = process.env.TEST_EXTRACT_URL || "http://localhost:3000";

  const fd = new FormData();
  if (input.docType) fd.append("type", input.docType);
  if (input.slot) fd.append("slot", input.slot);
  if (input.textContent) {
    const blob = new Blob([input.textContent], { type: "text/plain" });
    fd.append("file", blob, `${fx.slug}.txt`);
  } else if (input.filePath) {
    // Ler arquivo binário relativo ao fixture
    const fileBuf = await readFile(join(dirname(fx.inputPath), input.filePath));
    fd.append("file", new Blob([fileBuf]), input.filePath);
  } else {
    throw new Error("fixture sem textContent nem filePath");
  }

  const res = await fetch(`${baseUrl}/api/extract`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // Lê SSE stream
  const text = await res.text();
  const match = text.match(/event: result\ndata: (.+)/);
  if (!match) throw new Error("Sem evento 'result' no SSE");
  const result = JSON.parse(match[1]);

  // Valida criticalFields
  const failures = [];
  for (const cf of expected.criticalFields || []) {
    const actual = getPath(result.data, cf.path);
    const cmp = compareValue(actual, cf.expected);
    if (!cmp.ok) failures.push(`${cf.path}: ${cmp.reason}`);
  }

  // Valida contagem de warnings
  const warnings = result.data?._warnings || [];
  if (expected.minWarnings != null && warnings.length < expected.minWarnings) {
    failures.push(`warnings=${warnings.length} < min ${expected.minWarnings}`);
  }
  if (expected.maxWarnings != null && warnings.length > expected.maxWarnings) {
    failures.push(`warnings=${warnings.length} > max ${expected.maxWarnings}`);
  }

  return { ok: failures.length === 0, failures };
}

async function main() {
  console.log(c.bold("\n📋 Capital Finanças — Test Extraction Runner\n"));
  const fixtures = await findFixtures();

  if (fixtures.length === 0) {
    console.log(c.yellow("⚠️  Nenhuma fixture encontrada em test-fixtures/"));
    console.log(c.dim("   Crie arquivos .input.json + .expected.json nas subpastas por docType."));
    console.log(c.dim("   Ver README.md para instruções.\n"));
    process.exit(0);
  }

  console.log(c.blue(`Encontradas ${fixtures.length} fixture(s). Rodando…\n`));

  let passed = 0, failed = 0;
  for (const fx of fixtures) {
    const label = `${fx.docType}/${fx.slug}`;
    try {
      const r = await runFixture(fx);
      if (r.ok) {
        console.log(c.green(`  ✓ ${label}`));
        passed++;
      } else {
        console.log(c.red(`  ✗ ${label}`));
        for (const f of r.failures) console.log(c.dim(`      ${f}`));
        failed++;
      }
    } catch (e) {
      console.log(c.red(`  ✗ ${label}`));
      console.log(c.dim(`      ${e.message}`));
      failed++;
    }
  }

  console.log();
  console.log(`${c.bold("Total:")} ${passed + failed} · ${c.green(`${passed} passou`)} · ${c.red(`${failed} falhou`)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(c.red("Fatal: "), e);
  process.exit(1);
});
