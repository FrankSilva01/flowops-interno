import assert from "node:assert/strict";
import test from "node:test";
import { paginate, responsivePageSize } from "../../js/core/pagination.js";

test("pagina uma colecao e informa o intervalo visivel", () => {
  const result = paginate(Array.from({ length: 23 }, (_, index) => index + 1), 2, 10);
  assert.deepEqual(result.items, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual({ page: result.page, pageCount: result.pageCount, total: result.total, start: result.start, end: result.end }, {
    page: 2, pageCount: 3, total: 23, start: 11, end: 20,
  });
});

test("limita a pagina solicitada e trata colecao vazia", () => {
  assert.equal(paginate([1, 2, 3], 99, 2).page, 2);
  assert.deepEqual(paginate([], 4, 10), {
    items: [], page: 1, pageSize: 10, pageCount: 1, total: 0, start: 0, end: 0,
  });
});

test("usa cinco itens em viewport de pouca altura", () => {
  assert.equal(responsivePageSize(819), 5);
  assert.equal(responsivePageSize(820), 10);
  assert.equal(responsivePageSize(undefined), 10);
});
