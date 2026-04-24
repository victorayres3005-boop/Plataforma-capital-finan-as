-- Migration 18: API usage logs for cost tracking
-- Tracks Gemini token usage and bureau API calls per analysis

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id uuid        REFERENCES document_collections(id) ON DELETE SET NULL,
  cnpj          text,
  company_name  text,
  log_type      text        NOT NULL, -- 'gemini_analyze' | 'bureau'
  model         text,                 -- 'gemini-2.5-flash' | 'gemini-2.5-pro' etc
  input_tokens  integer,
  output_tokens integer,
  bureau_calls  jsonb,                -- { credithub: 1, assertiva_pj: 1, assertiva_pf: 2, bdc_empresa: 1, bdc_socio: 2 }
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_usage_logs_collection_id_idx ON api_usage_logs(collection_id);
CREATE INDEX IF NOT EXISTS api_usage_logs_created_at_idx    ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_logs_cnpj_idx          ON api_usage_logs(cnpj);

-- RLS: only authenticated users of the same project can read; service role can write
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read usage logs"
  ON api_usage_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert usage logs"
  ON api_usage_logs FOR INSERT
  TO service_role
  WITH CHECK (true);
