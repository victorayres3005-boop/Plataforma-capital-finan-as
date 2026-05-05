import { test as setup } from "@playwright/test";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { loginViaForm, getCredentials } from "./helpers/auth";

/**
 * Setup project — roda UMA vez antes dos testes autenticados.
 *
 * Faz login via formulário (caminho real do usuário) e salva o
 * storageState (cookies + localStorage) em playwright/.auth/user.json.
 * Os projetos `chromium-authenticated` consumem esse arquivo via config.
 *
 * Skipa quando E2E_USER_EMAIL/PASSWORD ausentes — assim a infra E2E
 * não quebra em máquinas que ainda não rodaram setup-e2e-user.mjs.
 */

export const STORAGE_STATE = path.join(__dirname, "..", "playwright", ".auth", "user.json");

setup("autentica e salva storageState", async ({ page }) => {
  setup.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "E2E_USER_EMAIL/PASSWORD ausentes — rode scripts/setup-e2e-user.mjs primeiro",
  );

  // Garante que o diretório existe (Playwright não cria sozinho na 1ª vez)
  const dir = path.dirname(STORAGE_STATE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  await loginViaForm(page, getCredentials());
  await page.context().storageState({ path: STORAGE_STATE });
});
