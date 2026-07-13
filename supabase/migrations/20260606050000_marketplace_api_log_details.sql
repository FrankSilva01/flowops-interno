alter table public.marketplace_sync_log
  add column if not exists external_item_id text,
  add column if not exists external_order_id text,
  add column if not exists internal_order_id text,
  add column if not exists actor_email text;
create index if not exists marketplace_sync_log_created_at_idx
  on public.marketplace_sync_log (created_at desc);
create index if not exists marketplace_sync_log_status_idx
  on public.marketplace_sync_log (status);
create index if not exists marketplace_sync_log_kind_idx
  on public.marketplace_sync_log (kind);
create index if not exists marketplace_sync_log_external_order_idx
  on public.marketplace_sync_log (marketplace, external_order_id);
create index if not exists marketplace_sync_log_internal_order_idx
  on public.marketplace_sync_log (internal_order_id);
