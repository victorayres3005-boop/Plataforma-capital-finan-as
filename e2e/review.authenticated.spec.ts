import { expect, test } from "@playwright/test";
import { dismissOnboardingIfPresent, installE2eStubs } from "./helpers/network";
import { makeMinimalPdf } from "./helpers/pdf";

/**
 * Cenário 5 — Review com auto-fill de Data de Constituição
 *
 * Cobre a feature entregue em b980451 + f9451d6: quando o contrato vem
 * sem dataConstituicao mas o cartão CNPJ tem dataAbertura, a Review
 * preenche automaticamente o campo e exibe badge "do cartão CNPJ".
 *
 * Fluxo:
 *  1. Login via storageState (auth.setup.ts).
 *  2. Stubs E2E ativam fixtures estáticas no /api/extract.
 *  3. Sobe os 4 docs obrigatórios (CNPJ, QSA, Contrato, Faturamento).
 *  4. Espera botão "Prosseguir para Revisão" virar 'ready' (data-state).
 *  5. Click → Review.
 *  6. Valida campo via data-testid: 01/01/2020 herdado + badge visível.
 *
 * Seletores baseados em data-testid pra isolar do CSS/HTML — qualquer
 * refator visual mantém o teste verde.
 */
test.describe("Review — auto-fill Data de Constituição", () => {
  test("contrato sem data herda do cartão CNPJ com badge visível", async ({ page }) => {
    test.setTimeout(120_000);

    await installE2eStubs(page);

    await page.goto("/");
    expect(page.url(), "esperado autenticado").not.toContain("/login");

    // Dispensa modal de onboarding se aparecer (intercepta cliques)
    await dismissOnboardingIfPresent(page);

    // Vai pra UploadStep
    await page.getByRole("navigation").getByRole("button", { name: "Nova Coleta", exact: true }).click();

    // ── Sobe os 4 documentos obrigatórios via data-testid ────────────────
    const uploadDoc = async (docKey: string, filename: string) => {
      const pdf = await makeMinimalPdf({ title: `${docKey} — E2E` });
      await page.locator(`[data-testid="upload-input-${docKey}"]`).setInputFiles({
        name: filename,
        mimeType: "application/pdf",
        buffer: Buffer.from(pdf),
      });
      // Espera data-upload-status virar "done". Frontend tem fila global com
      // EXTRACT_DELAY_MS=4000 entre chamadas — 4 docs sequenciais demoram ~12s
      // só de delay forçado, mais state updates. 30s/doc cobre folga.
      await expect(
        page.locator(`[data-testid="upload-area-${docKey}"]`),
        `upload de ${docKey} deve atingir status=done`,
      ).toHaveAttribute("data-upload-status", "done", { timeout: 30_000 });
    };

    // Sobe só os 2 docs relevantes pra esse cenário (CNPJ tem dataAbertura
    // que vira fonte; contrato vem com dataConstituicao vazia). Os outros
    // obrigatórios (QSA, Faturamento) são pulados — vamos usar o atalho
    // "Prosseguir com dados incompletos" pra atingir Review.
    await uploadDoc("cnpj",     "cartao-cnpj.pdf");
    await uploadDoc("contrato", "contrato.pdf");

    // ── Prosseguir com dados incompletos ────────────────────────────────
    // Botão aparece quando requiredDoneCount >= 1 e nem todos os docs estão
    // prontos. Permite chegar na Review sem subir QSA + Faturamento.
    const prosseguirIncompletos = page.locator('[data-testid="upload-prosseguir-incompletos"]');
    await expect(prosseguirIncompletos).toBeVisible({ timeout: 10_000 });
    await prosseguirIncompletos.click();

    // Após clicar, o botão "Prosseguir para Revisão" fica enabled
    const prosseguir = page.locator('[data-testid="upload-prosseguir-btn"]');
    await expect(prosseguir, "botão principal deve habilitar após forçar avanço").toBeEnabled({ timeout: 5_000 });
    await prosseguir.click();

    // ── Na Review, expande a section Contrato Social ─────────────────────
    // ReviewStep abre só CNPJ por default. Clica no header "Contrato Social".
    await page.getByText("Contrato Social", { exact: true }).first().click();

    // ── Valida via data-testid (independe de label/HTML) ─────────────────
    const dataInput = page.locator('[data-testid="field-contrato-data-constituicao-input"]');
    await expect(dataInput, "input Data de Constituição deve estar visível").toBeVisible({ timeout: 10_000 });
    await expect(dataInput, "input deve ter valor herdado do CNPJ (01/01/2020)").toHaveValue("01/01/2020");

    const badge = page.locator('[data-testid="contrato-data-constituicao-from-cnpj"]');
    await expect(badge, "badge 'do cartão CNPJ' deve aparecer ao lado do label").toBeVisible({ timeout: 5_000 });
  });
});
