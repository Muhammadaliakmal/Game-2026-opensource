import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_WORLDS,
  buildBuiltInDoc,
  isBuiltInWorld,
} from "./built-in-worlds";
import { parseWorldDoc } from "./worlddoc";
import { buildColliders } from "./greedy-mesh";
import { GROUND_SIZE } from "@/components/editor/Ground";
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
  for (const w of BUILT_IN_WORLDS) assert.ok(isBuiltInWorld(w.slug));
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

test("every built-in world fits inside the buildable area", () => {
  // The editor clamps edits to the build plane, so anything outside it is
  // visible but impossible to erase or build against once the world is
  // remixed — and anything below y=0 is unreachable in the same way. More
  // than half the parkour course used to sit outside the old bounds.
  const HALF = GROUND_SIZE / 2;
  for (const w of BUILT_IN_WORLDS) {
    for (const p of w.build("user-1").parts) {
      assert.ok(p[1] >= 0, `${w.slug}: part below the grid floor at y=${p[1]}`);
      assert.ok(
        p[0] >= -HALF && p[0] < HALF && p[2] >= -HALF && p[2] < HALF,
        `${w.slug}: part outside the build plane at x=${p[0]} z=${p[2]}`
      );
    }
  }
});

test("no built-in world stacks two parts in one cell", () => {
  for (const w of BUILT_IN_WORLDS) {
    const seen = new Set<string>();
    for (const p of w.build("user-1").parts) {
      const key = `${p[0]},${p[1]},${p[2]}`;
      assert.ok(!seen.has(key), `${w.slug}: duplicate cell ${key}`);
      seen.add(key);
    }
  }
});

test("every built-in world stays cheap enough to stand up in Rapier", () => {
  // Colliders are built on load, before the world can be walked on, so a
  // world that merges badly is a world that hangs on entry.
  //
  // Two guards, because one number cannot say both things:
  //
  // - The RATIO is the real test of "merges badly", and it is the one that
  //   catches a regression. Turn the racing surface into slabs and it craters,
  //   because a slab is not a full cube and never merges with anything.
  // - The CEILING is about absolute load cost, and it necessarily scales with
  //   how big a world is allowed to be. It was 1200, set when the largest
  //   built-in was the island at 5.7k parts. Neon Circuit is deliberately
  //   larger than that, and merges better than the cottage does — so the old
  //   number was measuring size, not merge quality, which is not what the
  //   comment above says this test is for.
  for (const w of BUILT_IN_WORLDS) {
    const parts = w.build("user-1").parts;
    const { boxes, others } = buildColliders(parts);
    const colliders = boxes.length + others.length;
    const ratio = parts.length / colliders;

    assert.ok(
      ratio >= 3.5,
      `${w.slug}: merges badly — ${ratio.toFixed(2)} parts per collider ` +
        `(${colliders} colliders from ${parts.length} parts)`
    );
    assert.ok(
      colliders < 2500,
      `${w.slug}: ${colliders} colliders from ${parts.length} parts`
    );
  }
});
