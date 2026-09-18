import test from "node:test";
import assert from "node:assert/strict";
import { PLAY_THRESHOLD_MS, PlayTimer } from "./play-count";
import { isAnonId } from "./anon-id";

/**
 * The rule that decides whether a play is a play.
 *
 * This is the arithmetic behind two definition-of-done items — "play count
 * cannot be inflated by reloading the page in a loop" and "tab-switch pauses
 * the loop" — and it is the only part of them that can be asserted without a
 * browser. The session guard and the visibility listener are wired in
 * `use-play-count.ts`; what is pinned here is that paused time is not play.
 */

test("ten seconds of continuous play reaches the threshold", () => {
  const t = new PlayTimer();
  t.resume(0);
  assert.equal(t.reached(9_999), false);
  assert.equal(t.reached(PLAY_THRESHOLD_MS), true);
});

test("a paused game accumulates nothing", () => {
  const t = new PlayTimer();
  t.resume(0);
  t.pause(4_000);
  // Four seconds banked, then ten minutes on a pause screen.
  assert.equal(t.elapsed(600_000), 4_000);
  assert.equal(t.reached(600_000), false);
});

test("play either side of a pause adds up", () => {
  // The case a `setTimeout` gets wrong: two five-second sessions with an hour
  // between them are ten seconds of play.
  const t = new PlayTimer();
  t.resume(0);
  t.pause(5_000);
  t.resume(3_600_000);
  assert.equal(t.reached(3_604_999), false);
  assert.equal(t.reached(3_605_000), true);
});

test("a backgrounded tab is not play, however long it is backgrounded", () => {
  const t = new PlayTimer();
  t.resume(0);
  t.pause(1_000);
  // The tab spends a day hidden. rAF is throttled, nothing steps, and the
  // count must not arrive on return.
  assert.equal(t.reached(86_400_000), false);
  t.resume(86_400_000);
  assert.equal(t.reached(86_400_000 + 8_999), false);
  assert.equal(t.reached(86_400_000 + 9_000), true);
});

test("resuming twice does not restart the clock, and pausing twice does not double-count", () => {
  const t = new PlayTimer();
  t.resume(0);
  t.resume(5_000); // ignored: already running
  assert.equal(t.elapsed(6_000), 6_000);
  t.pause(6_000);
  t.pause(9_000); // ignored: already paused
  assert.equal(t.elapsed(9_000), 6_000);
});

test("a clock that goes backwards contributes nothing rather than a negative", () => {
  // `performance.now()` across a system suspend, or a machine whose time was
  // adjusted mid-run. A negative interval would push the count further away
  // and, with enough of them, make the threshold unreachable.
  const t = new PlayTimer();
  t.resume(10_000);
  assert.equal(t.elapsed(9_000), 0);
  t.pause(9_000);
  assert.equal(t.elapsed(9_000), 0);
});

test("running reports what the timer is actually doing", () => {
  const t = new PlayTimer();
  assert.equal(t.running, false);
  t.resume(0);
  assert.equal(t.running, true);
  t.pause(1);
  assert.equal(t.running, false);
});

test("the threshold is the spec's ten seconds", () => {
  assert.equal(PLAY_THRESHOLD_MS, 10_000);
});

test("only a v4 UUID is accepted as an anonymous id", () => {
  // `anon_id` is half of a primary key. Unvalidated it is a column any caller
  // can write any string into, as many times as they like.
  assert.equal(isAnonId("3f1c0f8e-2c5a-4a2e-9f1b-6d7e8a9b0c1d"), true);
  assert.equal(isAnonId("3F1C0F8E-2C5A-4A2E-9F1B-6D7E8A9B0C1D"), true);
  // Version 1, not 4.
  assert.equal(isAnonId("3f1c0f8e-2c5a-1a2e-9f1b-6d7e8a9b0c1d"), false);
  // Wrong variant nibble.
  assert.equal(isAnonId("3f1c0f8e-2c5a-4a2e-1f1b-6d7e8a9b0c1d"), false);
  assert.equal(isAnonId("not-a-uuid"), false);
  assert.equal(isAnonId(""), false);
  assert.equal(isAnonId(null), false);
  assert.equal(isAnonId(123), false);
  // The shape an injection attempt takes if the column is unguarded.
  assert.equal(isAnonId("' or 1=1 --"), false);
});
