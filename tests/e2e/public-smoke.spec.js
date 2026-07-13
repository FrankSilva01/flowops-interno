import { test, expect } from "@playwright/test";

test("abre login e oferece recuperacao e documentos legais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FlowOps" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recuperar senha" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Termos" })).toHaveAttribute("href", "termos.html");
  await expect(page.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "privacidade.html");
});

for (const path of ["/termos.html", "/privacidade.html", "/cancelamento.html"]) {
  test(`${path} esta publicado`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("login nao cria rolagem horizontal", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
