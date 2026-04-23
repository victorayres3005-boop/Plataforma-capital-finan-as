-- ============================================================
-- RATING FEEDBACK SYSTEM — Capital Finanças
-- Idempotente: pode rodar múltiplas vezes sem erro
-- ============================================================

-- 1. Extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- TABELA 1: prompt_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_versions (
  id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid         REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  version       text         NOT NULL,
  label         text,
  prompt_text   text         NOT NULL,
  content_hash  text         NOT NULL,
  model         text         NOT NULL DEFAULT 'gemini-2.0-flash',
  temperature   numeric(3,2) NOT NULL DEFAULT 0.30,
  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  DEFAULT now(),

  UNIQUE (user_id, content_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_one_active
  ON prompt_versions (user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_prompt_versions_hash
  ON prompt_versions (user_id, content_hash);

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_all_own" ON prompt_versions;
CREATE POLICY "pv_all_own" ON prompt_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- COLUNA AUXILIAR em document_collections
-- ============================================================
ALTER TABLE document_collections
  ADD COLUMN IF NOT EXISTS rating_ia numeric(4,2);

CREATE INDEX IF NOT EXISTS idx_dc_rating_ia
  ON document_collections (user_id, rating_ia)
  WHERE rating_ia IS NOT NULL;


-- ============================================================
-- TABELA 2: rating_feedback
-- ============================================================
CREATE TABLE IF NOT EXISTS rating_feedback (
  id                     uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id          uuid         REFERENCES document_collections(id) ON DELETE SET NULL,
  user_id                uuid         REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prompt_version_id      uuid         REFERENCES prompt_versions(id) ON DELETE SET NULL,

  cnpj                   text         NOT NULL,
  company_name           text,

  rating_ia              numeric(4,2) NOT NULL CHECK (rating_ia BETWEEN 0 AND 10),
  rating_comite          numeric(4,2)           CHECK (rating_comite IS NULL OR rating_comite BETWEEN 0 AND 10),
  delta_rating           numeric(5,2) GENERATED ALWAYS AS (rating_comite - rating_ia) STORED,

  decisao_ia             text         NOT NULL CHECK (decisao_ia IN ('APROVADO','APROVACAO_CONDICIONAL','PENDENTE','REPROVADO')),
  decisao_comite         text                  CHECK (decisao_comite IS NULL OR decisao_comite IN ('APROVADO','APROVACAO_CONDICIONAL','PENDENTE','REPROVADO')),
  decisao_mudou          boolean      GENERATED ALWAYS AS (decisao_comite IS NOT NULL AND decisao_ia <> decisao_comite) STORED,

  ai_analysis_snapshot   jsonb        NOT NULL DEFAULT '{}',
  justificativa_comite   text,

  model_used             text         NOT NULL DEFAULT 'gemini-2.0-flash',
  prompt_version_label   text,

  embedding              vector(768),

  reviewed               boolean      NOT NULL DEFAULT false,
  reviewed_at            timestamptz,

  created_at             timestamptz  DEFAULT now(),

  UNIQUE (collection_id)
);

CREATE INDEX IF NOT EXISTS idx_rf_user_created
  ON rating_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rf_reviewed
  ON rating_feedback (user_id, reviewed, created_at DESC)
  WHERE reviewed = true;

CREATE INDEX IF NOT EXISTS idx_rf_cnpj
  ON rating_feedback (user_id, cnpj);

CREATE INDEX IF NOT EXISTS idx_rf_delta
  ON rating_feedback (user_id, delta_rating)
  WHERE delta_rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rf_embedding_ready
  ON rating_feedback (user_id, reviewed)
  WHERE embedding IS NOT NULL;

ALTER TABLE rating_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rf_select_own" ON rating_feedback;
CREATE POLICY "rf_select_own" ON rating_feedback
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rf_insert_own" ON rating_feedback;
CREATE POLICY "rf_insert_own" ON rating_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rf_update_own" ON rating_feedback;
CREATE POLICY "rf_update_own" ON rating_feedback
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- TRIGGER: captura automática ao finalizar parecer
-- ============================================================
CREATE OR REPLACE FUNCTION fn_capture_rating_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rating_ia          numeric(4,2);
  v_rating_comite      numeric(4,2);
  v_decisao_ia         text;
  v_decisao_comite     text;
  v_parecer            jsonb;
  v_justificativa      text;
  v_prompt_ver_id      uuid;
  v_prompt_ver_label   text;
  v_model              text;
BEGIN
  IF NEW.status <> 'finished' OR OLD.status = 'finished' THEN
    RETURN NEW;
  END IF;

  v_rating_ia := COALESCE(
    (OLD.ai_analysis->>'rating')::numeric,
    OLD.rating_ia,
    OLD.rating
  );

  IF NEW.rating_ia IS NULL THEN
    NEW.rating_ia := v_rating_ia;
  END IF;

  v_parecer       := NEW.ai_analysis->'parecerAnalista';
  v_rating_comite := COALESCE(
    (v_parecer->>'ratingAnalista')::numeric,
    NEW.rating
  );

  v_decisao_ia := COALESCE(
    OLD.ai_analysis->>'decisao',
    OLD.decisao,
    'PENDENTE'
  );

  v_decisao_comite := COALESCE(NEW.decisao, v_decisao_ia);

  v_justificativa := NULLIF(TRIM(COALESCE(v_parecer->>'notaComite', '')), '');

  SELECT id, version, COALESCE(model, 'gemini-2.0-flash')
    INTO v_prompt_ver_id, v_prompt_ver_label, v_model
    FROM prompt_versions
   WHERE user_id = NEW.user_id AND is_active = true
   LIMIT 1;

  INSERT INTO rating_feedback (
    collection_id, user_id, prompt_version_id,
    cnpj, company_name,
    rating_ia, rating_comite,
    decisao_ia, decisao_comite,
    ai_analysis_snapshot,
    justificativa_comite,
    model_used, prompt_version_label,
    reviewed, reviewed_at
  ) VALUES (
    NEW.id, NEW.user_id, v_prompt_ver_id,
    COALESCE(NEW.cnpj, ''), NEW.company_name,
    COALESCE(v_rating_ia, 0), v_rating_comite,
    v_decisao_ia, v_decisao_comite,
    COALESCE(OLD.ai_analysis, '{}'::jsonb),
    v_justificativa,
    COALESCE(v_model, 'gemini-2.0-flash'), v_prompt_ver_label,
    (v_rating_comite IS NOT NULL),
    CASE WHEN v_rating_comite IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (collection_id) DO UPDATE SET
    rating_comite        = EXCLUDED.rating_comite,
    decisao_comite       = EXCLUDED.decisao_comite,
    justificativa_comite = COALESCE(EXCLUDED.justificativa_comite, rating_feedback.justificativa_comite),
    reviewed             = EXCLUDED.reviewed,
    reviewed_at          = COALESCE(EXCLUDED.reviewed_at, rating_feedback.reviewed_at),
    ai_analysis_snapshot = CASE
      WHEN rating_feedback.ai_analysis_snapshot = '{}'::jsonb
      THEN EXCLUDED.ai_analysis_snapshot
      ELSE rating_feedback.ai_analysis_snapshot
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_capture_rating_feedback ON document_collections;
CREATE TRIGGER trig_capture_rating_feedback
  BEFORE UPDATE ON document_collections
  FOR EACH ROW
  EXECUTE FUNCTION fn_capture_rating_feedback();


-- ============================================================
-- VIEWS
-- ============================================================
CREATE OR REPLACE VIEW vw_few_shot_candidates AS
SELECT
  rf.id,
  rf.user_id,
  rf.cnpj,
  rf.company_name,
  rf.rating_ia,
  rf.rating_comite,
  rf.delta_rating,
  ABS(rf.delta_rating)                                            AS abs_delta,
  rf.decisao_ia,
  rf.decisao_comite,
  rf.decisao_mudou,
  rf.justificativa_comite,
  rf.ai_analysis_snapshot->'parecer'->>'resumoExecutivo'          AS resumo_ia,
  rf.ai_analysis_snapshot->'parecer'->'pontosFortes'              AS pontos_fortes,
  rf.ai_analysis_snapshot->'parecer'->'pontosNegativosOuFracos'   AS pontos_fracos,
  rf.ai_analysis_snapshot->'alertas'                              AS alertas_ia,
  rf.ai_analysis_snapshot->'indicadores'                          AS indicadores_ia,
  rf.created_at,
  ROUND(
    ABS(rf.delta_rating) * 0.7 +
    (EXTRACT(EPOCH FROM rf.created_at) / EXTRACT(EPOCH FROM now()))::numeric * 3.0,
  2) AS peso_relevancia
FROM rating_feedback rf
WHERE rf.reviewed = true
  AND rf.rating_comite IS NOT NULL
  AND rf.delta_rating IS NOT NULL
ORDER BY peso_relevancia DESC;


CREATE OR REPLACE VIEW vw_rating_analytics AS
SELECT
  rf.user_id,
  date_trunc('month', rf.created_at)  AS mes,
  rf.cnpj,
  rf.company_name,
  rf.rating_ia,
  rf.rating_comite,
  rf.delta_rating,
  ABS(rf.delta_rating)                AS abs_delta,
  rf.decisao_ia,
  rf.decisao_comite,
  rf.decisao_mudou,
  CASE
    WHEN ABS(rf.delta_rating) <= 0.5  THEN 'concordancia'
    WHEN ABS(rf.delta_rating) <= 1.5  THEN 'divergencia_leve'
    WHEN ABS(rf.delta_rating) <= 3.0  THEN 'divergencia_moderada'
    ELSE                                   'divergencia_alta'
  END                                 AS categoria_delta,
  CASE
    WHEN rf.delta_rating > 0          THEN 'comite_mais_generoso'
    WHEN rf.delta_rating < 0          THEN 'comite_mais_restritivo'
    ELSE                                   'concordancia_exata'
  END                                 AS direcao_correcao,
  (ABS(rf.delta_rating) > 1.5 OR rf.decisao_mudou) AS caso_valioso_treino,
  rf.model_used,
  rf.prompt_version_label,
  rf.reviewed,
  rf.created_at
FROM rating_feedback rf
WHERE rf.rating_comite IS NOT NULL;


CREATE OR REPLACE VIEW vw_fine_tuning_export AS
SELECT
  rf.id,
  rf.user_id,
  rf.cnpj,
  rf.company_name,
  rf.ai_analysis_snapshot              AS input_snapshot,
  jsonb_build_object(
    'rating_esperado',   rf.rating_comite,
    'decisao_esperada',  rf.decisao_comite,
    'delta',             rf.delta_rating,
    'justificativa',     rf.justificativa_comite
  )                                    AS target_output,
  ABS(rf.delta_rating)                 AS abs_delta,
  rf.model_used,
  rf.prompt_version_label,
  rf.created_at
FROM rating_feedback rf
WHERE rf.reviewed = true
  AND rf.rating_comite IS NOT NULL
  AND rf.justificativa_comite IS NOT NULL
  AND ABS(rf.delta_rating) >= 0.5
ORDER BY rf.created_at DESC;


-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('rating_feedback', 'prompt_versions')
ORDER BY tablename, policyname;
