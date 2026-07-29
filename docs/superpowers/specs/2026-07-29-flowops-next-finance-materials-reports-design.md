# FlowOps Next: Financeiro, Materiais e Relatorios

## Objetivo

Migrar Fluxo de caixa, Materiais/Estoque e Relatorios para o padrao FlowOps Next aprovado no prototipo, preservando os dados, eventos, permissoes, exportacoes e integracoes existentes. A pagina nao pode exigir rolagem horizontal; tabelas densas devem rolar apenas dentro de seus proprios containers.

## Restricoes

- Nao criar calculo de preco real, custo real ou margem presumida.
- Nao criar dados demonstrativos, tabelas Supabase paralelas ou estados locais que concorram com o backend.
- Preservar `cash_entries`, `materials`, `inventory_items`, `orders`, `crm_leads`, vendas de marketplace e logistica como fontes existentes.
- Preservar IDs de formulario, `data-action`, filtros, permissoes e contratos de exportacao.
- Edicao continua condicionada a `state.canEdit` e `ensureCanEdit()`.
- Valores ausentes continuam ausentes; a interface nao transforma ausencia em zero ou em status ficticio.
- O service worker so avanca no candidato final da fase e nao autoriza deploy sem o gate credenciado.

## Financeiro

### Estrutura

1. Cabecalho operacional com acao `Novo lancamento`.
2. Quatro indicadores: saldo atual, entradas, saidas e a receber. O lucro permanece disponivel na analise, sem duplicar o saldo como indicador principal.
3. Navegacao compacta: `Visao geral`, `Lancamentos` e `A receber`.
4. Visao geral com resumo temporal de entradas e saidas e lista de recebimentos pendentes derivada de encomendas.
5. Lancamentos com filtros, formulario existente e tabela paginada/responsiva.
6. A receber usa somente `charged - received` das encomendas reais.

### Comportamento

- `cashForm`, `cashTypeFilter`, `cashTable`, edicao e exclusao permanecem funcionais.
- Cadastrar compra de material continua gerando a saida automatica atual.
- Nao criar contas, parcelas ou documentos fiscais sem uma fonte real existente.

## Materiais e Estoque

### Estrutura

1. Cabecalho com acao contextual: `Nova compra` ou `Novo insumo`.
2. Indicadores derivados de compras e estoque: itens, saudaveis, atencao/criticos e valor estimado.
3. Navegacao primaria: `Estoque`, `Compras` e `Fornecedores`.
4. Estoque mostra alertas, filtros e tabela responsiva com quantidade, minimo, custo estimado e situacao.
5. Compras preserva filtros, formulario e vinculacao ao fluxo de caixa.
6. Fornecedores agrega as compras existentes, sem cadastro paralelo.

### Comportamento

- `materialForm`, `inventoryForm`, filtros, edicao, exclusao e notificacoes de estoque permanecem funcionais.
- O status e calculado apenas pela comparacao entre quantidade e minimo configurado.
- Reservas e movimentacoes nao serao exibidas como funcionalidades completas enquanto nao houver fonte persistida para elas.

## Relatorios

### Navegacao

Reduzir a navegacao principal para cinco grupos:

1. `Visao geral`
2. `Comercial`
3. `Operacao`
4. `Financeiro`
5. `Estoque`

Cada grupo possui um seletor secundario quando necessario:

- Comercial: comercial, clientes e marketplaces.
- Operacao: producao, logistica e produtos.
- Financeiro: financeiro e inteligencia comercial existente.
- Estoque: materiais, estoque e qualidade dos dados.

Todos os relatorios atuais continuam acessiveis. O agrupamento altera somente descoberta e apresentacao.

### Conteudo e exportacao

- Preservar filtros de periodo e agrupamento.
- Preservar CSV, Excel e PDF com dados completos, mesmo quando a tabela visual truncar textos longos.
- Preservar paginacao de 15 linhas no detalhamento.
- Qualidade dos dados permanece uma subvisao, sem filtros temporais quando eles nao se aplicam.
- Graficos devem ter altura estavel, rotulos legiveis e estado vazio explicito.

## Responsividade e acessibilidade

- Desktop: conteudo principal usa grids responsivos, sem largura minima que force a pagina.
- Tablet: indicadores quebram em duas colunas; graficos e tabelas empilham.
- Mobile: uma coluna; abas viram barra horizontal interna ou seletor; botoes principais permanecem visiveis.
- Tablist, botoes e selects mantem nomes acessiveis e foco visivel.
- Tabelas podem rolar dentro de `.table-scroll`, nunca no `body`.

## Testes e release

- Testes unitarios para modelos de apresentacao financeiros e de materiais.
- Testes de contrato do HTML/CSS/rotas e agrupamento de relatorios.
- E2E desktop/mobile para ausencia de overflow e manutencao de formularios/abas.
- Revisao de regressao para persistencia, permissoes, exportacoes e compra -> caixa.
- `npm run check`, `npm run test:unit`, Playwright publico e gate fail-closed antes de qualquer bump/deploy.
