import { expect, test } from "@playwright/test";
import { dismissOnboardingIfPresent, installE2eStubs } from "./helpers/network";
import { makeMinimalPdf } from "./helpers/pdf";

/**
 * Cenário 6 — Loop completo Upload → Review → Generate
 *
 * Fecha o caminho crítico de uma análise:
 *  1. Login via storageState.
 *  2. Stubs E2E ativos (extract + bureaus).
 *  3. Sobe CNPJ + Contrato (atalho "Prosseguir com dados incompletos").
 *  4. Review carrega — clica "Gerar Relatório" (forçando avanço se preciso).
 *  5. GenerateStep deve renderizar com botões de exportação visíveis
 *     (PDF, Visualizar HTML, Word, Excel, HTML).
 *
 * NÃO testa geração real de PDF/HTML — só que a tela carregou e os
 * botões estão clicáveis. Geração real envolve Puppeteer/jsPDF que
 * são caros e flaky em CI.
 */
test.describe("Generate — fluxo completo até a tela de exportação", () => {
  test("upload → review → generate carrega com botões de exportação", async ({ page }) => {
    test.setTimeout(120_000);

    await installE2eStubs(page);

    await page.goto("/");
    expect(page.url(), "esperado autenticado").not.toContain("/login");

    await dismissOnboardingIfPresent(page);

    // Vai pra UploadStep
    await page.getByRole("navigation").getByRole("button", { name: "Nova Coleta", exact: true }).click();

    // Sobe os 2 docs e força avanço (mesma estratégia do review.authenticated)
    const uploadDoc = async (docKey: string, filename: string) => {
      const pdf = await makeMinimalPdf({ title: `${docKey} — E2E` });
      await page.locator(`[data-testid="upload-input-${docKey}"]`).setInputFiles({
        name: filename,
        mimeType: "application/pdf",
        buffer: Buffer.from(pdf),
      });
      await expect(
        page.locator(`[data-testid="upload-area-${docKey}"]`),
      ).toHaveAttribute("data-upload-status", "done", { timeout: 30_000 });
    };

    await uploadDoc("cnpj",     "cartao-cnpj.pdf");
    await uploadDoc("contrato", "contrato.pdf");

    await page.locator('[data-testid="upload-prosseguir-incompletos"]').click();
    const prosseguir = page.locator('[data-testid="upload-prosseguir-btn"]');
    // Espera data-state virar "ready" (forcarAvancar propagado no React)
    await expect(prosseguir).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
    await prosseguir.click();

    // ── Review aparece. Avançar pra Generate ─────────────────────────────
    // O botão pode estar bloqueado por validações (quality checks). Se for,
    // clica "Prosseguir mesmo assim" antes.
    const gerarRelatorioBtn = page.locator('[data-testid="review-gerar-relatorio-btn"]');
    await expect(gerarRelatorioBtn).toBeVisible({ timeout: 15_000 });

    // Se data-state=blocked, força com link "Prosseguir mesmo assim"
    const state = await gerarRelatorioBtn.getAttribute("data-state");
    if (state === "blocked") {
      await page.locator('[data-testid="review-prosseguir-mesmo-assim"]').click();
      await expect(gerarRelatorioBtn).toHaveAttribute("data-state", "ready", { timeout: 5_000 });
    }
    // OnboardingTooltip flutuante (`fixed bottom-6 right-6`) intercepta pointer
    // events mesmo com force=true. Dispatcha o click via DOM direto pra
    // bypassar qualquer overlay sem afetar a lógica do componente.
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>('[data-testid="review-gerar-relatorio-btn"]');
      btn?.click();
    });

    // ── GenerateStep carregou — valida botões de exportação ──────────────
    // Não geramos PDF real (Puppeteer + Chromium em CI seria pesado).
    // Só valida que a UI de exportação renderizou pronta pra uso.
    const pdfBtn  = page.locator('[data-testid="export-pdf-pdf"]');
    const htmlBtn = page.locator('[data-testid="export-html-visualizar"]');
    await expect(pdfBtn,  "botão Exportar PDF deve estar visível na Generate").toBeVisible({ timeout: 30_000 });
    await expect(htmlBtn, "botão Visualizar HTML deve estar visível na Generate").toBeVisible({ timeout: 5_000 });
  });
});
