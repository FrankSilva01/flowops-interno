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
| `FLOWOPS_SUPABASE_ANON_KEY` | Autenticação do teste automatizado de RLS |
| `FLOWOPS_RLS_USER_1_EMAIL` / `FLOWOPS_RLS_USER_1_PASSWORD` | Usuário QA da empresa A |
| `FLOWOPS_RLS_USER_2_EMAIL` / `FLOWOPS_RLS_USER_2_PASSWORD` | Usuário QA da empresa B |

Os dois usuários de RLS devem pertencer a empresas distintas, possuir apenas dados fictícios e permanecer ativos. Não reutilize contas de clientes.

## Critério para liberar uma versão

1. Quality aprovado.
2. Production health aprovado com as verificações privadas.
3. RLS tenant isolation aprovado.
4. Authenticated quality aprovado em desktop e mobile.
5. Staging restore drill aprovado.
6. Nenhum job em `dead_letter` sem análise e nenhum erro crítico recente de marketplace.
7. Planilhas Shopee geradas somente com categoria homogênea, modelo oficial específico, marca, peso, largura, comprimento, altura, SKU, estoque, descrição e pelo menos três imagens válidas.

Falhas operacionais geram `output/operational-health.json`, anexado ao workflow por 30 dias com causa e ação recomendada.
