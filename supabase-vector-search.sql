-- ============================================================
-- FASE 2: Busca vetorial por similaridade
-- Execute no SQL Editor do Supabase APÓS supabase-rating-feedback.sql
-- ============================================================

-- Função RPC chamada pelo /api/analyze para buscar casos similares
-- Parâmetros:
--   p_user_id       — filtra pelo usuário logado (respeita RLS)
--   p_embedding     — vetor da empresa atual (768 dims como texto)
--   p_match_count   — quantos casos retornar (padrão: 5)
--   p_min_similarity — threshold de similaridade coseno (0 a 1, padrão: 0.70)
CREATE OR REPLACE FUNCTION match_rating_feedback(
  p_user_id        uuid,
  p_embedding      vector(768),
  p_match_count    int     DEFAULT 5,
  p_min_similarity float   DEFAULT 0.70
)
RETURNS TABLE (
  id                   uuid,
  company_name         text,
  rating_ia            numeric,
  rating_comite        numeric,
  delta_rating         numeric,
  decisao_ia           text,
  decisao_comite       text,
  justificativa_comite text,
  resumo_ia            text,
  similarity           float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    rf.id,
    rf.company_name,
    rf.rating_ia,
    rf.rating_comite,
    rf.delta_rating,
    rf.decisao_ia,
    rf.decisao_comite,
    rf.justificativa_comite,
    rf.ai_analysis_snapshot->'parecer'->>'resumoExecutivo' AS resumo_ia,
    1 - (rf.embedding <=> p_embedding)                     AS similarity
  FROM rating_feedback rf
  WHERE rf.user_id = p_user_id
    AND rf.reviewed = true
    AND rf.embedding IS NOT NULL
    AND rf.rating_comite IS NOT NULL
    AND 1 - (rf.embedding <=> p_embedding) >= p_min_similarity
  ORDER BY rf.embedding <=> p_embedding   -- menor distância = mais similar
  LIMIT p_match_count;
$$;

-- Garante que a função possa ser chamada via PostgREST (rpc)
GRANT EXECUTE ON FUNCTION match_rating_feedback TO authenticated;
GRANT EXECUTE ON FUNCTION match_rating_feedback TO anon;
