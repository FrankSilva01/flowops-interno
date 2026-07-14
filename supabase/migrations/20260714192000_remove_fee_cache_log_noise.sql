delete from public.marketplace_sync_log
where marketplace = 'Mercado Livre'
  and kind = 'fee-calculator'
  and status = 'success'
  and message like 'Taxas de % dentro do cache (6h), nao sincronizado de novo.';

analyze public.marketplace_sync_log;
