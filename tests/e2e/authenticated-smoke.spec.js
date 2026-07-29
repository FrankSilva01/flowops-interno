import { test, expect } from "@playwright/test";

const email = process.env.FLOWOPS_E2E_EMAIL;
const password = process.env.FLOWOPS_E2E_PASSWORD;
const tenantName = process.env.FLOWOPS_E2E_TENANT_NAME;
const forbiddenText = process.env.FLOWOPS_E2E_FORBIDDEN_TEXT;
const productionOrderId = process.env.FLOWOPS_E2E_REALTIME_ORDER_ID;
const logisticsOrderId = process.env.FLOWOPS_E2E_LOGISTICS_ORDER_ID;

async function openMarketplaceCatalog(page) {
  const marketplaceTab = page.locator('[data-view="marketplace"]');
  await marketplaceTab.click();
  const productsArea = page.locator('[data-marketplace-area="products"]');
  await expect(productsArea).toBeVisible();
  await productsArea.click();
  await expect(page.locator('[data-marketplace-area-views="products"]')).toBeVisible();
  await expect(page.locator("#openCatalogProductDialogBtn")).toBeVisible();
}

test.describe("sessao autenticada", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!email || !password, "Defina FLOWOPS_E2E_EMAIL e FLOWOPS_E2E_PASSWORD.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator("#onlineEmail").fill(email || "");
    await page.locator("#onlinePassword").fill(password || "");
    await page.locator("#onlineLoginForm").getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator("#appView")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
  });

  test("@release:authenticated-shell navega pelos modulos sem vazamento ou rolagem lateral", async ({ page }, testInfo) => {
    if (process.env.FLOWOPS_CAPTURE_VISUALS) {
      await page.screenshot({ path: `output/playwright/dashboard-${testInfo.project.name}.png`, fullPage: true });
    }
    for (const view of ["dashboard", "orders", "production", "logistics", "leads", "cash", "materials", "reports"]) {
      const button = page.locator(`[data-view="${view}"]`).first();
      if (await button.isVisible()) {
        await button.click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow, `${view} criou rolagem horizontal`).toBe(false);
      }
    }
    if (tenantName) await expect(page.locator("body")).toContainText(tenantName);
    if (forbiddenText) await expect(page.locator("body")).not.toContainText(forbiddenText);
  });

  test("@release:marketplace-product-drawer abre cadastro de produto como drawer lateral responsivo", async ({ page }, testInfo) => {
    const marketplaceTab = page.locator('[data-view="marketplace"]');
    test.skip(!(await marketplaceTab.isVisible()), "Marketplace indisponivel para este perfil.");
    await openMarketplaceCatalog(page);
    await page.locator("#openCatalogProductDialogBtn").click();
    const dialog = page.locator("#productDialog");
    await expect(dialog).toBeVisible();
    const layout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        rightGap: Math.abs(window.innerWidth - rect.right),
        heightGap: Math.abs(window.innerHeight - rect.height),
        overflow: element.scrollWidth > element.clientWidth + 1,
      };
    });
    expect(layout.rightGap).toBeLessThanOrEqual(1);
    expect(layout.heightGap).toBeLessThanOrEqual(1);
    expect(layout.overflow).toBe(false);
    await expect(dialog.getByRole("button", { name: "Próximo →" })).toBeVisible();
    if (process.env.FLOWOPS_CAPTURE_VISUALS) {
      await page.screenshot({ path: `output/playwright/product-drawer-${testInfo.project.name}.png`, fullPage: false });
    }
  });

  test("@release:order-create-drawer abre nova encomenda em drawer organizado", async ({ page }, testInfo) => {
    await page.goto("/#orders");
    await expect(page.locator("#appView")).toBeVisible();
    await page.locator("#openOrderCreateBtn").click();
    const dialog = page.locator("#orderCreateDialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Dados principais", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Produção e prazo", { exact: true })).toBeVisible();
    const layout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { rightGap: Math.abs(window.innerWidth - rect.right), overflow: element.scrollWidth > element.clientWidth + 1, verticalOverflow: element.scrollHeight > element.clientHeight + 1 };
    });
    expect(layout.rightGap).toBeLessThanOrEqual(1);
    expect(layout.overflow).toBe(false);
    if ((page.viewportSize()?.height || 0) >= 800) expect(layout.verticalOverflow).toBe(false);
    if (process.env.FLOWOPS_CAPTURE_VISUALS) await page.screenshot({ path: `output/playwright/order-create-drawer-${testInfo.project.name}.png` });
  });

  test("@release:orders mantem lista FlowOps Next e acoes operacionais", async ({ page }) => {
    await page.goto("/#orders");
    await expect(page.locator("#appView")).toBeVisible();
    await expect(page.locator("#ordersView")).toHaveClass(/flowops-next-orders/);

    const cards = page.locator(".flowops-next-order-card");
    test.skip((await cards.count()) === 0, "Nenhuma encomenda disponivel para validar a lista.");
    const firstCard = cards.first();
    const orderCode = (await firstCard.locator(".order-code").textContent())?.trim() || "";
    await expect(firstCard.locator(".flowops-next-order-id")).toBeVisible();

    await page.locator("#ordersSearchInput").fill(orderCode);
    await expect(firstCard).toBeVisible();
    await page.locator("#ordersSearchInput").fill("");

    const preparingFilter = page.locator('[data-order-status-pill="A preparar"]');
    await preparingFilter.click();
    await expect(preparingFilter).toHaveClass(/active/);
    await page.locator('[data-order-status-pill="all"]').click();

    await page.locator("#ordersViewTableBtn").click();
    await expect(page.locator("#ordersTableWrap")).toBeVisible();
    await page.locator("#ordersViewCardsBtn").click();
    await expect(page.locator("#ordersGrid")).toBeVisible();

    await firstCard.click();
    const detail = page.locator("#orderDetailPanel.flowops-next-order-detail");
    await expect(detail).toContainText(orderCode);
    await detail.locator('[data-action="edit-order-modal"]').click();
    await expect(page.locator("#orderEditDialog")).toBeVisible();
    await page.locator('#orderEditDialog [data-close-dialog="orderEditDialog"]').click();

    const checkbox = firstCard.locator(".order-select-checkbox");
    await checkbox.click({ force: true, noWaitAfter: true });
    await expect(page.locator("#ordersBulkCount")).toContainText("1 selecionada");
    await expect(page.locator("#deleteOrdersSelectionBtn")).toBeEnabled();

    await page.locator("#openOrderCreateBtn").click();
    await expect(page.locator("#orderCreateDialog")).toBeVisible();
  });

  test("@release:library mostra referencias das encomendas sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#library");
    await expect(page.locator("#appView")).toBeVisible();
    await expect(page.locator("#libraryView")).toHaveClass(/active-view/);
    const libraryHasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(libraryHasOverflow, "library criou rolagem horizontal em 390px").toBe(false);

    const cards = page.locator("[data-library-asset]");
    test.skip((await cards.count()) === 0, "Nenhuma referencia de encomenda disponivel para validar a biblioteca.");
    const firstCard = cards.first();
    const orderCode = await firstCard.getAttribute("data-library-order-code");
    await expect(firstCard).toContainText(orderCode || "");
    await expect(firstCard.locator('a[target="_blank"]')).toHaveAttribute("rel", /noopener/);

    await page.locator("#libraryTypeFilter").evaluate((element) => {
      element.insertAdjacentHTML("beforeend", '<option value="missing">Tipo inexistente</option>');
      element.value = "missing";
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator("#referenceLibraryEmpty")).toBeVisible();
  });

  test("@release:production-next shows the compact summary, keeps overflow in the board, and opens the order drawer", async ({ page }) => {
    test.skip(!productionOrderId, "Configure FLOWOPS_E2E_REALTIME_ORDER_ID for production evidence.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#production");
    await expect(page.locator("#appView")).toBeVisible();
    await expect(page.locator("#productionStageSummary")).toBeVisible();

    const boardScroll = page.locator(".production-next-board-scroll");
    await expect(boardScroll).toBeVisible();
    expect(await boardScroll.evaluate((element) => element.scrollWidth > element.clientWidth + 1), "kanban should scroll inside its board").toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), "production created page overflow at 390px").toBe(false);

    const seededCard = page.locator(`.production-next-card[data-id="${productionOrderId}"]`);
    await expect(seededCard).toBeVisible();
    const orderCode = (await seededCard.locator(".order-code").textContent())?.trim() || "";
    await expect(seededCard).toContainText(orderCode);
    await seededCard.click();
    await expect(page.locator("#orderDrawer")).toHaveClass(/open/);
  });

  test("@release:logistics-next shows persisted tracking, drawer controls, and timeline without mobile overflow", async ({ page }) => {
    test.skip(!logisticsOrderId, "Configure FLOWOPS_E2E_LOGISTICS_ORDER_ID for logistics evidence.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#logistics");
    await expect(page.locator("#appView")).toBeVisible();
    await expect(page.locator("#logisticsPageSummary")).toBeVisible();
    await expect(page.locator("#logisticsSyncStatus")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), "logistics created page overflow at 390px").toBe(false);

    const seededOrderButton = page.locator(`#logisticsTable [data-action="open-logistics"][data-id="${logisticsOrderId}"]`);
    await expect(seededOrderButton).toBeVisible();
    await seededOrderButton.click();

    const dialog = page.locator("#logisticsDialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#copyPublicTrackingLinkButton")).toBeVisible();
    await expect(dialog.locator("#logisticsTimeline")).toBeVisible();
  });

  test("@release:marketplace-shopee-export abre exportacao Shopee direta para selecao individual", async ({ page }) => {
    await page.goto("/#marketplace");
    await expect(page.locator("#appView")).toBeVisible();
    const checkbox = page.locator('[data-action="marketplace-migrate-select"]').first();
    test.skip(!(await checkbox.isVisible()), "Nenhum anúncio disponível para exportação.");
    await checkbox.check();
    await expect(page.locator("#exportShopeeTemplateBtn")).toBeEnabled();
    await page.locator("#exportShopeeTemplateBtn").click();
    await expect(page.locator("#shopeeTemplateExportDialog")).toBeVisible();
    await expect(page.locator("#shopeeExportSelectionCount")).toContainText("1 anúncio");
    await expect(page.locator('#shopeeTemplateExportForm input[type="file"]')).toHaveCount(0);
    await expect(page.locator("#shopeeTemplateExportSubmit")).toBeEnabled();
  });

  test("@release:marketplace-performance performance do marketplace nao cria overflow horizontal em viewports responsivos", async ({ page }) => {
    const viewports = [
      { name: "desktop", width: 1440, height: 900 },
      { name: "tablet", width: 1024, height: 768 },
      { name: "mobile", width: 390, height: 844 },
    ];

    for (const { name, width, height } of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto("/#marketplace");
      await expect(page.locator("#appView")).toBeVisible();
      const performanceArea = page.locator('[data-marketplace-area="performance"]');
      test.skip(!(await performanceArea.isVisible()), "Marketplace indisponivel para este perfil.");
      await performanceArea.click();
      await expect(page.locator("#marketplaceIntelligenceView")).toHaveClass(/active/);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(hasOverflow, `${name} criou rolagem horizontal`).toBe(false);
    }
  });

  test("mantem filtros de canal somente em Produtos do Marketplace", async ({ page }) => {
    await page.goto("/#marketplace");
    await expect(page.locator("#appView")).toBeVisible();
    const marketplaceTab = page.locator('[data-view="marketplace"]');
    test.skip(!(await marketplaceTab.isVisible()), "Marketplace indisponivel para este perfil.");
    const productsArea = page.locator('[data-marketplace-area="products"]');
    const ordersArea = page.locator('[data-marketplace-area="orders"]');
    const channelsArea = page.locator('[data-marketplace-area="channels"]');
    const performanceArea = page.locator('[data-marketplace-area="performance"]');

    await productsArea.click();
    const filters = page.locator("#marketplaceChannelFilters");
    const shopee = filters.locator('[data-channel="shopee"]');
    await shopee.click();
    await expect(shopee).toHaveClass(/active/);

    for (const area of [ordersArea, channelsArea, performanceArea]) {
      await area.click();
      await expect(filters).toBeHidden();
      expect(await filters.locator("button").evaluateAll((buttons) => buttons.every((button) => button.disabled))).toBe(true);
    }

    await productsArea.click();
    await expect(filters).toBeVisible();
    expect(await filters.locator("button").evaluateAll((buttons) => buttons.every((button) => !button.disabled))).toBe(true);
    await expect(shopee).toHaveClass(/active/);
  });

  test("@release:order-bulk-delete seleciona encomenda e disponibiliza exclusao administrativa", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) < 720, "Barra de ações em lote validada no layout desktop.");
    await page.goto("/#orders");
    await expect(page.locator("#appView")).toBeVisible();
    const checkbox = page.locator(".order-select-checkbox").first();
    test.skip(!(await checkbox.isVisible()), "Nenhuma encomenda disponivel para validar a selecao.");
    await checkbox.click({ force: true, noWaitAfter: true });
    await expect(page.locator("#ordersBulkCount")).toContainText("1 selecionada");
    await expect(page.locator("#deleteOrdersSelectionBtn")).toBeEnabled();
  });

  test("@release:order-delete-cancel oferece exclusao individual sem remover ao cancelar", async ({ page }) => {
    await page.goto("/#orders");
    await expect(page.locator("#appView")).toBeVisible();
    const cards = page.locator(".order-card");
    test.skip((await cards.count()) === 0, "Nenhuma encomenda disponivel.");
    await cards.first().click();
    const deleteButton = page.locator('#orderDetailPanel [data-action="delete-order"]');
    await expect(deleteButton).toBeVisible();
    const countBefore = await cards.count();
    await deleteButton.click();
    const confirmDialog = page.getByRole("dialog", { name: "Excluir encomenda?" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(cards).toHaveCount(countBefore);
  });

  test("@release:marketplace-report renderiza relatorio de marketplaces com classificacao normalizada", async ({ page }, testInfo) => {
    await page.goto("/#reports");
    await expect(page.locator("#appView")).toBeVisible();
    await page.locator('[data-report-tab="marketplaces"]').click();
    await expect(page.locator("#reportsContent")).toContainText("Pedidos externos únicos");
    await expect(page.locator("#reportsContent")).toContainText("Mercado Livre");
    if (process.env.FLOWOPS_CAPTURE_VISUALS) {
      await page.screenshot({ path: `output/playwright/report-marketplaces-${testInfo.project.name}.png`, fullPage: true });
    }
  });
});
