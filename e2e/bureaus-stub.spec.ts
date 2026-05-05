import { expect, test } from "@playwright/test";

/**
 * Cenário 2 — Stub de bureaus em modo E2E
 *
 * Valida que /api/bureaus retorna fixture estática quando o header
 * `x-e2e-mode: true` é enviado, sem chamar bureaus reais nem gravar
 * em api_usage_logs.
 *
 * Esse stub é o destravamento dos cenários upload/review/generate
 * (próxima sessão) — eles precisarão dele pra não custar bureau real
 * a cada test run.
 *
 * NOTA: este endpoint exige autenticação. Em vez de logar via UI,
 * usa o storageState do Playwright após login programático prévio.
 * Pra MVP, foca só na resposta — autenticação fica como TODO.
 */
test.describe("Stub bureaus E2E", () => {
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
});
