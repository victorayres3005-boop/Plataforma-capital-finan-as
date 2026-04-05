-- ============================================================
-- MELHORIAS DE PERFORMANCE E ESTRUTURA
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- Adiciona colunas desnormalizadas para buscas rápidas e índices
-- ============================================================

-- 1. Colunas novas (desnormalizadas do JSONB para queries rápidas)
ALTER TABLE document_collections
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS rating numeric(4,2),
  ADD COLUMN IF NOT EXISTS decisao text CHECK (
    decisao IN ('APROVADO', 'APROVACAO_CONDICIONAL', 'PENDENTE', 'REPROVADO')
  ),
  ADD COLUMN IF NOT EXISTS fmm_12m numeric(15,2);

-- 2. Índices
-- Busca por usuário (mais comum)
CREATE INDEX IF NOT EXISTS idx_collections_user_id
  ON document_collections(user_id);

-- Ordenação por data (listagem principal)
CREATE INDEX IF NOT EXISTS idx_collections_created_at
  ON document_collections(created_at DESC);

-- Busca combinada usuário + data (query real da listagem)
CREATE INDEX IF NOT EXISTS idx_collections_user_created
  ON document_collections(user_id, created_at DESC);

-- Busca por CNPJ
CREATE INDEX IF NOT EXISTS idx_collections_cnpj
  ON document_collections(cnpj);

-- Busca por status
CREATE INDEX IF NOT EXISTS idx_collections_status
  ON document_collections(user_id, status);
