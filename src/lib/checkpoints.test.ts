import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECKPOINT_ABOVE,
  CHECKPOINT_BELOW,
  CHECKPOINT_RADIUS,
  checkpointAt,
  inCheckpoint,
  resumePose,
} from "./checkpoints";
import type { Checkpoint } from "./worlddoc";

const cps: Checkpoint[] = [
  { pos: [0, 0, 0], yaw: 0 },
  { pos: [20, 4, 0], yaw: Math.PI / 2 },
  { pos: [40, 8, 0], yaw: Math.PI },
];

test("a checkpoint is a cylinder, generous up and tight down", () => {
  const cp = cps[0];
  assert.ok(inCheckpoint(0, 0, 0, cp));
  assert.ok(inCheckpoint(CHECKPOINT_RADIUS - 0.01, 0, 0, cp));
  assert.ok(!inCheckpoint(CHECKPOINT_RADIUS + 0.01, 0, 0, cp));

  // Mid-jump above it still counts; the deck below it does not.
  assert.ok(inCheckpoint(0, CHECKPOINT_ABOVE - 0.01, 0, cp));
  assert.ok(!inCheckpoint(0, CHECKPOINT_ABOVE + 0.01, 0, cp));
  assert.ok(inCheckpoint(0, -CHECKPOINT_BELOW + 0.01, 0, cp));
  assert.ok(!inCheckpoint(0, -CHECKPOINT_BELOW - 0.01, 0, cp));
});

test("reaching one banks it; standing nowhere near keeps what you had", () => {
  assert.equal(checkpointAt(0, 0, 0, cps, -1), 0);
  assert.equal(checkpointAt(20, 4, 0, cps, 0), 1);
  assert.equal(checkpointAt(100, 100, 100, cps, 1), 1);
});

test("running back through an earlier gate does not lose progress", () => {
  // The whole point of the forward-only rule: exploring backwards must not
  // cost a runner the checkpoint they already earned.
  assert.equal(checkpointAt(0, 0, 0, cps, 2), 2);
  assert.equal(checkpointAt(20, 4, 0, cps, 2), 2);
});

test("overlapping zones bank the furthest one", () => {
  const stacked: Checkpoint[] = [
    { pos: [0, 0, 0], yaw: 0 },
    { pos: [1, 0, 0], yaw: 0 },
  ];
  assert.equal(checkpointAt(0.5, 0, 0, stacked, -1), 1);
});

test("a course with no checkpoints never advances", () => {
  assert.equal(checkpointAt(0, 0, 0, [], -1), -1);
});

test("resume falls back to the spawn, and carries the facing when it does not", () => {
  const spawn: [number, number, number] = [7, 2, 7];
  assert.deepEqual(resumePose(cps, -1, spawn, 1.5), { pos: [7, 2, 7], yaw: 1.5 });
  assert.deepEqual(resumePose(cps, 1, spawn), {
    pos: [20, 4, 0],
    yaw: Math.PI / 2,
  });
  // A stored index that outruns the list — an edited world, an old save —
  // must resume somewhere real rather than at undefined.
  assert.deepEqual(resumePose(cps, 99, spawn, 0), { pos: [7, 2, 7], yaw: 0 });
  assert.deepEqual(resumePose(undefined, 0, spawn, 0), { pos: [7, 2, 7], yaw: 0 });
});
