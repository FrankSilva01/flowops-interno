# Separação entre Catálogo e Operação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Catálogo exibir produtos mestres e manter a Operação restrita a anúncios reais de marketplace.

**Architecture:** Funções puras em `marketplace-navigation.js` classificam registros e resolvem vínculos. `marketplace.js` consome essas funções para calcular indicadores e renderizar as duas áreas. O HTML e o roteador expõem uma única entrada de cadastro e uma ação explícita para ir da Operação ao Catálogo.

**Tech Stack:** JavaScript ES modules, HTML, CSS existente, Node.js test runner.

## Global Constraints

- Não criar migração de banco de dados.
- Usar `products` como cadastro mestre e `product_listings` como vínculo com anúncios.
- Preservar anúncios legados sem vínculo.
- Registros exclusivos da vitrine não entram na Operação.
- Reutilizar o formulário interno `productForm`; não expor um segundo cadastro concorrente.

---

### Task 1: Classificar anúncios e vínculos

**Files:**
- Modify: `js/features/marketplace-navigation.js`
- Modify: `tests/unit/marketplace-navigation.test.js`

**Interfaces:**
- Consumes: registros com `marketplace`, `external_id`, `product_id`.
- Produces: `isOperationalMarketplaceListing(listing)`, `operationalMarketplaceListings(listings)` e `productListingLinks(product, productListings, marketplaceListings)`.

- [ ] **Step 1: Write the failing tests**

```js
test("separa publicacoes da vitrine dos anuncios operacionais", () => {
  const rows = [{ marketplace: "Vitrine" }, { marketplace: "Mercado Livre" }];
  assert.deepEqual(operationalMarketplaceListings(rows), [rows[1]]);
});

test("resolve os anuncios vinculados a um produto mestre", () => {
  const products = [{ id: "p1" }];
  const links = [{ product_id: "p1", marketplace: "Mercado Livre", external_id: "ML1" }];
  const listings = [{ marketplace: "Mercado Livre", external_id: "ML1", title: "Produto" }];
  assert.deepEqual(productListingLinks(products[0], links, listings), [{ link: links[0], listing: listings[0] }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/marketplace-navigation.test.js`
Expected: FAIL porque as funções ainda não são exportadas.

- [ ] **Step 3: Write minimal implementation**

```js
export function isOperationalMarketplaceListing(listing) {
  return String(listing?.marketplace || "").trim().toLowerCase() !== "vitrine";
}

export function operationalMarketplaceListings(listings = []) {
  return listings.filter(isOperationalMarketplaceListing);
}

export function productListingLinks(product, productListings = [], marketplaceListings = []) {
  return productListings.filter((link) => link.product_id === product?.id).map((link) => ({
    link,
    listing: marketplaceListings.find((item) => item.marketplace === link.marketplace && item.external_id === link.external_id) || null,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/marketplace-navigation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/features/marketplace-navigation.js tests/unit/marketplace-navigation.test.js
git commit -m "feat: separate operational marketplace listings"
```

### Task 2: Renderizar o Catálogo com produtos mestres

**Files:**
- Modify: `index.html`
- Modify: `js/features/marketplace.js`
- Modify: `tests/unit/marketplace-actions-ui.test.js`

**Interfaces:**
- Consumes: `state.products`, `state.productListings`, `state.marketplaceListings`, `productListingLinks(...)`.
- Produces: Catálogo com produtos, canais vinculados, ações de editar e abrir anúncio; indicadores baseados em produtos mestres.

- [ ] **Step 1: Write the failing UI assertions**

```js
test("catalogo usa produtos mestres e uma unica entrada de cadastro", () => {
  assert.match(page, /id="openCatalogProductDialogBtn"[^>]*data-action="open-product-dialog"/);
  assert.match(marketplace, /state\.products/);
  assert.match(marketplace, /productListingLinks/);
  assert.match(page, /Produtos cadastrados/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/marketplace-actions-ui.test.js`
Expected: FAIL porque o Catálogo ainda usa `state.marketplaceListings`.

- [ ] **Step 3: Implement the master-product catalog**

Atualizar o cabeçalho para usar:

```html
<button id="openCatalogProductDialogBtn" class="primary-btn" type="button" data-action="open-product-dialog"><i class="ti ti-plus" aria-hidden="true"></i> Cadastrar produto</button>
```

Em `renderStorefrontAdmin()`, calcular os indicadores com `state.products`, resolver os vínculos com `productListingLinks(...)` e renderizar cada produto com `data-action="edit-product"`; vínculos existentes usam `data-action="open-listing-drawer"`. Produtos sem vínculo exibem `Ainda não publicado`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/unit/marketplace-actions-ui.test.js tests/unit/marketplace-navigation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html js/features/marketplace.js tests/unit/marketplace-actions-ui.test.js
git commit -m "feat: use master products in marketplace catalog"
```

### Task 3: Limitar Operação e remover a ação duplicada

**Files:**
- Modify: `index.html`
- Modify: `js/features/marketplace.js`
- Modify: `js/core/router.js`
- Modify: `tests/unit/marketplace-actions-ui.test.js`

**Interfaces:**
- Consumes: `operationalMarketplaceListings(...)`, `setMarketplaceArea("catalog")`.
- Produces: indicadores/lista operacionais filtrados e ação `marketplace-open-catalog`.

- [ ] **Step 1: Write failing behavior assertions**

```js
test("operacao leva ao catalogo em vez de abrir cadastro duplicado", () => {
  assert.match(page, /data-action="marketplace-open-catalog"/);
  assert.doesNotMatch(page, /id="openProductDialogBtn"[^>]*data-action="open-product-dialog"/);
  assert.match(router, /action === "marketplace-open-catalog"/);
  assert.match(router, /setMarketplaceArea\("catalog"\)/);
  assert.match(marketplace, /operationalMarketplaceListings\(state\.marketplaceListings\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/marketplace-actions-ui.test.js`
Expected: FAIL porque a Operação ainda abre o cadastro diretamente.

- [ ] **Step 3: Implement filtered operation and navigation**

Substituir a ação principal por:

```html
<button id="openMarketplaceCatalogBtn" class="primary-btn" type="button" data-action="marketplace-open-catalog"><i class="ti ti-package-export" aria-hidden="true"></i> Criar anúncio a partir do catálogo</button>
```

No roteador:

```js
if (action === "marketplace-open-catalog") {
  setMarketplaceArea("catalog");
  return;
}
```

Em `renderMarketplaces()`, aplicar `operationalMarketplaceListings(state.marketplaceListings)` antes dos filtros, paginação e indicadores operacionais.

- [ ] **Step 4: Run full verification**

Run: `npm run check && npm run test:unit`
Expected: lint/check e todos os testes unitários passam.

- [ ] **Step 5: Commit**

```bash
git add index.html js/features/marketplace.js js/core/router.js tests/unit/marketplace-actions-ui.test.js
git commit -m "feat: focus marketplace operation on channel listings"
```

### Task 4: Verificar o fluxo no navegador

**Files:**
- Modify only if verification reveals a defect in the files already listed.

**Interfaces:**
- Consumes: aplicação local e fluxo autenticado existente.
- Produces: evidência de que as abas, ações e estados vazios funcionam visualmente.

- [ ] **Step 1: Start the local app**

Run: `npm install && npm run test:e2e -- --list`
Expected: dependências disponíveis e suíte E2E detectada.

- [ ] **Step 2: Run the relevant automated browser checks**

Run: `npm run test:e2e`
Expected: PASS ou registro explícito de bloqueio por credenciais/ambiente.

- [ ] **Step 3: Re-run repository verification**

Run: `npm run check && npm run test:unit && git diff --check && git status --short --branch`
Expected: verificações verdes e apenas commits planejados à frente de `origin/master`.
