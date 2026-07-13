begin;
alter table public.subscription_plans
  add column if not exists marketing_description text,
  add column if not exists marketing_highlights jsonb not null default '[]'::jsonb,
  add column if not exists marketing_badge text,
  add column if not exists marketing_cta text not null default 'Comecar agora',
  add column if not exists marketing_featured boolean not null default false,
  add column if not exists display_order integer not null default 100;
update public.subscription_plans
set
  marketing_description = case code
    when 'free' then 'Organize encomendas, producao, clientes e vitrine sem custo.'
    when 'starter' then 'Automatize a operacao e conecte sua conta do Mercado Livre.'
    when 'pro' then 'Escale vendas sob demanda com mais usuarios, integracoes e automacoes.'
    when 'enterprise' then 'Operacao personalizada para equipes com alto volume.'
    else coalesce(marketing_description, name)
  end,
  marketing_highlights = case code
    when 'free' then '["1 usuario","Kanban e encomendas","Clientes e leads","Dashboard e vitrine","5 vendas importadas por mes"]'::jsonb
    when 'starter' then '["2 usuarios","Mercado Livre","30 vendas importadas por mes","Backup semanal","Auditoria completa"]'::jsonb
    when 'pro' then '["5 usuarios","Mercado Livre, Shopee e Amazon","200 vendas importadas por mes","Backup automatico","White Label basico"]'::jsonb
    when 'enterprise' then '["Ate 25 usuarios","2.000 vendas importadas por mes","Suporte e limites personalizados","Todas as integracoes","Operacao em escala"]'::jsonb
    else marketing_highlights
  end,
  marketing_badge = case when code = 'pro' then 'Mais escolhido' else marketing_badge end,
  marketing_cta = case when code = 'enterprise' then 'Falar com vendas' else 'Criar minha conta' end,
  marketing_featured = code = 'pro',
  display_order = case code when 'free' then 10 when 'starter' then 20 when 'pro' then 30 when 'enterprise' then 40 else display_order end
where marketing_description is null
   or jsonb_array_length(marketing_highlights) = 0;
create table if not exists public.public_signup_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  email text not null,
  plan_code text,
  status text not null default 'created',
  source text not null default 'landing_page',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists public_signup_events_created_idx
  on public.public_signup_events(created_at desc);
alter table public.public_signup_events enable row level security;
revoke all on public.public_signup_events from anon, authenticated;
insert into public.saas_email_templates (code, name, subject, html_body)
values (
  'user_credentials',
  'Credenciais de acesso',
  'Seu acesso ao FlowOps - {{company}}',
  '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><h1 style="color:#087f73">Seu acesso ao FlowOps foi criado</h1><p>Ola, {{name}}.</p><p>Voce ja pode acessar o ambiente da empresa <strong>{{company}}</strong>.</p><div style="background:#f3f7f8;border:1px solid #d8e4e7;padding:18px;border-radius:8px"><p><strong>E-mail:</strong> {{email}}</p><p><strong>Senha inicial:</strong> {{temporary_password}}</p></div><p>Por seguranca, altere sua senha apos o primeiro acesso.</p><p><a href="{{login_url}}" style="display:inline-block;background:#087f73;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold">Entrar no FlowOps</a></p></div>'
)
on conflict (code) do update set
  name = excluded.name,
  subject = excluded.subject,
  html_body = excluded.html_body,
  active = true,
  updated_at = now();
update public.saas_email_templates
set
  subject = 'Bem-vindo ao FlowOps',
  html_body = '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><h1 style="color:#087f73">Bem-vindo ao FlowOps, {{name}}</h1><p>A empresa <strong>{{company}}</strong> foi criada e seu ambiente esta pronto.</p><p>Use o e-mail cadastrado para entrar e organizar encomendas, producao, clientes e vendas.</p><p><a href="{{login_url}}" style="display:inline-block;background:#087f73;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold">Acessar o FlowOps</a></p></div>',
  updated_at = now()
where code = 'welcome';
commit;
