-- Allow updates to existing active memberships while still blocking new users
-- and reactivations that exceed the subscription plan limit.
create or replace function public.enforce_organization_member_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_limit integer;
  active_count integer;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.organization_id = new.organization_id
     and old.status = 'active' then
    return new;
  end if;

  select users_limit
    into plan_limit
  from public.organization_plan_limits(new.organization_id);

  if coalesce(plan_limit, 0) <= 0 then
    return new;
  end if;

  select count(*)
    into active_count
  from public.organization_members
  where organization_id = new.organization_id
    and status = 'active';

  if active_count >= plan_limit then
    raise exception 'Limite de usuarios do plano atingido (% de %).', active_count, plan_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
