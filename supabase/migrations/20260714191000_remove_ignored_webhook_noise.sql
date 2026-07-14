delete from public.marketplace_sync_log
where marketplace = 'Mercado Livre'
  and kind = 'webhook'
  and status = 'ignored'
  and message = 'Notificacao ignorada';

analyze public.marketplace_sync_log;
