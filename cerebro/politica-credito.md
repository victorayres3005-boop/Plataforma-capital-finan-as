> Hub: [[CAPITAL]]

# Política de Crédito V2 — fonte única de verdade

Desde 2026-04-29, a **política de crédito é a única fonte de verdade** para rating e avaliação. O Gemini sempre recebe a política completa no prompt.

## Dois sistemas que coexistem

| Sistema | Onde aparece | O que faz |
|---|---|---|
| **Elegibilidade binária** | `pageChecklist` (PDF pág 2) | 9 critérios pass/fail de `validarContraParametros()` |
| **Score V2 — 5 pilares** | `pageScoreV2` (PDF pág 11) | 0-100 ponderado, rating A-F, preenchido pelo analista |

## Os 5 pilares

Definidos em `lib/politica-credito/defaults.ts` → `DEFAULT_POLITICA_V2`:

| Pilar | Peso |
|---|---|
| `perfil_empresa` | 15% |
| `saude_financeira` | 15% |
| `risco_compliance` | 25% |
| `socios_governanca` | 10% |
| `estrutura_operacao` | 35% |

Cada pilar tem critérios com opções e modificadores. Todos com `status_calibracao: "calibrado"`.

## Faixas de rating (A-F)

```
A = 90-100  EXCELENTE
B = 80-89   BOM
C = 70-79   MODERADO
D = 60-69   FRACO
E = 50-59   RUIM
F = 0-49    CRÍTICO
```

⚠️ Bug histórico: IDs antigos eram `pilar_1`, `pilar_2`. Os corretos são `perfil_empresa`, `saude_financeira`, etc. Já corrigido em `buildScoreV2Block()`.

## Fluxo de carregamento (`/api/analyze/route.ts`)

```
1. loadPoliticaServidor(userId)
   ├─ tenta politica_credito_config no Supabase
   └─ fallback: DEFAULT_POLITICA_V2

2. parametros_elegibilidade da política sobrescreve FundSettings
   (FMM mínimo, alavancagem máxima, protestos, prazos, etc.)
   fund_settings = fallback de última instância

3. autoPreencherScore(data, politica)
   → server-side se body.scoreV2 não vier do frontend
   → Gemini SEMPRE recebe Score V2

4. buildPoliticaBlock(politica)
   → serializa pilares + critérios + opções + pontos + faixas + parâmetros
   → injeta no prompt do Gemini ANTES dos dados da empresa

5. Prompt simplificado:
   - Removido "SE NÃO há Score V2... estime"
   - Removidos caps por nível de cobertura (PRELIMINAR: máx 7.5)
   - ratingConfianca reflete cobertura, mas NÃO altera score
```

## Tipos: `ScoreResult` vs `RespostaCriterio`

Salvos em `score_operacoes`:

```typescript
// score_result — agregado por pilar
interface ScoreResult {
  pontos_brutos: Record<string, number>       // { perfil_empresa: 16.5, ... }
  pontuacao_ponderada: Record<string, number> // { perfil_empresa: 2.5, ... }
  score_final: number                          // 0-100
  rating: "A"|"B"|"C"|"D"|"E"|"F"
  pilares_pendentes: string[]
  confianca_score: "alta"|"parcial"|"baixa"
}

// respostas[] — resposta individual por critério
interface RespostaCriterio {
  criterio_id: string         // "alavancagem"
  pilar_id: string            // "saude_financeira"
  opcao_label: string         // "Alta — 3,5x a 5x FMM"
  pontos_base: number
  modificador_label?: string
  modificador_multiplicador?: number
  pontos_final: number
}
```

GenerateStep busca ambos:
```typescript
.select("score_result, respostas")
.eq("collection_id", collectionId)
.order("preenchido_em", { ascending: false })
.limit(1)
```

## Estado em CALIBRAÇÃO — rating escondido no PDF/HTML

Toggle `HIDE_AVALIACAO = true` em **3 arquivos**:
- `lib/pdf/template.ts`
- `lib/generators/pdf/sections/parecer.ts`
- `lib/generators/pdf/sections/sintese.ts`

**Esconde:**
- Capa: hero score V2 + decisão + opinião IA → banner "Avaliação em calibração"
- Síntese pág 3: círculo 0-10 + badge → banner cinza
- Recomendação APROVADO/REPROVADO em "Percepção do Analista" → removida
- Página Score V2 pág 11: cabeçalho rating → renomeada "Análise por Pilares — Conformidade"

**Mantém visível:**
- Indicadores financeiros (FMM, alavancagem, faturamento, DRE, balanço)
- Alertas categorizados (alta/moderada/info)
- Curva ABC, SCR, processos, protestos
- Parecer textual (resumo, fortes/fracos, perguntas visita)
- 5 pilares pontuados (sem o veredito final)
- **Tela do app** (`GenerateStep.tsx`) sempre mostra rating

**Razão:** mostrar rating não calibrado pode induzir decisão errada do comitê. Para reativar, trocar `HIDE_AVALIACAO = false` nos 3 arquivos + redeploy.

## Pendente

Restante da política calibrada chega na semana de 2026-05-05 (Victor). Quando chegar: ajustar critérios/pesos/parâmetros **no banco** (`politica_credito_config`). Código já é dinâmico, não precisa mudar.

## Página de Conformidade — não é elegibilidade

Toggle `exibir_conformidade` em Configurações (default `false`). Coluna no banco. Quando ligado, mostra seção dedicada de "conformidade documental" que NÃO é o checklist binário de elegibilidade.

## Items V2 implementados

- Item 2: Badge V2 (círculo colorido) na Decisão (`parecer/page.tsx`)
- Item 3: Badge V2 (quadrado 20×20) no Histórico (`historico/page.tsx`)
- Item 4: Warning amarelo "score calculado com política X, vigente é Y" em `ScoreSection.tsx`
- Item 5: Botão CSV export em `pareceres/page.tsx` (com BOM UTF-8)
- Item 6: `validarContraParametros()` (já existia)
