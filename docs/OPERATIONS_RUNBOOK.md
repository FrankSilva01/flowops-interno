# FlowOps - runbook de operacao

## Saude e alertas

O workflow `Production health` verifica Netlify, paginas legais e Edge Functions a cada 30 minutos. Uma falha deve ser tratada como incidente e investigada no GitHub Actions, Netlify e Supabase Functions Logs.

## Severidade

- P0: vazamento entre empresas, cobranca incorreta em massa, perda de dados ou indisponibilidade total. Suspender deploys, preservar evidencias e corrigir imediatamente.
- P1: login, Mercado Livre, Fiscal, backup ou pagamento indisponivel para parte dos clientes. Iniciar mitigacao no mesmo dia.
- P2: erro localizado com alternativa operacional. Registrar, priorizar e comunicar o cliente afetado.

## Deploy

1. Rodar `npm test`, `npm run release:gate` e `git diff --check`.
2. Configurar no Netlify `FLOWOPS_E2E_EMAIL`, `FLOWOPS_E2E_PASSWORD` e `SUPABASE_SERVICE_ROLE_KEY`; sem os tres secrets o build falha antes da publicacao.
3. Aplicar migracoes com `supabase db push --linked`.
4. Implantar apenas as Edge Functions alteradas e conferir `verify_jwt` em `supabase/config.toml`.
5. Fazer push do frontend e confirmar `app.js?v=` e `flowops-v` no Netlify.
6. Executar `Production health` manualmente e o checklist de regressao.

## Rollback

O frontend pode ser republicado pelo deploy anterior do Netlify. Edge Functions devem ser restauradas a partir do commit anterior. Migracoes de banco devem ser aditivas; nunca remover colunas ou dados durante resposta a incidente sem backup confirmado.

## Backup e restauracao

Executar backup manual antes de mudancas de schema de alto risco. Trimestralmente, restaurar um backup em homologacao, conferir contagens por tabela e registrar data, duracao, divergencias e responsavel.

### Autenticacao da manutencao agendada

O cron `3daft-daily-maintenance` chama a Edge Function `system-maintenance`, que exige um JWT de operador. O token deve existir no Supabase Vault de produção com o nome `flowops_system_maintenance_token`; nunca inclua o valor em SQL, commits ou logs.

Antes de aplicar `20260727090000_secure_system_maintenance_cron.sql`:

1. Obtenha a chave `service_role` vigente pelo canal administrativo autorizado.
2. No SQL Editor protegido, crie o segredo com `select vault.create_secret('<valor>', 'flowops_system_maintenance_token');`. Se o nome já existir, use `vault.update_secret` pelo identificador retornado pelo Vault.
3. Aplique a migration e confirme que `cron.job` contém apenas um job chamado `3daft-daily-maintenance`.
4. Invoque `system-maintenance` manualmente com `{"action":"scheduled"}` e o mesmo token no cabeçalho `Authorization`, sem imprimir a credencial.
5. Confirme em `backup_runs` um registro recente com `status = 'success'` e execute o workflow `Staging restore drill`.

Se o segredo estiver ausente, a migration falha de forma explícita e preserva o job anterior. Uma resposta `401` ou `403` da Edge Function indica token ausente, expirado ou incompatível com a verificação JWT.

## Segredos

Rotacionar imediatamente qualquer segredo exposto. Conferir Mercado Livre, Mercado Pago, Focus NFe, Brevo e Supabase. Nunca registrar tokens, autorizacao, senhas ou payloads sem redacao.
## Verificações automatizadas

O workflow `Production health` verifica aplicação, páginas legais, Edge Functions e, quando o segredo `SUPABASE_SERVICE_ROLE_KEY` está configurado no GitHub, se o último backup terminou com sucesso há no máximo oito dias.

O workflow `Authenticated quality` exige os secrets `FLOWOPS_E2E_EMAIL` e `FLOWOPS_E2E_PASSWORD`. Os secrets opcionais `FLOWOPS_E2E_TENANT_NAME` e `FLOWOPS_E2E_FORBIDDEN_TEXT` validam identificação e isolamento do tenant em desktop e mobile.

O workflow `Staging restore drill` exige `FLOWOPS_STAGING_ANON_KEY`, `FLOWOPS_STAGING_ADMIN_EMAIL` e `FLOWOPS_STAGING_ADMIN_PASSWORD`. A execução agendada apenas exporta e simula; a restauração real só ocorre quando `apply_restore` é marcado em uma execução manual.
