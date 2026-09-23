import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ZOOM, follow, frameFight } from "./camera";
import { VIEW_H, VIEW_W } from "./tuning";

const inFrame = (c: { x: number; y: number; z: number }, x: number, y: number) =>
  Math.abs(x - c.x) <= VIEW_W / (2 * c.z) && Math.abs(y - c.y) <= VIEW_H / (2 * c.z);

test("two fighters close together are framed close", () => {
  const c = frameFight(440, 380, 520, 380, true, VIEW_W, VIEW_H);
  assert.ok(c.z > 1.4, `zoom ${c.z}`);
  assert.ok(c.z <= MAX_ZOOM);
});

test("both fighters stay in frame wherever they stand, solo and versus", () => {
  const xs = [60, 200, 480, 760, 900];
  const ys = [150, 300, 420];
  for (const solo of [true, false])
    for (const px of xs) for (const py of ys) for (const ox of xs) for (const oy of ys) {
      const c = frameFight(px, py, ox, oy, solo, VIEW_W, VIEW_H);
      assert.ok(inFrame(c, px, py), `player out at ${[px, py, ox, oy, solo]}`);
      assert.ok(inFrame(c, ox, oy), `opponent out at ${[px, py, ox, oy, solo]}`);
    }
});

test("the view never shows past the arena's edge, and never zooms out past it", () => {
  for (const px of [0, 30, 930, 960]) {
    const c = frameFight(px, 400, px, 400, true, VIEW_W, VIEW_H);
    const halfW = VIEW_W / (2 * c.z);
    const halfH = VIEW_H / (2 * c.z);
    assert.ok(c.z >= 1);
    assert.ok(c.x - halfW >= -1e-9 && c.x + halfW <= VIEW_W + 1e-9);
    assert.ok(c.y - halfH >= -1e-9 && c.y + halfH <= VIEW_H + 1e-9);
  }
});

test("against the CPU the frame leans toward the player", () => {
  const solo = frameFight(300, 400, 560, 400, true, VIEW_W, VIEW_H);
  const versus = frameFight(300, 400, 560, 400, false, VIEW_W, VIEW_H);
  assert.ok(solo.x < versus.x);
});

test("follow converges and does not overshoot", () => {
  const cam = { x: 480, y: 270, z: 1 };
  const target = { x: 300, y: 250, z: 1.5 };
  for (let i = 0; i < 240; i++) {
    follow(cam, target, 1 / 60);
    assert.ok(cam.z <= 1.5 + 1e-9);
  }
  assert.ok(Math.abs(cam.x - 300) < 0.1 && Math.abs(cam.z - 1.5) < 0.01);
});
