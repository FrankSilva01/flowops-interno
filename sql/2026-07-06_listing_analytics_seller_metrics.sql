-- Inteligencia Comercial - "centro de comando" do marketplace
-- Cria as duas tabelas novas pedidas: listing_analytics (snapshots historicos
-- de performance/competitividade por anuncio) e seller_metrics (reputacao do
-- vendedor por marketplace). So a Edge Function (service_role) escreve nelas;
-- o front so le, por isso as policies abaixo cobrem apenas SELECT.
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e rode.
-- E seguro rodar mais de uma vez (create or replace / if not exists).

-- 1) Helper de tenant, reaproveitando o padrao ja documentado em
--    auditoria-rls-flowops.md. "create or replace" nao quebra nada se a
--    funcao ja existir com a mesma logica.
create or replace function public.user_in_organization(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members m
    where m.organization_id = org
      and m.user_email = auth.jwt()->>'email'
      and m.status = 'active'
  );
$$;

-- 2) listing_analytics: um snapshot novo a cada sincronizacao (o historico
--    e a propria tabela crescendo - nao precisa de tabela separada pra
--    comparar semana a semana, so filtrar por periodo/synced_at).
create table if not exists public.listing_analytics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  listing_id uuid references public.marketplace_listings(id) on delete set null,
  external_id text not null,
  marketplace text not null default 'Mercado Livre',
  period_start timestamptz not null,
  period_end timestamptz not null,
  visits integer default 0,
  sold_quantity integer default 0,
  conversion_rate numeric,
  revenue numeric,
  avg_ticket numeric,
  price_position_avg numeric,
  price_position_median numeric,
  price_position_min numeric,
  price_position_max numeric,
  price_competitiveness text,        -- 'above' | 'below' | 'average'
  search_position integer,           -- null = fora do top 50 pesquisados
  category_trend text,               -- 'up' | 'stable' | 'down'
  health_score numeric,
  health_checklist jsonb,            -- {fotos, descricao, ficha_tecnica, video} - heuristico
  raw_summary jsonb,                 -- resumo agregado (NUNCA a lista de concorrentes)
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists listing_analytics_org_idx
  on public.listing_analytics (organization_id);
create index if not exists listing_analytics_listing_lookup_idx
  on public.listing_analytics (organization_id, marketplace, external_id, synced_at desc);

alter table public.listing_analytics enable row level security;
alter table public.listing_analytics force row level security;

drop policy if exists "listing_analytics_select_own_org" on public.listing_analytics;
create policy "listing_analytics_select_own_org"
on public.listing_analytics for select
to authenticated
using ( public.user_in_organization(organization_id) );

-- Sem policy de insert/update/delete para o client: essa tabela e escrita
-- exclusivamente pela Edge Function via service_role (que ignora RLS).

-- 3) seller_metrics: um registro por organizacao+marketplace, atualizado
--    (upsert) a cada sync de reputacao (no maximo 1x/dia).
create table if not exists public.seller_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  marketplace text not null,
  seller_level text,
  claims_rate numeric,
  delayed_rate numeric,
  cancellation_rate numeric,
  total_sales integer,
  raw_payload jsonb,
  synced_at timestamptz not null default now(),
  unique (organization_id, marketplace)
);

alter table public.seller_metrics enable row level security;
alter table public.seller_metrics force row level security;

drop policy if exists "seller_metrics_select_own_org" on public.seller_metrics;
create policy "seller_metrics_select_own_org"
on public.seller_metrics for select
to authenticated
using ( public.user_in_organization(organization_id) );

-- 4) Verificacao rapida (rode depois e confira o resultado):
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class where relname in ('listing_analytics', 'seller_metrics');
-- -- as duas colunas devem estar "t" (true) nas duas tabelas.
--
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('listing_analytics', 'seller_metrics');
-- -- deve aparecer exatamente 1 policy (cmd = SELECT) por tabela.
