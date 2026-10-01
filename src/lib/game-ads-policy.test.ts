import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_RUNS,
  MAX_BONUS,
  MIN_GAP_MS,
  bonusFor,
  interstitialAllowed,
} from "./game-ads-policy";

test("no interstitial in a player's first runs", () => {
  for (let runs = 0; runs < FREE_RUNS; runs++) {
    assert.equal(interstitialAllowed({ runs, lastAdAt: null }, 1e12), false);
  }
  assert.equal(interstitialAllowed({ runs: FREE_RUNS, lastAdAt: null }, 1e12), true);
});

test("no interstitial within the gap of the last ad, of either kind", () => {
  const now = 1e12;
  assert.equal(interstitialAllowed({ runs: 10, lastAdAt: now - MIN_GAP_MS + 1 }, now), false);
  assert.equal(interstitialAllowed({ runs: 10, lastAdAt: now - MIN_GAP_MS }, now), true);
});

test("the bonus is the run's payout again, capped, and nothing for nothing", () => {
  assert.equal(bonusFor(null), 0);
  assert.equal(bonusFor(0), 0);
  assert.equal(bonusFor(-5), 0);
  assert.equal(bonusFor(Number.NaN), 0);
  assert.equal(bonusFor(37.9), 37);
  assert.equal(bonusFor(MAX_BONUS * 3), MAX_BONUS);
});
