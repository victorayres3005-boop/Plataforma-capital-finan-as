// Consulta avulsa: protestos (Assertiva PF) + processos (BDC /pessoas) para um CPF.
// Uso: node scripts/check-cpf-protestos-processos.mjs <CPF>
//      ou edita CPF_DEFAULT abaixo.
//
// Lê credenciais de .env.local. Imprime resumo + listas. Consome bureau real.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = resolve(__dirname, "..", ".env.local");
const CPF_DEFAULT = "17163204884";

// ─── parse .env.local (simples, suporta aspas e \n no fim) ─────────────────
function loadEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    // remove \n literal no final (BDC tokens vêm com isso)
    v = v.replace(/\\n$/, "").trim();
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const cpfArg = process.argv[2] ?? CPF_DEFAULT;
const cpf = cpfArg.replace(/\D/g, "");
if (cpf.length !== 11) {
  console.error("CPF inválido:", cpfArg);
  process.exit(1);
}
const cpfMasked = `${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}`;

console.log(`\n=== Consulta CPF ${cpfMasked} ===\n`);

// ─── Assertiva: token + PF ───────────────────────────────────────────────
async function assertivaToken() {
  const id = env.ASSERTIVA_CLIENT_ID, sec = env.ASSERTIVA_CLIENT_SECRET;
  if (!id || !sec) throw new Error("ASSERTIVA_CLIENT_ID/SECRET ausentes");
  const basic = Buffer.from(`${id}:${sec}`).toString("base64");
  const res = await fetch("https://api.assertivasolucoes.com.br/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Assertiva token HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.access_token;
}

async function consultarAssertivaPF() {
  console.log("→ Assertiva PF (score + protestos)...");
  try {
    const token = await assertivaToken();
    const res = await fetch(
      `https://api.assertivasolucoes.com.br/score/v3/pf/credito/${cpf}?idFinalidade=2`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    if (!res.ok) {
      console.warn(`  Assertiva HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const json = await res.json();
    return json;
  } catch (err) {
    console.warn("  Assertiva erro:", err.message);
    return null;
  }
}

// ─── BDC /pessoas: processos ─────────────────────────────────────────────
async function consultarBDCPessoa() {
  console.log("→ BDC /pessoas (processos)...");
  const tok = env.BDC_TOKEN, tid = env.BDC_TOKEN_ID;
  if (!tok || !tid) {
    console.warn("  BDC_TOKEN/BDC_TOKEN_ID ausentes");
    return null;
  }
  try {
    const res = await fetch("https://plataforma.bigdatacorp.com.br/pessoas", {
      method: "POST",
      headers: {
        "accept":       "application/json",
        "content-type": "application/json",
        "AccessToken":  tok,
        "TokenId":      tid,
      },
      body: JSON.stringify({
        q: `doc{${cpf}}`,
        Datasets: "basic_data,processes",
        Tags: { host: "script_check", process: "consulta_avulsa" },
      }),
    });
    if (!res.ok) {
      console.warn(`  BDC HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("  BDC erro:", err.message);
    return null;
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────
const [assertiva, bdc] = await Promise.all([consultarAssertivaPF(), consultarBDCPessoa()]);

console.log("\n──── RESULTADO ──────────────────────────────────────\n");

// Assertiva
if (assertiva) {
  const r = assertiva.resposta ?? {};
  const score = r.score ?? {};
  const prot  = r.protestosPublicos ?? {};
  const debs  = r.registrosDebitos ?? {};
  const renda = r.rendaPresumida ?? {};

  console.log("[Assertiva PF]");
  console.log(`  Nome (cabeçalho): ${assertiva.cabecalho?.nome ?? "—"}`);
  console.log(`  Score: ${score.pontos ?? "—"} (classe ${score.classe ?? "—"})`);
  console.log(`  Renda presumida: ${renda.valor ? "R$ " + Number(renda.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}`);
  console.log("");
  console.log(`  PROTESTOS: ${prot.qtdProtestos ?? 0} ocorrência(s)  |  Valor total: R$ ${Number(prot.valorTotal ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  if (Array.isArray(prot.list) && prot.list.length) {
    prot.list.forEach((p, i) => {
      console.log(`    ${i+1}. ${p.data ?? "—"}  ${p.cidade ?? "?"}/${p.uf ?? "?"}  R$ ${Number(p.valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}  — ${p.cartorio ?? ""}`);
    });
  } else {
    console.log("    (nenhum detalhe retornado)");
  }
  console.log("");
  console.log(`  Negativações (registrosDebitos): ${debs.qtdRegistros ?? debs.quantidade ?? 0}`);
} else {
  console.log("[Assertiva PF] sem resposta");
}

console.log("");

// BDC processos
if (bdc) {
  const result = bdc.Result?.[0] ?? {};
  const law = result.Lawsuits ?? result.Processes ?? {};
  const total    = law.TotalLawsuits ?? 0;
  const passivo  = law.TotalLawsuitsAsDefendant ?? 0;
  const ativo    = law.TotalLawsuitsAsAuthor ?? 0;
  const lista    = Array.isArray(law.Lawsuits) ? law.Lawsuits : [];

  console.log("[BDC /pessoas — processos]");
  console.log(`  Total: ${total}  |  como Réu: ${passivo}  |  como Autor: ${ativo}`);
  if (lista.length) {
    lista.slice(0, 10).forEach((l, i) => {
      const num = l.Number ?? l.LawsuitNumber ?? "—";
      const dt  = l.PublicationDate ?? l.OpenDate ?? "—";
      const tipo = l.Type ?? l.LawsuitType ?? "—";
      const status = l.Status ?? "—";
      const valor = l.MainValue ?? l.Value ?? null;
      const polo  = l.PartyType ?? "—";
      console.log(`    ${i+1}. ${num}  [${polo}]  ${dt}  ${tipo}  ${status}${valor != null ? `  R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}`);
    });
    if (lista.length > 10) console.log(`    … (+${lista.length - 10} processos)`);
  } else if (total === 0) {
    console.log("  Nenhum processo encontrado.");
  } else {
    console.log("  (BDC reportou total > 0 mas não retornou detalhes nesta consulta)");
  }
} else {
  console.log("[BDC /pessoas] sem resposta");
}

console.log("\n─────────────────────────────────────────────────────\n");
