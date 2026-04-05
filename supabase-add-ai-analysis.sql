-- ============================================================
-- CACHE DE ANÁLISE DE IA
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- Adiciona coluna para cachear resultado da análise de crédito
-- ============================================================

-- Adiciona coluna ai_analysis para cache da análise de IA
ALTER TABLE document_collections
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb DEFAULT NULL;

-- Índice parcial para verificar se análise existe
CREATE INDEX IF NOT EXISTS idx_collections_ai_analysis_exists
  ON document_collections((ai_analysis IS NOT NULL))
  WHERE ai_analysis IS NOT NULL;

COMMENT ON COLUMN document_collections.ai_analysis IS
  'Cache da análise de crédito gerada pela IA. Evita rechamadas desnecessárias à API.';
