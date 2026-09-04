import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GHOST_MAX_SAMPLES,
  GHOST_STEP_MS,
  GhostRecorder,
  ghostLengthMs,
  ghostPoseAt,
  ghostSchema,
} from "./ghost";

/**
 * The recorder and the reader are the two halves of one format, and the only
 * way a mismatch between them shows up at runtime is a ghost standing in the
 * wrong place — which looks exactly like a ghost that was genuinely there.
 * So they are tested against each other rather than against a fixture.
 */

const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps;

test("a recorded pose reads back at the sample it was taken", () => {
  const r = new GhostRecorder();
  r.sample(0, 1, 2, 3, 0.5);
  r.sample(GHOST_STEP_MS, 4, 5, 6, -0.5);
  const track = r.track()!;

  const a = ghostPoseAt(track, 0)!;
  assert.ok(near(a.x, 1) && near(a.y, 2) && near(a.z, 3) && near(a.yaw, 0.5));
  const b = ghostPoseAt(track, GHOST_STEP_MS)!;
  assert.ok(near(b.x, 4) && near(b.y, 5) && near(b.z, 6) && near(b.yaw, -0.5));
});

test("between samples the pose is interpolated", () => {
  const r = new GhostRecorder();
  r.sample(0, 0, 0, 0, 0);
  r.sample(GHOST_STEP_MS, 10, 0, 0, 0);
  const mid = ghostPoseAt(r.track()!, GHOST_STEP_MS / 2)!;
  assert.ok(near(mid.x, 5), `midpoint was ${mid.x}`);
});

test("yaw interpolates the short way round the seam", () => {
  const r = new GhostRecorder();
  r.sample(0, 0, 0, 0, Math.PI - 0.1);
  r.sample(GHOST_STEP_MS, 0, 0, 0, -Math.PI + 0.1);
  const mid = ghostPoseAt(r.track()!, GHOST_STEP_MS / 2)!;
  // The short way passes through ±pi, not through zero. Anything near 0 here
  // is the ghost spinning a full turn on the spot between two frames.
  assert.ok(Math.abs(mid.yaw) > 3, `crossed the wrong way: ${mid.yaw}`);
});

test("reading past either end clamps rather than vanishing", () => {
  const r = new GhostRecorder();
  r.sample(0, 1, 0, 0, 0);
  r.sample(GHOST_STEP_MS, 2, 0, 0, 0);
  const track = r.track()!;
  assert.ok(near(ghostPoseAt(track, -5000)!.x, 1));
  assert.ok(near(ghostPoseAt(track, 5_000_000)!.x, 2));
});

test("a slow frame repeats the last pose instead of shifting the run", () => {
  const r = new GhostRecorder();
  r.sample(0, 0, 0, 0, 0);
  // Nothing offered for half a second, then a pose at 500ms.
  r.sample(GHOST_STEP_MS * 5, 50, 0, 0, 0);
  const track = r.track()!;

  assert.equal(ghostLengthMs(track), GHOST_STEP_MS * 5);
  // The gap holds the earlier pose...
  assert.ok(near(ghostPoseAt(track, GHOST_STEP_MS * 3)!.x, 0));
  // ...and the late sample lands at the time it was actually taken, which is
  // the property that keeps a ghost synchronised with the clock on screen.
  assert.ok(near(ghostPoseAt(track, GHOST_STEP_MS * 5)!.x, 50));
});

test("samples offered faster than the rate do not inflate the track", () => {
  const r = new GhostRecorder();
  for (let ms = 0; ms <= 1000; ms += 8) r.sample(ms, ms / 100, 0, 0, 0);
  const track = r.track()!;
  assert.equal(track.p.length / 4, 11, "one sample per 100ms over one second");
  assert.equal(ghostLengthMs(track), 1000);
});

test("recording stops at the cap rather than growing without bound", () => {
  const r = new GhostRecorder();
  for (let i = 0; i < GHOST_MAX_SAMPLES + 500; i++) {
    r.sample(i * GHOST_STEP_MS, i, 0, 0, 0);
  }
  const track = r.track()!;
  assert.equal(track.p.length / 4, GHOST_MAX_SAMPLES);
  assert.ok(ghostSchema.safeParse(track).success);
});

test("a run too short to interpolate produces no ghost", () => {
  const r = new GhostRecorder();
  assert.equal(r.track(), null);
  r.sample(0, 0, 0, 0, 0);
  assert.equal(r.track(), null, "one sample is not a replay");
});

test("reset clears the track", () => {
  const r = new GhostRecorder();
  r.sample(0, 0, 0, 0, 0);
  r.sample(GHOST_STEP_MS, 1, 0, 0, 0);
  assert.ok(r.track());
  r.reset();
  assert.equal(r.track(), null);
  // And the slot counter goes with it, or the next run records nothing.
  r.sample(0, 9, 0, 0, 0);
  r.sample(GHOST_STEP_MS, 8, 0, 0, 0);
  assert.ok(near(ghostPoseAt(r.track()!, 0)!.x, 9));
});

test("the schema rejects a truncated sample", () => {
  assert.ok(!ghostSchema.safeParse({ step: 100, p: [1, 2, 3] }).success);
  assert.ok(ghostSchema.safeParse({ step: 100, p: [1, 2, 3, 4] }).success);
});

test("the schema rejects a track longer than the cap", () => {
  const p = new Array((GHOST_MAX_SAMPLES + 1) * 4).fill(0);
  assert.ok(!ghostSchema.safeParse({ step: 100, p }).success);
});
