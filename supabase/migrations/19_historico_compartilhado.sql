-- ============================================================================
-- Migration 19 — Histórico compartilhado (Fase 1)
-- ============================================================================
-- Abre SELECT de document_collections para qualquer authenticated, mantendo
-- UPDATE/DELETE restritos ao dono. Retomada por colega usa endpoint
-- dedicado com service role + audit_log (em vez de policy column-level).
--
-- Status: rodada no Supabase em 2026-05-13 antes do deploy do frontend.
-- ============================================================================

-- 1) Colunas novas em document_collections
ALTER TABLE document_collections
  ADD COLUMN IF NOT EXISTS created_by_name  text,
  ADD COLUMN IF NOT EXISTS reopened_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_reopened_at timestamptz;

-- 2) Backfill do snapshot do nome do dono (raw_user_meta_data.full_name)
UPDATE document_collections dc
   SET created_by_name = COALESCE(
         u.raw_user_meta_data->>'full_name',
         u.raw_user_meta_data->>'name',
         split_part(u.email, '@', 1)
       )
  FROM auth.users u
 WHERE dc.user_id = u.id
   AND dc.created_by_name IS NULL;

-- 3) Trigger para popular created_by_name em novas coletas
CREATE OR REPLACE FUNCTION fn_set_created_by_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.created_by_name IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(
             u.raw_user_meta_data->>'full_name',
             u.raw_user_meta_data->>'name',
             split_part(u.email, '@', 1)
           )
      INTO NEW.created_by_name
      FROM auth.users u
     WHERE u.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_set_created_by_name ON document_collections;
CREATE TRIGGER trig_set_created_by_name
  BEFORE INSERT ON document_collections
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_created_by_name();

-- 4) RLS — abrir SELECT para todos os authenticated
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'document_collections'
       AND cmd        = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.document_collections', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY dc_select_team
  ON document_collections
  FOR SELECT
  TO authenticated
  USING (true);

-- 5) UPDATE/DELETE permanecem restritos ao dono (recria idempotente)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'document_collections'
       AND cmd IN ('UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.document_collections', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY dc_update_own
  ON document_collections
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY dc_delete_own
  ON document_collections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Validação (rodar separado):
-- SELECT policyname, cmd, qual FROM pg_policies
--  WHERE schemaname='public' AND tablename='document_collections'
--  ORDER BY cmd, policyname;
