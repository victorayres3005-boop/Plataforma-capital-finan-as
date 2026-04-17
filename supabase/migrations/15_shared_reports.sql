-- ─── Relatórios públicos compartilháveis ─────────────────────────────────────
-- Armazena HTML gerado para acesso público via /r/{id}
-- Sem RLS nos registros — leitura pública, gravação server-side via service_role

CREATE TABLE IF NOT EXISTS shared_reports (
  id          TEXT        PRIMARY KEY,
  html        TEXT        NOT NULL,
  cnpj        TEXT,
  company     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '90 days'
);

-- Limpeza automática: remove registros expirados (requer pg_cron no projeto)
-- Se pg_cron não estiver ativo, expiração é aplicada na leitura (ver route.ts)

-- Índice para acelerar lookup por id (já é PK, mas explicitamos para clareza)
CREATE INDEX IF NOT EXISTS shared_reports_id_idx ON shared_reports (id);
CREATE INDEX IF NOT EXISTS shared_reports_expires_idx ON shared_reports (expires_at);
