create or replace function public.user_has_org_capability(candidate_org uuid, capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = candidate_org
      and lower(member.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.status = 'active'
      and (
        lower(member.role) in ('administrador', 'admin', 'owner')
        or coalesce((member.permissions ->> capability)::boolean, false)
      )
  );
$$;

revoke all on function public.user_has_org_capability(uuid, text) from public;
grant execute on function public.user_has_org_capability(uuid, text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['orders', 'cash_entries', 'materials', 'inventory_items', 'products']
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop policy if exists %I on public.%I', table_name || '_delete_capability', table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.user_has_org_capability(organization_id, ''delete_records''))',
        table_name || '_delete_capability',
        table_name
      );
    end if;
  end loop;
end
$$;
