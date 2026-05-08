-- ─── Edição inline de Pontos Fortes / Fracos / Alertas em /r/[id] ────────────
-- Permite Victor/Vanessa editarem as 3 listas direto no HTML público,
-- protegido por edit_token único por relatório.
--
-- Renderização: route.ts substitui os blocos data-edit-section no HTML antes
-- de servir, se houver override em qualquer uma das 3 colunas JSONB.

ALTER TABLE shared_reports
  ADD COLUMN IF NOT EXISTS pontos_fortes JSONB,
  ADD COLUMN IF NOT EXISTS pontos_fracos JSONB,
  ADD COLUMN IF NOT EXISTS alertas       JSONB,
  ADD COLUMN IF NOT EXISTS edit_token    TEXT,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by    TEXT;

-- Índice para validar token na rota de edição rapidamente
CREATE INDEX IF NOT EXISTS shared_reports_edit_token_idx ON shared_reports (edit_token);
