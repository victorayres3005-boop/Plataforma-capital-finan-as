---
tags: [capital-financas, extracao, gemini, documentos]
---

# Pipeline de Extração — `/api/extract`

Como cada tipo de documento é processado e quais cuidados existem por tipo. Toda mudança no extrator deve ser testada com PDFs reais.

## Decisão de modo (texto vs visual)

```ts
// app/api/extract/route.ts ~3186
const VISUAL_ONLY_TYPES = ["contrato", "relatorio_visita"];
const hasUsefulText = rawPdfText.trim().length > 200 && /\d/.test(rawPdfText);

if (isImage)                                     → modo VISUAL (jpg/png direto ao Gemini)
else if (isPDF && VISUAL_ONLY_TYPES.includes(t)) → modo VISUAL (sempre)
else if (isPDF && hasUsefulText)                 → modo TEXTO (rápido — pdf-parse)
else if (isPDF)                                  → modo VISUAL (PDF escaneado, fallback)
```

`LARGE_TEXT_FALLBACK_VISUAL = ["faturamento"]` — texto >25k chars cai pra visual. **`curva_abc` NÃO está aqui** (modo visual retornava `clientes:[]`).

## Configuração de timeout (Hobby plan)

```
maxDuration                  = 60s
AI_TIMEOUT_52s               = 52000ms  (outer)
perAttempt binário           = 40000ms
perAttempt texto grande      = 20000ms
perAttempt texto pequeno     = 15000ms
Files API timeout            = 10000ms
MAX_ATTEMPTS binário         = 1
MAX_ATTEMPTS texto           = 2
```

## Modelos Gemini

Ordem de fallback: `gemini-2.5-flash` → `gemini-2.5-pro` → `gemini-2.5-flash-lite`. (Pro custa ~17x mais — Flash é primário desde 2026-04-24.)

`thinkingBudget` (otimizado em 2026-04-24):
- `protestos`, `qsa`, `grupoEconomico` → 0
- `scr`, `dre`, `balanco`, `processos` → 128
- analyze → 1024

## Por documento

### `cnpj` — Cartão CNPJ (Receita)
- Modo padrão: TEXTO. API BrasilAPI quando disponível (preferir).
- ⚠️ `data_abertura` pode vir `MM/YYYY` ou `YYYY` — não converter. Regex no analyze suporta 3 formatos.
- Fix histórico: prompt forçava DD/MM/AAAA → modelo inventava dia. Agora preserva como aparece.

### `qsa` — Quadro Societário
- Modo padrão: TEXTO.
- **QSA herda do Contrato Social** desde 2026-05-04: `cpfCnpj`, `qualificacao`, `participacao`, `capitalInvestido` — contrato sempre vence (`lib/mergeQsaWithContrato.ts`). Match fuzzy por nome. Badge "do contrato" na UI.
- Dedup robusto após bug histórico (commit `bdcb20a`).

### `contrato` / `relatorio_visita`
- Modo VISUAL sempre (em `VISUAL_ONLY_TYPES`).
- Razão: layout, assinaturas e cláusulas dependem de visão.
- `relatorio_visita`: schema Zod `.passthrough()`, valida sem bloquear (`zodWarnings` apenas).
- ⚠️ `tranche_checagem` é o campo principal. `tranche_limite_global` apenas com expressão explícita.
- `raw_response` salvo em `extraction_metrics` SEMPRE (mesmo com `filled > 0`) — diagnóstico.

### `dre`, `balanco`
- Modo padrão: TEXTO.
- `thinkingBudget = 128`.
- Indicadores (`alavancagem`, `liquidezCorrente`, `margemLiquida`, `endividamento`) calculados em **TypeScript** no analyze, sobrescrevem o que Gemini devolve. Determinismo > IA.

### `scr` (Bacen) — `scr_socio`, `scr_socio_anterior`, `scr`, `scrAnterior`
- Modo padrão: TEXTO.
- Prompt tem `{{TIPO_ESPERADO}}` — `"PF"` se slot é `scr_socio*`, senão `"PJ"`. Gemini não confunde credor com consultado.
- Extrai: `carteiraTotal`, `vencidos`, **`prejuizos`** (seção "Prejuízo (B)"), `classificacaoRisco`, `modalidades`.
- `prejuizos > 0` é eliminatório determinístico no analyze.
- **Curto/Longo prazo** computados em `mapearSCRData` somando buckets BCB:
  - Curto = `ate30d + d31_60 + d61_90 + d91_180 + d181_360`
  - Longo = `acima360d + indeterminado`
- **`_slotHint`** persistido para desempate quando Gemini falha em `periodoReferencia` (bug histórico de comparativo invertido).
- **DataBox360 substituiu upload manual** — preferir API, upload é fallback.
- SCR Total único via `lib/scrTotal.ts` → `calcScrTotal(scr) = carteira + vencidos + prejuízos`.

### `faturamento`
- Modo padrão: TEXTO.
- Texto grande (>25k chars) cai em VISUAL fallback (em `LARGE_TEXT_FALLBACK_VISUAL`).
- Geração de chart preserva FMM por ano + tabela mensal.
- Quando `v === 0` em uma barra → escreve `"s/fat."` italic cinza, não barra invisível.

### `curva_abc`
- Modo padrão: TEXTO sempre. **NUNCA visual.**
- Pipeline 4 camadas (ver runbooks#Curva ABC voltando vazia):
  1. `directParseCurvaABC()` regex (>15k chars, ≥5 clientes detectados → bypass Gemini)
  2. Gemini text mode (maxChars 60k, 45s timeout, 32k output tokens)
  3. Roteamento (sempre texto)
  4. `tryRecoverTruncatedJSON` para JSON cortado
- Diagnóstico: log `[curva_abc] {totalClientes, maiorClientePct, clientesRaw}` antes do return.

### `ir_socio`
- Modo padrão: VISUAL (preserva tabelas DIRPF).
- ⚠️ Formato GRUPO+CÓDIGO (DIRPF 2020+): mapear por **GRUPO** (2 dígitos), não código.
  - 01 → bensImoveis · 02 → bensVeiculos · 03-07 → aplicacoesFinanceiras · 08+ → outrosBens
- `bensEDireitos[]`, `dividasOnusReais[]`, `pagamentosEfetuados[]` preservados nos arrays detalhados (não só somados).
- Se `|totalDoc − somaCategorias| > 5%` → usa `Math.max()` + warning + alerta visual no PDF.
- PDF de teste: `18. IR TATIANE TATIANE 2024 GOLD FARM.pdf` (raiz).

### `protestos`
- Modo padrão: TEXTO.
- `thinkingBudget = 0`.
- Vem de upload OU Assertiva/CredHub (preferir bureau).
- Schema: `vigentes`, `regularizados`, `fiscais` (com qtd e valor) + `detalhes[]`.
- Seção 06 da Revisão (read-only, criada 2026-05-03).

### `processos`
- Modo padrão: TEXTO.
- `thinkingBudget = 128`.
- Detecção RJ: `temRecuperacaoJudicial ?? temRJ ?? distribuicao.tipo.includes("RECUPERA"&"JUDICIAL") ?? razaoSocial.includes("EM RECUPERACAO")`. **Eliminatório determinístico.**
- `passivos`, `ativos`, `valorTotalEstimado`, `bancarios[]`, `fiscais[]`, `fornecedores[]`, `outros[]`, `top10Valor[]`.
- Seção 07 da Revisão (read-only).

### `grupoEconomico`
- Modo padrão: TEXTO.
- Fonte primária: BDC com filtro `OWNERSHIP_KEYWORDS` (exclui Procurador, Contador, Representante Legal).
- `participacao` extraído de múltiplos campos BDC (`EquityShare`, `EquitySharePercent`).
- Agrupado por sócio (mini-header "Via sócio: [Nome]").
- Coluna SCR Total: DataBox360 cap 5 empresas. Auto-detecta sandbox (totais idênticos → "—").
- Seção 08 da Revisão (read-only).

## Validação Zod

Todos os tipos têm schema Zod em `lib/extract/schemas.ts`. Falhas acumulam em `zodWarnings` — não bloqueiam. Permite Gemini retornar campos extras (`.passthrough()`).

## extraction_metrics — diagnóstico

Tabela Supabase com `raw_response` e `input_chars` por extração. Salvar `raw_response` quando `filled === 0 || docType === "relatorio_visita"`.

⚠️ SQL pendente até 2026-04-23 (rodado depois):
```sql
ALTER TABLE extraction_metrics
  ADD COLUMN IF NOT EXISTS raw_response text,
  ADD COLUMN IF NOT EXISTS input_chars integer;
```

## Logs granulares (Vercel)

```
[extract] pdf-parse <type> <Xkb> → <Y chars> em <Zms>
[extract] <type>/<subformat> — modo TEXTO (<chars>, <ms>)
[Gemini] key=... model=... attempt=N/M payload=<size> timeout=<ms>
[Gemini] OK model=... <ms> <chars>
[Gemini] timeout key=... model=... após <ms>ms
[curva_abc] Direct parse: N clientes
[parseJSON] JSON truncado — recuperado parcialmente
```

Distinguem nos logs do Vercel: tempo pdf-parse vs upload Files API vs inferência.
