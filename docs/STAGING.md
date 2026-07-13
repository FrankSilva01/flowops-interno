# Ambiente de staging

Projeto Supabase: `flowops-staging` (`dirweeevuheunurnxans`), regiao `sa-east-1`.

## Isolamento

- Nao copiar usuarios, empresas, pedidos, anuncios, tokens ou arquivos de producao.
- Nao configurar credenciais de producao do Mercado Pago ou dos marketplaces.
- Mercado Pago deve usar apenas Access Token de teste e comprador de teste distinto.
- O frontend seleciona staging pelo hostname contendo `flowops-staging` ou por `?env=staging`.
- O projeto gratuito pausa depois de uma semana sem atividade.

## Reconstrucao

O snapshot em `supabase/baseline/20260713_public_schema.sql` existe porque as
migrations historicas anteriores a junho nao estavam no repositorio. Para um
projeto vazio:

```powershell
.\scripts\provision-staging.ps1 -ProjectRef <project-ref>
```

O script restaura o esquema, registra as migrations, cria o bucket fiscal,
carrega somente planos ficticios, publica as funcoes e religa o CLI a producao.

## Validacao atual

- 57 tabelas publicas.
- 57 tabelas com RLS.
- Bucket privado `fiscal-documents`.
- 12 Edge Functions implantadas.
- Nenhum dado de cliente e nenhuma credencial externa.

## Mercado Pago

Quando a credencial de teste estiver disponivel, configure-a somente neste
projeto e execute a matriz descrita em `docs/MERCADO_PAGO_SANDBOX.md`.
