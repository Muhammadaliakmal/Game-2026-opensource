import test from "node:test";
import assert from "node:assert/strict";
import { recordRun, rolled, type ArcadeSave } from "./persistence";

const base: ArcadeSave = {
  v: 1,
  best: {},
  totalRuns: {},
  coinsEarnedToday: 0,
  lastPlayDate: "2026-09-08",
};

test("the daily counter rolls over, and only the counter does", () => {
  const yesterday = { ...base, coinsEarnedToday: 480, best: { "chunk-runner": 900 } };
  const next = rolled(yesterday, "2026-09-09");
  assert.equal(next.coinsEarnedToday, 0);
  // Records are not a daily thing. Wiping them with the cap would be the
  // worst possible reading of "resets".
  assert.deepEqual(next.best, { "chunk-runner": 900 });
  assert.equal(next.lastPlayDate, "2026-09-09");
});

test("the same day is left exactly alone", () => {
  const same = { ...base, coinsEarnedToday: 120 };
  assert.equal(rolled(same, "2026-09-08"), same);
});

test("a best score only ever rises", () => {
  let s = recordRun(base, "chunk-runner", 900, 100, "2026-09-08");
  s = recordRun(s, "chunk-runner", 400, 40, "2026-09-08");
  assert.equal(s.best["chunk-runner"], 900, "a worse run took the record");
  assert.equal(s.totalRuns["chunk-runner"], 2, "both runs counted");
  assert.equal(s.coinsEarnedToday, 140, "both payouts counted");
});

test("a run on a new day rolls the cap before adding to it", () => {
  const late = { ...base, coinsEarnedToday: 490 };
  const s = recordRun(late, "tower-stack", 30, 60, "2026-09-09");
  assert.equal(s.coinsEarnedToday, 60, "yesterday's total leaked into today");
});

test("games keep their own records", () => {
  let s = recordRun(base, "chunk-runner", 900, 0, "2026-09-08");
  s = recordRun(s, "tower-stack", 12, 0, "2026-09-08");
  assert.equal(s.best["chunk-runner"], 900);
  assert.equal(s.best["tower-stack"], 12);
});
