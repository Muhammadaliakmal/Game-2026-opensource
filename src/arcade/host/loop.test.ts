import test from "node:test";
import assert from "node:assert/strict";
import { FIXED_DT, MAX_FRAME, MAX_STEPS, createLoop } from "./loop";

/**
 * A driver that plays back frames at a fixed refresh rate, synchronously.
 *
 * The loop takes its rAF through a parameter for exactly this: the property
 * worth asserting is about timestamps, and a test that needed a real browser
 * to check it would never run.
 */
function driver(hz: number, frames: number) {
  let steps = 0;
  let renders = 0;
  const alphas: number[] = [];
  const h: { cb: ((t: number) => void) | null } = { cb: null };
  let t = 0;

  const loop = createLoop(
    () => steps++,
    (a) => {
      renders++;
      alphas.push(a);
    },
    {
      request: (fn) => {
        h.cb = fn;
        return 1;
      },
      cancel: () => {
        h.cb = null;
      },
      now: () => t,
    }
  );

  loop.start();
  for (let i = 0; i < frames; i++) {
    t += 1000 / hz;
    const fn = h.cb;
    if (!fn) break;
    fn(t);
  }
  return { steps, renders, alphas, seconds: frames / hz, loop };
}

test("the simulation runs at 60 steps a second whatever the panel does", () => {
  // The whole reason for a fixed timestep. If this drifts, a 144Hz monitor is
  // playing a different game from a 60Hz one.
  for (const hz of [60, 75, 90, 120, 144, 240]) {
    const r = driver(hz, hz * 2); // two seconds of frames
    const expected = r.seconds / FIXED_DT;
    assert.ok(
      Math.abs(r.steps - expected) <= 1,
      `${hz}Hz ran ${r.steps} steps in ${r.seconds}s, expected ~${expected}`
    );
  }
});

test("every frame renders exactly once, however many steps it took", () => {
  // A slow panel takes several steps per frame and a fast one takes zero or
  // one. Neither may draw twice, and neither may skip a draw.
  for (const hz of [30, 60, 144]) {
    const r = driver(hz, 40);
    assert.equal(r.renders, 40, `${hz}Hz drew ${r.renders} times in 40 frames`);
  }
});

test("the interpolation factor stays inside its own range", () => {
  // `render(alpha)` promises 0..1. A game that lerps with a number outside it
  // draws entities past where they will actually be.
  for (const a of driver(144, 200).alphas) {
    assert.ok(a >= 0 && a < 1, `alpha out of range: ${a}`);
  }
});

test("a tab returning from the background does not teleport anything", () => {
  let steps = 0;
  const h: { cb: ((t: number) => void) | null } = { cb: null };
  const loop = createLoop(
    () => steps++,
    () => {},
    { request: (fn) => ((h.cb = fn), 1), cancel: () => {}, now: () => 0 }
  );
  loop.start();
  // Sixty seconds in one frame — what a backgrounded tab hands back.
  h.cb!(60_000);
  assert.ok(
    steps <= MAX_STEPS,
    `a ${MAX_FRAME}s clamp should cap catch-up at ${MAX_STEPS} steps, ran ${steps}`
  );
});

test("start is idempotent and stop actually stops", () => {
  // Open, quit, open again is the path that leaks a second loop, and two loops
  // on one game is a game running at double speed with doubled input.
  let requests = 0;
  let cancels = 0;
  const h: { cb: ((t: number) => void) | null } = { cb: null };
  const loop = createLoop(
    () => {},
    () => {},
    {
      request: (fn) => (requests++, (h.cb = fn), requests),
      cancel: () => cancels++,
      now: () => 0,
    }
  );
  loop.start();
  loop.start();
  assert.equal(requests, 1, "a second start scheduled a second loop");
  assert.equal(loop.running, true);
  loop.stop();
  loop.stop();
  assert.equal(cancels, 1, "a second stop cancelled a frame it did not own");
  assert.equal(loop.running, false);
  assert.ok(h.cb, "the driver kept its callback");
});
