alter table public.calendar_events enable row level security;
alter table public.calendar_events force row level security;

drop policy if exists calendar_events_select on public.calendar_events;
drop policy if exists calendar_events_insert on public.calendar_events;
drop policy if exists calendar_events_update on public.calendar_events;
drop policy if exists calendar_events_delete on public.calendar_events;

create policy calendar_events_select on public.calendar_events
for select to authenticated
using (public.user_in_organization(organization_id));

create policy calendar_events_insert on public.calendar_events
for insert to authenticated
with check (public.user_can_edit_organization(organization_id));

create policy calendar_events_update on public.calendar_events
for update to authenticated
using (public.user_can_edit_organization(organization_id))
with check (public.user_can_edit_organization(organization_id));

create policy calendar_events_delete on public.calendar_events
for delete to authenticated
using (public.user_can_edit_organization(organization_id));
