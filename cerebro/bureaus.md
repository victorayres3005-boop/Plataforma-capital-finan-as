> Hub: [[CAPITAL]]

# Bureaus & APIs externas

Visão consolidada das integrações de dados externos. **Desde 2026-05-05** o orquestrador `app/api/bureaus/route.ts` segue padrão **CreditHub-first, BDC só como fallback total** — ver [orquestração](#orquestração-creditHub-first).

## CreditHub — `lib/bureaus/credithub.ts`  *(fonte primária)*

**Auth:** `CREDITHUB_API_KEY` (Bearer), `CREDITHUB_API_URL=https://irql.credithub.com.br`. Cache em `bureau_cache`.

**Endpoints principais:**
- `GET /simples/{key}/{cpf|cnpj}` — payload rico (≈30 chaves) com envelope `{completed, data:{...}}` — usar `data ?? raw`
- `GET /v1/grupo-economico/{doc}` — dedicado pra grupo econômico (Bearer auth)
- `consultarPefinRefin(cnpj)` via IRQL XML

**`/simples` — campos PJ:** `rfb`, `cnpj`, `razaoSocial`, `nomeFantasia`, `dataAbertura`, `cnae(/Descricao/Grupo/Subgrupo)`, `tipoEmpresa`, `naturezaJuridica`, `regimeTributario`, `enderecos[]`, `telefones[]`, `emails[]`, `quadroSocietario[]`, `participacoesEmpresas[]`, `quantidade_dividas`, `valor_total_dividas`, `historico_consultas[]`, `processos[]`, `protestos.cartorios[]/qtdProtestos`, `ccf.{bancos,qtdRegistros,historico}`.

**`/simples` — campos PF:** `cpf`, `nome`, `dataNascimento`, `idade`, `maeNome`, `obitoProvavel`, `status`, `tituloEleitoral`, `pis`, `renda`, `ppe`, `enderecos[]`, `telefonesMoveis[]`, `emails[]`, `participacoesEmpresas[]`, `dividas[]`, `historico_consultas[]`, `ccf`, `protestos`, `processos[]`.

**Onde aparece:** página 2 (Serasa score), página 7 (CCF, protestos, processos), QSA, grupo econômico, dados cadastrais PF.

**Critério "vazio" (gatilho do fallback BDC):** `success=false` OU `mock=true` OU (sem `cnpjEnrichment.cnaePrincipal` E sem `qsaEnrichment.quadroSocietario`).

⚠️ Endpoint `/api/ch-diag` **tinha chave hardcoded como fallback** (removida em 2026-04-30 hardening).

## BigDataCorp (BDC) — `lib/bureaus/bigdatacorp.ts`  *(fallback total)*

**Auth:** `BDC_TOKEN` (JWT, ~30d desde 2026-05-05) + `BDC_TOKEN_ID`. Renovação manual pela Nayara (NAYARA@CAPITALFINANCAS.COM.BR). **Importante:** ao renovar, o `BDC_TOKEN_ID` também pode mudar — sempre conferir.
**Próxima expiração:** ver [[runbooks#bdc_token-expirou|runbooks.md — BDC_TOKEN]].

**Quando dispara:** apenas quando CreditHub vem vazio (ver critério acima). Em produção isso é raro — economia direta de custo.

**Datasets empresa** (`POST /empresas`):
- `basic_data`, `registration_data`, `relationships` (QSA), `processes`, `economic_group_relationships`
- `owners_kyc` → PEP, IsCurrentlySanctioned, sanctionSources (por sócio)
- `owners_lawsuits_distribution_data` → distribuição de processos por sócio
- `interests_and_behaviors` → CreditSeeker A-H, CreditCardScore

**Datasets sócios PF** (`POST /pessoas` por CPF):
- `basic_data`, `business_relationships`, `financial_risk` → FinancialRiskScore/Level, TotalAssetsRange
- `collections` → Last30/90/180/365DaysCollectionOccurrences
- `government_debtors` → pgfnDebtTotal, pgfnTotalDebts, pgfnDebts[]
- `processes` → processosTotal/Passivo/Ativo/ValorTotal

**Datasets órfãos pós-refactor (aceitos como perda quando CH responde):** `owners_kyc`, `interests_and_behaviors`, `owners_lawsuits_distribution_data`, `financial_risk` PF. Ver [[roadmap-gaps|roadmap-gaps.md]] — revisitar se time sentir falta no parecer.

**Nota histórica:** dataset `protests` não está habilitado na conta BDC (código -109). Protestos vinham de Assertiva (PJ) e Assertiva PF (sócios). CreditHub agora também cobre.

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

**Estado credenciais:** ver [[runbooks#virada-databox360-para-produção|runbooks.md — DataBox360 prod]]. Sandbox-only até 2026-04-29.

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

## Orquestração CreditHub-first

**Padrão desde 2026-05-05** (`app/api/bureaus/route.ts` commit `968f544`):

**Fase 1 (paralelo, `Promise.allSettled`):** CreditHub + Serasa + SPC + Quod + grupoEconomico + BrasilAPI + Sanções + Assertiva PJ/PF + DataBox360 (empresa+sócios+grupo) + PefinRefin.

**Fase 2 (condicional, depois da Fase 1):** se CH respondeu vazio, dispara BDC empresa + BDC sócios em paralelo. Toda a lógica de KYC sócios (óbito, parentesco, PEP, sanções) e o sub-fluxo "BDC trouxe sócios não vistos no QSA/IR → roda Assertiva/SCR de novo" ficam dentro deste branch condicional.

**Logs:** `BDC ignorado (economia de custo)` quando CH responde; `fallback BDC ativado` com sinais (success/mock/cnae/qsa) quando dispara.

**Latência:** caso comum ~25s. Pior caso (fallback) ~50s.

## Tabela rápida: dado → bureau

| Dado | Fonte primária | Fallback |
|---|---|---|
| Score Serasa | CreditHub | — |
| Protestos empresa | CreditHub `/simples` | Assertiva PJ → BDC |
| Protestos sócios | CreditHub `/simples` PF | Assertiva PF → BDC |
| Processos empresa | CreditHub `/simples` | BDC `processes` |
| Processos sócios | CreditHub `/simples` PF | BDC `processes` |
| QSA / quadro societário | CreditHub `/simples` | BrasilAPI → BDC `relationships` |
| Grupo econômico | CreditHub `participacoesEmpresas` + `/v1/grupo-economico` | BDC `economic_group_relationships` |
| CCF | CreditHub | — |
| Dívidas / negativações | CreditHub `dividas` + PefinRefin | — |
| Dados cadastrais PJ | BrasilAPI (RFB oficial) → CreditHub | BDC `basic_data` |
| Dados cadastrais PF | CreditHub `/simples` PF | BDC `basic_data` |
| PEP/sancionado | BDC `owners_kyc` (só dispara se CH vazio) + Portal Transparência | CreditHub `ppe` (booleano) |
| PGFN dívidas | BDC `government_debtors` (só se CH vazio) | — |
| Score PJ | Assertiva PJ (0-1000) | — |
| Score PF (sócios) | Assertiva PF (0-1000) | BDC `financial_risk` (só se CH vazio) |
| SCR empresa | DataBox360 | upload manual SCR |
| SCR sócios | DataBox360 | — |
| SCR grupo econômico | DataBox360 (cap 5) | — |
| Faturamento estimado PJ | Assertiva | — |
| Renda presumida PF | Assertiva PF + CreditHub `renda` | — |
| Cards do CRM | Goalfy + n8n | upload manual |

## Custos & monitoramento

- Aba `/custos` (`app/custos/page.tsx`) mostra `BureauPrices` × `BureauCalls`
- Dataset DataBox360 tem preço confirmado; padrão defensivo `safeNum()` após crash 2026-04-26
- Sandbox NÃO conta custo (`environment: sandbox` no log)
