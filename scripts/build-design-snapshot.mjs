// Concatena todos os arquivos de UI/design da plataforma num único .md
// Output: cerebro/codigo-design-snapshot.md
import { readFileSync, writeFileSync, statSync } from "fs";
import { resolve, relative } from "path";
import { globSync } from "glob";

const ROOT_PROJ = resolve(process.cwd());                  // capital-financas/
const OUT       = resolve(ROOT_PROJ, "cerebro", "codigo-design-snapshot.md");

const groups = [
  {
    title: "Design system / setup",
    files: [
      "tailwind.config.ts",
      "app/layout.tsx",
      "app/globals.css",
    ],
  },
  {
    title: "Páginas (rotas)",
    files: globSync("app/**/page.tsx", { cwd: ROOT_PROJ }).sort(),
  },
  {
    title: "Componentes",
    files: globSync("components/**/*.tsx", { cwd: ROOT_PROJ }).sort(),
  },
];

const langOf = (p) => {
  if (p.endsWith(".tsx") || p.endsWith(".ts")) return "tsx";
  if (p.endsWith(".css")) return "css";
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "js";
  return "";
};

const parts = [];
parts.push(`# Capital Finanças — Snapshot de código (UI/Design)`);
parts.push(``);
parts.push(`Gerado em ${new Date().toISOString()}`);
parts.push(``);
parts.push(`> Concatenação completa de \`tailwind.config.ts\`, \`app/layout.tsx\`, \`app/globals.css\`, todas as \`app/**/page.tsx\` e todos os \`components/**/*.tsx\` da plataforma. Use Ctrl+F pra navegar; cada arquivo começa com um cabeçalho \`## <caminho>\`.`);
parts.push(``);
parts.push(`---`);
parts.push(``);

// TOC
parts.push(`## Sumário`);
parts.push(``);
for (const g of groups) {
  parts.push(`### ${g.title}`);
  for (const f of g.files) {
    const norm = f.replace(/\\/g, "/");
    parts.push(`- [${norm}](#${norm.replace(/[^a-z0-9]/gi, "-").toLowerCase()})`);
  }
  parts.push(``);
}
parts.push(`---`);
parts.push(``);

let totalBytes = 0;
let count = 0;
let missing = 0;

for (const g of groups) {
  parts.push(`# ${g.title}`);
  parts.push(``);
  for (const f of g.files) {
    const norm = f.replace(/\\/g, "/");
    const abs = resolve(ROOT_PROJ, f);
    let content = "";
    try {
      content = readFileSync(abs, "utf8");
      totalBytes += statSync(abs).size;
      count++;
    } catch (e) {
      missing++;
      parts.push(`## ${norm}`);
      parts.push(``);
      parts.push(`> _arquivo não encontrado: ${e.message}_`);
      parts.push(``);
      continue;
    }
    parts.push(`## ${norm}`);
    parts.push(``);
    parts.push("```" + langOf(norm));
    parts.push(content.replace(/```/g, "``​`")); // evita quebrar fence
    parts.push("```");
    parts.push(``);
  }
}

const final = parts.join("\n");
writeFileSync(OUT, final, "utf8");

console.log(`OK`);
console.log(`Output: ${OUT}`);
console.log(`Arquivos: ${count} (faltando: ${missing})`);
console.log(`Bytes lidos: ${totalBytes.toLocaleString("pt-BR")}`);
console.log(`Bytes escritos: ${Buffer.byteLength(final, "utf8").toLocaleString("pt-BR")}`);
console.log(`Caminho relativo do output: ${relative(ROOT_PROJ, OUT)}`);
