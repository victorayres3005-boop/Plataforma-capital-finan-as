import { expect, type Page } from "@playwright/test";

/**
 * Helpers de autenticação para a suíte E2E.
 *
 * Pré-requisitos:
 *   - Usuário de teste criado via e2e/fixtures/setup-user.sql
 *   - Variáveis de ambiente E2E_USER_EMAIL e E2E_USER_PASSWORD setadas
 *     (em .env.local pra rodar local, em secrets do GitHub Actions pra CI)
 */

export interface E2eCredentials {
  email: string;
  password: string;
}

export function getCredentials(): E2eCredentials {
  const email    = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_USER_EMAIL e E2E_USER_PASSWORD precisam estar no env. " +
      "Rode e2e/fixtures/setup-user.sql no Supabase e adicione as variáveis no .env.local.",
    );
  }
  return { email, password };
}

/**
 * Loga via formulário em /login. Espera o redirect pós-login terminar.
 *
 * Ao falhar (credenciais erradas, página mudou, etc.) o teste falha com
 * mensagem clara em vez de timeout silencioso.
 */
export async function loginViaForm(page: Page, creds: E2eCredentials = getCredentials()): Promise<void> {
  await page.goto("/login");

  const emailInput    = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  // A página tem 2 botões com "Entrar": o toggle de tab (Entrar/Cadastrar) e o submit
  // ("Entrar na plataforma"). Pegar pelo texto exato do submit pra não confundir.
  const submitBtn     = page.locator('button:has-text("Entrar na plataforma")').first();

  await expect(emailInput,    "input de email não encontrado em /login").toBeVisible();
  await expect(passwordInput, "input de senha não encontrado em /login").toBeVisible();

  await emailInput.fill(creds.email);
  await passwordInput.fill(creds.password);
  await submitBtn.click();

  // Espera sair de /login. Quando o middleware redireciona pra home (ou onde quer
  // que mande), a URL muda. Se ficar em /login após 8s, falhou (provável credencial errada).
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 8000 });
}
