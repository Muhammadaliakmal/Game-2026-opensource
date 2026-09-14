import { test } from "node:test";
import assert from "node:assert/strict";
import { COTTAGE, NATURAL, NEON, TRACK, dressParts, surfaceIndex } from "./surface-dressing";
import { BUILT_IN_WORLDS } from "./built-in-worlds";
import { textureOf, type PartTuple } from "./worlddoc";

test("dressing sets a surface by colour on matte and metal blocks only", () => {
  const parts: PartTuple[] = [
    [0, 0, 0, 0, 24, 0, 0], // matte grass green
    [1, 0, 0, 0, 24, 3, 0], // emissive: a marker, stays clean
    [2, 0, 0, 0, 24, 1, 0], // glossy: glass, stays clean
    [3, 0, 0, 0, 18, 2, 0], // metal finish takes plate
    [4, 0, 0, 0, 24, 0, 0, surfaceIndex("bark")], // already specific
    [5, 0, 0, 0, 13, 0, 0], // blossom pink: not in the map
  ];
  const out = dressParts(parts, { ...NATURAL, 18: "metal" });
  assert.equal(textureOf(out[0]), surfaceIndex("grass"));
  assert.equal(out[1].length, 7);
  assert.equal(out[2].length, 7);
  assert.equal(textureOf(out[3]), surfaceIndex("metal"));
  assert.equal(textureOf(out[4]), surfaceIndex("bark"));
  assert.equal(out[5].length, 7);
  // Never in place: the generators hand out fresh arrays and so does this.
  assert.notEqual(out[0], parts[0]);
});

test("every dressing names surfaces that exist", () => {
  for (const d of [NATURAL, COTTAGE, NEON, TRACK]) {
    for (const name of Object.values(d)) assert.ok(name && surfaceIndex(name) > 0);
  }
});

test("every shipped world comes out dressed", () => {
  // The whole point: a player opening any built-in world sees surfaces.
  for (const w of BUILT_IN_WORLDS) {
    const doc = w.build("user_test");
    const dressed = doc.parts.filter((p) => textureOf(p) > 0).length;
    assert.ok(
      dressed > doc.parts.length * 0.3,
      `${w.slug}: only ${dressed} of ${doc.parts.length} parts carry a surface`
    );
  }
});
