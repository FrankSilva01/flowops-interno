alter table public.orders
  add column if not exists quantity integer not null default 1;
alter table public.orders
  drop constraint if exists orders_quantity_positive;
alter table public.orders
  add constraint orders_quantity_positive check (quantity >= 1);
