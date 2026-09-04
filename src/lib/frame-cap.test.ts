import test from "node:test";
import assert from "node:assert/strict";
import { createFrameGate } from "./frame-cap";

/**
 * Simulates a display of a given refresh rate for a number of seconds and
 * reports what the gate let through.
 *
 * `jitterMs` matters: a real rAF does not land on exact boundaries, and the
 * whole reason the gate has a tolerance window is that naive threshold logic
 * halves the frame rate on a 60Hz panel the moment ticks arrive a hair early.
 */
function simulate(fps: number, refreshHz: number, seconds: number, jitterMs = 0) {
  const gate = createFrameGate(fps);
  const period = 1000 / refreshHz;
  const ticks = Math.round(refreshHz * seconds);
  // Page has been open a while — the gate must not assume time starts at zero.
  const start = 4321.5;

  const accepted: number[] = [];
  let lastElapsed = 0;

  for (let i = 0; i < ticks; i++) {
    // A deterministic wobble rather than Math.random, so a failure reproduces.
    const wobble = jitterMs === 0 ? 0 : Math.sin(i * 1.7) * jitterMs;
    const now = start + i * period + wobble;
    const elapsed = gate.tick(now);
    if (elapsed !== null) {
      accepted.push(now);
      assert.ok(elapsed > lastElapsed, "elapsed must increase on every frame");
      lastElapsed = elapsed;
    }
  }

  return { count: accepted.length, accepted, elapsed: lastElapsed };
}

test("a 60Hz display renders every frame, not every other one", () => {
  const { count } = simulate(60, 60, 1);
  // 60 ticks offered; the first is consumed starting the schedule, so 59-60.
  assert.ok(count >= 59, `expected ~60 frames on a 60Hz panel, got ${count}`);
  assert.ok(count <= 60, `must not exceed 60, got ${count}`);
});

test("a 60Hz display with jitter still does not halve", () => {
  // The regression this guards: without the tolerance window, ticks arriving
  // ~1ms early read as "not due yet" and the panel renders at 30.
  const { count } = simulate(60, 60, 1, 0.9);
  assert.ok(count >= 55, `jitter must not halve the rate, got ${count}`);
});

test("a 120Hz display is capped at 60", () => {
  const { count } = simulate(60, 120, 1);
  assert.ok(count <= 60, `must not exceed 60, got ${count}`);
  assert.ok(count >= 59, `expected ~60, got ${count}`);
});

test("a 144Hz display is capped at 60, not 72", () => {
  // The case that motivates `due += interval` over `due = now`. Resetting the
  // target to the accepted timestamp settles at 72fps here — over the cap.
  const { count } = simulate(60, 144, 1);
  assert.ok(count <= 60, `must not exceed 60, got ${count}`);
  assert.ok(count >= 58, `expected ~60, got ${count}`);
});

test("a 240Hz display is capped at 60", () => {
  const { count } = simulate(60, 240, 1);
  assert.ok(count <= 60, `must not exceed 60, got ${count}`);
  assert.ok(count >= 59, `expected ~60, got ${count}`);
});

test("no display rate is allowed to exceed the cap over several seconds", () => {
  // Drift is cumulative, so a rate that looks correct over one second can be
  // over the cap over ten.
  for (const hz of [60, 75, 90, 120, 144, 165, 240]) {
    const { count } = simulate(60, hz, 5);
    assert.ok(count <= 5 * 60, `${hz}Hz produced ${count} frames in 5s, over the 300 cap`);
  }
});

test("the elapsed clock advances in seconds, roughly in real time", () => {
  const { elapsed } = simulate(60, 144, 2);
  assert.ok(
    Math.abs(elapsed - 2) < 0.1,
    `two simulated seconds should elapse ~2s, got ${elapsed}`
  );
});

test("a long stall is clamped rather than integrated whole", () => {
  const gate = createFrameGate(60);
  assert.equal(gate.tick(1000), 1 / 60);
  // Tab backgrounded for thirty seconds. The scene must not be handed a 30s
  // step — that is what flings a bike across the map on resume.
  const after = gate.tick(31000)!;
  assert.ok(after !== null);
  const step = after - 1 / 60;
  assert.ok(step <= 0.1 + 1e-9, `step should be clamped to 100ms, got ${step}s`);
});

test("a stall resyncs instead of paying back owed frames", () => {
  const gate = createFrameGate(60);
  gate.tick(1000);
  gate.tick(31000);
  // Immediately after a resync the next tick is not due yet, so the gate must
  // skip it rather than firing a burst to catch up.
  assert.equal(gate.tick(31001), null);
});

/**
 * Hit-stop: the frame is still drawn, the simulation does not move.
 *
 * The property that matters is the delta the scene sees, and the scene sees
 * differences between consecutive returned values — so "frozen" means the same
 * number twice, not a skipped tick. A skipped tick would stop drawing, which
 * would look like the game hanging rather than like an impact.
 */
test("a hold freezes elapsed time without skipping frames", () => {
  const gate = createFrameGate(60);
  const step = 1000 / 60;

  let t = 1000;
  const first = gate.tick(t)!;
  t += step;
  const second = gate.tick(t)!;
  assert.ok(second > first, "time runs normally before the hold");

  // Freeze for a shade over three frames' worth. Deliberately not exactly
  // three: rAF timestamps accumulate float error, and a boundary this test
  // sits exactly on is a flake rather than a finding.
  gate.hold(0.06);

  const frozen: number[] = [];
  for (let i = 0; i < 3; i++) {
    t += step;
    const v = gate.tick(t);
    assert.notEqual(v, null, "frames keep being drawn while frozen");
    frozen.push(v!);
  }
  for (const v of frozen) assert.equal(v, second, "no simulation time passed");

  t += step;
  const after = gate.tick(t)!;
  assert.ok(after > second, "time resumes once the hold expires");
  // And it resumes at one frame, not with the whole freeze paid back at once,
  // which would fling everything the freeze was meant to punctuate.
  assert.ok(after - second < (step * 2) / 1000, `caught up by ${after - second}s`);
});

test("a hold is clamped, so a bad caller cannot stop the game", () => {
  const gate = createFrameGate(60);
  const step = 1000 / 60;
  let t = 1000;
  gate.tick(t);
  t += step;
  const before = gate.tick(t)!;

  gate.hold(60);
  // Well past the 200ms ceiling.
  t += 400;
  const after = gate.tick(t)!;
  assert.ok(after > before, "the freeze ended on its own");
});

test("overlapping holds do not add up", () => {
  const gate = createFrameGate(60);
  const step = 1000 / 60;
  let t = 1000;
  gate.tick(t);
  t += step;
  const before = gate.tick(t)!;

  gate.hold(0.05);
  gate.hold(0.05);
  t += 60; // past 50ms
  assert.ok(gate.tick(t)! > before, "two 50ms holds are still one 50ms hold");
});
