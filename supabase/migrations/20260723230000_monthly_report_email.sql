-- Template do relatório mensal (enviado pela system-maintenance no dia 1º
-- com os dados agregados do mês anterior de cada organização).

insert into public.saas_email_templates (code, name, subject, html_body)
values (
  'monthly_report',
  'Relatório mensal',
  'Seu resumo de {{period}} — FlowOps',
  '<h1>Resumo de {{period}}</h1><p>Olá, {{company}}! Este foi o seu mês no FlowOps:</p><ul><li><strong>Pedidos:</strong> {{orders_count}}</li><li><strong>Faturamento (pedidos):</strong> R$ {{revenue}}</li><li><strong>Entradas no caixa:</strong> R$ {{cash_in}}</li><li><strong>Saídas no caixa:</strong> R$ {{cash_out}}</li><li><strong>Resultado:</strong> R$ {{profit}}</li><li><strong>Produto mais vendido:</strong> {{top_product}}</li></ul><p>Veja os detalhes em Relatórios dentro do FlowOps.</p>'
)
on conflict (code) do update set
  name = excluded.name,
  subject = excluded.subject,
  html_body = excluded.html_body;
