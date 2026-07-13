begin;
create table if not exists public.subscription_plans (
  code text primary key,
  name text not null,
  price_monthly numeric(12,2) not null default 0,
  currency text not null default 'BRL',
  trial_days integer not null default 0,
  active boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  mercado_pago_plan_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.subscription_plans
  (code, name, price_monthly, trial_days, limits, features)
values
  (
    'free',
    'Gratuito',
    0,
    0,
    '{"users":1,"marketplace_sales_month":5}'::jsonb,
    '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":false,"shopee":false,"amazon":false,"automatic_backup":false,"full_audit":false,"white_label":false}'::jsonb
  ),
  (
    'starter',
    'Starter',
    49.90,
    14,
    '{"users":2,"marketplace_sales_month":30}'::jsonb,
    '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":true,"shopee":false,"amazon":false,"automatic_backup":true,"backup_frequency":"weekly","full_audit":true,"white_label":false}'::jsonb
  ),
  (
    'pro',
    'Pro',
    99.90,
    14,
    '{"users":5,"marketplace_sales_month":200}'::jsonb,
    '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":true,"shopee":true,"amazon":true,"automatic_backup":true,"backup_frequency":"automatic","full_audit":true,"white_label":"basic"}'::jsonb
  )
on conflict (code) do update set
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  currency = excluded.currency,
  trial_days = excluded.trial_days,
  active = excluded.active,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();
alter table public.organizations
  add column if not exists status text not null default 'active',
  add column if not exists plan_code text references public.subscription_plans(code),
  add column if not exists owner_email text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists settings jsonb not null default '{}'::jsonb;
update public.organizations
set plan_code = coalesce(plan_code, 'free')
where plan_code is null;
alter table public.organizations
  alter column plan_code set default 'free',
  alter column plan_code set not null;
create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  status text not null default 'active'
    check (status in ('free','trial','pending','active','past_due','paused','cancelled','suspended')),
  provider text not null default 'manual'
    check (provider in ('manual','mercado_pago')),
  provider_subscription_id text unique,
  provider_payer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  last_payment_status text,
  last_payment_at timestamptz,
  next_payment_at timestamptz,
  grace_ends_at timestamptz,
  administrative_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.organization_subscriptions
  (organization_id, plan_code, status, provider, trial_end, current_period_end)
select
  organization.id,
  organization.plan_code,
  case
    when organization.plan_code = 'free' then 'free'
    when organization.status = 'trial' then 'trial'
    when organization.status = 'suspended' then 'suspended'
    else 'active'
  end,
  'manual',
  organization.trial_ends_at,
  null
from public.organizations organization
on conflict (organization_id) do nothing;
create index if not exists organization_subscriptions_status_idx
  on public.organization_subscriptions(status, current_period_end);
create index if not exists organization_subscriptions_provider_idx
  on public.organization_subscriptions(provider, provider_subscription_id);
alter table public.subscription_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
grant select on public.subscription_plans to authenticated;
grant select on public.organization_subscriptions to authenticated;
drop policy if exists "authenticated read active plans" on public.subscription_plans;
create policy "authenticated read active plans"
on public.subscription_plans
for select
to authenticated
using (active = true);
drop policy if exists "members read own subscription" on public.organization_subscriptions;
create policy "members read own subscription"
on public.organization_subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = organization_subscriptions.organization_id
      and lower(member.user_email) = lower(auth.jwt() ->> 'email')
  )
);
commit;
