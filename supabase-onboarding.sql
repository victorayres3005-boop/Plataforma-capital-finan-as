-- ============================================================
-- ONBOARDING DE NOVOS USUÁRIOS
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  welcome_seen boolean DEFAULT false,
  first_collection_done boolean DEFAULT false,
  tooltips_seen text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own onboarding"
  ON user_onboarding FOR ALL
  USING (auth.uid() = user_id);
