# Rascunho Linear — 4 issues pendentes (workspace bloqueado por limite gratuito)

> Criado 2026-05-14. Workspace Linear bateu o limite gratuito de issues. Re-tentei
> em 2026-05-15 ~00h após criar 5 commits novos — continua bloqueado.
> Quando destravar (upgrade ou trial), copiar daqui e colar manualmente no
> Project "Análise de Crédito" do team CapitalFinancas.
>
> **Ordem sugerida**: 4 (JWT — bloqueio ativo) → 1 (bug fix Patricia) → 2 (cobertura BDC PF) → 3 (bloco Capacidade Financeira).

---

## Título

`[Bug] Merger.ts sobrescreve enriquecimento KYC dos sócios PF (corrigido)`

## Configurações

- **Team:** CapitalFinancas
- **Project:** Análise de Crédito
- **Labels:** Bug
- **State:** Done
- **Priority:** 2 (High)

## Descrição

### Resumo

A tabela "Sócios — Processos & Protestos" do relatório PDF/HTML mostrava "N/D" em todos os campos PF mesmo quando o CreditHub e o BDC retornavam dados (processos, protestos, valor total, último processo etc.).

### Caso real que disparou a investigação

- Empresa: **SPEED PACK INDUSTRIA E COMERCIO DE PRODUTOS PLASTICOS LTDA** (CNPJ 30.777.860/0001-05)
- Sócia: **PATRICIA RODRIGUES DE OLIVEIRA DIAS** (CPF 276.677.008-93)
- Realidade comprovada via logs Vercel:
  - CreditHub: `processos=1` (1 polo passivo, 0 polo ativo)
  - BigDataCorp raw: 1 lawsuit `EXECUCAO DE TITULO EXTRAJUDICIAL N 4002814-72.2025.8.26.0152` (Bradesco × Patricia + Speed Pack, R$ 430.475,91, acordo homologado em 05/12/2025)
- O que aparecia no relatório: **todos os campos "N/D"**
- O que estava salvo no QSA no banco: só `nome`, `cpfCnpj`, `participacao`, `qualificacao` — zero campo de enriquecimento

### Causa raiz

Em `lib/bureaus/merger.ts`, dois blocos do CreditHub tocam `merged.qsa` em sequência:

1. **Bloco `grupoEconomicoEnrichment.sociosKyc`** (linhas 87-129) — enriquece o QSA com `processosTotal`, `processosPassivo`, `protestosSocioQtd`, `processosValorTotal`, `ultimoProcessoData`, `ultimoProtestoData`. Salva em `merged.qsa`. ✅

2. **Bloco `qsaEnrichment`** (linhas 152-180) — adiciona `dataEntrada/dataSaida` do CreditHub. Mas lia de **`data.qsa.quadroSocietario`** (versão crua, SEM o KYC enriquecido pelo passo 1) e sobrescrevia `merged.qsa` com a versão sem KYC. ❌

Resultado: os campos KYC sumiam silenciosamente entre os dois blocos.

### Fix

Commit `8a28202` — 1 linha em `lib/bureaus/merger.ts:167`:

```diff
- const enriched = (data.qsa?.quadroSocietario || []).map(s => {
+ const enriched = (merged.qsa?.quadroSocietario || data.qsa?.quadroSocietario || []).map(s => {
```

Fallback triplo: prefere `merged.qsa` (já enriquecido), cai pro `data.qsa` quando bloco anterior não rodou, e finalmente array vazio.

### Invariante derivada (documentada no cérebro)

`memory/feedback_merger_blocos_leem_de_merged.md` — qualquer bloco do merger que enriquece campo composto (qsa/cnpj/grupoEconomico) **deve ler de `merged.*` com fallback pra `data.*`**, nunca de `data.*` diretamente. Senão sobrescreve trabalho prévio.

### Validação

- `npx tsc --noEmit` passou sem erros
- Deploy via Vercel push para master 2026-05-14 noite (commit `8a28202`)
- Validação funcional pendente: rodar nova análise da SPEED PACK pós-deploy — esperado ver Patricia com Processos Total=1, Polo Passivo=1, Valor R$ 430.475,91, Protestos=0

### Aprendizado

Bugs de cascata em merge multi-fonte são invisíveis: os logs mostravam coleta OK em todos os bureaus, mas o resultado final ficava cru. **Os logs venceram a teoria** — quando a investigação inicial concluiu "BDC não foi consultado", o log completo do Vercel desmentiu e levou à causa real.

---

# Issue 2 — Feature: BDC sócios PF sempre consultado (cobertura financialRisk/renda/patrimônio)

> Criada na mesma sessão (2026-05-14), em cima do bug fix acima. Commit `5af30e4`.

## Título

`[Feature] BDC pessoa sempre consultado pra cobertura completa do avalista`

## Configurações

- **Team:** CapitalFinancas
- **Project:** Análise de Crédito
- **Labels:** Melhoria
- **State:** Done
- **Priority:** 2 (High)

## Descrição

### Contexto

Durante a investigação do bug Patricia (issue acima), descobri que **o BDC pessoa já era chamado em 2 caminhos limitados** mas o resultado era descartado:

1. **Fallback total** (`/api/bureaus/route.ts:172-186`): só rodava quando CreditHub vinha vazio (~30% dos casos)
2. **Sacados cedente** (`route.ts:351-364`): chamava `consultarBDCSocios` SÓ pra extrair `motherName`, descartando todo o resto

E o parser, types, merger e template **já estavam prontos** pra receber:
- `financialRiskScore`, `financialRiskLevel`
- `estimatedIncomeRange` (renda presumida em SM)
- `totalAssetsRange` (patrimônio total estimado)
- `isCurrentlyOnCollection`, `last365DaysCollections`
- Processos detalhados (valor total, polo passivo/ativo, último processo)
- PGFN (qtd, valor, debts individuais)
- óbito, status fiscal, PEP/sanções

Ou seja: o trabalho estava 90% feito, faltava só **conectar a chamada**.

### O que mudou

`app/api/bureaus/route.ts`:

1. **`consultarBDCSocios` entrou no `Promise.allSettled` principal** — sempre roda quando há CPFs PF no QSA/IR
2. **Quando CreditHub responde OK**, agora propaga BDC sócios PF para `bigdatacorpResult` (antes era ignorado). O merger.ts:347-380 já enriquece o QSA automaticamente.
3. **Removida 2ª chamada redundante** em FASE 3 (sacados cedente mães) — passa a reusar o resultado do allSettled

Commit `5af30e4`. 1 arquivo, +47/-26 linhas.

### Política CreditHub-first — exceção documentada

A regra "BDC só como fallback" continua valendo pro **BDC empresa**, mas agora tem **exceção explícita pro BDC sócios PF**: rodam sempre que há CPF de sócio. Motivo: campos exclusivos da consulta pessoa que o CreditHub não cobre.

Memória atualizada: `memory/feedback_credithub_first_bdc_fallback.md` — seção "EXCEÇÃO 2026-05-14".

### Custo

- ~R$ 0,30 por sócio PF por análise
- Estimativa: +R$ 18/mês pra ~100 análises (empresas com ~2 sócios PF em média)
- 70% das análises **não têm custo extra** (BDC já era chamado via sacados cedente)

### Validação

- `npx tsc --noEmit` passou
- `vitest lib/bureaus/__tests__/merger.test.ts` — 4/4 passa
- Deploy via push para master
- Validação funcional pendente: rodar nova análise da SPEED PACK pós-deploy — esperado Patricia preenchida com `financialRiskScore=1000`, `financialRiskLevel="A"`, `estimatedIncomeRange="10 A 15 SM"`, `totalAssetsRange="1 A 5MM"`, `processosTotal=1`, `processosValorTotal="R$ 430.475,91"`

### Próximos passos sugeridos

1. Validar resultado funcional em análise real
2. **Possível Issue 3** (UI): criar bloco novo "Capacidade Financeira dos Sócios (PF)" no relatório HTML/PDF — hoje os campos já chegam ao QSA mas não há render específico pra eles. Avaliar layout (tabela separada vs colunas extras na tabela existente).
3. Avaliar Pacote B (qualidade do grupo econômico — motivoBaixa, instabilidade) em sessão futura.

---

# Issue 4 — [Bloqueio] JWT da CreditHub — PEFIN/REFIN/Score BoaVista indisponíveis

> Issue mais crítica e mais recente. Adicionada 2026-05-15 ~00h após nova tentativa MCP falhar com mesmo erro de limite.

## Configurações

- **Team:** CapitalFinancas · **Project:** Análise de Crédito
- **Labels:** Bug · **Priority:** 1 (Urgent) · **State:** Backlog

## Resumo

A partir de **2026-05-14 ~23h**, a CreditHub passou a exigir **autenticação JWT** para os endpoints IRQL que consultam fornecedores pagos (Serasa, BoaVista, SPC). Antes bastava `?apiKey=` como query param. Resultado: PEFIN, REFIN e Score BoaVista CPF voltam vazios em produção.

## Mensagem do servidor

> "Esta consulta acessa um fornecedor externo pago (Serasa, BoaVista, Placas, SPC) e exige autenticação via JWT. Gere um JWT a partir da sua API Key (ou assine o plano-api) para liberar o acesso."

## Endpoints afetados

- `consultarPefinRefin` (PEFIN — SCPCNET) — `lib/bureaus/credithub.ts:1801`
- `consultarPefinRefin` (REFIN — Serasa Palladium) — `lib/bureaus/credithub.ts:1843`
- `consultarScoreBoaVistaPF` — `lib/bureaus/credithub.ts:1875`

## NÃO afetado

- `consultarCreditHub` (`/simples/{key}/{cnpj}`)
- `consultarCreditHubPorCPF` (`/simples/{key}/{cpf}`)
- BDC, DataBox360, BrasilAPI

## Mitigação parcial já aplicada (commit `1c9d545`)

`isAcessoWebMessage` reconhece a nova mensagem e loga `[credithub][PLANO-API-NECESSARIO]` em `console.error`. Só melhora visibilidade; não destrava.

## O que precisa pra destravar — perguntar à Nayara/CreditHub

1. Algoritmo do JWT (HS256? RS256?)
2. Payload esperado (claims iss, sub, exp, iat, custom?)
3. Como enviar (header `Authorization: Bearer <jwt>`? query param? substitui ou complementa apiKey?)
4. Assinatura local com apiKey como secret HMAC, ou endpoint de exchange (`/auth/token`)?
5. TTL do JWT (renovar a cada request? cache curto?)

## Implementação após resposta

Modificar `lib/bureaus/credithub.ts`:
1. `fetchIRQL` (linha ~1781) — adicionar header `Authorization: Bearer ${gerarJWT()}`
2. `consultarScoreBoaVistaPF` (linha ~1885) — replicar mesma assinatura

Testar via curl local antes de prod.

## Chave atual

`CREDITHUB_API_KEY` no Vercel = `049bd19bfc23941d0bbfe0d8600f0f2b` (mesma do painel · operacional@capitalfinancas.com.br). Plano API ativo conforme doc.

## Histórico

- 2026-05-08 (`9e3a08a`): PEFIN funcionando pela 1ª vez
- 2026-05-10: REFIN reativado (query Palladium)
- 2026-05-13: começa a falhar — "acesso web"
- 2026-05-14 ~16h: chave nova instalada no Vercel
- 2026-05-14 ~23h: mensagem muda pra "JWT necessário" — solução fora do código

## Documentação interna relacionada

- `cerebro/sessao-2026-05-14.md` — narrativa
- `cerebro/bureaus.md` — banner topo
- `memory/reference_credithub_jwt_pendente.md` — referência técnica
