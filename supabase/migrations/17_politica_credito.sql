-- ─── Tabela: politica_credito_config ─────────────────────────────────────────
-- Uma linha por usuário, armazena a configuração ativa da política de crédito V2.
-- Os campos jsonb permitem evoluir o schema sem novas migrations para cada ajuste.

create table if not exists politica_credito_config (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  versao                    text not null default 'V2',
  status                    text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'arquivado')),
  parametros_elegibilidade  jsonb not null default '{}'::jsonb,
  pesos_pilares             jsonb not null default '{}'::jsonb,
  pilares                   jsonb not null default '[]'::jsonb,
  faixas_rating             jsonb not null default '[]'::jsonb,
  alertas                   jsonb not null default '[]'::jsonb,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);

-- Índice para busca rápida por usuário
create index if not exists idx_politica_credito_config_user_id
  on politica_credito_config (user_id);

-- Apenas uma configuração ativa por usuário
create unique index if not exists idx_politica_credito_config_user_versao
  on politica_credito_config (user_id, versao)
  where status = 'ativo';

-- RLS
alter table politica_credito_config enable row level security;

create policy "usuarios podem ler propria politica"
  on politica_credito_config for select
  to authenticated
  using (auth.uid() = user_id);

create policy "usuarios podem inserir propria politica"
  on politica_credito_config for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "usuarios podem atualizar propria politica"
  on politica_credito_config for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "usuarios podem excluir propria politica"
  on politica_credito_config for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─── Tabela: score_operacoes ──────────────────────────────────────────────────
-- Armazena o score calculado para cada análise/coleta.
-- versao_politica garante que análises antigas preservem qual versão foi usada.

create table if not exists score_operacoes (
  id               uuid primary key default gen_random_uuid(),
  collection_id    uuid not null references document_collections(id) on delete cascade,
  cedente_cnpj     text,
  versao_politica  text not null default 'V2',
  score_result     jsonb not null default '{}'::jsonb,
  respostas        jsonb not null default '[]'::jsonb,
  preenchido_por   uuid references auth.users(id),
  preenchido_em    timestamptz not null default now(),
  observacoes      text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_score_operacoes_collection_id
  on score_operacoes (collection_id);

create index if not exists idx_score_operacoes_cedente_cnpj
  on score_operacoes (cedente_cnpj);

-- RLS: analistas só veem scores das próprias coletas
alter table score_operacoes enable row level security;

create policy "usuarios podem ver scores das proprias coletas"
  on score_operacoes for select
  to authenticated
  using (
    exists (
      select 1 from document_collections dc
      where dc.id = score_operacoes.collection_id
        and dc.user_id = auth.uid()
    )
  );

create policy "usuarios podem inserir scores"
  on score_operacoes for insert
  to authenticated
  with check (
    exists (
      select 1 from document_collections dc
      where dc.id = score_operacoes.collection_id
        and dc.user_id = auth.uid()
    )
  );

create policy "usuarios podem atualizar proprios scores"
  on score_operacoes for update
  to authenticated
  using (preenchido_por = auth.uid());
