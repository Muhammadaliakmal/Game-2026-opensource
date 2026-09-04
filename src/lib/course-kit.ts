import type { Checkpoint, PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * The vocabulary the shipped parkour courses are written in.
 *
 * `lib/parkour.ts` grew its own `put`/`fill`/`outline` closures inside the one
 * function that needed them. That was right for one course. Five courses would
 * mean five copies of the same three closures, and the copies would drift —
 * so they move here once, along with the two invariants every course has to
 * hold and neither of which is obvious at the call site:
 *
 *  - **One part per cell.** Parts are keyed by cell in a Map, so a later write
 *    replaces an earlier one instead of stacking a second part in the same
 *    space. `built-in-worlds.test.ts` asserts this globally; doing it by
 *    construction means a course author can overlap two shapes deliberately
 *    (a rim drawn over a pad) without thinking about ordering.
 *  - **Nothing below y=0.** The editor refuses to place there, so a generated
 *    part below the floor is one the player can see and never rebuild.
 *
 * Geometry is min-corner addressed, like the editor's own grid: `fill(x, y, z,
 * w, d)` starts at the cell (x, y, z) and grows toward +x/+z. `center` is the
 * bridge to the world-space coordinates checkpoints and goals need.
 */

// Shapes, spelled out. The tuple stores a number and 2 is not "ramp" to anyone.
export const BLOCK: Shape = 0;
export const SLAB: Shape = 1;
export const RAMP: Shape = 2;
export const WEDGE: Shape = 3;

// Finishes.
export const MATTE = 0;
export const GLOSSY = 1;
export const METAL = 2;
export const GLOW = 3;

/**
 * Palette indices used across the set (see PALETTE in worlddoc.ts).
 *
 * Named so a course reads as a palette choice rather than as `18`, and shared
 * so the five maps look like one game. Per-course identity comes from which of
 * these each map leans on, not from every map inventing its own colours.
 */
export const HUE = {
  slate: 4,
  ink: 5,
  amber: 8,
  orange: 9,
  red: 11,
  pink: 14,
  fuchsia: 15,
  purple: 16,
  violet: 17,
  indigo: 18,
  blue: 19,
  sky: 20,
  cyan: 21,
  teal: 22,
  emerald: 23,
  green: 24,
  lime: 25,
  acid: 26,
  white: 31,
} as const;

/** Yaw headings, in the look rig's convention: forward is (sin y, cos y). */
export const FACING = {
  north: 0, // +z
  east: Math.PI / 2, // +x
  south: Math.PI, // -z
  west: -Math.PI / 2, // -x
} as const;

/** The world-space centre of a run of `n` cells starting at `a`. */
export const center = (a: number, n = 1): number => a + n / 2;

export class Course {
  private readonly cells = new Map<string, PartTuple>();
  readonly checkpoints: Checkpoint[] = [];

  /** One part, replacing anything already in that cell. */
  put(
    x: number,
    y: number,
    z: number,
    shape: Shape,
    color: number,
    finish: number,
    rot = 0
  ): this {
    if (y < 0) throw new RangeError(`part below the grid floor at y=${y}`);
    this.cells.set(`${x},${y},${z}`, [x, y, z, shape, color, finish, rot]);
    return this;
  }

  /** A `w` x `d` rectangle of one part kind, at a single height. */
  fill(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    color: number,
    finish: number,
    shape: Shape = BLOCK
  ): this {
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d; k++) this.put(x + i, y, z + k, shape, color, finish);
    }
    return this;
  }

  /** The border cells of that same rectangle — drawn over whatever is there. */
  rim(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    color: number,
    finish: number
  ): this {
    for (let i = 0; i < w; i++) {
      this.put(x + i, y, z, BLOCK, color, finish);
      this.put(x + i, y, z + d - 1, BLOCK, color, finish);
    }
    for (let k = 0; k < d; k++) {
      this.put(x, y, z + k, BLOCK, color, finish);
      this.put(x + w - 1, y, z + k, BLOCK, color, finish);
    }
    return this;
  }

  /**
   * A landing platform: a filled deck with a lit border.
   *
   * The rim is not decoration. A pad floating in a void has no edge you can
   * judge from the air, and every course in the set asks you to judge one from
   * the air — so the edge glows and the deck does not, and where you land is
   * legible on the way down.
   */
  pad(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    deck: number,
    edge: number,
    finish: number = MATTE
  ): this {
    this.fill(x, y, z, w, d, deck, finish);
    // A 1- or 2-wide pad is all edge; drawing a rim over it would erase the
    // deck colour and leave a solid glowing block, which reads as a hazard.
    if (w > 2 && d > 2) this.rim(x, y, z, w, d, edge, GLOW);
    return this;
  }

  /** A walkway `w` cells wide running `len` cells along +x or +z. */
  beam(
    x: number,
    y: number,
    z: number,
    len: number,
    width: number,
    axis: "x" | "z",
    color: number,
    finish: number = MATTE
  ): this {
    return axis === "x"
      ? this.fill(x, y, z, len, width, color, finish)
      : this.fill(x, y, z, width, len, color, finish);
  }

  /**
   * Steps climbing one cell per tread along +x or +z.
   *
   * Every course needs a way back up that is not a jump, because a course made
   * only of jumps has no rhythm — the climb is where the player looks at what
   * is coming next.
   */
  stairs(
    x: number,
    y: number,
    z: number,
    steps: number,
    width: number,
    axis: "x" | "z",
    color: number,
    finish: number = MATTE
  ): this {
    for (let i = 0; i < steps; i++) {
      if (axis === "x") this.fill(x + i, y + i, z, 1, width, color, finish);
      else this.fill(x, y + i, z + i, width, 1, color, finish);
    }
    return this;
  }

  /**
   * A resume point standing on the deck at cell (x, y, z).
   *
   * Takes the *cell you stand on*, not a world position, because that is what
   * the course author just placed and converting by hand is how a checkpoint
   * ends up floating half a cell above its own pad. `y + 1` is the deck's top
   * surface, which is where the runner's feet are when they trip the zone.
   */
  checkpoint(x: number, y: number, z: number, yaw: number): this {
    this.checkpoints.push({ pos: [center(x), y + 1, center(z)], yaw });
    return this;
  }

  /** Everything placed, in insertion order. */
  parts(): PartTuple[] {
    return [...this.cells.values()];
  }
}

/**
 * The goal position for a course finished on the block at cell (x, y, z).
 *
 * A goal is a world position rather than a cell (see PARKOUR_GOAL), and `y + 1`
 * is that cell's top face — the height a standing player's feet occupy, not the
 * block's centre. GoalZone's zone is 2.4 units across and reaches 1.6 below, so
 * the whole podium under the marker counts: arriving is what wins the course,
 * not climbing one last cell nobody told you about.
 */
export const goalOver = (x: number, y: number, z: number): Vec3 => [
  center(x),
  y + 1,
  center(z),
];

/** Difficulty tiers, in ladder order. */
export const TIERS = ["Tutorial", "Easy", "Medium", "Hard", "Expert"] as const;
export type Tier = (typeof TIERS)[number];

/** Assemble a course's geometry into the WorldDoc the app loads. */
export function courseDoc(
  course: Course,
  opts: {
    id: string;
    ownerId: string;
    name: string;
    spawn: Vec3;
    goal: Vec3;
    sky?: number;
  }
): WorldDoc {
  return {
    v: 1,
    id: opts.id,
    name: opts.name,
    ownerId: opts.ownerId,
    spawn: opts.spawn,
    goal: opts.goal,
    checkpoints: course.checkpoints,
    sky: opts.sky ?? 0,
    parts: course.parts(),
    props: [],
  };
}
