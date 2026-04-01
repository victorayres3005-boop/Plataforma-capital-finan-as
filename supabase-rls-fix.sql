-- ============================================================
-- CORREÇÃO DE SEGURANÇA: Row Level Security (RLS)
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Garantir que RLS está HABILITADO
ALTER TABLE document_collections ENABLE ROW LEVEL SECURITY;

-- 2. Remover policies antigas (se existirem) e recriar
DROP POLICY IF EXISTS "users see own collections" ON document_collections;
DROP POLICY IF EXISTS "users_select_own" ON document_collections;
DROP POLICY IF EXISTS "users_insert_own" ON document_collections;
DROP POLICY IF EXISTS "users_update_own" ON document_collections;
DROP POLICY IF EXISTS "users_delete_own" ON document_collections;

-- 3. SELECT: usuário só vê suas próprias coleções
CREATE POLICY "users_select_own"
  ON document_collections FOR SELECT
  USING (auth.uid() = user_id);

-- 4. INSERT: usuário só insere com seu próprio user_id
CREATE POLICY "users_insert_own"
  ON document_collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. UPDATE: usuário só atualiza suas próprias coleções
CREATE POLICY "users_update_own"
  ON document_collections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. DELETE: usuário só deleta suas próprias coleções
CREATE POLICY "users_delete_own"
  ON document_collections FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Garantir que não existem coleções sem user_id (dados órfãos)
-- Isso mostra quantas existem — revise antes de deletar
-- SELECT count(*) FROM document_collections WHERE user_id IS NULL;

-- 8. Tornar user_id NOT NULL para novas inserções
ALTER TABLE document_collections ALTER COLUMN user_id SET NOT NULL;

-- ============================================================
-- VERIFICAÇÃO: rode isso para confirmar que RLS está ativo
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'document_collections';
-- Deve retornar rowsecurity = true
