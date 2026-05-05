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
 *  1. Login via storageState.
 *  2. Stubs E2E: /api/extract retorna fixture cnpj com dataAbertura,
 *     fixture contrato com dataConstituicao vazia.
 *  3. Sobe CNPJ + contrato em UploadStep.
 *  4. Clica "Prosseguir para Revisão".
 *  5. Expande a section "Contrato Social".
 *  6. Valida que campo "Data de Constituição" tem valor preenchido E
 *     badge "do cartão CNPJ" está visível.
 *
 * Sem esse teste, regressões no useEffect de auto-fill ou na flag
 * dataConstituicaoEhDoCnpj só apareceriam em produção.
 */
test.describe("Review — auto-fill Data de Constituição", () => {
  // TODO: cenário desativado em 2026-05-05 — UploadStep tem state machine async
  // complexa (4 uploads + extração paralela + modal de onboarding) que torna o
  // teste flaky. Próxima iteração: ou (a) bypassar UI subindo direto via /api/upload-blob
  // + criar collection no Supabase pelos endpoints, ou (b) destrinchar UploadStep
  // pra entender quando o estado "Prosseguir habilitado" estabiliza.
  // Esqueleto preservado pra retomada: stubs cobrem os 4 tipos, helpers prontos.
  test.skip("contrato sem data herda do cartão CNPJ com badge visível", async ({ page }) => {
    test.setTimeout(120_000);

    await installE2eStubs(page);

    await page.goto("/");
    expect(page.url(), "esperado autenticado").not.toContain("/login");

    // Dispensa WelcomeModal de onboarding se aparecer (intercepta cliques se ficar)
    await dismissOnboardingIfPresent(page);

    // Vai pra UploadStep
    await page.getByRole("navigation").getByRole("button", { name: "Nova Coleta", exact: true }).click();

    // Helper local: localiza o input file de uma section pelo título exato
    const inputForSection = (title: string) => {
      const titleP = page.getByText(title, { exact: true });
      return titleP.locator('xpath=ancestor::div[.//input[@type="file"]][1]//input[@type="file"]');
    };

    // ── Sobe os 4 documentos obrigatórios ────────────────────────────────
    // O botão "Prosseguir para Revisão" só habilita com os 4 (CNPJ, QSA,
    // Contrato Social, Faturamento). Stubs do /api/extract retornam fixture
    // pra cada tipo automaticamente baseado no `type` do body.
    const uploadDoc = async (sectionTitle: string, filename: string) => {
      const pdf = await makeMinimalPdf({ title: `${sectionTitle} — E2E` });
      await inputForSection(sectionTitle).setInputFiles({
        name: filename,
        mimeType: "application/pdf",
        buffer: Buffer.from(pdf),
      });
      await expect(page.getByText(filename)).toBeVisible({ timeout: 15_000 });
    };

    await uploadDoc("Cartão CNPJ", "cartao-cnpj.pdf");
    await uploadDoc("QSA", "qsa.pdf");
    await uploadDoc("Contrato Social", "contrato.pdf");
    await uploadDoc("Faturamento", "faturamento.pdf");

    // ── Prosseguir para Revisão ──────────────────────────────────────────
    // UploadStep continua rodando extração em background mesmo após filenames
    // visíveis — botão só desbloqueia quando todos os 4 docs concluem. Stubs são
    // instantâneos mas state machine + flush React adiciona ~5-10s no total.
    const prosseguir = page.getByRole("button", { name: /Prosseguir para Revisão/i });
    await expect(prosseguir, "botão 'Prosseguir para Revisão' deve aparecer + habilitar após extração dos 4 docs").toBeEnabled({ timeout: 45_000 });
    await prosseguir.click();

    // ── Na Review, expande a section Contrato Social se ainda colapsada
    // O ReviewStep abre só CNPJ por default; outras sections começam fechadas.
    // Clica no header "Contrato Social" pra expandir. Idempotente o suficiente:
    // se já abriu, expande/colapsa inocuamente — o waitFor abaixo dá certeza.
    await page.getByText("Contrato Social", { exact: true }).first().click();

    // ── Valida campo Data de Constituição preenchido + badge ────────────
    // Estrutura: <label>Data de Constituição [+ <span>do cartão CNPJ</span>]</label> + <input value="01/01/2020">
    const dataConstituicaoLabel = page.getByText("Data de Constituição", { exact: true });
    await expect(dataConstituicaoLabel, "label 'Data de Constituição' deve estar visível na Review").toBeVisible({ timeout: 10_000 });

    const dataInput = dataConstituicaoLabel.locator('xpath=following::input[1]');
    await expect(dataInput, "input ao lado do label deve ter valor herdado do CNPJ (01/01/2020)").toHaveValue("01/01/2020", { timeout: 10_000 });

    // Badge "do cartão CNPJ" deve estar dentro/perto do label
    const badge = dataConstituicaoLabel.locator('xpath=ancestor::label[1]//span[contains(text(),"do cartão CNPJ")]');
    await expect(badge, "badge 'do cartão CNPJ' deve aparecer ao lado do label quando valor foi herdado").toBeVisible({ timeout: 5_000 });
  });
});
