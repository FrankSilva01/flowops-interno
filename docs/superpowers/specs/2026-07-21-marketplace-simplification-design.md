# Simplificacao do Marketplace e confiabilidade da exportacao Shopee

## Objetivo

Reduzir a sobrecarga visual e cognitiva do Marketplace sem remover funcionalidades, corrigir a falha de geracao da planilha Shopee e preservar os fluxos de integracao, sincronizacao e publicacao existentes.

## Problemas confirmados

1. A exportacao Shopee carrega `xlsx.full.min.js` de `cdn.jsdelivr.net` somente no momento do clique. Bloqueio, lentidao ou indisponibilidade do CDN impede a geracao da planilha.
2. O primeiro nivel do Marketplace apresenta nove guias, cinco filtros de canal, sete filtros rapidos e sete acoes no mesmo contexto.
3. Operacao diaria, catalogo, analise e administracao usam a mesma hierarquia visual.
4. Acoes frequentes e raras possuem destaque semelhante, dificultando identificar o proximo passo.
5. Filtros de canal permanecem visiveis em telas onde nao alteram a informacao apresentada.

## Arquitetura de informacao aprovada

O Marketplace passa a ter quatro areas principais:

### Operacao

- Anuncios como tela inicial.
- Vendas e Perguntas como visoes secundarias da area.
- Busca, filtros de canal e filtros operacionais permanecem proximos da lista.
- A acao primaria e `Cadastrar produto`.
- Sincronizacao permanece visivel, mas com menor peso que a acao primaria.
- Importar, replicar em lote, exportar CSV e exportar para Shopee ficam em `Mais acoes`.
- Acoes de lote aparecem somente quando houver itens selecionados.

### Catalogo

- Reune cadastro de produtos e gestao da vitrine.
- Mantem importacao de dados de anuncios existentes.
- Reune preparacao e exportacao para canais que ainda nao possuem publicacao automatica.
- Nao duplica a tabela operacional de anuncios.

### Performance

- Contem o diagnostico comercial e os indicadores atuais.
- Paineis avancados continuam recolhiveis.
- Indicadores principais aparecem antes de tabelas e simuladores.
- Links para anuncio, produto ou venda abrem o mesmo drawer existente.

### Configuracoes

- Reune Integracoes, Logs e Backup.
- Integracoes e a visao inicial.
- Logs e Backup usam navegacao secundaria local, sem competir com a operacao diaria.
- Alertas de conexao continuam disponiveis na operacao por meio de status compactos e links diretos.

## Navegacao e estado

- Os identificadores internos das oito visoes existentes continuam validos: `listings`, `sales`, `ml-questions`, `storefront`, `intelligence`, `integrations`, `api-logs` e `backup`.
- Uma camada de agrupamento converte cada visao para uma das quatro areas. Isso evita reescrever renderizadores e integracoes.
- Ao trocar de area, o sistema abre a ultima visao usada naquela area durante a sessao.
- Links internos que apontam diretamente para uma visao continuam funcionando.
- Em telas estreitas, as quatro areas usam um controle horizontal rolavel sem causar rolagem da pagina inteira. As visoes secundarias usam um seletor compacto.

## Hierarquia de acoes

- Uma unica acao primaria por contexto.
- Acoes secundarias frequentes permanecem visiveis.
- Acoes raras e exportacoes ficam em menu acessivel por botao `Mais acoes`.
- O menu deve fechar por clique externo, `Escape` e selecao de item.
- Todas as opcoes mantem texto e icone; tooltips nao substituem rotulos essenciais.
- A selecao em lote cria uma barra contextual com quantidade selecionada, replicacao e exportacao Shopee.

## Correcao da exportacao Shopee

- A biblioteca XLSX passa a ser servida pelo proprio projeto em uma versao fixada.
- `loadXlsx()` carrega primeiro o recurso local e compartilha uma unica Promise entre chamadas simultaneas.
- O carregamento possui timeout e mensagem de erro que diferencia falha do recurso de dados invalidos.
- A exportacao continua gerando `.xlsx`; nao deve degradar silenciosamente para CSV.
- O arquivo local inclui a licenca da biblioteca utilizada.
- O CSP deixa de depender do dominio externo para este fluxo.
- Importacao de arquivos Excel e exportacao Shopee usam o mesmo carregador local.

## Drawer da Shopee

- Mantem categoria obrigatoria, valores de fallback de embalagem, marca, prazo e confirmacao de ausencia de GTIN.
- Os fallbacks de peso e medidas ficam em uma secao recolhivel chamada `Preencher dados ausentes`.
- O resumo exibe somente tres estados principais: prontos, com pendencias e total selecionado.
- Categorias detectadas aparecem abaixo do resumo, sem competir com a acao de gerar.
- A mensagem de erro fica proxima ao botao e informa se a falha e de biblioteca, validacao ou geracao.
- Em mobile, os campos usam uma coluna e a barra de acoes permanece visivel no fim do drawer.

## Revisao dos demais modulos

A auditoria geral sera executada em paralelo a implementacao, mas mudancas fora do Marketplace somente entram neste ciclo quando forem correcoes pequenas e verificaveis. Refatoracoes ou novos fluxos identificados serao apresentados separadamente para evitar ampliar o risco da entrega.

Os pontos avaliados serao:

- rolagem horizontal indevida;
- controles cortados ou sobrepostos;
- acoes sem feedback de carregamento ou erro;
- dependencias externas carregadas durante a acao do usuario;
- telas com excesso de navegacao no primeiro nivel;
- acessibilidade de drawers, menus e controles de selecao;
- consistencia de estados vazio, carregando, sucesso e falha;
- duplicacao de funcoes entre modulos.

## Tratamento de erros

- Falhas de rede ou integracao nao apagam dados locais ja renderizados.
- Botoes que iniciam operacoes assincronas ficam temporariamente desabilitados e mostram estado de processamento.
- Mensagens tecnicas completas permanecem no log; a interface mostra causa e proxima acao em linguagem operacional.
- O menu e as visoes devem continuar navegaveis mesmo quando uma integracao estiver indisponivel.

## Testes e aceite

1. Teste unitario comprova que `loadXlsx()` usa recurso local, reutiliza a Promise e trata falha.
2. Teste unitario valida o agrupamento das oito visoes nas quatro areas.
3. Teste de DOM confirma que a tela inicial possui somente quatro areas principais.
4. Teste de DOM confirma que acoes raras ficam no menu e a barra de lote depende de selecao.
5. Teste do gerador Shopee valida as colunas e os valores ja cobertos pela suite atual.
6. Playwright verifica desktop e mobile sem rolagem horizontal global.
7. Playwright abre cada area e cada visao secundaria sem erro de console.
8. Playwright gera e captura um download `.xlsx` sem requisitar `cdn.jsdelivr.net`.
9. `npm run check` e toda a suite unitaria devem passar.

## Fora deste ciclo

- Alterar contratos das APIs de marketplace.
- Implementar publicacao automatica da Shopee sem credenciais de parceiro.
- Remover logs ou backups existentes.
- Redesenhar os demais modulos de forma ampla antes da conclusao da auditoria.
