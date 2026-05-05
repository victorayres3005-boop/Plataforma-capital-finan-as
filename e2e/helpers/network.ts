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
