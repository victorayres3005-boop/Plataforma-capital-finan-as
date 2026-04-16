# Supabase Migrations

Ordem canônica de execução. Todas as migrations novas usam `IF NOT EXISTS` e
`DROP POLICY IF EXISTS` — são idempotentes e seguras para rodar várias vezes.

## Como aplicar

**Opção 1 — SQL Editor do Supabase (recomendado para ambiente único):**
1. Abra o painel do Supabase → SQL Editor
2. Copie o conteúdo de cada arquivo `.sql` na ordem numérica
3. Execute um por vez e confira se não há erro
4. Na ordem: 11 → 12 → 13 → 14

**Opção 2 — Supabase CLI (para múltiplos ambientes):**
```bash
supabase db push
```

## Ordem de execução

| # | Arquivo | O que faz | Reversível? |
|---|---|---|---|
| 01-10 | (antigas) | `document_collections`, `rating_feedback`, `fund_settings`, etc. | — |
| 11 | `11_formalize_orphan_tables.sql` | Cria `extraction_metrics`, `extraction_cache`, `operacoes`, `fund_presets` com `IF NOT EXISTS`. **Seguro em prod** — é no-op se já existirem. | Sim (DROP TABLE) |
| 12 | `12_audit_and_versions.sql` | Cria `audit_log`, `analysis_versions` + função `fn_register_analysis_version()` + trigger `trig_audit_collection_changes`. Não mexe em dados existentes. | Sim (DROP TABLE + DROP TRIGGER) |
| 13 | `13_denormalize_ai_analysis.sql` | Adiciona 8 colunas em `document_collections` (rating_confianca, nivel_analise, resumo_executivo, …) + trigger `trig_sync_ai_analysis_columns`. Trigger só popula em UPDATE/INSERT — registros antigos ficam NULL até serem editados. | Parcial |
| 14 | `14_company_snapshots.sql` | Cria `company_snapshots` + trigger `trig_company_snapshot`. Popula automaticamente quando uma coleta passa para `finished`. | Sim |

## Back-fill retroativo (opcional, só depois da 13)

Depois que a Migration 13 estiver aplicada e o deploy novo estiver em produção,
força o re-sync das colunas novas para registros existentes:

```sql
-- ATENÇÃO: faz UPDATE em massa. Em produção, rodar em batches:
UPDATE document_collections
   SET ai_analysis = ai_analysis   -- trigger fn_sync_ai_analysis_columns roda
 WHERE ai_analysis IS NOT NULL
   AND (rating_confianca IS NULL OR nivel_analise IS NULL)
   AND id IN (
     SELECT id FROM document_collections
      WHERE ai_analysis IS NOT NULL
      LIMIT 100
   );
-- Repetir até não atualizar mais nenhuma linha.
```

## Validação pós-migration

```sql
-- Confirma que as colunas novas existem
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'document_collections'
   AND column_name IN ('rating_confianca','nivel_analise','alertas_alta_count','pdf_url');

-- Confirma que os triggers estão ativos
SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
 WHERE event_object_table IN ('document_collections');

-- Quantas coletas tiveram back-fill
SELECT count(*) FILTER (WHERE rating_confianca IS NOT NULL) AS com_rating_conf,
       count(*) AS total
  FROM document_collections
 WHERE ai_analysis IS NOT NULL;
```

## Rollback (se necessário)

```sql
-- Migration 14
DROP TRIGGER IF EXISTS trig_company_snapshot ON document_collections;
DROP FUNCTION IF EXISTS fn_capture_company_snapshot();
DROP TABLE IF EXISTS company_snapshots;

-- Migration 13
DROP TRIGGER IF EXISTS trig_sync_ai_analysis_columns ON document_collections;
DROP FUNCTION IF EXISTS fn_sync_ai_analysis_columns();
ALTER TABLE document_collections
  DROP COLUMN IF EXISTS rating_confianca,
  DROP COLUMN IF EXISTS nivel_analise,
  DROP COLUMN IF EXISTS resumo_executivo,
  DROP COLUMN IF EXISTS alertas_alta_count,
  DROP COLUMN IF EXISTS alertas_mod_count,
  DROP COLUMN IF EXISTS cobertura_pct,
  DROP COLUMN IF EXISTS analyzed_at,
  DROP COLUMN IF EXISTS pdf_url,
  DROP COLUMN IF EXISTS pdf_generated_at;

-- Migration 12
DROP TRIGGER IF EXISTS trig_audit_collection_changes ON document_collections;
DROP FUNCTION IF EXISTS fn_audit_collection_changes();
DROP FUNCTION IF EXISTS fn_register_analysis_version(uuid, jsonb, jsonb, uuid, text);
DROP TABLE IF EXISTS analysis_versions;
DROP TABLE IF EXISTS audit_log;

-- Migration 11
-- ATENÇÃO: só dropar se nenhum dado importante estiver armazenado
-- DROP TABLE IF EXISTS fund_presets;
-- DROP TABLE IF EXISTS operacoes;
-- DROP TABLE IF EXISTS extraction_cache;
-- DROP TABLE IF EXISTS extraction_metrics;
```
