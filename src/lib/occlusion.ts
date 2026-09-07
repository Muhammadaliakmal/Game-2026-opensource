import { keyOf } from "./cell-key";
import type { PartTuple } from "./worlddoc";

/**
 * Which blocks are sealed inside a solid mass, and so are never worth drawing.
 *
 * ── The problem ──────────────────────────────────────────────────────────
 *
 * `InstancedParts` draws every part in the world. That is the right default
 * for a build tool — anything can be exposed by the next click — but it means
 * a block with solid neighbours on all six sides is submitted to the camera
 * pass and, unless its bucket is ground, to the shadow pass as well, to paint
 * no pixels in either. At `blockDetail` 2 that is 300 triangles twice over,
 * per buried block, per frame.
 *
 * It is not a rare case. Island is 5,763 parts and 2,594 of them — 45% — are
 * enclosed, because a hill drawn as solid terrain is mostly interior. Vapor
 * Ridge fills solid beneath every raised surface and contributes 940.
 *
 * This is the same class of win as `groundCastsShadow` in lib/quality.ts: not
 * a quality trade, a removal of work whose output was never visible.
 *
 * ── Why only a full cube may occlude ─────────────────────────────────────
 *
 * The four shapes are not interchangeable here, and the asymmetry matters:
 *
 *  - ANY shape may be *culled*, because a slab, ramp and wedge each fit inside
 *    the unit cell — if the cell is invisible, so is anything drawn in it.
 *  - Only shape 0, the full cube, may *occlude*. A slab is half height, and a
 *    ramp and a wedge are cut away on the diagonal; each leaves an opening its
 *    neighbour is plainly visible through. Treating them as solid is what
 *    would put a hole in a hillside.
 *
 * ── The one honest caveat ────────────────────────────────────────────────
 *
 * Every shape is chamfered (BEVEL in components/editor/shapes.ts), so four
 * blocks meeting along an edge leave a void about `2 * BEVEL` across running
 * down it. That void is a property of the geometry and it runs through a solid
 * mass whether or not the interior is drawn — this does not open it. What
 * changes is what sits at the far end, and only within about 5 degrees of
 * looking straight down it, since a 0.09-wide gap through a 1.0-deep layer
 * closes at `atan(0.09)`. Off that axis the surviving shell hides it.
 */

/** The only shape that fills its cell. See SHAPE_NAMES in editor/shapes.ts. */
const FULL_CUBE = 0;

/** Is this cell occupied by something that fills it completely? */
function fills(parts: Map<string, PartTuple>, x: number, y: number, z: number) {
  return parts.get(keyOf(x, y, z))?.[3] === FULL_CUBE;
}

/**
 * Is the cell at (x, y, z) sealed in on all six sides?
 *
 * Written as a predicate over the store's cell-keyed map rather than as a
 * precomputed set, so the caller pays only for the parts it is already walking
 * and nothing is allocated. The `&&` chain short-circuits, and in a real world
 * most parts are surface and fail on the first or second test.
 */
export function isEnclosed(
  parts: Map<string, PartTuple>,
  x: number,
  y: number,
  z: number
): boolean {
  return (
    fills(parts, x, y - 1, z) &&
    fills(parts, x, y + 1, z) &&
    fills(parts, x + 1, y, z) &&
    fills(parts, x - 1, y, z) &&
    fills(parts, x, y, z + 1) &&
    fills(parts, x, y, z - 1)
  );
}

/**
 * How many of these parts are enclosed. For scripts and tests that want the
 * number rather than the decision.
 */
export function countEnclosed(parts: Map<string, PartTuple>): number {
  let n = 0;
  for (const p of parts.values()) if (isEnclosed(parts, p[0], p[1], p[2])) n++;
  return n;
}

/**
 * The largest occupancy grid worth allocating, in cells.
 *
 * The grid is one byte per cell of the world's bounding box, so it is bounded
 * by how far apart two blocks are and not by how many there are. Eight million
 * is a 200-cell cube — an order of magnitude past the biggest built-in world
 * (Vapor Ridge asks for 260 KB) and past anything a person builds by hand.
 * Beyond it the world is so spread out that it is nearly all surface anyway,
 * so declining to cull costs nothing real.
 */
const MAX_GRID_CELLS = 8_000_000;

export interface Occlusion {
  /** Is the cell at these coordinates sealed in on all six sides? */
  hidden(x: number, y: number, z: number): boolean;
  /** How many of the parts this was built from are hidden. */
  readonly count: number;
}

/** Nothing is hidden. Used when a grid would not be worth its memory. */
const NOTHING_HIDDEN: Occlusion = { hidden: () => false, count: 0 };

/**
 * Index the world once, so the renderer can ask about each part in constant
 * time without hashing anything.
 *
 * ── Why a dense byte grid rather than a hash of the occupied cells ───────
 *
 * The obvious implementation is `isEnclosed` above, run per part: six string
 * keys and six Map lookups. It is correct and it is the version the tests
 * check this one against — but it costs more than the whole rest of the
 * bucketing pass it would sit inside, which re-runs on every edit. Measured
 * over 50 runs of the real bucketing loop:
 *
 *                    bucket only   + Map lookups   + this
 *   Neon Circuit        1.29 ms        4.50 ms      0.71 ms
 *   Vapor Ridge         1.46 ms        7.07 ms      1.17 ms
 *   Island              0.84 ms        4.43 ms      0.47 ms
 *
 * Packing the coordinates into one integer key and using a `Set<number>` sits
 * between the two (1.74 ms on the ridge) and is not worth the arithmetic. The
 * win here is not the data structure being clever, it is that a neighbour is
 * a fixed offset away in a flat array, so the six probes are six adds and six
 * indexed byte reads with no hashing and no allocation per part.
 *
 * The grid is padded by one cell on every side, which is what lets those six
 * probes run unguarded: a part on the outer face of the world reads padding
 * rather than walking off the end.
 */
export function occlusionIndex(parts: Map<string, PartTuple>): Occlusion {
  if (parts.size === 0) return NOTHING_HIDDEN;

  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of parts.values()) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
    if (p[2] < z0) z0 = p[2];
    if (p[2] > z1) z1 = p[2];
  }

  const w = x1 - x0 + 3;
  const h = y1 - y0 + 3;
  const d = z1 - z0 + 3;
  if (w * h * d > MAX_GRID_CELLS) return NOTHING_HIDDEN;

  const grid = new Uint8Array(w * h * d);
  const sx = h * d;
  const sy = d;
  const index = (x: number, y: number, z: number) =>
    (x - x0 + 1) * sx + (y - y0 + 1) * sy + (z - z0 + 1);

  for (const p of parts.values()) {
    if (p[3] === FULL_CUBE) grid[index(p[0], p[1], p[2])] = 1;
  }

  const hidden = (x: number, y: number, z: number) => {
    // Anything outside the indexed box has empty space on every side of it, so
    // it is visible by definition — and its probes would be out of range.
    if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) return false;
    const i = index(x, y, z);
    return (
      grid[i + sy] === 1 &&
      grid[i - sy] === 1 &&
      grid[i + 1] === 1 &&
      grid[i - 1] === 1 &&
      grid[i + sx] === 1 &&
      grid[i - sx] === 1
    );
  };

  // Counted on demand, not up front. The renderer never asks — it tests each
  // part as it buckets it — and the tally is a second full pass over the
  // world, which on Neon Circuit is most of what building the index costs at
  // all and buys a number nothing on the hot path reads.
  let tally: number | null = null;

  return {
    hidden,
    get count() {
      if (tally === null) {
        tally = 0;
        for (const p of parts.values()) if (hidden(p[0], p[1], p[2])) tally++;
      }
      return tally;
    },
  };
}

/** The same map, keyed by cell, that the editor store holds. For tests. */
export function partsByCell(parts: Iterable<PartTuple>): Map<string, PartTuple> {
  const map = new Map<string, PartTuple>();
  for (const p of parts) map.set(keyOf(p[0], p[1], p[2]), p);
  return map;
}
