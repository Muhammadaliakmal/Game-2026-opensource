import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, WorldSession } from "./world-session.ts";
import { emptyWorldDoc, type PartTuple } from "@/lib/worlddoc";
import type { LeafOp, Op } from "@/lib/ops";

const part = (x: number, y: number, z: number, color = 19): PartTuple => [x, y, z, 0, color, 0, 0];
const place = (x: number, y: number, z: number): LeafOp => ({
  t: "place",
  key: `${x},${y},${z}`,
  part: part(x, y, z),
});

/** A session with a clock we control, so rate-limit tests never sleep. */
function session(now = { t: 0 }) {
  return new WorldSession(emptyWorldDoc("world-1", "user_1"), () => now.t);
}

test("an accepted op is applied and bumps the revision", () => {
  const s = session();
  const result = s.submit("a", place(0, 0, 0));

  assert.equal(result.ok, true);
  assert.equal(s.partCount, 1);
  assert.equal(s.revision, 1);
  assert.equal(s.dirty, true);
});

test("a malformed op changes nothing", () => {
  const s = session();
  const result = s.submit("a", { t: "place", key: "0,0,0", part: [0, 0, 0, 0, 99, 0, 0] });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "invalid");
  assert.equal(s.partCount, 0);
  assert.equal(s.revision, 0, "a rejected op must not advance the revision");
});

test("a forged key is rejected at the server, not just in the editor", () => {
  const s = session();
  const result = s.submit("a", { t: "place", key: "9,9,9", part: part(1, 2, 3) });
  assert.equal(result.ok, false);
});

test("garbage that is not an op at all is rejected without throwing", () => {
  const s = session();
  for (const junk of [null, 42, "place", [], { t: "drop-table" }]) {
    assert.equal(s.submit("a", junk).ok, false);
  }
  assert.equal(s.revision, 0);
});

test("the world a client receives reflects every accepted edit", () => {
  const s = session();
  s.submit("a", place(0, 0, 0));
  s.submit("a", place(0, 1, 0));
  s.submit("a", { t: "erase", key: "0,0,0", prev: part(0, 0, 0) });
  s.submit("a", { t: "spawn", prev: [0, 1, 0], next: [4, 2, 4] });

  const doc = s.doc;
  assert.deepEqual(doc.parts, [part(0, 1, 0)]);
  assert.deepEqual(doc.spawn, [4, 2, 4]);
  // Still the same world, not a new one — id and owner must survive.
  assert.equal(doc.id, "world-1");
  assert.equal(doc.ownerId, "user_1");
});

// --- flood protection ------------------------------------------------------

test("a client that floods the room is cut off, and recovers as time passes", () => {
  const now = { t: 0 };
  const s = session(now);

  let accepted = 0;
  for (let i = 0; i < LIMITS.burst + 20; i++) {
    if (s.submit("a", place(i, 0, 0)).ok) accepted++;
  }
  assert.equal(accepted, LIMITS.burst, "the burst allowance is spent, then nothing");

  const rejected = s.submit("a", place(999, 0, 0));
  assert.equal(rejected.ok === false && rejected.reason, "rate-limited");

  // One second later the bucket has refilled at the sustained rate.
  now.t = 1000;
  assert.equal(s.submit("a", place(1000, 0, 0)).ok, true);
});

test("one client's flood does not throttle anybody else", () => {
  const now = { t: 0 };
  const s = session(now);
  for (let i = 0; i < LIMITS.burst + 5; i++) s.submit("noisy", place(i, 0, 0));

  assert.equal(s.submit("quiet", place(0, 5, 0)).ok, true);
});

test("a client leaving frees its bucket", () => {
  const now = { t: 0 };
  const s = session(now);
  for (let i = 0; i < LIMITS.burst + 5; i++) s.submit("a", place(i, 0, 0));
  assert.equal(s.submit("a", place(0, 9, 0)).ok, false);

  s.forget("a");
  assert.equal(s.submit("a", place(0, 9, 0)).ok, true);
});

// --- size caps -------------------------------------------------------------

test("the part cap is enforced before the doc becomes unsaveable", () => {
  // A doc over worldDocSchema's 50k cap fails parseWorldDoc at save time —
  // after everyone has already built. Refusing the op is the kinder failure.
  const doc = emptyWorldDoc("world-1", "user_1");
  doc.parts = Array.from({ length: LIMITS.maxParts }, (_, i) => part(i, 0, 0));
  const s = new WorldSession(doc);

  const rejected = s.submit("a", place(0, 1, 0));
  assert.equal(rejected.ok === false && rejected.reason, "part-limit");

  // Replacing an existing cell adds nothing, so it is still allowed at the cap.
  assert.equal(
    s.submit("a", { t: "replace", key: "0,0,0", next: part(0, 0, 0, 3), prev: part(0, 0, 0) }).ok,
    true
  );
  // And so is erasing.
  assert.equal(s.submit("a", { t: "erase", key: "0,0,0", prev: part(0, 0, 0, 3) }).ok, true);
});

test("a stroke is measured as a whole, not cell by cell", () => {
  const doc = emptyWorldDoc("world-1", "user_1");
  doc.parts = Array.from({ length: LIMITS.maxParts - 2 }, (_, i) => part(i, 0, 0));
  const s = new WorldSession(doc);

  // Five ops, but they touch two cells and one of them is a re-place: net +2,
  // which fits. Counting the children naively would refuse this.
  const stroke: Op = {
    t: "composite",
    ops: [
      place(0, 7, 0),
      place(0, 8, 0),
      place(0, 7, 0),
      { t: "erase", key: "0,8,0", prev: part(0, 8, 0) } as LeafOp,
      place(0, 8, 0),
    ],
  };
  assert.equal(s.submit("a", stroke).ok, true);
  assert.equal(s.partCount, LIMITS.maxParts);

  assert.equal(s.submit("a", place(0, 9, 0)).ok === false, true);
});

test("the prop cap is enforced too", () => {
  const doc = emptyWorldDoc("world-1", "user_1");
  doc.props = Array.from({ length: LIMITS.maxProps }, () => ({
    assetId: "tree",
    pos: [0, 0, 0] as [number, number, number],
    rot: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  }));
  const s = new WorldSession(doc);

  const result = s.submit("a", {
    t: "prop-add",
    instance: { assetId: "rock", pos: [1, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
  });
  assert.equal(result.ok === false && result.reason, "prop-limit");
});
