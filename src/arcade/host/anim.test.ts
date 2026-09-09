import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE_STEPS,
  HITSTOP_STEPS,
  HOP_STEPS,
  createAnimator,
} from "./anim";

/**
 * Cells laid out along a line, one unit apart.
 *
 * The geometry is deliberately trivial: what is worth pinning here is timing
 * and arrival, and a real board graph would only make the arithmetic in the
 * assertions harder to read without testing anything the line does not.
 */
const line = (cell: number) => ({ x: cell, y: 0 });

const animator = (reduced = false) =>
  createAnimator({ positionOf: line, reduced: () => reduced });

const run = (a: { step(): void }, n: number) => {
  for (let i = 0; i < n; i++) a.step();
};

test("a six-cell move is six hops, and lands on the sixth", () => {
  const a = animator();
  a.place(1, 0);
  a.play([{ kind: "move", tokenId: 1, path: [1, 2, 3, 4, 5, 6] }]);

  assert.equal(a.busy, true);
  run(a, HOP_STEPS * 6 - 1);
  assert.equal(a.busy, true, "still going one step before the end");

  a.step();
  assert.equal(a.busy, false);
  const v = a.view(1);
  assert.equal(v?.cell, 6);
  assert.equal(v?.x, 6);
  assert.equal(v?.lift, 0, "and it is back on the board, not mid-air");
});

test("the path is the cells entered, so the first hop is not a stutter", () => {
  const a = animator();
  a.place(1, 3);
  a.play([{ kind: "move", tokenId: 1, path: [4] }]);

  // One cell of travel takes one hop. If `path` were read as including the
  // origin this would be two, the first of them from cell 3 to cell 3.
  run(a, HOP_STEPS);
  assert.equal(a.busy, false);
  assert.equal(a.view(1)?.x, 4);
});

test("a token lifts mid-hop and is flat at both ends", () => {
  const a = animator();
  a.place(1, 0);
  a.play([{ kind: "move", tokenId: 1, path: [1] }]);

  run(a, HOP_STEPS / 2);
  assert.equal((a.view(1)?.lift ?? 0) > 0.3, true, "airborne at the apex");
  run(a, HOP_STEPS / 2);
  assert.equal(a.view(1)?.lift, 0);
});

test("hop cues climb in pitch across one move", () => {
  const a = animator();
  a.place(1, 0);
  a.play([{ kind: "move", tokenId: 1, path: [1, 2, 3] }]);
  run(a, HOP_STEPS * 3);

  const cues = a.drainCues();
  assert.deepEqual(
    cues.map((c) => c.semitones),
    [0, 1, 2],
    "five identical ticks and a rising phrase cost the same"
  );
  assert.deepEqual(a.drainCues(), [], "and are owed once");
});

test("a capture travels from where the token actually is", () => {
  const a = animator();
  a.place(1, 0);
  // Walk it out to cell 4 first, so its drawn position is not its start cell.
  a.play([{ kind: "move", tokenId: 1, path: [1, 2, 3, 4] }]);
  run(a, HOP_STEPS * 4);

  a.play([{ kind: "capture", tokenId: 1, to: 0 }]);
  run(a, CAPTURE_STEPS / 2);
  const mid = a.view(1)?.x ?? -1;

  // The aliasing bug this guards: taking the live view as the job's origin
  // makes the token chase its own start point, so it creeps a fraction of a
  // cell per step and never arrives. Halfway home is strictly between.
  assert.equal(mid > 0 && mid < 4, true, `crept instead of travelling: ${mid}`);

  run(a, CAPTURE_STEPS / 2);
  assert.equal(a.view(1)?.x, 0, "and it reaches the base");
});

test("hit-stop freezes the next move as well as the frame", () => {
  const a = animator();
  a.place(1, 4);
  a.place(2, 0);
  a.play([
    { kind: "capture", tokenId: 1, to: 0 },
    { kind: "move", tokenId: 2, path: [1] },
  ]);

  run(a, CAPTURE_STEPS);
  assert.equal(a.hitstop, HITSTOP_STEPS, "the capture landed and stopped time");

  const before = a.view(2)?.x;
  run(a, HITSTOP_STEPS);
  assert.equal(a.view(2)?.x, before, "nothing moved while stopped");
  assert.equal(a.hitstop, 0);

  run(a, HOP_STEPS);
  assert.equal(a.view(2)?.x, 1, "and it resumes afterwards");
});

test("a captured token flashes, and stops", () => {
  const a = animator();
  a.place(1, 4);
  a.play([{ kind: "capture", tokenId: 1, to: 0 }]);
  run(a, CAPTURE_STEPS);
  assert.equal((a.view(1)?.flash ?? 0) > 0, true);

  run(a, 200);
  assert.equal(a.view(1)?.flash, 0);
});

test("reduced motion keeps the hop and drops the shake", () => {
  const a = animator(true);
  a.place(1, 4);
  a.play([{ kind: "capture", tokenId: 1, to: 0 }]);

  // Halved, not removed: the count of cells is information, and a teleport
  // deletes it. CLAUDE.md's rule is that local feedback is shortened.
  run(a, CAPTURE_STEPS / 2);
  assert.equal(a.busy, false, "it finished in half the steps");
  assert.equal(a.view(1)?.x, 0);

  assert.equal(a.hitstop, 0, "no hit-stop");
  assert.deepEqual(a.shake, { x: 0, y: 0 }, "and no shake");
});

test("a ladder and a snake do not share a curve", () => {
  const climb = animator();
  climb.place(1, 0);
  climb.play([{ kind: "jump", tokenId: 1, from: 0, to: 10 }]);
  climb.step();
  const upFirst = climb.view(1)?.x ?? 0;

  const fall = animator();
  fall.place(1, 10);
  fall.play([{ kind: "jump", tokenId: 1, from: 10, to: 0 }]);
  fall.step();
  const downFirst = 10 - (fall.view(1)?.x ?? 10);

  // A ladder eases in — barely moving on the first step. A snake eases out and
  // is already gone. Same distance, opposite openings.
  assert.equal(downFirst > upFirst, true, "the snake leaves faster than the ladder");
  assert.equal((climb.view(1)?.lift ?? 0) >= 0, true);
});

test("an event for a token with no id, or a kind nobody knows, is ignored", () => {
  const a = animator();
  a.place(1, 0);
  a.play([
    { kind: "extraTurn" },
    { kind: "somethingGameSpecific", tokenId: 1 },
    { kind: "capture" },
  ]);
  assert.equal(a.busy, false);
  assert.equal(a.view(1)?.x, 0);
});

test("clear stops everything in flight", () => {
  const a = animator();
  a.place(1, 0);
  a.play([{ kind: "move", tokenId: 1, path: [1, 2, 3, 4, 5, 6] }]);
  run(a, HOP_STEPS + 2);
  a.clear();

  assert.equal(a.busy, false);
  assert.equal(a.view(1)?.lift, 0);
  assert.deepEqual(a.drainCues(), []);
  run(a, 60);
  assert.equal(a.busy, false, "and nothing restarts on its own");
});
