import type { BoardGraph } from "@/arcade/host/board";
import type { Vec2 } from "@/arcade/host/anim";

/**
 * Snakes & Ladders: a hundred squares that fold back on themselves, and the
 * tray underneath them.
 *
 * ── The board is a line, drawn as a grid ─────────────────────────────────
 *
 * A token's whole state is one number, 0 to 100, exactly as a Ludo token's is
 * its progress. Nothing in the rules ever asks which column a square is in —
 * the grid is a *drawing* of the line, and the boustrophedon fold (row 1 runs
 * left to right, row 2 right to left) exists in one function, `gridOf`. That
 * is why the snakes can be a table of two numbers rather than of four
 * coordinates.
 *
 * ── The tray is made of cells too ────────────────────────────────────────
 *
 * The start pad and the three card slots are entries in the same `cells`
 * array as the hundred squares. They are not squares a token can stand on —
 * except the start pad, which is square 0 — but they are things a finger can
 * land on, and `painter.cellAt` is the only inverse of the board transform
 * that exists. Giving the hand its own cell ids means tapping a card goes
 * through the same tested round trip as tapping a square, instead of a second
 * hit-test written in pixels that nothing checks against the first.
 *
 * ── Board space is 13 units, and no pixel appears in this file ───────────
 *
 * Top strip for the seats, ten units of grid, tray below. `host/board.ts`
 * fits that square into whatever rectangle the canvas is this frame.
 */

/** Squares on the board. The last one is the one you have to land on exactly. */
export const SQUARES = 100;

/** Off the board, waiting to start. Square 0 is a real position, not a null. */
export const START_SQUARE = 0;

/** Cards a seat may hold. A fourth is not drawn rather than discarded. */
export const HAND_LIMIT = 3;

/** Cell ids: 0..100 are the squares, then the hand slots. */
export const HAND_BASE = SQUARES + 1;
export const CELL_COUNT = HAND_BASE + HAND_LIMIT;
export const handCell = (slot: number) => HAND_BASE + slot;
/** The slot a hand cell id refers to, or -1. */
export const handSlotOf = (cell: number) =>
  cell >= HAND_BASE && cell < CELL_COUNT ? cell - HAND_BASE : -1;

export const BOARD_SIZE = 13;

/** The grid's top-left corner, in board units. Ten cells of one unit each. */
const GRID_X = 1.5;
const GRID_Y = 1.2;

/** The tray under the board: start pad, the hand, the die. */
const TRAY_Y = 12;
export const START_AT: Vec2 = { x: 2, y: TRAY_Y };
export const DIE_AT: Vec2 = { x: 11, y: TRAY_Y };
/** Where the seat strip is written, above the grid. */
export const NAMES_Y = 0.62;

/**
 * Column and row of a square, row 0 at the top.
 *
 * The fold: square 1 is bottom-left, 10 is bottom-right, 11 sits directly
 * above 10, and 20 is back at the left. Every board printed this way, and the
 * reason a ladder can be drawn as a straight line at all — consecutive squares
 * are adjacent on the paper as well as on the number line.
 */
export function gridOf(square: number): { col: number; row: number } {
  const idx = square - 1;
  const fromBottom = Math.floor(idx / 10);
  const along = idx % 10;
  return {
    col: fromBottom % 2 === 0 ? along : 9 - along,
    row: 9 - fromBottom,
  };
}

/** Board-space centre of a square. */
export function squareAt(square: number): Vec2 {
  const { col, row } = gridOf(square);
  return { x: GRID_X + col + 0.5, y: GRID_Y + row + 0.5 };
}

/** The grid's outline, for the renderer to rule lines over. */
export const GRID = { x: GRID_X, y: GRID_Y, w: 10, h: 10 } as const;

/**
 * The standard board, and it is standard on purpose.
 *
 * Nine ladders and ten snakes, in the arrangement most people have already
 * played on: 1 to 38 out of the gate, 87 and 98 waiting at the top. A board
 * somebody recognises needs no explaining, and the placement is better than a
 * generated one would be — the snakes get longer and meaner as you climb,
 * which is the pacing the game lives on.
 */
export const LADDERS: ReadonlyArray<readonly [number, number]> = [
  [1, 38],
  [4, 14],
  [9, 31],
  [21, 42],
  [28, 84],
  [36, 44],
  [51, 67],
  [71, 91],
  [80, 100],
];

export const SNAKES: ReadonlyArray<readonly [number, number]> = [
  [16, 6],
  [47, 26],
  [49, 11],
  [56, 53],
  [62, 19],
  [64, 60],
  [87, 24],
  [93, 73],
  [95, 75],
  [98, 78],
];

/** Where a square sends you, if it sends you anywhere. */
export const JUMPS: ReadonlyMap<number, number> = new Map([...LADDERS, ...SNAKES]);

/**
 * Squares that hand you a card.
 *
 * Eight of them, none on a snake, a ladder, or either end of one. That is not
 * tidiness: a square that both teleports you and pays you is a square whose
 * reward the player never sees happen, because the token is already somewhere
 * else by the time they look. `board.test.ts` pins it.
 *
 * Spread up the board rather than clustered low, so the hand keeps being
 * refilled through the middle of a match instead of only at the start — a
 * decision layer you run out of halfway is a game that gets worse as it goes.
 */
export const CARD_SQUARES: ReadonlySet<number> = new Set([
  5, 23, 33, 45, 58, 68, 77, 89,
]);

/**
 * The squares a token enters, in order, counting out `steps` from `from`.
 *
 * Bounces off 100 rather than stopping short of it, which is the house rule
 * worth having: the endgame becomes a thing you can overshoot, an exact roll
 * becomes something to want, and the bounce can drop you back onto 98's snake,
 * which is the most memorable way this game ends.
 *
 * Returned as the whole walk rather than just the destination because the
 * animator hops it cell by cell, and a bounce that is *counted out* — up to a
 * hundred, then back down — is legible in a way an arrival at 96 is not. The
 * lowest a bounce can leave you is 89 (from 99, on a boosted six), so it can
 * never walk off the bottom of the board.
 */
export function walk(from: number, steps: number): number[] {
  const out: number[] = [];
  let at = from;
  let dir = 1;
  for (let i = 0; i < steps; i++) {
    if (at === SQUARES) dir = -1;
    at += dir;
    out.push(at);
  }
  return out;
}

/** The same walk, backwards, for the Reverse card. Stops at square 0. */
export function walkBack(from: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= steps && from - i >= START_SQUARE; i++) out.push(from - i);
  return out;
}

/** Where `steps` from `from` lands, bounce included. */
export const advance = (from: number, steps: number): number => {
  const path = walk(from, steps);
  return path.length ? path[path.length - 1] : from;
};

const positions: Vec2[] = (() => {
  const out: Vec2[] = new Array(CELL_COUNT);
  out[START_SQUARE] = START_AT;
  for (let n = 1; n <= SQUARES; n++) out[n] = squareAt(n);
  // Centred under the grid, a slot and a half apart, which is wide enough that
  // `cellAt`'s generous tap radius cannot resolve a finger to the wrong card.
  const mid = GRID_X + 5;
  for (let i = 0; i < HAND_LIMIT; i++) {
    out[handCell(i)] = { x: mid + (i - 1) * 1.5, y: TRAY_Y };
  }
  return out;
})();

/**
 * Nothing is safe and nothing is captured here, so the set is empty — and it
 * is empty rather than absent because the painter takes a `BoardGraph` and a
 * game without capture is a fact about this game, not a missing field.
 */
export const SNAKES_GRAPH: BoardGraph = {
  size: BOARD_SIZE,
  cells: positions,
  safe: new Set<number>(),
};
