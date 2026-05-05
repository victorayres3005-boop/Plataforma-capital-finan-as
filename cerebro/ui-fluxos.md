---
tags: [capital-financas, ui, fluxos, frontend]
---

> Hub: [[CAPITAL]]


# Fluxos UI — telas e estados

Fluxos do analista pela plataforma. Onde cada estado vive, qual o invariante e os bugs históricos.

## Fluxo principal — `/collection`

```
UploadStep → ReviewStep → ScoreForm → GenerateStep
```

### `UploadStep` (`components/UploadStep.tsx`)

Upload de até 16 tipos de documento. Cada seção tem progresso (`pct`), aceita `drop+drag`, `<input file>`, ou pre-fill via Goalfy.

**Pre-fill Goalfy:** se URL tem `?highlight=tipos`, seções identificadas ganham:
- borda azul + badge "Identificado no Goalfy"
- Auto-scroll pra primeira seção destacada (600ms delay)
- Banner no topo quando `highlightedSet.size > 0`
- Mapping em `GOALFY_TYPE_TO_KEY`

**Cuidados:**
- Arquivos < 4MB → FormData direto
- Arquivos > 4MB → `/api/upload-blob` (Vercel Blob)
- `confirmedDocsRef` em `app/page.tsx` evita auto-save UPDATE descartar tipos com extração vazia (bug 2026-05-03 corrigido)

### `ReviewStep` — 8 seções numeradas

| Nº | Seção | Componente |
|---|---|---|
| 01 | Cartão CNPJ | `SectionCNPJ` |
| 02 | QSA + Contrato | `SectionQSA` (fuzzy merge contrato↔QSA) + `SectionContrato` |
| 03 | Faturamento | `SectionFaturamento` |
| 04 | DRE / Balanço | `SectionFinanceiro` |
| 05 | SCR + IR Sócios | `SectionSCR`, `SectionIR` |
| 05b | Relatório de Visita | `SectionRelatorioVisita` |
| 06 | **Protestos** (read-only) | `SectionProtestos` (criado 2026-05-03) |
| 07 | **Processos** (read-only) | `SectionProcessos` (criado 2026-05-03) |
| 08 | **Grupo Econômico** (read-only) | `SectionGrupoEconomico` (criado 2026-05-03) |

Estados em `ReviewStep.tsx`:
```ts
const [open, setOpen] = useState({
  cnpj: true, qsa: false, faturamento: false, financeiro: false,
  scr: false, ir: false, visita: false,
  protestos: false, processos: false, grupoEconomico: false,
});
```

### `ScoreForm` — política V2

Analista preenche os 5 pilares com critérios e modificadores. Salva em `score_operacoes`:
- `score_result` (agregado)
- `respostas[]` (individual)

**Não auto-preenche** em `/parecer` (decisão Victor 2026-05-04): TAC, garantias, concentração ficam vazios → evita viés de concordância com IA.

### Cross-doc auto-fill na Review (2026-05-05)

| Campo | Origem | Quando dispara | UI |
|---|---|---|---|
| `qsa.quadroSocietario[*].{cpfCnpj,qualificacao,participacao,capitalInvestido}` | Contrato Social (fuzzy match por nome) | Sempre que QSA + Contrato existem | Badge azul **"do contrato"** ao lado dos campos herdados (`SectionQSA.tsx`, `mergeQsaWithContrato.ts`) |
| `contrato.dataConstituicao` | `cnpj.dataAbertura` | Quando contrato veio sem essa data e o cartão CNPJ tem | Badge azul **"do cartão CNPJ"** no Field (`SectionContrato.tsx`, ref `lastAutoFilledRef` em `ReviewStep.tsx` evita repreenchimento se o usuário apagar) |

Padrão geral: **não sobrescrever dado próprio do documento**, **registrar herança visualmente**, **preservar autonomia do analista** (badge some quando o usuário edita).

### `GenerateStep` (`components/GenerateStep.tsx`)

⚠️ **Monolito** — 2810 linhas. Tem 3 fluxos:
- Exportar PDF (POST `/api/generate-pdf`)
- Visualizar HTML (chama `generateHTMLPreview()` local + `window.open()` Blob URL)
- Compartilhar Link (POST `/api/share-report`)

Os 3 chamam `gerarHtmlRelatorio()` em `lib/pdf/template.ts`. Mesmo template.

Busca Score V2 em `score_operacoes`:
```ts
.select("score_result, respostas")
.eq("collection_id", collectionId)
.order("preenchido_em", { ascending: false }).limit(1)
```

**Convenções pós-2026-05-04:**
- Barras de ação são **inline** (`position: static`), rolam com conteúdo. NÃO voltar a `position: fixed`.
- Fade puro 200ms em transições. `animate-fade-in` (não `slide-up` ou `scale-in`).
- `transform: translateZ(0)` em `PageContent` cria containing block para barras `position:fixed` filhas.

## Telas auxiliares

### `/historico`

Lista de coletas. Busca + paginação adicionados em 2026-05-04. Filtros NÃO persistem em localStorage (gap de UX identificado).

Badge V2 (quadrado 20×20) carrega bulk de `score_operacoes`.

### `/pareceres`

Lista de pareceres. Busca + paginação. Botão CSV export (BOM UTF-8).

### `/parecer/[id]`

Redirect amigável para coleta. Padrão: TAC, garantias, concentração ficam vazios; outros campos (limites, taxas, prazos) seguem com auto-preench.

Badge V2 (círculo colorido) na Decisão.

### `/custos`

`BureauPrices` × `BureauCalls` × tokens Gemini. localStorage `capital_bureau_prices` com merge em `DEFAULT_PRICES`.

**Padrão defensivo (após crash 2026-04-26):**
- `safeNum()` antes de `toFixed`/`toLocaleString`
- localStorage só aceita `typeof === "number" && isFinite`
- `analysisRows` guard `if (!ref) return`

### `/configuracoes`

Tabs:
- **Operacional** — `OperacionalTab`. Toggle `exibir_conformidade` (default `false`).
- **Política V2** — `PoliticaCreditoTab` (formulários internos, sem validação inline ainda).

### `/importar-goalfy`

Lista de `goalfy_pending_operations`. Botão importar baixa S3 + sobe Blob + cria coletas. Link para coleção criada com `?highlight=tipos` (vide UploadStep).

### `/admin` (DevBanner)

Bypass de banner "em desenvolvimento". `app/admin/layout.tsx`.

### `/v2` (DevBanner)

Páginas em desenvolvimento. Não substituir formatadores locais aqui.

## Componentes globais

### `Logo` (`components/Logo.tsx`)
Sempre navega Visão Geral, em qualquer breakpoint. Botão "<" no rodapé colapsa/expande sidebar.

### `CommandPalette` (Ctrl+K)
Adicionado 2026-05-04. Atalho global de navegação.

### `ThemeToggle`
Dark mode lite — toggle flutuante + `tailwind class`. Sidebar/Topbar têm inline styles hardcoded; falta overhaul dedicado.

### `Breadcrumb` (`components/ui/breadcrumb.tsx`)
Aplicado em /parecer, /perfil, /configuracoes, /custos, /metricas. Pode ser estendido a mais rotas.

### `WelcomeModal` + `useOnboarding`
Bug histórico: `markWelcomeSeen()` atualizava Supabase ANTES do estado local → modal travava. **Padrão correto: atualização otimista** (estado local primeiro, Supabase em background).

## Convenções visuais

- **Altura padrão de células de ação em tabelas: 26px**, `box-sizing: border-box`
- **Cores principais:** navy `#163269` + verde `#84BF41` + DM Sans
- **Fade puro 200ms** é o padrão único de transição (F5, navegação SPA, modais). `slide-up` só sobrevive no drawer mobile lateral e no `RouteProgress`.

## Gaps de UX conhecidos

- Mobile: sidebar drawer OK, mas Upload/Revisão/Parecer inutilizáveis em celular
- 717 inline styles em `parecer/page.tsx` quebram design system
- `OnboardingTooltip` órfão (existe mas não é usado)
- 55 `console.log` em `extract/route.ts` vazando em prod (mas removeConsole=false propositalmente — diagnóstico ganha mais)
- `GenerateStep`, `parecer/page.tsx`, `extract/route.ts` são monolitos grandes — refator pendente

## CustomEvents

- `cf:go-to-dashboard` — disparado pelo LayoutShell quando usuário clica "Visão Geral" estando em `/` com `showDashboard=false`. `app/page.tsx` escuta e reseta state local. **Não trocar por router.refresh()** — não funciona.
