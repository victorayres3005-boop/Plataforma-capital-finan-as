-- ============================================================
-- RATING FEEDBACK SYSTEM — Capital Finanças
-- Execute no SQL Editor do Supabase em sequência
-- ============================================================

-- 1. Extensão pgvector (necessária para Fase 2 — busca semântica)
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- TABELA 1: prompt_versions
-- Rastreia qual versão do prompt gerou cada análise.
-- Permite isolar se melhora no delta foi por mudança de prompt
-- ou por aprendizado real do modelo.
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_versions (
  id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid         REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  version       text         NOT NULL,            -- ex: "v1.0", "v2.3"
  label         text,                             -- descrição: "Adicionado peso CCF"
  prompt_text   text         NOT NULL,            -- snapshot completo do ANALYSIS_PROMPT
  content_hash  text         NOT NULL,            -- SHA-256[:16] para detecção de mudanças
  model         text         NOT NULL DEFAULT 'gemini-2.0-flash',
  temperature   numeric(3,2) NOT NULL DEFAULT 0.30,
  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  DEFAULT now(),

  UNIQUE (user_id, content_hash)
);

-- Apenas 1 prompt ativo por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_one_active
  ON prompt_versions (user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_prompt_versions_hash
  ON prompt_versions (user_id, content_hash);

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pv_all_own" ON prompt_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- COLUNA AUXILIAR em document_collections
-- Preserva o rating_ia original antes de ser sobrescrito
-- pelo rating do comitê ao finalizar o parecer.
-- ============================================================
ALTER TABLE document_collections
  ADD COLUMN IF NOT EXISTS rating_ia numeric(4,2);

CREATE INDEX IF NOT EXISTS idx_dc_rating_ia
  ON document_collections (user_id, rating_ia)
  WHERE rating_ia IS NOT NULL;


-- ============================================================
-- TABELA 2: rating_feedback
-- Coração do sistema — 1 linha por coleta finalizada.
-- Alimenta Fase 1 (few-shot), Fase 2 (pgvector), Fase 3 (fine-tuning).
-- ============================================================
CREATE TABLE IF NOT EXISTS rating_feedback (
  id                     uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id          uuid         REFERENCES document_collections(id) ON DELETE SET NULL,
  user_id                uuid         REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prompt_version_id      uuid         REFERENCES prompt_versions(id) ON DELETE SET NULL,

  -- Identificação
  cnpj                   text         NOT NULL,
  company_name           text,

  -- Ratings (0–10 com decimal)
  rating_ia              numeric(4,2) NOT NULL CHECK (rating_ia BETWEEN 0 AND 10),
  rating_comite          numeric(4,2)           CHECK (rating_comite IS NULL OR rating_comite BETWEEN 0 AND 10),
  delta_rating           numeric(5,2) GENERATED ALWAYS AS (rating_comite - rating_ia) STORED,

  -- Decisões
  decisao_ia             text         NOT NULL CHECK (decisao_ia IN ('APROVADO','APROVACAO_CONDICIONAL','PENDENTE','REPROVADO')),
  decisao_comite         text                  CHECK (decisao_comite IS NULL OR decisao_comite IN ('APROVADO','APROVACAO_CONDICIONAL','PENDENTE','REPROVADO')),
  decisao_mudou          boolean      GENERATED ALWAYS AS (decisao_comite IS NOT NULL AND decisao_ia <> decisao_comite) STORED,

  -- Snapshot imutável da análise da IA no momento da finalização
  -- (ai_analysis pode ser editado depois — este campo nunca muda)
  ai_analysis_snapshot   jsonb        NOT NULL DEFAULT '{}',

  -- Justificativa do comitê (texto livre) — ouro para fine-tuning
  justificativa_comite   text,

  -- Metadados do modelo
  model_used             text         NOT NULL DEFAULT 'gemini-2.0-flash',
  prompt_version_label   text,

  -- Fase 2: embedding vetorial (populado de forma assíncrona)
  -- 768 dims = text-embedding-004 (Google), custo menor, qualidade adequada
  embedding              vector(768),

  -- Status de revisão
  reviewed               boolean      NOT NULL DEFAULT false,
  reviewed_at            timestamptz,

  created_at             timestamptz  DEFAULT now(),

  -- Uma coleta = um registro de feedback
  UNIQUE (collection_id)
);

-- Índices principais
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

-- Índice parcial para a query de busca vetorial (Fase 2)
-- O índice IVFFlat completo deve ser criado quando houver >1000 vetores:
--   CREATE INDEX CONCURRENTLY idx_rf_ivfflat
--     ON rating_feedback USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_rf_embedding_ready
  ON rating_feedback (user_id, reviewed)
  WHERE embedding IS NOT NULL;

ALTER TABLE rating_feedback ENABLE ROW LEVEL SECURITY;

-- Leitura: usuário vê apenas seus próprios feedbacks
CREATE POLICY "rf_select_own" ON rating_feedback
  FOR SELECT USING (auth.uid() = user_id);

-- Insert: autorizado para o próprio usuário e para o trigger (SECURITY DEFINER)
CREATE POLICY "rf_insert_own" ON rating_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update: analista pode preencher justificativa e atualizar reviewed
CREATE POLICY "rf_update_own" ON rating_feedback
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DELETE bloqueado para preservar histórico de treino
-- (apenas service_role pode deletar)


-- ============================================================
-- TRIGGER: captura automática de rating_ia + inserção em rating_feedback
-- Dispara BEFORE UPDATE em document_collections quando status → 'finished'.
-- Lê OLD.rating (rating da IA, antes de ser sobrescrito) e
-- NEW.ai_analysis.parecerAnalista.ratingAnalista (rating do comitê).
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
  -- Só dispara na transição → 'finished'
  IF NEW.status <> 'finished' OR OLD.status = 'finished' THEN
    RETURN NEW;
  END IF;

  -- rating_ia: prioriza ai_analysis->>'rating' (mais confiável que a coluna,
  -- pois a coluna pode ter sido editada manualmente antes da finalização)
  v_rating_ia := COALESCE(
    (OLD.ai_analysis->>'rating')::numeric,
    OLD.rating_ia,
    OLD.rating
  );

  -- Persiste rating_ia na coluna auxiliar (backup extra)
  IF NEW.rating_ia IS NULL THEN
    NEW.rating_ia := v_rating_ia;
  END IF;

  -- rating_comite: vem de ai_analysis.parecerAnalista.ratingAnalista
  v_parecer       := NEW.ai_analysis->'parecerAnalista';
  v_rating_comite := COALESCE(
    (v_parecer->>'ratingAnalista')::numeric,
    NEW.rating
  );

  -- Decisão original da IA
  v_decisao_ia := COALESCE(
    OLD.ai_analysis->>'decisao',
    OLD.decisao,
    'PENDENTE'
  );

  -- Decisão final do comitê
  v_decisao_comite := COALESCE(NEW.decisao, v_decisao_ia);

  -- Justificativa escrita pelo comitê no campo "Nota do Comitê"
  v_justificativa := NULLIF(TRIM(COALESCE(v_parecer->>'notaComite', '')), '');

  -- Versão do prompt ativa do usuário (pode ser NULL se ainda não cadastrou)
  SELECT id, version, COALESCE(model, 'gemini-2.0-flash')
    INTO v_prompt_ver_id, v_prompt_ver_label, v_model
    FROM prompt_versions
   WHERE user_id = NEW.user_id AND is_active = true
   LIMIT 1;

  -- Upsert: suporta reanálises sem duplicar
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
    -- Snapshot ANTES do merge com parecerAnalista — captura estado puro da IA
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
    -- ai_analysis_snapshot é imutável após o primeiro INSERT
    ai_analysis_snapshot = CASE
      WHEN rating_feedback.ai_analysis_snapshot = '{}'::jsonb
      THEN EXCLUDED.ai_analysis_snapshot
      ELSE rating_feedback.ai_analysis_snapshot
    END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trig_capture_rating_feedback
  BEFORE UPDATE ON document_collections
  FOR EACH ROW
  EXECUTE FUNCTION fn_capture_rating_feedback();


-- ============================================================
-- VIEW: vw_few_shot_candidates
-- Fase 1 — seleciona os melhores exemplos para injeção no prompt.
-- Ranqueamento: divergência alta + recência.
-- Uso: SELECT * FROM vw_few_shot_candidates WHERE user_id = $1 LIMIT 5
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
  -- Peso: 70% divergência + 30% recência
  ROUND(
    ABS(rf.delta_rating) * 0.7 +
    (EXTRACT(EPOCH FROM rf.created_at) / EXTRACT(EPOCH FROM now()))::numeric * 3.0,
  2) AS peso_relevancia
FROM rating_feedback rf
WHERE rf.reviewed = true
  AND rf.rating_comite IS NOT NULL
  AND rf.delta_rating IS NOT NULL
ORDER BY peso_relevancia DESC;


-- ============================================================
-- VIEW: vw_rating_analytics
-- Dashboard de qualidade: evolução do delta ao longo do tempo.
-- ============================================================
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


-- ============================================================
-- VIEW: vw_fine_tuning_export
-- Fase 3 — pares (input, output) para fine-tuning.
-- Filtra: reviewed + justificativa + delta >= 0.5
-- ============================================================
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
-- VERIFICAÇÃO
-- ============================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('rating_feedback', 'prompt_versions')
ORDER BY tablename, policyname;
