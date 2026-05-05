import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Carrega .env.local (Playwright não faz auto-load como Next.js).
// Apenas variáveis ainda não setadas no process.env são preenchidas — assim
// envs de CI/shell sempre vencem.
const envPath = resolve(__dirname, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

/**
 * Configuração Playwright — Capital Finanças
 *
 * Roda contra dev local (porta 3017). Para rodar contra preview Vercel,
 * setar PLAYWRIGHT_BASE_URL no env.
 *
 * Cenários ficam em e2e/. Cada arquivo *.spec.ts é uma suíte.
 */
export default defineConfig({
  testDir: "./e2e",
  // Timeout por teste (UI lenta = upload + análise pode demorar)
  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3017",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // 1) Roda primeiro: faz login via formulário e salva storageState.
    //    Skipa quando E2E_USER_EMAIL/PASSWORD ausentes.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // 2) Cenários públicos/sem auth (smoke, login spec, stubs).
    //    Não dependem do setup — rodam em paralelo.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/auth\.setup\.ts/, /\.authenticated\.spec\.ts/],
    },
    // 3) Cenários que precisam de sessão pronta — herdam storageState
    //    salvo pelo setup. Convenção: nomear o arquivo *.authenticated.spec.ts.
    {
      name: "chromium-authenticated",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      testMatch: /\.authenticated\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],

  // Quando rodar localmente sem dev server ativo, sobe automaticamente.
  // Em CI, o workflow é responsável por subir o build.
  webServer: process.env.CI ? undefined : {
    command: "npm run dev",
    url: "http://localhost:3017",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
