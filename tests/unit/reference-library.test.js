import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { location: { hash: "" }, SUPABASE_CONFIG: {} };

const { buildReferenceLibrary } = await import("../../js/features/reference-library.js");

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

test("keeps only safe reference URLs and real order metadata", () => {
  const [asset] = buildReferenceLibrary([{
    id: "PED-3", referenceImageUrl: "javascript:alert(1)", stlLink: "https://drive.test/model.stl"
  }]);
  assert.equal(asset.url, "https://drive.test/model.stl");
  assert.equal(asset.client, "Cliente não informado");
  assert.equal(asset.title, "Encomenda sem descrição");
});
