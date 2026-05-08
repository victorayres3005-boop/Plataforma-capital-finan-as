> Hub: [[CAPITAL]]

# Relatório PDF/HTML

Como o relatório é gerado, qual arquivo editar, e a estrutura das 12 páginas.

## REGRA #1: Editar APENAS `lib/pdf/template.ts`

**Em produção, sempre cai no Puppeteer + template.ts.** O `lib/generators/pdf/sections/*.ts` (jsPDF) é fallback **local** que nunca é o que Victor vê. Espelhar mudanças nele é desperdício, exceto:

- `parecer.ts` e `sintese.ts` precisam acompanhar `HIDE_AVALIACAO` (ver [[politica-credito#estado-em-calibração|politica-credito.md]]).

→ Skill auxiliar: `capital-pdf-report` (design system, helpers, invariantes).

## Cadeia de fallback do botão "Exportar PDF"

```
1. POST /api/generate-pdf       ← PRIMÁRIO (Puppeteer)
     ├─ local: puppeteer completo
     └─ Vercel: @sparticuz/chromium-min + puppeteer-core
2. POST /api/exportar-pdf       ← LEGADO (requer CHROMIUM_URL)
     └─ também chama gerarHtmlRelatorio() — mesmo template
3. buildPDFReport() local       ← jsPDF, último recurso
     └─ NUNCA é o que Victor vê em prod
```

## Relatório compartilhado `/r/[id]`

```
Compartilhar:
  GenerateStep → POST /api/share-report
    ├─ chama gerarHtmlRelatorio() (mesmo template)
    └─ salva HTML completo em shared_reports.html

Acesso:
  GET /r/abc12345 (Route Handler, sem React)
    ├─ busca shared_reports.html
    └─ serve string como Response (Content-Type: text/html)
```

⚠️ HTML é **pré-renderizado e congelado** no momento do compartilhamento. Mudanças no template não retroagem em links já criados.

## Preview HTML (botão "Visualizar")

`generateHTMLPreview(params)` em `lib/generators/pdf.ts` chama `gerarHtmlRelatorio()` localmente, sem API. GenerateStep abre em nova aba via `window.open()` + Blob URL.

## Estrutura de 12 páginas

Cada `pageXxx()` em `template.ts` retorna `string` (HTML do conteúdo da página). `page(content, num, date)` envolve em header navy + footer cinza.

| Pg | Função | Conteúdo |
|---|---|---|
| 1 | `pageCapa` | Capa navy: logo, score V2 hero, rating badge, código verificação |
| 2 | `pageChecklist` | 16 docs, KPIs cobertura, bureaus, Serasa, Conformidade elegibilidade |
| 3 | `pageSintese` | empresa+rating, info, segmento, mapa, **mini-bloco SCR + endividamento sócios**, sócios+IR, risco, faturamento, **Curva ABC fundida com Sacados+Bureau+Vínculos**, **pleito (cedente \| comitê)**, **Sugestão Analista**, **Análise Contábil**, **resumo GEFIP**, fortes/fracos/alertas, percepção |
| 4 | `pageParecer` | Resumo, pontos fortes/fracos, perguntas visita, observações |
| 5 | `pageParametros` | Taxas/limites, Limite Crédito Calculado |
| 6 | `pageFaturamento` | KPIs (FMM/total/tendência), gráfico barras, FMM por ano, tabela mensal |
| 7 | `pageProtestosProcessos` | Protestos, Processos, CCF, **Dívida Ativa**, **CENPROT (com cross-validation com bureau)** |
| 8 | `pageSCRDRE` | SCR comparativo, Modalidades, SCR Sócios PF, DRE |
| 9 | `pageBalancoABC` | Balanço + indicadores, Curva ABC top-10, **cards detalhados de Sacados (com vínculos)**, **GEFIP completo (tabela mensal)** |
| 10 | `pageIRVisita` | IR sócios, Histórico consultas, Relatório visita, Referências |
| 11 | `pageScoreV2` | Score V2 (só se `params.scoreV2` não-null) |
| 12 | `pageParecer` (final) | Parecer final IA |

## Seções novas (2026-05-08)

**Síntese pág 3:**
- Mini-bloco "Endividamento — SCR Bacen" entre o mapa e o QSA. KPIs c4 da empresa + tabela compacta sócios PF. Visão executiva — detalhe completo na pág 8.
- Tabela única "Curva ABC — Top 5 + Bureau + Partes Relacionadas" (fundiu a tabela antiga "Curva ABC Top 5" com a "Sacados — Bureau"). Itera sobre `curvaABC.clientes.slice(0,5)` + lookup em `sacadosAnalisados` por CNPJ canonicalizado. Sacados PF mostram "PF" no Score. Banner ALTA quando há vínculos.
- "Sugestão do Analista" (caixa amber) abaixo do Pleito — texto livre lido no comitê.
- "Análise Contábil — Vanessa" (caixa azul-claro) abaixo da Sugestão.
- Resumo GEFIP (KPIs c4) abaixo da Análise Contábil.

**Pág 7 (Protestos/Processos):**
- Dívida Ativa após CCF: banner ALTA + tabela completa (origem/inscrição/valor/situação/data/natureza). Certidão negativa → banner verde.
- CENPROT após Dívida Ativa: cross-validation com bureau (banner amber MOD quando `cenprot.qtdRegistros !== protestos.vigentesQtd`) + tabela (cartório/cidade/data/valor/cedente).

**Pág 9 (BalançoABC):**
- Cards detalhados de Sacados (5 cards com KPIs, chip 🚩 vermelho quando `temVinculo`, listagem expandida de quem-bate-com-quem).
- GEFIP completo: banner + KPIs c4 (período, funcionários, totais FGTS/INSS) + tabela competência a competência com linhas vermelhas em atrasos.

## Pleito — Cedente vs. Comitê *(2026-05-08)*

Bloco "Pleito" na pageSintese é grid 1fr|1fr com **dois quadros** lado a lado:

**Pleito Cedente** (esquerda, read-only) — 15 linhas em tabela `.tbl` lendo de `data.relatorioVisita`. Vazio renderiza como `—` em cinza claro.

**Pleito Comitê** (direita, editável no HTML) — 15 `<input class="pc-input" data-pc-key="...">` com mesmas labels. Inputs ficam editáveis no `/r/{id}` (HTML público); apenas leitura quando o relatório é apenas previewed em outro contexto.

**Whitelist dos 15 keys** (canônicos em `data-pc-key`):
`limiteTotal, tranche, limiteConvencional, limiteComissaria, limitePorSacado, limitePrincipaisSacados, taxaConvencional, taxaComissaria, valorCobrancaBoleto, prazoMaximoOp, cobrancaTAC, prazoRecompraCedente, prazoEnvioCartorio, trancheChecagem, prazoTranche`

**Persistência:**
- Autosave debounced 800ms (script no rodapé do template) → `PATCH /api/r/{id}/pleito-comite` → coluna `shared_reports.pleito_comite JSONB`
- Read-back: `app/r/[id]/route.ts` chama `injectPleitoComite()` que substitui `value=""` pelo valor salvo via regex em inputs com `data-pc-key`
- Cache: `Cache-Control: no-store` quando há pleito preenchido (pra recargas refletirem edições); cache normal de 1h quando vazio

**Edição é livre** (sem token). Distinto da edição inline de fortes/fracos/alertas que exige `?k=edit_token`.

**Print/PDF:** CSS `@media print { .pc-input { border:none; background:transparent } }` faz inputs aparecerem como texto plano. Antes de gerar PDF, FAB sincroniza `setAttribute('value', el.value)` em todos `.pc-input` — sem isso `outerHTML` serializa o atributo `value=""` original (não o que o usuário digitou).

**Rotas relacionadas:**
- `PATCH /api/r/{id}/pleito-comite` — autosave (público)
- `POST /api/r/{id}/pdf` — gera PDF do relatório atual (público, valida id em shared_reports). Necessário pois `/api/exportar-pdf-html` exige auth Supabase e comitê externo precisa baixar.

## `pageScoreV2` — detalhamento

Aparece apenas se `params.scoreV2` (ScoreResult) for não-null:

1. **Hero rating**: círculo 84px com score/100, badge "Rating X — EXCELENTE/..."
2. **Tabela 5 pilares**: peso, pontos brutos, contribuição ponderada, barra de aproveitamento
3. **Score final destacado** + indicador de confiança + alerta de pilares pendentes
4. **Critérios avaliados por pilar** (se `scoreV2Respostas` não vazio): cabeçalho com peso + lista de critérios respondidos com modificador e pontos finais coloridos

## `PDFReportParams` — campos V2

```typescript
scoreV2?: ScoreResult                  // resultado calculado
scoreV2Respostas?: RespostaCriterio[]  // respostas individuais do analista
```

GenerateStep busca os dois em `score_operacoes` (ver [[politica-credito|politica-credito.md]]).

## Estrutura da função `page()`

```html
<div class="page">
  <div class="hdr">  <!-- navy, logo branca via filter:invert(1), data + badge pg verde -->
  <div class="ct">   <!-- padding 28/32/32px -->
  <div class="ftr">  <!-- cinza claro, logo opacity:0.5, texto central, pg direita -->
</div>
```

`LOGO_B64` — constante topo de `template.ts`. **Sempre** referenciar `${LOGO_B64}`, nunca inline.

## Invariantes do relatório

- **Sem dados duplicados** entre páginas
- **Quebras de página** explícitas (não confiar em CSS auto)
- **Sanitização** de strings interpoladas (escape de HTML em valores vindos do banco)
- **Omitir se não tiver dado** — todas as seções são condicionais (sem placeholder "—")
- **HIDE_AVALIACAO** consistente entre `template.ts`, `parecer.ts`, `sintese.ts`

## Comandos

```bash
npx tsc --noEmit       # type-check antes de deploy
npx vercel --prod      # deploy
```

## Diagnóstico

- "Funciona local mas não no Vercel" → checar `CHROMIUM_URL` no dashboard
- "PDF gerado mas faltando seção" → verificar condicional de dado (`if (data?.x)` antes de renderizar)
- "Link compartilhado mostrando versão antiga" → expected, é congelado; gerar link novo
