begin;
alter table public.organization_subscriptions
  add column if not exists last_payment_attempt_at timestamptz,
  add column if not exists last_payment_reason text,
  add column if not exists last_payment_id text,
  add column if not exists last_payment_status_detail text,
  add column if not exists billing_reconciled_at timestamptz;
alter table public.subscription_payments
  add column if not exists provider_invoice_id text,
  add column if not exists provider_charge_id text,
  add column if not exists status_detail text,
  add column if not exists failure_reason text,
  add column if not exists attempt_number integer not null default 0,
  add column if not exists attempted_at timestamptz;
update public.subscription_payments
set attempted_at = coalesce(attempted_at, paid_at, created_at)
where attempted_at is null;
create index if not exists subscription_payments_invoice_idx
  on public.subscription_payments(provider, provider_invoice_id, attempted_at desc);
create index if not exists organization_subscriptions_reconciliation_idx
  on public.organization_subscriptions(provider, next_payment_at, billing_reconciled_at);
commit;
