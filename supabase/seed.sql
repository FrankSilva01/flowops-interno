-- Reference-only data. Customer and production records are never stored here.
insert into public.subscription_plans
  (code, name, price_monthly, currency, trial_days, active, limits, features)
values
  ('free', 'Gratuito', 0, 'BRL', 0, true,
    '{"users":1,"marketplace_sales_month":5}'::jsonb,
    '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":false,"shopee":false,"amazon":false,"automatic_backup":false,"full_audit":false,"white_label":false}'::jsonb),
  ('starter', 'Starter - Homologacao', 1, 'BRL', 14, true,
    '{"users":2,"marketplace_sales_month":30}'::jsonb,
    '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":true,"shopee":false,"amazon":false,"automatic_backup":true,"backup_frequency":"weekly","full_audit":true,"white_label":false}'::jsonb),
  ('pro', 'Pro - Homologacao', 1, 'BRL', 14, true,
    '{"users":5,"marketplace_sales_month":200}'::jsonb,
    '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":true,"shopee":true,"amazon":true,"automatic_backup":true,"backup_frequency":"automatic","full_audit":true,"white_label":"basic"}'::jsonb),
  ('enterprise', 'Enterprise - Homologacao', 0, 'BRL', 14, true,
    '{"users":25,"marketplace_sales_month":2000}'::jsonb,
    '{"kanban":true,"orders":true,"leads":true,"dashboard":true,"storefront":true,"mercado_livre":true,"shopee":true,"amazon":true,"automatic_backup":true,"backup_frequency":"daily","full_audit":true,"white_label":"basic","priority_support":true}'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  currency = excluded.currency,
  trial_days = excluded.trial_days,
  active = excluded.active,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();
