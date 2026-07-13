# FlowOps - checklist de regressao para SaaS

Use antes de cada deploy publico ou mudanca em Supabase/Netlify.

## 1. Acesso e isolamento

- Entrar com usuario da empresa A.
- Confirmar que Dashboard, Encomendas, Marketplace, Fiscal e Logistica mostram somente dados da empresa A.
- Entrar com usuario da empresa B em janela anonima.
- Confirmar que nenhum pedido, anuncio, documento fiscal, lead, material ou rastreio da empresa A aparece na empresa B.
- Rodar `sql/2026-07-13_two_org_isolation_smoke_test.sql` com os UUIDs reais das duas empresas.

## 2. Fluxos criticos

- Login com email/senha.
- Troca de empresa, quando o usuario tem mais de uma membership.
- Criar encomenda manual com valor.
- Editar encomenda no drawer.
- Marcar encomenda como entregue e validar entrada no Fluxo de caixa.
- Confirmar que pedido com valor pendente aparece em `A receber` e no Dashboard.
- Criar lead e converter/relacionar pedido.
- Criar material e item de estoque.

## 3. Marketplace

- Conectar Mercado Livre com usuario correto.
- Sincronizar anuncios.
- Clicar em `Marketplace > Anuncios > Ver`.
- Clicar em `Marketplace > Anuncios > Editar` e confirmar drawer lateral.
- Alterar preco/estoque/status de um anuncio de teste.
- Sincronizar vendas.
- Criar encomenda a partir de venda importada.
- Baixar declaracao/etiqueta; quando oficial indisponivel, confirmar aviso operacional.
- Verificar logs em `Marketplace > Logs`: sucesso, erro, IDs externos, usuario/ator e mensagem legivel.

## 4. Fiscal e Logistica

- Abrir Fiscal.
- Cadastrar documento fiscal com vinculo por pedido/produto/fornecedor quando aplicavel.
- Cadastrar nota de compra.
- Cadastrar nota de venda.
- Confirmar que DAS sem PIX real mostra indisponivel.
- Abrir Logistica.
- Adicionar rastreio manual.
- Sincronizar status Mercado Livre para pedido vinculado.
- Confirmar fonte do status: Mercado Livre, transportadora/manual ou sem rastreio.

## 5. Atualizacao e cache

- Confirmar `FlowOps v<versao>` na sidebar.
- Usar menu superior > `Atualizar sistema`.
- Confirmar que o app recarrega em `?force=<versao>`.
- No console, confirmar que `document.querySelector('script[type="module"]').src` aponta para a versao atual.

## 6. Gates tecnicos

```powershell
node --check js/app.js
node --check js/core/router.js
node --check js/core/state.js
node --check js/data/remote.js
node --check js/features/marketplace.js
node --check js/features/logistics.js
node --check js/features/fiscal.js
node --check js/features/orders.js
node --check sw.js
git diff --check
```

No deploy publico:

```powershell
$r = Invoke-WebRequest -Uri 'https://rainbow-lokum-1fad14.netlify.app/?probe=1' -UseBasicParsing
$r.Content -match 'app\.js\?v=<VERSAO>'
$r.Content -match 'FlowOps v<VERSAO>'

$sw = Invoke-WebRequest -Uri 'https://rainbow-lokum-1fad14.netlify.app/sw.js?probe=1' -UseBasicParsing
$sw.Content -match 'flowops-v<VERSAO_CACHE>'
```
