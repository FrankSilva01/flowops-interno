import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildQualityPresentation } from "../../js/features/quality-presentation.js";

test("quality presentation derives inspection queue from persisted orders", () => {
  const model = buildQualityPresentation([
    { id: "PED-1", orderCode: "PED-0001", description: "Troféus", productionStage: "Qualidade", quantity: 30, material: "Resina" },
    { id: "PED-2", orderCode: "PED-0002", description: "Entregue", productionStage: "Entregue" },
  ]);

  assert.equal(model.summary.waiting, 1);
  assert.equal(model.queue[0].orderCode, "PED-0001");
  assert.equal(model.queue[0].quantityLabel, "30 unidades");
  assert.equal(model.queue.some((item) => item.id === "PED-2"), false);
});

test("quality route is present in navigation, markup and router", async () => {
  const [markup, router, state] = await Promise.all([
    readFile(new URL("../../index.html", import.meta.url), "utf8"),
    readFile(new URL("../../js/core/router.js", import.meta.url), "utf8"),
    readFile(new URL("../../js/core/state.js", import.meta.url), "utf8"),
  ]);

  assert.match(markup, /data-view=["']quality["']/);
  assert.match(markup, /id=["']qualityView["']/);
  assert.match(router, /case ["']quality["']/);
  assert.match(state, /"Qualidade"/);
});
