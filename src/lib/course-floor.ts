import { routeFloorMs } from "./medals";
import { isHazard, type Vec3, type WorldDoc } from "./worlddoc";

/**
 * The route floor of a course, and the fingerprint that says when to recompute it.
 *
 * ── Why this is not computed on demand ───────────────────────────────────
 *
 * `routeFloorMs` is a Dijkstra over every standable surface in the world.
 * Measured over the shipped courses and Island, it runs roughly linear in part
 * count:
 *
 *   | world                    | parts  | solve  |
 *   |--------------------------|--------|--------|
 *   | anything with no goal     | any    |  0 ms  (the early return)
 *   | the twenty ladder courses | 217–795| 29–87 ms
 *   | Island, given a goal      | 5,763  |  279 ms
 *
 * which extrapolates to about two seconds at the 50,000-part cap. `POST /runs`
 * fires every time anybody finishes a course, so the floor cannot be computed
 * there. It is computed when the *document* changes and stored on the row.
 *
 * ── Why it is stored on the row and not in the document ──────────────────
 *
 * The document is client-authored: `PUT /api/worlds/:id` and the room server's
 * `sync` both accept one wholesale. A floor written by the client is not a
 * floor, it is a claim — and it is precisely the claim the floor exists to
 * check. So it is a server-derived column, recomputed from the document the
 * server has just validated, and it never round-trips through a browser.
 *
 * ── Why a fingerprint rather than "recompute on every save" ──────────────
 *
 * A save is cheap for a lone builder pressing Ctrl-S and expensive in a
 * multiplayer room, which writes the whole document on a five-second debounce
 * for as long as anybody is building. Two seconds of Dijkstra every five
 * seconds is not a save path.
 *
 * The fingerprint below covers *exactly* the inputs the solver reads and
 * nothing else — see `courseKey`. A match is therefore a proof that the floor
 * is unchanged rather than a guess that it probably is, which settles the
 * board question too: a repaint, a rotation, a finish change, a prop drag and
 * an idle autosave provably cannot move the floor, so they provably cannot
 * cost anybody their time on the board.
 */

/** What the solver reads, and what is stored alongside it. */
export interface CourseFloor {
  /** The fingerprint of the geometry `floorMs` was solved from. Null if not a course. */
  floorKey: string | null;
  /** The solver's route through the course, in ms. Null if not a course. */
  floorMs: number | null;
}

/** A world that is not a course: no goal, or a goal nothing can reach. */
export const NOT_A_COURSE: CourseFloor = { floorKey: null, floorMs: null };

const FNV_PRIME = 0x01000193;
const FNV_BASIS = 0x811c9dc5;
/** A second, independent basis. Two 32-bit hashes make the key 64 bits wide. */
const FNV_BASIS_B = 0x9e3779b9;

function fnv1a(s: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");

/**
 * The cell a world position stands in, in the terms `surfaceUnder` reads it.
 *
 * That function floors x and z and rounds y before it looks anything up, so
 * two spawns inside the same cell are the same input to the solver and must
 * not be two fingerprints. This has to keep matching `surfaceUnder`; the test
 * in `course-floor.test.ts` is what holds the two together.
 */
const cellOf = (p: Vec3) =>
  `${Math.floor(p[0])},${Math.round(p[1])},${Math.floor(p[2])}`;

/**
 * A fingerprint of everything `routeFloorMs` looks at, and nothing else.
 *
 * Three inputs reach the solver: the set of occupied cells (`surfaces` reads
 * `p[0..2]` of each part and, of everything beside them, only whether the
 * finish is the hazard — a cell you cannot stand on is a different graph —
 * and never the shape, colour, rotation or `props`), the spawn, and the
 * goal. Anything else in the document may change freely without moving the
 * floor. Painting a pad to lava is therefore an edit that resets a board,
 * and painting it back is another; the hash carries the bit so it can say so.
 *
 * The parts are combined by ADDITION rather than by hashing the array in
 * order, because they are a set and the editor makes no promise about their
 * order — erasing and re-placing a block can reorder the array without moving
 * a single surface. Additive combination is commutative, so it agrees; and it
 * is O(n) with one small hash per part, which is what makes this affordable on
 * a path the solver is not.
 */
export function courseKey(doc: WorldDoc): string {
  let a = 0;
  let b = 0;
  for (const p of doc.parts) {
    const cell = `${p[0]},${p[1]},${p[2]}${isHazard(p) ? "!" : ""}`;
    a = (a + fnv1a(cell, FNV_BASIS)) >>> 0;
    b = (b + fnv1a(cell, FNV_BASIS_B)) >>> 0;
  }
  const goal = doc.goal ? cellOf(doc.goal) : "-";
  // The version prefix is what lets this change later: bump it and every
  // stored key stops matching, which recomputes every floor once and then
  // costs nothing again. 2: the hazard bit joined the hash.
  return `2:${doc.parts.length}:${hex(a)}${hex(b)}:${cellOf(doc.spawn)}:${goal}`;
}

/**
 * The floor for a document, reusing the previous one when the geometry proves
 * it is still right.
 *
 * `previous` is the pair already on the row. Pass what was stored, get back
 * what to store: identical when nothing the solver reads has moved, and a
 * fresh solve when it has. A world with no goal never reaches the solver at
 * all — most worlds are not courses, and the island must not pay for this.
 */
export function courseFloorFor(
  doc: WorldDoc,
  previous?: Partial<CourseFloor> | null
): CourseFloor {
  if (!doc.goal) return NOT_A_COURSE;

  const floorKey = courseKey(doc);
  if (
    previous &&
    previous.floorKey === floorKey &&
    previous.floorMs !== null &&
    previous.floorMs !== undefined
  ) {
    return { floorKey, floorMs: previous.floorMs };
  }

  const floorMs = routeFloorMs(doc);
  // A goal nothing can reach is not a course, and storing a key for it would
  // cache that verdict — which is wrong the moment somebody builds the bridge
  // that connects it. Leave both null so the next save tries again.
  return floorMs === null ? NOT_A_COURSE : { floorKey, floorMs };
}

/**
 * Did a write actually move the floor?
 *
 * The one line an author has to be told: a change that moves the floor resets
 * the board, and every other change leaves it alone. Losing the goal counts —
 * the course everybody's times were set on no longer exists.
 */
export const floorMoved = (before: number | null, after: number | null) =>
  before !== null && before !== after;
