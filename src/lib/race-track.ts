/**
 * The racing line of Neon Circuit, as maths rather than as blocks.
 *
 * Both the level generator (circuit.ts) and the race rules (server/src/race.ts)
 * need to agree on where the track is, which way round it goes and where a lap
 * begins. If the generator owned those numbers the server would be guessing at
 * geometry it cannot see, and the first symptom of any disagreement would be a
 * lap that never counts.
 *
 * Deliberately free of three.js and of every heavy import. The room server runs
 * headless and pulls this in through the `@/*` mapping — the same constraint
 * that put `keyOf` in lib/cell-key.ts.
 *
 * ── Coordinates ──────────────────────────────────────────────────────────
 * Everything here is in WORLD units, with the loop centred on the origin. The
 * generator walks integer cells and evaluates each at its centre (`x + 0.5`),
 * which is why it calls these with the offset already applied.
 */

/** Half-extents of the box the loop is stamped around, plus its corner radius. */
export const BX = 25;
export const BZ = 15;
export const CORNER = 9;
/** Half the racing surface's width. A seven-cell line, wide enough to pass on. */
export const HALF_WIDTH = 3.4;
/** The kerb-and-rail band outside the racing surface. */
export const RAIL_BAND = 0.9;

/** Laps in a race. Three is long enough to recover from one mistake. */
export const RACE_LAPS = 3;

/**
 * Sectors a rider must pass through in order.
 *
 * This is what makes a lap mean something. Without it a rider could sit on the
 * start line nudging back and forth over it and "complete" laps, or cut across
 * the infield and rejoin. Six is chosen against the update rate: sectors are
 * about 34 units of track each, and positions arrive roughly twelve times a
 * second, so nobody can cross a whole sector between two updates and have their
 * progress silently rejected.
 */
export const SECTORS = 6;

/**
 * Signed distance from a world position to the centreline.
 *
 * Negative inside the loop, positive outside, zero on the racing line. This is
 * the same field the level is stamped from, so "on the track" here and "there
 * are blocks here" are the same question.
 */
export function trackDistance(x: number, z: number): number {
  const dx = Math.max(Math.abs(x) - BX, 0);
  const dz = Math.max(Math.abs(z) - BZ, 0);
  return Math.hypot(dx, dz) - CORNER;
}

/** Is this world position on the racing surface (not the kerb, not the void)? */
export function onTrack(x: number, z: number): boolean {
  return Math.abs(trackDistance(x, z)) <= HALF_WIDTH;
}

/**
 * How far round the lap a position is, as 0..1 from the start line.
 *
 * The polar angle about the origin works as a lap parameter because the loop
 * is convex and encloses the centre — so the angle increases monotonically all
 * the way round, which a distance-along-the-centreline would only do after a
 * good deal more arithmetic.
 *
 * Zero is the start/finish line, on the +Z straight at x = 0, and the racing
 * direction is increasing progress — which at the line means heading +X.
 */
export function lapProgress(x: number, z: number): number {
  const u = Math.atan2(x, z) / (Math.PI * 2);
  return u < 0 ? u + 1 : u;
}

/** Which ordered sector a position falls in, 0..SECTORS-1. */
export function sectorAt(x: number, z: number): number {
  const s = Math.floor(lapProgress(x, z) * SECTORS);
  // atan2 can return exactly 2pi-epsilon rounding to SECTORS; clamp rather
  // than let a rider land in a sector that does not exist.
  return s >= SECTORS ? SECTORS - 1 : s;
}

/**
 * The world Z of the centreline on the start/finish straight.
 *
 * At x = 0 the nearest point of the box is (0, BZ) and the centreline sits
 * CORNER beyond it, so the straight runs parallel to X at this Z.
 */
export const START_LINE_Z = BZ + CORNER;

/**
 * The starting grid: four slots, staggered, behind the line.
 *
 * Behind means -X, because the racing direction at the line is +X. Two abreast
 * with a stagger rather than four in a row: a four-wide grid on a seven-cell
 * track has riders touching before anyone has moved, and the first corner is
 * unpleasant enough without that.
 *
 * Y is one above the racing surface (which tops out at y = 1) so a bike drops
 * onto the track rather than starting inside it.
 */
export const GRID_SLOTS: readonly [number, number, number][] = [
  [-4, 1.8, START_LINE_Z - 1.6],
  [-4, 1.8, START_LINE_Z + 1.6],
  [-9, 1.8, START_LINE_Z - 1.6],
  [-9, 1.8, START_LINE_Z + 1.6],
];

/** Riders on the grid face +X, and a body whose forward is +Z needs a quarter turn. */
export const GRID_YAW = Math.PI / 2;

/** How many can be on the grid at once. */
export const MAX_RIDERS = GRID_SLOTS.length;
