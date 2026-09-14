import test from "node:test";
import assert from "node:assert/strict";
import {
  glContextServerSnapshot,
  isGlContextLost,
  setGlContextLost,
  subscribeGlContext,
} from "./gl-context";

/**
 * The flag behind the "Graphics stopped" notice.
 *
 * Small, but it is read through `useSyncExternalStore`, and that hook is
 * unforgiving in two specific ways which are exactly what is checked here:
 * the snapshot has to be referentially stable between notifications, or React
 * re-renders forever; and the server snapshot has to be a value the server can
 * actually produce.
 */

test("it starts clear — a page that has not lost anything shows no notice", () => {
  assert.equal(isGlContextLost(), false);
});

test("the server never claims the context is lost", () => {
  // There is no GPU on the server. A `true` here would render the notice into
  // the HTML and flash it on every first paint.
  assert.equal(glContextServerSnapshot(), false);
});

test("subscribers hear about a change, once", () => {
  let calls = 0;
  const stop = subscribeGlContext(() => calls++);

  setGlContextLost(true);
  assert.equal(calls, 1);
  assert.equal(isGlContextLost(), true);

  // A driver firing the same event twice must not notify twice: with
  // useSyncExternalStore that is a second render for no change.
  setGlContextLost(true);
  assert.equal(calls, 1);

  setGlContextLost(false);
  assert.equal(calls, 2);
  assert.equal(isGlContextLost(), false);

  stop();
});

test("unsubscribing stops the notifications", () => {
  let calls = 0;
  const stop = subscribeGlContext(() => calls++);
  stop();
  setGlContextLost(true);
  assert.equal(calls, 0);
  setGlContextLost(false);
});

test("the snapshot is a stable primitive between notifications", () => {
  // useSyncExternalStore compares snapshots with Object.is and re-renders
  // until two agree. Returning a fresh object each call is the classic way to
  // hang a page; this returns a boolean, and this test is what says so.
  const a = isGlContextLost();
  const b = isGlContextLost();
  assert.ok(Object.is(a, b));
  assert.equal(typeof a, "boolean");
});
