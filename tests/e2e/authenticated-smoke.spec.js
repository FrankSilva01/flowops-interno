import { test, expect } from "@playwright/test";

const email = process.env.FLOWOPS_E2E_EMAIL;
const password = process.env.FLOWOPS_E2E_PASSWORD;
const tenantName = process.env.FLOWOPS_E2E_TENANT_NAME;
const forbiddenText = process.env.FLOWOPS_E2E_FORBIDDEN_TEXT;

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

  test("navega pelos modulos sem vazamento ou rolagem lateral", async ({ page }, testInfo) => {
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

  test("abre cadastro de produto como drawer lateral responsivo", async ({ page }, testInfo) => {
    const marketplaceTab = page.locator('[data-view="marketplace"]');
    test.skip(!(await marketplaceTab.isVisible()), "Marketplace indisponivel para este perfil.");
    await marketplaceTab.click();
    await page.locator('[data-action="open-product-dialog"]').click();
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

  test("abre nova encomenda em drawer organizado", async ({ page }, testInfo) => {
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

  test("abre exportacao Shopee direta para selecao individual", async ({ page }) => {
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

  test("performance do marketplace nao cria overflow horizontal", async ({ page }) => {
    await page.goto("/#marketplace");
    await expect(page.locator("#appView")).toBeVisible();
    const performanceArea = page.locator('[data-marketplace-area="performance"]');
    test.skip(!(await performanceArea.isVisible()), "Marketplace indisponivel para este perfil.");
    await performanceArea.click();
    await expect(page.locator("#marketplaceIntelligenceView")).toHaveClass(/active/);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow).toBe(false);
  });

  test("seleciona encomenda e disponibiliza exclusao administrativa", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) < 720, "Barra de ações em lote validada no layout desktop.");
    await page.goto("/#orders");
    await expect(page.locator("#appView")).toBeVisible();
    const checkbox = page.locator(".order-select-checkbox").first();
    test.skip(!(await checkbox.isVisible()), "Nenhuma encomenda disponivel para validar a selecao.");
    await checkbox.click({ force: true, noWaitAfter: true });
    await expect(page.locator("#ordersBulkCount")).toContainText("1 selecionada");
    await expect(page.locator("#deleteOrdersSelectionBtn")).toBeEnabled();
  });

  test("oferece exclusao individual sem remover ao cancelar", async ({ page }) => {
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

  test("renderiza relatorio de marketplaces com classificacao normalizada", async ({ page }, testInfo) => {
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
