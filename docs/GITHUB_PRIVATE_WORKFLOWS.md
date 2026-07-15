# Configuracao dos workflows privados

Cadastre em GitHub > Settings > Secrets and variables > Actions:

- `FLOWOPS_E2E_EMAIL`
- `FLOWOPS_E2E_PASSWORD`
- `FLOWOPS_E2E_TENANT_NAME`
- `FLOWOPS_E2E_FORBIDDEN_TEXT`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLOWOPS_STAGING_ANON_KEY`
- `FLOWOPS_STAGING_ADMIN_EMAIL`
- `FLOWOPS_STAGING_ADMIN_PASSWORD`

Depois execute manualmente `Authenticated quality`, `Production health` e `Staging restore drill`. O restore real deve permanecer desmarcado na primeira execucao; use-o somente no projeto staging.
