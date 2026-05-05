// Converte refs markdown → wikilinks em todos os .md do cérebro + CAPITAL.md
// e adiciona [[CAPITAL]] no topo de cada arquivo do cérebro pra centralizar o grafo.
//
// Em seguida, sincroniza projeto → vault Obsidian (projeto domina).
//
// Uso: node scripts/convert-cerebro-to-wikilinks.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const PROJ = "C:/Users/Admin/Documents/Nova pasta/Plataforma - Capital finanças - Débora/capital-financas";
const VAULT = "C:/Users/Admin/Documents/Obsidian Vault/Capital Finanças";

const PROJ_CEREBRO  = join(PROJ, "cerebro");
const VAULT_CEREBRO = join(VAULT, "cerebro");
const PROJ_CAPITAL  = join(PROJ, "CAPITAL.md");
const VAULT_CAPITAL = join(VAULT, "CAPITAL.md");

// ─── 1. Conversão markdown → wikilinks ──────────────────────────────────
// Captura: [texto](opcional/cerebro/arquivo.md#opcional-anchor)
// onde "arquivo" é nome simples de doc do cérebro (kebab-case, .md).
// Negative lookbehind: ignora imagens ![...](...)
const RE_LINK = /(?<!!)\[([^\]\n]+?)\]\((?:cerebro\/)?([a-z][a-z0-9-]*)\.md(#[^)\s]*)?\)/g;

function convertContent(md) {
  return md.replace(RE_LINK, (_match, label, file, anchor = "") => {
    const target = anchor ? `${file}${anchor}` : file;
    // Se label é igual ao nome do arquivo, usa form curto [[arquivo]]
    if (label.trim().toLowerCase() === file.toLowerCase() && !anchor) {
      return `[[${file}]]`;
    }
    return `[[${target}|${label}]]`;
  });
}

// ─── 2. Backlink [[CAPITAL]] no topo (após frontmatter) ─────────────────
function ensureCapitalBacklink(md, fileBase) {
  if (fileBase === "CAPITAL") return md; // não auto-referenciar
  if (md.includes("[[CAPITAL]]") || md.includes("[[CAPITAL|")) return md;

  // Se tem frontmatter (---\n...\n---), insere depois
  const fmMatch = md.match(/^(---\n[\s\S]*?\n---\n)/);
  const backlinkLine = `> Hub: [[CAPITAL]]\n\n`;

  if (fmMatch) {
    return fmMatch[1] + "\n" + backlinkLine + md.slice(fmMatch[0].length);
  }
  // Sem frontmatter — insere no início
  return backlinkLine + md;
}

// ─── 3. Processa todos os .md do cérebro ────────────────────────────────
function processFile(path, fileBase) {
  const original = readFileSync(path, "utf8");
  let updated = convertContent(original);
  updated = ensureCapitalBacklink(updated, fileBase);
  if (updated !== original) {
    writeFileSync(path, updated, "utf8");
    return true;
  }
  return false;
}

function walkAndProcess(dir) {
  const changed = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      changed.push(...walkAndProcess(full));
    } else if (entry.endsWith(".md")) {
      const base = entry.replace(/\.md$/, "");
      if (processFile(full, base)) changed.push(full);
    }
  }
  return changed;
}

console.log("=== Conversão markdown → wikilinks ===\n");

console.log("→ Processando cerebro/ do projeto...");
const cerebroChanged = walkAndProcess(PROJ_CEREBRO);
console.log(`  ${cerebroChanged.length} arquivo(s) atualizados`);

console.log("\n→ Processando CAPITAL.md...");
const beforeCapital = readFileSync(PROJ_CAPITAL, "utf8");
const afterCapital = convertContent(beforeCapital);
if (afterCapital !== beforeCapital) {
  writeFileSync(PROJ_CAPITAL, afterCapital, "utf8");
  console.log("  CAPITAL.md atualizado");
} else {
  console.log("  CAPITAL.md sem mudanças");
}

// ─── 4. Limpa lixo do vault e sincroniza projeto → vault ────────────────
console.log("\n=== Sincronização projeto → vault ===\n");

const vaultJunk = join(VAULT_CEREBRO, "cerebro");
if (existsSync(vaultJunk)) {
  rmSync(vaultJunk, { recursive: true, force: true });
  console.log("→ Removido lixo cerebro/cerebro/ do vault");
}

console.log("→ Copiando cerebro/ do projeto pro vault (overwrite)...");
cpSync(PROJ_CEREBRO, VAULT_CEREBRO, { recursive: true, force: true });
console.log("  cerebro/ sincronizado");

console.log("→ Copiando CAPITAL.md do projeto pro vault...");
cpSync(PROJ_CAPITAL, VAULT_CAPITAL, { force: true });
console.log("  CAPITAL.md sincronizado");

console.log("\n✅ Conversão + sync concluídos.");
console.log("\nArquivos do cérebro modificados:");
cerebroChanged.forEach(f => console.log("  - " + f.replace(PROJ_CEREBRO + "\\", "").replace(PROJ_CEREBRO + "/", "")));
