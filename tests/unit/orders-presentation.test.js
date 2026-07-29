import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { location: { hash: "" }, SUPABASE_CONFIG: {} };

const { buildOrderPresentation, renderOrderCard } = await import("../../js/features/orders.js");
const stateSource = readFileSync(new URL("../../js/core/state.js", import.meta.url), "utf8");
const ordersSource = readFileSync(new URL("../../js/features/orders.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("usa tabela como visualizacao inicial e oculta a barra em lote sem selecao", () => {
  assert.match(stateSource, /flowops-next-orders-view-mode"\)\) \? localStorage\.getItem\("flowops-next-orders-view-mode"\) : "table"/);
  assert.match(ordersSource, /toolbar\.hidden = !state\.canEdit \|\| selected\.length === 0/);
  assert.match(styles, /\.orders-bulk-toolbar\[hidden\]\s*\{\s*display:\s*none/);
});

test("builds a safe display model without changing the real order", () => {
  const order = {
    id: "PED-4",
    orderCode: "PED-0004",
    client: "Cliente real",
    description: "Produto real",
    productId: "product-4",
    referenceImageUrl: "https://cdn.test/ref.jpg",
    stlLink: "https://drive.test/model.stl"
  };

  const presentation = buildOrderPresentation(order);

  assert.equal(presentation.order, order);
  assert.deepEqual(presentation, {
    order,
    orderId: "PED-4",
    orderCode: "PED-0004",
    client: "Cliente real",
    title: "Produto real",
    productId: "product-4",
    imageUrl: "https://cdn.test/ref.jpg",
    stlUrl: "https://drive.test/model.stl"
  });
  assert.equal(order.referenceImageUrl, "https://cdn.test/ref.jpg");
});

test("uses safe fallbacks for incomplete orders", () => {
  const order = { id: "PED-5", referenceImageUrl: "javascript:alert(1)" };
  assert.deepEqual(buildOrderPresentation(order), {
    order,
    orderId: "PED-5",
    orderCode: "PED-5",
    client: "Cliente não informado",
    title: "Encomenda sem descrição",
    productId: "",
    imageUrl: "",
    stlUrl: ""
  });
});

test("renders a FlowOps Next card with the real order identity and reference", () => {
  const order = {
    id: "PED-42",
    orderCode: "FO-2026-0042",
    client: "Marina Almeida",
    description: "Busto personalizado",
    quantity: 2,
    material: "Resina",
    referenceImageUrl: "https://cdn.test/orders/ped-42.jpg",
    status: "A preparar"
  };

  const markup = renderOrderCard(order, null);

  assert.match(markup, /flowops-next-order-card/);
  assert.match(markup, /class="flowops-next-order-id">PED-42</);
  assert.match(markup, /class="flowops-next-order-client"[^>]*>[\s\S]*Marina Almeida/);
  assert.match(markup, /Busto personalizado/);
  assert.match(markup, /src="https:\/\/cdn\.test\/orders\/ped-42\.jpg"/);
});
