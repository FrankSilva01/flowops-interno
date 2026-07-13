begin;
create table if not exists public.saas_support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by text not null,
  category text not null check (category in ('Sugestão','Bug','Dúvida')),
  subject text not null,
  message text not null,
  status text not null default 'Aberto' check (status in ('Aberto','Em análise','Respondido','Fechado')),
  priority text not null default 'Normal' check (priority in ('Baixa','Normal','Alta','Urgente')),
  admin_response text,
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create table if not exists public.saas_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  category text not null default 'Atualização',
  priority text not null default 'normal',
  organization_id uuid references public.organizations(id) on delete cascade,
  published boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.saas_changelog (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  title text not null,
  description text not null,
  category text not null default 'Plataforma',
  published boolean not null default true,
  published_at timestamptz not null default now(),
  created_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  provider text not null default 'manual',
  provider_payment_id text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'BRL',
  status text not null default 'pending',
  payment_method text,
  paid_at timestamptz,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.saas_email_templates (
  code text primary key,
  name text not null,
  subject text not null,
  html_body text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.saas_email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  recipient_email text not null,
  template_code text not null references public.saas_email_templates(code),
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
insert into public.saas_email_templates (code,name,subject,html_body) values
('welcome','Boas-vindas','Bem-vindo ao 3D.AFT','<h1>Bem-vindo, {{name}}</h1><p>Sua empresa {{company}} já pode acessar o 3D.AFT.</p>'),
('password_recovery','Recuperação de senha','Recupere sua senha do 3D.AFT','<h1>Recuperação de senha</h1><p>Use o link seguro enviado pelo Supabase Auth para definir uma nova senha.</p>'),
('trial_ending','Fim do trial','Seu período de teste está terminando','<h1>Seu teste termina em {{days}} dia(s)</h1><p>Escolha um plano para continuar usando o 3D.AFT.</p>'),
('payment_approved','Pagamento aprovado','Pagamento aprovado','<h1>Pagamento aprovado</h1><p>Recebemos {{amount}} e sua assinatura está ativa.</p>'),
('payment_declined','Pagamento recusado','Não foi possível aprovar o pagamento','<h1>Pagamento recusado</h1><p>Atualize seus dados de pagamento para evitar a suspensão.</p>'),
('subscription_suspended','Assinatura suspensa','Sua assinatura foi suspensa','<h1>Assinatura suspensa</h1><p>Regularize o pagamento para reativar o acesso.</p>'),
('subscription_reactivated','Assinatura reativada','Sua assinatura foi reativada','<h1>Assinatura reativada</h1><p>O acesso da empresa {{company}} foi restabelecido.</p>')
on conflict (code) do nothing;
insert into public.saas_changelog (version,title,description,category,created_by) values
('v1.0','Marketplace','Integração e sincronização com marketplaces.','Marketplace','Sistema'),
('v1.1','Backup','Backup automático, download e teste de restauração.','Segurança','Sistema'),
('v1.2','Amazon','Arquitetura preparada para conexão com a Amazon.','Marketplace','Sistema')
on conflict do nothing;
create index if not exists saas_support_org_status_idx on public.saas_support_tickets(organization_id,status,created_at desc);
create index if not exists saas_announcements_published_idx on public.saas_announcements(published,published_at desc);
create index if not exists saas_changelog_published_idx on public.saas_changelog(published,published_at desc);
create index if not exists subscription_payments_org_idx on public.subscription_payments(organization_id,created_at desc);
create index if not exists saas_email_outbox_status_idx on public.saas_email_outbox(status,scheduled_at);
alter table public.saas_support_tickets enable row level security;
alter table public.saas_announcements enable row level security;
alter table public.saas_changelog enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.saas_email_templates enable row level security;
alter table public.saas_email_outbox enable row level security;
grant select,insert,update on public.saas_support_tickets to authenticated;
grant select on public.saas_announcements,public.saas_changelog,public.subscription_payments to authenticated;
create policy "members manage own support tickets" on public.saas_support_tickets
for all to authenticated
using (public.is_platform_admin() or public.is_org_member(organization_id))
with check (public.is_platform_admin() or public.is_org_member(organization_id));
create policy "members read announcements" on public.saas_announcements
for select to authenticated
using (
  published = true
  and (expires_at is null or expires_at > now())
  and (organization_id is null or public.is_org_member(organization_id) or public.is_platform_admin())
);
create policy "members read changelog" on public.saas_changelog
for select to authenticated
using (published = true or public.is_platform_admin());
create policy "members read own payments" on public.subscription_payments
for select to authenticated
using (public.is_platform_admin() or public.is_org_member(organization_id));
commit;
