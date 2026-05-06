import { expect, test } from "@playwright/test";
import { dismissOnboardingIfPresent, installE2eStubs } from "./helpers/network";
import { makeMinimalPdf } from "./helpers/pdf";

/**
 * Cenário 4 — Upload real de Cartão CNPJ
 *
 * Fluxo coberto:
 *  1. Sessão pronta via storageState (auth.setup.ts).
 *  2. Stubs E2E ativados (header x-e2e-mode injetado em /api/extract
 *     e /api/bureaus) — extração retorna fixture estática.
 *  3. PDF mínimo gerado em runtime via pdf-lib.
 *  4. setInputFiles via data-testid="upload-input-cnpj".
 *  5. Espera data-upload-status="done" no área (extração concluiu).
 */
test.describe("Upload real autenticado", () => {
  test("upload de Cartão CNPJ chega ao estado 'concluído'", async ({ page }) => {
    test.setTimeout(60_000);

    await installE2eStubs(page);

    await page.goto("/");
    expect(page.url(), "esperado estar autenticado").not.toContain("/login");

    await dismissOnboardingIfPresent(page);

    // Home pós-login é dashboard. Click no "Nova Coleta" da sidebar leva pra UploadStep.
    await page.getByRole("navigation").getByRole("button", { name: "Nova Coleta", exact: true }).click();

    // Sobe o PDF via data-testid (independe de label/HTML)
    const pdfBytes = await makeMinimalPdf({ title: "Cartão CNPJ — E2E", body: "Test fixture" });
    await page.locator('[data-testid="upload-input-cnpj"]').setInputFiles({
      name: "cartao-cnpj-e2e.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // data-upload-status virando "done" significa: arquivo aceito + extração
    // concluiu via stub + processedCount > 0. É o sinal mais robusto que temos.
    await expect(
      page.locator('[data-testid="upload-area-cnpj"]'),
      "UploadArea cnpj deve atingir status=done após upload",
    ).toHaveAttribute("data-upload-status", "done", { timeout: 30_000 });
  });
});
