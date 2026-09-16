import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOK_MAX, LOOK_MIN, clampLook, lookSensitivity, usePlayerSettings } from "./player-settings";

/**
 * The look multipliers come off disk, and a stored file is the one place a
 * value is allowed to be wrong. Everything below is what the camera would do
 * with a bad one: nothing, because it never sees it.
 */

test("clampLook keeps a sane value and snaps it to the step", () => {
  assert.equal(clampLook(1), 1);
  assert.equal(clampLook(1.5), 1.5);
  assert.equal(clampLook(1.52), 1.5);
  assert.equal(clampLook(0.98), 1);
});

test("clampLook refuses nonsense and clamps the ends", () => {
  assert.equal(clampLook(undefined), 1);
  assert.equal(clampLook("fast"), 1);
  assert.equal(clampLook(NaN), 1);
  assert.equal(clampLook(Infinity), 1);
  assert.equal(clampLook(0), LOOK_MIN);
  assert.equal(clampLook(-3), LOOK_MIN);
  assert.equal(clampLook(99), LOOK_MAX);
});

test("the two sensitivities are separate and read by source", () => {
  const s = usePlayerSettings.getState();
  s.setMouseLook(2);
  s.setTouchLook(0.5);
  assert.equal(lookSensitivity("mouse"), 2);
  assert.equal(lookSensitivity("touch"), 0.5);
  s.setMouseLook(1);
  s.setTouchLook(1);
});
