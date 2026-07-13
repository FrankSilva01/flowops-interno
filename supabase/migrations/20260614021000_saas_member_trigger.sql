begin;
create or replace function public.sync_approved_user_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.organization_members
    set status = 'inactive',
        updated_at = now()
    where organization_id = old.organization_id
      and lower(user_email) = lower(old.email);
    return old;
  end if;

  insert into public.organization_members (
    organization_id,
    user_email,
    role,
    status,
    created_at,
    updated_at
  )
  values (
    new.organization_id,
    lower(new.email),
    coalesce(new.role, 'Leitura'),
    'active',
    coalesce(new.approved_at, now()),
    now()
  )
  on conflict (organization_id, user_email) do update set
    role = excluded.role,
    status = 'active',
    updated_at = now();

  return new;
end;
$$;
drop trigger if exists approved_users_sync_membership on public.approved_users;
create trigger approved_users_sync_membership
after insert or update or delete on public.approved_users
for each row execute function public.sync_approved_user_membership();
commit;
