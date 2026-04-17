-- Migration: cria tabela processos_cache para persistência de dados de processos judiciais
-- Análoga à protestos_cache e ccf_cache — sem expiração, atualizada a cada consulta bem-sucedida

CREATE TABLE IF NOT EXISTS processos_cache (
  cnpj        text PRIMARY KEY,
  processos   jsonb NOT NULL,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE processos_cache ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'processos_cache'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON processos_cache', pol.policyname);
  END LOOP;
END $$;

-- Apenas service_role pode ler/escrever (acesso server-side only)
CREATE POLICY "proc_service_only" ON processos_cache
  FOR ALL USING (auth.role() = 'service_role');
