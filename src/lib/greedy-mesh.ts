export interface Box {
  min: [number, number, number];
  size: [number, number, number];
}

/**
 * Merge contiguous solid cells into a handful of large boxes, so the physics
 * engine gets tens of colliders instead of thousands of unit cuboids.
 *
 * Greedy in X, then Y, then Z: grow a run along X, extend that run upward
 * while every cell in the row is free, then push the whole slab along Z while
 * every cell in it is free. Claimed cells are marked done so no cell is ever
 * covered twice.
 */
export function greedyBoxes(solid: Set<string>): Box[] {
  const has = (x: number, y: number, z: number) => solid.has(`${x},${y},${z}`);
  const done = new Set<string>();
  const out: Box[] = [];

  // Sorted so output is deterministic regardless of Set insertion order —
  // otherwise the same world can produce different colliders run to run.
  const keys = [...solid].sort();

  for (const key of keys) {
    if (done.has(key)) continue;
    const [x, y, z] = key.split(",").map(Number);
    const free = (i: number, j: number, k: number) =>
      has(i, j, k) && !done.has(`${i},${j},${k}`);

    // grow +X
    let w = 1;
    while (free(x + w, y, z)) w++;

    // grow +Y across the whole width
    let h = 1;
    outerY: while (true) {
      for (let i = 0; i < w; i++) {
        if (!free(x + i, y + h, z)) break outerY;
      }
      h++;
    }

    // grow +Z across the whole w x h slab
    let d = 1;
    outerZ: while (true) {
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          if (!free(x + i, y + j, z + d)) break outerZ;
        }
      }
      d++;
    }

    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        for (let k = 0; k < d; k++) {
          done.add(`${x + i},${y + j},${z + k}`);
        }
      }
    }

    out.push({ min: [x, y, z], size: [w, h, d] });
  }

  return out;
}

import type { PartTuple } from "./worlddoc";

export interface WorldColliders {
  /** Merged boxes covering every full-cube block. */
  boxes: Box[];
  /** Non-cube shapes, which can't be box-merged and get their own collider each. */
  others: PartTuple[];
}

/**
 * Split parts into what can be merged and what can't.
 *
 * Only shape 0 (the full cube) fills its cell, so only those are safe to merge —
 * merging a slab into a box would silently give it a full-height collider and
 * the player would walk on invisible geometry. Ramps, slabs and wedges are far
 * fewer, so one collider each is cheap.
 */
export function buildColliders(parts: Iterable<PartTuple>): WorldColliders {
  const solid = new Set<string>();
  const others: PartTuple[] = [];

  for (const p of parts) {
    if (p[3] === 0) solid.add(`${p[0]},${p[1]},${p[2]}`);
    else others.push(p);
  }

  return { boxes: greedyBoxes(solid), others };
}
