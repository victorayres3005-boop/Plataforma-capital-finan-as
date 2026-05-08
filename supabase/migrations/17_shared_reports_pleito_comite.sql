-- ─── Pleito do Comitê — quadro editável ao lado do Pleito do Cedente ─────────
-- Permite que o comitê preencha o pleito decidido direto no relatório HTML
-- público (/r/{id}), substituindo a apresentação em Word.
-- Edição é livre (qualquer um com o link pode editar) — id de 10 chars
-- alfanuméricos já é semi-secreto e segue a mesma política do HTML compartilhado.
--
-- Estrutura JSONB: { "limiteTotal": "1.500.000", "tranche": "...", ... }
-- Labels espelham os 15 parâmetros do Pleito do Cedente em template.ts.

ALTER TABLE shared_reports
  ADD COLUMN IF NOT EXISTS pleito_comite          JSONB,
  ADD COLUMN IF NOT EXISTS pleito_comite_updated_at TIMESTAMPTZ;
