import { test } from "node:test";
import assert from "node:assert/strict";
import { LUCKY_MULTIPLIER, LUCKY_ODDS, luckyRoll } from "./lucky";

test("a lucky roll doubles the payout and says so", () => {
  assert.deepEqual(luckyRoll(60, () => 0), { earned: 60 * LUCKY_MULTIPLIER, lucky: true });
});

test("an unlucky roll pays exactly what was earned", () => {
  assert.deepEqual(luckyRoll(60, () => 0.99), { earned: 60, lucky: false });
});

test("nothing is never lucky", () => {
  // A doubled zero announced as luck is the game shouting at a player who
  // got nothing. The roll is skipped, not merely multiplied.
  assert.deepEqual(luckyRoll(0, () => 0), { earned: 0, lucky: false });
  assert.deepEqual(luckyRoll(-5, () => 0), { earned: 0, lucky: false });
});

test("it is rare", () => {
  // The spec's condition. If somebody tunes this up to a coin flip, the
  // surprise is gone and the test says so.
  assert.ok(LUCKY_ODDS <= 0.1, `1 in ${Math.round(1 / LUCKY_ODDS)} is not rare`);
});
