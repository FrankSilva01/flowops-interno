begin;
alter table public.subscription_plans
  add column if not exists mercado_pago_init_point text,
  add column if not exists mercado_pago_status text,
  add column if not exists mercado_pago_synced_at timestamptz;
create table if not exists public.subscription_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  event_type text not null,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, event_key)
);
create unique index if not exists subscription_payments_provider_id_uidx
  on public.subscription_payments(provider, provider_payment_id);
create index if not exists subscription_webhook_events_created_idx
  on public.subscription_webhook_events(provider, created_at desc);
alter table public.subscription_webhook_events enable row level security;
revoke all on public.subscription_webhook_events from anon, authenticated;
commit;
