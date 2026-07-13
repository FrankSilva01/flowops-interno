grant delete on public.notifications to authenticated;
drop policy if exists "approved users delete notifications" on public.notifications;
create policy "approved users delete notifications"
on public.notifications for delete to authenticated
using (public.is_approved_user());
