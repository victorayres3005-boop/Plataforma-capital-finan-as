---
tags: [capital-financas, supabase, banco, schema]
---

# Banco de dados — Supabase

Schema, tabelas, RLS e migrations. **Toda mudança schema-related vai aqui.**

## Migrations

Pasta: `capital-financas/supabase/migrations/` + arquivos `supabase-*.sql` na raiz do projeto (legado).

Migrations principais:
- `11_formalize_orphan_tables.sql`
- `12_audit_and_versions.sql`
- `14_company_snapshots.sql`
- `15_shared_reports.sql`
- `18_api_usage_logs.sql`
- `credithub_cache.sql`
- `supabase-fund-settings.sql`
- `supabase-onboarding.sql`
- `supabase-rating-feedback.sql`
- `supabase-processos-cache.sql`
- `supabase-notifications.sql`

## Tabelas — visão geral

### Centrais (fluxo do analista)

| Tabela | Conteúdo |
|---|---|
| `document_collections` | Coleta = uma análise. `extracted_data`, `documents[]`, `ai_analysis`, `fund_status`, `observacoes`, `status`, `finished_at` |
| `score_operacoes` | Score V2 do analista: `score_result` (agregado) + `respostas[]` (individual) |
| `pareceres` | Parecer final aprovado, vinculado a `collection_id` |
| `shared_reports` | HTML pré-renderizado (servido em `/r/[id]`). `MAX_HTML_BYTES = 5MB` |
| `politica_credito_config` | Política V2 viva por `user_id` (5 pilares + parâmetros). **Fonte única de verdade.** |
| `fund_settings` | Fallback de última instância para parâmetros. Coluna `exibir_conformidade boolean DEFAULT false`. |
| `operacoes` | Operações de crédito. Enum `modalidade` aceita `'recomprada'` (adicionado 2026-05-03). |

### Cache & métricas

| Tabela | Conteúdo |
|---|---|
| `bureau_cache` | Cache 24h SCR DataBox360 + CredHub. Chave `<bureau>:<doc>:<periodo>` |
| `api_usage_logs` | Custos: `bureau_calls` JSON, tokens Gemini, log_type. **RLS por user_id (corrigido 2026-05-03).** |
| `extraction_metrics` | Diagnóstico extração: `raw_response`, `input_chars`, `filled_fields` |
| `extraction_corrections` | Correções manuais do analista no ReviewStep (treino futuro) |
| `analysis_cache` | **PENDENTE migration** — hoje cache é in-memory 90min e perde no restart Vercel |

### Integração & onboarding

| Tabela | Conteúdo |
|---|---|
| `goalfy_pending_operations` | Fila de cards Goalfy via cron n8n. **RLS por user_id (corrigido 2026-05-03).** |
| `user_onboarding` | `welcome_seen`, `tooltips_seen`, `first_collection_done` |
| `notifications` | Notificações da plataforma para o usuário |
| `prompt_versions` | Versões do prompt para fine-tuning (start-finetuning) |
| `company_snapshots` | Snapshot de empresa. Coluna `alavancagem` existe mas trigger nunca preenche → sempre NULL (gap conhecido) |

### Auditoria

| Tabela | Conteúdo |
|---|---|
| `audit_log` | (migração 12) Auditoria de mudanças sensíveis |

## RLS — Row Level Security

**Padrão correto:** filtro por `user_id`. **NÃO usar `USING(true)`** (vaza dados entre usuários).

Tabelas com RLS confirmado:
- `goalfy_pending_operations` ✅ (corrigido 2026-05-03)
- `api_usage_logs` ✅ (corrigido 2026-05-03)
- `pareceres` — filtra por `user_id`
- `operacoes` — filtra por `user_id` no `eq("user_id", u.id)`
- `score_operacoes` — pelo `collection_id` que pertence ao user
- `document_collections` — `user_id` nas queries

Quando criar tabela nova com dados de cliente, sempre RLS por `user_id`.

## Padrão de query

```typescript
import { createClient } from "@/lib/supabase/client";  // cliente
import { createServerSupabase } from "@/lib/supabase/server";  // server-side com cookies

// Server (rotas API):
const supabase = await createServerSupabase();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

// Cliente (componentes):
const supabase = createClient();
const { data, error } = await supabase
  .from("document_collections")
  .select("...")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false });
```

⚠️ **No `middleware.ts` use `getSession()`** — `getUser()` causa 504 no Edge (ver runbooks#504 timeout no middleware).

## Storage / Blob

- **Vercel Blob** — arquivos > 4MB do upload (contrato social, IRs grandes). Requer `BLOB_READ_WRITE_TOKEN` (ver runbooks#Vercel Blob).
- **Supabase Storage** — não usado para upload de docs. Apenas se aparecer caso novo.

## SQLs prontos para copiar

### Adicionar `exibir_conformidade`
```sql
ALTER TABLE fund_settings
ADD COLUMN IF NOT EXISTS exibir_conformidade boolean DEFAULT false;
```

### Garantir RLS user_id
```sql
DROP POLICY IF EXISTS "<nome_old>" ON <tabela>;
CREATE POLICY "rls_user" ON <tabela>
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### Adicionar valor de enum
```sql
ALTER TABLE operacoes
DROP CONSTRAINT operacoes_modalidade_check;
ALTER TABLE operacoes
ADD CONSTRAINT operacoes_modalidade_check
CHECK (modalidade IN ('clean', 'comissaria', 'lastreada', 'recomprada'));
```

### extraction_metrics colunas (rodada em 2026-04-23)
```sql
ALTER TABLE extraction_metrics
  ADD COLUMN IF NOT EXISTS raw_response text,
  ADD COLUMN IF NOT EXISTS input_chars integer;
```

## Convenções

- Timestamp camelCase no app, snake_case no banco (ex: `createdAt` ↔ `created_at`)
- Nullable para tudo opcional — front trata
- JSON columns para estruturas variáveis (ex: `extracted_data`, `documents`, `score_result`, `respostas`)
- `id` UUID em tabelas novas

## Pendências de migration

1. **`analysis_cache`** — migrar cache analyze de in-memory pra Supabase. Reduz re-análises.
2. **`company_snapshots.alavancagem`** — trigger pra preencher (existe coluna mas sempre NULL).
3. **`extraction_corrections`** — trigger ou job pra alimentar fine-tuning (pendente do `start-finetuning`).
