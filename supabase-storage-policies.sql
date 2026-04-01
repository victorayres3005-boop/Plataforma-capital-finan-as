-- Execute este SQL no Supabase Dashboard → SQL Editor
-- Configura as policies do bucket "documents" para que usuários autenticados
-- possam fazer upload, download e excluir seus próprios arquivos.

-- 1. Criar o bucket (caso não exista)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: SELECT — usuário só vê seus próprios arquivos
CREATE POLICY "Users can view own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 3. Policy: INSERT — usuário só faz upload na própria pasta
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 4. Policy: UPDATE — usuário pode atualizar (upsert) seus arquivos
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 5. Policy: DELETE — usuário pode excluir seus próprios arquivos
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
