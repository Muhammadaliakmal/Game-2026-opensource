import { FEEL } from "./feel";
import { airTime, canClear } from "./jump-arc";
import type { PartTuple, Vec3 } from "./worlddoc";

/**
 * A course as a graph of places you can stand.
 *
 * Built from the parts and the jump arc, and used for two things that sound
 * unrelated and are the same question asked twice:
 *
 *  - **Can this be finished?** `courses.test.ts` walks it to prove every
 *    shipped map has a route from its spawn to its goal, and that no
 *    checkpoint is a dead end.
 *  - **How fast could it be?** `par.ts` finds the cheapest route through it,
 *    which is what the medal times are derived from — so a course cannot be
 *    edited into something whose Author time is impossible, and nobody has to
 *    remember to retune a number after moving a pad.
 *
 * It walks surfaces, not the capsule: no air control, no momentum, no
 * geometry in the flight path. That makes it a sound *lower* bound on the time
 * and a sound *upper* bound on what is reachable — which is the direction both
 * callers need. It cannot tell you whether a course is fun.
 */

/** A place you can stand: a column, and the height of its top face. */
export interface Surface {
  x: number;
  z: number;
  /** Top face of the block, which is where the feet are. */
  y: number;
}

export const surfaceKey = (s: Surface) => `${s.x},${s.y},${s.z}`;

/**
 * Two cells of headroom.
 *
 * The capsule is 1.2 units tall (radius 0.3, half-height 0.3), so one cell is
 * not enough and three would rule out standing anywhere with a ceiling. None
 * of the shipped courses has a tunnel; if one ever does, this is the number
 * that decides whether it counts as a route.
 */
const HEADROOM = 2;

/**
 * Every standable surface, indexed twice.
 *
 * By cell for lookups, and by COLUMN for the search — a column has one or two
 * standable heights and the arc reaches thirty cells down, so scanning heights
 * blindly costs thirty lookups per candidate for nothing.
 */
export interface Surfaces {
  byCell: Map<string, Surface>;
  byColumn: Map<string, Surface[]>;
}

export function surfaces(parts: readonly PartTuple[]): Surfaces {
  const solid = new Set<string>();
  for (const p of parts) solid.add(`${p[0]},${p[1]},${p[2]}`);

  const byCell = new Map<string, Surface>();
  const byColumn = new Map<string, Surface[]>();
  for (const p of parts) {
    const [x, y, z] = p;
    let clear = true;
    for (let h = 1; h <= HEADROOM; h++) {
      if (solid.has(`${x},${y + h},${z}`)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const s: Surface = { x, z, y: y + 1 };
    byCell.set(surfaceKey(s), s);
    const col = `${x},${z}`;
    const at = byColumn.get(col);
    if (at) at.push(s);
    else byColumn.set(col, [s]);
  }
  return { byCell, byColumn };
}

/**
 * The furthest any single jump can carry the character, rounded up.
 *
 * Bounds the neighbour scan only — the arc decides the actual edges. Derived
 * rather than typed in, so raising `FEEL.jumpVel` cannot silently make the
 * search miss the very jumps it just enabled.
 */
export const SCAN = (() => {
  let r = 1;
  while (canClear(r, -30) && r < 40) r++;
  return r + 1;
})();

/** The gap, in empty cells, between two columns this far apart. */
const gapBetween = (dx: number, dz: number) =>
  Math.max(0, Math.hypot(dx, dz) - 1);

/** Every move out of `a`, with the seconds each one costs. */
function* moves(a: Surface, all: Surfaces): Generator<[Surface, number]> {
  for (let dx = -SCAN; dx <= SCAN; dx++) {
    for (let dz = -SCAN; dz <= SCAN; dz++) {
      if (dx === 0 && dz === 0) continue;
      const gap = gapBetween(dx, dz);
      const column = all.byColumn.get(`${a.x + dx},${a.z + dz}`);
      if (!column) continue;
      for (const b of column) {
        const rise = b.y - a.y;
        if (!canClear(gap, rise)) continue;
        // Walking is only an option onto a surface at the same height and
        // right next door; everything else is a jump, and a jump costs its
        // airtime however short the gap is.
        const adjacent = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
        const cost =
          adjacent && rise === 0
            ? Math.hypot(dx, dz) / FEEL.runSpeed
            : (airTime(rise) ?? Infinity);
        yield [b, cost];
      }
    }
  }
}

/** Everything reachable from `from`, by walking and jumping. */
export function reachable(from: Surface, all: Surfaces): Set<string> {
  const seen = new Set<string>([surfaceKey(from)]);
  const queue: Surface[] = [from];

  while (queue.length) {
    const a = queue.pop()!;
    for (const [b] of moves(a, all)) {
      const k = surfaceKey(b);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(b);
    }
  }
  return seen;
}

/**
 * Seconds along the cheapest route from `from` to `to`, or null if there is
 * none.
 *
 * Dijkstra with a linear scan for the frontier rather than a heap: the graphs
 * are a few hundred nodes, this runs at module load for five courses, and a
 * binary heap here would be code nobody needs to read.
 */
export function fastestRoute(
  from: Surface,
  to: Surface,
  all: Surfaces
): number | null {
  const target = surfaceKey(to);
  const best = new Map<string, number>([[surfaceKey(from), 0]]);
  const settled = new Set<string>();

  for (;;) {
    let node: Surface | null = null;
    let nodeKey = "";
    let nodeCost = Infinity;
    for (const [k, cost] of best) {
      if (settled.has(k) || cost >= nodeCost) continue;
      node = all.byCell.get(k)!;
      nodeKey = k;
      nodeCost = cost;
    }
    if (!node) return null;
    if (nodeKey === target) return nodeCost;
    settled.add(nodeKey);

    for (const [b, cost] of moves(node, all)) {
      const k = surfaceKey(b);
      if (settled.has(k)) continue;
      const next = nodeCost + cost;
      if (next < (best.get(k) ?? Infinity)) best.set(k, next);
    }
  }
}

/** The surface a world position stands on — the one directly under the feet. */
export function surfaceUnder(pos: Vec3, all: Surfaces): Surface | null {
  const x = Math.floor(pos[0]);
  const z = Math.floor(pos[2]);
  for (let y = Math.round(pos[1]); y >= 0; y--) {
    const s = all.byCell.get(`${x},${y},${z}`);
    if (s) return s;
  }
  return null;
}
