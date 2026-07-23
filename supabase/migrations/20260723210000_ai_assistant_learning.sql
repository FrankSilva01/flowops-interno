-- Assistente IA: aprendizado por reforço (sem IA externa).
-- ai_interactions: log de perguntas + feedback (👍/👎) do usuário.
-- ai_custom_answers: respostas ensinadas/aprendidas com peso ajustado por reforço.

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_email text not null default '',
  query text not null,
  query_normalized text not null default '',
  result_type text not null default 'miss',
  answer_preview text,
  feedback text check (feedback in ('up','down')),
  created_at timestamptz not null default now()
);

create index if not exists ai_interactions_org_created_idx
  on public.ai_interactions (organization_id, created_at desc);
create index if not exists ai_interactions_org_miss_idx
  on public.ai_interactions (organization_id, result_type);

create table if not exists public.ai_custom_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  keywords text not null,
  answer text not null,
  action_view text,
  source text not null default 'manual', -- manual (ensinada) | auto (reforço 👍)
  weight integer not null default 0,     -- reforço: 👍 +1 / 👎 -1; <= -3 desativa
  active boolean not null default true,
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_custom_answers_org_active_idx
  on public.ai_custom_answers (organization_id, active);

alter table public.ai_interactions enable row level security;
alter table public.ai_interactions force row level security;
alter table public.ai_custom_answers enable row level security;
alter table public.ai_custom_answers force row level security;

drop policy if exists ai_interactions_select on public.ai_interactions;
drop policy if exists ai_interactions_insert on public.ai_interactions;
drop policy if exists ai_interactions_update on public.ai_interactions;

create policy ai_interactions_select on public.ai_interactions
for select to authenticated
using (public.user_in_organization(organization_id));

-- Qualquer membro registra suas interações e feedback (não é edição de dados do negócio)
create policy ai_interactions_insert on public.ai_interactions
for insert to authenticated
with check (public.user_in_organization(organization_id));

create policy ai_interactions_update on public.ai_interactions
for update to authenticated
using (public.user_in_organization(organization_id))
with check (public.user_in_organization(organization_id));

drop policy if exists ai_custom_answers_select on public.ai_custom_answers;
drop policy if exists ai_custom_answers_insert on public.ai_custom_answers;
drop policy if exists ai_custom_answers_update on public.ai_custom_answers;
drop policy if exists ai_custom_answers_delete on public.ai_custom_answers;

create policy ai_custom_answers_select on public.ai_custom_answers
for select to authenticated
using (public.user_in_organization(organization_id));

create policy ai_custom_answers_insert on public.ai_custom_answers
for insert to authenticated
with check (public.user_can_edit_organization(organization_id));

create policy ai_custom_answers_update on public.ai_custom_answers
for update to authenticated
using (public.user_can_edit_organization(organization_id))
with check (public.user_can_edit_organization(organization_id));

create policy ai_custom_answers_delete on public.ai_custom_answers
for delete to authenticated
using (public.user_can_edit_organization(organization_id));
