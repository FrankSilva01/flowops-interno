# Marketplace compacto: cadastro por etapas e paginacao

## Objetivo

Reduzir a altura das telas `Marketplace > Catalogo` e `Marketplace > Operacao > Anuncios`, evitando listas extensas e restaurando o cadastro orientado por etapas, sem alterar os contratos atuais de publicacao, sincronizacao ou edicao.

## Catalogo

- A tela principal exibe o cabecalho, os indicadores essenciais e a lista de produtos publicados.
- O formulario extenso deixa de ocupar a tela principal.
- `Cadastrar produto` abre um dialog responsivo com quatro etapas:
  1. Dados basicos e imagens.
  2. Preco, estoque e informacoes tecnicas.
  3. Canais de publicacao e campos especificos do marketplace selecionado.
  4. Revisao e confirmacao.
- O dialog usa `Voltar`, `Proximo` e, apenas na ultima etapa, `Salvar produto`.
- A validacao ocorre por etapa. O usuario nao avanca enquanto um campo obrigatorio visivel estiver invalido.
- Editar um produto abre o mesmo dialog com os dados preenchidos na primeira etapa.
- O envio final continua usando o fluxo e o payload existentes de `storefrontProductForm`.

## Produtos publicados

- A lista mostra no maximo 10 produtos por pagina em alturas normais.
- Em viewports de pouca altura, mostra 5 produtos por pagina para manter os controles visiveis sem rolagem extensa.
- O rodape informa intervalo e total, por exemplo `1-10 de 38`, e oferece anterior, numeros de pagina e proxima.
- Alteracoes na busca, filtros ou dados sincronizados retornam para a pagina 1.
- A pagina atual e limitada novamente quando uma exclusao ou filtro reduz o total.

## Operacao > Anuncios

- A tabela mostra no maximo 10 anuncios por pagina em alturas normais e 5 em viewports de pouca altura.
- Busca, canal e filtros rapidos sao aplicados antes da paginacao.
- O resumo superior continua calculado sobre todos os resultados filtrados, nao apenas sobre a pagina atual.
- A selecao em lote permanece ativa ao navegar entre paginas.
- `Selecionar todos os visiveis` afeta somente os itens da pagina atual.
- O painel lateral de destaque usa o primeiro item da pagina atual.
- Mudancas de busca ou filtro retornam para a pagina 1.

## Responsividade e acessibilidade

- O dialog ocupa a largura disponivel no mobile e limita sua altura ao viewport, com rodape de acoes fixo.
- Indicadores de etapa possuem estado atual exposto por `aria-current="step"`.
- Controles de paginacao possuem nomes acessiveis e estados desabilitados nas extremidades.
- Nenhum controle essencial depende apenas de hover.
- Em telas estreitas, a tabela mantem o comportamento responsivo existente e a paginacao permanece fora da area horizontal rolavel.

## Estado e arquitetura

- A logica pura de paginacao fica em um modulo pequeno e testavel, compartilhado por Catalogo e Anuncios.
- O estado de interface armazena separadamente pagina de anuncios, pagina de produtos e etapa atual do formulario.
- Nenhum estado de paginacao e persistido no banco.
- O formulario existente permanece a fonte dos dados; as etapas apenas controlam quais grupos de campos estao visiveis.

## Erros e recuperacao

- Erros de carregamento mantem a pagina e os filtros, exibindo a mensagem existente.
- Erros ao salvar mantem o dialog aberto na etapa de revisao e preservam os valores preenchidos.
- Ao fechar um cadastro novo, o formulario e a etapa sao reiniciados. Ao fechar uma edicao, nenhum dado e salvo implicitamente.

## Testes e aceite

- Testes unitarios cobrem calculo de paginas, limites, intervalos e ajuste da pagina apos mudanca no total.
- Testes de estrutura cobrem as quatro etapas, controles do dialog e paginadores das duas listas.
- Testes de interacao cobrem proximo/voltar, validacao por etapa, edicao preenchida e navegacao entre paginas.
- A suite JavaScript, testes unitarios e gate de prontidao devem passar antes do deploy.
- Aceite visual em desktop e mobile confirma que o cadastro nao ocupa a pagina e que as listas nao crescem indefinidamente.

## Fora de escopo

- Alterar APIs ou payloads dos marketplaces.
- Mudar regras de publicacao, sincronizacao, importacao ou autorizacao.
- Paginar vendas, logs ou outras telas neste incremento.
