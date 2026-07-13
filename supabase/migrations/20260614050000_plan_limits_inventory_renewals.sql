begin;
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'Insumo',
  unit text not null default 'un.',
  quantity numeric not null default 0,
  minimum_quantity numeric not null default 0,
  unit_cost numeric not null default 0,
  supplier text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity >= 0),
  check (minimum_quantity >= 0),
  check (unit_cost >= 0)
);
create index if not exists inventory_items_org_name_idx
  on public.inventory_items(organization_id, name);
create index if not exists inventory_items_low_stock_idx
  on public.inventory_items(organization_id, quantity, minimum_quantity);
alter table public.inventory_items enable row level security;
grant select, insert, update, delete on public.inventory_items to authenticated;
drop policy if exists "inventory_items_tenant_read" on public.inventory_items;
drop policy if exists "inventory_items_tenant_write" on public.inventory_items;
create policy "inventory_items_tenant_read"
on public.inventory_items for select to authenticated
using (public.is_org_member(organization_id));
create policy "inventory_items_tenant_write"
on public.inventory_items for all to authenticated
using (public.can_edit_org(organization_id))
with check (public.can_edit_org(organization_id));
alter table public.notifications
  add column if not exists dismissed_at timestamptz;
create index if not exists notifications_visible_idx
  on public.notifications(organization_id, dismissed_at, created_at desc);
create or replace function public.organization_plan_limits(candidate_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(plan.limits, '{}'::jsonb)
  from public.organizations organization
  left join public.organization_subscriptions subscription
    on subscription.organization_id = organization.id
  left join public.subscription_plans plan
    on plan.code = coalesce(subscription.plan_code, organization.plan_code)
  where organization.id = candidate_organization_id
  limit 1;
$$;
create or replace function public.assert_organization_user_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_limit integer;
  current_users integer;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.organization_id = new.organization_id
    and old.status = 'active' then
    return new;
  end if;

  user_limit := coalesce((public.organization_plan_limits(new.organization_id)->>'users')::integer, 0);
  if user_limit <= 0 then
    return new;
  end if;

  select count(*) into current_users
  from public.organization_members member
  where member.organization_id = new.organization_id
    and member.status = 'active';

  if current_users >= user_limit then
    raise exception 'Limite de usuários do plano atingido (% de %). Remova um usuário ou altere o plano.',
      current_users, user_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists organization_members_plan_limit on public.organization_members;
create trigger organization_members_plan_limit
before insert or update of organization_id, status on public.organization_members
for each row execute function public.assert_organization_user_limit();
create or replace function public.assert_marketplace_sales_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sales_limit integer;
  current_sales integer;
begin
  sales_limit := coalesce((public.organization_plan_limits(new.organization_id)->>'marketplace_sales_month')::integer, 0);
  if sales_limit < 0 then
    return new;
  end if;

  select count(*) into current_sales
  from public.marketplace_order_links link
  where link.organization_id = new.organization_id
    and link.created_at >= date_trunc('month', now())
    and link.created_at < date_trunc('month', now()) + interval '1 month';

  if current_sales >= sales_limit then
    raise exception 'Limite mensal de vendas importadas atingido (% de %). Altere o plano para continuar importando.',
      current_sales, sales_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_sales_plan_limit on public.marketplace_order_links;
create trigger marketplace_sales_plan_limit
before insert on public.marketplace_order_links
for each row execute function public.assert_marketplace_sales_limit();
insert into public.saas_email_templates (code, name, subject, html_body)
values
  (
    'renewal_7_days',
    'Renovação em 7 dias',
    'Sua assinatura será renovada em 7 dias',
    '<h1>Renovação próxima</h1><p>O plano {{plan}} da empresa {{company}} será renovado em 7 dias por {{amount}}.</p><p>Método: {{payment_method}}</p>'
  ),
  (
    'renewal_1_day',
    'Renovação em 1 dia',
    'Sua assinatura será renovada amanhã',
    '<h1>Renovação amanhã</h1><p>O plano {{plan}} da empresa {{company}} será renovado amanhã por {{amount}}.</p><p>Método: {{payment_method}}</p>'
  )
on conflict (code) do update set
  name = excluded.name,
  subject = excluded.subject,
  html_body = excluded.html_body,
  active = true,
  updated_at = now();
commit;
