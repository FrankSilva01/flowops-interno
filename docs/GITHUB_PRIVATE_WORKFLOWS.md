# Configuracao dos workflows privados

Cadastre em GitHub > Settings > Secrets and variables > Actions:

- `FLOWOPS_E2E_EMAIL`
- `FLOWOPS_E2E_PASSWORD`
- `FLOWOPS_E2E_TENANT_NAME`
- `FLOWOPS_E2E_FORBIDDEN_TEXT`
- `FLOWOPS_E2E_MARKETPLACE_ITEM_ID`
- `FLOWOPS_E2E_MARKETPLACE_ORDER_ID`
- `FLOWOPS_E2E_LOGISTICS_ORDER_ID`
- `FLOWOPS_E2E_TRACKING_TOKEN`
- `FLOWOPS_E2E_REALTIME_ORDER_ID`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLOWOPS_STAGING_ANON_KEY`
- `FLOWOPS_STAGING_ADMIN_EMAIL`
- `FLOWOPS_STAGING_ADMIN_PASSWORD`

Depois execute manualmente `Authenticated quality`, `Production health` e `Staging restore drill`. O restore real deve permanecer desmarcado na primeira execucao; use-o somente no projeto staging.

Os cinco identificadores E2E devem apontar para registros reais e estáveis do tenant exclusivo de QA: anúncio e pedido Mercado Livre entre os 20 mais recentes, pedido com logística automática e rastreio público habilitado, e uma encomenda que possa receber a atualização reversível de `updated_at` usada na prova de realtime. O workflow falha se qualquer cenário obrigatório for pulado.
