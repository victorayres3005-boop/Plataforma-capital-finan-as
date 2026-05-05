# Bureaus & APIs externas

Visão consolidada das integrações de dados externos. Cada bureau tem **fonte primária** (qual dado é dele) e **falha silenciosa** (relatório continua sem o dado).

## BigDataCorp (BDC) — `lib/bureaus/bdc.ts`

**Auth:** `BDC_TOKEN` (JWT, **TTL 7 dias**), `BDC_TOKEN_ID`. Renovação manual semanal pela Nayara (NAYARA@CAPITALFINANCAS.COM.BR).
**Próxima expiração:** ver [runbooks.md — BDC_TOKEN](runbooks.md#bdc_token-expirou).

**Datasets empresa** (`POST /empresas`):
- `owners_kyc` → PEP, IsCurrentlySanctioned, sanctionSources (por sócio)
- `owners_lawsuits_distribution_data` → distribuição de processos por sócio
- `interests_and_behaviors` → CreditSeeker A-H, CreditCardScore

**Datasets sócios PF** (`POST /pessoas` por CPF):
- `financial_risk` → FinancialRiskScore/Level, TotalAssetsRange, IsCurrentlyOnCollection
- `collections` → Last30/90/180/365DaysCollectionOccurrences
- `government_debtors` → pgfnDebtTotal, pgfnTotalDebts, pgfnDebts[]
- `processes` → processosTotal/Passivo/Ativo/ValorTotal por sócio

**Onde aparece:** seções 5d (processos sócios), tabelas grupo econômico, badges QSA, `bdc-insights.ts`.

## Assertiva Score v3 — `lib/bureaus/assertiva.ts`

**Auth OAuth2:**
- Token URL: `https://api.assertivasolucoes.com.br/oauth2/v3/token` (NÃO `/oauth/token`, NÃO `integracao.`)
- `POST` com `Authorization: Basic base64(client:secret)` + body `grant_type=client_credentials`
- Credenciais: `ASSERTIVA_CLIENT_ID`, `ASSERTIVA_CLIENT_SECRET` — **fazer `.trim()`** (Vercel salva `\n`)
- Token cache com renovação 60s antes de expirar

**Endpoints:**
- PJ: `GET /score/v3/pj/credito/{cnpj}?idFinalidade=2`
- PF: `GET /score/v3/pf/credito/{cpf}?idFinalidade=2`

**Dados PJ:** scoreAssertivaPJ (0-1000), classe A-F, faturamento estimado, protestos públicos, últimas consultas
**Dados PF (sócios):** scoreAssertivaPF, classe, renda presumida, validacao identidade, protestos do sócio

**Onde aparece:** seção 5e (protestos sócios), faturamento estimado, badges identidade.

## DataBox360 SCR — `lib/bureaus/databox360.ts`

**Auth:** GET `/api/sessions/token` com header `Authorization: <DATABOX360_API_KEY>`. JWT TTL 1h, cache memória + Supabase.
**Lock anti-concorrência** `_tokenFetchPromise` evita N requests simultâneos.
**Circuit breaker** 60s se token falhar.

**Funções:**
- `consultarSCREmpresa(cnpj)` → SCR atual + 12 meses atrás (comparativo **anual**, não mensal)
- `consultarSCRSocios([{nome, cpf}])` → SCR sócios PF
- `consultarSCRGrupoEconomico(cnpjs[])` → cap em 5 empresas

**Cache persistente:** `bureau_cache` chave `scr:<doc>:<YYYYMM>` TTL 24h.

**Sandbox detection:**
- Sandbox retorna **valores idênticos** entre períodos/documentos
- `isScrIdenticoSandbox()` no merger detecta e oculta colunas/tabelas
- Em produção, dados sempre diferentes → tudo destrava automático

**Estado credenciais:** ver [runbooks.md — DataBox360 prod](runbooks.md#virada-databox360-para-produção). Sandbox-only até 2026-04-29.

## Credit Hub — `lib/bureaus/credithub.ts`

**Auth:** API key. Cache em `bureau_cache`.
**Endpoints:** consulta CPF/CNPJ para protestos, processos, score serasa.
**Onde aparece:** página 2 (Serasa score), página 7 (CCF, protestos, processos).

⚠️ Endpoint `/api/ch-diag` **tinha chave hardcoded como fallback** (removida em 2026-04-30 hardening).

## Goalfy — `lib/bureaus/goalfy/` + `app/api/goalfy/`

CRM de origem dos clientes. Importa cards e seus anexos.

**Limitação:** plano atual NÃO tem HTTP Request action → API Goalfy retorna **caminhos internos** de anexos (`uuid/file.pdf`), não URLs públicas. Solução só com plano pago ou Vitor configurar webhook na automação deles.

**Fluxo implementado:**
- `lib/goalfy/sync.ts` sincroniza cards do board → `goalfy_pending_operations`
- `app/api/cron/goalfy-sync/route.ts` GET endpoint chamado por n8n
- `app/api/goalfy/webhook/route.ts` recebe payload externo (n8n com URLs S3 já presigned)
- `app/importar-goalfy/page.tsx` lista pending, importa, abre coleção com `?highlight=tipos`

**Auth:** `GOALFY_API_KEY` (header `Authorization: Token {JWT}`, NÃO Bearer).
**BOARD_ID:** `38e78384-2a7d-49a2-9127-3b65ecb4e97f`.
**Cron secret:** opcional para o endpoint `/api/cron/goalfy-sync` (sem CRON_SECRET = aceita anônimo).

## Brasil API + outras APIs públicas

- Cartão CNPJ pode vir de upload OU de consulta direta — preferir API quando disponível.
- Status da Receita, situação cadastral, idade de empresa: derivados de respostas das APIs.

## Tabela rápida: dado → bureau

| Dado | Fonte primária | Fallback |
|---|---|---|
| Score serasa | CredHub | — |
| Protestos empresa | Assertiva | CredHub |
| Protestos sócios | Assertiva PF | BDC |
| Processos empresa | CredHub | — |
| Processos sócios | BDC `processes` | — |
| PEP/sancionado | BDC `owners_kyc` | — |
| PGFN dívidas | BDC `government_debtors` | — |
| Score sócio (financial risk) | BDC `financial_risk` | Assertiva PF |
| SCR empresa | DataBox360 | upload manual SCR |
| SCR sócios | DataBox360 | — |
| SCR grupo econômico | DataBox360 (cap 5) | — |
| Faturamento estimado PJ | Assertiva | — |
| Renda presumida PF | Assertiva PF | — |
| Cards do CRM | Goalfy + n8n | upload manual |

## Custos & monitoramento

- Aba `/custos` (`app/custos/page.tsx`) mostra `BureauPrices` × `BureauCalls`
- Dataset DataBox360 tem preço confirmado; padrão defensivo `safeNum()` após crash 2026-04-26
- Sandbox NÃO conta custo (`environment: sandbox` no log)
