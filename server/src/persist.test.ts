import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldPersistence, type PersistTarget } from "./persist.ts";
import { emptyWorldDoc, type WorldDoc } from "@/lib/worlddoc";

/**
 * A hand-cranked clock and timer queue, so timing is asserted rather than
 * waited for. Every test here would otherwise be a sleep, and a test suite
 * that sleeps for the debounce is a test suite nobody runs.
 */
function harness() {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;

  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (handle: unknown) => {
      const i = timers.findIndex((t) => t.id === handle);
      if (i >= 0) timers.splice(i, 1);
    },
    /** Advance the clock, firing anything due. */
    async advance(ms: number) {
      now += ms;
      for (const due of timers.filter((t) => t.at <= now)) {
        timers.splice(timers.indexOf(due), 1);
        due.fn();
      }
      // Let the save promise chain settle before the assertions run.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
    pending: () => timers.length,
  };
}

/** A stand-in for WorldSession: dirty, with a revision that moves. */
function target(): PersistTarget & { edit(): void } {
  let revision = 0;
  let dirty = false;
  return {
    get doc(): WorldDoc {
      return { ...emptyWorldDoc("w1", "user_1"), sky: revision };
    },
    get revision() {
      return revision;
    },
    get dirty() {
      return dirty;
    },
    markSaved(at: number) {
      if (at === revision) dirty = false;
    },
    edit() {
      revision += 1;
      dirty = true;
    },
  };
}

function saver() {
  const calls: WorldDoc[] = [];
  let fail = false;
  let holding = false;
  let letGo: (() => void) | null = null;
  return {
    calls,
    failNext(on: boolean) {
      fail = on;
    },
    /** Hold the next save open, to test what happens to edits made mid-write. */
    hold() {
      holding = true;
    },
    release() {
      holding = false;
      letGo?.();
      letGo = null;
    },
    fn: async (_id: string, doc: WorldDoc) => {
      calls.push(doc);
      if (holding) await new Promise<void>((resolve) => (letGo = resolve));
      if (fail) throw new Error("nope");
    },
  };
}

test("an edit is saved once the room goes quiet, not on every op", async () => {
  const h = harness();
  const t = target();
  const s = saver();
  const p = new WorldPersistence("w1", t, s.fn, {
    idleMs: 5000,
    maxWaitMs: 30000,
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });

  for (let i = 0; i < 20; i++) {
    t.edit();
    p.touch();
    await h.advance(100);
  }
  assert.equal(s.calls.length, 0, "a burst of edits must not be a burst of writes");

  await h.advance(5000);
  assert.equal(s.calls.length, 1);
  assert.equal(t.dirty, false);
});

test("continuous building still saves — the wait has a ceiling", async () => {
  const h = harness();
  const t = target();
  const s = saver();
  const p = new WorldPersistence("w1", t, s.fn, {
    idleMs: 5000,
    maxWaitMs: 20000,
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });

  // Never idle for five seconds: without a ceiling this saves exactly never.
  for (let i = 0; i < 60; i++) {
    t.edit();
    p.touch();
    await h.advance(1000);
  }

  assert.ok(s.calls.length >= 2, `expected periodic saves, got ${s.calls.length}`);
});

test("a failed write is retried, and the world stays dirty until one lands", async () => {
  const h = harness();
  const t = target();
  const s = saver();
  const p = new WorldPersistence("w1", t, s.fn, {
    idleMs: 1000,
    maxWaitMs: 30000,
    retryMs: 2000,
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
    onError: () => {},
  });

  s.failNext(true);
  t.edit();
  p.touch();
  await h.advance(1000);
  assert.equal(s.calls.length, 1);
  assert.equal(t.dirty, true, "a failed save must not look like a saved world");

  s.failNext(false);
  await h.advance(2000);
  assert.equal(s.calls.length, 2);
  assert.equal(t.dirty, false);
});

test("edits made during a write are not marked as saved by it", async () => {
  const h = harness();
  const t = target();
  const s = saver();
  const p = new WorldPersistence("w1", t, s.fn, {
    idleMs: 1000,
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });

  t.edit();
  p.touch();
  s.hold();
  await h.advance(1000);
  assert.equal(s.calls.length, 1);

  // Lands while the first write is still in the air.
  t.edit();
  p.touch();
  s.release();
  await h.advance(0);

  assert.equal(t.dirty, true, "the in-flight write was a snapshot of an older world");
  await h.advance(1000);
  assert.equal(s.calls.length, 2);
  assert.equal(t.dirty, false);
});

test("dispose writes the last edits of a session", async () => {
  const h = harness();
  const t = target();
  const s = saver();
  const p = new WorldPersistence("w1", t, s.fn, {
    idleMs: 5000,
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });

  t.edit();
  p.touch();
  await p.dispose();

  assert.equal(s.calls.length, 1, "the room left without saving");
  assert.equal(t.dirty, false);
  assert.equal(h.pending(), 0, "dispose must not leave a timer running");
});

test("dispose on a clean world writes nothing", async () => {
  const h = harness();
  const t = target();
  const s = saver();
  const p = new WorldPersistence("w1", t, s.fn, {
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });

  await p.dispose();
  assert.equal(s.calls.length, 0);
});
