begin;
insert into public.subscription_plans (
  code,
  name,
  price_monthly,
  trial_days,
  active,
  limits,
  features
)
values (
  'enterprise',
  'Enterprise',
  0,
  14,
  true,
  '{"users":25,"marketplace_sales_month":2000}'::jsonb,
  '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":true,"shopee":true,"amazon":true,"automatic_backup":true,"backup_frequency":"daily","full_audit":true,"white_label":"advanced","priority_support":true}'::jsonb
)
on conflict (code) do update set
  name = excluded.name,
  trial_days = excluded.trial_days,
  active = true,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();
commit;
