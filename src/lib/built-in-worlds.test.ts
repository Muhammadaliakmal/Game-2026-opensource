import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_WORLDS,
  buildBuiltInDoc,
  isBuiltInWorld,
} from "./built-in-worlds";
import { parseWorldDoc } from "./worlddoc";
import { buildColliders } from "./greedy-mesh";
import { gardenParts, GARDEN_SPAWN } from "./garden";
import { FEEL } from "./feel";

test("every built-in world produces a valid WorldDoc", () => {
  for (const w of BUILT_IN_WORLDS) {
    const doc = w.build("user-1");
    assert.doesNotThrow(() => parseWorldDoc(doc), `${w.slug} should validate`);
    assert.equal(doc.id, w.slug);
    assert.ok(doc.parts.length > 100, `${w.slug} should have content`);
  }
});

test("built-in slugs are recognised and unknown ids are not", () => {
  assert.ok(isBuiltInWorld("parkour"));
  assert.ok(isBuiltInWorld("garden"));
  assert.equal(isBuiltInWorld("00000000-0000-0000-0000-000000000000"), false);
  assert.equal(buildBuiltInDoc("nope", "user-1"), null);
});

test("built-in worlds are deterministic", () => {
  // They're regenerated per request rather than stored, so any randomness
  // would mean the world rearranged itself between the editor and play mode.
  for (const w of BUILT_IN_WORLDS) {
    const a = w.build("user-1");
    const b = w.build("user-1");
    assert.deepEqual(a.parts, b.parts, `${w.slug} must generate identically`);
  }
});

test("the garden stays under the part ceiling", () => {
  const parts = gardenParts();
  assert.ok(parts.length < 50000, `garden has ${parts.length} parts`);
  assert.ok(parts.length > 2000, "garden should feel like a landscape");
});

test("garden terrain never dips below the grid floor", () => {
  for (const p of gardenParts()) {
    assert.ok(p[1] >= 0, `part below floor at y=${p[1]}`);
  }
});

test("the garden spawn is clear and above solid ground", () => {
  const solid = new Set(gardenParts().map((p) => `${p[0]},${p[1]},${p[2]}`));
  const [sx, sy, sz] = GARDEN_SPAWN;

  assert.ok(!solid.has(`${sx},${sy},${sz}`), "spawn cell must be empty");
  assert.ok(sy > FEEL.fallOutY + 5, "spawn must sit above the fall-out plane");

  // Something solid somewhere below, or the player spawns into a bottomless drop.
  let ground = false;
  for (let y = sy - 1; y >= 0; y--) {
    if (solid.has(`${sx},${y},${sz}`)) {
      ground = true;
      break;
    }
  }
  assert.ok(ground, "there must be ground under the garden spawn");
});

test("the garden merges into a sane number of colliders", () => {
  const { boxes } = buildColliders(gardenParts());
  assert.ok(boxes.length < 4000, `garden merged to ${boxes.length} boxes`);
});
