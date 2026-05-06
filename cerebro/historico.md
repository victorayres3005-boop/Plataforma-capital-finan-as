---
tags: [capital-financas, historico, changelog]
---

> Hub: [[CAPITAL]]


# Histórico — sessões e cirurgias

Log datado de mudanças significativas. Adicionar entrada nova **no topo** quando uma sessão executar cirurgias relevantes. Bug fixes pequenos vão pro commit, não aqui.

---

## 2026-05-06 — Suíte Vitest + CI gate + 8 bugs reais corrigidos (4 críticos da política V2 + Goalfy webhook) ✅

**Disparador:** Sessão começou como "vamos para testes E2E com Vitest" e expandiu para corrigir bugs críticos descobertos pelos testes/Codex review. Plataforma ficou de 8.9 → 9.3.

**Cirurgias:**

| Área | Conteúdo |
|---|---|
| Tests Vitest | 258 testes em 8 arquivos (`lib/extract/__tests__/`, `lib/analyze/__tests__/`, `lib/goalfy/__tests__/`); cobre sanitize, json, schemas, fillDefaults, adapters, calculations, fewShot, webhookParser |
| CI gate | `.github/workflows/quality.yml` — bloqueia merge em falha de `tsc --noEmit` ou `npm test`. Lint roda como warning (99 erros pré-existentes) |
| Fix produção #1 | `adaptSCRNew` `vencidos.total`/`prejuizos.total` em string BR não viraram NaN (era `Number()`, agora `_sumNums`) |
| Fix produção #2 | `adaptCurvaABCNew` cumulativa SEMPRE vence raw classificacao do Gemini (loga divergência) |
| Fix produção #3 | `tryRecoverTruncatedJSON` agora string-aware (não confunde `}` literal em string com delimitador) |
| Fix produção #4 | `adaptVisitaNew` normaliza diacríticos antes do match (Híbrida funciona) |
| Fix CRÍTICO #5 | `parseBRL` em `lib/analyze/calculations.ts` — agora remove prefixo `R$` e espaços. Antes `parseBRL("R$ 1.234,56")` retornava 0 |
| Fix CRÍTICO #6 | `calcularPreRequisitos` CCF — lê `data.ccf.qtdRegistros` (canônico) em vez de `data.protestos.ccfQuantidade` (inexistente) |
| Fix CRÍTICO #7 | `calcularPreRequisitos` protestos — lê `protestos.vigentesQtd` (canônico) em vez de `quantidadeVigentes` (inexistente) |
| Fix CRÍTICO #8 | `calcularPreRequisitos` processos passivos — lê `processos.passivosTotal` (canônico) em vez de iterar `processos.processos[]` (inexistente) |
| Fix residual | `passivosTotal === 0` legítimo não ativa fallback de iteração |
| Goalfy webhook | `/api/goalfy/receber` agora baixa cada URL imediatamente e re-sobe pro Vercel Blob (antes só guardava URL crua, S3 expirava); parser unificado em `lib/goalfy/webhookParser.ts`; `/webhook` virou alias deprecated |

**Severidade dos bugs eliminatórios (#5-#8):**
- Política V2 estava parcialmente sem efeito em produção por tempo indeterminado.
- Empresas com CCF, protestos > limite, processos passivos > limite passavam pela barreira automática.
- Análise IA + analista cobriam manualmente, mas o gate eliminatório nunca disparava.
- Memória `project_politica_eliminatoria_bugs_2026_05_06.md` documenta detalhes.

**Como descobriu:** Codex review do test bundle apontou que campos lidos por `calcularPreRequisitos` não existiam no shape canônico produzido por `fillProtestosDefaults`/`fillProcessosDefaults`. Cross-check com `calcularCobertura` (que usava shape canônico) confirmou.

**Lição (capturada em `cerebro/snippets-padroes.md` candidato):** Adapters/fillDefaults definem o shape canônico. Funções downstream devem ler **exatamente** os campos que `fillXxxDefaults` produz. Cross-check entre funções que consomem os mesmos dados (`calcularCobertura` vs `calcularPreRequisitos`) é a forma de pegar drift.

**Estado pós-deploy:**
- 258 testes Vitest verdes em ~1.2s
- TSC limpo
- CI gate ativo em PR e push para master
- 99 lint errors pré-existentes em `lib/pdf/template.ts`, `lib/generators/pdf/sections/risco.ts`, `lib/mergeQsaWithContrato.ts` — não bloqueiam merge; cleanup gradual

**Próximos gaps até 10/10 (de `cerebro/roadmap-gaps.md`):**
- E2E Playwright funcionando (specs existem mas quebrados)
- Component tests das 15 sections de revisão
- Observabilidade prod (Sentry ou similar) — **declinado pelo Victor**, fica em standby
- Rate limiting nas rotas pesadas
- Quebrar monolitos `app/page.tsx` (1779 linhas) e `historico/page.tsx` (1747 linhas)
- Cleanup de 99 lint errors

---

## 2026-05-05 (sessão noite) — Auto-fill Data Constituição + Geocoding via place_id + Gemini Vision ✅

**Disparador:** Victor pediu (a) que a caixa Data de Constituição na Review fosse pré-preenchida pelo cartão CNPJ quando o contrato vier sem ela, (b) corrigir mapa do relatório que às vezes apontava endereço errado e (c) usar contexto da empresa pra validar coerência do endereço.

**Cirurgias:**

| Commit | Conteúdo |
|---|---|
| `b980451` | feat(review): herda Data de Constituição do cartão CNPJ quando contrato vem sem |
| `f9451d6` | fix(review): auto-fill data constituicao não repreenche após apagar (Codex review FAIL parcial → corrigido) |
| `4711d07` | feat(map): geocoding via place_id + validação contextual Gemini Vision |

**Auto-fill Data Constituição:**
- `Field` em `shared.tsx` ganhou prop opcional `badge?: ReactNode` ao lado do label
- `SectionContrato` aceita `dataConstituicaoFromCnpj?: boolean` + componente `FromCnpjBadge` (chip azul "do cartão CNPJ", ícone IdCard)
- `ReviewStep` tem useEffect + `lastAutoFilledRef` que rastreia qual `cnpj.dataAbertura` já foi usada como fonte. Evita repreenchimento se o usuário apagar o campo intencionalmente; permite redisparar se cnpj.dataAbertura mudar (re-extração)
- Codex review (task-mosz1jrg-bhs5q7): 5 PASS, 1 FAIL parcial corrigido em commit subsequente

**Geocoding correto (Camada 1):**
- `/api/map-image?type=places` agora retorna `lat/lng` (fieldMask `places.location` adicionado)
- `GenerateStep.fetchGoogleMapsImages` captura `placesLat/placesLng` quando Places identifica a empresa e passa pro `type=map` via `&lat=&lng=` em vez de `&address=` cru
- Elimina casos onde Google geocodificava endereço cru pra homônimos (rua das Flores em outra cidade) e o ponto vermelho caía longe

**Validação contextual Gemini Vision (Camada 2):**
- `/api/map-image?type=map&validate=true` aceita `razaoSocial+cnae+porte` e chama Gemini Vision sobre a imagem aérea
- Prompt avalia coerência industrial/comercial/residencial/rural × tipo de negócio
- Retorna `contextoCoerente:bool + contextoObservacao:string`. Timeout 8s, falha silenciosa (`coerente=true`)
- `PDFReportParams.mapaContextoAviso?:string` propagado pelos 3 payloads (generatePDF, HTMLView, shareReport)
- `template.ts`: chip amarelo "⚠ {observação} — verificar manualmente" abaixo do bloco de endereço quando aviso existe

**Pipeline:** type-check ✅ por commit · ESLint ok nos arquivos novos (erros pré-existentes em zonas não tocadas de GenerateStep) · push direto pra master · Vercel auto-deploy

---

## 2026-05-05 (sessão tarde) — CreditHub-first refactor ✅

**Disparador:** consultas avulsas via script revelaram que (a) BDC token tinha expirado em 2026-04-30, (b) CreditHub `/simples` cobre quase tudo que a plataforma usa do BDC. Victor decidiu inverter a hierarquia.

**Cirurgias:**

| Commit | Conteúdo |
|---|---|
| `968f544` | refactor(bureaus): CreditHub-first, BDC como fallback total |

**Mudança:** `app/api/bureaus/route.ts` em 2 fases. Fase 1 paralela sem BDC. Fase 2 dispara BDC empresa + sócios apenas se CH vier vazio (success=false OU mock=true OU sem CNAE E sem QSA). Toda lógica de KYC sócios/óbito/parentesco/PEP movida pro branch condicional. Sub-fluxo "BDC trouxe sócios não vistos no QSA/IR → roda Assertiva/SCR de novo" continua intacto.

**Operacional:**
- `BDC_TOKEN` e `BDC_TOKEN_ID` renovados (Nayara): novo TokenId `69fa1b3c653b497d0386aa9c` (anterior `69ea56fbae3c0c7ef707bcf0`). Importante: ao renovar, sempre conferir se o TokenId mudou junto.
- Nova validade ~30d (exp 2026-06-04).
- Variáveis atualizadas no Vercel production via CLI.

**Scripts auxiliares adicionados (`capital-financas/scripts/`):**
- `check-cpf-protestos-processos.mjs` — Assertiva PF + BDC `/pessoas`
- `check-credithub-grupo.mjs` — `/v1/grupo-economico` + `/simples` PJ/PF
- `check-grupo-credithub-first.mjs` — CH primeiro, BDC fallback
- `check-grupo-economico.mjs` — BDC empresa + pessoa

**Codex review (task-mosv1fwi-b5i4ae):** 4 checkpoints PASS, sem code changes aplicados.

**Memórias atualizadas:**
- `feedback_credithub_first_bdc_fallback.md` (nova) — diretriz
- `project_credithub_first_deploy_2026_05_05.md` (nova) — estado pós-deploy
- `project_grupo_economico.md` — pipeline atualizado
- `project_bdc_token_renewal.md` — token + TokenId novos

**Pendentes pós-deploy:**
- Smoke test em produção
- Telemetria CH vs BDC em `api_usage_logs`
- Validar economia em ~1 semana

**Pipeline:** type-check ✅ → ESLint ✅ → commit/push GitHub ✅ → Vercel auto-deploy ✅ → Codex review ✅

---

## 2026-05-05 (sessão maratona) — Mobile + Split extract + Split analyze + Design system base ✅

**Disparador:** Victor pediu auditoria + roadmap completo pra subir nota da plataforma de 7.5/10 para 9.0/10. Sessão estendida com 30+ commits.

### 1. Mobile responsivo (4 commits)
- `86e5a40` — historico grid-cols + SectionSCRSocios + SectionProcessos overflow-x-auto
- `6097af2` — KPIs auto-fit + Decisões flexWrap na home
- `2a4faed` — chips nav no GenerateStep (lg:hidden, reusa navItems da sidebar)
- `ee9c647` — SectionFaturamento responsivo + SectionProtestos overflow-x-auto

Bug real corrigido: Top 10 de Processos cortando coluna Status (`overflow:hidden` sem `overflowX:auto`).

### 2. Split de `app/api/extract/route.ts` em 5 fases (5 commits)

route.ts: **3782 → 966 linhas (−74,5%)**

- `9dc2a05` — Fase 1: prompts → `lib/extract/prompts.ts` (1073 linhas, 18 PROMPT_*)
- `e319439` — Fase 2: adapters → `lib/extract/adapters.ts` (958 linhas, 11 funções)
- `f5dc773` — Fase 3: fillDefaults → `lib/extract/fillDefaults.ts` (468 linhas, 14 funções + AnyExtracted)
- `3140eac` — Fase 4: AI clients → `lib/extract/ai.ts` (323 linhas, callAI exportado + GEMINI_API_KEYS)
- `aaed380` — Fase 5: JSON parsing → `lib/extract/json.ts` (81 linhas, parseJSON)

Bug pego pelo TS na Fase 3: `sanitize*` faltando no import.

### 3. Middleware otimizado (1 commit)
- `5bac563` — `isPublicRoute()` roda **antes** de `createServerClient`, evitando Supabase init em rotas públicas (assets, webhooks, cron, diagnóstico).

### 4. Tools cérebro Obsidian (1 commit)
- `e11a0bf` — `scripts/build-design-snapshot.mjs` + `scripts/build-design-per-tab.mjs`

### 5. Design system com escala tipográfica (5 commits)
- `17083fb` — feat(globals.css): adiciona `.text-display`, `.text-page-title`, `.text-section-title`, `.text-card-title`, `.text-body`, `.text-body-sm`, `.text-caption`, `.text-meta` + corrige body font-family pra `var(--font-dm-sans)`
- `aa6e336` — refactor home: aplica tokens (piloto)
- `2d95178` — refactor parecer: hero + decisão
- `9076b8f` — refactor pages: unifica h1 (historico, configuracoes, custos)
- `a0cb40e` — refactor review: shared.tsx (afeta 15 sections)

### 6. Sidebar limpa (1 commit)
- `5ad4313` — Remove "Em Andamento" do menu (rota `/operacoes` preservada)

### 7. Limpeza extract (1 commit)
- `372eb88` — Remove `uploadToGeminiFilesWithRotation` (dead code) de `lib/extract/ai.ts`

### 8. Split de `app/api/analyze/route.ts` em 5 fases (5 commits)

route.ts: **2030 → 908 linhas (−55%)**

- `cfc7538` — Fase A: ANALYSIS_PROMPT → `lib/analyze/prompts.ts`
- `1abcd3d` — Fase B: calculations → `lib/analyze/calculations.ts` (489 linhas — parseBRL, pct, countEmptyFieldRatio, calcularCobertura, buildCoberturaBlock, calcularPreRequisitos, calcularAlavancagem)
- `386da32` — Fase C: PROMPT_SINTESE → `lib/analyze/prompts.ts` (depende de calculations)
- `6f8cb53` — Fase D: fewShot → `lib/analyze/fewShot.ts` (101 linhas, getFewShotExamples)
- `178b536` — Fase E: AI clients → `lib/analyze/ai.ts` (177 linhas, callGemini com FINETUNED_MODEL + callOpenRouter + GeminiResult)

`lib/analyze/ai.ts` é dedicado (não compartilha com `lib/extract/ai.ts`) por causa de comportamentos específicos (FINETUNED_MODEL, retorno de tokens).

Bug pego pelo TS na Fase B: `DEFAULT_FUND_SETTINGS` faltando no import de calculations.ts.

### Tentativa abortada — redesign agressivo da home

Branch `feat/design-refactor` criada. 2 commits feitos (`16ce394` hero novo + `c49c5fe` KPIs/Decisões hierarquizados). Victor não gostou da segunda tentativa, revertido (`afb68fd`). Branch preservada para retomada futura. Lição: próxima tentativa de redesign exige **print de plataforma que Victor admire** ANTES de codar.

**Pipeline:** type-check ✅ por commit · `npm run build` ✅ nas fases sensíveis · push direto pra `master` · Vercel auto-deploy · URL canônica: `plataformacapital.vercel.app` (NÃO confundir com `capital-financas.vercel.app` que é projeto antigo de 34 dias).

**Veredito:** plataforma 7.5 → **8.9/10**. Mobile fechado, dois maiores monolitos divididos (extract + analyze), design system base entregue. Próximo passo: testes E2E com Vitest dos módulos puros (adapters, fillDefaults, json, calculations) — destrava confiança pra refactors maiores.

---

## 2026-05-04 (sessão 4) — Fade-stagger no GenerateStep ✅

**Disparador:** chefe/Victor reportou que a transição de exibição do relatório (após "Análise carregada do cache") era "muito travada" — todos os SectionCards apareciam de uma vez, sensação de pop bruto.

**Diagnóstico:**
- `GenerateStep.tsx:2230` tinha `animate-fade-in` no wrapper externo (200ms)
- Mas todos os SectionCards filhos herdavam o mesmo fade — apareciam juntos
- Sem stagger entre seções

**Fix (commit `2bc4bc4`):**
- Adicionado utility `.fade-stagger` em `globals.css` com `@keyframes cf-fade-in-pure` (puro fade, respeita decisão estética 2026-05-04 de "sem slide-up")
- `:nth-child(1..8)` aplicando `animation-delay` 0/50/100/150/200/240/280/320ms
- `prefers-reduced-motion` respeitado
- `GenerateStep.tsx:2230`: removido `animate-fade-in` do wrapper externo
- `GenerateStep.tsx:2233`: sidebar mantém fade próprio (`animate-fade-in`)
- `GenerateStep.tsx:2254`: container do conteúdo principal recebe `fade-stagger`

**Resultado:** cada SectionCard aparece em cascata fluida (~500ms total), sem ferir o padrão "fade puro" da plataforma. Aplicável a outras telas que tenham containers compostos com pop visual indesejado (basta adicionar `className="fade-stagger"`).

**Pipeline:** type-check ✅ → commit/push GitHub ✅ → deploy `--prod` ✅ → confirmação visual do user ✅

---

## 2026-05-04 (sessão 3) — Fix linha "Prejuízos" no Comparativo SCR Empresa ✅

**Disparador:** chefe do Victor reportou (cirúrgico): tabela "06 · Comparativo SCR — Empresa (PJ)" do PDF não exibia a linha de Prejuízos, mas em outra seção (Risco Consolidado) o prejuízo aparecia. Inconsistência entre duas seções do mesmo relatório.

**Investigação:**
- API DataBox360 testada direto via PowerShell: retorna `prejuizo` correto (R$ 7.373.337,17 atual / R$ 606.842,19 anterior pra CNPJ 41835769000107).
- Mapper `mapearSCRData` (databox360.ts:108) lê `carteira.prejuizo` (singular) corretamente.
- `extracted_data` no Supabase confirmado preenchido pra CRAVINFOODS.
- **Bug em `lib/pdf/template.ts:1903`** — array `scrRows` da função `pageSCRDRE` NÃO incluía `moneyRow("Prejuízos","Inadimplência","prejuizos",true)`. Em "Risco Consolidado" (template.ts:934) estava lá; discrepância entre as duas seções.

**Fix (commit `a6180ca`):**
- `moneyRow("Prejuízos","Inadimplência","prejuizos",true)` entre "Vencidos" e "Limite Crédito"
- `"prejuizos"` adicionado ao type `SCRMoneyField`

**Pipeline:** type-check ✅ → commit/push GitHub ✅ → deploy `--prod` ✅

**Lição:** Bugs de "campo desaparecido" no relatório podem ser bem específicos de tabela. Quando o usuário reporta "não aparece", pedir o nome EXATO da seção/tabela ajuda muito.

**Falsos caminhos seguidos antes do fix:**
- Hipótese de `carteira.prejuizo` ser nome errado → ❌ falso
- Hipótese de bug no mapper/hydrate/recomputeSCRTotals → ❌ todos preservam
- Log diagnóstico DataBox360 aplicado e revertido 2x (poluição em prod sem necessidade)
- Cache `bureau_cache` limpo 3x desnecessariamente
- Auditoria geral de bureaus (útil mas não tocava no bug específico)

---

## 2026-05-04 (sessão 2) — Auditoria SCR/Bureaus + log diagnóstico DataBox360 (revertido)

**Disparador:** chefe do Victor reportou que prejuízos SCR (empresa + sócios PF) não aparecem no relatório PDF/HTML.

**Investigação:**
- Caminho real do SCR é via API DataBox360, **não** extração de PDF (memória anterior estava parcialmente desatualizada).
- Mapper `lib/bureaus/databox360.ts:108` procura `carteira.prejuizo` (singular). Hipótese: API retorna outro nome.
- Identificados **bugs adicionais hardcoded**: `operacoesEmAtraso: "R$ 0,00"` (sempre zerado), `classificacaoRisco: "—"`, `tempoAtraso: "—"`, `historicoInadimplencia: "—"` — sempre placeholder.
- Aplicado log diagnóstico em duas iterações (simples + expandido cobrindo `consulta`, `resumoDoCliente`, `resumoDaCarteira`, `resumoDasModalidades`).
- Cache `bureau_cache` do CNPJ teste (`41835769000107`) limpo via Supabase REST API (3 vezes).
- **Não capturei JSON real**: `vercel logs` (CLI v3+) só faz streaming "from now", não pega histórico. User rodou a consulta antes de eu iniciar o stream.

**Decisões finais da sessão:**
- Log diagnóstico **revertido** (deploy `plataformacapital-ooi7mn39b`).
- Plano completo de ataque catalogado em `cerebro/roadmap-gaps.md` seção "Bugs SCR/Bureaus catalogados (auditoria 2026-05-04)".
- Sessão 1 (P2 — fixes seguros) **NÃO executada** — pausada a pedido do user pra priorizar registro em memória.

**Achados ampliados (varredura `lib/bureaus/`):**
- 6 padrões suspeitos de mesmo padrão (hardcoded `"—"` ou `"R$ 0,00"` mascarando dado faltante)
- Severidade: 2 ALTA (credithub.ts:875, datajud.ts:310), 2 MÉDIA, 2 BAIXA
- Detalhe completo em `cerebro/roadmap-gaps.md`

**Próxima sessão (continuação):**
1. Executar Sessão 1 P2.1/P2.2/P2.3 (fixes seguros, ~1h)
2. Re-adicionar log diagnóstico DataBox360 + iniciar `vercel logs --follow` ANTES de pedir nova consulta
3. Capturar JSON real → fixar P1 com nomes corretos

**Pendências de calibração não atendidas:**
- Skill `UserPromptSubmit` reforçado com formato "opções numeradas" (caminho A escolhido) — escopo (global/projeto) e formato (letras/números) pendentes
- Bug exibição `template.ts:1951` (sócio PF mostra `"—"` em prejuízo zero — não distingue de extração falhou)

---

## 2026-05-04 — Overhaul UX + Codex + QSA merge + bugs PDF

15 commits. Estado final: branch `master` em `victorayres3005-boop/Plataforma-capital-finan-as`.

**Highlights:**
- Overhaul UX inicial: `lib/formatters.ts`, Logo, error/not-found/global-error/loading.tsx, /parecer/[id], shadcn (dialog/tooltip/tabs/select/dropdown/table/skeleton/breadcrumb/confirm-dialog), mobile sidebar drawer, busca+paginação /pareceres, DevBanner, "Compartilhar link" via /api/share-report, validação inline login+perfil, CommandPalette Ctrl+K, dark mode lite
- 4 bugs do Codex review: confirmedDocsRef reset, Curva ABC parse rawPdfText, match SCR/IR por type+contagem, retry SCR sócios bloqueia canProceed
- Banner "Consulta não realizada" para protestos/processos quando bureau não consultado
- **QSA herda do Contrato Social**: cpfCnpj, qualificacao, participacao, capitalInvestido. Match fuzzy por nome, badge "do contrato" na UI
- **SCR Total único** via `lib/scrTotal.ts` (carteira+vencidos+prejuízos). Aplicado em template.ts, generators/pdf, auto-score, crossValidate, GenerateStep
- Padroniza fade puro 200ms (F5+navegação+modais)
- `transform: translateZ(0)` no PageContent — restaura containing block para barras `position:fixed`
- Logo Capital sempre navega Visão Geral
- Barras de ação inline (não-fixed) em GenerateStep e /parecer
- "Reprocessar extração" funciona em coletas retomadas (baixa do blob_url)
- Pills de empresas → dropdown compacto + chip do filtro ativo
- /parecer: TAC, garantias, concentração não auto-preenchem (anti-viés de concordância com IA)
- Codex review automático ativo

**Convenções estabelecidas (durabilidade alta):** ver ui-fluxos#Convenções visuais e ui-fluxos#GenerateStep.

---

## 2026-05-03 — Auditoria completa + seções Revisão + bug upload state

**Auditoria:** 70+ arquivos varridos, 4 fixes código + 3 SQLs Supabase rodados.

**Fixes código:**
1. `lib/goalfy/mapper.ts` — severity enum corrigido: `"critico"/"alto"` → `"ALTA"/"MODERADA"/"RESTRITIVO"`. Alertas críticos voltaram pro Goalfy.
2. `lib/generators/html.ts:41-42` — `(d.contrato?.socios ?? [])`. Crash defensivo.
3. `lib/politica-credito/defaults.ts:449` — `(c.opcoes?.length ?? 0)`. Crash quando opcoes=undefined em política antiga.
4. `lib/useAuth.ts:17` — `data?.user ?? null`. Null safety.

**SQLs rodados:**
1. RLS `goalfy_pending_operations` — `USING(true)` → filtro por `user_id`. Isolamento por usuário.
2. RLS `api_usage_logs` — idem. Logs de custo isolados.
3. Enum `operacoes.modalidade` — adicionado `'recomprada'`.

**Seções de Revisão (06/07/08):**
- `SectionProtestos`, `SectionProcessos`, `SectionGrupoEconomico` (read-only).
- Wiring no `ReviewStep.tsx`, sempre renderizam (estado "sem dados" se vazio).

**Bug upload state:** `confirmedDocsRef` em `app/page.tsx` impede auto-save UPDATE de descartar tipos com extração vazia.

**Curva ABC reescrita:** parser regex direto >15k chars, recovery JSON truncado, removida do `LARGE_TEXT_FALLBACK_VISUAL`.

---

## 2026-04-30 — Outage Gemini + hardening + fixes acumulados

**3 causas raiz reportadas como "quebra":**
1. Logs sumidos no DevTools → `removeConsole` ativo em prod stripava `console.log/info`. Fix: `removeConsole: false`.
2. Gemini 503/timeout em curva_abc/faturamento → outage Google + maxOutputTokens 10k baixo + parseJSON estrito virando `{}` em truncamento.
3. Goalfy "quebrado" → 3 arquivos com reescritas com erros silenciosos. Fix: rollback dos 3 arquivos pra estado de `7153c13`.

**Cirurgias:**
| Commit | Conteúdo |
|---|---|
| `8e22778` | Rollback Goalfy + logs verbosos analyze + política como fonte única, calibração, IR participações |
| `076444c` | `removeConsole: false` |
| `6586150` | Hardening segurança 10 endpoints + bugs perfil/LayoutShell/CreditHub + timeouts embeddings/datajud |
| `0fab249` | GOALFY_WEBHOOK_SECRET volta a ser opcional |
| `b21b59c` | Timeout 45s pra curva_abc |
| `affb933` | Fallback texto-grande → visual em curva_abc/faturamento (>25k chars) — depois revertido pra curva_abc |
| `6697e39` | maxOutputTokens curva_abc 10k→32k + recovery JSON truncado |

**Hardening 10 endpoints:** `debug-extraction`, `debug-bureaus`, `bureaus/debug-cpf`, `metricas`, `share-report`, `ch-diag`, `generate-pdf`, `exportar-pdf`, `exportar-pdf-html` — todos exigem login agora. Crons `reanalise` e `goalfy-sync` fail-closed sem `CRON_SECRET`. `share-report` tem `MAX_HTML_BYTES = 5MB`.

**Decisão:** Victor não quer fallback OpenRouter/Groq.

---

## 2026-04-29 — Política como fonte única de verdade

`/api/analyze/route.ts` refatorado:
- `loadPoliticaServidor(userId)` carrega política do Supabase server-side
- `parametros_elegibilidade` sobrescreve `FundSettings`
- Auto-score server-side via `autoPreencherScore`
- `buildPoliticaBlock(politica)` injetado no prompt do Gemini ANTES dos dados
- Removido fallbacks de "estimar score" e caps por cobertura

**HIDE_AVALIACAO** estendido para PDF (`parecer.ts`, `sintese.ts`). Antes só HTML escondia.

---

## 2026-04-26 — Fixes pré-deadline DataBox360

**10 bugs corrigidos** + 8 features deployadas.

**Mudança fundamental:** `pdf-parse` lógica invertida — antes whitelist `TEXT_MODE_TYPES` (4 tipos visuais), agora **blacklist `VISUAL_ONLY_TYPES = ["contrato", "relatorio_visita"]`**. Modo texto vira o padrão (5-8s vs 30-45s do visual).

**Outros fixes:**
- 504 timeout `/api/bureaus` (Promise.allSettled, `withTimeout` por bureau, maxDuration 60→300s)
- CreditHub retry-on-500 removido (só retry em `push="true"`)
- Embedding 404: `text-embedding-004` → `gemini-embedding-001` com `outputDimensionality: 768`
- DataBox360 token: lock anti-concorrência + circuit breaker 60s + 1 tentativa em 30s
- PDF escaneado retornava 422 → agora vai pro Gemini visual
- Gemini timeout: `perAttemptMs` 8s→15s pequeno, 40s binário
- DataBox360 SCR Curto/Longo: `mapearSCRData` somando buckets BCB
- Aba `/custos` crash com localStorage antigo: `safeNum()`, guards, fmtBRL/fmtUSD seguros

**Features:**
- SCR comparativo anual (mesmo mês 12 meses atrás)
- Fallback BDC para sócios quando QSA/IR vazios
- SCR grupo econômico (cap 5)
- Detecção sandbox DataBox360
- Cache 24h SCR no Supabase
- HIDE_AVALIACAO toggle (rating escondido em calibração)
- DataBox360 em `/custos` (R$0,00 pendente)

---

## 2026-04-25 — Saúde das APIs + bugs assorted

**Varredura status:**
| Bureau | Status |
|---|---|
| CreditHub | ✅ |
| BigDataCorp | ⚠️ Token 7d |
| Assertiva | ✅ |
| DataBox360 | ⚠️ Sandbox |
| Gemini | ✅ Vercel |
| BrasilAPI | ✅ |
| DataJud | ✅ |
| Goalfy | ✅ |
| Transparência | ❌ Mock (chave gratuita não cadastrada) |
| Serasa/SPC/Quod | ❌ Mock (sem contrato) |
| Google Maps | ✅ |

**Bugs:**
- 504 middleware → `getSession()` ao invés de `getUser()`
- WelcomeModal "Começar agora" travado → atualização otimista em `useOnboarding`
- TS error em `/importar-goalfy` `OperationCard.onImport`
- `scrAnteriorDone` referência morta em `UploadStep`
- `GEMINI_API_KEYS=""` no Vercel produção → re-adicionadas (3 chaves rotação)

---

## 2026-04-24 — Otimização custo Gemini + Goalfy completo

**Custo Gemini estava em R$37/dia.** 5 correções:
| Arquivo | Mudança | Impacto |
|---|---|---|
| `analyze/route.ts:152` | Flash primeiro, Pro fallback | ~70-80% |
| `analyze/route.ts:201` | thinking 2048→1024 | ~50% |
| `extract/route.ts:3236-3239` | thinking zerado p/ protestos/qsa/grupoEconomico | acumulativo |
| `extract/route.ts:3232-3235` | thinking 256→128 p/ scr/dre/balanco/processos | acumulativo |
| `extract/route.ts:3220` | curva_abc output 16k→10k | ~30% (depois 10k→32k em 2026-04-30) |

**Goalfy integração completa:** webhook + n8n GET sync + UI highlight. Limitação: API não retorna URLs públicas, só plano pago.

**Toggle `exibir_conformidade`:** SQL `ALTER TABLE fund_settings ADD COLUMN exibir_conformidade boolean DEFAULT false` rodado.

---

## 2026-04-23 — Cirurgias extrator + PDF, bugs analyze, Assertiva fix

**6 cirurgias deployadas:**
1. SCR `{{TIPO_ESPERADO}}` PF/PJ
2. Zod `RelatorioVisitaSchema.passthrough()`
3. IR Sócio: bens/dívidas detalhados (`IRBemDireito`, `IRDividaOnus`, `IRPagamento`)
4. `conformidade.ts` Row 2 (Limite Convencional, Comissária, Tranche LG, Tranche Checagem)
5. Faturamento zero → "s/fat." italic cinza
6. Curva ABC log diagnóstico

**11 bugs corrigidos (segunda parte):**
- R1, R2: detecção RJ via `temRJ`, distribuição, razão social (caso ALIRIO)
- I1: idade aceita `MM/YYYY` e `YYYY` além de `DD/MM/YYYY`
- Indicadores determinísticos (alavancagem, liquidez, margem) calculados em TS
- B1, B2, B3: SCR prejuízos, eliminatório, classificacaoRisco
- P1, P2: tranche_checagem prioritário, raw_response sempre salvo
- CNPJ data_abertura preserva formato
- Curva ABC: maxChars 30k→60k, output 8k→16k

**Assertiva auth fix:** URL `api.` (não `integracao.`), path `/oauth2/v3/token` (não `/oauth/token`), `.trim()` em credenciais Vercel.

**3 gaps Assertiva implementados:** protestos empresa, consultas mercado, processos por sócio.

**Tabelas PDF/HTML:** seções 5d (processos sócios BDC), 5e (protestos sócios Assertiva), valor processos no grupo econômico.

---

## 2026-04-19 — Avaliação 7.5/10 (snapshot)

Baseline pós-fixes intensivos de abril. Diagnóstico completo + roadmap em roadmap-gaps.

---

## 2026-04-15 — PDF/HTML arquitetura estável

`lib/pdf/template.ts` consolidado como **único template**. `gerarHtmlRelatorio(params)` exportada. `lib/generators/report-template.ts` re-exporta como `generateReportHTML`.

Cadeia de fallback: `/api/generate-pdf` (Puppeteer) → `/api/exportar-pdf` (legado) → `buildPDFReport()` jsPDF local.

---

## 2026-04-14 — SCR `_slotHint` (debug comparativo)

Bug histórico: PDF mostrava períodos SCR trocados quando Gemini falhava em `periodoReferencia`.

Fix: `extract/route.ts` persiste `scrData._slotHint = slot` após override de `tipoPessoa`. `hydrateFromCollection.ts` usa `slotHintRank` como desempate em `sortSCRDocsDesc`.

---

## 2026-04-01 — Multimodal Gemini

Pipeline migrado de texto puro (pdf-parse) para `inlineData` base64 (multimodal). Preserva estrutura de tabelas. Custo maior, precisão MUITO superior.

(Inverso parcial em 2026-04-26: modo texto vira padrão, `VISUAL_ONLY_TYPES` apenas para contrato e relatorio_visita.)

---

## Como adicionar entrada nova

Quando concluir uma sessão com cirurgias relevantes:

```markdown
## YYYY-MM-DD — Título curto

**Highlights:**
- bullet 1
- bullet 2

**Cirurgias:**
| Commit | Conteúdo |
|---|---|

**Decisões:**
- ...
```

Adicionar **no topo** (mais recente primeiro). Bug fixes triviais não entram aqui — só no commit.
