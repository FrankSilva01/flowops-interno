-- Bloco 1 (taxas reais por anuncio) + Bloco 2 (score de intencao de compra)
-- Cria listing_fee_sync (snapshot de taxas reais vindas da API do ML),
-- adiciona colunas de perguntas em listing_analytics (pro score de intencao)
-- e adiciona peso ao catalogo de produtos (pro calculo de frete por peso
-- quando nao ha frete real sincronizado).
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase (numa
-- query nova) e rode. E seguro rodar mais de uma vez (create or replace /
-- if not exists / add column if not exists).

-- 1) listing_fee_sync: mesmo padrao de listing_analytics - um snapshot novo
--    a cada sincronizacao, so a Edge Function (service_role) escreve, o
--    front so le.
create table if not exists public.listing_fee_sync (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  listing_id uuid references public.marketplace_listings(id) on delete set null,
  external_id text not null,
  marketplace text not null default 'Mercado Livre',
  listing_type_id text,              -- ex: 'gold_special' (premium), 'gold_pro' etc.
  category_id text,
  price numeric,
  real_fee_pct numeric,              -- comissao real (%) devolvida pela API
  real_fee_fixed numeric,            -- taxa fixa real (R$), quando aplicavel
  shipping_cost numeric,             -- custo de frete real
  shipping_subsidized numeric,       -- parte do frete subsidiada pelo vendedor
  free_shipping boolean default false,
  raw_payload jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists listing_fee_sync_org_idx
  on public.listing_fee_sync (organization_id);
create index if not exists listing_fee_sync_lookup_idx
  on public.listing_fee_sync (organization_id, marketplace, external_id, synced_at desc);

alter table public.listing_fee_sync enable row level security;
alter table public.listing_fee_sync force row level security;

drop policy if exists "listing_fee_sync_select_own_org" on public.listing_fee_sync;
create policy "listing_fee_sync_select_own_org"
on public.listing_fee_sync for select
to authenticated
using ( public.user_in_organization(organization_id) );

-- Sem policy de insert/update/delete para o client: escrita exclusiva da
-- Edge Function via service_role.

-- 2) listing_analytics ganha colunas de perguntas (pro score de intencao de
--    compra - "perguntas recentes" e um dos 5 componentes do score).
alter table public.listing_analytics
  add column if not exists questions_total integer default 0,
  add column if not exists questions_unanswered integer default 0;

-- 3) products ganha peso (kg), usado no calculo de frete por peso quando
--    nao ha frete real sincronizado (Bloco 1.A).
alter table public.products
  add column if not exists weight_kg numeric;

-- 4) Verificacao rapida (rode depois e confira o resultado):
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class where relname = 'listing_fee_sync';
-- -- as duas colunas devem estar "t" (true).
--
-- select tablename, policyname, cmd from pg_policies
-- where tablename = 'listing_fee_sync';
-- -- deve aparecer exatamente 1 policy (cmd = SELECT).
--
-- select column_name from information_schema.columns
-- where table_name = 'listing_analytics' and column_name like 'questions%';
-- -- deve listar questions_total e questions_unanswered.
--
-- select column_name from information_schema.columns
-- where table_name = 'products' and column_name = 'weight_kg';
