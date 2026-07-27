import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearOfflineData,
  enqueueWrite,
  processOfflineEntries,
  readDeadLetters,
  readQueue,
  replaceDeadLetters,
  replaceQueue,
} from "../../js/core/offline-queue.js";

const remoteSource = readFileSync(new URL("../../js/data/remote.js", import.meta.url), "utf8");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("nao informa enfileiramento quando o storage rejeita a escrita", () => {
  global.localStorage = memoryStorage();
  localStorage.setItem = () => { throw new Error("quota"); };
  const result = enqueueWrite("org-1", { op: "persist", kind: "orders", itemId: "1", item: { id: "1" } });
  assert.equal(result.stored, false);
  assert.match(result.error.message, /quota/);
});

test("persistencia propaga falha quando nao consegue guardar a fila", () => {
  assert.match(remoteSource, /if \(!queueResult\.stored\) throw queueResult\.error/);
});

test("falha permanente nao bloqueia a proxima escrita", async () => {
  const entries = [{ itemId: "bad" }, { itemId: "good" }];
  const applied = [];
  const result = await processOfflineEntries(entries, async (entry) => {
    if (entry.itemId === "bad") throw Object.assign(new Error("invalid"), { status: 400 });
    applied.push(entry.itemId);
  });
  assert.deepEqual(applied, ["good"]);
  assert.equal(result.flushed, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.pending.length, 0);
});

test("falha transitoria continua pendente para nova tentativa", async () => {
  const entry = { itemId: "network" };
  const result = await processOfflineEntries([entry], async () => {
    throw Object.assign(new Error("unavailable"), { status: 503 });
  });
  assert.equal(result.flushed, 0);
  assert.deepEqual(result.pending, [entry]);
  assert.equal(result.failed.length, 0);
});

test("logout pode limpar fila e itens com falha da organizacao", () => {
  global.localStorage = memoryStorage();
  assert.equal(replaceQueue("org-1", [{ itemId: "1", ts: Date.now() }]).stored, true);
  assert.equal(replaceDeadLetters("org-1", [{ itemId: "2", ts: Date.now() }]).stored, true);
  clearOfflineData("org-1");
  assert.deepEqual(readQueue("org-1"), []);
  assert.deepEqual(readDeadLetters("org-1"), []);
});
