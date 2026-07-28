# Prontidão operacional do FlowOps

## Gates automáticos

- `npm run release:readiness`: valida migrations, workflows de operação e requisitos críticos da exportação Shopee.
- `npm run check`: valida a sintaxe dos módulos JavaScript.
- `npm run test:unit`: executa os testes de domínio.
- `npm run health`: testa aplicação, Edge Functions, backup, integrações, erros e fila de falhas.
- `npm run audit:rls`: comprova que usuários de duas empresas diferentes não acessam os dados um do outro.

O workflow `Quality` bloqueia regressões no push e em pull requests. Os workflows `Production health`, `Authenticated quality`, `RLS tenant isolation` e `Staging restore drill` executam controles recorrentes.

## Secrets obrigatórios no GitHub

Configure em `Settings > Secrets and variables > Actions`:

| Secret | Finalidade |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Saúde privada, backup e filas operacionais |
| `FLOWOPS_E2E_EMAIL` / `FLOWOPS_E2E_PASSWORD` | Smoke test autenticado |
| `FLOWOPS_E2E_TENANT_NAME` | Confirma o tenant esperado no teste |
| `FLOWOPS_E2E_FORBIDDEN_TEXT` | Confirma que dados de outro tenant não aparecem na UI |
| `FLOWOPS_E2E_MARKETPLACE_ITEM_ID` / `FLOWOPS_E2E_MARKETPLACE_ORDER_ID` | Fixtures reais para sincronização de anúncio e importação de pedido Mercado Livre |
| `FLOWOPS_E2E_LOGISTICS_ORDER_ID` / `FLOWOPS_E2E_TRACKING_TOKEN` | Pedido QA com evento automático e rastreio público válido |
| `FLOWOPS_E2E_REALTIME_ORDER_ID` | Encomenda QA usada na prova reversível entre duas sessões realtime |
| `FLOWOPS_SUPABASE_ANON_KEY` | Autenticação do teste automatizado de RLS |
| `FLOWOPS_RLS_USER_1_EMAIL` / `FLOWOPS_RLS_USER_1_PASSWORD` | Usuário QA da empresa A |
| `FLOWOPS_RLS_USER_2_EMAIL` / `FLOWOPS_RLS_USER_2_PASSWORD` | Usuário QA da empresa B |
| `FLOWOPS_STAGING_URL` | URL do projeto Supabase de staging usada no drill de restore |
| `FLOWOPS_STAGING_ANON_KEY` | Chave anon do projeto de staging |
| `FLOWOPS_STAGING_ADMIN_EMAIL` / `FLOWOPS_STAGING_ADMIN_PASSWORD` | Conta administrativa exclusiva para o drill de staging |

Os dois usuários de RLS devem pertencer a empresas distintas, possuir apenas dados fictícios e permanecer ativos. Não reutilize contas de clientes.

## Critério para liberar uma versão

1. Quality aprovado.
2. Production health aprovado com as verificações privadas.
3. RLS tenant isolation aprovado.
4. Authenticated quality aprovado em desktop e mobile, sem cenários obrigatórios ausentes ou pulados.
5. Staging restore drill aprovado com `FLOWOPS_STAGING_URL`, `FLOWOPS_STAGING_ANON_KEY`, `FLOWOPS_STAGING_ADMIN_EMAIL` e `FLOWOPS_STAGING_ADMIN_PASSWORD`.
6. Nenhum job em `dead_letter` sem análise e nenhum erro crítico recente de marketplace.
7. Planilhas Shopee geradas somente com categoria homogênea, modelo oficial específico, marca, peso, largura, comprimento, altura, SKU, estoque, descrição e pelo menos três imagens válidas.

Falhas operacionais geram `operational-health.json` no diretório temporário do runner, fora da raiz publicada, e o workflow o anexa por 30 dias com causa e ação recomendada.
