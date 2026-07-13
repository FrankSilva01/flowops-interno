begin;
create table if not exists public.platform_admin_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  entity_type text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  message text,
  created_at timestamptz not null default now()
);
create index if not exists platform_admin_logs_created_idx
  on public.platform_admin_logs(created_at desc);
create index if not exists platform_admin_logs_org_idx
  on public.platform_admin_logs(organization_id, created_at desc);
alter table public.platform_admin_logs enable row level security;
grant select on public.platform_admin_logs to authenticated;
drop policy if exists "platform admins read administrative logs" on public.platform_admin_logs;
create policy "platform admins read administrative logs"
on public.platform_admin_logs
for select
to authenticated
using (public.is_platform_admin());
commit;
