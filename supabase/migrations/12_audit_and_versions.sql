-- Migration 12: audit_log + analysis_versions
-- Adiciona rastreabilidade universal e histórico de análises.
-- Seguro para rodar em produção — não mexe em dados existentes.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) audit_log — rastreamento universal de mudanças
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id              bigserial PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id),
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  action          text NOT NULL,
  changed_fields  text[],
  before_values   jsonb,
  after_values    jsonb,
  reason          text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user
  ON audit_log(user_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select_own ON audit_log;
CREATE POLICY audit_select_own ON audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT não tem policy — só triggers SECURITY DEFINER escrevem

-- Trigger genérico que captura mudanças em document_collections
CREATE OR REPLACE FUNCTION fn_audit_collection_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  changed text[] := '{}';
  before_v jsonb := '{}'::jsonb;
  after_v  jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Diff dos campos sensíveis que importam para auditoria
    IF OLD.rating IS DISTINCT FROM NEW.rating THEN
      changed := array_append(changed, 'rating');
      before_v := before_v || jsonb_build_object('rating', OLD.rating);
      after_v  := after_v  || jsonb_build_object('rating', NEW.rating);
    END IF;
    IF OLD.decisao IS DISTINCT FROM NEW.decisao THEN
      changed := array_append(changed, 'decisao');
      before_v := before_v || jsonb_build_object('decisao', OLD.decisao);
      after_v  := after_v  || jsonb_build_object('decisao', NEW.decisao);
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      changed := array_append(changed, 'status');
      before_v := before_v || jsonb_build_object('status', OLD.status);
      after_v  := after_v  || jsonb_build_object('status', NEW.status);
    END IF;
    IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN
      changed := array_append(changed, 'observacoes');
    END IF;

    IF array_length(changed, 1) > 0 THEN
      INSERT INTO audit_log (user_id, entity_type, entity_id, action, changed_fields, before_values, after_values)
      VALUES (NEW.user_id, 'document_collection', NEW.id,
              CASE WHEN NEW.status = 'finished' AND OLD.status <> 'finished' THEN 'finalize' ELSE 'update' END,
              changed, before_v, after_v);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, entity_type, entity_id, action, before_values)
    VALUES (OLD.user_id, 'document_collection', OLD.id, 'delete',
            jsonb_build_object('rating', OLD.rating, 'decisao', OLD.decisao, 'cnpj', OLD.cnpj));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trig_audit_collection_changes ON document_collections;
CREATE TRIGGER trig_audit_collection_changes
  AFTER UPDATE OR DELETE ON document_collections
  FOR EACH ROW EXECUTE FUNCTION fn_audit_collection_changes();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) analysis_versions — cada chamada à IA vira uma versão
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analysis_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id        uuid NOT NULL REFERENCES document_collections(id) ON DELETE CASCADE,
  version_num          integer NOT NULL,
  rating               numeric(4,2),
  rating_confianca     numeric(5,2),
  decisao              text,
  nivel_analise        text,
  ai_analysis          jsonb NOT NULL,
  fund_status          jsonb,
  fund_settings_hash   text,
  prompt_version_id    uuid REFERENCES prompt_versions(id),
  triggered_by         text,
  created_at           timestamptz DEFAULT now(),
  UNIQUE (collection_id, version_num)
);

CREATE INDEX IF NOT EXISTS idx_av_collection
  ON analysis_versions(collection_id, version_num DESC);
CREATE INDEX IF NOT EXISTS idx_av_created
  ON analysis_versions(created_at DESC);

ALTER TABLE analysis_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS av_select_own ON analysis_versions;
CREATE POLICY av_select_own ON analysis_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM document_collections
      WHERE id = analysis_versions.collection_id
        AND user_id = auth.uid()
    )
  );

-- Function auxiliar para registrar uma nova versão de análise
CREATE OR REPLACE FUNCTION fn_register_analysis_version(
  p_collection_id uuid,
  p_ai_analysis jsonb,
  p_fund_status jsonb,
  p_prompt_version_id uuid DEFAULT NULL,
  p_triggered_by text DEFAULT 'analyze'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version_num), 0) + 1
    INTO next_version
    FROM analysis_versions
    WHERE collection_id = p_collection_id;

  INSERT INTO analysis_versions (
    collection_id, version_num, rating, rating_confianca, decisao, nivel_analise,
    ai_analysis, fund_status, prompt_version_id, triggered_by
  ) VALUES (
    p_collection_id,
    next_version,
    (p_ai_analysis->>'rating')::numeric,
    (p_ai_analysis->>'ratingConfianca')::numeric,
    p_ai_analysis->>'decisao',
    p_ai_analysis->>'nivelAnalise',
    p_ai_analysis,
    p_fund_status,
    p_prompt_version_id,
    p_triggered_by
  );

  RETURN next_version;
END;
$$;
