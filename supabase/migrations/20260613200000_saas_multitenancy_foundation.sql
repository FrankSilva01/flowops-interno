-- 3D.AFT SaaS - base multiempresa, conectores e administracao da plataforma.
-- Mantem todos os dados atuais vinculados a organizacao 3D.AFT.

create extension if not exists pgcrypto;
alter table public.organizations
  add column if not exists status text not null default 'active',
  add column if not exists plan_code text not null default 'starter',
  add column if not exists owner_email text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists settings jsonb not null default '{}'::jsonb;
update public.organizations
set owner_email = coalesce(owner_email, 'frankalves333@gmail.com'),
    contact_name = coalesce(contact_name, 'Franklin'),
    status = coalesce(status, 'active')
where id = '00000000-0000-0000-0000-000000000001';
alter table public.organization_members
  add column if not exists user_id uuid,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();
create table if not exists public.platform_admins (
  user_email text primary key,
  role text not null default 'super_admin',
  created_at timestamptz not null default now()
);
insert into public.platform_admins (user_email, role)
values ('frankalves333@gmail.com', 'super_admin')
on conflict (user_email) do update set role = excluded.role;
create table if not exists public.organization_connectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace text not null,
  status text not null default 'not_connected',
  mode text not null default 'oauth',
  external_account_id text,
  external_account_name text,
  last_sync_at timestamptz,
  last_error text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, marketplace)
);
insert into public.organization_connectors (organization_id, marketplace, status, mode)
select organization_id, marketplace, connection_status, connection_mode
from public.marketplace_accounts
on conflict (organization_id, marketplace) do update
set status = excluded.status, updated_at = now();
insert into public.organization_connectors (organization_id, marketplace, status, mode)
select org.id, provider.marketplace, 'awaiting_credentials', 'oauth'
from public.organizations org
cross join (values ('Shopee'), ('Amazon')) provider(marketplace)
on conflict (organization_id, marketplace) do nothing;
create table if not exists public.marketplace_oauth_states (
  state_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace text not null,
  requested_by text,
  return_url text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_oauth_states_expiry_idx
  on public.marketplace_oauth_states (expires_at);
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'orders',
    'cash_entries',
    'materials',
    'responsibles',
    'order_history_events',
    'crm_leads',
    'audit_events',
    'notifications',
    'storefront_events',
    'custom_tags',
    'lead_files',
    'marketplace_reviews',
    'backup_runs'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists organization_id uuid references public.organizations(id)',
      target_table
    );
    execute format(
      'update public.%I set organization_id = %L where organization_id is null',
      target_table,
      '00000000-0000-0000-0000-000000000001'
    );
    execute format(
      'alter table public.%I alter column organization_id set default %L',
      target_table,
      '00000000-0000-0000-0000-000000000001'
    );
    execute format(
      'alter table public.%I alter column organization_id set not null',
      target_table
    );
  end loop;
end $$;
alter table public.access_requests
  add column if not exists organization_id uuid references public.organizations(id);
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where lower(user_email) = lower(auth.jwt() ->> 'email')
  );
$$;
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where lower(user_email) = lower(auth.jwt() ->> 'email')
    and status = 'active'
  order by created_at
  limit 1;
$$;
create or replace function public.is_org_member(candidate_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where organization_id = candidate_organization_id
      and lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
  );
$$;
create or replace function public.can_edit_org(candidate_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where organization_id = candidate_organization_id
      and lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
      and lower(role) in ('administrador', 'admin', 'edicao', 'edicao', 'editor', 'equipe', 'owner')
  );
$$;
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
      and lower(role) in ('administrador', 'admin', 'owner')
  );
$$;
create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
  );
$$;
create or replace function public.can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
      and lower(role) in ('administrador', 'admin', 'edicao', 'editor', 'equipe', 'owner')
  );
$$;
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'orders',
    'cash_entries',
    'materials',
    'responsibles',
    'order_history_events',
    'crm_leads',
    'audit_events',
    'notifications',
    'custom_tags',
    'lead_files',
    'backup_runs',
    'marketplace_accounts',
    'marketplace_order_links',
    'marketplace_listings',
    'marketplace_sync_log',
    'marketplace_documents'
  ]
  loop
    execute format(
      'alter table public.%I alter column organization_id set default public.current_organization_id()',
      target_table
    );
  end loop;
end $$;
-- A restricao antiga impedia duas empresas de usarem o mesmo codigo externo.
alter table public.marketplace_accounts
  drop constraint if exists marketplace_accounts_marketplace_external_seller_id_key;
alter table public.marketplace_order_links
  drop constraint if exists marketplace_order_links_marketplace_external_order_id_key;
alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_marketplace_external_id_key;
create unique index if not exists marketplace_accounts_org_provider_seller_uidx
  on public.marketplace_accounts (organization_id, marketplace, external_seller_id);
create unique index if not exists marketplace_order_links_org_provider_order_uidx
  on public.marketplace_order_links (organization_id, marketplace, external_order_id);
create unique index if not exists marketplace_listings_org_provider_item_uidx
  on public.marketplace_listings (organization_id, marketplace, external_id);
create index if not exists organization_members_email_idx
  on public.organization_members (lower(user_email), status);
alter table public.platform_admins enable row level security;
alter table public.organization_connectors enable row level security;
alter table public.marketplace_oauth_states enable row level security;
grant select on public.platform_admins to authenticated;
grant select, insert, update, delete on public.organization_connectors to authenticated;
drop policy if exists "platform admins read platform admins" on public.platform_admins;
create policy "platform admins read platform admins"
on public.platform_admins for select to authenticated
using (public.is_platform_admin());
drop policy if exists "members read connectors" on public.organization_connectors;
drop policy if exists "admins manage connectors" on public.organization_connectors;
create policy "members read connectors"
on public.organization_connectors for select to authenticated
using (public.is_org_member(organization_id));
create policy "admins manage connectors"
on public.organization_connectors for all to authenticated
using (public.can_edit_org(organization_id))
with check (public.can_edit_org(organization_id));
-- Substitui as politicas permissivas das tabelas operacionais por isolamento real.
do $$
declare
  target_table text;
  policy_record record;
begin
  foreach target_table in array array[
    'orders',
    'cash_entries',
    'materials',
    'responsibles',
    'order_history_events',
    'crm_leads',
    'audit_events',
    'notifications',
    'custom_tags',
    'lead_files',
    'backup_runs',
    'marketplace_accounts',
    'marketplace_order_links',
    'marketplace_listings',
    'marketplace_sync_log',
    'marketplace_documents'
  ]
  loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, target_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))',
      target_table || '_tenant_read',
      target_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.can_edit_org(organization_id)) with check (public.can_edit_org(organization_id))',
      target_table || '_tenant_write',
      target_table
    );
  end loop;
end $$;
-- Eventos e avaliacoes continuam publicos para a vitrine, mas isolados por empresa.
drop policy if exists "public creates storefront events" on public.storefront_events;
drop policy if exists "approved users read storefront events" on public.storefront_events;
create policy "public creates storefront events"
on public.storefront_events for insert to anon, authenticated
with check (event_type in ('product_view', 'buy_click', 'quote_click', 'custom_quote'));
create policy "members read storefront events"
on public.storefront_events for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists "public reads published reviews" on public.marketplace_reviews;
drop policy if exists "admins manage reviews" on public.marketplace_reviews;
create policy "public reads published reviews"
on public.marketplace_reviews for select to anon, authenticated
using (status = 'published');
create policy "admins manage reviews"
on public.marketplace_reviews for all to authenticated
using (public.can_edit_org(organization_id))
with check (public.can_edit_org(organization_id));
-- Membros veem a propria empresa; somente o painel mestre administra todas.
drop policy if exists "members read own organization" on public.organizations;
drop policy if exists "platform admins manage organizations" on public.organizations;
create policy "members read own organization"
on public.organizations for select to authenticated
using (public.is_platform_admin() or public.is_org_member(id));
create policy "platform admins manage organizations"
on public.organizations for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());
drop policy if exists "members read own membership" on public.organization_members;
drop policy if exists "organization admins manage members" on public.organization_members;
create policy "members read organization memberships"
on public.organization_members for select to authenticated
using (public.is_platform_admin() or public.is_org_member(organization_id));
create policy "organization admins manage members"
on public.organization_members for all to authenticated
using (public.is_platform_admin() or public.can_edit_org(organization_id))
with check (public.is_platform_admin() or public.can_edit_org(organization_id));
