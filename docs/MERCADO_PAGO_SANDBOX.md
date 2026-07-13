# Homologacao de assinaturas Mercado Pago

O checkout recorrente deve ser validado sem usar a conta ou o cartao real do
operador do FlowOps. O Mercado Pago bloqueia transacoes em que comprador e
vendedor pertencem a mesma conta por regras antifraude.

## Preparacao

1. Crie uma aplicacao de teste na conta Mercado Pago que recebera as assinaturas.
2. Gere um usuario vendedor de teste e um usuario comprador de teste distintos.
3. Configure a Edge Function de homologacao com a credencial `TEST-...` do
   vendedor. Nunca misture essa credencial com o projeto Supabase de producao.
4. Acesse o checkout em uma sessao anonima e autentique o comprador de teste.
5. Use apenas os cartoes e dados ficticios publicados pelo Mercado Pago.

## Matriz minima

- Pagamento aprovado: assinatura e empresa ficam ativas.
- Pagamento em processamento: acesso ativo existente e preservado.
- Pagamento recusado: assinatura fica `past_due` com cinco dias de carencia.
- Reembolso ou chargeback: assinatura entra no fluxo de inadimplencia.
- Cancelamento: renovacao e interrompida e o status do provedor e sincronizado.
- Webhook duplicado: nao gera duas notificacoes, pagamentos ou auditorias.

Os testes de contrato locais executam essa matriz com eventos ficticios:

```powershell
npm run test:unit
```

## Isolamento obrigatorio

Use um projeto Supabase de staging com URL, chaves, banco e webhook proprios. O
webhook sandbox nao deve apontar para a funcao de producao. Antes de liberar uma
credencial real, valide tambem RLS, logs, reconciliacao e limpeza dos registros
de teste nesse ambiente.
