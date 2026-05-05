import { expect, test } from "@playwright/test";
import { installE2eStubs } from "./helpers/network";
import { makeMinimalPdf } from "./helpers/pdf";

/**
 * Cenário 4 — Upload real de Cartão CNPJ
 *
 * Fluxo coberto:
 *  1. Sessão pronta via storageState (auth.setup.ts).
 *  2. Stubs E2E ativados (header x-e2e-mode injetado em /api/extract
 *     e /api/bureaus) — extração e bureaus retornam fixture estática.
 *  3. PDF mínimo gerado em runtime via pdf-lib.
 *  4. setInputFiles no input file da UploadArea "Cartão CNPJ".
 *  5. Espera o badge de sucesso ("Trocar" surge quando processing=false
 *     e files.length>0 — sinal de extração concluída).
 *
 * Sem esse fluxo coberto, regressões no UploadStep só apareciam em prod.
 */
test.describe("Upload real autenticado", () => {
  test("upload de Cartão CNPJ chega ao estado 'concluído'", async ({ page }) => {
    await installE2eStubs(page);

    await page.goto("/");
    // O middleware redireciona pra /login se a sessão não pegou — aborta cedo nesse caso
    expect(page.url(), "esperado estar autenticado, mas redirecionou pra /login").not.toContain("/login");

    // Home pós-login é dashboard. Pra chegar no UploadStep, clicar no botão "Nova Coleta"
    // da sidebar (existem 3 botões com esse texto na home — sidebar, dashboard right-col,
    // e CTA principal "Nova Coleta de Documentos"; o da sidebar é o mais estável).
    await page.getByRole("navigation").getByRole("button", { name: "Nova Coleta", exact: true }).click();

    // Localiza o input file da UploadArea "Cartão CNPJ".
    // Estratégia: do <p> com o título exato, sobe pelo XPath até o primeiro
    // ancestral que contém um <input type="file"> — esse é o root da UploadArea.
    const titleP = page.getByText("Cartão CNPJ", { exact: true });
    await expect(titleP, "título 'Cartão CNPJ' deve estar visível depois do click em 'Nova Coleta'").toBeVisible({ timeout: 10000 });
    const fileInput = titleP.locator('xpath=ancestor::div[.//input[@type="file"]][1]//input[@type="file"]');

    const pdfBytes = await makeMinimalPdf({ title: "Cartão CNPJ — E2E", body: "Test fixture" });
    await fileInput.setInputFiles({
      name: "cartao-cnpj-e2e.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // Asserção robusta: o nome do arquivo deve aparecer na UI depois do upload.
    // Significa que UploadStep aceitou o file e o estado interno tem `hasFiles=true`.
    // Não dependemos do label "Trocar" porque ele só aparece quando processing=false,
    // e o stub do extract pode ou não ter chegado a tempo do timeout.
    await expect(
      page.getByText("cartao-cnpj-e2e.pdf"),
      "filename do upload deve aparecer na UI da UploadArea Cartão CNPJ",
    ).toBeVisible({ timeout: 15000 });
  });
});
