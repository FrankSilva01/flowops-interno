create or replace function public.cleanup_sensitive_logs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb := '{}'::jsonb;
  n integer;
begin
  delete from public.marketplace_oauth_states
  where expires_at < now() - interval '7 days'
     or consumed_at < now() - interval '7 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('marketplace_oauth_states', n);

  delete from public.security_rate_limits where updated_at < now() - interval '2 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('security_rate_limits', n);

  delete from public.saas_email_delivery_logs where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('saas_email_delivery_logs', n);

  delete from public.saas_email_outbox
  where status in ('sent', 'failed') and created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('saas_email_outbox', n);

  delete from public.public_signup_events where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('public_signup_events', n);

  delete from public.marketplace_sync_log
  where (status = 'ignored' and created_at < now() - interval '7 days')
     or (status = 'success' and created_at < now() - interval '90 days')
     or (status not in ('ignored', 'success', 'error') and created_at < now() - interval '90 days')
     or (status = 'error' and created_at < now() - interval '180 days');
  get diagnostics n = row_count;
  result := result || jsonb_build_object('marketplace_sync_log', n);

  delete from public.storefront_events where created_at < now() - interval '365 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('storefront_events', n);

  delete from public.platform_admin_logs where created_at < now() - interval '365 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('platform_admin_logs', n);

  return result;
end;
$$;

revoke all on function public.cleanup_sensitive_logs() from public, anon, authenticated;
grant execute on function public.cleanup_sensitive_logs() to service_role;

select public.cleanup_sensitive_logs();
