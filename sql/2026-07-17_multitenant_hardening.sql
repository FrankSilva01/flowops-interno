-- FlowOps SaaS - Correcao de isolamento multi-tenant (2026-07-17)
-- Aplicar no SQL Editor do Supabase (producao).
--
-- IMPORTANTE: o estado real das policies foi inspecionado ao vivo em pg_policies
-- antes de escrever este arquivo. O bucket lead-files JA estava corrigido em
-- producao (policies lead_files_read_own_org / lead_files_write_own_org, que
-- validam via join com crm_leads por foldername[1]::uuid) - por isso NAO e
-- tocado aqui. As migrations versionadas do repo estavam desatualizadas.
--
-- Este script cobre o que ainda esta vulneravel/quebrado em producao:
--   1. system-backups: leitura por is_admin() GLOBAL -> admin de qualquer
--      empresa baixa o dump de qualquer outra. Re-escopar por org do path.
--   2. organization_subscriptions: insert/update por qualquer membro
--      (user_in_organization) -> bypass de paywall. Escrita e so de Edge
--      Functions (service_role) e da RPC request_subscription_plan_change
--      (SECURITY DEFINER); remover escrita de authenticated.
--   3. subscription_payments: insert/update por editores -> pagamento forjado.
--      Escrita e so de subscription-billing.ts (service_role).
--   4. storefront_events: "public creates storefront events" (INSERT anon/auth
--      sem checar organization_id) -> injecao de analytics em qualquer tenant.
--      A loja registra via Edge Function 'storefront' (service_role).
--   5. marketplace_documents: RLS forcado SEM policy = deny-all; a tela de
--      marketplace faz SELECT e recebe vazio. Recriar leitura por org.

begin;

-- =========================================================================
-- 1. STORAGE: system-backups   (path = {org_id}/{data}/flowops-{run}.json.gz)
--    Escrita: so service_role (ignora RLS). Leitura: admin da MESMA org.
-- =========================================================================
drop policy if exists "admins read backup storage" on storage.objects;

create policy "backups read own org"
on storage.objects for select to authenticated
using (
  bucket_id = 'system-backups'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and public.user_admin_in_organization(((storage.foldername(name))[1])::uuid)
);

-- =========================================================================
-- 2. BILLING: organization_subscriptions  (fecha o bypass de paywall)
--    SELECT permanece; remove insert/update/delete de authenticated.
-- =========================================================================
drop policy if exists "organization_subscriptions_insert_own_org" on public.organization_subscriptions;
drop policy if exists "organization_subscriptions_update_own_org" on public.organization_subscriptions;
drop policy if exists "organization_subscriptions_delete_own_org" on public.organization_subscriptions;

-- =========================================================================
-- 3. BILLING: subscription_payments  (impede pagamento forjado por editor)
--    SELECT permanece (historico na UI); remove escrita de authenticated.
-- =========================================================================
drop policy if exists "subscription_payments_insert_own_org" on public.subscription_payments;
drop policy if exists "subscription_payments_update_own_org" on public.subscription_payments;
drop policy if exists "subscription_payments_delete_own_org" on public.subscription_payments;

-- =========================================================================
-- 4. storefront_events: remover INSERT publico sem checagem de org.
--    storefront_events_insert_own_org (user_can_edit_organization) permanece.
-- =========================================================================
drop policy if exists "public creates storefront events" on public.storefront_events;

-- =========================================================================
-- 5. marketplace_documents: recriar SELECT por org (regressao deny-all).
--    Escrita continua so via Edge Function (service_role).
-- =========================================================================
drop policy if exists "marketplace_documents_select_own_org" on public.marketplace_documents;
create policy "marketplace_documents_select_own_org"
on public.marketplace_documents for select to authenticated
using (public.user_in_organization(organization_id));

commit;

-- =========================================================================
-- Verificacao (rode apos o commit).
-- =========================================================================
-- select schemaname, tablename, policyname, cmd, roles::text
-- from pg_policies
-- where (schemaname='storage' and tablename='objects'
--        and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%system-backups%')
--    or (schemaname='public' and tablename in
--        ('organization_subscriptions','subscription_payments','storefront_events','marketplace_documents'))
-- order by schemaname, tablename, cmd, policyname;
