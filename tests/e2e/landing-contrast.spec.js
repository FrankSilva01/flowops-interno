import { expect, test } from "@playwright/test";

test("ação secundária do diálogo de sucesso mantém contraste legível", async ({ page }) => {
  await page.goto(new URL("../../landing/index.html", import.meta.url).href);
  await page.locator("#successActions").evaluate((container) => {
    container.innerHTML = '<button class="button secondary" id="stayButton">Continuar nesta página</button>';
  });

  const colors = await page.locator("#stayButton").evaluate((button) => {
    const style = getComputedStyle(button);
    return { color: style.color, backgroundColor: style.backgroundColor };
  });

  expect(colors.color).toBe("rgb(16, 36, 43)");
  expect(colors.backgroundColor).toBe("rgb(255, 255, 255)");
});
