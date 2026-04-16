-- Migration 13: desnormaliza campos críticos de ai_analysis em colunas
-- Adiciona colunas novas + trigger de sincronização automática.
-- Seguro para rodar em produção — colunas novas com default NULL, trigger só
-- popula conforme UPDATE/INSERT acontecem.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Adicionar colunas tipadas
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE document_collections
  ADD COLUMN IF NOT EXISTS rating_confianca   numeric(5,2),
  ADD COLUMN IF NOT EXISTS nivel_analise      text,
  ADD COLUMN IF NOT EXISTS resumo_executivo   text,
  ADD COLUMN IF NOT EXISTS alertas_alta_count smallint,
  ADD COLUMN IF NOT EXISTS alertas_mod_count  smallint,
  ADD COLUMN IF NOT EXISTS cobertura_pct      numeric(5,2),
  ADD COLUMN IF NOT EXISTS analyzed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_url            text,
  ADD COLUMN IF NOT EXISTS pdf_generated_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_dc_rating_desc
  ON document_collections(user_id, rating DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_dc_nivel
  ON document_collections(user_id, nivel_analise);
CREATE INDEX IF NOT EXISTS idx_dc_analyzed_at
  ON document_collections(user_id, analyzed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_dc_ai_analysis_gin
  ON document_collections USING GIN (ai_analysis);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Trigger de sincronização ai_analysis → colunas
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_ai_analysis_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ai_analysis IS NOT NULL AND
     (TG_OP = 'INSERT' OR NEW.ai_analysis IS DISTINCT FROM OLD.ai_analysis) THEN

    -- Rating de confiança
    NEW.rating_confianca := NULLIF(NEW.ai_analysis->>'ratingConfianca', '')::numeric;

    -- Nível de análise
    NEW.nivel_analise := NEW.ai_analysis->>'nivelAnalise';

    -- Resumo executivo (tenta 2 lugares pra compat com legado)
    NEW.resumo_executivo := COALESCE(
      NEW.ai_analysis->'parecer'->>'resumoExecutivo',
      NEW.ai_analysis->>'resumoExecutivo'
    );

    -- Contagem de alertas por severidade
    NEW.alertas_alta_count := COALESCE((
      SELECT count(*)::smallint
      FROM jsonb_array_elements(COALESCE(NEW.ai_analysis->'alertas', '[]'::jsonb)) a
      WHERE a->>'severidade' = 'ALTA'
    ), 0);
    NEW.alertas_mod_count := COALESCE((
      SELECT count(*)::smallint
      FROM jsonb_array_elements(COALESCE(NEW.ai_analysis->'alertas', '[]'::jsonb)) a
      WHERE a->>'severidade' = 'MODERADA'
    ), 0);

    -- Cobertura documental
    NEW.cobertura_pct := NULLIF(COALESCE(
      NEW.ai_analysis->'coberturaDocumental'->>'coberturaEfetiva',
      NEW.ai_analysis->'coberturaDocumental'->>'cobertura'
    ), '')::numeric;

    -- Timestamp da análise
    IF NEW.analyzed_at IS NULL OR (TG_OP = 'UPDATE' AND NEW.ai_analysis IS DISTINCT FROM OLD.ai_analysis) THEN
      NEW.analyzed_at := now();
    END IF;

    -- CORREÇÃO FUNDAMENTAL: rating/decisao ficam preenchidos assim que a IA
    -- responde, não só quando "Registrar Parecer" é clicado.
    IF NEW.rating IS NULL AND (NEW.ai_analysis ? 'rating') THEN
      NEW.rating := NULLIF(NEW.ai_analysis->>'rating', '')::numeric;
    END IF;
    IF NEW.decisao IS NULL AND (NEW.ai_analysis ? 'decisao') THEN
      NEW.decisao := NEW.ai_analysis->>'decisao';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_sync_ai_analysis_columns ON document_collections;
CREATE TRIGGER trig_sync_ai_analysis_columns
  BEFORE INSERT OR UPDATE OF ai_analysis ON document_collections
  FOR EACH ROW EXECUTE FUNCTION fn_sync_ai_analysis_columns();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Back-fill: força re-sync nos registros existentes
-- ═══════════════════════════════════════════════════════════════════════════
-- Comentado pra segurança — rodar manualmente em batches depois:
-- UPDATE document_collections
--   SET ai_analysis = ai_analysis
--   WHERE ai_analysis IS NOT NULL AND rating_confianca IS NULL;
