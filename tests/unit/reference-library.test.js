import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { location: { hash: "" }, SUPABASE_CONFIG: {} };

const referenceLibrary = await import("../../js/features/reference-library.js");
const { buildReferenceLibrary } = referenceLibrary;

test("derives image and STL assets from existing orders", () => {
  const assets = buildReferenceLibrary([{
    id: "PED-1", orderCode: "PED-0001", client: "Cliente real",
    description: "Produto real", referenceImageUrl: "https://cdn.test/ref.jpg",
    stlLink: "https://drive.test/model.stl"
  }]);
  assert.deepEqual(assets.map(({ type, orderCode }) => ({ type, orderCode })), [
    { type: "image", orderCode: "PED-0001" },
    { type: "model", orderCode: "PED-0001" }
  ]);
});

test("does not create sample assets when orders have no references", () => {
  assert.deepEqual(buildReferenceLibrary([{ id: "PED-2", orderCode: "PED-0002" }]), []);
});

test("library groups only persisted order references", () => {
  const realOrderFixture = [{
    id: "PED-10", orderCode: "PED-0010", client: "Ana", referenceImageUrl: "https://cdn.test/ana.jpg"
  }];
  const assets = buildReferenceLibrary(realOrderFixture);

  assert.equal(assets.some((asset) => asset.orderId === "sample"), false);
  assert.equal(assets.every((asset) => asset.orderCode), true);
});

test("filters derived references by type, order and client", () => {
  assert.equal(typeof referenceLibrary.filterReferenceLibrary, "function");
  const assets = buildReferenceLibrary([
    { id: "PED-11", orderCode: "PED-0011", client: "Ana Lima", referenceImageUrl: "https://cdn.test/ana.jpg" },
    { id: "PED-12", orderCode: "PED-0012", client: "Bruno Silva", stlLink: "https://cdn.test/bruno.stl" }
  ]);

  assert.deepEqual(
    referenceLibrary.filterReferenceLibrary(assets, { type: "model", order: "PED-0012", client: "bruno" }).map((asset) => asset.id),
    ["PED-12:model"]
  );
  assert.deepEqual(referenceLibrary.filterReferenceLibrary(assets, { type: "missing" }), []);
});

test("keeps only safe reference URLs and real order metadata", () => {
  const [asset] = buildReferenceLibrary([{
    id: "PED-3", referenceImageUrl: "javascript:alert(1)", stlLink: "https://drive.test/model.stl"
  }]);
  assert.equal(asset.url, "https://drive.test/model.stl");
  assert.equal(asset.client, "Cliente não informado");
  assert.equal(asset.title, "Encomenda sem descrição");
});
