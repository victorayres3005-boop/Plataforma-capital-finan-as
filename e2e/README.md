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
| `login.spec.ts` | Login com user de teste → home autenticada + senha errada permanece em /login | ✅ 2026-05-05 (skipa se env ausente) |
| `bureaus-stub.spec.ts` | POST /api/bureaus com header `x-e2e-mode: true` retorna fixture sem custo bureau real (não-auth, aceita 200 ou 401) | ✅ 2026-05-05 |
| `bureaus-stub.authenticated.spec.ts` | Mesma cobertura mas com sessão real via storageState — assert status 200 estrito | ✅ 2026-05-05 |
| `auth.setup.ts` | Setup project: loga uma vez via formulário e salva storageState em `playwright/.auth/user.json` (consumido pelos `*.authenticated.spec.ts`) | ✅ 2026-05-05 |
| `upload.authenticated.spec.ts` | Upload real de Cartão CNPJ via setInputFiles + PDF gerado em runtime via pdf-lib + stubs E2E (network helper) | ✅ 2026-05-05 |
| `upload.spec.ts` | Upload de PDFs anonimizados → coleta criada | ⏳ próxima sessão |
| `review.spec.ts` | Review carrega + auto-fill data constituição funciona | ⏳ próxima sessão |
| `generate.spec.ts` | Geração PDF dispara download | ⏳ próxima sessão |
| `retomada.spec.ts` | Reabrir coleta preserva estado | ⏳ próxima sessão |

## Setup do usuário de teste

**Recomendado — via Admin API (caminho oficial Supabase):**

```bash
node scripts/setup-e2e-user.mjs
```

O script cria/atualiza `e2e@capitalfinancas.test` com senha `e2e-test-2026` usando a Admin API + valida fazendo um login de teste no final. Idempotente.

Adiciona no `.env.local`:
```
E2E_USER_EMAIL="e2e@capitalfinancas.test"
E2E_USER_PASSWORD="e2e-test-2026"
```

Roda `npm run test:e2e` — login.spec.ts deve passar.

> O `e2e/fixtures/setup-user.sql` é um caminho alternativo (SQL direto). Pode falhar em projetos Supabase mais novos que têm campos novos em `auth.users` (`is_sso_user`, `is_anonymous` etc.). Prefira o script.

Sem o usuário criado, login.spec.ts é **skipado automaticamente** (não falha).

## Próximos passos antes dos cenários upload/review/generate

1. ✅ Usuário de teste no Supabase (`e2e/fixtures/setup-user.sql`)
2. ⏳ PDFs anonimizados em `e2e/fixtures/pdfs/` (cartão CNPJ, balanço, IR, etc.)
3. ⏳ Decisão sobre stub de bureaus — provável: header `x-e2e-mode: true` em `/api/bureaus` retorna fixture pré-gravada (não conta no `api_usage_logs`)

## Convenção

- Nomes de cenário no formato `<dominio>.spec.ts` para testes não autenticados
- Cenários que exigem login no formato `<dominio>.authenticated.spec.ts` — usam storageState do setup project, sem precisar logar de novo a cada teste
- Cada teste começa com `test.describe(<área>)` e dentro tem 2-5 `test()`s pequenos
- Seletores estáveis: prefere `data-testid` > `role` > `text`. Inputs de form prefere `name=`
- Sem dependência de bureau real — usar `x-e2e-mode: true` no header das chamadas a `/api/bureaus` e `/api/extract`
- Helpers compartilhados em `e2e/helpers/`

## Projetos do Playwright

Configurados em `playwright.config.ts`:

| Projeto | Roda | Storage |
|---|---|---|
| `setup` | `auth.setup.ts` (apenas) | grava `playwright/.auth/user.json` |
| `chromium` | tudo exceto `*.authenticated.spec.ts` e `auth.setup.ts` | sem sessão |
| `chromium-authenticated` | `*.authenticated.spec.ts` | herda storageState do setup |

## CI

Workflow `.github/workflows/e2e.yml` (a criar) deve:
1. Build do Next
2. Subir dev server
3. Rodar `npm run test:e2e` com `CI=true`
4. Publicar `playwright-report/` como artifact em failure

Status de quebra E2E deve ser **bloqueante** pra merge na master a partir do momento em que tiver pelo menos 4 cenários verdes consistentes.
