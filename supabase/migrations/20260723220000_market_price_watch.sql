-- Vigilância de preços de mercado (assistente IA): termos vigiados por
-- organização; a mediana do ML é checada diariamente pelo cliente via Edge
-- Function ai-web-search (mode market) e quedas geram notificação.

create table if not exists public.market_price_watches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  term text not null,
  last_median numeric,
  last_total integer,
  baseline_median numeric,
  threshold_pct numeric not null default 10,
  active boolean not null default true,
  last_checked_at timestamptz,
  created_by text default '',
  created_at timestamptz not null default now()
);

create index if not exists market_price_watches_org_active_idx
  on public.market_price_watches (organization_id, active);

alter table public.market_price_watches enable row level security;
alter table public.market_price_watches force row level security;

drop policy if exists market_price_watches_select on public.market_price_watches;
drop policy if exists market_price_watches_insert on public.market_price_watches;
drop policy if exists market_price_watches_update on public.market_price_watches;
drop policy if exists market_price_watches_delete on public.market_price_watches;

create policy market_price_watches_select on public.market_price_watches
for select to authenticated
using (public.user_in_organization(organization_id));

create policy market_price_watches_insert on public.market_price_watches
for insert to authenticated
with check (public.user_can_edit_organization(organization_id));

create policy market_price_watches_update on public.market_price_watches
for update to authenticated
using (public.user_can_edit_organization(organization_id))
with check (public.user_can_edit_organization(organization_id));

create policy market_price_watches_delete on public.market_price_watches
for delete to authenticated
using (public.user_can_edit_organization(organization_id));
