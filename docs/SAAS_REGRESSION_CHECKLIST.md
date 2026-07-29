# FlowOps - checklist de regressao para SaaS

Use antes de cada deploy publico ou mudanca em Supabase/Netlify.

Antes dos testes manuais, execute `npm test` e confirme que o workflow `Quality` passou. Depois do deploy, execute manualmente o workflow `Production health`.

## 1. Acesso e isolamento

- Entrar com usuario da empresa A.
- Confirmar que Dashboard, Encomendas, Marketplace, Fiscal e Logistica mostram somente dados da empresa A.
- Entrar com usuario da empresa B em janela anonima.
- Confirmar que nenhum pedido, anuncio, documento fiscal, lead, material ou rastreio da empresa A aparece na empresa B.
- Rodar `sql/2026-07-13_two_org_isolation_smoke_test.sql` com os UUIDs reais das duas empresas.
- Rodar `sql/2026-07-13_role_permission_hardening.sql` quando alterar regras de perfil.
- Testar usuario `Leitura`: deve conseguir entrar e ver dados da propria empresa, mas nao criar/editar pedido via UI ou SQL simulado.
- Testar usuario `Operador` ou `Supervisor`: deve criar/editar dados operacionais, mas nao acessar Gestao de usuarios nem Marketplace admin.
- Testar `Administrador`: deve conseguir gerir usuarios e executar exclusoes autorizadas.

## 2. Fluxos criticos

- Login com email/senha.
- Troca de empresa, quando o usuario tem mais de uma membership.
- Criar encomenda manual com valor.
- Editar encomenda no drawer.
- Marcar encomenda como entregue e validar entrada no Fluxo de caixa.
- Confirmar que pedido com valor pendente aparece em `A receber` e no Dashboard.
- Criar lead e converter/relacionar pedido.
- Criar material e item de estoque.

## 2b. FlowOps Next — Comercial e Agenda (release 1.2.2)

- Clientes e Leads: alternar abas Contatos / Pipeline / WhatsApp; no Pipeline, os leads aparecem na coluna do status real e `select-lead`/`edit-lead` continuam abrindo.
- Orcamentos: a tabela mostra apenas encomendas com `quoteStage`; abrir uma linha abre o drawer da encomenda; busca por codigo/cliente filtra.
- Conversas: sem canal conectado, exibe estado vazio (nenhuma conversa fabricada).
- Portal do cliente: selecionar encomenda mostra etapa/pagamento/progresso reais; "Copiar link" desabilita quando o rastreio publico esta off e copia o link de `tracking.html` quando ativo.
- Agenda: layout e paineis laterais em tokens (sem cores hardcoded); navegar mes/hoje, marcar/editar/excluir evento e os contadores do Resumo/Total continuam corretos; realtime entre duas sessoes.
- Regressao offline: apos deploy, primeiro load com rede depois offline (F5) serve o app pelo cache `flowops-v68`.

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

## 6. Regressao de release FlowOps Next

- Em `Marketplace > Anuncios`, abrir um anuncio existente e confirmar que preco, estoque, status, acoes de ver e editar continuam disponiveis.
- Sincronizar uma venda de teste e confirmar que o pedido importado aparece em `Encomendas`, preserva o codigo externo e pode ser aberto sem duplicacao.
- Para um pedido vinculado, executar a sincronizacao em `Logistica` e confirmar que o status e a fonte do rastreio continuam corretos.
- Abrir o link publico de rastreio do pedido em uma janela anonima e confirmar que a pagina carrega sem sessao, mostra o status esperado e nao interpreta texto externo como HTML.
- Com duas sessoes autenticadas da mesma empresa, alterar um pedido ou anuncio de teste em uma sessao e confirmar a atualizacao em tempo real na outra sem recarregar a pagina.

## 7. Gates tecnicos

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
