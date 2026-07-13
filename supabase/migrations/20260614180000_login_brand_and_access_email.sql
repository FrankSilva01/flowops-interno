begin;
insert into public.saas_email_templates (code, name, subject, html_body)
values (
  'access_request',
  'Solicitacao de acesso',
  'Nova solicitacao de acesso - {{company}}',
  '<h1>Nova solicitacao de acesso</h1><p><strong>{{name}}</strong> solicitou acesso a {{company}}.</p><p>E-mail: {{requester_email}}</p><p>Acesse Gestao de usuarios para aprovar ou recusar.</p>'
)
on conflict (code) do update set
  name = excluded.name,
  subject = excluded.subject,
  html_body = excluded.html_body,
  active = true,
  updated_at = now();
create or replace function public.resolve_login_brand(
  input_hostname text default null,
  input_organization_id uuid default null
)
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.slug
  from public.organizations o
  where
    (input_organization_id is not null and o.id = input_organization_id)
    or (
      input_organization_id is null
      and nullif(lower(split_part(coalesce(input_hostname, ''), '.', 1)), '') = lower(o.slug)
    )
  order by case when o.id = input_organization_id then 0 else 1 end
  limit 1;
$$;
revoke all on function public.resolve_login_brand(text, uuid) from public;
grant execute on function public.resolve_login_brand(text, uuid) to anon, authenticated;
commit;
