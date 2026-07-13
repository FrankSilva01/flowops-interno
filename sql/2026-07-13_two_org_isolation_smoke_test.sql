-- FlowOps SaaS smoke test - isolamento entre duas empresas
-- Rode no Supabase SQL Editor autenticado como usuario A e depois como usuario B.
-- Substitua os UUIDs em todos os blocos `vars`.
-- Esperado:
-- - propria empresa retorna dados;
-- - outra empresa retorna 0 linhas;
-- - insert na outra empresa falha por RLS.

with vars as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as own_org,
    '00000000-0000-0000-0000-000000000002'::uuid as other_org
)
select 'own_orders' as check_name, count(*) as visible_rows
from public.orders
where organization_id = (select own_org from vars);

with vars as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as own_org,
    '00000000-0000-0000-0000-000000000002'::uuid as other_org
)
select 'other_org_orders_should_be_zero' as check_name, count(*) as visible_rows
from public.orders
where organization_id = (select other_org from vars);

with vars as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as own_org,
    '00000000-0000-0000-0000-000000000002'::uuid as other_org
)
select 'other_org_marketplace_accounts_should_be_zero' as check_name, count(*) as visible_rows
from public.marketplace_accounts
where organization_id = (select other_org from vars);

with vars as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as own_org,
    '00000000-0000-0000-0000-000000000002'::uuid as other_org
)
select 'other_org_fiscal_documents_should_be_zero' as check_name, count(*) as visible_rows
from public.fiscal_documents
where organization_id = (select other_org from vars);

-- Deve falhar quando o usuario atual nao for membro de other_org.
with vars as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as own_org,
    '00000000-0000-0000-0000-000000000002'::uuid as other_org
)
insert into public.orders (
  id, organization_id, description, status, charged, received, quantity
)
select 'RLS-SHOULD-FAIL', other_org, 'Teste indevido de isolamento', 'A preparar', 1, 0, 1
from vars;
