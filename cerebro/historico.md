---
tags: [capital-financas, historico, changelog]
---

> Hub: [[CAPITAL]]


# Histórico — sessões e cirurgias

Log datado de mudanças significativas. Adicionar entrada nova **no topo** quando uma sessão executar cirurgias relevantes. Bug fixes pequenos vão pro commit, não aqui.

---

## 2026-05-12 — Auditoria de frontend + Comparativo BDC × PGFN na Dívida Ativa

7 commits. 3 frentes:

### Frente 1 — Auditoria de frontend (Batches 1+2)

Greps por padrões problemáticos rendeu 4 fixes cirúrgicos:

- **Cleanup de setTimeout** (`fix(timers)` 2c03ca6): `app/importar-goalfy/page.tsx` ganhou `safeTimeout` com array ref limpo no unmount cobrindo `router.push(1500)` + `setImportPhase(3000)`. `app/custos/page.tsx` e `components/generate/ExportSection.tsx` ganharam timer cleanup individual. Evita warnings "setState on unmounted".
- **AbortController** (`fix(empresa-detail)` f61c6a6): `app/empresa/[cnpj]/page.tsx` agora cancela fetch antigo ao trocar de CNPJ — antes a resposta antiga sobrescrevia dados novos (race).
- **Toaster duplicado** (`fix(toaster)` 2a01b02): havia `<Toaster>` em `app/layout.tsx` + `app/parecer/page.tsx`. Sonner renderiza em todas as instâncias do `<Toaster>` montadas → toast aparecia 2x. Removido o local.
- **Dedup do toast "Coleta salva no histórico!"** (`fix(toast)` db1f851): adicionado `{ id: "coleta-salva" }` nos 2 `toast.success` (insert+update). Sonner deduplica toasts com mesmo id mesmo se chamado 2x em sequência. Sintoma: ao entrar na aba Relatório, Victor via 2 toasts seguidos (causa real provavelmente é remount do componente que zera o ref `autoSaved`).

Falsos positivos identificados: fetch em `ReviewStep.tsx` e `historico/page.tsx` estão em handlers de botão (não em useEffect), sem race. 41 `console.log` em prod NÃO foram removidos — são instrumentação intencional com prefixos estruturados (decisão `removeConsole: false`).

### Frente 2 — Comparativo cruzado BDC × PGFN na Dívida Ativa

Motivado por divergência real: CNPJ 41.301.271/0001-64 mostrava R$ 6.85M / 20 inscrições no BDC, mas comparando com `listadevedores.pgfn.gov.br` os valores divergiam muito. Investigação descobriu que **o `LastUpdateDate` de TODAS as 20 inscrições do BDC era 2025-07-20** — ~10 meses defasado. 8 inscrições já estavam em SISPAR (parceladas), removidas da lista PGFN, mas ainda no snapshot do BDC.

- `feat(divida-ativa)` 891f6fd:
  - `types/index.ts`: novo campo `ExtractedData.dividaAtivaBDC?: DividaAtivaData` — snapshot para comparação
  - `app/api/bureaus/route.ts`: orquestrador agora SEMPRE captura o snapshot BDC, mesmo quando há upload manual (antes o BDC era ignorado nesse cenário)
  - `lib/pdf/template.ts`: bloco "Comparativo BDC × PGFN" renderiza só quando há AMBOS — KPIs lado a lado, tabela "fora da lista" (BDC tem, PGFN não — parceladas/quitadas), tabela "novas no PGFN" (inscritas após o crawl BDC). Matching por número de inscrição normalizado.

- `feat(upload)` a011128: card "Dívida Ativa — PGFN" **re-adicionado** ao fluxo de upload. Tinha sido removido em 2026-05-08 ("agora vem automático via BDC") — mas com a descoberta da defasagem BDC, upload manual voltou a ser estratégico.

### Frente 3 — Ajustes finos pedidos pela chefe

- `feat(qsa)` 7de79e6: coluna **"Patrim. Líq. / Renda Est."** removida do Quadro Societário na Síntese Preliminar. Tabela vai de 5 para 4 colunas (Sócio · CPF/CNPJ · Qualificação · Part.). Cards de Patrimônio Líquido nas seções de SCR dos Sócios foram preservados — pedido era específico do QSA da síntese.

---

## 2026-05-11 — Maratona: Pleito do Comitê + Parecer PDF/HTML + redesign /relatório + 3 bugs SyntaxError históricos

**Sessão muito longa** (~18 commits). 4 frentes principais:

### Frente 1 — Bug histórico: SyntaxError no script de edição do `/r/{id}`

Modo edição inline **NUNCA funcionou em prod** desde o deploy original — o `<script>` morria silenciosamente no navegador com SyntaxError. Causa: template literal de `lib/pdf/template.ts` resolvia escapes ANTES de chegar no browser. Três casos:

1. `match(/\/r\/([a-z0-9]{8,16})/)` no source virava `match(//r/([a-z0-9]{8,16})/)` no HTML — o `//` virava comentário JS, parser quebrava. Fix: `\\/` no source.
2. `// comentário com \n` virava comentário quebrado em 2 linhas com `)` órfão. Fix: trocar `\n` por palavra "newline" nos comentários.
3. `br.replaceWith('\n')` virava string com newline literal (inválido em ECMAScript). Fix: `'\\n'` no source.

Fixes aplicados via runtime no `app/r/[id]/route.ts` para cobrir relatórios já armazenados no banco (não regerar). Memória detalhada: `feedback_template_literal_regex.md`.

### Frente 2 — Pleito do Comitê + Parecer dedicado

- **Pleito do Comitê reativado**: tabela editável de 15 campos abaixo do "Pleito do cedente" no `/r/{id}`. Autosave 800ms via PATCH `/api/r/{id}/pleito-comite`. Endpoint + migration 17 já existiam desde 2026-05-07, faltava o markup no template.
- **Endpoint `/api/r/[id]/parecer-pdf`** (POST) + **`/api/r/[id]/parecer-html`** (GET). Documento "Decisão do Comitê" portado de `app/parecer/page.tsx::buildDecisaoHtml`. Builder compartilhado em `lib/parecer/buildHtml.ts`. Decisão/Rating ficam "PENDENTE" no cabeçalho. Observações = 4 percepções + Fortes/Fracos/Alertas. Bloco "Condições e Garantias" omitido.
- **Botões "Baixar PDF" + "Ver em HTML"** abaixo do Pleito do Comitê.
- Renomeação "Pleito" → "Pleito do cedente".
- Dropdown de autor da barra de edição: Victor, Vanessa + Débora, Nayara, Gleyso, Luiz.
- Fallback gracioso PGRST204 no endpoint `/api/r/{id}/edit` (loop de até 8 tentativas detectando "Could not find the 'X' column" e removendo do payload).
- Coluna "Vencidos" no card SCR dos Sócios (grid `c5` → `c6`).
- Coluna "Credor" no Top 5 processos recentes (usa `ProcessoItem.partes` já populado pelo CreditHub).

### Frente 3 — Redesign da página de Relatório (`GenerateStep.tsx` dentro de `app/page.tsx`)

**Fase A — Performance:**
- 4 queries do boot em paralelo (`Promise.all` de `document_collections` + `score_operacoes` + `pareceres` + `auth.getUser`). Antes eram 2 rounds em série.
- `ScoreSection` virou dynamic import com loading skeleton (sai do bundle inicial).

**Fase B — Visual:**
- Sumário Executivo reorganizado em 3 níveis hierárquicos:
  1. **Decisão + Rating V2** em 2 cards lado a lado com borda colorida pelo nível
  2. **Crédito & Risco** em faixa de 4 KPIs (Dívida · Em Atraso · Protestos · Proc. Passivos)
  3. **Cadastro** em linha fina (Empresa · CNPJ · Situação · Idade · Sócios · Capital · Fat. Anual)
- Sidebar lateral (00/FS/05/07/OP/✎/⬇) removida — códigos não eram autoexplicativos.
- Compactação geral: gap 28→16, padding 32→20, valor 3xl→xl, border-2→1.
- Distinção visual editável vs leitura: classe `.cf-editavel` + `.cf-editavel-wrap` em globals.css (borda azul navy + ícone ✎).

**Remoções a pedido:**
- Botão "Recomeçar" + "Enviar ao Goalfy" + "Score V2 · N pendentes" da barra inferior (sobrou só Voltar · status · Registrar Parecer).
- Opções Word/Excel/HTML "Web" do menu Exportar (sobrou PDF + Visualizar).
- Seção "Observações do Analista / Anotações" (analista usa as 4 caixas de Percepção do `/r/{id}` agora).

### Frente 4 — Polimento

Vários ajustes pontuais: tamanho do botão de download na seção Pleito do Comitê reduzido, label da linha de cadastro com espaçamento corrigido (Tailwind `mr-1` não estava aplicando em span aninhado).

---

## 2026-05-08 — Maratona: Sacados ABC + Bureau + Vínculos · Sugestão Analista · Análise Contábil · 3 docs novos

**Disparador:** chefe pediu (1) na curva ABC, consultar bureau dos sacados PJ e cruzar sócios para detectar partes relacionadas; (2) SCR completo na parte superior da análise; (3) Sugestão do Analista junto do Pleito + caixa de Análise Contábil para a Vanessa; (4) 3 documentos novos uploadáveis (Dívida Ativa, CENPROT, GEFIP).

**7 commits deployados em produção:**

| Commit | Conteúdo |
|---|---|
| `5b76a01` | feat(sacados): análise top 5 sacados PJ + endividamento sócios na síntese |
| `7d0a6ea` | fix(sacados): recupera CNPJ embutido no nome quando cnpjCpf vazio + log defensivo |
| `7cd6282` | feat(sacados): funde Curva ABC + Bureau em tabela única na síntese + score Assertiva |
| `73e6add` | feat(sintese): Sugestão do Analista (junto do Pleito) + Análise Contábil — Vanessa |
| `db21055` | feat(extract): backend para 3 documentos novos — Dívida Ativa + CENPROT + GEFIP |
| `081dee1` | feat(docs): UI + persistência + render PDF para os 3 docs |

### Sacados ABC (Fases A→D) — código novo em `lib/sacados/`

- **`extractTopSacados.ts`** — top 5 PJ da Curva ABC, dedup por CNPJ, ordena por valor desc. Fallback regex `extractCnpjFromText` + `stripCnpjFromName` para quando o extrator concatena nome+CNPJ ("LTDA-15756860/0001-27" — caso real prod).
- **`matchVinculos.ts`** — 5 matchers: CPF comum, sobrenome+UF (suprime 37 sobrenomes ultra-comuns), endereço idêntico, parentesco BDC, **mãe comum** via BDC `/pessoas`.
- **`consultarSacados.ts`** — orquestrador: CH + BDC + Assertiva paralelo + BDC `/pessoas` para mães. Cache 24h `sacado:<cnpj>`. **Score do sacado vem da Assertiva** (CH não retorna numérico) — cell mostra "720 B" (pontos + classe).
- **`/api/bureaus/route.ts`** — Fase 3 nova após `mergeBureauResults`. Reaproveita BDC sócios cedente quando já consultado; senão dispara só `/pessoas` (não `/empresas`). `bureau_calls` ganha `sacado_credithub`, `sacado_bdc_empresa`, `sacado_bdc_pessoa`, `sacado_assertiva_pj`.
- **74 testes Vitest novos** em `lib/sacados/__tests__/`.

### Tabela única na síntese (após pedido do Victor)

A "Curva ABC (Top 5)" original e a "Sacados — Bureau" foram fundidas. Itera sobre `curvaABC.clientes.slice(0,5)` (preserva ranking) + lookup em `sacadosAnalisados` por CNPJ canonicalizado. Sacados PF mostram `<span>PF</span>` para preservar transparência. Cards detalhados com chip 🚩 vermelho continuam na pág 9.

### Mini-bloco SCR + endividamento sócios na pág 3

Bloco "Endividamento — SCR Bacen" entre o mapa e o QSA. KPIs c4 da empresa (Total Dívidas, Vencidos, Prejuízos, IFs · Operações) + tabela compacta de sócios PF. Tabela completa da pág 8 continua existindo (granularidades diferentes — overview vs drill-down).

### Sugestão do Analista + Análise Contábil

- `RelatorioVisitaData.sugestaoAnalista: string` — textarea no `SectionRelatorioVisita` logo após Pleito + Modalidade
- `ExtractedData.analiseContabil: string` (top-level) — `SectionAnaliseContabil` novo (item 11), accent azul
- Síntese pág 3: caixa amber "Sugestão do Analista" + caixa azul-claro "Análise Contábil — Vanessa" abaixo do Pleito
- Persistência: sugestão dentro de `relatorio_visita`; `analiseContabil` dentro de `bureau_meta` (sem migration)

### 3 documentos novos (Fase 2)

| Doc | Tipo / Schema | Render |
|---|---|---|
| **Dívida Ativa** (PGFN/UF/Município) | `DividaAtivaData` com registros `{origem, numeroInscricao, valor, situacao, dataInscricao, natureza}` | Pág 7, após CCF |
| **CENPROT** (IEPTB-BR) | `CenprotData` com registros `{cartorio, cidade, uf, data, valor, devedor, cedente, protocolo}` | Pág 7, com **cross-validation com bureau** (banner amber quando `cenprot.qtdRegistros !== protestos.vigentesQtd`) |
| **GEFIP** / FGTS / INSS | `GefipData` com `competencias[]` por mês + flag `competenciasEmAtraso` | Pág 9 (tabela mensal completa) + Pág 3 (resumo executivo c4) |

Pipeline: `PROMPT_DIVIDA_ATIVA`/`PROMPT_CENPROT`/`PROMPT_GEFIP` em `lib/extract/prompts.ts`; `fillXxxDefaults` em `fillDefaults.ts`; cases novos em `app/api/extract/route.ts`. UploadStep com 3 sections opcionais. Sections read-only em `components/review/SectionDividaAtiva|Cenprot|Gefip.tsx`.

### Custo extra estimado por análise

5 sacados × 3 bureaus + ~10-15 BDC pessoas (sócios para mães) = **~30 calls extras**. Cache 24h `sacado:<cnpj>` corta drasticamente em re-análises.

### Incidente operacional: concorrência destrutiva

Outro agente trabalhando em paralelo na feature "Pleito Comitê — quadro editável" (commit `bfd7d51` durante a sessão). Na 1ª tentativa da Fase 2, mudanças em `types/index.ts`, `lib/extract/*` e `app/api/extract/route.ts` foram silenciosamente revertidas para HEAD durante o trabalho. Estratégia que funcionou: backend num commit/push isolado **antes** do frontend, fixando no remote.

### Pendências

- **Smoke test em prod** — análise real com Curva ABC populada para validar a Fase 3 + nova tabela
- **Bug ortogonal aberto:** Curva ABC voltando R$ 0,00 / 0% nas linhas (extração do documento — não da minha feature)
- Sem testes para os 3 docs novos — adicionar quando aparecer caso real

---

## 2026-05-08 (noite) — Edição inline de Pontos Fortes / Fracos / Alertas em /r/{id} 🚧

**Disparador:** Chefe da Débora pediu "Deixar campos de pontos fortes, pontos fracos e alerta como editáveis, pq eu e Vanessa vamos incluir nossas percepções, e queria que fosse editável no próprio relatório HTML".

**Decisões de produto (Victor):**
- Persistência: salvar no Supabase (3 colunas JSONB novas).
- Acesso: link normal `/r/{id}` é read-only para o cliente final; link com `?k=<edit_token>` (16 chars, único por relatório) habilita edição. Token entregue só pra Victor/Vanessa após o `Compartilhar`.
- PDF "atualizado": botão "Salvar como PDF" do navegador (já existia) — não regerar jsPDF a partir das edições. Fase 2 se pedirem.
- Autor: seletor Victor/Vanessa salvo em `updated_by`.

**Arquivos deployados (commit `c16c100`):**

| Área | Conteúdo |
|---|---|
| Migration 16 | `pontos_fortes/pontos_fracos/alertas JSONB` + `edit_token TEXT` + `updated_at/updated_by` em `shared_reports`. **Pendente aplicação no Supabase** — Victor sem acesso ao Studio, retoma 2026-05-09. |
| Rota POST `/api/r/[id]/edit` | Recebe `{fortes[], fracos[], alertas[], autor, token}`. Valida token contra `edit_token` do registro (não usa auth Supabase — público com token). Sanitiza listas (máx 12 itens, 600 chars cada, 40 chars no autor). 401 para token inválido, 403 quando token não bate, 404 sem registro, 410 expirado. |
| `/api/share-report` | Gera `edit_token` (16 chars alfanum.) junto com o `id`; persiste e devolve `editUrl` + `editToken` na response. Mensagem de erro clara quando colunas ausentes (`code 42703`). |
| `/r/[id]` route | SELECT inclui `pontos_fortes/fracos/alertas/edit_token`. Função `applyOverrides` substitui blocos HTML entre marcadores `<!--EDIT:sec:START/END-->` quando há overrides. `__EDIT_TOKEN__` substituído pelo token real APENAS quando `?k=` bate (sem `k`, vira string vazia → JS do editor faz `return` early). `Cache-Control: no-store` em modo edição. **Coexiste** com `injectPleitoComite` da migration 17 (merge cuidadoso pra não regredir aquela feature). |
| Template HTML | Cada bloco `ana-col f/w/a` virou `data-edit-section="fortes\|fracos\|alertas"` envolvendo `<!--EDIT:sec:START-->...<!--EDIT:sec:END-->`. Helper `renderItems(arr)` escapa via `esc()`. Barra flutuante `.edit-bar` (top-right, fixed) com seletor Autor + Editar/Salvar/Cancelar. JS embutido: `+ Adicionar` por seção, × inline para remover, snapshot/cancel, `beforeunload` se editando, toast verde "Alterações salvas". `@media print` esconde toda UI de edição. |
| `GenerateStep.tsx` | Bug fix: `html.replace("__BASE_URL__", ...)` só pegava a primeira ocorrência, mas agora há 2 (printBtn + edit fetch). Trocado por `split/join`. Captura `editUrl` da response e passa pra `ExportSection`. |
| `ExportSection.tsx` | Após compartilhar, mostra **2 cards lado a lado**: link público (cinza, vai pro cliente) e link de edição (âmbar, "interno — não compartilhar"), com botão Copiar individual. |

**Achado crítico durante a sessão:** o commit `bfd7d51` (Pleito Comitê, criado entre minhas edições por outra sessão) já tinha incluído as mudanças do `template.ts` que eu fiz, mas SEM as peças correspondentes (route.ts overrides, share-report token, endpoint /edit, migration 16). Em prod isso ficava inerte (o JS do editor faz `return` se `__EDIT_TOKEN__` permanece literal), então não havia bug visível — mas era uma feature pela metade. Meu commit fechou. Tive que **reverter manualmente o `route.ts` e fazer merge** das duas features para não regredir o Pleito Comitê.

**Fora do escopo:**
- Codex review automático: subagent precisa de permissão Bash que não foi concedida no fluxo. Pulado nesta sessão; review fica para próxima.
- Middleware bloqueando `/r/*` (achado prévio em `project_middleware_r_bloqueado_2026_05_08.md`): **se confirmado em prod, afeta esta feature também** — `/api/r/[id]/edit` e leitura de `/r/[id]?k=...` retornam 401/redirect. Adicionar `"/r/"` e `"/api/r/"` em `PUBLIC_PREFIXES` é o fix de 1 linha. Não foi tocado nesta sessão.

**Validação em produção (próxima ação para Victor):**
1. Rodar SQL da migration 16 no Supabase quando o Studio voltar.
2. Confirmar `/r/{id}` ainda renderiza corretamente.
3. Compartilhar um relatório novo, copiar `editUrl` (segundo card âmbar).
4. Abrir `editUrl`, clicar Editar, mexer em fortes/fracos/alertas, Salvar.
5. Reabrir o link público — confirmar que reflete (pode demorar até 1h pelo cache na Vercel).
6. Bonus: testar `?k=` errado — não deve mostrar a barra de edição.

**Pendência cruzada com a sessão da tarde:** migration 16 e 17 ambas pendentes no Supabase. Rodar as duas no mesmo dia.

---

## 2026-05-08 (tarde) — Pleito Comitê: quadro editável ao lado do Pleito Cedente em /r/{id} 🚧

**Disparador:** Chefe da Débora pediu "Deixar ao lado de Pleito Comercial um campo editável pra gente preencher no momento do comitê, para não utilizarmos mais Word na apresentação".

**Decisões de produto (Victor):**
- Persistência: salvar no Supabase (autosave debounced 800ms)
- Campos: espelhar os 15 do Pleito do cedente (Limite Global, Tranche, Limite Convencional/Comissária/Sacados, Taxas, Boleto, Prazos, TAC, Tranche Checagem)
- Layout: lado a lado (cedente | comitê) — grid 1fr|1fr
- Acesso: edição livre — id de 10 chars já é semi-secreto
- PDF: precisa também — implementação ficou trivial porque PDF é Puppeteer renderizando o HTML em `emulateMediaType("print")`

**Arquivos deployados (commit `bfd7d51`):**

| Área | Conteúdo |
|---|---|
| Migration 17 | `pleito_comite JSONB` + `pleito_comite_updated_at TIMESTAMPTZ` em `shared_reports`. **Aplicação no Supabase pendente — Victor perdeu acesso ao painel, vai retomar amanhã.** |
| Rota PATCH | `app/api/r/[id]/pleito-comite/route.ts` — público (sem auth), valida id, sanitiza valores (whitelist 15 keys, max 80 chars cada). Distinto da `/edit` (fortes/fracos/alertas) que exige token. |
| Rota PDF pública | `app/api/r/[id]/pdf/route.ts` — variante de `/api/exportar-pdf-html` sem auth Supabase. Valida id em `shared_reports`, mesmo fluxo Puppeteer. Necessária pois comitê externo (sem login) precisa baixar o PDF. |
| Template HTML | Pleito reorganizado em grid 1fr\|1fr: cedente esquerda, comitê direita com 15 `<input data-pc-key="..." />`. CSS `.pc-input` (estados saving/saved/error) + `@media print` remove bordas. JS embutido com autosave debounced 800ms + indicador "Salvo às HH:mm". |
| FAB "Salvar como PDF" | Sincroniza `setAttribute('value', el.value)` em todos `.pc-input` antes de extrair `outerHTML` (necessário porque serialização HTML lê do atributo, não da property DOM). Detecta `/r/{id}` na URL pra escolher rota pública vs. autenticada. |
| `/r/[id]` route | SELECT inclui `pleito_comite`. Função `injectPleitoComite()` substitui `value=""` pelo valor salvo via regex em inputs com `data-pc-key`. `Cache-Control` vira `no-store` quando há pleito preenchido. |

**Achado crítico que economizou trabalho:** O PDF nunca foi gerado por jsPDF a partir de dados — `lib/generators/pdf/index.ts` é código legado não usado no fluxo principal. O fluxo real é Puppeteer renderizando HTML em modo print. Logo Fase 4 ("PDF do comitê") ficou trivial e não precisou tocar `sintese.ts`.

**Fora do escopo da sessão:**
- **Fase 3 (auth por token):** descartada — Victor escolheu "edição livre" mesmo após considerar reusar o `edit_token` da migration 16
- **Edição inline de Fortes/Fracos/Alertas (Vanessa):** trabalho parcial pré-existente no working tree (`/api/r/[id]/edit/route.ts` + migration 16) — **NÃO commitado** nesta sessão pra isolar deploy do Pleito Comitê
- **Fix BPQL/PEFIN parseBRL (Onda A):** trabalho pré-existente em `lib/bureaus/credithub.ts` (já deployado pela manhã no commit `9e3a08a`)

**Pendências antes de validar em prod:**
1. ⏳ **Migration 17 no Supabase** — Victor recupera acesso amanhã e cola o ALTER TABLE
2. **Regerar HTMLs de relatórios existentes** se quiser ter o quadro do comitê neles
3. CHROMIUM_URL precisa estar setado em prod (já está — mesma var do exportar-pdf-html)

**Observação técnica:** `shared_reports.html` armazena HTML estático no banco. HTMLs antigos não terão os inputs do quadro do comitê — precisa regerar pra cada relatório que for ao comitê.

---

## 2026-05-08 (madrugada) — IR detalha Dívidas/Ônus + descoberta e fix do PEFIN quebrado em prod desde sempre ✅

**Disparador:** Débora (chefe) pediu pra incluir "endividamento contendo Dívida e ônus" na leitura do IR. Em seguida, Victor relatou que o relatório mostrava REFIN/PEFIN como "não consultados".

**Cirurgias deployadas:**

| Área | Conteúdo | Commit |
|---|---|---|
| IR — Dívidas/Ônus detalhadas | ReviewStep (`SectionIRSocios.tsx`) ganha card vermelho read-only listando cada item de `dividasOnusReais[]` com total no header. HTML (`template.ts:2515`) renderiza tabela detalhada dentro do card de cada sócio. PDF (`socios.ts:298`) ganha alerta de fallback para IR antigo sem array (mostra apenas total agregado). Pipeline já extraía via Gemini — só faltava expor. | `53bad9a` |
| **CreditHub PEFIN — fix duplo crítico** | (1) Sintaxe BPQL: CNPJ agora entre aspas simples (`WHERE 'DOCUMENTO' = '<cnpj>'`) — sem aspas o IRQL respondia 500 `BPQLParserException: Token unknown`, e o relatório mostrava "Não consultado" desde sempre. (2) Parser substituído de XML (`<ROW>...</ROW>`) para JSON (`parsed.spc[]`) — mesmo com sintaxe correta o parser antigo nunca acharia nada. Defesa adicional contra body XML mesmo com HTTP 200. Função `spcArrayToPefinData` mapeia `NomeAssociado→credor`, `Valor (BR)→valor`, `DataDeInclusao→data`, `NumeroContrato→contrato`. Helper `brDateKey` converte DD/MM/YYYY para YYYY-MM-DD antes do localeCompare. | `9e3a08a` |
| REFIN/Serasa — desligado oficial | Adapter `SERASA` (e variantes `EXPERIAN`, `SERASA EXPERIAN`, `BOAVISTA`, `SCPC`) retornam `Adapter unknown` no IRQL com a chave atual. Removida a chamada de fetch — `refin` fica `undefined` com warning explícito (`[credithub] REFIN: adapter Serasa indisponível no IRQL — verificar contrato CreditHub`). Pendência: contatar CreditHub para liberar dataset Serasa ou indicar rota correta. | `9e3a08a` |
| Hardening — gitignore | `.env.production`, `.env.production.*`, `.env*.tmp` adicionados. Antes só `.env*.local` e `.env.vercel.tmp` estavam ignorados; um `vercel env pull --environment=production .env.production.tmp` poderia entrar em commit acidental. | `2e639fa` |

**Validação live (CNPJ Banco do Brasil 00.000.000/0001-91, contra IRQL produção):**
- Query antiga: HTTP 500 `BPQLParserException: Token unknown. Query Parameter = ['DOCUMENTO' = 00000000000191]`
- Query corrigida: HTTP 200 com 6+ registros SPC reais (SANEPAR, CPFL, PGE-MT, TJ-SP, EDP, ...) totalizando R$ 142k+
- `USING 'SERASA' ...`: HTTP 500 `Adapter unknown - SERASA` (e variantes)
- Apenas `SCPCNET` funciona — e ele já é fonte do PEFIN

**Diagnóstico colateral:** o log `[analyze] Bloqueado: CNPJ ausente — impossível identificar o cedente` (route.ts:384) é validação **intencional** — bloqueia análises sem `data.cnpj.cnpj` ou `data.cnpj.razaoSocial`. Não é bug. Em retomada de coleta antiga, se `buildCollectionDocs` nunca persistiu o doc `cnpj` (ele filtra na fonte), o hidrate devolve vazio e o /analyze recusa — comportamento consistente, não regressão.

**Onda A (parseBRL em parseProcessos/CNPJEnrichment/QSAEnrichment) preservada no working tree** — não foi commitada. Fica para Victor revisar quando voltar à Onda.

**Codex review automático:** rodou para o commit IR (`53bad9a`), achou 1 bug real (duplicação de soma entre alertRow e tblTitle no PDF) e 1 warning (gates inconsistentes) — corrigidos antes do push. Para o fix PEFIN (`9e3a08a`) o subagente codex pediu permissão de Bash que não estava disponível; revisão manual cobriu os pontos críticos.

**Deploy:** `dpl_35EWURKTkWibmZwRXGCqqZtn3o8s` em `https://plataformacapital.vercel.app` — Ready às 23:59:47-03 do dia 07/05.

---

## 2026-05-06 (madrugada) — Funil APEX `/historico` + fix modalidade pleito + Goalfy infra saneada + 28 skills ✅

**Disparador:** Victor abriu pedindo "melhorar a estética da aba de histórico". A sessão expandiu para: refatoração do funil de crédito, fix cosmético na modalidade do pleito, saneamento completo da infra Goalfy (token expirado + `\n` literal em 3 vars + WEBHOOK_SECRET faltando), e bulk install de skills do `awesome-claude-skills` do ComposioHQ. Modelo: **mockups locais antes de cada deploy** depois de duas rejeições diretas.

**Cirurgias aceitas em produção:**

| Área | Conteúdo | Commit |
|---|---|---|
| `/historico` — Funil APEX | SVG triangular elaborado substituído por funil hairline-only: forma triangular preservada, gradiente único navy → verde brand, hairlines brancos como divisores, números na **legenda à direita** (não dentro do SVG). Header com h2 + 2 KPIs grandes (Taxa de aprovação / Rating médio em DM Sans 22px tabular-nums). Footer com Em andamento/Condicionais/Reprovadas (sem emojis) | `5412300` |
| PDF — Modalidade do pleito apresentável | Cards "MODALIDADE" da Síntese Preliminar (B9 Pleito, `lib/generators/pdf/sections/sintese.ts:1064`) e da Conformidade (`conformidade.ts:177`) agora exibem `Híbrida` / `Comissária` / `Convencional` em vez do lowercase normalizado pelo adapter. Lookup `MOD_LABEL` com fallback "—" | `a6989ca` |
| Documentação | Runbook em `cerebro/runbooks.md` cobrindo "Renovação de token Goalfy + audit `\n` em env vars" — 7 passos (validar token, listar boards, audit `\n`, rm+add Vercel com `printf "%s"`, redeploy, restart dev) + bloco separado de setup inicial do `WEBHOOK_SECRET` | `6c76a41` |

**Goalfy — infra completa saneada (não-código, em runtime):**
- **Token JWT** renovado (anterior expirado, retornava 401 em `/api/user`)
- **3 vars no Vercel** (`GOALFY_API_KEY`, `GOALFY_BASE_URL`, `GOALFY_BOARD_ID`) tinham `\n` literal antes da aspa de fechamento → `vercel env rm` + `vercel env add` com `printf "%s"` (CRÍTICO usar printf, não echo). Mesma sujeira no `.env.local` corrigida via Edit
- **`GOALFY_WEBHOOK_SECRET` adicionado** ao Vercel + `.env.local` (string random 64 hex) — endpoint `/api/goalfy/receber` estava aberto em produção
- **Vercel redeploy** disparado via `vercel redeploy <last-prod-url>` → aliased em `https://plataformacapital.vercel.app`
- **Dev server local** restartado (`kill-port 3017 && npm run dev`)
- **End-to-end test:** `GET /api/cards/board/{board}` → HTTP 200
- **Pendência exclusivamente do Victor:** atualizar URL no painel Goalfy → automação webhook precisa apontar para `/api/goalfy/receber?secret=28e5417defeccbfe2082fa8d39f230cb02e5a2e4db0785b074787bad74c49b61`

**Cirurgias descartadas (chegaram a ser implementadas localmente, type-check passou, Victor decidiu não deployar):**

| Cirurgia | Decisão |
|---|---|
| `isEmptyCollection` ampliado (esconde "Sem título" sem CNPJ, "TESTE Claude", "Card teste oficial", coletas de 0 docs) | Aplicado local, depois `git checkout HEAD --` revertido a pedido do Victor |
| Separação visual da lista em "Análises finalizadas" + "Em coleta" colapsável | Idem — descartado |

**Tentativas rejeitadas mais cedo na sessão (não repetir sem brief novo):**

| Tentativa | Resultado |
|---|---|
| Variant B "Executivo" aplicado direto em `app/historico/page.tsx` (hero gradient navy + funil pipeline horizontal) | "Achei muito ruim" — revertido |
| Rota nova `/historico-intent` (modelo "Pra você agir + Arquivo" com critérios 3d/5d/14d/90d) | "Achei bem bosta" — rota deletada |

**Mockups guardados em `mockups/historico-redesign/`** (servir com `npx http-server -p 8787`):
- `funil.html` — 3 propostas (Apex/Cascade/Ledger; APEX vencedor, **deployado**)
- `intent.html` — modelo Pra agir + Arquivo (descartado)
- `variant-a/b/c.html` — 3 estéticas iniciais (Refinado/Executivo/Operacional)
- `index.html` — picker

**Outras entregas:**
- **28 skills** do `https://github.com/ComposioHQ/awesome-claude-skills.git` instaladas em `~/.claude/skills/` via `cp -r` para cada subdir com `SKILL.md` no root. Auto-detectadas pelo Claude Code (system reminder confirmou). Sem conflito com skills custom (`capital-pdf-report`, `capital-rating-analysis`). 3 subdirs (`composio-skills`, `document-skills`, `connect-apps-plugin`) ficaram fora — são plugins, requerem `claude --plugin-dir`. Clone original em `C:\Users\Admin\Documents\awesome-claude-skills\` preservado para `git pull` futuro.

**Lições registradas em memória:**
- `feedback_redesign_visual_workflow.md`: para qualquer redesign visual significativo, **mockup local primeiro** — aplicar direto na page.tsx foi rejeitado 2× nesta sessão apesar de hot reload + type-check passando. Cirurgias de DADOS (filtro/separação/agrupamento) podem ir direto; cirurgias VISUAIS (cores/formas/tipografia/layout) NÃO.
- `feedback_estabilidade_sobre_velocidade.md` (já existia, reforçada): Victor prefere descartar trabalho pronto a deployar coisa que não tem certeza ("pode descartar" foi a frase final para 2 cirurgias funcionais).

**Memórias registradas:**
- `project_historico_redesign_2026_05_06.md` — estado final do `/historico` (apenas APEX em prod)
- `project_goalfy_token_renewal_2026_05_06.md` — saneamento Goalfy
- `project_skills_awesome_install_2026_05_06.md` — 28 skills instaladas

**Memory invariante atualizada:** `/api/cron/goalfy-sync` agora **requer `CRON_SECRET`** (retorna 503 sem ele). Memória antiga em `project_goalfy_integration.md` dizia "Auth: não requer CRON_SECRET" — desatualizada. O cron job da Vercel deve estar configurado com header autorizado, e tentativas locais de bater no endpoint sem secret retornam 503.

---

## 2026-05-06 (noite) — Redesign /pareceres + /importar-goalfy + Rating IA 3 fases + DataBox sócios + custos R$ ✅

**Disparador:** sequência longa de pedidos do Victor após o pacote da manhã (testes Vitest + bugs V2): aplicar 3 fases do Rating IA, atacar estética genérica das abas, finalizar configuração Goalfy com automação real, e corrigir falha apontada pela chefe (link DataBox sócios PF).

**Cirurgias aceitas em produção:**

| Área | Conteúdo | Commit |
|---|---|---|
| Aba `/custos` em Real | Removido input USD/BRL + dropdown; preços Gemini agora em R$ direto (Flash R$ 0,375 input / R$ 1,50 output, Pro R$ 6,25/R$ 50). STORAGE_KEY bumped pra `_v2` (descarta valores antigos USD do localStorage) | `9ca0ab2` |
| Goalfy — Importar/Analisar UX | Botão renomeado pra "Importar e revisar"; toast Sonner com 3 estados (success/warning/error com count de docs); auto-navegação 1.5s pós-import; polling 30s quando aba ativa | `ab3f425` |
| Goalfy — `documents` shape canônico | `/api/goalfy/importar` salvava `doc_type` (cards do `extracted_data` esperam `type`); `scr` (esperado `scr_bacen`). Adicionada `toCollectionType()` em webhookParser; filtra docs com `status="uploaded"`; falhados ficam em `ai_analysis.goalfy_failed_docs` para auditoria | `755ee13` |
| Goalfy — UX preventiva zumbi | Cards sem URLs http/https utilizáveis ganham badge "Sem documentos baixáveis" + borda dashed amber; botão Importar substituído (não-clicável) + tooltip orientando a reenviar a automação Goalfy | `17c2d2d` |
| Goalfy — Authorization seletivo | `/importar` enviava `Authorization: Token GOALFY_API_KEY` em TODA URL HTTP, incluindo Vercel Blob (que rejeita) → 0 docs baixados em smoke test. Agora detecta hostname `goalfy.com.br` e só injeta header pra essas URLs | `b56e536` |
| Rating IA — Fase 1 (auditoria por pilar) | `ANALYSIS_PROMPT` ganha parágrafo `P_PILARES` no `textoCompleto`: Gemini comenta cada pilar V2 com peso e pontos, valida coerência entre resposta do analista e dados extraídos, aponta divergências (ex: "analista marcou sem inadimplência mas SCR mostra R$ 162.834 vencidos") | `1f0ed78` |
| Rating IA — Fase 2 (rating sugerido paralelo) | `AIAnalysis.ratingSugeridoIA` (number 0-10) + `ratingSugeridoIAJustificativa` (string). Gemini calcula rating independente do Score V2 com critérios explícitos (eliminatórios ≤3, problemas moderados 4-6, saudáveis 7-9.5, excelência ≥9). Card "Sugestão IA" azul aparece lado a lado com Card "Comitê" no `/parecer`. PDF intacto (HIDE_AVALIACAO continua) | `c97f382` |
| Rating IA — Fase 3 (sugestão por critério) | `AIAnalysis.respostasSugeridas[]` com `pilar_id`/`criterio_id`/`opcao_label`/`justificativa`. ScoreForm exibe badge "✓ Consenso" quando IA bate com auto-score determinístico OU "✨ IA: <opção>" quando divergente. Opção sugerida pela IA ganha borda dashed azul + ícone Sparkles + tooltip com justificativa. Auto-score determinístico continua como pre-fill principal | `d475bf8` |
| `/pareceres` — refresh estética v1 | Hero navy compacto + 4 KPIs glassmorphism + filtros segmented control + cards lateral colorida pelo status + barra verde brand decorativa + accordion "Detalhar análise da carteira" + cards grid 2-col com Rating V2/IA em destaque + empty state SVG editorial | `5336075`, `7940ec9` |
| `/importar-goalfy` — redesign com identidade Capital | Hero navy + Goalfy em gradient verde brand itálico (WebkitBackgroundClip) + KPIs glassmorphism (Pendentes/Analisadas/Última Sync) + URL webhook removida (já configurada) + separação importáveis vs zumbis (accordion fechado por padrão) + section "Aguardando análise" gradient verde itálico + cards premium grid 2-col com avatar 52px + empty state SVG funil-de-webhook-→-análise + pattern dots navy 6% no background | `1b9f56b` |
| Fix DataBox sócios PF | Reportado pela chefe do Victor: relatório final só exibia link "🔗 Ver consulta DataBox360" para empresa, não para sócios PF. Backend já retornava `urlRelatorio` em `scrSocios[i].periodoAtual` mas template não renderizava. Adicionada renderização condicional no rodapé de cada bloco de sócio (linha 1962 de `lib/pdf/template.ts`), padrão visual idêntico ao da empresa | `ef28b51` |

**Tentativas rejeitadas (revertidas na mesma sessão):**

| Tentativa | Resultado |
|---|---|
| `/pareceres` redesign v2 (cards grid premium + accordion métricas + lista priorizada com pendentes primeiro + tipografia editorial) | "Gostei n, depois olhamos isso, combinado??" — revertido `git checkout` |
| `/custos` hero navy estilo `/historico` | "ficou muito feio pqp" → tentativa de melhorar (KPIs em row própria + toolbar separada + barra verde) → "esse banner tá ruim" → "vamos arrumar esse design depois, vou descansar" → revertido |

**Diagnóstico do CreditHub-first (telemetria via SQL):**
- Trigger `company_snapshots` reescrito (4 → 33 análises mensuráveis em 30 dias). Adicionados `alavancagem` e `scr_vencidos_pct` (eram NULL pelo bug). Fix do `IS DISTINCT FROM` que impedia backfill `UPDATE no_op`. SQL: 3 statements (helper `parse_brl_to_numeric`, trigger reescrito, backfill via `SET status = status`).
- Telemetria revelou que **64% das análises (21/33) caem em rating CRÍTICO (<5)** com média 2.3 — Victor confirmou que reflete o perfil real do portfolio FIDC; **política V2 calibrada certo**. Memória `project_rating_calibracao_2026_05_06.md` registra: rating é determinístico (`Score V2 ÷ 10`), Gemini só ECHO; não vale "treinar" Gemini pra dar rating.
- Telemetria CreditHub-first: 89% das análises ainda dispararam BDC fallback (esperado <15%). Custo extra ~R$ 50/semana, ~R$ 2.600/ano. Investigação dos logs Vercel ficou bloqueada (CLI rate limited); decisão: aceitar como está, revisitar quando custo virar prioridade.

**Lições registradas:**
- `feedback_estabilidade_sobre_velocidade.md` (novo): Victor prefere parar a sessão a arriscar regressão. Quando ele expressa dúvida ou diz "está bom", aceitar — não empurrar.
- `feedback_redesign_visual_workflow.md` (já existia, reforçada): redesign visual = mockup HTML primeiro. Aplicar direto na page.tsx foi rejeitado 2× nesta sessão de noite (`/pareceres` v2 + `/custos`).

**Pendências operacionais (só Victor pode):**
1. GitHub Settings → Branches → "Require status checks" → marcar `quality` (CI gate só bloqueia merge depois disso)
2. Vercel → Env Variables → `GOALFY_WEBHOOK_SECRET` (status atual: aberto; a Sophia do suporte Goalfy foi contatada para confirmar se a automação suporta `?secret=` na URL)

**Próximas frentes mapeadas (não atacadas):**
- Histórico vivo de cedente — `/empresa/[cnpj]` JÁ EXISTE com timeline + KPIs, falta descoberta (rota `/cedentes`, item no menu lateral, link a partir de `/pareceres`). Victor avaliou e disse "n vamos fazer, não é necessário atualmente"
- Refinamento estético `/custos` — pausado após rejeição da v1; próxima rodada precisa começar com mockups locais
- Mock e component tests das 15 sections de revisão (`components/review/*`)
- E2E Playwright funcionando

---

## 2026-05-06 (tarde) — Aba `/historico` cirúrgica + funil APEX + 28 skills awesome-claude-skills ✅

**Disparador:** Victor abriu a sessão pedindo "melhorar a estética da aba de histórico". A iteração revelou duas dores: (1) lista misturava análises legítimas com rascunhos abandonados ("Sem título", "TESTE Claude", coletas de 0 docs); (2) o funil triangular SVG original parecia datado e pesado. O processo passou por mockups locais antes de cada deploy.

**Cirurgias aceitas em produção (`app/historico/page.tsx`):**

| Área | Conteúdo |
|---|---|
| Filtro junk ampliado | `isEmptyCollection` agora detecta: 0 docs sem rating/análise (já existia) + sem CNPJ + nome vazio/"Sem título"/"Empresa não identificada" + nome começando com "teste" ou "card teste" |
| Separação visual da lista | Render dividido em 2 seções: **Análises finalizadas** (destaque, paginadas — grupos com pelo menos 1 coleta `finished`) + **Em coleta** (header colapsável, default colapsada). Novo state `showDrafts`; derivados `finalizedGroups`, `draftGroups`, `visibleFinalized`, `hasMoreFinalized`, `totalDraftEntries` |
| Funil APEX | SVG triangular elaborado substituído por funil hairline-only: forma triangular preservada, gradiente único navy → verde, hairlines brancos como divisores, **números na legenda à direita** (não dentro do SVG). Header com título + 2 KPIs (Taxa aprov / Rating médio em DM Sans 22px). Footer com Em andamento/Condicionais/Reprovadas (sem emojis) |

**Tentativas rejeitadas (revertidas na mesma sessão):**

| Tentativa | Resultado |
|---|---|
| Variant B "Executivo" direto na page.tsx (hero gradient navy + funil pipeline horizontal) | "Achei muito ruim" — revertido |
| Rota nova `/historico-intent` (fila "Pra você agir" + "Arquivo" flat; critérios 3d/5d/14d/90d) | "Achei bem bosta" — rota deletada |

**Mockups guardados em `mockups/historico-redesign/`** (servir com `npx http-server -p 8787`):
- `funil.html` — 3 propostas profissionais (Apex/Cascade/Ledger; APEX vencedor)
- `intent.html` — modelo Pra agir + Arquivo (descartado)
- `variant-a/b/c.html` — 3 estéticas iniciais (Refinado/Executivo/Operacional)
- `index.html` — picker

**Lição (registrada em `feedback_redesign_visual_workflow.md`):** para qualquer redesign visual significativo, **mockup local primeiro**. Aplicar direto na page.tsx foi rejeitado 2× nesta sessão apesar de hot reload + type-check passando. Cirurgias de DADOS (filtro/separação/agrupamento) podem ir direto; cirurgias VISUAIS (cores/formas/tipografia/layout) NÃO.

**Outra entrega:** 28 skills do `https://github.com/ComposioHQ/awesome-claude-skills.git` instaladas em `~/.claude/skills/` (artifacts-builder, brand-guidelines, canvas-design, mcp-builder, skill-creator, theme-factory, webapp-testing, etc.). 3 subdirs do repo (`composio-skills`, `document-skills`, `connect-apps-plugin`) ficaram fora — são plugins, requerem `claude --plugin-dir`. Clone original em `C:\Users\Admin\Documents\awesome-claude-skills\` (preservado para `git pull` futuro).

**Trabalho na aba está pausado** ("vamos configurar essa aba depois"). Próxima retomada parte do estado atual (funil APEX + filtro junk + separação finalizadas/em coleta).

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
