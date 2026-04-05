-- ============================================================
-- POLICIES DO BUCKET DE AVATARES
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- ANTES de usar o upload de avatar em produção.
-- ============================================================

-- 1. Criar o bucket avatars (privado, max 2MB, apenas imagens)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  2097152,  -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: SELECT — usuário só vê o próprio avatar
CREATE POLICY "Users can view own avatar"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = split_part(name, '.', 1)
);

-- 3. Policy: INSERT — usuário só faz upload no próprio path
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.uid())::text = split_part(name, '.', 1)
);

-- 4. Policy: UPDATE — usuário pode atualizar (upsert) o próprio avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = split_part(name, '.', 1)
);

-- 5. Policy: DELETE — usuário pode excluir o próprio avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = split_part(name, '.', 1)
);
