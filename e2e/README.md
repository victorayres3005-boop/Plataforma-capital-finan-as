# Testes E2E — Capital Finanças

Testes end-to-end com Playwright. Rodam contra `npm run dev` na porta 3017 (default) ou contra outro `PLAYWRIGHT_BASE_URL`.

## Comandos

```bash
# rodar todos cenários (sobe dev server se não estiver rodando)
npm run test:e2e

# modo UI interativo (ótimo pra desenvolver)
npm run test:e2e:ui

# rodar contra preview Vercel
PLAYWRIGHT_BASE_URL=https://plataformacapital-xxx.vercel.app npm run test:e2e
```

## Cenários

| Arquivo | O que cobre | Status |
|---|---|---|
| `smoke.spec.ts` | Home redireciona pra login + página /login carrega sem erro JS | ✅ kick-off 2026-05-05 |
| `login.spec.ts` | Login com user de teste → home autenticada | ⏳ próxima sessão |
| `upload.spec.ts` | Upload de PDFs anonimizados → coleta criada | ⏳ próxima sessão |
| `review.spec.ts` | Review carrega + auto-fill data constituição funciona | ⏳ próxima sessão |
| `generate.spec.ts` | Geração PDF dispara download | ⏳ próxima sessão |
| `retomada.spec.ts` | Reabrir coleta preserva estado | ⏳ próxima sessão |

Para o kick-off vale o cenário smoke. Os outros entram quando tivermos:
1. Usuário de teste no Supabase (ENV: `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`)
2. PDFs anonimizados em `e2e/fixtures/` (cartão CNPJ, balanço, IR, etc.)
3. Decisão sobre stub de bureaus (não queremos custo real por test run — provável: mock via `MSW` ou flag `E2E_SKIP_BUREAUS`)

## Convenção

- Nomes de cenário no formato `<dominio>.spec.ts`
- Cada teste começa com `test.describe(<área>)` e dentro tem 2-5 `test()`s pequenos
- Seletores estáveis: prefere `data-testid` > `role` > `text`. Inputs de form prefere `name=`
- Sem dependência de bureau real — sempre mockar ou usar fixture salva
- Helpers compartilhados em `e2e/helpers/` (criar quando precisar; ainda não existe)

## CI

Workflow `.github/workflows/e2e.yml` (a criar) deve:
1. Build do Next
2. Subir dev server
3. Rodar `npm run test:e2e` com `CI=true`
4. Publicar `playwright-report/` como artifact em failure

Status de quebra E2E deve ser **bloqueante** pra merge na master a partir do momento em que tiver pelo menos 4 cenários verdes consistentes.
