import { expect, test } from "@playwright/test";

/**
 * Cenário autenticado — Stubs E2E com sessão real
 *
 * Mesmo conteúdo do bureaus-stub.spec.ts, mas roda no projeto
 * `chromium-authenticated` que usa storageState do auth.setup.ts.
 * Aqui validamos status 200 (não mais "200 ou 401") porque a sessão
 * vem pronta do setup project.
 */
test.describe("Stubs E2E autenticados", () => {
  test("POST /api/bureaus com x-e2e-mode retorna fixture (status 200)", async ({ request }) => {
    const res = await request.post("/api/bureaus", {
      headers: { "x-e2e-mode": "true", "content-type": "application/json" },
      data: {
        cnpj: "12345678000190",
        data: {
          cnpj: { cnpj: "12345678000190", razaoSocial: "Empresa E2E Stub LTDA" },
          qsa: { quadroSocietario: [], capitalSocial: "" },
        },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.bureaus.e2e_stub.mock).toBe(true);
    expect(body.bureaus).not.toHaveProperty("credithub");
    expect(body.bureaus).not.toHaveProperty("bigdatacorp");
  });

  test("POST /api/extract com x-e2e-mode retorna fixture (status 200)", async ({ request }) => {
    const res = await request.post("/api/extract", {
      headers: {
        "x-e2e-mode":  "true",
        "x-e2e-doc-type": "cnpj",
        "content-type": "application/json",
      },
      data: { blobUrl: "noop://e2e", type: "cnpj" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta?.e2eStub).toBe(true);
    expect(body.meta?.aiPowered).toBe(false);
    expect(body.data).toMatchObject({
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Empresa E2E Stub LTDA",
      situacaoCadastral: "ATIVA",
    });
  });
});
