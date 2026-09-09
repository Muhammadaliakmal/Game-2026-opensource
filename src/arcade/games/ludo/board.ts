import type { BoardGraph } from "@/arcade/host/board";
import type { Vec2 } from "@/arcade/host/anim";

/**
 * Ludo's geometry: one quarter, rotated three times.
 *
 * ── Why not a table of coordinates ───────────────────────────────────────
 *
 * The board is 52 track cells, 24 home-lane cells, 16 yard slots and four
 * home targets. Typed out that is ninety-six coordinate pairs, and a board
 * game whose four sides are *nearly* symmetric is one where a player will find
 * the asymmetry before any test does. The board has exact four-fold rotational
 * symmetry, so it is written once and turned: `(c, r) -> (14 - r, c)` on the
 * grid, `(x, y) -> (15 - y, x)` on a point. Every seat is then symmetric by
 * construction rather than by proofreading.
 *
 * ── Board space is the 15x15 grid, and nothing else ──────────────────────
 *
 * Cell centres are `(col + 0.5, row + 0.5)`. No pixel appears in this file.
 * `host/board.ts` fits the 15-unit square into whatever rectangle the canvas
 * is this frame.
 *
 * ── Progress, not cells, is what a token has ─────────────────────────────
 *
 * A token's state is one number, its distance travelled:
 *
 *   -1        in the yard
 *   0..50     on the shared loop, 51 cells
 *   51..56    in its own home lane, 6 cells
 *   57        home
 *
 * Everything awkward about Ludo — that four seats share a loop but enter it at
 * different points, that the loop is 52 cells but a lap is 51, that home needs
 * an exact roll — becomes arithmetic on that one number. `cellFor` is the only
 * place the mapping back to a cell id exists.
 */

export const LOOP_LEN = 52;
export const HOME_LANE = 6;
export const MAX_TOKENS = 4;

/** Progress values, named so the off-by-ones are visible. */
export const IN_YARD = -1;
/** The last loop cell of a lap. 51 cells walked, not 52 — see below. */
export const LAST_LOOP = 50;
/** The first home-lane cell. */
export const LANE_FIRST = 51;
/** Home. Reached only on an exact roll. */
export const HOME = 57;

export const BOARD_SIZE = 15;

const rotCell = (c: number, r: number): [number, number] => [14 - r, c];
const rotPoint = (p: Vec2): Vec2 => ({ x: 15 - p.y, y: p.x });
const centre = (c: number, r: number): Vec2 => ({ x: c + 0.5, y: r + 0.5 });

/**
 * One quarter of the loop: thirteen cells.
 *
 * Left arm's upper row outward-to-inward, then up the near column of the top
 * arm, then the cell over the top. Rotating this four times closes the ring
 * exactly, which is the check that it is right: the last cell of the fourth
 * quarter, `(0, 7)`, is adjacent to the first cell of the first, `(0, 6)`.
 */
const QUARTER: Array<[number, number]> = [
  [0, 6],
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  [7, 0],
];

/** The 52 loop cells, clockwise from the left arm. */
const LOOP: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  let q = QUARTER;
  for (let turn = 0; turn < 4; turn++) {
    out.push(...q);
    q = q.map(([c, r]) => rotCell(c, r));
  }
  return out;
})();

/**
 * Where each seat joins the loop.
 *
 * One past the quarter boundary, and that one matters. Starting on the
 * boundary cell would put the seat's home entry at `(0, 8)` — diagonally
 * adjacent to its lane, so the turn into home would be drawn as a sidestep.
 * One further along puts the entry on `(0, 7)`, the middle cell of the arm's
 * edge, and the token walks straight in. The spec's `[0, 13, 26, 39]` is the
 * same board off by one cell, and it is the cell you can see.
 */
export const START = [1, 14, 27, 40] as const;

/**
 * The safe cells: four starts, and a star eight cells past each.
 *
 * Eight rather than some other number because it is the largest gap a single
 * roll cannot cross, so a token that reaches a star cannot be taken off it by
 * one throw from the previous one.
 */
export const SAFE: ReadonlySet<number> = new Set(
  START.flatMap((s) => [s, (s + 8) % LOOP_LEN])
);

/** Cell id ranges. Contiguous, so the painter's cell array is a flat list. */
const LANE_BASE = LOOP_LEN; // 52
const YARD_BASE = LANE_BASE + 4 * HOME_LANE; // 76
const HOME_BASE = YARD_BASE + 4 * MAX_TOKENS; // 92
export const CELL_COUNT = HOME_BASE + 4; // 96

export const laneCell = (seat: number, i: number) => LANE_BASE + seat * HOME_LANE + i;
export const yardCell = (seat: number, i: number) => YARD_BASE + seat * MAX_TOKENS + i;
export const homeCell = (seat: number) => HOME_BASE + seat;

/** Seat 0's four yard slots. The other three are rotations of these. */
const YARD_0: Vec2[] = [
  { x: 1.5, y: 1.5 },
  { x: 4.5, y: 1.5 },
  { x: 1.5, y: 4.5 },
  { x: 4.5, y: 4.5 },
];

/** Seat 0's home target, nudged off centre so four seats do not collide. */
const HOME_0: Vec2 = { x: 6.6, y: 7.5 };

const positions: Vec2[] = (() => {
  const out: Vec2[] = new Array(CELL_COUNT);

  for (let i = 0; i < LOOP.length; i++) out[i] = centre(LOOP[i][0], LOOP[i][1]);

  // Seat 0's lane runs along row 7 from the edge inward; the rest rotate. It
  // starts at column 1 because column 0 is the loop cell it is entered from.
  let lane: Vec2[] = Array.from({ length: HOME_LANE }, (_, i) => centre(1 + i, 7));
  let yard = YARD_0;
  let home = HOME_0;
  for (let seat = 0; seat < 4; seat++) {
    for (let i = 0; i < HOME_LANE; i++) out[laneCell(seat, i)] = lane[i];
    for (let i = 0; i < MAX_TOKENS; i++) out[yardCell(seat, i)] = yard[i];
    out[homeCell(seat)] = home;
    lane = lane.map(rotPoint);
    yard = yard.map(rotPoint);
    home = rotPoint(home);
  }

  return out;
})();

/**
 * The cell a token is drawn on.
 *
 * The only mapping from progress to a cell id, and therefore the only place
 * the four seats' different entry points are resolved. `token` is needed for
 * one case: a token in the yard sits in its own slot, so four tokens waiting
 * to come out are four pieces rather than one stack.
 */
export function cellFor(seat: number, progress: number, token: number): number {
  if (progress <= IN_YARD) return yardCell(seat, token);
  if (progress >= HOME) return homeCell(seat);
  if (progress >= LANE_FIRST) return laneCell(seat, progress - LANE_FIRST);
  return (START[seat] + progress) % LOOP_LEN;
}

/** True when a progress value is on the shared loop, where capture happens. */
export const onLoop = (progress: number) =>
  progress > IN_YARD && progress <= LAST_LOOP;

export const LUDO_GRAPH: BoardGraph = {
  size: BOARD_SIZE,
  cells: positions,
  safe: SAFE,
};

/** The grid cells of the loop, for the renderer to paint the track under them. */
export const LOOP_CELLS: ReadonlyArray<readonly [number, number]> = LOOP;
