import test from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_HOLIDAYS } from "../../js/features/calendar-holidays.js";

test("calendar uses the correct movable dates from 2025 through 2030", () => {
  assert.match(CALENDAR_HOLIDAYS["2025-03-04"], /Carnaval/);
  assert.match(CALENDAR_HOLIDAYS["2026-04-03"], /Sexta-feira Santa/);
  assert.match(CALENDAR_HOLIDAYS["2027-02-09"], /Carnaval/);
  assert.match(CALENDAR_HOLIDAYS["2028-04-14"], /Sexta-feira Santa/);
  assert.match(CALENDAR_HOLIDAYS["2029-02-13"], /Carnaval/);
  assert.match(CALENDAR_HOLIDAYS["2030-04-19"], /Sexta-feira Santa/);
});

test("October 12 preserves both relevant labels", () => {
  for (let year = 2025; year <= 2030; year += 1) {
    assert.match(CALENDAR_HOLIDAYS[`${year}-10-12`], /Aparecida/);
    assert.match(CALENDAR_HOLIDAYS[`${year}-10-12`], /Crianças/);
  }
});
