-- FlowOps SaaS hardening - RLS por organizacao
-- Execute no Supabase SQL Editor antes de abrir para clientes externos.
-- Objetivo: todo dado operacional com organization_id deve ficar isolado por
-- membership ativa. Tabelas de integracao escritas por Edge Functions ficam
-- somente leitura para o cliente web.

create or replace function public.user_in_organization(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_email = auth.jwt()->>'email'
      and coalesce(m.status, 'active') in ('active', 'trial', 'approved')
  );
$$;

create or replace function public.user_admin_in_organization(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_email = auth.jwt()->>'email'
      and coalesce(m.status, 'active') in ('active', 'trial', 'approved')
      and coalesce(m.role, '') in ('admin', 'owner')
  );
$$;

do $$
declare
  rw_tables text[] := array[
    'orders',
    'cash_entries',
    'materials',
    'inventory_items',
    'crm_leads',
    'audit_events',
    'notifications',
    'custom_tags',
    'lead_files',
    'backup_runs',
    'marketplace_reviews',
    'organization_subscriptions',
    'subscription_payments',
    'saas_support_tickets',
    'storefront_events',
    'order_history_events',
    'order_logistics',
    'logistics_events',
    'products',
    'product_listings',
    'financial_settings',
    'commercial_suggestions',
    'fiscal_documents',
    'purchase_invoices',
    'sales_invoices',
    'das_records',
    'weekly_summary_settings',
    'responsibles'
  ];
  readonly_tables text[] := array[
    'marketplace_accounts',
    'marketplace_documents',
    'marketplace_listings',
    'marketplace_order_links',
    'marketplace_sync_log',
    'listing_analytics',
    'seller_metrics',
    'listing_fee_sync',
    'auto_sync_runs'
  ];
  t text;
begin
  foreach t in array rw_tables loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = t
           and column_name = 'organization_id'
       ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force row level security', t);

      execute format('drop policy if exists %I on public.%I', t || '_select_own_org', t);
      execute format('drop policy if exists %I on public.%I', t || '_insert_own_org', t);
      execute format('drop policy if exists %I on public.%I', t || '_update_own_org', t);
      execute format('drop policy if exists %I on public.%I', t || '_delete_own_org', t);
      execute format('drop policy if exists %I on public.%I', t || '_tenant_read', t);
      execute format('drop policy if exists %I on public.%I', t || '_tenant_write', t);

      execute format(
        'create policy %I on public.%I for select using (public.user_in_organization(organization_id))',
        t || '_select_own_org', t
      );
      execute format(
        'create policy %I on public.%I for insert with check (public.user_in_organization(organization_id))',
        t || '_insert_own_org', t
      );
      execute format(
        'create policy %I on public.%I for update using (public.user_in_organization(organization_id)) with check (public.user_in_organization(organization_id))',
        t || '_update_own_org', t
      );
      execute format(
        'create policy %I on public.%I for delete using (public.user_admin_in_organization(organization_id))',
        t || '_delete_own_org', t
      );
    end if;
  end loop;

  foreach t in array readonly_tables loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = t
           and column_name = 'organization_id'
       ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force row level security', t);

      execute format('drop policy if exists %I on public.%I', t || '_select_own_org', t);
      execute format('drop policy if exists %I on public.%I', t || '_tenant_read', t);
      execute format('drop policy if exists %I on public.%I', t || '_tenant_write', t);
      execute format(
        'create policy %I on public.%I for select using (public.user_in_organization(organization_id))',
        t || '_select_own_org', t
      );
    end if;
  end loop;
end $$;

-- Memberships: usuario ve as empresas em que participa; admin/owner gerencia a propria empresa.
do $$
begin
  if to_regclass('public.organization_members') is not null then
    alter table public.organization_members enable row level security;
    alter table public.organization_members force row level security;

    drop policy if exists organization_members_select_self_or_own_org on public.organization_members;
    drop policy if exists organization_members_admin_manage_own_org on public.organization_members;

    create policy organization_members_select_self_or_own_org
      on public.organization_members
      for select
      using (user_email = auth.jwt()->>'email' or public.user_admin_in_organization(organization_id));

    create policy organization_members_admin_manage_own_org
      on public.organization_members
      for all
      using (public.user_admin_in_organization(organization_id))
      with check (public.user_admin_in_organization(organization_id));
  end if;
end $$;

-- Diagnostico rapido: deve retornar apenas tabelas org-scoped com RLS ativo.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(p.policyname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
  and exists (
    select 1
    from information_schema.columns col
    where col.table_schema = 'public'
      and col.table_name = c.relname
      and col.column_name = 'organization_id'
  )
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relname;
