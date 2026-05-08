-- ─── Edição inline de Percepção do Analista em /r/[id] ──────────────────────
-- Estende a feature da migration 16 (fortes/fracos/alertas) com Percepção.
-- Percepção é TEXTO LIVRE (não lista), por isso TEXT em vez de JSONB.
--
-- Renderização: route.ts substitui o bloco <!--EDIT:percepcao:START--> ...
-- <!--EDIT:percepcao:END--> no HTML antes de servir, se houver override.
--
-- Pré-requisito: rodar 16_shared_reports_editable.sql antes (que já cria
-- as colunas pontos_fortes, pontos_fracos, alertas, edit_token, etc).

ALTER TABLE shared_reports
  ADD COLUMN IF NOT EXISTS percepcao TEXT;
