import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_SENSITIVITY, applyLook, approachYaw, look, yawTowards } from "./camera-rig";
import { usePlayerSettings } from "@/lib/player-settings";

/**
 * The touch camera steers itself toward the direction of travel, which is two
 * pieces of angle arithmetic that are wrong in ways nobody can see in a
 * screenshot: a sign error points the camera at the back of the character's
 * head, and a naive lerp spins it most of a turn whenever the player crosses
 * due north.
 */

/** Where the eye ends up looking, given a yaw, per the rig's own convention. */
function viewDirection(yaw: number) {
  // The rig places the eye at +offset and looks back down it, so the view
  // direction is the negation of the offset.
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

test("yawTowards produces a camera that looks along the given direction", () => {
  const directions: [number, number][] = [
    [0, -1], // north
    [1, 0], // east
    [0, 1], // south
    [-1, 0], // west
    [0.6, -0.8], // something off-axis
  ];

  for (const [dx, dz] of directions) {
    const v = viewDirection(yawTowards(dx, dz));
    assert.ok(
      Math.hypot(v.x - dx, v.z - dz) < 1e-9,
      `looking (${dx}, ${dz}) gave (${v.x.toFixed(3)}, ${v.z.toFixed(3)})`
    );
  }
});

test("approachYaw takes the short way round the wrap", () => {
  // The case that matters: just under +pi to just over -pi is a hair's
  // breadth apart, but a plain lerp travels almost a full turn between them.
  const from = Math.PI - 0.05;
  const to = -Math.PI + 0.05;

  const stepped = approachYaw(from, to, 0.5);
  // The short way across is 0.1 rad, so half of it from (pi - 0.05) lands
  // exactly on pi — the wrap point itself.
  assert.ok(
    Math.abs(stepped - Math.PI) < 1e-9,
    `expected to step to pi, got ${stepped}`
  );

  // And the naive version really would have gone the other way, which is the
  // whole reason this function exists.
  const naive = from + (to - from) * 0.5;
  assert.ok(Math.abs(naive - from) > 3, "naive lerp should swing wildly");
});

test("approachYaw converges without overshooting", () => {
  let yaw = -2.6;
  const target = 2.9; // across the wrap, the short way is ~0.78 rad
  for (let i = 0; i < 400; i++) yaw = approachYaw(yaw, target, 0.1);

  // Compare as a direction rather than a number: converging to the target
  // plus a full turn is the same camera.
  const a = viewDirection(yaw);
  const b = viewDirection(target);
  assert.ok(
    Math.hypot(a.x - b.x, a.z - b.z) < 1e-6,
    `did not converge: ${yaw} vs ${target}`
  );
});

test("approachYaw with t=0 holds still and t=1 arrives", () => {
  assert.equal(approachYaw(1.2, -0.4, 0), 1.2);
  assert.ok(Math.abs(approachYaw(1.2, -0.4, 1) - -0.4) < 1e-9);
});

test("applyLook turns further at a higher sensitivity, per source", () => {
  const settings = usePlayerSettings.getState();
  settings.setMouseLook(1);
  settings.setTouchLook(1);

  look.yaw = 0;
  applyLook(100, 0, "mouse");
  const atOne = -look.yaw;
  assert.ok(Math.abs(atOne - 100 * BASE_SENSITIVITY) < 1e-9, "1× is the base rate");

  settings.setMouseLook(2);
  look.yaw = 0;
  applyLook(100, 0, "mouse");
  assert.ok(Math.abs(-look.yaw - atOne * 2) < 1e-9, "2× turns twice as far");

  // The touch multiplier is a different number and does not leak across.
  look.yaw = 0;
  applyLook(100, 0, "touch");
  assert.ok(Math.abs(-look.yaw - atOne) < 1e-9, "touch stays at its own 1×");

  settings.setMouseLook(1);
  look.yaw = Math.PI / 4;
});
