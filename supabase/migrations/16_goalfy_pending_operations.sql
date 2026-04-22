-- Tabela para operações recebidas da Goalfy via webhook push
create table if not exists goalfy_pending_operations (
  id               uuid primary key default gen_random_uuid(),
  goalfy_card_id   text not null,
  company_name     text not null,
  cnpj             text,
  manager_name     text,
  phone            text,
  email            text,
  notes            text,
  documents        jsonb default '[]',
  raw_payload      jsonb default '{}',
  status           text not null default 'pending', -- pending | imported | ignored
  collection_id    uuid references document_collections(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists goalfy_pending_operations_card_id_idx
  on goalfy_pending_operations (goalfy_card_id);

create index if not exists goalfy_pending_operations_status_idx
  on goalfy_pending_operations (status, created_at desc);

-- RLS: apenas usuários autenticados lêem, inserção é via service role (webhook)
alter table goalfy_pending_operations enable row level security;

create policy "authenticated users read goalfy operations"
  on goalfy_pending_operations for select
  to authenticated using (true);

create policy "service role manages goalfy operations"
  on goalfy_pending_operations for all
  to service_role using (true);
