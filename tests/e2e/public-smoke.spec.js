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

test("dialogos de confirmacao e texto respeitam contexto e acessibilidade", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { showAppConfirm } = await import("/js/core/dom.js");
    window.__confirmResult = showAppConfirm("Excluir registro", "Esta ação não pode ser desfeita.", { confirmLabel: "Excluir", danger: true });
  });
  const confirmDialog = page.getByRole("dialog", { name: "Excluir registro" });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByRole("button", { name: "Excluir" })).toHaveClass(/danger-btn/);
  await confirmDialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirmDialog).toBeHidden();

  await page.evaluate(async () => {
    const { showAppPrompt } = await import("/js/core/dom.js");
    window.__promptResult = showAppPrompt("Motivo", "Descreva a solicitação.", { label: "Detalhes", confirmLabel: "Enviar" });
  });
  const promptDialog = page.getByRole("dialog", { name: "Motivo" });
  await expect(promptDialog.getByLabel("Detalhes")).toBeFocused();
  await promptDialog.getByRole("button", { name: "Enviar" }).click();
  await expect(promptDialog.getByText("Preencha este campo para continuar.")).toBeVisible();
  await promptDialog.getByRole("button", { name: "Cancelar" }).click();
});

test("controles estaticos possuem nome acessivel", async ({ page }) => {
  await page.goto("/");
  const unnamed = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea, button')];
    return controls.filter((control) => {
      const linkedLabel = control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
      const text = control.tagName === "BUTTON" ? control.textContent.trim() : "";
      return !text && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby") && !control.title && !linkedLabel && !control.closest("label");
    }).map((control) => control.id || control.getAttribute("name") || control.outerHTML.slice(0, 80));
  });
  expect(unnamed).toEqual([]);
});

test("rastreamento publico funciona sob CSP e escapa dados externos", async ({ page }) => {
  await page.route("**/api/tracking?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "PED-TESTE",
      status: "Em transporte",
      created_at: "2026-07-16T10:00:00Z",
      description: '<img src=x onerror="window.__trackingXss=true">',
      address_city: "Sao Paulo",
      address_state: "SP",
      logistics: [{ created_at: "2026-07-16T10:00:00Z", title: "Postado", description: "Objeto recebido" }],
    }),
  }));
  await page.goto("/tracking.html?order=PED-TESTE&key=teste");
  await expect(page.getByText("Pedido #PED-TESTE")).toBeVisible();
  await expect(page.getByText('<img src=x onerror="window.__trackingXss=true">')).toBeVisible();
  expect(await page.evaluate(() => window.__trackingXss === true)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
