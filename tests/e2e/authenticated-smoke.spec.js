import { test, expect } from "@playwright/test";

const email = process.env.FLOWOPS_E2E_EMAIL;
const password = process.env.FLOWOPS_E2E_PASSWORD;
const tenantName = process.env.FLOWOPS_E2E_TENANT_NAME;
const forbiddenText = process.env.FLOWOPS_E2E_FORBIDDEN_TEXT;

test.describe("sessao autenticada", () => {
  test.skip(!email || !password, "Defina FLOWOPS_E2E_EMAIL e FLOWOPS_E2E_PASSWORD.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator("#onlineEmail").fill(email || "");
    await page.locator("#onlinePassword").fill(password || "");
    await page.locator("#onlineLoginForm").getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator("#appView")).toBeVisible({ timeout: 20_000 });
  });

  test("navega pelos modulos sem vazamento ou rolagem lateral", async ({ page }) => {
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
});
