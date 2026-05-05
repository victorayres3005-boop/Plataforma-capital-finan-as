// Consulta Grupo Econômico via CreditHub para CNPJ + CPF.
// Uso: node scripts/check-credithub-grupo.mjs <CNPJ> <CPF>

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = resolve(__dirname, "..", ".env.local");

const CNPJ_DEFAULT = "41301271000164";
const CPF_DEFAULT  = "17163204884";

function loadEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v.replace(/\\n$/, "").trim();
  }
  return env;
}
const env = loadEnv();
const URL_BASE = env.CREDITHUB_API_URL;
const API_KEY  = env.CREDITHUB_API_KEY;

const cnpj = (process.argv[2] ?? CNPJ_DEFAULT).replace(/\D/g, "");
const cpf  = (process.argv[3] ?? CPF_DEFAULT).replace(/\D/g, "");

async function fetchWithPushRetry(url, label, maxAttempts = 5, delayMs = 3000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        cache: "no-store",
      });
      const txt = await res.text();
      if (txt.includes('push="true"') || txt.includes("push='true'")) {
        console.log(`  [${label}] tentativa ${i}: push=true, aguardando...`);
        if (i < maxAttempts) { await new Promise(r => setTimeout(r, delayMs)); continue; }
        console.warn(`  [${label}] timeout após ${maxAttempts} tentativas`);
        return null;
      }
      if (!res.ok) { console.warn(`  [${label}] HTTP ${res.status}: ${txt.slice(0,200)}`); return null; }
      try { return JSON.parse(txt); } catch { console.warn(`  [${label}] não-JSON`); return null; }
    } catch (e) {
      console.warn(`  [${label}] exception:`, e.message);
      if (i < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return null;
}

console.log(`\n=== CreditHub — Grupo Econômico ===\n`);
console.log(`CNPJ: ${cnpj}  |  CPF: ${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}\n`);

// Endpoint dedicado /v1/grupo-economico/{doc}
console.log("→ /v1/grupo-economico/<CNPJ>");
const grupoPJ  = await fetchWithPushRetry(`${URL_BASE}/v1/grupo-economico/${cnpj}`, "GE-PJ");
console.log("→ /v1/grupo-economico/<CPF>");
const grupoPF  = await fetchWithPushRetry(`${URL_BASE}/v1/grupo-economico/${cpf}`, "GE-PF");

// Endpoint /simples (traz QSA + processos + protestos + grupo embarcado)
console.log("→ /simples/<key>/<CNPJ>");
const simplesPJ = await fetchWithPushRetry(`${URL_BASE}/simples/${API_KEY}/${cnpj}`, "SIMPLES-PJ");
console.log("→ /simples/<key>/<CPF>");
const simplesPF = await fetchWithPushRetry(`${URL_BASE}/simples/${API_KEY}/${cpf}`, "SIMPLES-PF");

console.log("\n──── RESULTADO ──────────────────────────────────────\n");

function dumpGrupo(label, raw) {
  if (!raw) { console.log(`[${label}] sem resposta\n`); return; }
  const d = raw.data ?? raw;
  const keys = Object.keys(d ?? {});
  console.log(`[${label}] keys top: ${keys.join(", ") || "(vazio)"}`);

  // Procura listas comuns
  const candidatos = ["empresas", "vinculos", "vínculos", "grupo_economico", "relacionados", "companies", "data"];
  let encontrado = null;
  for (const k of candidatos) {
    if (Array.isArray(d?.[k])) { encontrado = { campo: k, lista: d[k] }; break; }
  }
  if (!encontrado) {
    for (const k of keys) {
      if (Array.isArray(d[k]) && d[k].length && typeof d[k][0] === "object") {
        encontrado = { campo: k, lista: d[k] };
        break;
      }
    }
  }
  if (encontrado) {
    console.log(`  Empresas vinculadas (campo "${encontrado.campo}"): ${encontrado.lista.length}`);
    encontrado.lista.slice(0, 30).forEach((e, i) => {
      const cnpj = e.cnpj ?? e.CNPJ ?? e.documento ?? e.doc ?? "—";
      const nome = e.nome ?? e.razao_social ?? e.razaoSocial ?? e.NOME ?? e.RazaoSocial ?? "—";
      const part = e.participacao ?? e.percentual ?? e.percentual_participacao ?? "";
      const tipo = e.tipo ?? e.relacao ?? e.qualificacao ?? "";
      const situ = e.situacao ?? e.status ?? "";
      console.log(`    ${i+1}. ${cnpj}  ${nome}  ${tipo ? `[${tipo}]` : ""}${part ? ` ${part}%` : ""}${situ ? ` (${situ})` : ""}`);
    });
  } else {
    console.log("  Nenhuma lista de empresas detectada na seção. Conteúdo bruto (1k):");
    console.log("  " + JSON.stringify(d).slice(0, 1000));
  }
  console.log("");
}

function dumpSimples(label, raw) {
  if (!raw) { console.log(`[${label}] sem resposta\n`); return; }
  const d = raw.data ?? raw;
  const keys = Object.keys(d ?? {});
  console.log(`[${label}] keys top: ${keys.slice(0, 30).join(", ")}${keys.length > 30 ? `, +${keys.length-30}` : ""}`);

  // tenta extrair dados úteis
  const out = {};
  for (const k of keys) {
    const v = d[k];
    if (Array.isArray(v)) out[k] = `[${v.length}]`;
    else if (v && typeof v === "object") out[k] = `{${Object.keys(v).join(",").slice(0,80)}}`;
    else out[k] = String(v ?? "").slice(0, 100);
  }
  for (const k of Object.keys(out)) console.log(`  ${k}: ${out[k]}`);

  // QSA / sócios
  const qsa = d.QSA ?? d.qsa ?? d.socios ?? d.quadro_societario;
  if (Array.isArray(qsa) && qsa.length) {
    console.log(`\n  QSA (${qsa.length}):`);
    qsa.slice(0,15).forEach((s,i) => {
      console.log(`    ${i+1}. ${s.cpf_cnpj ?? s.documento ?? s.cpfCnpj ?? "—"}  ${s.nome ?? s.NOME ?? "—"}  [${s.qualificacao ?? s.cargo ?? "—"}]`);
    });
  }

  // empresas vinculadas (no /simples/CPF normalmente vem em "envolvidos" → empresas)
  const env = d.envolvidos ?? d.empresas ?? d.companies;
  if (Array.isArray(env) && env.length) {
    console.log(`\n  Empresas vinculadas (${env.length}):`);
    env.slice(0,30).forEach((e,i) => {
      const cnpj = e.cnpj ?? e.CNPJ ?? e.documento ?? "—";
      const nome = e.nome ?? e.razao_social ?? e.RazaoSocial ?? "—";
      console.log(`    ${i+1}. ${cnpj}  ${nome}`);
    });
  }
  console.log("");
}

dumpGrupo("GE-PJ /v1/grupo-economico", grupoPJ);
dumpGrupo("GE-PF /v1/grupo-economico", grupoPF);
dumpSimples("SIMPLES-PJ /simples/<key>", simplesPJ);
dumpSimples("SIMPLES-PF /simples/<key>", simplesPF);
