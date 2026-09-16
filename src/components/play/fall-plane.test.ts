import { test } from "node:test";
import assert from "node:assert/strict";
import { FEEL } from "@/lib/feel";
import type { PartTuple } from "@/lib/worlddoc";
import { FALL_MARGIN, fallPlaneFor } from "./fall-plane";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";

const part = (x: number, y: number, z: number): PartTuple => [x, y, z, 0, 0, 0, 0];

test("the plane sits a margin under the lowest block, never under the old floor", () => {
  const high = new Map([["a", part(0, 4, 0)], ["b", part(1, 9, 0)]]);
  assert.equal(fallPlaneFor(high), 4 - FALL_MARGIN);
  const deep = new Map([["a", part(0, -30, 0)]]);
  assert.equal(fallPlaneFor(deep), FEEL.fallOutY);
  assert.equal(fallPlaneFor(new Map()), FEEL.fallOutY);
});

test("every shipped world's spawn is well above its own plane", () => {
  for (const w of BUILT_IN_WORLDS) {
    const doc = w.build("test");
    const parts = new Map<string, PartTuple>();
    doc.parts.forEach((p, i) => parts.set(String(i), p));
    const plane = fallPlaneFor(parts);
    assert.ok(doc.spawn[1] > plane + FALL_MARGIN, `${w.slug}: spawn ${doc.spawn[1]} vs plane ${plane}`);
    assert.ok(plane > FEEL.fallOutY, `${w.slug}: the plane should be higher than the old floor`);
  }
});
