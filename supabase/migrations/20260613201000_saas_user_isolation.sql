-- Isolamento complementar para usuarios e solicitacoes de acesso.

alter table public.approved_users
  add column if not exists organization_id uuid references public.organizations(id);
update public.approved_users
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;
alter table public.approved_users
  alter column organization_id set default public.current_organization_id(),
  alter column organization_id set not null;
update public.access_requests
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;
alter table public.access_requests
  alter column organization_id set default public.current_organization_id();
drop policy if exists "users can read own approval" on public.approved_users;
drop policy if exists "admins can manage approved users" on public.approved_users;
create policy "users read own approval"
on public.approved_users for select to authenticated
using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or public.is_platform_admin()
  or public.can_edit_org(organization_id)
);
create policy "organization admins manage approved users"
on public.approved_users for all to authenticated
using (public.is_platform_admin() or public.can_edit_org(organization_id))
with check (public.is_platform_admin() or public.can_edit_org(organization_id));
drop policy if exists "anyone can request access" on public.access_requests;
drop policy if exists "users can read own access request" on public.access_requests;
drop policy if exists "admins can update access requests" on public.access_requests;
create policy "users read own access request"
on public.access_requests for select to authenticated
using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or public.is_platform_admin()
  or (organization_id is not null and public.can_edit_org(organization_id))
);
create policy "organization admins update access requests"
on public.access_requests for update to authenticated
using (public.is_platform_admin() or (organization_id is not null and public.can_edit_org(organization_id)))
with check (public.is_platform_admin() or (organization_id is not null and public.can_edit_org(organization_id)));
