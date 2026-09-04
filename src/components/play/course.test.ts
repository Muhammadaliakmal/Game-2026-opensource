import { test } from "node:test";
import assert from "node:assert/strict";
import { useCourse } from "./course";

/**
 * The run state machine, which is small and has one genuinely subtle rule.
 *
 * A fall is not a failure once a checkpoint is held — the clock keeps running,
 * because you did not restart the course, you fell off part of it. That rule
 * is what makes checkpoints worth having, and it is also what makes a RESTART
 * a separate command: with the rule in place there is otherwise no way back to
 * a clean run, and the per-map best time becomes unbeatable the moment you
 * bank a checkpoint on a bad attempt.
 *
 * These four cases are the ones that were wrong or unreachable before the
 * tiered courses shipped, when no built-in world had a checkpoint in it and
 * every path through here took the `checkpoint === -1` branch.
 */

const fresh = () => {
  useCourse.getState().clear();
  useCourse.getState().begin("map-1");
};

test("a fall with no checkpoint held starts the clock over", () => {
  fresh();
  const started = useCourse.getState().startedAt!;
  useCourse.getState().respawned();
  assert.notEqual(useCourse.getState().startedAt, started);
});

test("a fall with a checkpoint held keeps the clock and the checkpoint", () => {
  fresh();
  useCourse.getState().setCheckpointCount(3);
  useCourse.getState().begin("map-1");
  useCourse.getState().reachCheckpoint(1);
  const started = useCourse.getState().startedAt;

  useCourse.getState().respawned();
  assert.equal(useCourse.getState().startedAt, started, "clock must keep running");
  assert.equal(useCourse.getState().checkpoint, 1, "progress must be kept");
});

test("checkpoints only ever move forward", () => {
  fresh();
  useCourse.getState().reachCheckpoint(2);
  useCourse.getState().reachCheckpoint(1);
  assert.equal(useCourse.getState().checkpoint, 2);
});

test("a restart throws the checkpoints away and re-arms the clock", () => {
  fresh();
  useCourse.getState().reachCheckpoint(2);
  useCourse.getState().complete();
  assert.notEqual(useCourse.getState().finishedMs, null, "the run finished");

  useCourse.getState().restart();
  const s = useCourse.getState();
  assert.equal(s.checkpoint, -1, "a new attempt holds no checkpoint");
  assert.equal(s.finishedMs, null, "a new attempt is not already finished");
  assert.notEqual(s.startedAt, null, "and its clock is running");
});

test("a course is completed once, not once per frame in the zone", () => {
  fresh();
  useCourse.getState().complete();
  const first = useCourse.getState().finishedMs;
  useCourse.getState().complete();
  assert.equal(useCourse.getState().finishedMs, first);
});
