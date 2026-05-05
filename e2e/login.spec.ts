import { expect, test } from "@playwright/test";
import { getCredentials, loginViaForm } from "./helpers/auth";

/**
 * Cenário 1 — Login real
 *
 * Usa o usuário criado via e2e/fixtures/setup-user.sql. Valida:
 *  - login com credenciais válidas redireciona pra fora de /login
 *  - login com senha errada NÃO redireciona (página fica em /login)
 *
 * Pré: env E2E_USER_EMAIL e E2E_USER_PASSWORD setados.
 */
test.describe("Login real", () => {
  // Pula esses cenários quando o env não está configurado — assim
  // a infra E2E não quebra em máquinas que ainda não rodaram o SQL.
  test.skip(
    () => !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "E2E_USER_EMAIL/PASSWORD ausentes — rode e2e/fixtures/setup-user.sql primeiro",
  );

  test("login válido redireciona pra fora de /login", async ({ page }) => {
    await loginViaForm(page);
    expect(page.url()).not.toContain("/login");
  });

  test("login com senha errada permanece em /login", async ({ page }) => {
    const creds = getCredentials();
    await page.goto("/login");

    await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email);
    await page.locator('input[type="password"], input[name="password"]').first().fill("senha-errada-XXX");
    await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")').first().click();

    // Espera 3s — se o redirect não acontecer, ainda estamos em /login = comportamento correto
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/login");
  });
});
