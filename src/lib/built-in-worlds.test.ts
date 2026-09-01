import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_WORLDS,
  buildBuiltInDoc,
  isBuiltInWorld,
} from "./built-in-worlds";
import { parseWorldDoc } from "./worlddoc";
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
  assert.equal(isBuiltInWorld("garden"), false); // removed; must not resurrect
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

test("every built-in world spawns the player above solid ground", () => {
  // A spawn with nothing under it is a bottomless drop on first load, and a
  // spawn inside a block wedges the character. Both are silent until someone
  // presses Play, so they are worth asserting for every world we ship.
  for (const w of BUILT_IN_WORLDS) {
    const doc = w.build("user-1");
    const solid = new Set(doc.parts.map((p) => `${p[0]},${p[1]},${p[2]}`));
    const [sx, sy, sz] = doc.spawn;
    const cx = Math.floor(sx);
    const cz = Math.floor(sz);

    assert.ok(
      !solid.has(`${cx},${Math.floor(sy)},${cz}`),
      `${w.slug}: spawn cell must be empty`
    );
    assert.ok(
      sy > FEEL.fallOutY + 5,
      `${w.slug}: spawn must sit above the fall-out plane`
    );

    let ground = false;
    for (let y = Math.floor(sy) - 1; y >= 0; y--) {
      if (solid.has(`${cx},${y},${cz}`)) {
        ground = true;
        break;
      }
    }
    assert.ok(ground, `${w.slug}: there must be ground under the spawn`);
  }
});
