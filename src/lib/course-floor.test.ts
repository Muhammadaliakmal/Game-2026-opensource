import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBuiltInDoc } from "./built-in-worlds";
import { courseFloorFor, courseKey, floorMoved, NOT_A_COURSE } from "./course-floor";
import { routeFloorMs } from "./medals";
import type { PartTuple, WorldDoc } from "./worlddoc";

/** A shipped course, which is the only geometry here with a real route. */
const course = () => buildBuiltInDoc("parkour", "u")!;

/** The same document with some fields replaced. */
const edit = (doc: WorldDoc, patch: Partial<WorldDoc>): WorldDoc => ({
  ...doc,
  ...patch,
});

test("a world with no goal is not a course, and never reaches the solver", () => {
  const island = buildBuiltInDoc("island", "u")!;
  assert.equal(island.goal, undefined, "island is a sandbox, not a course");
  assert.deepEqual(courseFloorFor(island), NOT_A_COURSE);
});

test("the floor a fresh document gets is the solver's own answer", () => {
  const doc = course();
  const { floorKey, floorMs } = courseFloorFor(doc, null);
  assert.equal(floorMs, routeFloorMs(doc));
  assert.equal(floorKey, courseKey(doc));
});

test("cosmetic edits cannot move the fingerprint", () => {
  const doc = course();
  const key = courseKey(doc);

  // Everything in a part tuple except x, y, z: shape, colour, finish, rotation.
  const repainted = doc.parts.map(
    (p) => [p[0], p[1], p[2], 1, (p[4] + 7) % 32, 3, (p[6] + 1) % 4] as PartTuple
  );
  assert.equal(courseKey(edit(doc, { parts: repainted })), key);

  // And everything outside the parts array that the solver never reads.
  assert.equal(courseKey(edit(doc, { name: "Renamed" })), key);
  assert.equal(courseKey(edit(doc, { sky: doc.sky + 1 })), key);
  assert.equal(courseKey(edit(doc, { spawnYaw: 2.5 })), key);
  assert.equal(
    courseKey(edit(doc, { checkpoints: [{ pos: [1, 2, 3], yaw: 0 }] })),
    key
  );
  assert.equal(
    courseKey(
      edit(doc, {
        props: [{ assetId: "tree", pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] }],
      })
    ),
    key
  );
});

test("the parts are a set, so reordering them is not a change", () => {
  const doc = course();
  const reversed = [...doc.parts].reverse();
  assert.notDeepEqual(reversed, doc.parts, "the fixture must have >1 part");
  assert.equal(courseKey(edit(doc, { parts: reversed })), courseKey(doc));
});

test("moving one block, the spawn or the goal does move it", () => {
  const doc = course();
  const key = courseKey(doc);

  const moved = doc.parts.map((p, i) =>
    i === 0 ? ([p[0] + 1, p[1], p[2], p[3], p[4], p[5], p[6]] as PartTuple) : p
  );
  assert.notEqual(courseKey(edit(doc, { parts: moved })), key);

  const [x, y, z] = doc.spawn;
  assert.notEqual(courseKey(edit(doc, { spawn: [x + 1, y, z] })), key);
  assert.notEqual(courseKey(edit(doc, { goal: [x + 1, y, z] })), key);

  // Deleting a block is a change even when the survivors hash the same way.
  assert.notEqual(courseKey(edit(doc, { parts: doc.parts.slice(1) })), key);
});

test("a spawn nudged inside its own cell is the same input, and the same key", () => {
  // The coupling to `surfaceUnder`, which floors x and z and rounds y before
  // it looks anything up. If that derivation ever changes, `cellOf` has to
  // change with it and this is what fails.
  const doc = course();
  const [x, y, z] = doc.spawn;
  const nudged = edit(doc, { spawn: [Math.floor(x) + 0.4, Math.round(y) + 0.2, Math.floor(z) + 0.4] });
  const flush = edit(doc, { spawn: [Math.floor(x), Math.round(y), Math.floor(z)] });
  assert.equal(courseKey(nudged), courseKey(flush));
  assert.equal(routeFloorMs(nudged), routeFloorMs(flush));
});

test("a matching fingerprint reuses the stored floor rather than re-solving", () => {
  const doc = course();
  const key = courseKey(doc);
  // A floor that is not the solver's answer: if it comes back, nothing solved.
  const stored = { floorKey: key, floorMs: 12_345 };
  assert.deepEqual(courseFloorFor(doc, stored), stored);

  // A repaint keeps it. A moved block does not.
  const repainted = edit(doc, {
    parts: doc.parts.map((p) => [p[0], p[1], p[2], p[3], 9, 2, p[6]] as PartTuple),
  });
  assert.equal(courseFloorFor(repainted, stored).floorMs, 12_345);

  const moved = edit(doc, {
    parts: doc.parts.map((p, i) =>
      i === 0 ? ([p[0], p[1] + 4, p[2], p[3], p[4], p[5], p[6]] as PartTuple) : p
    ),
  });
  assert.notEqual(courseFloorFor(moved, stored).floorMs, 12_345);
});

test("a stored key with no floor beside it is not trusted", () => {
  // How a row looks after a goal was placed somewhere nothing can reach: the
  // next save must try again rather than cache the verdict.
  const doc = course();
  const solved = courseFloorFor(doc, { floorKey: courseKey(doc), floorMs: null });
  assert.equal(solved.floorMs, routeFloorMs(doc));
});

test("a goal nothing can reach is not a course", () => {
  // Out over empty space, where `surfaceUnder` finds no column at all. Note
  // that a goal floating high ABOVE the course is not this case: it resolves
  // down onto whatever it is over, which is how a goal sits on a pad.
  const doc = edit(course(), { goal: [500, 1, 500] });
  assert.equal(routeFloorMs(doc), null, "the fixture must be genuinely unreachable");
  assert.deepEqual(courseFloorFor(doc, null), NOT_A_COURSE);
});

test("the floor only moves when there was one and it changed", () => {
  assert.equal(floorMoved(20_000, 20_000), false);
  assert.equal(floorMoved(20_000, 21_000), true);
  assert.equal(floorMoved(20_000, null), true, "losing the goal is a change");
  assert.equal(floorMoved(null, 20_000), false, "there was no board to wipe");
  assert.equal(floorMoved(null, null), false);
});
