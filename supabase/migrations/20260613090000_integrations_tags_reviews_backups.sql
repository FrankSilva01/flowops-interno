-- 3D.AFT - Integracoes, tags, arquivos de leads, avaliacoes e backups.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create table if not exists public.custom_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'neutral',
  created_by text,
  created_at timestamptz not null default now(),
  unique (name)
);
insert into public.custom_tags (name, color)
values
  ('VIP', 'positive'),
  ('Evento', 'attention'),
  ('Reposicao', 'queue'),
  ('Personalizado', 'attention')
on conflict (name) do nothing;
create table if not exists public.lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  file_name text not null,
  file_type text,
  storage_path text not null,
  category text not null default 'Referencia',
  size_bytes bigint,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists lead_files_lead_idx on public.lead_files (lead_id, created_at desc);
create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null,
  external_product_id text not null,
  external_review_id text not null,
  rating numeric(2,1),
  title text,
  comment text,
  author_name text,
  review_date timestamptz,
  status text not null default 'published',
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (marketplace, external_review_id)
);
create index if not exists marketplace_reviews_product_idx
  on public.marketplace_reviews (marketplace, external_product_id, review_date desc);
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null default 'weekly',
  status text not null default 'running',
  storage_path text,
  size_bytes bigint,
  table_counts jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by text not null default 'Sistema'
);
create index if not exists backup_runs_started_idx on public.backup_runs (started_at desc);
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('lead-files', 'lead-files', false, 52428800),
  ('system-backups', 'system-backups', false, 104857600)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;
alter table public.custom_tags enable row level security;
alter table public.lead_files enable row level security;
alter table public.marketplace_reviews enable row level security;
alter table public.backup_runs enable row level security;
grant select, insert, update, delete on public.custom_tags to authenticated;
grant select, insert, update, delete on public.lead_files to authenticated;
grant select on public.marketplace_reviews to anon, authenticated;
grant insert, update, delete on public.marketplace_reviews to authenticated;
grant select, insert on public.backup_runs to authenticated;
create policy "approved users read tags"
on public.custom_tags for select to authenticated using (public.is_approved_user());
create policy "editors manage tags"
on public.custom_tags for all to authenticated using (public.can_edit()) with check (public.can_edit());
create policy "approved users read lead files"
on public.lead_files for select to authenticated using (public.is_approved_user());
create policy "editors manage lead files"
on public.lead_files for all to authenticated using (public.can_edit()) with check (public.can_edit());
create policy "public reads published reviews"
on public.marketplace_reviews for select to anon, authenticated using (status = 'published');
create policy "admins manage reviews"
on public.marketplace_reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "approved users read backups"
on public.backup_runs for select to authenticated using (public.is_approved_user());
create policy "admins create backups"
on public.backup_runs for insert to authenticated with check (public.is_admin());
create policy "approved users read lead storage"
on storage.objects for select to authenticated
using (bucket_id = 'lead-files' and public.is_approved_user());
create policy "editors manage lead storage"
on storage.objects for all to authenticated
using (bucket_id = 'lead-files' and public.can_edit())
with check (bucket_id = 'lead-files' and public.can_edit());
create policy "admins read backup storage"
on storage.objects for select to authenticated
using (bucket_id = 'system-backups' and public.is_admin());
do $$
begin
  perform cron.unschedule('3daft-weekly-maintenance')
  where exists (select 1 from cron.job where jobname = '3daft-weekly-maintenance');
exception when others then
  null;
end $$;
select cron.schedule(
  '3daft-weekly-maintenance',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := 'https://djvrhvzjvnyensbobtby.functions.supabase.co/system-maintenance',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"scheduled"}'::jsonb
  );
  $$
);
