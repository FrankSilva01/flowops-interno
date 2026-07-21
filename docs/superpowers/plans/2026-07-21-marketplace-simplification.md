# Marketplace Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o Marketplace em quatro areas, reduzir a densidade de acoes e tornar a exportacao Shopee independente de CDN.

**Architecture:** Os oito identificadores de visao existentes permanecem intactos e sao agrupados por uma camada de navegacao em quatro areas. O carregador XLSX passa a usar um bundle local fixado e uma Promise compartilhada. Acoes raras sao movidas para um menu contextual e a selecao em lote ganha uma barra propria.

**Tech Stack:** HTML, CSS, JavaScript ES modules, SheetJS 0.18.5 local, Node test runner, Playwright.

## Global Constraints

- Preservar contratos das APIs e identificadores internos das visoes.
- Manter os fluxos atuais de sincronizacao, publicacao, logs e backup.
- Nao causar rolagem horizontal global em desktop ou mobile.
- Uma unica acao primaria por contexto.
- Geracao Shopee deve funcionar sem requisicao a CDN.

---

### Task 1: Carregador XLSX local

**Files:**
- Create: `assets/vendor/xlsx.full.min.js`
- Create: `assets/vendor/LICENSE.sheetjs.txt`
- Modify: `js/core/importer.js`
- Test: `tests/unit/xlsx-loader.test.js`

**Interfaces:**
- Produces: `loadXlsx(): Promise<void>` que carrega `/assets/vendor/xlsx.full.min.js`, reutiliza chamadas concorrentes e rejeita com mensagem operacional.

- [ ] Escrever teste que exige URL local, Promise compartilhada e tratamento de falha.
- [ ] Executar `node --test tests/unit/xlsx-loader.test.js` e confirmar falha pela URL CDN atual.
- [ ] Adicionar bundle e licenca fixados; implementar carregamento local com timeout e limpeza da Promise apos falha.
- [ ] Executar o teste e confirmar sucesso.
- [ ] Commitar como `fix: carrega gerador XLSX localmente`.

### Task 2: Agrupamento em quatro areas

**Files:**
- Create: `js/features/marketplace-navigation.js`
- Modify: `index.html`
- Modify: `js/features/marketplace.js`
- Modify: `js/core/router.js`
- Test: `tests/unit/marketplace-navigation.test.js`

**Interfaces:**
- Produces: `MARKETPLACE_AREAS`, `marketplaceAreaForView(view)` e `defaultMarketplaceViewForArea(area)`.
- Consumes: visoes `listings`, `sales`, `ml-questions`, `storefront`, `intelligence`, `integrations`, `api-logs`, `backup`.

- [ ] Escrever testes do mapa completo de oito visoes para quatro areas.
- [ ] Executar o teste e confirmar falha pela ausencia do modulo.
- [ ] Implementar mapa puro e substituir as nove guias principais por quatro areas com navegacao secundaria.
- [ ] Atualizar `setMarketplaceView()` para sincronizar area, visao e controles ativos sem alterar renderizadores.
- [ ] Executar testes focados e `npm run check`.
- [ ] Commitar como `feat: organiza Marketplace em quatro areas`.

### Task 3: Acoes contextuais e selecao em lote

**Files:**
- Modify: `index.html`
- Modify: `js/features/marketplace.js`
- Modify: `js/core/router.js`
- Modify: `css/flowops.css`
- Test: `tests/unit/marketplace-actions-ui.test.js`

**Interfaces:**
- Produces: menu `marketplaceMoreActions` e barra `marketplaceBulkActions` controlada pela selecao existente.

- [ ] Escrever teste de DOM que limita as acoes visiveis e exige menu/barra contextual.
- [ ] Executar o teste e confirmar falha na barra atual.
- [ ] Manter `Cadastrar produto` como primaria e `Sincronizar` como secundaria; mover importacao e exportacoes para o menu.
- [ ] Exibir replicacao e exportacao Shopee na barra somente quando houver selecao.
- [ ] Adicionar fechamento por clique externo e `Escape` usando os bindings centrais existentes.
- [ ] Executar testes focados e `npm run check`.
- [ ] Commitar como `feat: contextualiza acoes do Marketplace`.

### Task 4: Drawer Shopee responsivo

**Files:**
- Modify: `index.html`
- Modify: `js/features/marketplace.js`
- Modify: `css/flowops.css`
- Test: `tests/unit/shopee-direct-export-ui.test.js`

**Interfaces:**
- Preserva: `shopeeTemplateExportForm`, `shopeeTemplateExportSummary` e `exportSelectedListingsToShopee()`.

- [ ] Atualizar o teste para exigir resumo compacto, secao de fallback recolhivel e acao mobile estavel.
- [ ] Executar o teste e confirmar falha na estrutura atual.
- [ ] Reorganizar campos sem alterar nomes enviados ao gerador.
- [ ] Diferenciar mensagens de validacao, carregamento XLSX e geracao.
- [ ] Executar testes focados e `npm run check`.
- [ ] Commitar como `refactor: simplifica exportacao Shopee`.

### Task 5: Auditoria, verificacao e deploy

**Files:**
- Modify: `index.html` para cache busting.
- Modify: `docs/superpowers/plans/2026-07-21-marketplace-simplification.md` para marcar conclusao.

- [ ] Executar `git diff --check`.
- [ ] Executar `npm run check`.
- [ ] Executar `npm run test:unit`.
- [ ] Iniciar servidor local e executar Playwright desktop/mobile para Marketplace e download Shopee.
- [ ] Inspecionar console, overflow global e estados de navegacao.
- [ ] Corrigir somente falhas reproduzidas e repetir verificacao.
- [ ] Atualizar versoes de cache de CSS/JS.
- [ ] Commitar verificacao final, enviar `HEAD:master` e confirmar o commit remoto.
