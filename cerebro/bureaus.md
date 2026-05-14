> Hub: [[CAPITAL]]
> Espelho no Linear: [Catálogo de Bureaus & Integrações](https://linear.app/capitalfinancas/document/catalogo-de-bureaus-and-integracoes-3e6b97985c61). Cérebro é fonte de verdade.

# Bureaus & APIs externas

Visão consolidada das integrações de dados externos. **Desde 2026-05-05** o orquestrador `app/api/bureaus/route.ts` segue padrão **CreditHub-first, BDC só como fallback total** — ver [orquestração](#orquestração-creditHub-first).

> ⚠️ **2026-05-14 — Exceção: BDC sócios PF SEMPRE consultado**. `consultarBDCSocios` entrou no Promise.allSettled principal (commit `5af30e4`). Motivo: BDC pessoa retorna campos exclusivos (financialRiskScore, estimatedIncomeRange, totalAssetsRange, isCurrentlyOnCollection, pgfnDebt*) que o CreditHub não cobre. Custo: ~R$ 0,30/sócio PF.

> 🔴 **2026-05-14 — PEFIN/REFIN/Score BoaVista BLOQUEADOS — exigem JWT**. A CreditHub mudou auth dos endpoints IRQL pagos (Serasa/BoaVista/SPC) para JWT, não basta `?apiKey=`. Mensagem do servidor: "Esta consulta acessa um fornecedor externo pago (...) e exige autenticação via JWT. Gere um JWT a partir da sua API Key". Detector reconhece (commit `1c9d545`), implementação real depende de doc da CreditHub. Endpoints `/simples` continuam OK.

## CreditHub — `lib/bureaus/credithub.ts`  *(fonte primária)*

**Auth:** `CREDITHUB_API_KEY` (Bearer), `CREDITHUB_API_URL=https://irql.credithub.com.br`. Cache em `bureau_cache`.

**Endpoints principais:**
- `GET /simples/{key}/{cpf|cnpj}` — payload rico (≈30 chaves) com envelope `{completed, data:{...}}` — usar `data ?? raw`
- `GET /v1/grupo-economico/{doc}` — dedicado pra grupo econômico (Bearer auth)
- `consultarPefinRefin(cnpj)` via IRQL — query BPQL, **resposta JSON** (não XML)

**`/simples` — campos PJ:** `rfb`, `cnpj`, `razaoSocial`, `nomeFantasia`, `dataAbertura`, `cnae(/Descricao/Grupo/Subgrupo)`, `tipoEmpresa`, `naturezaJuridica`, `regimeTributario`, `enderecos[]`, `telefones[]`, `emails[]`, `quadroSocietario[]`, `participacoesEmpresas[]`, `quantidade_dividas`, `valor_total_dividas`, `historico_consultas[]`, `processos[]`, `protestos.cartorios[]/qtdProtestos`, `ccf.{bancos,qtdRegistros,historico}`.

**`/simples` — campos PF:** `cpf`, `nome`, `dataNascimento`, `idade`, `maeNome`, `obitoProvavel`, `status`, `tituloEleitoral`, `pis`, `renda`, `ppe`, `enderecos[]`, `telefonesMoveis[]`, `emails[]`, `participacoesEmpresas[]`, `dividas[]`, `historico_consultas[]`, `ccf`, `protestos`, `processos[]`.

**Onde aparece:** página 2 (Serasa score), página 7 (CCF, protestos, processos), QSA, grupo econômico, dados cadastrais PF.

**Critério "vazio" (gatilho do fallback BDC):** `success=false` OU `mock=true` OU (sem `cnpjEnrichment.cnaePrincipal` E sem `qsaEnrichment.quadroSocietario`).

⚠️ Endpoint `/api/ch-diag` **tinha chave hardcoded como fallback** (removida em 2026-04-30 hardening).

### PEFIN / REFIN — IRQL BPQL  *(corrigido em 2026-05-08)*

**Query correta** (via `consultarPefinRefin`):
```
USING 'SCPCNET' SELECT FROM 'PROTESTOS'.'SCPCNET' WHERE 'DOCUMENTO' = '<cnpj_numerico>'
```

⚠️ **Invariantes do BPQL:**
- CNPJ tem que estar **entre aspas simples** — sem aspas o IRQL responde 500 `BPQLParserException: Token unknown`. Bug que viveu meses em produção e fazia o relatório mostrar "Não consultado" em todas as análises.
- Resposta de sucesso é **JSON puro** (não XML BPQL). Estrutura: `{ dadosCadastrais: [...], spc: [{NomeAssociado, Valor, DataDeInclusao, DataDoVencimento, NumeroContrato, Entidade, ...}] }`.
- Resposta de erro vem em **XML BPQL** (`<BPQL><header><exception ...>`) mesmo com HTTP 200 em alguns adapters — sempre checar prefixo `<` antes de `JSON.parse`.

**Mapeamento `spc[]` → `PefinReginData`:** `NomeAssociado→credor`, `Valor (BR)→valor` (parseMoneyRobust), `DataDeInclusao→data` (preferência) ou `DataDoVencimento`, `NumeroContrato→contrato`, `Entidade→modalidade`. Ordenação por `brDateKey(data)` (DD/MM/YYYY → YYYY-MM-DD).

**REFIN/Serasa — indisponível na chave atual:** todos os adapters tentados (`SERASA`, `SERASA EXPERIAN`, `EXPERIAN`, `BOAVISTA`, `SCPC`) retornam `Adapter unknown - <nome>`. Apenas `SCPCNET` funciona — e ele é fonte do PEFIN. Pendência: confirmar com a CreditHub o nome correto do adapter Serasa ou se é dataset pago à parte. Enquanto isso, `consultarPefinRefin` retorna `refin: undefined` com warning explícito e **não** consome quota com fetch fadado a falhar.

**Defesas no parser:**
- `body.trimStart().startsWith("<")` → trata como exception XML, loga e retorna undefined
- `Array.isArray(parsed.spc)` → fallback para `[]` se o IRQL mudar formato
- `undefined` (não consultado) ≠ `{qtd:0}` (consultado, sem pendências) — distinção crítica para evitar falso negativo no relatório

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

CRM de origem dos clientes. Importa cards e seus anexos via webhook Goalfy → URL pública S3 → download imediato.

**Endpoints:**
- `POST /api/goalfy/receber` *(canônico — URL exposta na UI `/importar-goalfy`)* — recebe payload do Goalfy, baixa cada URL, re-sobe pro Vercel Blob, salva em `goalfy_pending_operations`. Auth via query string `?secret=GOALFY_WEBHOOK_SECRET`.
- `POST /api/goalfy/webhook` *(deprecated alias)* — mesma lógica, auth via header `x-goalfy-secret` ou `Authorization: Bearer`. Mantido para automações antigas; novas devem apontar para `/receber`.
- `GET /api/cron/goalfy-sync` — pull de cards via `lib/goalfy/sync.ts`, chamado por n8n.
- `app/importar-goalfy/page.tsx` lista pending, importa, abre coleção com `?highlight=tipos`.

**Parser unificado** em `lib/goalfy/webhookParser.ts` (criado 2026-05-06):
- `extractDocuments(body)` aceita 5 padrões de payload (campo direto, array de URLs, array de objetos, root link/url, fields[name,value])
- `extractMeta(body)` — razão, cnpj, gerente, telefone, email, notes
- `mapDocType(label)` — DOC_TYPE_MAP + normalização de diacríticos (Última Alteração = ultima alteracao)
- `safeFilenameFromUrl` sanitiza nome via decode + strip de chars não-alfanuméricos
- 27 testes unit em `lib/goalfy/__tests__/webhookParser.test.ts`

**Bug crítico fixado 2026-05-06:** `/receber` antes guardava URL crua do S3 com status `pending_download`; URL S3 presignada expirava antes do clique em "Importar" → docs órfãos. Agora baixa imediatamente.

**Auth:** `GOALFY_API_KEY` (header `Authorization: Token {JWT}`, NÃO Bearer).
**BOARD_ID:** `38e78384-2a7d-49a2-9127-3b65ecb4e97f`.
**`GOALFY_WEBHOOK_SECRET`:** obrigatório no Vercel — sem ele endpoint fica aberto.
**Cron secret:** opcional para `/api/cron/goalfy-sync` (sem CRON_SECRET = aceita anônimo).
**Tabela `goalfy_pending_operations`:** precisa unique key em `goalfy_card_id` (upsert depende disso).

## Brasil API + outras APIs públicas

- Cartão CNPJ pode vir de upload OU de consulta direta — preferir API quando disponível.
- Status da Receita, situação cadastral, idade de empresa: derivados de respostas das APIs.

## Google Maps + Places — `app/api/map-image/route.ts`

Proxy server-side único para 3 produtos Google: Static Maps, Street View, Places API (New).

**Auth:** `GOOGLE_MAPS_STATIC_KEY` (server-side). `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` só para `mapEmbedUrl` (iframe).

**Modos:**
- `?type=places&address=&razaoSocial=&cnae=&porte=` — busca empresa via `places:searchText`. Retorna `fotos[]` (validadas com Gemini Vision pra relevância de fachada) + `place_id` + `nome_encontrado` + **`lat`/`lng`** (desde 2026-05-05) + `formattedAddress`. fieldMask inclui `places.location` pra capturar coordenadas.
- `?type=streetview&address=&heading=` — Street View 4 ângulos (0/90/180/270).
- `?type=map&address=` ou `?type=map&lat=&lng=` — Static Map aéreo. Aceita lat/lng como alternativa ao endereço cru (preferível quando Places identificou o lugar) — evita geocoding errado por homônimos.

**Validação contextual (Camada 2, desde 2026-05-05):** `?type=map&validate=true&razaoSocial=&cnae=&porte=` faz Gemini Vision olhar a imagem aérea e avaliar coerência do entorno (industrial/comercial/residencial/rural × tipo de negócio). Retorna `contextoCoerente: bool` + `contextoObservacao: string` (≤120 chars). Falha silenciosa: timeout 8s e qualquer erro retorna `coerente=true` (não bloqueia o relatório).

**Geocoding correto no fluxo (Camada 1, desde 2026-05-05):** `GenerateStep.fetchGoogleMapsImages` chama Places primeiro pra obter `lat/lng` do estabelecimento; se sucesso, passa essas coords pro `type=map` em vez de geocodificar texto. Resolve casos onde o endereço do CNPJ tinha homônimos e o ponto vermelho do mapa caía longe da empresa real.

**Onde aparece no relatório:** seção 1 do PDF/HTML. Aviso `mapaContextoAviso` (chip amarelo abaixo do bloco de endereço) quando Gemini sinalizar incoerência — analista decide.

**Custo:** 1 chamada Places + 1-4 chamadas Street View + 1 chamada Static Map + 1 chamada Gemini Vision por relatório. Cache via `next.revalidate=86400` no Static Map.

## Orquestração CreditHub-first

**Padrão desde 2026-05-05** (`app/api/bureaus/route.ts` commit `968f544`):

**Fase 1 (paralelo, `Promise.allSettled`):** CreditHub + Serasa + SPC + Quod + grupoEconomico + BrasilAPI + Sanções + Assertiva PJ/PF + DataBox360 (empresa+sócios+grupo) + PefinRefin.

**Fase 2 (condicional, depois da Fase 1):** se CH respondeu vazio, dispara BDC empresa + BDC sócios em paralelo. Toda a lógica de KYC sócios (óbito, parentesco, PEP, sanções) e o sub-fluxo "BDC trouxe sócios não vistos no QSA/IR → roda Assertiva/SCR de novo" ficam dentro deste branch condicional.

**Logs:** `BDC ignorado (economia de custo)` quando CH responde; `fallback BDC ativado` com sinais (success/mock/cnae/qsa) quando dispara.

**Latência:** caso comum ~25s. Pior caso (fallback) ~50s.

**Fase 3 (sacados Curva ABC, 2026-05-08):** se `data.curvaABC` tem CNPJs, dispara para os top 5 PJ:
- CH `/simples` + BDC `/empresas` + Assertiva PJ **paralelo** (diverge do ADR-011 — chefe pediu "tanto CreditHub quanto BigData" explícito; Assertiva entra para fornecer score numérico, que CH não traz)
- Para cada sacado, depois de BDC empresa, dispara BDC `/pessoas` para os sócios PF (necessário para `motherName` no matcher de mãe comum)
- Para o cedente, reaproveita BDC sócios se Fase 2 já consultou; senão dispara só `/pessoas` (não `/empresas`) para pegar mães
- Cache `sacado:<cnpj>` 24h via `bureau_cache`
- 5 matchers de vínculo em `lib/sacados/matchVinculos.ts`: CPF comum, sobrenome+UF, endereço idêntico, parentesco BDC, mãe comum
- `bureau_calls` ganha `sacado_credithub`, `sacado_bdc_empresa`, `sacado_bdc_pessoa`, `sacado_assertiva_pj`

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
