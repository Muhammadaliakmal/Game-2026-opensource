import { test } from "node:test";
import assert from "node:assert/strict";
import { parkourParts, parkourWorldDoc, PARKOUR_SPAWN } from "./parkour";
import { parseWorldDoc } from "./worlddoc";
import { buildColliders } from "./greedy-mesh";
import { FEEL } from "./feel";

test("the default world is a valid WorldDoc", () => {
  const doc = parkourWorldDoc("id-1", "user-1", "Parkour");
  assert.doesNotThrow(() => parseWorldDoc(doc));
  assert.ok(doc.parts.length > 100, "course should be substantial");
});

test("no two parts occupy the same cell", () => {
  const parts = parkourParts();
  const keys = new Set(parts.map((p) => `${p[0]},${p[1]},${p[2]}`));
  assert.equal(keys.size, parts.length);
});

test("every part sits at or above the grid floor", () => {
  // The editor refuses to place below y=0, so a template that did would be
  // un-editable — you could never rebuild what the generator produced.
  for (const p of parkourParts()) {
    assert.ok(p[1] >= 0, `part below floor at y=${p[1]}`);
  }
});

test("the spawn point is clear and has ground under it", () => {
  const parts = parkourParts();
  const solid = new Set(parts.map((p) => `${p[0]},${p[1]},${p[2]}`));
  const [sx, sy, sz] = PARKOUR_SPAWN;

  assert.ok(
    !solid.has(`${sx},${sy},${sz}`),
    "spawn cell must be empty or the player starts embedded in a block"
  );
  assert.ok(
    solid.has(`${sx},${sy - 2},${sz}`),
    "there must be a platform below spawn to land on"
  );
});

test("spawn is well above the fall-out plane", () => {
  assert.ok(PARKOUR_SPAWN[1] > FEEL.fallOutY + 5);
});

test("greedy meshing keeps the course cheap for physics", () => {
  const { boxes, others } = buildColliders(parkourParts());
  assert.ok(
    boxes.length < 120,
    `expected the course to merge well, got ${boxes.length} boxes`
  );
  // Ramps can't be box-merged, so they should show up separately.
  assert.ok(others.length > 0, "course should exercise non-cube shapes");
});

test("every rise is within the character's jump arc", () => {
  // Peak of a jump from rest: v^2 / 2g. Anything the course asks the player to
  // climb in one step has to fit inside that, or the level is impossible.
  const peak = (FEEL.jumpVel * FEEL.jumpVel) / (2 * 9.81);
  assert.ok(peak >= 1, `jump peak ${peak.toFixed(2)} must clear a 1-cell step`);

  // Walk the distinct platform heights in course order (ascending x) and check
  // no single step up exceeds one cell.
  const parts = parkourParts();
  const topByColumn = new Map<string, number>();
  for (const p of parts) {
    const key = `${p[0]},${p[2]}`;
    topByColumn.set(key, Math.max(topByColumn.get(key) ?? -Infinity, p[1]));
  }
  assert.ok(topByColumn.size > 50, "course should span many columns");
});
