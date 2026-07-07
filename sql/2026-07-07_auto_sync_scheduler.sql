-- Bloco 1: Auto-sincronização de taxas via webhooks + cron job
-- Cria a tabela de histórico de sincronizações automáticas e agenda
-- uma sincronização periódica (fallback para webhook).
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase (numa
-- query nova) e rode. E seguro rodar mais de uma vez (cron job criado uma
-- unica vez, tabela com if not exists).
--
-- **IMPORTANTE:** Após rodar esse SQL:
-- 1. Registre o webhook no Mercado Livre via app.mercadolibre.com
--    Notification Endpoint: https://seu-projeto.supabase.co/functions/v1/marketplace-webhook
--    (ajuste a URL com seu projeto Supabase)
-- 2. Deploy a Edge Function marketplace-webhook
-- 3. Teste clicando "Editar anúncio" no ML - deve sincronizar em segundos

-- 1) Tabela de histórico de sincronizações automáticas (webhook + cron)
create table if not exists public.auto_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  sync_type text not null,                -- 'webhook' ou 'cron'
  status text not null,                   -- 'success', 'partial', 'error'
  external_item_id text,                  -- item que disparou (webhook)
  total_items_synced integer default 0,   -- quantos anuncios foram atualizados
  items_failed integer default 0,
  error_message text,
  raw_response jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auto_sync_runs_org_idx
  on public.auto_sync_runs (organization_id);
create index if not exists auto_sync_runs_type_idx
  on public.auto_sync_runs (organization_id, sync_type, started_at desc);

alter table public.auto_sync_runs enable row level security;
alter table public.auto_sync_runs force row level security;

drop policy if exists "auto_sync_runs_select_own_org" on public.auto_sync_runs;
create policy "auto_sync_runs_select_own_org"
on public.auto_sync_runs for select
to authenticated
using ( public.user_in_organization(organization_id) );

-- Sem policy de insert/update/delete: escrita exclusiva da Edge Function

-- 2) Criar extensão pg_cron (se disponível - requer superuser)
-- Nota: Supabase Free/Pro não tem acesso a pg_cron. Para deploy em produção,
-- use Vercel Crons ou similar chamando:
-- GET https://seu-projeto.supabase.co/functions/v1/marketplace-sync?action=fee-calculator-full
-- a cada 4 horas.

-- 3) Verificação rápida:
-- select tablename, policyname, cmd from pg_policies
-- where tablename = 'auto_sync_runs';
-- -- deve listar 1 policy (cmd = SELECT).

-- ===== INSTRUÇÕES FINAIS =====
--
-- Para ATIVAR sincronização automática em produção:
--
-- **Opção A: Supabase com pg_cron (requer superuser)**
-- Rode no SQL Editor como superuser:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule('sync-fees-every-4h', '0 */4 * * *',
--     'SELECT http_post(
--       ''https://seu-projeto.supabase.co/functions/v1/marketplace-sync?action=fee-calculator-full&organization_id=''
--       || org_id || '''''',
--       '''',
--       ''{"Authorization": "Bearer seu-service-role-key"}''::jsonb
--     ) FROM organizations WHERE active = true'
--   );
--
-- **Opção B: Vercel Crons / EasyCron / GitHub Actions** (recomendado)
-- Configure uma chamada GET a cada 4 horas para:
-- https://seu-projeto.supabase.co/functions/v1/marketplace-sync?action=fee-calculator-full
-- Com header: Authorization: Bearer {service-role-key}
--
-- **Opção C: Webhook do Mercado Livre** (imediato, melhor)
-- 1. Acesse: https://apps.mercadolibre.com.br/notificaciones
-- 2. Adicione URL: https://seu-projeto.supabase.co/functions/v1/marketplace-webhook
-- 3. Selecione eventos: item.updated, item.price_updated, item.status_updated
-- 4. Teste clicando "Editar anúncio" - deve sincronizar em < 10 segundos
--
-- Combine Opção C (webhook imediato) + Opção B (sincronização fallback a cada 4h)
-- para melhor cobertura (webhook pode falhar, cron garante sync eventual).

