import test from "node:test";
import assert from "node:assert/strict";
import { creditCoins, recordRun, rolled, type ArcadeSave } from "./persistence";

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
  let s = recordRun(base, "chunk-runner", 900, "2026-09-08");
  s = recordRun(s, "chunk-runner", 400, "2026-09-08");
  assert.equal(s.best["chunk-runner"], 900, "a worse run took the record");
  assert.equal(s.totalRuns["chunk-runner"], 2, "both runs counted");
});

test("recording a run does not credit coins", () => {
  // A score is known when the run ends; a payout is a round trip that may say
  // a different number or never answer. Keeping them apart is what lets the
  // death screen show a new best without waiting for the network.
  const s = recordRun(base, "chunk-runner", 900, "2026-09-08");
  assert.equal(s.coinsEarnedToday, 0);
});

test("credited coins accumulate across a day", () => {
  let s = creditCoins(base, 100, "2026-09-08");
  s = creditCoins(s, 40, "2026-09-08");
  assert.equal(s.coinsEarnedToday, 140);
});

test("a credit on a new day rolls the cap before adding to it", () => {
  const late = { ...base, coinsEarnedToday: 490 };
  const s = creditCoins(late, 60, "2026-09-09");
  assert.equal(s.coinsEarnedToday, 60, "yesterday's total leaked into today");
});

test("games keep their own records", () => {
  let s = recordRun(base, "chunk-runner", 900, "2026-09-08");
  s = recordRun(s, "tower-stack", 12, "2026-09-08");
  assert.equal(s.best["chunk-runner"], 900);
  assert.equal(s.best["tower-stack"], 12);
});
