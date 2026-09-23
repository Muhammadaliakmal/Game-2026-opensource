import test from "node:test";
import assert from "node:assert/strict";
import * as T from "./tuning";
import { closest, damageFor } from "./combat";

/**
 * The damage rule, which is what a player learns and what the guide page
 * states. If any of these changes, `content/cabinet-notes.ts` is wrong.
 */

const [ROD, MAUL] = T.WEAPONS;

test("under the graze threshold, contact does nothing", () => {
  assert.equal(damageFor(0, ROD, "head"), 0);
  assert.equal(damageFor(T.MIN_HIT_SPEED, ROD, "head"), 0);
  assert.equal(damageFor(NaN, ROD, "torso"), 0);
  assert.ok(damageFor(T.MIN_HIT_SPEED + 100, ROD, "torso") > 0);
});

test("faster is harder, head beats chest beats limb", () => {
  const v = T.MIN_HIT_SPEED + 600;
  assert.ok(damageFor(v + 200, ROD, "torso") > damageFor(v, ROD, "torso"));
  const head = damageFor(v, ROD, "head");
  const torso = damageFor(v, ROD, "torso");
  const limb = damageFor(v, ROD, "limb");
  assert.ok(head > torso && torso > limb);
  // The guide says one and a half times, and about half.
  assert.ok(Math.abs(head / torso - 1.5) < 1e-9);
  assert.ok(Math.abs(limb / torso - 0.55) < 1e-9);
});

test("the maul hits harder at the same speed; it is slower to get there", () => {
  const v = T.MIN_HIT_SPEED + 500;
  assert.ok(damageFor(v, MAUL, "torso") > damageFor(v, ROD, "torso"));
  assert.ok(MAUL.grip < ROD.grip, "the only thing that makes it slow");
});

test("a charged heavy multiplies the hit, and nothing passes the ceiling", () => {
  const v = T.MIN_HIT_SPEED + 400;
  const plain = damageFor(v, ROD, "torso");
  const full = damageFor(v, ROD, "torso", 1);
  assert.ok(Math.abs(full / plain - (1 + T.HEAVY_DAMAGE)) < 1e-9);
  assert.equal(damageFor(1e6, MAUL, "head", 1), T.MAX_HIT);
});

test("a normal hit takes several to finish somebody", () => {
  // A good quick swing lands at around 1,200 px/s at this scale. It must
  // not be a one-shot, or the round is decided by who swings first.
  const good = damageFor(1200 * T.S, ROD, "torso");
  assert.ok(good > 6 && good < T.HP / 4, `a good hit does ${good.toFixed(1)}`);
});

test("closest points between segments", () => {
  const c = { d: 0, s: 0, t: 0, x1: 0, y1: 0, x2: 0, y2: 0 };
  // Crossing: distance zero at the middle of both.
  closest(0, 0, 10, 10, 0, 10, 10, 0, c);
  assert.ok(c.d < 1e-9 && Math.abs(c.s - 0.5) < 1e-9 && Math.abs(c.t - 0.5) < 1e-9);
  // Parallel, three apart.
  closest(0, 0, 10, 0, 0, 3, 10, 3, c);
  assert.ok(Math.abs(c.d - 3) < 1e-9);
  // A point against a segment: the head is a zero-length segment.
  closest(5, -4, 5, -4, 0, 0, 10, 0, c);
  assert.ok(Math.abs(c.d - 4) < 1e-9 && Math.abs(c.t - 0.5) < 1e-9);
  // Past the end: clamped to the endpoint.
  closest(20, 0, 30, 0, 0, 0, 10, 0, c);
  assert.ok(Math.abs(c.d - 10) < 1e-9);
});
