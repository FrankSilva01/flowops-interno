import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { location: { hash: "" }, SUPABASE_CONFIG: {} };

const { buildOrderPresentation } = await import("../../js/features/orders.js");

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
