---
tags: [capital-financas, roadmap, gaps, avaliacao]
---

> Hub: [[CAPITAL]]


# Roadmap, Gaps e Avaliação

Estado da plataforma, gaps conhecidos e direção. Atualizar quando o próprio Victor recalibrar prioridades.

## Avaliação atual: ~9.5/10 (snapshot 2026-05-06 fim do dia)

> Sessão maratona de 2026-05-06 (manhã + tarde + noite) entregou: (1) Suíte Vitest 261 testes + CI gate; (2) 9 bugs reais corrigidos (4 críticos V2 + 4 extract + DataBox sócios); (3) Goalfy webhook reescrito com download imediato + UX preventiva + polling 30s + auto-nav; (4) Aba `/custos` 100% em Real; (5) Trigger snapshot fixado (4 → 33 análises mensuráveis); (6) Rating IA — 3 fases (parecer crítico por pilar + sugestão paralela + sugestão por critério); (7) Redesign `/pareceres` aprovado em produção; (8) Redesign `/importar-goalfy` com identidade Capital aprovado em produção; (9) Aba `/historico` cirúrgica + funil APEX. Próximo passo: **mockups locais para `/custos` redesign** + **E2E Playwright funcionando** + **componentes React testados**.

### Snapshot histórico
- **7.5/10** em 2026-04-19 — pós-fixes intensivos de abril
- **8.9/10** em 2026-05-05 — pós-mobile + splits + design system + CreditHub-first
- **9.3/10** em 2026-05-06 (manhã) — pós-suíte Vitest + CI gate + 4 bugs eliminatórios V2 corrigidos + Goalfy webhook resilient
- **~9.5/10** em 2026-05-06 (fim do dia) — pós-redesigns `/pareceres` + `/importar-goalfy` + `/historico` + Rating IA 3 fases + DataBox sócios + custos R$

### Forte (8-9)

- **Backend de extração** — Gemini multi-modelo + sanitização + dedup QSA/IR robusta + reconciliação de bens IR
- **Persistência** — Supabase RLS OK, proteção `documents=[]`
- **Design system PDF** — navy `#163269` + verde `#84BF41` + DM Sans coeso
- **Git hygiene** — commits atômicos bem descritos
- **APIs como fonte primária** — direção estratégica clara

### Médio (6-7)

- **Monólitos:**
  - `GenerateStep.tsx` (2810 linhas)
  - `parecer/page.tsx` (1408 linhas)
  - `app/api/extract/route.ts` (2522 linhas)
- **Duplicação de helpers PDF** entre `lib/pdf/template.ts` e `lib/generators/pdf/helpers.ts`
- **Histórico** — busca sem debounce, filtros não persistem (parcialmente resolvido em 2026-05-04)

### Precisa de trabalho (4-5)

- **Mobile:** Upload/Revisão/Parecer inutilizáveis em celular
- **Componentes React sem teste** — 0 testes em `components/`; sections de revisão (15) e UI crítica (UploadStep, ReviewStep, GenerateStep) descobertas
- **E2E Playwright quebrado** — specs existem mas não rodam (workflow `e2e.yml` instalado, mas suíte falha)
- **Observabilidade prod** — sem Sentry/error tracking; bug em prod só vira log Vercel
- **Parecer com 717 inline styles** quebra design system
- **`OnboardingTooltip.tsx`** existe mas não é usado em nenhum lugar (órfão)
- **99 erros lint** pré-existentes em `lib/pdf/template.ts`, `lib/generators/pdf/sections/risco.ts`, `lib/mergeQsaWithContrato.ts` — não bloqueiam merge (warning), cleanup gradual

## Roadmap para chegar a 9 (ordem impacto×esforço)

| # | Item | Esforço |
|---|---|---|
| 1 | Wrapper `console.log` atrás de env flag | 1h |
| 2 | Resolver TODOs CreditHub (`api/credithub/route.ts`) | 2h |
| 3 | Refatorar `GenerateStep` em 4-5 componentes | 1d |
| 4 | Extrair helpers PDF compartilhados | 3h |
| 5 | Tooltip explicativo rating no histórico | 30min |
| 6 | Persistir filtros histórico em localStorage | 1h |
| 7 | Ligar `OnboardingTooltip` em 5-6 pontos críticos | 2h |
| 8 | Mobile do Parecer + Histórico | 2d |
| 9 | Testes integração do fluxo extração | 1d |
| 10 | Extrair prompts para `lib/prompts/*.ts` | 3h |

## Datasets BDC órfãos pós-refactor CreditHub-first (2026-05-05)

Com BDC virando fallback total ([[decisoes#adr-011--credithub-first-bdc-como-fallback-total-2026-05-05|ADR-011]]), os datasets abaixo **só aparecem quando CH vem vazio**. Aceito como perda. Revisitar se time sentir falta no parecer:

| Dataset BDC | O que perde | Substituto possível |
|---|---|---|
| `owners_kyc` | PEP / sancionado **com fontes** detalhadas | Portal Transparência (CEIS/CNEP) já cobre sanções públicas + CreditHub `ppe` (booleano simples) |
| `interests_and_behaviors` | CreditSeeker, OnlineInvestor, CreditCardScore (A-H) | Sem equivalente — comportamento digital. Raramente usado em decisão de crédito. |
| `owners_lawsuits_distribution_data` | Distribuição agregada de processos por sócio (tipos, tribunais) | Derivável dos `processos[]` individuais do CreditHub PF |
| `financial_risk` PF | Score 0-1000 + classe + faixa de patrimônio/renda | Assertiva PF já cobre score 0-1000 + classe |

**Como decidir:** rodar a plataforma por ~1 semana com a config nova; se feedback do time/comitê mencionar PEP rasa ou faixa patrimonial faltando, repor BDC sempre-on para esses datasets.

## Cobertura de testes — estado 2026-05-06

**Suíte Vitest:** 258 testes em 8 arquivos, ~1.2s, **bloqueia merge** via CI gate.

| Módulo | Tests | Cobre |
|---|---|---|
| `lib/extract/__tests__/sanitize.test.ts` | 21 | Boilerplate RF, sanitizeMoney BR/US, enum, str, array |
| `lib/extract/__tests__/json.test.ts` | 22 | Markdown wrappers, números BR multi-grupo, $ espúrio OCR, recovery truncamento string-aware |
| `lib/extract/__tests__/schemas.test.ts` | 25 | Zod schemas, safeParseExtracted, auditBusinessRules CNPJ/QSA/SCR/Faturamento |
| `lib/extract/__tests__/fillDefaults.test.ts` | 34 | 13 funções fill + countFilledFields + reconciliação IR |
| `lib/extract/__tests__/adapters.test.ts` | 59 | 10 adapters + directParseCurvaABC + 7 regressões de bugs corrigidos |
| `lib/analyze/__tests__/calculations.test.ts` | 49 | parseBRL R$, calcularCobertura, buildCoberturaBlock, 12 eliminatórios V2, alavancagem |
| `lib/analyze/__tests__/fewShot.test.ts` | 11 | formatFewShotBlock (vetorial + divergencia) |
| `lib/goalfy/__tests__/webhookParser.test.ts` | 27 | extractDocuments 5 padrões + extractMeta + mapDocType + safeFilenameFromUrl |

**O que ainda não tem teste (gaps):**
- `lib/extract/ai.ts` (I/O Gemini — precisa mock)
- `lib/extract/prompts.ts` (só strings literais, baixo valor)
- `lib/bureaus/*` (databox360, credithub, bdc, assertiva — todos sem teste)
- `lib/hydrateFromCollection.ts`, `lib/buildCollectionDocs.ts` (round-trip Supabase)
- `lib/scrTotal.ts`, `lib/mergeQsaWithContrato.ts`, `lib/formatters.ts`, `lib/embeddings.ts`
- `components/*` (15 sections de revisão + UploadStep/ReviewStep/GenerateStep)
- E2E real Playwright (specs existem mas quebrados)

## CI gate ativo — `.github/workflows/quality.yml`

Roda em PR e push para master:
- ✅ **Bloqueia:** `tsc --noEmit` + `npm test`
- ⚠️ **Warning:** `npm run lint` (`continue-on-error: true` enquanto há 99 erros pré-existentes; remover quando chegar a 0)

**Pendência operacional:** GitHub → repo Settings → Branches → adicionar regra "Require status checks to pass before merging" e marcar `quality` na lista. Sem essa configuração, workflow roda mas não bloqueia merge.

## Próximo passo: E2E Playwright + componentes React

1. **Destravar Playwright existente** — workflow `e2e.yml` já existe; specs em `e2e/*.spec.ts` precisam ser corrigidos. 1-2 sessões.
2. **Component tests** — Vitest + Testing Library para sections de revisão (15) e UploadStep/ReviewStep/GenerateStep. 2-3 sessões.
3. **Integration tests** com Supabase de teste — round-trip extracted_data → buildCollectionDocs → hydrateFromCollection. 1 sessão.

## Gaps de funcionalidade (não são bugs)

- `irSocios`: append-only em `hydrateFromCollection` → re-upload do mesmo sócio gera duplicata
- `company_snapshots.alavancagem`: coluna existe mas trigger nunca preenche → sempre NULL
- `OPENROUTER_API_KEYS` / `GROQ_API_KEY` — Victor decidiu NÃO ter (ver decisoes#ADR-001)
- `TRANSPARENCIA_API_KEY` — cadastro gratuito em portaldatransparencia.gov.br pendente
- Sanções (Serasa/SPC/Quod) — mock intencional (sem contrato)

## Pendências de configuração / segurança

- `GOALFY_WEBHOOK_SECRET` ⚠️ não setado — webhook fica aberto com `console.warn`. Pra fechar: gerar secret, setar env, atualizar URL na Goalfy pra `?secret=<valor>`.
- `app/api/upload-blob` precisa `maximumSizeInBytes` (TODO security).
- `app/api/finetuning-status` tem SSRF-shape (modelName na URL — TODO security).
- Vercel Framework Preset: `vercel project inspect` mostra "Vite" — está errado, deveria ser Next.js. `vercel.json` (`framework: nextjs`) compensa em build, mas convém corrigir no painel.

## Pendências discutidas e aguardando decisão

- **120 fps**: Victor perguntou em 2026-05-04. Resposta: não é switch ligável. Próximas sessões podem oferecer 3 caminhos:
  1. Audit rápido de gargalos
  2. Otimizações chumbadas (lazy load, code split)
  3. Virtualizar `/historico`
- **Cache analyze persistido no Supabase** — hoje é in-memory (90min) e perde ao reiniciar Vercel. Requer migration de tabela `analysis_cache`.
- **Política completa calibrada** — Victor manda na semana de 2026-05-05. Ajustar critérios/pesos no banco (`politica_credito_config`), sem deploy.
- **DataBox360 produção** — sandbox até 2026-04-29; depois trocar credenciais (ver runbooks#Virada DataBox360 para produção).
- **Preço DataBox360** — confirmar custo SCR com `suporte@databox360.com.br` para atualizar `/custos`.

## Backlogs arquivados (só mexer se surgir caso real)

### `sintese.ts` — 3 edge cases (2026-05-03)

Não corrigir proativamente. Só se aparecer relatório real com sintoma.

1. **Linha ~612** — `protColor` no Grupo Econômico: `protStr !== "—" && protStr !== "0"`. Falha se vier `"0,00"` ou `"00"`. Fix: `parseInt(protStr) > 0`.
2. **Linha ~619** — `hasValProc` no Grupo Econômico: `e.valorProcessos !== "R$ 0,00"`. Falha se vier `"R$0,00"` sem espaço. Fix: `parseMoneyToNumber(e.valorProcessos) > 0`.
3. **Linha ~474** — Fallback de PL na seção Sócios B2: `if (plRaw !== undefined)`. String vazia passa, renderiza `"PL —"`. Fix: trocar para `if (plRaw)`.

## Direção estratégica de longo prazo

1. **APIs como fonte primária** — reduzir uploads progressivamente. Cada bureau novo = um upload a menos.
2. **Política como fonte única de verdade** — mudanças na política de crédito não exigem deploy (banco). Já implementado em 2026-04-29.
3. **Modo texto > visual** — quando possível. Hobby plan é o gargalo. (ADR-002 invertido em 2026-04-26.)
4. **Diagnóstico via logs sempre antes de código** — feedback ativo (ver decisoes).

## Quem é Victor (referência)

- Analista de crédito FIDC (antecipação de recebíveis)
- Usa a plataforma intensivamente todos os dias — confiabilidade é crítica
- Quer implementações completas, não parciais
- Espera nível institucional financeiro (padrão CreditAI)
- Prefere soluções gratuitas para APIs de IA
- Trabalha com Débora (cliente/stakeholder do projeto)

---

## Bugs SCR/Bureaus catalogados (auditoria 2026-05-04)

Auditoria disparada por relato da chefe do Victor: prejuízos SCR não apareciam no relatório (DataBox360 API). Investigação ampliou pra varredura completa de `lib/bureaus/`.

### P1 — Hardcoded em mapeamento da API (CRÍTICOS, dependem de JSON real)

| # | Arquivo:linha | Sintoma | Dependência |
|---|---|---|---|
| 1.1 | `databox360.ts:108` | `Number(carteira.prejuizo ?? 0)` — nome provavelmente errado | JSON real DataBox360 |
| 1.2 | `databox360.ts:262` | `operacoesEmAtraso: "R$ 0,00"` hardcoded | JSON real DataBox360 |
| 1.3 | `databox360.ts:266` | `classificacaoRisco: "—"` hardcoded | JSON real DataBox360 |
| 1.4 | `databox360.ts:264, 272` | `tempoAtraso`, `historicoInadimplencia` hardcoded | JSON real DataBox360 |
| 1.5 | `credithub.ts:875–877` | `scrTotal/protestos/processos: "—"` hardcoded em `GrupoEconomicoData` | Auditar fluxo de enriquecimento |
| 1.6 | `datajud.ts:310–312` | Mesmo padrão hardcoded em fallback DataJud | Auditar uso real |

### P2 — Fix com confiança total (não dependem de evidência)

| # | Arquivo:linha | Sintoma | Fix sugerido | Esforço |
|---|---|---|---|---|
| 2.1 | `bigdatacorp.ts:317` | `catch {}` engole erro silenciosamente | `catch (err) { console.warn("[bdc/grupo] erro:", err); return null; }` | 5min |
| 2.2 | `bigdatacorp.ts:297, 301` | `valorTotalEstimado: "—"` sem fallback alternativo | Tentar `p.Valor`, `p.ProcessValue`, `p.ValorAcao` antes de `"—"` | 20min |
| 2.3 | `assertiva.ts:187, 196` | `return null` sem retry | Retry simples (1 tentativa, delay 800ms) em timeout/5xx | 25min |

### P3 — Defensivos opcionais

| # | Arquivo:linha | Sintoma | Esforço |
|---|---|---|---|
| 3.1 | `credithub.ts:334, 659` | `?? ?? ?? 0` sugere incerteza de nome de campo | 15min |
| 3.2 | `databox360.ts:344-373` | `consultarSCRSocios` sem retry interno | 30min |
| 3.3 | `bureaus/route.ts` | SCR sócios falha silenciosa quando QSA vazio (race com extração) | 2h (toca front + back) |

### Ordem recomendada

1. **Sessão 1 (~1h):** executar P2.1, P2.2, P2.3 — não dependem de evidência
2. **Sessão 2 (~30min):** re-adicionar log diagnóstico DataBox360 (havia sido revertido) + capturar JSON real via cache miss
3. **Sessão 3 (~3h):** fixar P1.1–P1.4 com nomes corretos do JSON; auditar e decidir P1.5 e P1.6
4. **Sessão 4 (opcional):** P3

### Bug raiz original (em aberto)

**Sintoma reportado pela chefe do Victor:** prejuízos SCR não aparecem no relatório (empresa + sócios PF). Após investigação ampla, **não foi possível confirmar com evidência** — chamadas reais DataBox360 caíram em cache, e a única rodada non-cache não foi capturada em logs em tempo (Vercel CLI `vercel logs` só faz streaming "from now", não puxa histórico).

**Hipótese forte:** `databox360.ts:108` procura `carteira.prejuizo` (singular). API provavelmente retorna outro nome (`prejuizos`, `carteiraPrejuizo`, `creditoBaixadoPrejuizo`).

**Como confirmar (Sessão 2):**
1. Re-adicionar log expandido cobrindo `Object.keys(consulta)`, `keys.resumoDoCliente`, `keys.resumoDaCarteira` com valores
2. Limpar cache do CNPJ teste no Supabase (`bureau_cache` filtro `cnpj LIKE 'scr:<cnpj>:*'`)
3. Iniciar `vercel logs --follow` ANTES de pedir nova consulta
4. User dispara consulta de bureaus → log capturado em tempo real
5. Reportar JSON real

### Bug exibição PDF/HTML (separado, mas relacionado)

`lib/pdf/template.ts:1951` — para sócios PF, exibe `"—"` quando `prejVal === 0`. Não distingue "sócio sem prejuízo real" de "extração falhou (campo vazio na resposta)". Considerar mudar pra `"R$ 0,00"` quando dado existe e é zero, e `"—"` apenas quando campo está vazio/null.
