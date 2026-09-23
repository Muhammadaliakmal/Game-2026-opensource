import { test } from "node:test";
import assert from "node:assert/strict";
import { attachInput } from "./input";

/**
 * A press that begins and ends between two steps still has to be a press.
 *
 * Every cabinet derives its edge from the level (`down && !was`), so the
 * host's promise is that a level lasts at least one step. These tests drive
 * the listeners directly, with no DOM: `attachInput` only ever asks its
 * target for a rect and for listeners, and asks `window` for listeners.
 */

type Handler = (e: unknown) => void;

function fakeHost() {
  const handlers: Record<string, Handler> = {};
  const listen = (type: string, fn: Handler) => {
    handlers[type] = fn;
  };
  const target = {
    addEventListener: listen,
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const win = { addEventListener: listen, removeEventListener: () => {} };
  const hadWindow = "window" in globalThis;
  const prev = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = win;
  const host = attachInput(target as unknown as HTMLCanvasElement);
  const restore = () => {
    if (hadWindow) (globalThis as { window: unknown }).window = prev;
    else delete (globalThis as { window?: unknown }).window;
  };
  const key = (type: "keydown" | "keyup", code: string) =>
    handlers[type]({ code, repeat: false, preventDefault() {} });
  const ptr = (type: "pointerdown" | "pointerup", x = 10, y = 10) =>
    handlers[type]({ clientX: x, clientY: y, pointerId: 1 });
  return { host, key, ptr, restore };
}

test("a key pressed and released between steps is down for exactly one step", () => {
  const { host, key, restore } = fakeHost();
  try {
    key("keydown", "ArrowRight");
    key("keyup", "ArrowRight");
    // Step 1: the game polls and sees the press.
    assert.equal(host.state.keys.ArrowRight, true);
    assert.equal(host.state.axis.x, 1);
    assert.equal(host.pressed("ArrowRight"), true);
    host.endStep();
    // Step 2: the release has landed.
    assert.equal(host.state.keys.ArrowRight, false);
    assert.equal(host.state.axis.x, 0);
    assert.equal(host.pressed("ArrowRight"), false);
  } finally {
    restore();
  }
});

test("a key released after a step saw it is released at once", () => {
  const { host, key, restore } = fakeHost();
  try {
    key("keydown", "Space");
    host.endStep();
    assert.equal(host.state.keys.Space, true);
    key("keyup", "Space");
    assert.equal(host.state.keys.Space, false, "no deferral once a step has read the level");
  } finally {
    restore();
  }
});

test("a tap between steps is down for exactly one step, at the tap's position", () => {
  const { host, ptr, restore } = fakeHost();
  try {
    ptr("pointerdown", 40, 50);
    ptr("pointerup", 42, 51);
    assert.equal(host.state.pointer.down, true);
    assert.equal(host.state.pointer.x, 42);
    assert.equal(host.pressed("Pointer"), true);
    host.endStep();
    assert.equal(host.state.pointer.down, false);
    host.endStep();
    assert.equal(host.state.pointer.down, false);
  } finally {
    restore();
  }
});

test("a second press before the deferred release lands keeps the key held", () => {
  const { host, key, restore } = fakeHost();
  try {
    key("keydown", "KeyD");
    key("keyup", "KeyD");
    key("keydown", "KeyD");
    host.endStep();
    assert.equal(host.state.keys.KeyD, true, "the second press is still down");
    key("keyup", "KeyD");
    assert.equal(host.state.keys.KeyD, false);
  } finally {
    restore();
  }
});

test("clear forgets a deferred release along with everything else", () => {
  const { host, key, ptr, restore } = fakeHost();
  try {
    key("keydown", "KeyA");
    key("keyup", "KeyA");
    ptr("pointerdown");
    ptr("pointerup");
    host.clear();
    assert.equal(host.state.keys.KeyA, false);
    assert.equal(host.state.pointer.down, false);
    // The pending release must not resurrect anything on the next step.
    key("keydown", "KeyA");
    host.endStep();
    host.endStep();
    assert.equal(host.state.keys.KeyA, true, "a fresh press after clear is not released by the stale deferral");
  } finally {
    restore();
  }
});

test("two fingers are two touches, and moving one does not move the other", () => {
  const handlers: Record<string, Handler> = {};
  const listen = (type: string, fn: Handler) => {
    handlers[type] = fn;
  };
  const target = {
    addEventListener: listen,
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const prev = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = { addEventListener: listen, removeEventListener: () => {} };
  try {
    const host = attachInput(target as unknown as HTMLCanvasElement);
    const ev = (type: string, id: number, x: number, y: number) =>
      handlers[type]({ clientX: x, clientY: y, pointerId: id });

    ev("pointerdown", 7, 50, 300);
    ev("pointerdown", 9, 700, 320);
    host.endStep();
    ev("pointermove", 9, 740, 280);
    assert.deepEqual(
      host.state.touches.map((t) => [t.id, t.x, t.y]),
      [
        [7, 50, 300],
        [9, 740, 280],
      ]
    );

    ev("pointerup", 7, 50, 300);
    assert.deepEqual(host.state.touches.map((t) => t.id), [9], "a seen touch lifts at once");

    // A tap inside one step is listed for that step, then gone.
    ev("pointerdown", 11, 400, 200);
    ev("pointerup", 11, 400, 200);
    assert.deepEqual(host.state.touches.map((t) => t.id), [9, 11]);
    host.endStep();
    assert.deepEqual(host.state.touches.map((t) => t.id), [9]);

    host.clear();
    assert.equal(host.state.touches.length, 0);
  } finally {
    (globalThis as { window: unknown }).window = prev;
  }
});
