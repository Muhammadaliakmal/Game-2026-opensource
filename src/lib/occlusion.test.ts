import test from "node:test";
import assert from "node:assert/strict";
import {
  isEnclosed,
  countEnclosed,
  occlusionIndex,
  partsByCell,
} from "./occlusion";
import { BUILT_IN_WORLDS } from "./built-in-worlds";
import type { PartTuple, Shape } from "./worlddoc";

const BLOCK: Shape = 0;
const SLAB: Shape = 1;
const RAMP: Shape = 2;
const WEDGE: Shape = 3;

/** A part at a cell, of a given shape; colour and finish are irrelevant here. */
const at = (x: number, y: number, z: number, shape: Shape = BLOCK): PartTuple => [
  x,
  y,
  z,
  shape,
  0,
  0,
  0,
];

/** The six cells sharing a face with the origin, as full cubes. */
const shell = (shape: Shape = BLOCK): PartTuple[] => [
  at(1, 0, 0, shape),
  at(-1, 0, 0, shape),
  at(0, 1, 0, shape),
  at(0, -1, 0, shape),
  at(0, 0, 1, shape),
  at(0, 0, -1, shape),
];

test("a block on its own is visible", () => {
  const cells = partsByCell([at(0, 0, 0)]);
  assert.equal(isEnclosed(cells, 0, 0, 0), false);
});

test("a block walled in on all six sides is not drawn", () => {
  const cells = partsByCell([at(0, 0, 0), ...shell()]);
  assert.equal(isEnclosed(cells, 0, 0, 0), true);
});

test("five sides is not six — one open face is still a visible face", () => {
  for (let missing = 0; missing < 6; missing++) {
    const around = shell().filter((_, i) => i !== missing);
    const cells = partsByCell([at(0, 0, 0), ...around]);
    assert.equal(
      isEnclosed(cells, 0, 0, 0),
      false,
      `face ${missing} was open and the block was culled anyway`
    );
  }
});

/*
 * The asymmetry that matters. A slab is half height and a ramp and a wedge are
 * cut away on the diagonal, so each leaves an opening its neighbour is plainly
 * visible through — none of them may hide anything. All three may themselves
 * be hidden, because each fits inside the cell.
 */
for (const [name, shape] of [
  ["a slab", SLAB],
  ["a ramp", RAMP],
  ["a wedge", WEDGE],
] as const) {
  test(`${name} does not seal the cell behind it`, () => {
    const around = shell();
    around[0] = at(1, 0, 0, shape);
    const cells = partsByCell([at(0, 0, 0), ...around]);
    assert.equal(isEnclosed(cells, 0, 0, 0), false);
  });

  test(`${name} is itself hidden when the cubes close over it`, () => {
    const cells = partsByCell([at(0, 0, 0, shape), ...shell()]);
    assert.equal(isEnclosed(cells, 0, 0, 0), true);
  });
}

test("touching at an edge or a corner is not touching at a face", () => {
  /*
   * Only the six face neighbours can hide a face. The other twenty cells of
   * the 3x3x3 block around it meet it along an edge or at a point and hide
   * nothing, so a block packed in by all of them and none of the six is still
   * fully visible. Worth pinning: a 26-neighbourhood is the natural mistake
   * here, and it would cull blocks with six faces open to the air.
   */
  const diagonals: PartTuple[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const faces = Math.abs(x) + Math.abs(y) + Math.abs(z);
        if (faces > 1) diagonals.push(at(x, y, z));
      }
  assert.equal(diagonals.length, 20);

  const cells = partsByCell([at(0, 0, 0), ...diagonals]);
  assert.equal(isEnclosed(cells, 0, 0, 0), false);
});

/*
 * Regression pins on the worlds this was written for. Exact counts would break
 * on any tweak to a generator, so these assert the shape of the answer: the
 * flat circuit has no interior to win back, and the two solid worlds have a
 * large one. If Island ever stops being mostly solid these numbers should be
 * revisited rather than relaxed.
 */
test("the flat circuit has no hidden interior, so nothing changes for it", () => {
  const doc = BUILT_IN_WORLDS.find((w) => w.slug === "circuit")!.build("test");
  assert.equal(countEnclosed(partsByCell(doc.parts)), 0);
});

test("Island is mostly interior, and Vapor Ridge has a real one", () => {
  const island = BUILT_IN_WORLDS.find((w) => w.slug === "island")!.build("test");
  const ridge = BUILT_IN_WORLDS.find((w) => w.slug === "ridge")!.build("test");

  const islandHidden = countEnclosed(partsByCell(island.parts));
  const ridgeHidden = countEnclosed(partsByCell(ridge.parts));

  assert.ok(
    islandHidden / island.parts.length > 0.4,
    `island: ${islandHidden}/${island.parts.length} enclosed`
  );
  assert.ok(
    ridgeHidden > 500,
    `ridge: ${ridgeHidden}/${ridge.parts.length} enclosed`
  );
});

test("a hidden part is only ever hidden by cubes that are really there", () => {
  // The property the renderer leans on, checked against every built-in world:
  // whatever is culled has six full-cube neighbours present in the same set.
  for (const w of BUILT_IN_WORLDS) {
    const cells = partsByCell(w.build("test").parts);
    for (const p of cells.values()) {
      if (!isEnclosed(cells, p[0], p[1], p[2])) continue;
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        const n = cells.get(`${p[0] + dx},${p[1] + dy},${p[2] + dz}`);
        assert.ok(n, `${w.slug}: culled ${p[0]},${p[1]},${p[2]} with a gap`);
        assert.equal(n[3], BLOCK, `${w.slug}: culled behind a non-cube`);
      }
    }
  }
});

/*
 * The renderer uses `occlusionIndex`, not `isEnclosed`. The two are separate
 * implementations of one rule — a flat padded byte grid against six hashed
 * lookups — so the thing worth testing is that they never disagree. If a
 * future change to the grid's indexing is wrong, this is what catches it.
 */
test("the fast index and the plain predicate agree on every built-in world", () => {
  for (const w of BUILT_IN_WORLDS) {
    const cells = partsByCell(w.build("test").parts);
    const index = occlusionIndex(cells);
    let hidden = 0;
    for (const p of cells.values()) {
      const fast = index.hidden(p[0], p[1], p[2]);
      const plain = isEnclosed(cells, p[0], p[1], p[2]);
      assert.equal(fast, plain, `${w.slug} disagrees at ${p[0]},${p[1]},${p[2]}`);
      if (plain) hidden++;
    }
    assert.equal(index.count, hidden, `${w.slug}: count is not the tally`);
  }
});

test("the index agrees on a hand-built solid cube, inside and out", () => {
  // A 5x5x5 solid: the 3x3x3 core is enclosed, the 98-block shell is not.
  const parts: PartTuple[] = [];
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 5; z++) parts.push(at(x, y, z));

  const cells = partsByCell(parts);
  const index = occlusionIndex(cells);
  assert.equal(index.count, 27);

  for (const p of cells.values()) {
    const inner = [p[0], p[1], p[2]].every((v) => v > 0 && v < 4);
    assert.equal(index.hidden(p[0], p[1], p[2]), inner);
    assert.equal(isEnclosed(cells, p[0], p[1], p[2]), inner);
  }
});

test("a cell nobody built is visible, wherever it is asked about", () => {
  // Both inside the indexed box and far outside it — the second is the probe
  // that would read past the end of the grid if the bounds check were missing.
  const parts: PartTuple[] = [];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      for (let z = 0; z < 3; z++) parts.push(at(x, y, z));
  const index = occlusionIndex(partsByCell(parts));

  assert.equal(index.hidden(1, 1, 1), true); // the one real core cell
  assert.equal(index.hidden(9, 9, 9), false);
  assert.equal(index.hidden(-9, -9, -9), false);
  assert.equal(index.hidden(1_000_000, 0, 0), false);
});

test("an empty world indexes without allocating anything", () => {
  const index = occlusionIndex(new Map());
  assert.equal(index.count, 0);
  assert.equal(index.hidden(0, 0, 0), false);
});

test("two blocks a long way apart are not worth a grid, and are not culled", () => {
  // Past MAX_GRID_CELLS the index declines rather than allocating terabytes.
  // The claim it makes when it declines — "nothing here is hidden" — is also
  // true, which is why declining is safe: a world this sparse is all surface.
  const cells = partsByCell([at(0, 0, 0), at(4000, 4000, 4000)]);
  const index = occlusionIndex(cells);
  assert.equal(index.count, 0);
  assert.equal(index.hidden(0, 0, 0), false);
  assert.equal(isEnclosed(cells, 0, 0, 0), false);
});

/*
 * ── The safety argument, as a test ───────────────────────────────────────
 *
 * "No visual cost" is a claim about pixels, and there is no renderer here to
 * count them. But the claim reduces to something exact that can be checked:
 *
 *   A face of a part is visible only if the cell it faces is not a full cube.
 *   A culled part has full cubes on all six sides, so it contributes no
 *   visible face. Therefore the set of visible faces is the same either way.
 *
 * So rather than assert the definition back at itself, enumerate every visible
 * face of every built-in world with culling off and with it on, and require the
 * two sets to be identical. That is the whole of what the renderer draws, at
 * face granularity, and it is what makes this a removal of work rather than a
 * quality setting.
 *
 * The granularity is the honest limit: it says nothing about the chamfer void
 * along a four-block edge, which is discussed in occlusion.ts and which exists
 * with or without this.
 */
test("culling removes no visible face from any built-in world", () => {
  const FACES = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const;

  for (const w of BUILT_IN_WORLDS) {
    const cells = partsByCell(w.build("test").parts);
    const index = occlusionIndex(cells);

    // A face is identified by the cell it belongs to and the way it points, so
    // two parts can never be confused for one another.
    const visibleFaces = (cull: boolean) => {
      const faces = new Set<string>();
      for (const p of cells.values()) {
        if (cull && index.hidden(p[0], p[1], p[2])) continue;
        for (const [dx, dy, dz] of FACES) {
          const n = cells.get(`${p[0] + dx},${p[1] + dy},${p[2] + dz}`);
          if (n?.[3] === BLOCK) continue; // sealed by a full cube
          faces.add(`${p[0]},${p[1]},${p[2]}:${dx},${dy},${dz}`);
        }
      }
      return faces;
    };

    const before = visibleFaces(false);
    const after = visibleFaces(true);
    assert.equal(
      after.size,
      before.size,
      `${w.slug}: ${before.size} visible faces became ${after.size}`
    );
    for (const f of before) assert.ok(after.has(f), `${w.slug}: lost face ${f}`);
  }
});
