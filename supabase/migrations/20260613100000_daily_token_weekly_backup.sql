-- Verifica tokens diariamente; o Edge Function limita o snapshot a uma vez por semana.
do $$
begin
  perform cron.unschedule('3daft-weekly-maintenance')
  where exists (select 1 from cron.job where jobname = '3daft-weekly-maintenance');
exception when others then
  null;
end $$;
select cron.schedule(
  '3daft-daily-maintenance',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://djvrhvzjvnyensbobtby.functions.supabase.co/system-maintenance',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"scheduled"}'::jsonb
  );
  $$
);
update public.custom_tags
set name = 'Reposição'
where name = 'Reposicao';
