alter table public.marketplace_documents
  add column if not exists checksum_sha256 text,
  add column if not exists version integer not null default 1,
  add column if not exists verified_at timestamptz;

create table if not exists public.marketplace_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace text not null,
  external_order_id text not null,
  internal_order_id text references public.orders(id) on delete set null,
  document_type text not null,
  version integer not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text not null,
  external_document_id text,
  source text not null default 'marketplace',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, marketplace, external_order_id, document_type, version),
  unique (organization_id, storage_path)
);

create index if not exists marketplace_document_versions_order_idx
  on public.marketplace_document_versions (organization_id, external_order_id, document_type, version desc);

alter table public.marketplace_document_versions enable row level security;
alter table public.marketplace_document_versions force row level security;

drop policy if exists marketplace_document_versions_select_own_org on public.marketplace_document_versions;
create policy marketplace_document_versions_select_own_org
on public.marketplace_document_versions for select to authenticated
using (public.user_in_organization(organization_id));

grant select on public.marketplace_document_versions to authenticated;
grant all on public.marketplace_document_versions to service_role;

comment on table public.marketplace_document_versions is
  'Versoes imutaveis de documentos oficiais obtidos dos marketplaces.';

create or replace function public.update_organization_fiscal_profile(candidate_profile text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid := public.current_organization_id();
  normalized_profile text := lower(coalesce(candidate_profile, ''));
  updated_settings jsonb;
begin
  if organization_id is null or not public.user_admin_in_organization(organization_id) then
    raise exception 'Apenas administradores da empresa podem alterar o perfil fiscal.';
  end if;
  if normalized_profile not in ('unknown', 'non_contributor', 'contributor') then
    raise exception 'Perfil fiscal invalido.';
  end if;
  update public.organizations
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{fiscal_profile}', to_jsonb(normalized_profile), true),
      updated_at = now()
  where id = organization_id
  returning settings into updated_settings;
  return updated_settings;
end;
$$;

revoke all on function public.update_organization_fiscal_profile(text) from public;
grant execute on function public.update_organization_fiscal_profile(text) to authenticated;
