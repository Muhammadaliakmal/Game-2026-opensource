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
export const BX = 60;
export const BZ = 38;
export const CORNER = 22;
/**
 * Half the racing surface's width. A ten-cell line — wide enough that two
 * riders can run side by side through a corner rather than the outside one
 * being pushed onto the kerb, which is what a seven-cell road did once the
 * straights got long enough to actually arrive at a corner together.
 */
export const HALF_WIDTH = 5.0;
/** The kerb-and-rail band outside the racing surface. */
export const RAIL_BAND = 0.9;

/** Laps in a race. Three is long enough to recover from one mistake. */
export const RACE_LAPS = 3;

/**
 * Sectors a rider must pass through in order.
 *
 * This is what makes a lap mean something. Without it a rider could sit on the
 * start line nudging back and forth over it and "complete" laps, or cut across
 * the infield and rejoin.
 *
 * The count is chosen against two opposing limits. Too few and the check is
 * coarse enough to cut a corner through; too many and a sector becomes short
 * enough to cross entirely between two position updates, which would reject a
 * clean lap as a cut. Twelve puts a sector at roughly 44 units of the ~530-unit
 * lap, and positions arrive about twelve times a second — a rider would have to
 * be doing 530 units/sec to skip one, which the bike cannot approach.
 *
 * It went from six when the loop was scaled up: holding six would have doubled
 * sector length to ~88 units and quietly loosened the anti-cut check that is
 * this constant's entire purpose.
 */
export const SECTORS = 12;

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
 * Is this position past the rails, over nothing at all?
 *
 * The generators stamp blocks out to `HALF_WIDTH + RAIL_BAND` and not one cell
 * further (see `circuit.ts` and `vapor-ridge.ts`, which both walk this same
 * field), so beyond that bound there is no world — not a kerb, not a run-off,
 * void. A bike there is falling whether or not it has started to yet.
 *
 * Deliberately a wider bound than `onTrack`. Two wheels on the kerb is a bad
 * corner, not a crash, and a recovery that fired on it would take the race off
 * anybody who ran wide. This fires only once there is nothing underneath.
 *
 * XZ only, on purpose: Vapor Ridge has a crest riders leave the ground over,
 * and height says nothing about whether they are still above the track.
 */
export function beyondRails(x: number, z: number): boolean {
  return Math.abs(trackDistance(x, z)) > HALF_WIDTH + RAIL_BAND;
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
 * with a stagger rather than four in a row: a four-wide grid has riders
 * touching before anyone has moved, and the first corner is unpleasant enough
 * without that.
 *
 * The X spacing is deliberately NOT scaled with the track. These offsets are
 * set by how big a bike is, and a bike is the same size on a long circuit as a
 * short one — stretching the grid with the loop would just add dead tarmac
 * between riders. Only the Z stagger opened up, because the road itself is
 * wider now.
 *
 * Y sits the bike's body origin at its own suspension rest height above the
 * racing surface (which tops out at y = 1): ground + the wheel radius the
 * ShapeCastWheels float on (rayShapeR 0.33), plus a hair. Higher than this and
 * the wheels start the race beyond their own cast range — they detect no
 * ground, the bike free-falls onto a narrow contact base and rolls, and the
 * vehicle controller has nothing that rights it again.
 */
export const GRID_SLOTS: readonly [number, number, number][] = [
  [-4, 1.35, START_LINE_Z - 2.2],
  [-4, 1.35, START_LINE_Z + 2.2],
  [-9, 1.35, START_LINE_Z - 2.2],
  [-9, 1.35, START_LINE_Z + 2.2],
];

/** Riders on the grid face +X, and a body whose forward is +Z needs a quarter turn. */
export const GRID_YAW = Math.PI / 2;

/** How many can be on the grid at once. */
export const MAX_RIDERS = GRID_SLOTS.length;

/**
 * The tracks a race can be run on.
 *
 * Every one shares the XZ shape above — the same rounded box, the same corner
 * radius, the same start line and grid — so `lapProgress`, `sectorAt` and the
 * steering assist need no per-track knowledge, and the room server counts laps
 * the same way whichever is chosen. What differs is elevation: `circuit` is
 * dead flat, `ridge` runs a hill and a crest you leave the ground over. The
 * generator for each lives beside `circuit.ts`.
 *
 * `id` is what a client may name in a room option; `slug` is the built-in
 * world it resolves to. They are equal today and kept as separate fields so
 * `raceTrackSlug` is visibly a validation step — a client cannot ask a race
 * room to load an arbitrary world by putting its name in `track`.
 */
export interface RaceTrackInfo {
  id: string;
  slug: string;
  name: string;
  blurb: string;
}

export const RACE_TRACKS: readonly RaceTrackInfo[] = [
  {
    id: "circuit",
    slug: "circuit",
    name: "Neon Circuit",
    blurb: "Flat and railed on both sides. Nothing to fall off — hold the throttle.",
  },
  {
    id: "ridge",
    slug: "ridge",
    name: "Vapor Ridge",
    blurb: "A climb on the right, then a crest on the back straight that throws you off it.",
  },
] as const;

/** The track a room opens on when the option is absent or unrecognised. */
export const DEFAULT_RACE_TRACK = "circuit";

/** Resolve a client-supplied track id to a built-in world slug, safely. */
export function raceTrackSlug(id: string | undefined): string {
  return (
    RACE_TRACKS.find((t) => t.id === id) ??
    RACE_TRACKS.find((t) => t.id === DEFAULT_RACE_TRACK)!
  ).slug;
}
