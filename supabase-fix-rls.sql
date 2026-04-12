-- ============================================================================
-- CAPITAL FINANÇAS — Correção completa de RLS (Row Level Security)
--
-- Execute este script no Supabase Dashboard → SQL Editor → New Query → Run
--
-- O QUE FAZ:
--   1. Habilita RLS em TODAS as tabelas
--   2. Remove policies antigas/quebradas
--   3. Cria policies corretas: cada usuário só acessa seus próprios dados
--   4. Protege tabelas de cache (server-side only via service_role)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DOCUMENT_COLLECTIONS (CRÍTICO — estava 100% aberta)
-- ─────────────────────────────────────────────────────────────────────────────

-- Habilita RLS (se já estiver habilitada, não faz nada)
ALTER TABLE document_collections ENABLE ROW LEVEL SECURITY;

-- Remove TODAS as policies existentes para recriação limpa
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'document_collections'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON document_collections', pol.policyname);
  END LOOP;
END $$;

-- Cria policies restritivas
CREATE POLICY "dc_select_own" ON document_collections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "dc_insert_own" ON document_collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dc_update_own" ON document_collections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dc_delete_own" ON document_collections
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "notif_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notif_insert_own" ON notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notif_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "notif_delete_own" ON notifications
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FUND_PRESETS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fund_presets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'fund_presets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON fund_presets', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "fp_select_own" ON fund_presets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "fp_insert_own" ON fund_presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fp_update_own" ON fund_presets
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fp_delete_own" ON fund_presets
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FUND_SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fund_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'fund_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON fund_settings', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "fs_select_own" ON fund_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "fs_insert_own" ON fund_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fs_update_own" ON fund_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fs_delete_own" ON fund_settings
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. USER_ONBOARDING
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'user_onboarding'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_onboarding', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "ub_select_own" ON user_onboarding
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ub_insert_own" ON user_onboarding
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ub_update_own" ON user_onboarding
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ub_delete_own" ON user_onboarding
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. BUREAU_CACHE (server-side only — usa service_role key)
--    Anon users não devem ler nem escrever cache de bureaus.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE bureau_cache ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'bureau_cache'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON bureau_cache', pol.policyname);
  END LOOP;
END $$;

-- Apenas service_role (via supabaseAdmin client) pode acessar
-- Authenticated users via anon key NÃO terão acesso
CREATE POLICY "bc_service_only" ON bureau_cache
  FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. PROTESTOS_CACHE (server-side only)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE protestos_cache ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'protestos_cache'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON protestos_cache', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "pc_service_only" ON protestos_cache
  FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CCF_CACHE (server-side only)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ccf_cache ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'ccf_cache'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ccf_cache', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "ccf_service_only" ON ccf_cache
  FOR ALL USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO: lista todas as policies criadas
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
