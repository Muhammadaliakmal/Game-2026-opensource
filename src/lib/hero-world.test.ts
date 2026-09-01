import test from "node:test";
import assert from "node:assert/strict";
import { heroParts, heroWorldDoc, HERO_SPAWN } from "./hero-world";
import { parseWorldDoc } from "./worlddoc";

/**
 * The hero sits above the fold on a marketing page, so its budget is the
 * tightest in the app: it has to be a real world, and it has to be small.
 */

test("the hero world is a valid doc a visitor can also keep", () => {
  const doc = heroWorldDoc(heroParts(), "new");
  assert.doesNotThrow(() => parseWorldDoc(doc));
  assert.deepEqual(doc.spawn, HERO_SPAWN);
});

test("the hero world stays small enough for a landing page", () => {
  const parts = heroParts();
  assert.ok(parts.length > 100, "it must look built, not empty");
  assert.ok(parts.length < 900, `hero is ${parts.length} parts — too heavy`);
});

test("the hero world is deterministic and sits on the grid", () => {
  const a = heroParts();
  const b = heroParts();
  assert.deepEqual(a, b);
  for (const p of a) assert.ok(p[1] >= 0, `part below the floor at y=${p[1]}`);
});
