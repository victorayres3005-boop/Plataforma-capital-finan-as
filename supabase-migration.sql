-- Execute este SQL no Supabase Dashboard → SQL Editor
-- Cria a tabela de histórico de coletas

create table document_collections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  finished_at timestamptz,
  status text default 'in_progress'
    check (status in ('in_progress', 'finished')),
  label text,
  documents jsonb default '[]'::jsonb
  -- cada item: { type, filename, extracted_data, uploaded_at }
);

alter table document_collections enable row level security;

create policy "users see own collections"
  on document_collections for all
  using (auth.uid() = user_id);
