import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_HARD_CAP,
  DAILY_SOFT_CAP,
  OVER_CAP_RATE,
  payout,
} from "./arcade-payout";

test("an ordinary run pays its score times its rate", () => {
  assert.equal(payout(300, 0.5, 0), 150);
  assert.equal(payout(40, 2, 0), 80);
});

test("a run that crosses the soft cap is paid in two parts, not switched", () => {
  // The cliff this avoids: if crossing flipped the whole run to the low rate,
  // a slightly better run could pay less than a worse one.
  const earned = DAILY_SOFT_CAP - 20;
  assert.equal(payout(40, 1, earned), 20 + Math.floor(20 * OVER_CAP_RATE));
});

test("more score never pays less, anywhere on the curve", () => {
  for (const earned of [0, DAILY_SOFT_CAP - 10, DAILY_SOFT_CAP, DAILY_HARD_CAP - 5]) {
    for (let s = 1; s < 400; s++) {
      assert.ok(
        payout(s + 1, 1, earned) >= payout(s, 1, earned),
        `not monotonic at score ${s}, earned ${earned}`
      );
    }
  }
});

test("past the soft cap a run still pays something", () => {
  // A game that pays zero is a game you stop playing at the moment you were
  // enjoying it, which is the whole reason that cap is soft.
  assert.equal(payout(100, 1, DAILY_SOFT_CAP), Math.floor(100 * OVER_CAP_RATE));
});

test("the day is bounded however big the score claims to be", () => {
  // The actual security property, and the reason the soft cap alone is not
  // one: a fifth of an arbitrarily large number is still arbitrarily large.
  assert.equal(payout(1e9, 1, 0), DAILY_HARD_CAP);
  assert.equal(payout(Number.MAX_SAFE_INTEGER, 100, 0), DAILY_HARD_CAP);
  // And a player already at the ceiling earns nothing more today, at any score.
  assert.equal(payout(1e9, 1, DAILY_HARD_CAP), 0);
});

test("no sequence of runs can take more than a day's ceiling", () => {
  // Stated over runs rather than over one run, because that is the claim the
  // doc comment makes and a per-run bound would not establish it.
  let earned = 0;
  for (let i = 0; i < 200; i++) earned += payout(5000, 1, earned);
  assert.equal(earned, DAILY_HARD_CAP);
});

test("nonsense pays nothing rather than throwing", () => {
  for (const s of [0, -5, NaN, Infinity]) assert.equal(payout(s, 1, 0), 0);
  for (const r of [0, -1, NaN]) assert.equal(payout(100, r, 0), 0);
  // A corrupted "earned today" must not become a bonus.
  assert.equal(payout(100, 1, -1e9), 100);
  assert.equal(payout(100, 1, NaN), 100);
});
