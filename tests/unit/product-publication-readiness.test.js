import assert from "node:assert/strict";
import test from "node:test";

const readinessModule = await import("../../js/features/product-publication-readiness.js").catch(() => ({}));

test("titulo curto deixa Mercado Livre pendente sem invalidar o produto", () => {
  assert.equal(typeof readinessModule.getProductPublicationReadiness, "function");
  const result = readinessModule.getProductPublicationReadiness({
    channel: "mercado-livre",
    name: "Teste",
    connected: true,
    categoryId: "MLB123",
    imageCount: 3,
    linked: false,
  });
  assert.equal(result.status, "pending");
  assert.match(result.blockers.join(" "), /nome mais completo/i);
});

test("lista todas as pendencias de publicacao do Mercado Livre", () => {
  assert.equal(typeof readinessModule.getProductPublicationReadiness, "function");
  const result = readinessModule.getProductPublicationReadiness({
    channel: "mercado-livre",
    name: "Produto completo marca modelo",
    connected: false,
    categoryId: "",
    imageCount: 1,
    linked: false,
  });
  assert.equal(result.status, "pending");
  assert.deepEqual(result.blockers, [
    "conecte a conta do Mercado Livre",
    "selecione a categoria",
    "adicione pelo menos 3 fotos (1 de 3)",
  ]);
});

test("produto completo fica pronto para publicar", () => {
  assert.equal(typeof readinessModule.getProductPublicationReadiness, "function");
  const result = readinessModule.getProductPublicationReadiness({
    channel: "mercado-livre",
    name: "Miniatura Deadpool 15cm Resina",
    connected: true,
    categoryId: "MLB123",
    imageCount: 3,
    linked: false,
  });
  assert.deepEqual(result, { channel: "mercado-livre", status: "ready", blockers: [] });
});
