-- ─── Caixas de Percepção do Analista por seção em /r/[id] ───────────────────
-- Estende migration 17 (que adicionou `percepcao` única) com 3 caixas novas
-- por seção do relatório: DRE, Faturamento, Balanço Patrimonial.
--
-- Renderização: route.ts substitui blocos <!--EDIT:dre:START/END--> e
-- semelhantes no HTML antes de servir, se houver override.
--
-- Pré-requisito: rodar 16 e 17 antes (que criam as colunas-base + edit_token).

ALTER TABLE shared_reports
  ADD COLUMN IF NOT EXISTS percepcao_dre         TEXT,
  ADD COLUMN IF NOT EXISTS percepcao_faturamento TEXT,
  ADD COLUMN IF NOT EXISTS percepcao_balanco     TEXT;
