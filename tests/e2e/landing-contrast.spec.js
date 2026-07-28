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

test("selo de erro do log permanece legível no tema escuro", async ({ page }) => {
  await page.goto(new URL("../../index.html", import.meta.url).href);
  await page.locator("html").evaluate((root) => root.dataset.theme = "dark");
  await page.locator("body").evaluate((body) => {
    body.innerHTML = '<span id="logErrorStatus" class="api-status error">Erro</span>';
  });
  const colors = await page.locator("#logErrorStatus").evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, backgroundColor: style.backgroundColor };
  });
  expect(colors.color).not.toBe(colors.backgroundColor);
  expect(colors.color).toBe("rgb(255, 210, 206)");
  expect(colors.backgroundColor).toBe("rgb(74, 37, 34)");
});
