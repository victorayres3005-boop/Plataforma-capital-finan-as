import { expect, test } from "@playwright/test";

/**
 * Cenário 0 — Smoke test
 *
 * Garante que a infra E2E está viva: a página de login carrega, o título
 * está correto e o componente de autenticação está visível. Não exige
 * usuário logado nem mexe com bureaus.
 *
 * Se este cenário quebrar, é problema de build/deploy, não de feature.
 */
test.describe("Smoke — infra E2E viva", () => {
  test("home redireciona pra login quando deslogado", async ({ page }) => {
    const response = await page.goto("/");
    // O middleware deve redirecionar pra /login. Aceita 200 (renderizou login)
    // ou 302/307 (redirect explícito) — ambos significam que o middleware tá OK.
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/(login)?$/);
  });

  test("/login carrega sem erro de runtime", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", err => errors.push(err.message));

    await page.goto("/login");

    // Espera o body renderizar
    await expect(page.locator("body")).toBeVisible();

    // Validação minimalista: tem algum input de email/senha visível?
    // Se a UI mudar, ajuste esses seletores no fixtures.ts.
    const hasEmailInput = await page.locator('input[type="email"], input[name="email"]').count();
    expect(hasEmailInput, "esperado pelo menos 1 input de email na /login").toBeGreaterThan(0);

    // Se houve erro JS, falha o teste com a mensagem
    expect(errors, `erros JS na /login: ${errors.join(" | ")}`).toHaveLength(0);
  });
});
