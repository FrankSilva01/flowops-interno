begin;
alter table public.saas_email_outbox
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists provider_message_id text,
  add column if not exists provider_response jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
create table if not exists public.saas_email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references public.saas_email_outbox(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete cascade,
  recipient_email text not null,
  template_code text,
  provider text not null default 'brevo',
  status text not null,
  attempt integer not null default 1,
  provider_message_id text,
  error_message text,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists saas_email_delivery_logs_created_idx
  on public.saas_email_delivery_logs(created_at desc);
create index if not exists saas_email_delivery_logs_status_idx
  on public.saas_email_delivery_logs(status, created_at desc);
create index if not exists saas_email_retry_idx
  on public.saas_email_outbox(status, next_attempt_at, attempts);
create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_email text,
  type text not null default 'system',
  title text not null,
  message text,
  related_entity text,
  related_entity_id text,
  organization_id uuid references public.organizations(id) on delete cascade,
  priority text not null default 'normal',
  is_read boolean not null default false,
  read_at timestamptz,
  dismissed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_notifications_visible_idx
  on public.platform_notifications(dismissed_at, is_read, created_at desc);
alter table public.platform_notifications enable row level security;
alter table public.saas_email_delivery_logs enable row level security;
grant select, update on public.platform_notifications to authenticated;
grant select on public.saas_email_delivery_logs to authenticated;
drop policy if exists "platform admins manage notifications" on public.platform_notifications;
create policy "platform admins manage notifications"
on public.platform_notifications
for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());
drop policy if exists "platform admins read email delivery logs" on public.saas_email_delivery_logs;
create policy "platform admins read email delivery logs"
on public.saas_email_delivery_logs
for select to authenticated
using (public.is_platform_admin());
create table if not exists public.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by text not null,
  current_plan_code text not null,
  requested_plan_code text not null references public.subscription_plans(code),
  status text not null default 'pending',
  validation_snapshot jsonb not null default '{}'::jsonb,
  rejection_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create index if not exists subscription_change_requests_org_idx
  on public.subscription_change_requests(organization_id, created_at desc);
alter table public.subscription_change_requests enable row level security;
grant select on public.subscription_change_requests to authenticated;
drop policy if exists "members read own plan requests" on public.subscription_change_requests;
create policy "members read own plan requests"
on public.subscription_change_requests
for select to authenticated
using (public.is_platform_admin() or public.is_org_member(organization_id));
create or replace function public.request_subscription_plan_change(target_plan_code text)
returns public.subscription_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  requester text;
  current_plan text;
  target_plan public.subscription_plans%rowtype;
  active_users integer;
  sales_month integer;
  request_row public.subscription_change_requests%rowtype;
begin
  requester := lower(coalesce(auth.jwt() ->> 'email', ''));
  if requester = '' then
    raise exception 'Autenticacao obrigatoria.';
  end if;

  select organization_id
    into org_id
  from public.organization_members
  where lower(user_email) = requester
    and status = 'active'
  order by created_at
  limit 1;

  if org_id is null then
    raise exception 'Empresa nao encontrada para o usuario.';
  end if;

  select coalesce(s.plan_code, o.plan_code, 'free')
    into current_plan
  from public.organizations o
  left join public.organization_subscriptions s on s.organization_id = o.id
  where o.id = org_id;

  select *
    into target_plan
  from public.subscription_plans
  where code = target_plan_code
    and active = true;

  if target_plan.code is null then
    raise exception 'Plano solicitado nao esta disponivel.';
  end if;

  if target_plan.code = current_plan then
    raise exception 'Este ja e o plano atual.';
  end if;

  select count(*) into active_users
  from (
    select lower(user_email) as email
    from public.organization_members
    where organization_id = org_id and status = 'active'
    union
    select lower(email)
    from public.approved_users
    where organization_id = org_id
  ) active_emails;

  select count(*) into sales_month
  from public.marketplace_order_links
  where organization_id = org_id
    and created_at >= date_trunc('month', now());

  if coalesce((target_plan.limits ->> 'users')::integer, 0) > 0
     and active_users > (target_plan.limits ->> 'users')::integer then
    raise exception 'Usuarios acima do plano solicitado. Exclua % usuario(s) para prosseguir.',
      active_users - (target_plan.limits ->> 'users')::integer;
  end if;

  if coalesce((target_plan.limits ->> 'marketplace_sales_month')::integer, 0) >= 0
     and sales_month > (target_plan.limits ->> 'marketplace_sales_month')::integer then
    raise exception 'Uso mensal acima do limite do plano solicitado.';
  end if;

  insert into public.subscription_change_requests (
    organization_id,
    requested_by,
    current_plan_code,
    requested_plan_code,
    validation_snapshot
  ) values (
    org_id,
    requester,
    current_plan,
    target_plan.code,
    jsonb_build_object(
      'active_users', active_users,
      'marketplace_sales_month', sales_month,
      'target_limits', target_plan.limits
    )
  )
  returning * into request_row;

  insert into public.platform_notifications (
    type, title, message, related_entity, related_entity_id, organization_id, priority
  ) values (
    'subscription',
    'Solicitacao de alteracao de plano',
    requester || ' solicitou alteracao de ' || current_plan || ' para ' || target_plan.code || '.',
    'subscription_change_request',
    request_row.id::text,
    org_id,
    'normal'
  );

  return request_row;
end;
$$;
grant execute on function public.request_subscription_plan_change(text) to authenticated;
create or replace function public.notify_platform_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.platform_notifications (
    type, title, message, related_entity, related_entity_id, organization_id, priority
  ) values (
    'support',
    'Novo chamado de suporte',
    new.subject || ' - ' || coalesce(new.created_by, 'Cliente'),
    'support_ticket',
    new.id::text,
    new.organization_id,
    case when new.priority = 'Urgente' then 'high' else 'normal' end
  );
  return new;
end;
$$;
drop trigger if exists platform_support_ticket_notification on public.saas_support_tickets;
create trigger platform_support_ticket_notification
after insert on public.saas_support_tickets
for each row execute function public.notify_platform_support_ticket();
create or replace function public.notify_platform_connector_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'error' and (tg_op = 'INSERT' or old.status is distinct from 'error') then
    insert into public.platform_notifications (
      type, title, message, related_entity, related_entity_id, organization_id, priority
    ) values (
      'integration',
      'Integracao com erro',
      new.marketplace || ': ' || coalesce(new.last_error, 'Falha nao informada'),
      'organization_connector',
      new.organization_id::text || ':' || new.marketplace,
      new.organization_id,
      'high'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists platform_connector_error_notification on public.organization_connectors;
create trigger platform_connector_error_notification
after insert or update on public.organization_connectors
for each row execute function public.notify_platform_connector_error();
create or replace function public.notify_platform_backup_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'error' then
    insert into public.platform_notifications (
      type, title, message, related_entity, related_entity_id, organization_id, priority
    ) values (
      'backup',
      'Backup falhou',
      coalesce(new.error_message, 'Falha ao executar backup.'),
      'backup_run',
      new.id::text,
      new.organization_id,
      'high'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists platform_backup_error_notification on public.backup_runs;
create trigger platform_backup_error_notification
after insert or update on public.backup_runs
for each row execute function public.notify_platform_backup_error();
insert into public.saas_email_templates (code, name, subject, html_body)
values
  ('welcome', 'Boas-vindas', 'Bem-vindo ao 3D.AFT', '<h1>Bem-vindo, {{name}}</h1><p>A empresa {{company}} ja pode acessar o 3D.AFT.</p>'),
  ('password_recovery', 'Recuperacao de senha', 'Recupere sua senha do 3D.AFT', '<h1>Recuperacao de senha</h1><p><a href="{{recovery_url}}">Clique aqui para definir uma nova senha.</a></p>'),
  ('trial_ending', 'Trial expirando', 'Seu periodo de teste esta terminando', '<h1>Seu teste termina em {{days}} dia(s)</h1><p>Escolha um plano para continuar usando o 3D.AFT.</p>'),
  ('trial_expired', 'Trial encerrado', 'Seu periodo de teste terminou', '<h1>Periodo de teste encerrado</h1><p>Escolha um plano para reativar todos os recursos.</p>'),
  ('payment_approved', 'Pagamento aprovado', 'Pagamento aprovado', '<h1>Pagamento aprovado</h1><p>Recebemos {{amount}} e sua assinatura esta ativa.</p>'),
  ('payment_declined', 'Pagamento recusado', 'Nao foi possivel aprovar o pagamento', '<h1>Pagamento recusado</h1><p>Atualize seus dados de pagamento para evitar a suspensao.</p>'),
  ('subscription_suspended', 'Assinatura suspensa', 'Sua assinatura foi suspensa', '<h1>Assinatura suspensa</h1><p>Regularize o pagamento para reativar o acesso.</p>'),
  ('subscription_reactivated', 'Assinatura reativada', 'Sua assinatura foi reativada', '<h1>Assinatura reativada</h1><p>O acesso da empresa {{company}} foi restabelecido.</p>'),
  ('renewal_7_days', 'Aviso de renovacao', 'Sua assinatura sera renovada em 7 dias', '<h1>Renovacao proxima</h1><p>O plano {{plan}} sera renovado em 7 dias por {{amount}}.</p>'),
  ('renewal_1_day', 'Aviso de renovacao', 'Sua assinatura sera renovada amanha', '<h1>Renovacao amanha</h1><p>O plano {{plan}} sera renovado amanha por {{amount}}.</p>'),
  ('global_announcement', 'Comunicado global', '{{title}}', '<h1>{{title}}</h1><div>{{message}}</div>')
on conflict (code) do update set
  name = excluded.name,
  subject = excluded.subject,
  html_body = excluded.html_body,
  active = true,
  updated_at = now();
commit;
