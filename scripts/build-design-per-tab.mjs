// Quebra a UI em arquivos por aba: cerebro/design/{_design-system, home, historico, ...}.md
// Cada arquivo contém o page.tsx da aba + os componentes específicos dela.
// O _design-system.md tem o que é compartilhado (Tailwind, layout, UI primitives).
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { globSync } from "glob";

const ROOT_PROJ = resolve(process.cwd());
const OUT_DIR   = resolve(ROOT_PROJ, "cerebro", "design");

mkdirSync(OUT_DIR, { recursive: true });

// Helpers ─────────────────────────────────────────────────────────────────────
function read(rel) {
  const abs = resolve(ROOT_PROJ, rel);
  if (!existsSync(abs)) return null;
  return { content: readFileSync(abs, "utf8"), bytes: statSync(abs).size };
}
function langOf(p) {
  if (p.endsWith(".tsx") || p.endsWith(".ts")) return "tsx";
  if (p.endsWith(".css")) return "css";
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "js";
  return "";
}
function fenceContent(s) {
  return s.replace(/```/g, "``​`"); // evita quebrar fence
}
function buildDoc(title, intro, files) {
  const parts = [];
  parts.push(`# ${title}`);
  parts.push(``);
  parts.push(intro);
  parts.push(``);
  parts.push(`Gerado em ${new Date().toISOString()}`);
  parts.push(``);
  parts.push(`---`);
  parts.push(``);
  parts.push(`## Sumário`);
  for (const f of files) {
    parts.push(`- \`${f}\``);
  }
  parts.push(``);
  parts.push(`---`);
  parts.push(``);

  let totalBytes = 0;
  let missing = 0;
  for (const f of files) {
    const norm = f.replace(/\\/g, "/");
    const r = read(norm);
    parts.push(`## ${norm}`);
    parts.push(``);
    if (!r) {
      missing++;
      parts.push(`> _arquivo não encontrado_`);
      parts.push(``);
      continue;
    }
    totalBytes += r.bytes;
    parts.push("```" + langOf(norm));
    parts.push(fenceContent(r.content));
    parts.push("```");
    parts.push(``);
  }
  return { md: parts.join("\n"), totalBytes, missing, count: files.length - missing };
}

// Buckets ─────────────────────────────────────────────────────────────────────
// Todos os caminhos relativos a capital-financas/.
const SHARED = [
  "tailwind.config.ts",
  "app/layout.tsx",
  "app/globals.css",
  "components/layout/LayoutShell.tsx",
  "components/layout/Sidebar.tsx",
  "components/layout/Topbar.tsx",
  "components/Logo.tsx",
  "components/ThemeToggle.tsx",
  "components/PageTransition.tsx",
  "components/CommandPalette.tsx",
  "components/DevBanner.tsx",
  "components/OnboardingTooltip.tsx",
  // shadcn primitives
  ...globSync("components/ui/*.tsx", { cwd: ROOT_PROJ }).sort(),
];

const SHARED_INTRO = `Design system, layout shell e primitives da plataforma Capital Finanças.

**Como usar com Claude/ChatGPT:** envie este arquivo PRIMEIRO, depois o arquivo da aba específica que você quer redesenhar. Assim a IA tem o contexto de tokens, sidebar, topbar e componentes UI base antes de propor mudanças visuais.

**O que está aqui:**
- \`tailwind.config.ts\` — paleta de cores, tipografia, breakpoints, animações
- \`app/globals.css\` — variáveis CSS, reset, classes utilitárias globais
- \`app/layout.tsx\` — root layout (fontes, providers)
- \`components/layout/*\` — Sidebar (navegação principal), Topbar, LayoutShell
- \`components/ui/*\` — primitives shadcn (button, card, dialog, input, table, tabs, etc.)
- Auxiliares de UX (CommandPalette, OnboardingTooltip, ThemeToggle, PageTransition)`;

const TABS = [
  {
    file: "home.md",
    title: "Aba: Nova Análise (Home)",
    intro: `Tela principal da plataforma — fluxo de 3 passos: Upload → Revisão → Geração de relatório.

**Fluxo do usuário:**
1. **UploadStep:** analista faz upload dos documentos (CNPJ, QSA, contrato social, faturamento, SCR, balanço, DRE, etc.). Pipeline extrai via Gemini.
2. **ReviewStep:** analista revisa os campos extraídos antes da análise final, dividido em ~12 sub-seções (uma por tipo de documento).
3. **GenerateStep:** dispara análise de IA, mostra parecer + score, exporta relatório PDF/HTML.`,
    files: [
      "app/page.tsx",
      "components/UploadStep.tsx",
      "components/ReviewStep.tsx",
      "components/GenerateStep.tsx",
      "components/UploadArea.tsx",
      "components/AlertList.tsx",
      "components/ProgressBar.tsx",
      "components/WelcomeModal.tsx",
      "components/FirstCollectionChecklist.tsx",
      "components/GoalfyButton.tsx",
      ...globSync("components/review/*.tsx", { cwd: ROOT_PROJ }).sort(),
      ...globSync("components/generate/*.tsx", { cwd: ROOT_PROJ }).sort(),
      ...globSync("components/report/*.tsx", { cwd: ROOT_PROJ }).sort(),
      ...globSync("components/score/*.tsx", { cwd: ROOT_PROJ }).sort(),
    ],
  },
  {
    file: "historico.md",
    title: "Aba: Histórico",
    intro: `Lista todas as análises de crédito feitas pelo usuário. Filtros por status, empresa, data.`,
    files: ["app/historico/page.tsx"],
  },
  {
    file: "pareceres.md",
    title: "Aba: Pareceres",
    intro: `Pareceres de crédito gerados pela plataforma. Lista (\`/pareceres\`), visualização individual (\`/parecer/[id]\`) e roteador (\`/parecer\`).`,
    files: [
      "app/pareceres/page.tsx",
      "app/parecer/page.tsx",
      "app/parecer/[id]/page.tsx",
    ],
  },
  {
    file: "operacoes.md",
    title: "Aba: Operações",
    intro: `Histórico de operações de crédito (duplicatas, CCB, NF, etc.) com status e modalidade.`,
    files: ["app/operacoes/page.tsx"],
  },
  {
    file: "metricas.md",
    title: "Aba: Métricas",
    intro: `Dashboard de métricas operacionais da plataforma — volume de análises, distribuição de ratings, tempo médio.`,
    files: ["app/metricas/page.tsx"],
  },
  {
    file: "custos.md",
    title: "Aba: Custos",
    intro: `Painel de custos por bureau (BDC, Assertiva, DataBox360) — chamadas, preço unitário, total mensal.`,
    files: ["app/custos/page.tsx"],
  },
  {
    file: "configuracoes.md",
    title: "Aba: Configurações",
    intro: `Configurações da conta + Política de Crédito V2.

**Política de Crédito** é a sub-aba mais densa: contém critérios, pesos, alertas, rating, elegibilidade e parâmetros operacionais — cada um numa tab interna.`,
    files: [
      "app/configuracoes/page.tsx",
      ...globSync("components/politica/*.tsx", { cwd: ROOT_PROJ }).sort(),
    ],
  },
  {
    file: "perfil.md",
    title: "Aba: Perfil",
    intro: `Tela de perfil do usuário — dados pessoais, configurações de conta.`,
    files: ["app/perfil/page.tsx"],
  },
  {
    file: "admin.md",
    title: "Aba: Admin (interno)",
    intro: `Telas administrativas internas — debug de extração e rating drift.`,
    files: [
      "app/admin/extraction/page.tsx",
      "app/admin/rating-drift/page.tsx",
    ],
  },
  {
    file: "ajuda.md",
    title: "Aba: Ajuda",
    intro: `Central de ajuda / FAQ da plataforma.`,
    files: ["app/ajuda/page.tsx"],
  },
  {
    file: "login.md",
    title: "Aba: Login",
    intro: `Tela de autenticação — Supabase Auth.`,
    files: ["app/login/page.tsx"],
  },
  {
    file: "importar-goalfy.md",
    title: "Aba: Importar Goalfy",
    intro: `Importação de leads/empresas via integração com Goalfy.`,
    files: ["app/importar-goalfy/page.tsx"],
  },
  {
    file: "empresa-cnpj.md",
    title: "Aba: Empresa por CNPJ",
    intro: `Página dinâmica que mostra o histórico consolidado de uma empresa específica.`,
    files: ["app/empresa/[cnpj]/page.tsx"],
  },
  {
    file: "v2-metricas-pareceres.md",
    title: "Aba: V2 (em desenvolvimento)",
    intro: `Telas em desenvolvimento da próxima versão (\`/v2\`) — métricas e pareceres remodelados.`,
    files: [
      "app/v2/page.tsx",
      "app/v2/metricas/page.tsx",
      "app/v2/pareceres/page.tsx",
    ],
  },
];

// ─── Geração ──────────────────────────────────────────────────────────────────
const PROMPT_TEMPLATE = `# Como usar este conjunto de arquivos com Claude/ChatGPT

## Para redesign visual de UMA aba específica

Cole na ordem:
1. \`_design-system.md\` (tokens + layout + UI primitives)
2. O arquivo da aba que você quer redesenhar (ex: \`historico.md\`)

Depois mande um prompt como:

> Quero redesenhar visualmente esta tela mantendo a mesma estrutura de dados e a mesma navegação. Proponha:
> 1. Uma nova paleta de cores e hierarquia tipográfica que combine com o design system existente.
> 2. Reorganização visual (espaçamento, agrupamento, ênfase) sem quebrar comportamento.
> 3. Código TSX completo da página remodelada, usando os mesmos componentes UI já disponíveis.
>
> Restrições: não alterar imports de hooks, libs externas, lógica de fetch ou tipos. Apenas o JSX e classes Tailwind.

## Para um redesign GERAL da plataforma

Cole apenas \`_design-system.md\` e peça uma proposta de paleta + tipografia + tokens nova. Depois aplique aba por aba usando as orientações acima.

## Arquivos disponíveis

- \`_design-system.md\` — tokens, layout, UI primitives (sempre incluir)
- \`home.md\` — Nova Análise (Upload/Review/Generate)
- \`historico.md\`, \`pareceres.md\`, \`operacoes.md\`, \`metricas.md\`, \`custos.md\`
- \`configuracoes.md\` — inclui Política de Crédito (denso, com sub-tabs)
- \`perfil.md\`, \`admin.md\`, \`ajuda.md\`, \`login.md\`
- \`importar-goalfy.md\`, \`empresa-cnpj.md\`, \`v2-metricas-pareceres.md\`
`;

writeFileSync(resolve(OUT_DIR, "_README.md"), PROMPT_TEMPLATE, "utf8");

const summary = [];

const sharedDoc = buildDoc("_design-system", SHARED_INTRO, SHARED);
writeFileSync(resolve(OUT_DIR, "_design-system.md"), sharedDoc.md, "utf8");
summary.push({ file: "_design-system.md", count: sharedDoc.count, missing: sharedDoc.missing, kb: (sharedDoc.totalBytes / 1024).toFixed(1) });

for (const tab of TABS) {
  const doc = buildDoc(tab.title, tab.intro, tab.files);
  writeFileSync(resolve(OUT_DIR, tab.file), doc.md, "utf8");
  summary.push({ file: tab.file, count: doc.count, missing: doc.missing, kb: (doc.totalBytes / 1024).toFixed(1) });
}

console.log(`Output dir: ${OUT_DIR}\n`);
console.log("file".padEnd(30), "files".padEnd(8), "missing".padEnd(9), "kb");
console.log("-".repeat(58));
for (const s of summary) {
  console.log(s.file.padEnd(30), String(s.count).padEnd(8), String(s.missing).padEnd(9), s.kb);
}
const totalKb = summary.reduce((a, s) => a + parseFloat(s.kb), 0).toFixed(1);
console.log("-".repeat(58));
console.log("TOTAL".padEnd(30), String(summary.reduce((a,s)=>a+s.count,0)).padEnd(8), String(summary.reduce((a,s)=>a+s.missing,0)).padEnd(9), totalKb);
