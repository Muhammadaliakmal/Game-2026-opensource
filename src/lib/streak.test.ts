import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, current, dayBefore, doneToday } from "./streak";

test("the day before crosses months and years", () => {
  assert.equal(dayBefore("2026-03-01"), "2026-02-28");
  assert.equal(dayBefore("2026-01-01"), "2025-12-31");
  assert.equal(dayBefore("2024-03-01"), "2024-02-29");
});

test("a streak grows on consecutive days and restarts after a gap", () => {
  let s = advance(null, "2026-09-14");
  assert.deepEqual(s, { last: "2026-09-14", count: 1 });
  s = advance(s, "2026-09-15");
  assert.equal(s.count, 2);
  // Finishing twice in a day is one day.
  assert.equal(advance(s, "2026-09-15").count, 2);
  // A missed day starts over.
  assert.deepEqual(advance(s, "2026-09-17"), { last: "2026-09-17", count: 1 });
});

test("yesterday's streak is still alive today, and dead the day after", () => {
  const s = { last: "2026-09-14", count: 5 };
  assert.equal(current(s, "2026-09-14"), 5);
  assert.equal(current(s, "2026-09-15"), 5, "today is the day to keep it");
  assert.equal(current(s, "2026-09-16"), 0);
  assert.equal(current(null, "2026-09-16"), 0);
  assert.equal(doneToday(s, "2026-09-14"), true);
  assert.equal(doneToday(s, "2026-09-15"), false);
});
