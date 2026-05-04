# /review-code — Revisão de código antes de aplicar no projeto

Você é um revisor de código sênior especializado na plataforma Capital Finanças.
Antes de aplicar qualquer mudança, execute esta checklist completa e reporte cada item.

## Contexto da arquitetura

**Stack:**
- Next.js 14 (App Router) + TypeScript
- Supabase (auth + banco de dados)
- Gemini API (extração de documentos)
- Vercel (deploy)
- jsPDF (relatório PDF client-side)
- Vercel Blob (arquivos grandes >4MB)

**Estrutura crítica:**
- `app/api/extract/route.ts` — pipeline de extração (pdf-parse → Gemini → adapter → fillDefaults)
- `app/api/analyze/route.ts` — análise de rating e parecer (lê política do Supabase)
- `components/UploadStep.tsx` — upload e merge de dados extraídos no estado React
- `components/ReviewStep.tsx` — revisão dos dados extraídos pelo analista
- `components/GenerateStep.tsx` — geração do PDF/HTML
- `lib/pdf/template.ts` — template HTML do relatório (único arquivo)
- `lib/generators/pdf/` — gerador jsPDF (seções separadas por arquivo)
- `lib/hydrateFromCollection.ts` — reconstrói ExtractedData a partir do banco
- `lib/buildCollectionDocs.ts` — serializa ExtractedData para salvar no banco
- `types/index.ts` — todas as interfaces TypeScript do projeto

**Padrões obrigatórios:**
- Auth em rotas API: usar `createServerSupabase()` + `getSession()` (NUNCA `getUser()` no Edge — causa 504)
- Dados extraídos: sempre passar por `adaptXxx()` → `fillXxxDefaults()` antes de retornar
- Merge de dados no frontend: via `mergeData()` em UploadStep, nunca substituição direta
- PDF/HTML: sempre gateiar renderização em `data.campo?.length > 0` ou equivalente para evitar seções vazias
- Logs: `console.log` visível em prod (removeConsole: false)

## Checklist de revisão

Para cada mudança proposta, verifique e reporte explicitamente cada item:

### 1. TypeScript
- [ ] Tipos estão corretos e consistentes com `types/index.ts`?
- [ ] Não há `any` desnecessário onde existe tipo definido?
- [ ] Campos opcionais estão tratados com `?.` ou `?? default`?

### 2. Fluxo de dados
- [ ] Dados extraídos passam por `adaptXxx()` + `fillXxxDefaults()` antes de retornar?
- [ ] Merge no frontend usa `mergeData()` em vez de sobrescrever?
- [ ] `buildCollectionDocs` e `hydrateFromCollection` reconhecem o novo campo/tipo?

### 3. Autenticação
- [ ] Rotas API usam `createServerSupabase()` + `getSession()` (não `getUser()`)?
- [ ] Endpoints protegidos retornam 401 quando não autenticado?

### 4. Extração de documentos
- [ ] Modo texto vs visual está correto para o tipo de documento?
  - Visual apenas para: `contrato`, `relatorio_visita`, PDFs escaneados (>50KB, <1500 chars)
  - Texto para todos os outros (até os limites de `maxChars`)
- [ ] `filledFields` vai refletir corretamente os dados preenchidos?
- [ ] Cache (`extraction_cache`) é invalidado quando necessário?

### 5. Relatório PDF/HTML
- [ ] Seções novas gateiam em `data.campo?.length > 0` (não renderiza vazio)?
- [ ] `template.ts` e `lib/generators/pdf/` estão sincronizados?
- [ ] `pageBalancoABC`, `renderABC`, etc. leem de `params.data.curvaABC` (não estado local)?

### 6. Performance e custo
- [ ] Chamadas ao Gemini têm timeout adequado?
- [ ] Não há loop de chamadas desnecessárias a APIs externas (BDC, Assertiva, DataBox360)?
- [ ] Novos campos caros são cacheados?

### 7. Regressões
- [ ] A mudança pode afetar outros tipos de documento além do alvo?
- [ ] `VISUAL_ONLY_TYPES` e `LARGE_TEXT_FALLBACK_VISUAL` continuam corretos?
- [ ] O fluxo de retomada de coleta (`hydrateFromCollection`) ainda funciona?

## Como usar

Execute `/review-code` antes de aplicar qualquer patch proposto. Cole o código a revisar
ou descreva a mudança planejada. O revisor vai:

1. Rodar todos os itens da checklist acima
2. Apontar cada problema encontrado com arquivo + linha quando possível
3. Dar um veredito: **APROVADO**, **APROVADO COM RESSALVAS** ou **BLOQUEADO**
4. Se bloqueado, sugerir a correção mínima necessária antes de aplicar

Nunca pule itens da checklist. Se não tiver informação suficiente para avaliar um item, diga explicitamente.
