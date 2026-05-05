// Grupo econômico: CreditHub primeiro, BDC só se CreditHub vier vazio.
// Uso: node scripts/check-grupo-credithub-first.mjs <CNPJ> <CPF>

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
const CH_URL = env.CREDITHUB_API_URL;
const CH_KEY = env.CREDITHUB_API_KEY;

const cnpj = (process.argv[2] ?? CNPJ_DEFAULT).replace(/\D/g, "");
const cpf  = (process.argv[3] ?? CPF_DEFAULT).replace(/\D/g, "");

async function chSimples(doc) {
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(`${CH_URL}/simples/${CH_KEY}/${doc}`, { cache: "no-store" });
    const txt = await res.text();
    if (txt.includes('push="true"') || txt.includes("push='true'")) {
      if (i < 5) { await new Promise(r => setTimeout(r, 3000)); continue; }
      return null;
    }
    if (!res.ok) return null;
    let parsed;
    try { parsed = JSON.parse(txt); } catch { return null; }
    // CreditHub envelope: { completed, data: {...} } → desembrulha
    return parsed?.data ?? parsed;
  }
  return null;
}

async function bdcEmpresa(cnpj) {
  const res = await fetch("https://plataforma.bigdatacorp.com.br/empresas", {
    method: "POST",
    headers: {
      "accept": "application/json", "content-type": "application/json",
      "AccessToken": env.BDC_TOKEN, "TokenId": env.BDC_TOKEN_ID,
    },
    body: JSON.stringify({
      q: `doc{${cnpj}}`,
      Datasets: "basic_data,economic_group_relationships,relationships",
      Tags: { host: "fallback", process: "grupo" },
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function bdcPessoa(cpf) {
  const res = await fetch("https://plataforma.bigdatacorp.com.br/pessoas", {
    method: "POST",
    headers: {
      "accept": "application/json", "content-type": "application/json",
      "AccessToken": env.BDC_TOKEN, "TokenId": env.BDC_TOKEN_ID,
    },
    body: JSON.stringify({
      q: `doc{${cpf}}`,
      Datasets: "basic_data{Name},business_relationships.limit(40)",
      Tags: { host: "fallback", process: "grupo" },
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

const fmt = (v) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

console.log(`\n=== Consulta CreditHub-first ===\n`);
console.log(`CNPJ: ${cnpj}  |  CPF: ${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}\n`);

// ── PJ ─────────────────────────────────────────────────────────────────
console.log("→ CreditHub /simples PJ ...");
const chPJ = await chSimples(cnpj);
let pjEmpresas = [];
let pjFonte = "credithub";

if (chPJ) {
  const part = Array.isArray(chPJ.participacoesEmpresas) ? chPJ.participacoesEmpresas : [];
  pjEmpresas = part;
  console.log(`  CreditHub → razão social: ${chPJ.razaoSocial ?? "—"}`);
  console.log(`              participacoesEmpresas: ${part.length}`);
  console.log(`              QSA: ${(chPJ.quadroSocietario ?? []).length}`);
  console.log(`              processos: ${(chPJ.processos ?? []).length}`);
  console.log(`              protestos: qtd=${chPJ.protestos?.qtdProtestos ?? 0}`);
  console.log(`              CCF: qtd=${chPJ.ccf?.qtdRegistros ?? 0}`);
  console.log(`              dividas: qtd=${chPJ.quantidade_dividas ?? 0} valor=${fmt(chPJ.valor_total_dividas)}`);
}

if (!chPJ || pjEmpresas.length === 0) {
  console.log("  (CreditHub vazio em participacoesEmpresas) → fallback BDC /empresas economic_group_relationships");
  const bdc = await bdcEmpresa(cnpj);
  const r0 = bdc?.Result?.[0] ?? {};
  const ege = r0.EconomicGroupRelationships ?? {};
  const arr = ege.EconomicGroupRelationships ?? ege.Relationships ?? [];
  if (Array.isArray(arr) && arr.length) { pjEmpresas = arr; pjFonte = "bdc"; }
  else console.log(`  BDC: ${JSON.stringify(bdc?.Status?.login ?? "ok")}`);
}

console.log("\n[PJ] Grupo econômico (fonte: " + pjFonte + ")");
if (pjEmpresas.length === 0) {
  console.log("  ✓ A empresa NÃO tem participação em outras empresas (sem grupo econômico via PJ).");
} else {
  pjEmpresas.forEach((e, i) => {
    const c = e.cnpj ?? e.CNPJ ?? e.documento ?? e.RelatedEntityTaxIdNumber ?? "—";
    const n = e.razao_social ?? e.razaoSocial ?? e.nome ?? e.RelatedEntityName ?? "—";
    const p = e.percentual ?? e.percentual_participacao ?? e.participacao ?? e.EquityShare ?? "";
    const s = e.situacao ?? e.status ?? "";
    console.log(`  ${i+1}. ${c}  ${n}${p ? `  ${p}%` : ""}${s ? `  (${s})` : ""}`);
  });
}

// ── PF ─────────────────────────────────────────────────────────────────
console.log("\n→ CreditHub /simples PF ...");
const chPF = await chSimples(cpf);
let pfEmpresas = [];
let pfFonte = "credithub";

if (chPF) {
  const part = Array.isArray(chPF.participacoesEmpresas) ? chPF.participacoesEmpresas : [];
  pfEmpresas = part;
  console.log(`  CreditHub → nome: ${chPF.nome ?? "—"} | idade ${chPF.idade ?? "—"} | status ${chPF.status ?? "—"}`);
  console.log(`              participacoesEmpresas: ${part.length}`);
  console.log(`              processos: ${(chPF.processos ?? []).length}`);
  console.log(`              protestos: qtd=${chPF.protestos?.qtdProtestos ?? 0}`);
  console.log(`              renda: ${chPF.renda ?? "—"}  | obito provável: ${chPF.obitoProvavel ?? "—"}`);
}

if (!chPF || pfEmpresas.length === 0) {
  console.log("  (CreditHub vazio em participacoesEmpresas) → fallback BDC /pessoas business_relationships");
  const bdc = await bdcPessoa(cpf);
  const r0 = bdc?.Result?.[0] ?? {};
  const biz = r0.BusinessRelationships ?? {};
  const list = Array.isArray(biz.BusinessRelationships) ? biz.BusinessRelationships
            : (Array.isArray(biz.Relationships) ? biz.Relationships : []);
  if (list.length) { pfEmpresas = list; pfFonte = "bdc"; }
  else console.log(`  BDC: ${JSON.stringify(bdc?.Status?.login ?? bdc?.Status ?? "ok")}`);
}

console.log("\n[PF] Empresas vinculadas (fonte: " + pfFonte + ")");
if (pfEmpresas.length === 0) {
  console.log("  Nenhuma empresa vinculada.");
} else {
  pfEmpresas.forEach((e, i) => {
    const c = e.cnpj ?? e.CNPJ ?? e.documento ?? e.RelatedEntityTaxIdNumber ?? "—";
    const n = e.razao_social ?? e.razaoSocial ?? e.nome ?? e.RelatedEntityName ?? "—";
    const tipo = e.qualificacao ?? e.tipo ?? e.relacao ?? e.RelationshipType ?? "—";
    const p = e.percentual ?? e.percentual_participacao ?? e.participacao ?? e.EquityShare ?? "";
    const s = e.situacao ?? e.status ?? "";
    const start = e.data_entrada ?? e.dataEntrada ?? e.RelationshipStartDate ?? "";
    console.log(`  ${i+1}. ${c}  ${n}`);
    console.log(`      ${tipo}${p ? ` — ${p}%` : ""}${s ? ` — ${s}` : ""}${start ? ` — desde ${start}` : ""}`);
  });
}

console.log();
