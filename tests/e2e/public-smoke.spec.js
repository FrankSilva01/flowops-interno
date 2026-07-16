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

test("menu lateral alterna entre compacto e expandido", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "No mobile o menu lateral vira navegacao inferior.");
  await page.goto("/");
  await page.evaluate(() => {
    document.querySelector("#onlineLogin").hidden = true;
    const app = document.querySelector("#appView");
    app.hidden = false;
    app.classList.add("sidebar-collapsed");
  });

  const app = page.locator("#appView");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toHaveCSS("width", "56px");
  await page.locator("#sidebarToggle").click();
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await expect(sidebar).toHaveCSS("width", "220px");
  await expect(page.locator(".sidebar .nav-label").first()).toBeVisible();
  const toggleAppearance = await page.locator("#sidebarToggle").evaluate((button) => ({
    icon: getComputedStyle(button, "::before").content,
    legacyIcon: getComputedStyle(button.firstElementChild).display,
  }));
  expect(toggleAppearance.icon).toContain("‹");
  expect(toggleAppearance.legacyIcon).toBe("none");
});

test("seletor da encomenda permanece dentro do card", async ({ page }) => {
  await page.goto("/");
  const bounds = await page.evaluate(() => {
    const card = document.createElement("article");
    card.className = "order-card";
    card.style.cssText = "width:320px;height:180px;margin:80px";
    card.innerHTML = '<label class="order-card-select"><input type="checkbox"></label>';
    document.body.append(card);
    const cardRect = card.getBoundingClientRect();
    const selectorRect = card.querySelector(".order-card-select").getBoundingClientRect();
    return {
      card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
      selector: { left: selectorRect.left, top: selectorRect.top, right: selectorRect.right, bottom: selectorRect.bottom },
    };
  });
  expect(bounds.selector.left).toBeGreaterThanOrEqual(bounds.card.left);
  expect(bounds.selector.top).toBeGreaterThanOrEqual(bounds.card.top);
  expect(bounds.selector.right).toBeLessThanOrEqual(bounds.card.right);
  expect(bounds.selector.bottom).toBeLessThanOrEqual(bounds.card.bottom);
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
  await page.route("**/functions/v1/public-tracking?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "PED-TESTE",
      status: "Em transporte",
      created_at: "2026-07-16T10:00:00Z",
      description: '<img src=x onerror="window.__trackingXss=true">',
      logistics: { carrier: "Correios", tracking_code: "BR123", status: "Em transporte" },
      events: [{ occurred_at: "2026-07-16T10:00:00Z", status: "Postado", message: "Objeto recebido" }],
    }),
  }));
  await page.goto("/tracking.html?token=00000000-0000-4000-8000-000000000001");
  await expect(page.getByText("Pedido #PED-TESTE")).toBeVisible();
  await expect(page.getByText('<img src=x onerror="window.__trackingXss=true">')).toBeVisible();
  expect(await page.evaluate(() => window.__trackingXss === true)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
