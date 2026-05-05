// Consulta avulsa de Grupo Econômico:
//  - PJ (CNPJ): BDC /empresas com datasets economic_group_relationships + relationships
//  - PF (CPF):  BDC /pessoas  com dataset business_relationships (empresas vinculadas)
//
// Uso: node scripts/check-grupo-economico.mjs <CNPJ> <CPF>
//      ou edita defaults abaixo.

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
    v = v.replace(/\\n$/, "").trim();
    env[m[1]] = v;
  }
  return env;
}
const env = loadEnv();

const cnpj = (process.argv[2] ?? CNPJ_DEFAULT).replace(/\D/g, "");
const cpf  = (process.argv[3] ?? CPF_DEFAULT).replace(/\D/g, "");

function bdcHeaders() {
  return {
    "accept":       "application/json",
    "content-type": "application/json",
    "AccessToken":  env.BDC_TOKEN ?? "",
    "TokenId":      env.BDC_TOKEN_ID ?? "",
  };
}

const fmt = (v) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// ─── PJ: economic_group_relationships ─────────────────────────────────────
async function consultarEmpresaGrupo() {
  if (!cnpj || cnpj.length !== 14) return null;
  console.log(`→ BDC /empresas  CNPJ ${cnpj}  (economic_group_relationships, relationships, basic_data)...`);
  const res = await fetch("https://plataforma.bigdatacorp.com.br/empresas", {
    method: "POST",
    headers: bdcHeaders(),
    body: JSON.stringify({
      q: `doc{${cnpj}}`,
      Datasets: "basic_data,economic_group_relationships,relationships",
      Tags: { host: "script_check", process: "consulta_grupo" },
    }),
  });
  if (!res.ok) {
    console.warn(`  BDC HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  return await res.json();
}

// ─── PF: business_relationships (empresas que o CPF é sócio) ──────────────
async function consultarPessoaEmpresas() {
  if (!cpf || cpf.length !== 11) return null;
  console.log(`→ BDC /pessoas  CPF ${cpf.slice(0,3)}***  (business_relationships)...`);
  const res = await fetch("https://plataforma.bigdatacorp.com.br/pessoas", {
    method: "POST",
    headers: bdcHeaders(),
    body: JSON.stringify({
      q: `doc{${cpf}}`,
      Datasets: "basic_data{Name},business_relationships.limit(40)",
      Tags: { host: "script_check", process: "consulta_grupo" },
    }),
  });
  if (!res.ok) {
    console.warn(`  BDC HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  return await res.json();
}

const [empresaJson, pessoaJson] = await Promise.all([consultarEmpresaGrupo(), consultarPessoaEmpresas()]);

console.log("\n──── RESULTADO ──────────────────────────────────────\n");

// ── PJ ─────────────────────────────────────────────────────────────────
if (empresaJson) {
  const r0 = empresaJson.Result?.[0] ?? {};
  const basic = r0.BasicData ?? {};
  const ege   = r0.EconomicGroupRelationships ?? {};
  const rels  = r0.Relationships ?? {};

  console.log(`[PJ] CNPJ ${cnpj}`);
  console.log(`  Razão social: ${basic.OfficialName ?? basic.TradeName ?? "—"}`);
  console.log(`  Status:       ${basic.TaxIdStatus ?? "—"}  |  Abertura: ${basic.FoundedDate ?? "—"}`);
  console.log("");

  // economic_group_relationships
  const groupArr =
    ege.EconomicGroupRelationships ??
    ege.Relationships ??
    ege.RelatedCompanies ??
    ege.Members ??
    ege.EconomicGroup ??
    [];
  const groupKeys = Object.keys(ege ?? {});
  console.log(`  EconomicGroupRelationships (chaves recebidas): ${groupKeys.join(", ") || "(seção vazia/ausente)"}`);
  if (Array.isArray(groupArr) && groupArr.length) {
    console.log(`  Empresas no grupo econômico: ${groupArr.length}`);
    groupArr.forEach((g, i) => {
      const cnpjG = g.RelatedEntityTaxIdNumber ?? g.CompanyTaxIdNumber ?? g.TaxIdNumber ?? g.CompanyTaxId ?? "—";
      const nome  = g.RelatedEntityName ?? g.CompanyName ?? g.Name ?? "—";
      const tipo  = g.RelationshipType ?? g.GroupRelationType ?? g.Type ?? "—";
      const part  = g.EquityShare ?? g.SharePercentage ?? g.Participation ?? "";
      console.log(`    ${i+1}. ${cnpjG}  ${nome}  [${tipo}]${part ? `  ${part}%` : ""}`);
    });
  } else {
    console.log("  Nenhum vínculo de grupo econômico retornado pela BDC.");
    if (groupKeys.length) {
      console.log("  Conteúdo bruto da seção:", JSON.stringify(ege).slice(0, 500));
    }
  }

  // relationships (QSA + sócios diretos da empresa) — útil pra cross-check
  const qsaList = Array.isArray(rels?.Relationships) ? rels.Relationships : [];
  const sociosDiretos = qsaList.filter(s => /QSA|OWNERSHIP|PARTNER|SOCIO/i.test(String(s.RelationshipType ?? "")));
  if (sociosDiretos.length) {
    console.log("");
    console.log(`  QSA da empresa (${sociosDiretos.length}):`);
    sociosDiretos.forEach((s, i) => {
      const ativo = !String(s.RelationshipEndDate ?? "").startsWith("9999") && s.RelationshipEndDate ? " [SAÍDA]" : "";
      console.log(`    ${i+1}. ${s.RelatedEntityTaxIdNumber ?? "—"}  ${s.RelatedEntityName ?? "—"}  [${s.RelationshipName ?? s.RelationshipType}]${ativo}`);
    });
  }
} else {
  console.log("[PJ] sem resposta");
}

console.log("");

// ── PF ─────────────────────────────────────────────────────────────────
if (pessoaJson) {
  const r0 = pessoaJson.Result?.[0] ?? {};
  const basic = r0.BasicData ?? {};
  const biz   = r0.BusinessRelationships ?? {};

  console.log(`[PF] CPF ${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}`);
  console.log(`  Nome: ${basic.Name ?? "—"}`);

  const list = Array.isArray(biz.BusinessRelationships)
    ? biz.BusinessRelationships
    : (Array.isArray(biz.Relationships) ? biz.Relationships : []);

  console.log(`  Empresas vinculadas (BDC business_relationships): ${list.length}`);
  if (list.length) {
    // separa ativos / inativos pela RelationshipEndDate
    const ativos = [], inativos = [];
    for (const e of list) {
      const end = String(e.RelationshipEndDate ?? "");
      const ativo = !end || end.startsWith("9999");
      (ativo ? ativos : inativos).push(e);
    }
    const print = (arr, label) => {
      if (!arr.length) return;
      console.log(`\n  ── ${label} (${arr.length}) ──`);
      arr.forEach((e, i) => {
        const c = e.RelatedEntityTaxIdNumber ?? e.CompanyTaxIdNumber ?? "—";
        const n = e.RelatedEntityName ?? e.CompanyName ?? "—";
        const tipo = e.RelationshipType ?? e.RelationshipName ?? "—";
        const pct = e.EquityShare ?? e.EquitySharePercent ?? e.CapitalEquityPercentage ?? e.PartnerEquityPercentage ?? e.EquityPercentage ?? "";
        const start = (e.RelationshipStartDate ?? e.StartDate ?? "").slice(0,10);
        const end = (e.RelationshipEndDate ?? "").slice(0,10);
        console.log(`    ${i+1}. ${c}  ${n}`);
        console.log(`        ${tipo}${pct ? ` — ${pct}%` : ""}${start ? ` — desde ${start}` : ""}${end && !end.startsWith("9999") ? ` — saída ${end}` : ""}`);
      });
    };
    print(ativos, "ATIVOS");
    print(inativos, "ENCERRADOS");
  } else {
    console.log("  Nenhuma empresa vinculada retornada.");
  }
} else {
  console.log("[PF] sem resposta");
}

console.log("\n─────────────────────────────────────────────────────\n");
