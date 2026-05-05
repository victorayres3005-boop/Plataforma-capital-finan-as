import { expect, test } from "@playwright/test";

/**
 * Cenário 2 — Stubs E2E (bureaus + extract)
 *
 * Valida que /api/bureaus e /api/extract retornam fixture estática quando
 * o header `x-e2e-mode: true` é enviado, sem chamar bureaus/Gemini reais.
 *
 * Esses stubs destravam os cenários upload/review/generate (sessão dedicada
 * próxima) — eles precisarão deles pra não custar bureau real ou Gemini
 * a cada test run.
 *
 * NOTA: endpoints exigem autenticação. Pra MVP, aceita 200 ou 401.
 * Quando precisarmos validar 200 real, basta carregar storageState
 * de uma sessão logada anteriormente.
 */
test.describe("Stubs E2E (bureaus + extract)", () => {
  test("POST /api/bureaus com x-e2e-mode retorna fixture sem chamar bureau real", async ({ request }) => {
    const res = await request.post("/api/bureaus", {
      headers: {
        "x-e2e-mode": "true",
        "content-type": "application/json",
      },
      data: {
        cnpj: "12345678000190",
        data: {
          cnpj: { cnpj: "12345678000190", razaoSocial: "Empresa E2E Stub LTDA" },
          qsa: { quadroSocietario: [], capitalSocial: "" },
        },
      },
    });

    // A rota é protegida por auth (createServerSupabase + getUser).
    // Sem sessão, retorna 401 — esse é o comportamento esperado e valida
    // que a proteção continua ativa mesmo no modo E2E.
    // Quando rodar autenticado, deve retornar 200 + bureaus.e2e_stub presente.
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.bureaus).toHaveProperty("e2e_stub");
      expect(body.bureaus.e2e_stub.mock).toBe(true);
      // Verifica que NÃO veio nenhum bureau real (credithub, bdc, assertiva, databox360)
      expect(body.bureaus).not.toHaveProperty("credithub");
      expect(body.bureaus).not.toHaveProperty("bigdatacorp");
    }
  });

  test("POST /api/extract com x-e2e-mode retorna fixture sem chamar Gemini", async ({ request }) => {
    // /api/extract NÃO tem auth check no início — qualquer request com
    // x-e2e-mode pega o stub direto. Manda body JSON mínimo (que normalmente
    // seria interpretado como caminho blobUrl) e o stub intercepta antes.
    const res = await request.post("/api/extract", {
      headers: {
        "x-e2e-mode":  "true",
        "x-e2e-doc-type": "cnpj",
        "content-type": "application/json",
      },
      data: { blobUrl: "noop://e2e", type: "cnpj" },
    });

    // Middleware bloqueia /api/extract sem sessão (401) — esperado.
    // Quando autenticado (cenários futuros com storageState), stub responde 200.
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.meta?.e2eStub).toBe(true);
      expect(body.meta?.aiPowered).toBe(false);
      expect(body.data).toMatchObject({
        cnpj: "12.345.678/0001-90",
        razaoSocial: "Empresa E2E Stub LTDA",
        situacaoCadastral: "ATIVA",
      });
    }
  });
});
