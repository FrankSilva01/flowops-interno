-- FlowOps SaaS hardening - permissoes por perfil dentro da empresa
-- Execute no Supabase SQL Editor depois do hardening de RLS por organizacao.
--
-- Matriz aplicada no banco:
-- - Administrador/admin/owner: le, cria, edita e exclui dados operacionais.
-- - Supervisor/Operador/Responsavel/Edicao: le, cria e edita dados operacionais.
-- - Leitura: apenas le dados da propria empresa.
-- - Tabelas de marketplace gerenciadas por Edge Functions continuam somente leitura no cliente.

create or replace function public.flowops_normalized_role(role_text text)
returns text
language sql
immutable
as $$
  select lower(
    replace(
      replace(
        replace(
          replace(coalesce(role_text, ''), 'ç', 'c'),
        'ã', 'a'),
      'á', 'a'),
    'é', 'e')
  );
$$;

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
      and lower(m.user_email) = lower(auth.jwt()->>'email')
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
      and lower(m.user_email) = lower(auth.jwt()->>'email')
      and coalesce(m.status, 'active') in ('active', 'trial', 'approved')
      and public.flowops_normalized_role(m.role) in ('administrador', 'admin', 'owner')
  );
$$;

create or replace function public.user_can_edit_organization(org uuid)
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
      and lower(m.user_email) = lower(auth.jwt()->>'email')
      and coalesce(m.status, 'active') in ('active', 'trial', 'approved')
      and public.flowops_normalized_role(m.role) in (
        'administrador', 'admin', 'owner',
        'supervisor', 'gestor', 'gerente',
        'operador', 'operacao', 'edicao', 'editor', 'equipe',
        'responsavel', 'responsible'
      )
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
        'create policy %I on public.%I for insert with check (public.user_can_edit_organization(organization_id))',
        t || '_insert_own_org', t
      );
      execute format(
        'create policy %I on public.%I for update using (public.user_can_edit_organization(organization_id)) with check (public.user_can_edit_organization(organization_id))',
        t || '_update_own_org', t
      );
      execute format(
        'create policy %I on public.%I for delete using (public.user_admin_in_organization(organization_id))',
        t || '_delete_own_org', t
      );
    end if;
  end loop;
end $$;

-- Diagnostico: informe um email real para conferir permissao por empresa.
-- select
--   public.user_in_organization('00000000-0000-0000-0000-000000000001') as can_read,
--   public.user_can_edit_organization('00000000-0000-0000-0000-000000000001') as can_edit,
--   public.user_admin_in_organization('00000000-0000-0000-0000-000000000001') as can_admin;
