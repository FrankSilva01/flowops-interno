-- 3D.AFT - Frente 1 de melhorias operacionais
-- Leads, auditoria, notificacoes e metricas da vitrine.

create extension if not exists pgcrypto;
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  whatsapp text,
  origin text not null default 'Manual',
  status text not null default 'Novo',
  last_contact_at timestamptz,
  notes text,
  linked_order_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_leads_email_unique
  on public.crm_leads (lower(email))
  where email is not null and btrim(email) <> '';
create unique index if not exists crm_leads_whatsapp_unique
  on public.crm_leads (regexp_replace(whatsapp, '\D', '', 'g'))
  where whatsapp is not null and btrim(whatsapp) <> '';
create index if not exists crm_leads_status_idx on public.crm_leads (status);
create index if not exists crm_leads_origin_idx on public.crm_leads (origin);
create index if not exists crm_leads_updated_at_idx on public.crm_leads (updated_at desc);
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  order_code text,
  old_value jsonb,
  new_value jsonb,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id);
create index if not exists audit_events_action_idx on public.audit_events (action);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  role_target text,
  type text not null,
  title text not null,
  message text,
  related_entity text,
  related_entity_id text,
  is_read boolean not null default false,
  priority text not null default 'normal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);
create index if not exists notifications_unread_idx on public.notifications (is_read, created_at desc);
create index if not exists notifications_role_idx on public.notifications (role_target, created_at desc);
create table if not exists public.storefront_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  product_id text,
  marketplace text,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists storefront_events_created_at_idx on public.storefront_events (created_at desc);
create index if not exists storefront_events_product_idx on public.storefront_events (product_id, event_type);
alter table public.crm_leads enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;
alter table public.storefront_events enable row level security;
grant select, insert, update, delete on public.crm_leads to authenticated;
grant select, insert on public.audit_events to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant insert on public.storefront_events to anon, authenticated;
grant select on public.storefront_events to authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;
grant usage, select on sequence public.storefront_events_id_seq to anon, authenticated;
drop policy if exists "approved users read leads" on public.crm_leads;
drop policy if exists "editors manage leads" on public.crm_leads;
drop policy if exists "approved users read audit" on public.audit_events;
drop policy if exists "editors create audit" on public.audit_events;
drop policy if exists "approved users read notifications" on public.notifications;
drop policy if exists "approved users update notifications" on public.notifications;
drop policy if exists "editors create notifications" on public.notifications;
drop policy if exists "public creates storefront events" on public.storefront_events;
drop policy if exists "approved users read storefront events" on public.storefront_events;
create policy "approved users read leads"
on public.crm_leads for select to authenticated
using (public.is_approved_user());
create policy "editors manage leads"
on public.crm_leads for all to authenticated
using (public.can_edit())
with check (public.can_edit());
create policy "approved users read audit"
on public.audit_events for select to authenticated
using (public.is_approved_user());
create policy "editors create audit"
on public.audit_events for insert to authenticated
with check (public.can_edit());
create policy "approved users read notifications"
on public.notifications for select to authenticated
using (
  public.is_approved_user()
  and (
    user_id is null
    or user_id = auth.uid()
    or role_target is null
    or lower(role_target) in ('todos', 'all')
    or (lower(role_target) in ('admin', 'administrador') and public.is_admin())
    or (lower(role_target) in ('editor', 'edicao', 'edição') and public.can_edit())
  )
);
create policy "approved users update notifications"
on public.notifications for update to authenticated
using (public.is_approved_user())
with check (public.is_approved_user());
create policy "editors create notifications"
on public.notifications for insert to authenticated
with check (public.can_edit());
create policy "public creates storefront events"
on public.storefront_events for insert to anon, authenticated
with check (event_type in ('product_view', 'buy_click', 'quote_click', 'custom_quote'));
create policy "approved users read storefront events"
on public.storefront_events for select to authenticated
using (public.is_approved_user());
alter table public.crm_leads replica identity full;
alter table public.notifications replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_leads'
  ) then
    alter publication supabase_realtime add table public.crm_leads;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
