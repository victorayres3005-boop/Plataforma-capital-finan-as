import type { Page } from "@playwright/test";

/**
 * Instala interceptors no `page` que adicionam o header `x-e2e-mode: true`
 * em todas as requests pra `/api/extract` e `/api/bureaus`. Faz com que
 * o backend retorne fixtures estáticas no lugar de chamar Gemini/bureaus
 * reais — destrava cenários completos (upload → review → generate) sem
 * custo financeiro nem flakiness por dependência externa.
 *
 * Uso: chamar uma vez no início do teste, ANTES da primeira navegação
 * que dispare upload/análise.
 */
export async function installE2eStubs(page: Page): Promise<void> {
  await page.route(/\/api\/(extract|bureaus)(\/|$|\?)/, async route => {
    const original = route.request();
    const headers = {
      ...original.headers(),
      "x-e2e-mode": "true",
    };
    await route.continue({ headers });
  });
}

/**
 * Dispensa o WelcomeModal de onboarding se estiver visível.
 * Aparece pra contas novas/sem onboarding completo. Não bloqueia o teste
 * se o modal não aparecer (timeout curto, silencioso).
 */
export async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const startBtn = page.getByRole("button", { name: /Começar agora|Comecar agora/i });
  try {
    await startBtn.waitFor({ state: "visible", timeout: 2000 });
    await startBtn.click();
    // Espera o modal sumir
    await startBtn.waitFor({ state: "hidden", timeout: 3000 }).catch(() => undefined);
  } catch {
    // Modal não apareceu — fluxo normal
  }
}
