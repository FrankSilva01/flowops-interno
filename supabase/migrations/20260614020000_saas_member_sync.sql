begin;
insert into public.organization_members (
  organization_id,
  user_email,
  role,
  status,
  created_at,
  updated_at
)
select
  approved.organization_id,
  lower(approved.email),
  coalesce(approved.role, 'Leitura'),
  'active',
  coalesce(approved.approved_at, now()),
  now()
from public.approved_users approved
on conflict (organization_id, user_email) do update set
  role = excluded.role,
  status = 'active',
  updated_at = now();
commit;
