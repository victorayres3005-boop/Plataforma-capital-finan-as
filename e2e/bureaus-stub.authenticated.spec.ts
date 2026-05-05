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

  test("/api/extract stub cobre os 4 tipos obrigatórios (cnpj, qsa, contrato, faturamento)", async ({ request }) => {
    // Cobre que o stub server-side reconhece todos os tipos que o UploadStep
    // pode mandar. Importante porque Review depende de campos específicos por
    // tipo (ex: cnpj.dataAbertura aciona auto-fill de contrato.dataConstituicao).

    const expected: Record<string, (data: Record<string, unknown>) => void> = {
      cnpj: d => {
        expect(d.dataAbertura, "cnpj stub deve ter dataAbertura — auto-fill da Review depende disso").toBe("01/01/2020");
        expect(d.razaoSocial).toBe("Empresa E2E Stub LTDA");
      },
      qsa: d => {
        expect(Array.isArray(d.quadroSocietario)).toBe(true);
        expect((d.quadroSocietario as unknown[]).length).toBeGreaterThan(0);
      },
      contrato: d => {
        // Propositalmente vazio: aciona auto-fill via cnpj.dataAbertura
        expect(d.dataConstituicao, "contrato stub deve ter dataConstituicao vazia pra acionar auto-fill").toBe("");
        expect(Array.isArray(d.socios)).toBe(true);
      },
      faturamento: d => {
        expect(Array.isArray(d.meses)).toBe(true);
        expect((d.meses as unknown[]).length).toBeGreaterThanOrEqual(3);
      },
    };

    for (const [type, validate] of Object.entries(expected)) {
      const res = await request.post("/api/extract", {
        headers: { "x-e2e-mode": "true", "content-type": "application/json" },
        data: { blobUrl: "noop://e2e", type },
      });
      expect(res.status(), `tipo ${type} deve retornar 200`).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.meta?.docType).toBe(type);
      validate(body.data);
    }
  });
});
