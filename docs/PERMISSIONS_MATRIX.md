# FlowOps - matriz de permissoes por perfil

Use esta matriz como referencia para liberar usuarios em `organization_members.role`.

## Perfis

| Perfil | Leitura | Criar/editar operacional | Excluir dados | Usuarios e permissoes | Marketplace admin |
| --- | --- | --- | --- | --- | --- |
| Administrador | Sim | Sim | Sim | Sim | Sim |
| Supervisor | Sim | Sim | Nao | Nao | Nao |
| Operador | Sim | Sim | Nao | Nao | Nao |
| Responsavel | Sim | Sim | Nao | Nao | Nao |
| Leitura | Sim | Nao | Nao | Nao | Nao |

## Regras de banco

- `user_in_organization(organization_id)` permite leitura para membro ativo da empresa.
- `user_can_edit_organization(organization_id)` permite `insert` e `update` somente para Administrador, Supervisor, Operador, Responsavel e equivalentes legados (`Edicao`, `Editor`, `Equipe`).
- `user_admin_in_organization(organization_id)` permite `delete` e gestao de membros somente para Administrador/admin/owner.
- Tabelas de integracao de marketplace ficam somente leitura no cliente; escrita deve ocorrer via Edge Function/service role.

## Teste rapido

Simule um usuario de leitura e confirme que leitura funciona, mas escrita falha:

```sql
begin;

set local role authenticated;
set local request.jwt.claims = '{"email":"usuario-leitura@empresa.com","role":"authenticated"}';

select
  public.user_in_organization('00000000-0000-0000-0000-000000000001') as can_read,
  public.user_can_edit_organization('00000000-0000-0000-0000-000000000001') as can_edit,
  public.user_admin_in_organization('00000000-0000-0000-0000-000000000001') as can_admin;

insert into public.orders (
  id, organization_id, description, status, charged, received, quantity
)
values (
  'ROLE-SHOULD-FAIL',
  '00000000-0000-0000-0000-000000000001',
  'Teste de permissao somente leitura',
  'A preparar',
  1,
  0,
  1
);

rollback;
```

O `insert` deve falhar para `Leitura`.
