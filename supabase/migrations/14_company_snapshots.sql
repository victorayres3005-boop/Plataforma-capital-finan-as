-- Migration 14: company_snapshots — histórico temporal por CNPJ
-- Permite plotar evolução de rating/protestos/alavancagem ao longo do tempo.
-- Trigger popula snapshot quando uma coleta é finalizada.

CREATE TABLE IF NOT EXISTS company_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj               text NOT NULL,
  company_name       text,
  snapshot_date      date NOT NULL DEFAULT current_date,
  collection_id      uuid REFERENCES document_collections(id) ON DELETE SET NULL,

  -- Métricas capturadas
  rating             numeric(4,2),
  rating_confianca   numeric(5,2),
  decisao            text,
  fmm_12m            numeric(15,2),
  alavancagem        numeric(6,2),
  protestos_count    integer,
  processos_count    integer,
  ccf_count          integer,
  scr_vencidos_pct   numeric(5,2),
  nivel_analise      text,
  alertas_alta_count smallint,

  created_at         timestamptz DEFAULT now(),

  UNIQUE (user_id, cnpj, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_cs_cnpj_date
  ON company_snapshots(cnpj, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_cs_user_cnpj
  ON company_snapshots(user_id, cnpj, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_cs_rating_drop
  ON company_snapshots(user_id, cnpj) WHERE rating < 6;

ALTER TABLE company_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cs_select_own ON company_snapshots;
CREATE POLICY cs_select_own ON company_snapshots
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cs_insert_own ON company_snapshots;
CREATE POLICY cs_insert_own ON company_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger: captura snapshot ao finalizar coleta
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_capture_company_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prot_count int;
  proc_count int;
  ccf_count_val int;
BEGIN
  IF NEW.status = 'finished'
     AND (OLD.status IS NULL OR OLD.status <> 'finished')
     AND NEW.cnpj IS NOT NULL THEN

    -- Extrair contadores do JSONB documents quando possível
    prot_count := COALESCE((
      SELECT NULLIF(d->'extracted_data'->>'vigentesQtd', '')::int
      FROM jsonb_array_elements(COALESCE(NEW.documents, '[]'::jsonb)) d
      WHERE d->>'type' = 'protestos'
      LIMIT 1
    ), 0);

    proc_count := COALESCE((
      SELECT NULLIF(d->'extracted_data'->>'passivosTotal', '')::int
      FROM jsonb_array_elements(COALESCE(NEW.documents, '[]'::jsonb)) d
      WHERE d->>'type' = 'processos'
      LIMIT 1
    ), 0);

    ccf_count_val := COALESCE((
      SELECT NULLIF(d->'extracted_data'->>'qtdRegistros', '')::int
      FROM jsonb_array_elements(COALESCE(NEW.documents, '[]'::jsonb)) d
      WHERE d->>'type' = 'ccf'
      LIMIT 1
    ), 0);

    INSERT INTO company_snapshots (
      user_id, cnpj, company_name, snapshot_date, collection_id,
      rating, rating_confianca, decisao, fmm_12m,
      protestos_count, processos_count, ccf_count,
      nivel_analise, alertas_alta_count
    ) VALUES (
      NEW.user_id, NEW.cnpj, NEW.company_name, current_date, NEW.id,
      NEW.rating, NEW.rating_confianca, NEW.decisao, NEW.fmm_12m,
      prot_count, proc_count, ccf_count_val,
      NEW.nivel_analise, NEW.alertas_alta_count
    )
    ON CONFLICT (user_id, cnpj, snapshot_date) DO UPDATE SET
      rating = EXCLUDED.rating,
      rating_confianca = EXCLUDED.rating_confianca,
      decisao = EXCLUDED.decisao,
      fmm_12m = EXCLUDED.fmm_12m,
      protestos_count = EXCLUDED.protestos_count,
      processos_count = EXCLUDED.processos_count,
      ccf_count = EXCLUDED.ccf_count,
      collection_id = EXCLUDED.collection_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_company_snapshot ON document_collections;
CREATE TRIGGER trig_company_snapshot
  AFTER UPDATE ON document_collections
  FOR EACH ROW EXECUTE FUNCTION fn_capture_company_snapshot();
