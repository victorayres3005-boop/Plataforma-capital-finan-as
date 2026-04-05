-- ============================================================
-- CONFIGURAÇÕES DO FUNDO
-- Execute este SQL no Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS fund_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fmm_minimo numeric(15,2) DEFAULT 300000,
  idade_minima_anos numeric(4,1) DEFAULT 3,
  alavancagem_saudavel numeric(4,2) DEFAULT 3.5,
  alavancagem_maxima numeric(4,2) DEFAULT 5.0,
  prazo_maximo_aprovado integer DEFAULT 90,
  prazo_maximo_condicional integer DEFAULT 60,
  concentracao_max_sacado numeric(5,2) DEFAULT 20,
  fator_limite_base numeric(4,2) DEFAULT 0.5,
  revisao_aprovado_dias integer DEFAULT 90,
  revisao_condicional_dias integer DEFAULT 60,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE fund_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own settings"
  ON fund_settings FOR ALL
  USING (auth.uid() = user_id);
