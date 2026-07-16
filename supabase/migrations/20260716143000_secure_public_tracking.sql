alter table public.orders
  add column if not exists public_tracking_token uuid,
  add column if not exists public_tracking_enabled boolean not null default true;

update public.orders
set public_tracking_token = gen_random_uuid()
where public_tracking_token is null;

alter table public.orders
  alter column public_tracking_token set default gen_random_uuid(),
  alter column public_tracking_token set not null;

create unique index if not exists orders_public_tracking_token_uidx
  on public.orders (public_tracking_token);

comment on column public.orders.public_tracking_token is
  'Opaque capability token used only by the public tracking Edge Function.';

