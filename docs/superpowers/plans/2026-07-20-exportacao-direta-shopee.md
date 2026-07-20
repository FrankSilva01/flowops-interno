# Exportacao Direta Shopee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar uma planilha XLSX compativel com a importacao em massa da Shopee sem exigir upload de modelo e tornar a validacao de titulo do Mercado Livre antecipada e clara.

**Architecture:** O modulo `shopee-template-export.js` passa a ser responsavel por construir o esquema interno, a pasta de trabalho e as linhas de produtos. `marketplace.js` somente coleta selecao e valores do formulario, valida e dispara o download. A regra de titulo sai de uma funcao privada de `pricing.js` para uma funcao exportada e testavel.

**Tech Stack:** JavaScript ES modules, SheetJS 0.18.5 carregado pelo app, Node test runner e Playwright.

## Global Constraints

- Nao exigir arquivo fornecido pelo cliente.
- Preencher categoria, titulo, descricao, SKU, preco, estoque, imagens, peso, comprimento, largura, altura, marca e prazo de postagem.
- Preferir dados estruturados do anuncio, depois atributos Mercado Livre e por fim valores manuais.
- Manter o cadastro local disponivel para titulos curtos; bloquear apenas publicacao Mercado Livre.

---

### Task 1: Gerador interno da planilha Shopee

**Files:**
- Modify: `js/features/shopee-template-export.js`
- Test: `tests/unit/shopee-template-export.test.js`

**Interfaces:**
- Produces: `buildShopeeWorkbook(listings, options, xlsx)` retornando uma pasta de trabalho SheetJS.
- Produces: `validateShopeeExport(listings, options)` retornando mensagens por produto.

- [ ] **Step 1: Write failing unit tests**

Adicionar testes que usam um adaptador SheetJS minimo e confirmam a aba `Modelo`, metadados nas linhas 1-6 e dados a partir da linha 7, incluindo categoria, peso, dimensoes e marca.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/unit/shopee-template-export.test.js`
Expected: FAIL porque `buildShopeeWorkbook` e `validateShopeeExport` ainda nao existem.

- [ ] **Step 3: Implement the generator**

Criar um esquema interno versionado com os marcadores `ps_category`, `ps_product_name`, `ps_product_description`, `ps_sku_parent_short`, `ps_price`, `ps_stock`, `ps_sku_short`, imagens, `ps_weight`, `ps_length`, `ps_width`, `ps_height`, `ps_product_pre_order_dts`, canal logistico e marca.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/unit/shopee-template-export.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: gera planilha Shopee sem modelo externo"`

### Task 2: Fluxo de exportacao com um clique

**Files:**
- Modify: `index.html`
- Modify: `js/features/marketplace.js`
- Modify: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Consumes: `buildShopeeWorkbook` e `validateShopeeExport`.

- [ ] **Step 1: Write failing E2E assertions**

Confirmar que o dialogo nao possui input de arquivo, que o botao fica habilitado com um anuncio valido e que clicar inicia o download `FLOWOPS_SHOPEE_1_ANUNCIOS.xlsx`.

- [ ] **Step 2: Run focused E2E and verify RED**

Run: `npx playwright test tests/e2e/authenticated-smoke.spec.js --grep "exportacao Shopee"`
Expected: FAIL porque o upload ainda existe.

- [ ] **Step 3: Replace upload workflow**

Remover o input de modelo e `previewShopeeTemplate`. Ler categoria, fallbacks de embalagem, marca e prazo diretamente do formulario; validar; construir workbook; baixar XLSX.

- [ ] **Step 4: Run focused E2E and unit tests**

Run: `npm run test:unit && npx playwright test tests/e2e/authenticated-smoke.spec.js --grep "exportacao Shopee"`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: exporta Shopee com um clique"`

### Task 3: Validacao antecipada do titulo Mercado Livre

**Files:**
- Modify: `js/features/pricing.js`
- Modify: `index.html`
- Create: `tests/unit/product-title-validation.test.js`
- Modify: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Produces: `validateMlProductTitle(name)` retornando string vazia ou mensagem.

- [ ] **Step 1: Write failing tests**

Cobrir titulo curto, titulo completo e cadastro local sem Mercado Livre selecionado.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/unit/product-title-validation.test.js`
Expected: FAIL porque a funcao ainda nao e exportada.

- [ ] **Step 3: Implement inline validation**

Exportar a funcao, adicionar mensagem associada ao campo nome e atualiza-la em `input` quando Mercado Livre estiver marcado. Impedir avancar somente quando o canal Mercado Livre estiver selecionado.

- [ ] **Step 4: Run focused and full verification**

Run: `npm run check && npm run test:unit && npx playwright test tests/e2e/authenticated-smoke.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "fix: antecipa validacao de titulo Mercado Livre"`
