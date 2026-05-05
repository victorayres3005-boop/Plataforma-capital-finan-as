import { defineConfig, devices } from "@playwright/test";

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
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
