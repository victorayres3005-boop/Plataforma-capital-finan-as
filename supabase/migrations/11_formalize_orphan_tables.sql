-- Migration 11: formaliza tabelas que existem em produção mas nunca tiveram CREATE TABLE
-- versionado. Todas usam IF NOT EXISTS para serem idempotentes.
-- Seguro para rodar em produção sem downtime.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) extraction_metrics — já populada em /api/extract
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS extraction_metrics (
  id              bigserial PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,
  filled_fields   integer,
  input_mode      text,
  text_length     integer,
  duration_ms     integer,
  ai_powered      boolean DEFAULT true,
  cached          boolean DEFAULT false,
  zod_warnings    jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_em_user_created ON extraction_metrics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_em_doc_type     ON extraction_metrics(doc_type, created_at DESC);

ALTER TABLE extraction_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS em_select_own ON extraction_metrics;
CREATE POLICY em_select_own ON extraction_metrics
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS em_insert_own ON extraction_metrics;
CREATE POLICY em_insert_own ON extraction_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) extraction_cache — cache por hash do arquivo
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS extraction_cache (
  id              bigserial PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  file_hash       text NOT NULL,
  doc_type        text NOT NULL,
  extracted_data  jsonb NOT NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ec_user_hash_type
  ON extraction_cache(user_id, file_hash, doc_type);
CREATE INDEX IF NOT EXISTS idx_ec_user_hash ON extraction_cache(user_id, file_hash);

ALTER TABLE extraction_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ec_select_own ON extraction_cache;
CREATE POLICY ec_select_own ON extraction_cache
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ec_insert_own ON extraction_cache;
CREATE POLICY ec_insert_own ON extraction_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) operacoes — histórico transacional de operações fechadas
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS operacoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id    uuid REFERENCES document_collections(id) ON DELETE SET NULL,
  cnpj             text NOT NULL,
  company_name     text,
  data_operacao    date NOT NULL,
  modalidade       text CHECK (modalidade IN ('convencional','comissaria','hibrida','outra')),
  valor_bruto      numeric(15,2),
  valor_liquido    numeric(15,2),
  taxa             numeric(6,3),
  prazo_dias       integer,
  qtd_titulos      integer,
  sacados_top5     jsonb,
  status           text CHECK (status IN ('ativa','liquidada','inadimplente','recomprada','recompra')) DEFAULT 'ativa',
  observacoes      text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_user_cnpj ON operacoes(user_id, cnpj);
CREATE INDEX IF NOT EXISTS idx_op_data      ON operacoes(user_id, data_operacao DESC);
CREATE INDEX IF NOT EXISTS idx_op_status    ON operacoes(user_id, status) WHERE status = 'ativa';

ALTER TABLE operacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS op_select_own ON operacoes;
CREATE POLICY op_select_own ON operacoes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS op_insert_own ON operacoes;
CREATE POLICY op_insert_own ON operacoes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS op_update_own ON operacoes;
CREATE POLICY op_update_own ON operacoes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS op_delete_own ON operacoes;
CREATE POLICY op_delete_own ON operacoes
  FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) fund_presets — presets salvos de política do fundo
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fund_presets (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  color                     text,
  fmm_minimo                numeric(15,2),
  idade_minima_anos         numeric(4,1),
  alavancagem_saudavel      numeric(4,2),
  alavancagem_maxima        numeric(4,2),
  prazo_maximo_aprovado     integer,
  prazo_maximo_condicional  integer,
  concentracao_max_sacado   numeric(5,2),
  fator_limite_base         numeric(4,2),
  created_at                timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_fp_user ON fund_presets(user_id);

ALTER TABLE fund_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fp_select_own ON fund_presets;
CREATE POLICY fp_select_own ON fund_presets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS fp_insert_own ON fund_presets;
CREATE POLICY fp_insert_own ON fund_presets FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS fp_update_own ON fund_presets;
CREATE POLICY fp_update_own ON fund_presets FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS fp_delete_own ON fund_presets;
CREATE POLICY fp_delete_own ON fund_presets FOR DELETE USING (auth.uid() = user_id);
