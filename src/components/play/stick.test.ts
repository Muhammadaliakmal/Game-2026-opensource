import { test } from "node:test";
import assert from "node:assert/strict";
import { STICK, createStickState, shapeStick, worldHeading } from "./stick";

/**
 * The stick shaping is angle arithmetic that fails invisibly: a sign error
 * makes the character run at ninety degrees to the thumb, and losing the
 * frame hold brings back the spiral that the whole module exists to remove.
 */

const DT = 1 / 60;

function near(a: number, b: number, eps = 1e-6) {
  const TAU = Math.PI * 2;
  const d = ((((a - b + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return Math.abs(d) < eps;
}

/** Hold the same raw vector for `frames` frames at a fixed yaw. */
function hold(s: ReturnType<typeof createStickState>, raw: { x: number; y: number }, yaw: number, frames: number, manual = false) {
  let out = { x: 0, y: 0 };
  for (let i = 0; i < frames; i++) out = shapeStick(raw, yaw, manual, DT, s);
  return out;
}

test("inside the dead zone the stick is neutral", () => {
  const s = createStickState();
  const out = shapeStick({ x: STICK.deadzone * 0.6, y: 0 }, 0, false, DT, s);
  assert.deepEqual(out, { x: 0, y: 0 });
  assert.equal(s.held, false);
});

test("a push at the edge of the zone starts from zero, not from the zone", () => {
  const s = createStickState();
  const out = shapeStick({ x: 0, y: STICK.deadzone + 0.01 }, 0, false, DT, s);
  assert.ok(Math.hypot(out.x, out.y) < 0.05, "should be barely off neutral");
  const full = shapeStick({ x: 0, y: 1 }, 0, false, DT, s);
  assert.ok(Math.abs(Math.hypot(full.x, full.y) - 1) < 1e-9);
});

test("a fresh push means what the player sees", () => {
  const s = createStickState();
  const yaw = 0.7;
  const out = shapeStick({ x: 1, y: 0 }, yaw, false, DT, s);
  // Straight through on the first frame: same camera-relative vector out.
  assert.ok(near(Math.atan2(out.x, out.y), Math.PI / 2));
  assert.ok(near(worldHeading(out, yaw), Math.PI / 2 - yaw));
});

test("the camera following the character does not turn the thumb", () => {
  const s = createStickState();
  const raw = { x: 1, y: 0 }; // right
  const first = shapeStick(raw, 0, false, DT, s);
  const heading = worldHeading(first, 0);

  // The auto-follow swings the camera round behind the runner over a few
  // frames. The thumb has not moved, so the world heading must not either —
  // this is the spiral, and it must not come back.
  let out = first;
  for (let i = 1; i <= 30; i++) {
    const yaw = (i / 30) * (Math.PI / 2);
    out = shapeStick(raw, yaw, false, DT, s);
    assert.ok(near(worldHeading(out, yaw), heading, 1e-6), `frame ${i} drifted`);
  }
  // And the camera-relative vector it hands over has rotated to compensate.
  assert.ok(!near(Math.atan2(out.x, out.y), Math.atan2(first.x, first.y)));
});

test("a deliberate look turns the thumb with it", () => {
  const s = createStickState();
  const raw = { x: 0, y: 1 }; // forward
  shapeStick(raw, 0, false, DT, s);
  // Player drags the view a quarter turn while running forward.
  const yaw = Math.PI / 2;
  const out = hold(s, raw, yaw, 60, true);
  // "Forward" now means the new forward, so the output is still straight up.
  assert.ok(near(Math.atan2(out.x, out.y), 0, 1e-3));
});

test("a small change of thumb turns smoothly and settles", () => {
  const s = createStickState();
  hold(s, { x: 0, y: 1 }, 0, 5);
  const target = { x: Math.sin(0.5), y: Math.cos(0.5) };
  const afterOne = shapeStick(target, 0, false, DT, s);
  const turnedByOne = Math.atan2(afterOne.x, afterOne.y);
  assert.ok(turnedByOne > 0.05 && turnedByOne < 0.45, `one frame turned ${turnedByOne}`);

  const settled = hold(s, target, 0, 30);
  assert.ok(near(Math.atan2(settled.x, settled.y), 0.5, 1e-3));
});

test("a reversal snaps rather than swinging through sideways", () => {
  const s = createStickState();
  hold(s, { x: 0, y: 1 }, 0, 5);
  const out = shapeStick({ x: 0, y: -1 }, 0, false, DT, s);
  assert.ok(near(Math.atan2(out.x, out.y), Math.PI, 1e-9));
});

test("lifting the thumb releases the frame", () => {
  const s = createStickState();
  hold(s, { x: 1, y: 0 }, 0, 5);
  shapeStick({ x: 0, y: 0 }, 1.0, false, DT, s);
  assert.equal(s.held, false);
  // The next push is read against the new yaw.
  const out = shapeStick({ x: 0, y: 1 }, 1.0, false, DT, s);
  assert.ok(near(Math.atan2(out.x, out.y), 0));
  assert.ok(near(s.refYaw, 1.0));
});
