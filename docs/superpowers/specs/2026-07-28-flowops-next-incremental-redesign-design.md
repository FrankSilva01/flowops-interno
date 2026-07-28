# FlowOps Next Incremental Redesign

## Objetivo

Aplicar ao FlowOps interno o novo sistema visual validado no prototipo FlowOps Next sem perder dados existentes nem alterar o comportamento das integracoes, sincronizacoes de marketplace, rastreamento publico, atualizacao automatica da logistica, realtime, seguranca multiempresa ou operacao offline.

## Estrategia

A implantacao sera incremental, por modulos. A camada visual sera substituida sobre os mesmos servicos e estruturas de dados. O prototipo e somente referencia de composicao; nenhuma informacao demonstrativa sera copiada para producao.

Cada etapa deve poder ser revertida isoladamente. O deploy de um modulo so ocorre depois dos testes de regressao do modulo e dos fluxos compartilhados.

## Fontes de dados preservadas

- `orders` continua sendo a fonte das encomendas.
- `marketplace_listings` e `product_listings` continuam fornecendo anuncios e vinculos de catalogo.
- `marketplace_accounts` continua representando as contas conectadas.
- `order_logistics` e `logistics_events` continuam fornecendo rastreio e linha do tempo logistica.
- `js/data/remote.js` continua carregando dados da organizacao e assinando alteracoes realtime.
- Edge Functions de autenticacao, sincronizacao, webhook, documentos fiscais e frete permanecem com os mesmos contratos.
- Dados locais e funcionamento offline continuam sendo tratados pela infraestrutura existente.

## Arquitetura de interface

### Estrutura global

O shell recebera a navegacao, cabecalho, tokens visuais, responsividade e componentes compartilhados do FlowOps Next. Os botoes continuarao usando os `data-action`, IDs e handlers atuais enquanto cada tela for migrada. Alteracoes desses contratos so poderao ocorrer acompanhadas da adaptacao e teste do handler correspondente.

### Encomendas

A listagem exibira dados reais, incluindo imagem de referencia quando disponivel, cliente, produto, prazo, etapa, responsavel e situacao financeira. Cards e tabela usarao a mesma colecao `state.data.orders` e manterao filtros, selecao em lote, edicao, historico e exclusao existentes.

O drawer da encomenda reunira visao geral, referencias, producao, pagamentos, logistica e historico sem duplicar dados. O cadastro continuara gravando no fluxo atual e sera reorganizado em etapas visuais.

### Biblioteca

A Biblioteca sera acrescentada como modulo aditivo para imagens, modelos 3D, documentos e links. Inicialmente reutilizara referencias ja ligadas a encomendas. Uma migration posterior podera criar entidades normalizadas para multiplos arquivos por encomenda, sempre com `organization_id`, RLS forcado e politicas por organizacao.

### Producao e logistica

O kanban sera reestilizado sem mudar transicoes ou persistencia. A logistica continuara usando `order_logistics`, `logistics_events`, sincronizacao do Mercado Livre, rastreamento publico e atualizacao realtime. O redesign apenas reorganizara resumo, filtros, tabela, drawer e linha do tempo.

### Marketplace

Anuncios existentes serao carregados das tabelas e sincronizacoes atuais. Operacao, Catalogo, Performance e Configuracoes manterao autenticacao OAuth, sincronizacao, importacao de vendas, perguntas, documentos, etiquetas, declaracoes e logs. Nenhum anuncio sera recriado ou substituido por dados estaticos.

## Ordem de implantacao

1. Tokens visuais, componentes compartilhados e shell responsivo.
2. Encomendas e drawer, preservando todos os handlers atuais.
3. Biblioteca de referencias e vinculo com encomendas.
4. Producao e logistica, incluindo regressao de rastreio automatico.
5. Clientes, leads, calendario e comunicacao.
6. Fluxo de caixa, materiais e relatorios.
7. Marketplace, mantendo todos os contratos externos.
8. Conta, administracao, suporte e configuracoes.

## Compatibilidade e migracao

- Migrations serao apenas aditivas na primeira fase.
- Nenhuma tabela, coluna ou policy existente sera removida durante o redesign.
- IDs externos, codigos de anuncio, tokens de rastreio e vinculos de pedido permanecem intactos.
- O cache do Service Worker tera versao atualizada em cada release visual para evitar mistura de arquivos antigos e novos.
- Recursos novos ficarao atras de verificacao de capacidade ou existencia de dados, com estado vazio adequado.

## Tratamento de erros

Falhas de carregamento exibirao estados de erro com tentativa de recarga, sem substituir dados reais por amostras. Operacoes remotas manterao os avisos e logs atuais. Falhas de sincronizacao de marketplace ou logistica nao devem bloquear a navegacao nas informacoes ja persistidas.

## Validacao

- Testes unitarios dos adaptadores, filtros e formatadores existentes.
- Testes de contrato para IDs e `data-action` usados pelos handlers.
- Testes Playwright em desktop e mobile para navegacao, drawers, modais e ausencia de overflow.
- Regressao de login, troca de organizacao e isolamento RLS.
- Regressao de anuncios existentes, sincronizacao e importacao de pedidos.
- Regressao de criacao e edicao de encomenda.
- Regressao de `order_logistics`, eventos, sincronizacao Mercado Livre e link publico de rastreio.
- Verificacao offline e atualizacao do Service Worker.

## Criterios de aceite

- Os totais e registros exibidos antes e depois do redesign permanecem equivalentes para a mesma organizacao.
- Anuncios ja sincronizados continuam visiveis com seus IDs externos e acoes.
- Encomendas existentes continuam editaveis e atualizadas em realtime.
- Rastreamento publico e atualizacao automatica da logistica continuam funcionando.
- Nenhum dado de uma organizacao aparece em outra.
- Todas as telas principais funcionam sem rolagem horizontal em breakpoints suportados.
- O sistema continua responsivo e utilizavel em mobile.
