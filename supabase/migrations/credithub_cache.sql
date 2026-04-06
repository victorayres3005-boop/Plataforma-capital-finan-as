CREATE TABLE IF NOT EXISTS credithub_cache (
  cnpj text PRIMARY KEY,
  protestos jsonb,
  processos jsonb,
  consultado_em timestamptz DEFAULT now(),
  valido_ate timestamptz DEFAULT (now() + interval '30 days')
);

ALTER TABLE credithub_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios autenticados podem ler cache"
  ON credithub_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "usuarios autenticados podem inserir cache"
  ON credithub_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "usuarios autenticados podem atualizar cache"
  ON credithub_cache FOR UPDATE
  TO authenticated
  USING (true);
