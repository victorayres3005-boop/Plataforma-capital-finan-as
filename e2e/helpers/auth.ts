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

  // Captura logs de console e network failures pra diagnosticar quando o login não redireciona
  const consoleErrors: string[] = [];
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("requestfailed", req => consoleErrors.push(`request failed: ${req.url()} — ${req.failure()?.errorText}`));

  await emailInput.fill(creds.email);
  await passwordInput.fill(creds.password);
  await submitBtn.click();

  // Espera o toast de sucesso aparecer — confirma que Supabase aceitou credenciais
  // e gravou o cookie de sessão no contexto do navegador.
  const successToast = page.locator(':text("Login realizado")');
  await successToast.waitFor({ state: "visible", timeout: 10000 }).catch(() => {
    // Fallback: se não viu o toast, deixa o waitForURL abaixo decidir o erro
  });

  // Pequena pausa pra cookie ser persistido antes do navegação server-side.
  // Em headless, router.push() client-side às vezes corre antes do cookie
  // estar disponível no próximo request — full reload via goto resolve.
  await page.waitForTimeout(500);
  await page.goto("/");

  // Espera sair de /login após reload.
  try {
    await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 8000 });
  } catch (err) {
    const toastText = await page.locator('[role="alert"], [data-sonner-toast], li[data-type]').allTextContents().catch(() => []);
    throw new Error(
      `Login não redirecionou pra fora de /login após full reload.\n` +
      `URL atual: ${page.url()}\n` +
      `Toasts/alerts visíveis: ${JSON.stringify(toastText)}\n` +
      `Console errors: ${consoleErrors.join(" | ") || "(nenhum)"}\n` +
      `Erro original: ${err instanceof Error ? err.message : err}`,
    );
  }
}
