create extension if not exists pgcrypto;
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', '3D.AFT', '3d-aft')
on conflict (id) do nothing;
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_email text not null,
  role text not null default 'Administrador',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_email)
);
insert into public.organization_members (organization_id, user_email, role)
select
  '00000000-0000-0000-0000-000000000001',
  lower(email),
  coalesce(role, 'Leitura')
from public.approved_users
on conflict (organization_id, user_email)
do update set role = excluded.role;
alter table public.marketplace_accounts
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists connection_status text not null default 'connected',
  add column if not exists connection_mode text not null default 'oauth';
alter table public.marketplace_order_links
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.marketplace_listings
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.marketplace_sync_log
  add column if not exists organization_id uuid references public.organizations(id);
update public.marketplace_accounts
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;
update public.marketplace_order_links
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;
update public.marketplace_listings
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;
update public.marketplace_sync_log
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;
alter table public.marketplace_accounts
  alter column organization_id set default '00000000-0000-0000-0000-000000000001',
  alter column organization_id set not null;
alter table public.marketplace_order_links
  alter column organization_id set default '00000000-0000-0000-0000-000000000001',
  alter column organization_id set not null;
alter table public.marketplace_listings
  alter column organization_id set default '00000000-0000-0000-0000-000000000001',
  alter column organization_id set not null;
alter table public.marketplace_sync_log
  alter column organization_id set default '00000000-0000-0000-0000-000000000001',
  alter column organization_id set not null;
create table if not exists public.marketplace_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references public.organizations(id) on delete cascade,
  marketplace text not null,
  external_order_id text not null,
  internal_order_id text references public.orders(id) on delete set null,
  document_type text not null,
  status text not null default 'pending',
  external_document_id text,
  mime_type text,
  file_name text,
  last_error text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, marketplace, external_order_id, document_type)
);
create index if not exists marketplace_documents_order_idx
  on public.marketplace_documents (organization_id, marketplace, external_order_id);
create index if not exists marketplace_documents_status_idx
  on public.marketplace_documents (status, updated_at desc);
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.marketplace_documents enable row level security;
grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.marketplace_documents to authenticated;
create policy "members read own organization"
on public.organizations
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = organizations.id
      and lower(member.user_email) = lower(auth.jwt() ->> 'email')
  )
);
create policy "members read own membership"
on public.organization_members
for select
to authenticated
using (lower(user_email) = lower(auth.jwt() ->> 'email'));
create policy "members read marketplace documents"
on public.marketplace_documents
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = marketplace_documents.organization_id
      and lower(member.user_email) = lower(auth.jwt() ->> 'email')
  )
);
