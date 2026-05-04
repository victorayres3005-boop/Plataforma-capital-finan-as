# Capital Finanças — Instruções para Claude

## Regra de ouro: revisar antes de aplicar

Antes de escrever ou editar qualquer arquivo de código, execute mentalmente a checklist abaixo.
Nunca aplique uma mudança que falhe em qualquer item sem avisar Victor explicitamente.

---

## Checklist obrigatória (pré-edição)

### 1. TypeScript
- Tipos batem com `types/index.ts`?
- Campos opcionais tratados com `?.` ou `?? default`?
- Sem `any` onde existe tipo definido?

### 2. Fluxo de dados de extração
- Dados extraídos passam por `adaptXxx()` → `fillXxxDefaults()` antes de retornar?
- Merge no frontend usa `mergeData()` (não sobrescreve direto)?
- `buildCollectionDocs` e `hydrateFromCollection` reconhecem campo/tipo novo?

### 3. Autenticação
- Rotas API usam `createServerSupabase()` + `getSession()` (NUNCA `getUser()` no Edge — causa 504)?
- Endpoints protegidos retornam 401 sem sessão?

### 4. Extração de documentos
- Modo texto/visual correto?
  - Visual apenas: `contrato`, `relatorio_visita`, PDFs escaneados (>50KB + <1500 chars)
  - `curva_abc` vai para texto (até 60k chars) — NUNCA colocar em `LARGE_TEXT_FALLBACK_VISUAL`
- `filledFields` vai contar corretamente (strings não-vazias + arrays com length > 0 + booleans)?

### 5. Relatório PDF/HTML
- Seções novas gateiam em `data.campo?.length > 0` (não renderiza vazio)?
- `template.ts` e `lib/generators/pdf/` sincronizados?
- Renderização lê de `params.data` (não de estado local)?

### 6. Regressões
- Mudança pode afetar outros tipos de documento?
- Fluxo de retomada de coleta (`hydrateFromCollection`) ainda funciona?
- `VISUAL_ONLY_TYPES` e `LARGE_TEXT_FALLBACK_VISUAL` continuam corretos?

---

## Arquitetura do projeto

**Stack:** Next.js 14 (App Router) + TypeScript + Supabase + Gemini API + Vercel

**Arquivos críticos:**
| Arquivo | Responsabilidade |
|---|---|
| `app/api/extract/route.ts` | Pipeline: pdf-parse → Gemini → adapter → fillDefaults |
| `app/api/analyze/route.ts` | Rating + parecer (lê política do Supabase) |
| `components/UploadStep.tsx` | Upload + merge de dados no estado React |
| `components/ReviewStep.tsx` | Revisão pelo analista |
| `components/GenerateStep.tsx` | Geração PDF/HTML |
| `lib/pdf/template.ts` | Template HTML do relatório (arquivo único) |
| `lib/generators/pdf/` | Gerador jsPDF (seções separadas) |
| `lib/hydrateFromCollection.ts` | Reconstrói ExtractedData do banco |
| `lib/buildCollectionDocs.ts` | Serializa ExtractedData para o banco |
| `types/index.ts` | Todas as interfaces TypeScript |

**Padrões obrigatórios:**
- Auth Edge: `getSession()`, nunca `getUser()`
- Extração: sempre `adaptXxx()` + `fillXxxDefaults()`
- Frontend merge: sempre `mergeData()` em UploadStep
- PDF/HTML: sempre gate em `campo?.length > 0`
- Logs: `removeConsole: false` — logs visíveis em produção

**Bureaus externos:** BDC, Assertiva, DataBox360 SCR — todos com cache e circuit breaker.
Sem fallback para OpenRouter/Groq (Victor não quer).

---

## Interpretação de pedidos do Victor

### Quando o pedido for vago, pergunte antes de agir

Se a mensagem não tiver contexto técnico suficiente para agir com segurança, faça **no máximo 3 perguntas objetivas** antes de qualquer código. Nunca invente contexto que não foi fornecido.

**Perguntas padrão para bugs/erros:**
1. Qual é o comportamento atual vs. o esperado?
2. Em qual tela, documento ou endpoint acontece?
3. Tem log do Vercel ou print do console?

**Perguntas padrão para novas funcionalidades:**
1. Onde aparece na interface (aba, seção, modal)?
2. De onde vêm os dados (extração, API externa, banco)?
3. Precisa aparecer no relatório PDF/HTML também?

**Perguntas padrão para melhorias/ajustes:**
1. O que está errado no comportamento atual?
2. Tem um exemplo de como deveria ficar?

### Quando agir direto, sem perguntar

- Pedido tem arquivo + linha + comportamento esperado descritos
- Usuário colou logs do Vercel ou console
- Pedido é simples e inequívoco ("faça deploy", "remova esse campo", "corrija esse typo")
- Contexto já foi estabelecido na conversa atual

### Vocabulário do Victor

| Quando Victor diz | Significa |
|---|---|
| "não está transmitindo" | dado extraído não aparece na revisão ou relatório |
| "está quebrando" | erro 500, tela branca ou dado vazio inesperado |
| "não aparece no relatório" | PDF ou HTML não renderiza a seção |
| "está dando erro" | pode ser silencioso — pedir logs antes de agir |
| "melhoria" | mudança de comportamento, não bug |
| "cirurgia" | mudança pontual e cirúrgica, sem refatoração ao redor |

---

## Como reportar antes de aplicar

Se encontrar problema na checklist, informe:
1. Qual item falhou
2. Por que falha
3. Correção mínima necessária

Só então aplique — nunca em silêncio.
