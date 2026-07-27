-- Recria a manutenção diária com autenticação obtida em tempo de execução.
-- Antes de aplicar, grave no Vault um JWT service_role válido com o nome
-- flowops_system_maintenance_token. O valor nunca deve aparecer em migrations.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'flowops_system_maintenance_token'
      and nullif(decrypted_secret, '') is not null
  ) then
    raise exception 'Vault secret flowops_system_maintenance_token ausente';
  end if;

  perform cron.unschedule('3daft-daily-maintenance')
  where exists (select 1 from cron.job where jobname = '3daft-daily-maintenance');
end $$;

select cron.schedule(
  '3daft-daily-maintenance',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://djvrhvzjvnyensbobtby.functions.supabase.co/system-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'flowops_system_maintenance_token'
        limit 1
      )
    ),
    body := '{"action":"scheduled"}'::jsonb
  );
  $cron$
);
