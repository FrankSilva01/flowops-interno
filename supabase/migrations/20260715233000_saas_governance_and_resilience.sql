begin;

alter table public.organization_members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.saas_support_tickets add column if not exists reference_code text;
alter table public.saas_support_tickets add column if not exists diagnostic_payload jsonb not null default '{}'::jsonb;
create unique index if not exists saas_support_reference_code_uidx on public.saas_support_tickets(reference_code) where reference_code is not null;
create or replace function public.assign_support_reference_code() returns trigger language plpgsql as $$
begin
  if new.reference_code is null then new.reference_code := 'SUP-' || upper(substr(replace(new.id::text,'-',''),1,8)); end if;
  return new;
end $$;
drop trigger if exists assign_support_reference_code_trigger on public.saas_support_tickets;
create trigger assign_support_reference_code_trigger before insert on public.saas_support_tickets
for each row execute function public.assign_support_reference_code();

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_email text not null,
  policy_code text not null,
  policy_version text not null,
  accepted boolean not null,
  accepted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists privacy_consents_org_idx on public.privacy_consents(organization_id,user_email,accepted_at desc);

create table if not exists public.organization_data_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_type text not null check (request_type in ('export','correction','deletion')),
  status text not null default 'requested' check (status in ('requested','reviewing','approved','completed','rejected','cancelled')),
  requested_by text not null,
  reason text,
  due_at timestamptz not null default (now() + interval '15 days'),
  completed_at timestamptz,
  result_storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organization_data_requests_org_idx on public.organization_data_requests(organization_id,status,created_at desc);

create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace text not null,
  job_type text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','retry','completed','dead_letter','cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(organization_id,marketplace,job_type,idempotency_key)
);
create index if not exists integration_jobs_due_idx on public.integration_jobs(status,next_attempt_at) where status in ('pending','retry');
create index if not exists integration_jobs_org_idx on public.integration_jobs(organization_id,created_at desc);

alter table public.privacy_consents enable row level security;
alter table public.privacy_consents force row level security;
alter table public.organization_data_requests enable row level security;
alter table public.organization_data_requests force row level security;
alter table public.integration_jobs enable row level security;
alter table public.integration_jobs force row level security;

drop policy if exists privacy_consents_read_own_org on public.privacy_consents;
create policy privacy_consents_read_own_org on public.privacy_consents for select to authenticated
using (public.user_in_organization(organization_id));
drop policy if exists privacy_consents_insert_own on public.privacy_consents;
create policy privacy_consents_insert_own on public.privacy_consents for insert to authenticated
with check (public.user_in_organization(organization_id) and lower(user_email) = lower(coalesce(auth.jwt()->>'email','')));
drop policy if exists data_requests_read_own_org on public.organization_data_requests;
create policy data_requests_read_own_org on public.organization_data_requests for select to authenticated
using (public.user_in_organization(organization_id));
drop policy if exists data_requests_insert_own_org on public.organization_data_requests;
create policy data_requests_insert_own_org on public.organization_data_requests for insert to authenticated
with check (public.user_in_organization(organization_id) and lower(requested_by) = lower(coalesce(auth.jwt()->>'email','')));
drop policy if exists integration_jobs_admin_read on public.integration_jobs;
create policy integration_jobs_admin_read on public.integration_jobs for select to authenticated
using (public.user_admin_in_organization(organization_id));

grant select,insert on public.privacy_consents, public.organization_data_requests to authenticated;
grant select on public.integration_jobs to authenticated;
grant all on public.privacy_consents, public.organization_data_requests, public.integration_jobs to service_role;

create or replace function public.save_onboarding_progress(candidate_step integer, candidate_completed boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid; current_settings jsonb;
begin
  select organization_id into org_id from public.organization_members
  where lower(user_email)=lower(coalesce(auth.jwt()->>'email','')) and status='active' order by updated_at desc limit 1;
  if org_id is null then raise exception 'Empresa nao encontrada.'; end if;
  select coalesce(settings,'{}'::jsonb) into current_settings from public.organizations where id=org_id for update;
  current_settings := current_settings || jsonb_build_object('onboarding_step', greatest(1,least(candidate_step,4)), 'onboarding_completed', candidate_completed, 'onboarding_updated_at', now());
  update public.organizations set settings=current_settings, updated_at=now() where id=org_id;
  return current_settings;
end $$;
grant execute on function public.save_onboarding_progress(integer,boolean) to authenticated;

create or replace function public.save_onboarding_company(candidate_name text, candidate_cnpj text, candidate_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid; current_settings jsonb;
begin
  select organization_id into org_id from public.organization_members
  where lower(user_email)=lower(coalesce(auth.jwt()->>'email','')) and status='active' and lower(role) in ('administrador','admin','owner') limit 1;
  if org_id is null then raise exception 'Permissao de administrador obrigatoria.'; end if;
  if length(trim(candidate_name)) < 2 then raise exception 'Nome da empresa invalido.'; end if;
  select coalesce(settings,'{}'::jsonb) into current_settings from public.organizations where id=org_id for update;
  current_settings := current_settings || jsonb_build_object('legal_name',trim(candidate_name),'cnpj',regexp_replace(coalesce(candidate_cnpj,''),'[^0-9]','','g'),'commercial_email',lower(trim(candidate_email)));
  update public.organizations set name=trim(candidate_name),settings=current_settings,updated_at=now() where id=org_id;
  return current_settings;
end $$;
grant execute on function public.save_onboarding_company(text,text,text) to authenticated;

create or replace function public.set_member_permissions(candidate_email text, candidate_permissions jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid; clean jsonb;
begin
  select organization_id into org_id from public.organization_members
  where lower(user_email)=lower(coalesce(auth.jwt()->>'email','')) and status='active' and lower(role) in ('administrador','admin','owner') limit 1;
  if org_id is null then raise exception 'Permissao de administrador obrigatoria.'; end if;
  clean := jsonb_strip_nulls(jsonb_build_object(
    'export_data', coalesce((candidate_permissions->>'export_data')::boolean,false),
    'delete_records', coalesce((candidate_permissions->>'delete_records')::boolean,false),
    'manage_finance', coalesce((candidate_permissions->>'manage_finance')::boolean,false),
    'manage_marketplaces', coalesce((candidate_permissions->>'manage_marketplaces')::boolean,false)
  ));
  update public.organization_members set permissions=clean,updated_at=now()
  where organization_id=org_id and lower(user_email)=lower(candidate_email);
  if not found then raise exception 'Usuario nao encontrado.'; end if;
  return clean;
end $$;
grant execute on function public.set_member_permissions(text,jsonb) to authenticated;

create or replace function public.update_data_retention(candidate_integration_days integer, candidate_support_days integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid; current_settings jsonb; integration_days integer; support_days integer;
begin
  select organization_id into org_id from public.organization_members
  where lower(user_email)=lower(coalesce(auth.jwt()->>'email','')) and status='active' and lower(role) in ('administrador','admin','owner') limit 1;
  if org_id is null then raise exception 'Permissao de administrador obrigatoria.'; end if;
  integration_days := greatest(30,least(coalesce(candidate_integration_days,90),365));
  support_days := greatest(30,least(coalesce(candidate_support_days,90),365));
  select coalesce(settings,'{}'::jsonb) into current_settings from public.organizations where id=org_id for update;
  current_settings := current_settings || jsonb_build_object('data_retention',jsonb_build_object('integration_job_days',integration_days,'support_diagnostic_days',support_days));
  update public.organizations set settings=current_settings,updated_at=now() where id=org_id;
  return current_settings;
end $$;
grant execute on function public.update_data_retention(integer,integer) to authenticated;

create or replace function public.cleanup_governance_records()
returns jsonb language plpgsql security definer set search_path = public as $$
declare jobs_deleted integer := 0; diagnostics_cleaned integer := 0;
begin
  delete from public.integration_jobs j using public.organizations o
  where o.id=j.organization_id and j.status in ('completed','cancelled')
    and j.updated_at < now() - make_interval(days => greatest(30,least(coalesce((o.settings#>>'{data_retention,integration_job_days}')::integer,90),365)));
  get diagnostics jobs_deleted = row_count;
  update public.saas_support_tickets t set diagnostic_payload='{}'::jsonb
  from public.organizations o where o.id=t.organization_id and t.status='Fechado' and t.diagnostic_payload <> '{}'::jsonb
    and t.closed_at < now() - make_interval(days => greatest(30,least(coalesce((o.settings#>>'{data_retention,support_diagnostic_days}')::integer,90),365)));
  get diagnostics diagnostics_cleaned = row_count;
  return jsonb_build_object('integration_jobs_deleted',jobs_deleted,'support_diagnostics_cleaned',diagnostics_cleaned);
end $$;
revoke all on function public.cleanup_governance_records() from public,anon,authenticated;
grant execute on function public.cleanup_governance_records() to service_role;

commit;
