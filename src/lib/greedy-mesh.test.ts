import { test } from "node:test";
import assert from "node:assert/strict";
import { greedyBoxes, buildColliders } from "./greedy-mesh";
import type { PartTuple } from "./worlddoc";

/** Every solid cell must end up inside exactly one emitted box. */
function assertExactCover(cells: string[], boxes: ReturnType<typeof greedyBoxes>) {
  const covered = new Set<string>();
  for (const b of boxes) {
    for (let i = 0; i < b.size[0]; i++) {
      for (let j = 0; j < b.size[1]; j++) {
        for (let k = 0; k < b.size[2]; k++) {
          const key = `${b.min[0] + i},${b.min[1] + j},${b.min[2] + k}`;
          assert.ok(!covered.has(key), `cell ${key} covered twice`);
          covered.add(key);
        }
      }
    }
  }
  assert.deepEqual([...covered].sort(), [...cells].sort());
}

test("a single cell yields one 1x1x1 box", () => {
  const boxes = greedyBoxes(new Set(["0,0,0"]));
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0], { min: [0, 0, 0], size: [1, 1, 1] });
});

test("a solid 4x4x4 cube merges into a single box", () => {
  const cells: string[] = [];
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++) cells.push(`${x},${y},${z}`);

  const boxes = greedyBoxes(new Set(cells));
  assert.equal(boxes.length, 1, "64 cells should collapse to one box");
  assert.deepEqual(boxes[0], { min: [0, 0, 0], size: [4, 4, 4] });
});

test("a 20x1x20 floor collapses to one box", () => {
  const cells: string[] = [];
  for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) cells.push(`${x},0,${z}`);

  const boxes = greedyBoxes(new Set(cells));
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0].size, [20, 1, 20]);
});

test("disjoint cells stay separate and every cell is covered exactly once", () => {
  const cells = ["0,0,0", "5,0,0", "5,0,1"];
  const boxes = greedyBoxes(new Set(cells));
  assert.equal(boxes.length, 2);
  assertExactCover(cells, boxes);
});

test("an L shape covers every cell exactly once", () => {
  const cells = ["0,0,0", "1,0,0", "2,0,0", "0,1,0", "0,2,0"];
  assertExactCover(cells, greedyBoxes(new Set(cells)));
});

test("a 2000-block world reduces to well under 100 colliders", () => {
  // 20 x 5 x 20 = 2000 cells, the acceptance target from SPEC.md Phase 2.
  const cells: string[] = [];
  for (let x = 0; x < 20; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 20; z++) cells.push(`${x},${y},${z}`);

  const boxes = greedyBoxes(new Set(cells));
  assert.ok(boxes.length < 100, `expected <100 boxes, got ${boxes.length}`);
  assertExactCover(cells, boxes);
});

test("only full cubes are merged; other shapes are kept separate", () => {
  const parts: PartTuple[] = [
    [0, 0, 0, 0, 0, 0, 0], // block
    [1, 0, 0, 0, 0, 0, 0], // block
    [2, 0, 0, 1, 0, 0, 0], // slab — must not be merged into a full-height box
    [3, 0, 0, 2, 0, 0, 0], // ramp
  ];
  const { boxes, others } = buildColliders(parts);

  assert.equal(others.length, 2, "slab and ramp get their own colliders");
  // The two blocks merge; the slab's cell must not appear in any box.
  const covered = new Set<string>();
  for (const b of boxes)
    for (let i = 0; i < b.size[0]; i++)
      covered.add(`${b.min[0] + i},${b.min[1]},${b.min[2]}`);
  assert.ok(!covered.has("2,0,0"), "slab cell must not be inside a merged box");
  assert.deepEqual([...covered].sort(), ["0,0,0", "1,0,0"]);
});
