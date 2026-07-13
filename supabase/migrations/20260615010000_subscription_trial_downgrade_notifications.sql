alter table public.organization_subscriptions
  add column if not exists pending_plan_code text references public.subscription_plans(code),
  add column if not exists pending_plan_effective_at timestamptz,
  add column if not exists pending_deactivate_users jsonb not null default '[]'::jsonb;
alter table public.subscription_change_requests
  add column if not exists effective_at timestamptz,
  add column if not exists change_type text;
create index if not exists organization_subscriptions_pending_plan_idx
  on public.organization_subscriptions(pending_plan_effective_at)
  where pending_plan_code is not null;
update public.organization_subscriptions s
set
  status = 'trial',
  trial_start = coalesce(s.trial_start, s.created_at, now()),
  trial_end = coalesce(s.trial_end, s.created_at + make_interval(days => greatest(coalesce(p.trial_days, 14), 1))),
  current_period_start = coalesce(s.current_period_start, s.created_at, now()),
  current_period_end = coalesce(s.current_period_end, s.created_at + make_interval(days => greatest(coalesce(p.trial_days, 14), 1))),
  updated_at = now()
from public.subscription_plans p
where s.plan_code = p.code
  and s.status = 'pending'
  and s.provider_subscription_id is null
  and coalesce((s.metadata ->> 'source'), '') = 'landing_page';
update public.organizations o
set
  status = 'trial',
  trial_ends_at = s.trial_end,
  updated_at = now()
from public.organization_subscriptions s
where s.organization_id = o.id
  and s.status = 'trial'
  and o.status = 'pending';
delete from public.notifications
where related_entity = 'access_request'
  and related_entity_id in (
    select email from public.access_requests where status <> 'pending'
  );
