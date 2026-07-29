# Task 3 Report — Materiais e Estoque FlowOps Next

## Implementação

- Migrou `#materials` para o shell escopado `flowops-next-materials`.
- Adicionou indicadores reais de itens, estoque saudável, atenção e valor estimado.
- Adicionou as abas Estoque, Compras e Fornecedores com ARIA, setas, Home e End.
- Preservou `materialForm`, `materialsTable`, `inventoryForm`, `inventoryTable`, filtros e `lowStockSummary`.
- Manteve edição/exclusão condicionadas às permissões existentes e ocultou os novos comandos em modo somente leitura.
- Fornecedores são agregados exclusivamente das compras persistidas.
- Preservou `materialCashId` e `materialToCashEntry`, inclusive remoção da saída vinculada no caixa.
- Adicionou tabelas responsivas empilhadas no mobile sem overflow horizontal no corpo da página.
- Não criou reservas, movimentos, dados demonstrativos ou novas fontes de persistência.

## TDD

O teste `tests/unit/materials-next.test.js` foi criado antes da implementação e falhou nos quatro contratos iniciais: estrutura, acessibilidade, permissões/integração e CSS responsivo.

Após a implementação:

- `node --test tests/unit/materials-next.test.js tests/unit/materials-presentation.test.js`: 8/8 passaram.
- `npm run check`: 75 arquivos JavaScript validados.
- `npm run test:unit`: 251/251 passaram.
- `git diff --check`: passou.

## Arquivos

- `index.html`
- `js/features/materials.js`
- `js/core/router.js`
- `css/26-flowops-next-materials.css`
- `css/flowops.css`
- `tests/unit/materials-next.test.js`

