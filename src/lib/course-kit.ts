import { canClear, maxGap } from "./jump-arc";
import type { Checkpoint, PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * The vocabulary the shipped parkour courses are written in.
 *
 * `lib/parkour.ts` grew its own `put`/`fill`/`outline` closures inside the one
 * function that needed them. That was right for one course. A ladder of twenty
 * would mean twenty copies of the same closures, and the copies would drift —
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
/** The finish that kills. `worlddoc.ts` owns the number; see `isHazard`. */
export const HAZARD = 4;
/**
 * The surface a sheet of lava carries: the cracked-rock luminance of `stone`
 * under the orange glow reads as crust. Named by index here because this
 * module imports nothing that could resolve a name, and the dressing pass
 * never touches a hazard (see `dressParts`), so it has to be written at
 * generation. `texture-list.test.ts` holds the index to the name.
 */
export const LAVA_SURFACE = 3;

/**
 * Palette indices used across the set (see PALETTE in worlddoc.ts).
 *
 * Named so a course reads as a palette choice rather than as `18`, and shared
 * so the whole ladder looks like one game. Per-course identity comes from which
 * of these each map leans on, not from every map inventing its own colours.
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

/**
 * The camera yaw that looks along a horizontal direction.
 *
 * A duplicate of `yawTowards` in components/play/camera-rig.ts, and
 * deliberately so: this module is pure and is pulled in by the headless room
 * server, which must not drag three.js and zustand behind it. `facing.test.ts`
 * pins the two together, so the copy cannot drift from the rig it describes.
 *
 * ── Why it is not atan2(dx, dz) ──────────────────────────────────────────
 *
 * The rig places the eye at `+offset` from the character and then looks back
 * down that offset, so the direction the player SEES along is the negation of
 * `(sin yaw, cos yaw)`. These constants used to be written against the
 * un-negated reading — the one WorldDoc's own comment stated — which made
 * every one of them exactly half a turn wrong: reaching a checkpoint spun you
 * round to look back down the course you had just climbed, on a mechanic whose
 * whole job is to let you carry on.
 */
const facing = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** Yaw headings for a runner who should be looking along a compass direction. */
export const FACING = {
  north: facing(0, 1), // looking toward +z
  east: facing(1, 0), // looking toward +x
  south: facing(0, -1), // looking toward -z
  west: facing(-1, 0), // looking toward -x
} as const;

/** The world-space centre of a run of `n` cells starting at `a`. */
export const center = (a: number, n = 1): number => a + n / 2;

export class Course {
  private readonly cells = new Map<string, PartTuple>();
  readonly checkpoints: Checkpoint[] = [];

  /**
   * One part, replacing anything already in that cell.
   *
   * `texture` is the optional eighth field. Almost nothing passes it — the
   * shipped worlds are dressed by colour afterwards (`surface-dressing.ts`)
   * — but a generator that wants a surface the dressing will not give it
   * (lava, which is a hazard and so never dressed) writes it here.
   */
  put(
    x: number,
    y: number,
    z: number,
    shape: Shape,
    color: number,
    finish: number,
    rot = 0,
    texture?: number
  ): this {
    if (y < 0) throw new RangeError(`part below the grid floor at y=${y}`);
    this.cells.set(
      `${x},${y},${z}`,
      texture === undefined
        ? [x, y, z, shape, color, finish, rot]
        : [x, y, z, shape, color, finish, rot, texture]
    );
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
   * `n` pads of one size, each offset from the last by `step`.
   *
   * The shape every course in the set is mostly made of: a flight of identical
   * landings marching in one direction. Written as a loop at each call site it
   * is three lines of index arithmetic whose only interesting numbers are the
   * offsets — and the offset is exactly what has to be checked against the arc,
   * so burying it in `8 + i * 5` is burying the one number that can be wrong.
   *
   * `step` is min-corner to min-corner, so with a 3-wide pad a step of 5 leaves
   * a gap of 2. See the coordinate note at the top of `courses/` for why that
   * subtraction is the whole design.
   */
  run(
    x: number,
    y: number,
    z: number,
    n: number,
    step: [number, number, number],
    w: number,
    d: number,
    deck: number,
    edge: number,
    finish: number = MATTE
  ): this {
    for (let i = 0; i < n; i++) {
      this.pad(x + step[0] * i, y + step[1] * i, z + step[2] * i, w, d, deck, edge, finish);
    }
    return this;
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

  /**
   * A `w` x `d` sheet of lava — hazard blocks in one colour. A block
   * finished this way kills on touch and is not a surface to the route
   * solver, so a sheet of it under a jump is a pit and a strip of it across
   * a deck is a wall the runner has to find the gap in.
   */
  lava(x: number, y: number, z: number, w: number, d: number, color: number = HUE.orange): this {
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d; k++) this.put(x + i, y, z + k, BLOCK, color, HAZARD, 0, LAVA_SURFACE);
    }
    return this;
  }

  /** One kill block — a pillar, a gate post. Same crust as the sea. */
  hazard(x: number, y: number, z: number, color: number = HUE.red): this {
    return this.put(x, y, z, BLOCK, color, HAZARD, 0, LAVA_SURFACE);
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

/**
 * Difficulty tiers, in ladder order.
 *
 * `Obby` is the sixth and is a different axis from the five before it: not
 * harder jumps or smaller landings but *traps* — lava that kills on touch —
 * over a course long enough to be an expedition. It sits after Expert
 * because it assumes every jump the ladder teaches, not because its jumps
 * are worse.
 */
export const TIERS = ["Tutorial", "Easy", "Medium", "Hard", "Expert", "Obby"] as const;
export type Tier = (typeof TIERS)[number];

/** Assemble a course's geometry into the WorldDoc the app loads. */
export function courseDoc(
  course: Course,
  opts: {
    id: string;
    ownerId: string;
    name: string;
    spawn: Vec3;
    /** Which way the runner faces on arrival. Defaults to east — see below. */
    spawnYaw?: number;
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
    // Every map in courses.ts is laid out running east from a plaza at the
    // origin, so east is the default rather than a value each one repeats. A
    // course that ever breaks that habit passes its own.
    spawnYaw: opts.spawnYaw ?? FACING.east,
    goal: opts.goal,
    checkpoints: course.checkpoints,
    sky: opts.sky ?? 0,
    parts: course.parts(),
    props: [],
  };
}

/** The four directions a course can travel, as unit steps on the grid. */
export type Dir = "east" | "west" | "north" | "south";

const STEP: Record<Dir, [number, number]> = {
  east: [1, 0],
  west: [-1, 0],
  north: [0, 1],
  south: [0, -1],
};

/** A pad's footprint on the grid, min-corner addressed. */
export interface Pad {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
}

/**
 * A cursor that walks a course from pad to pad.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The four original courses are written as absolute coordinates, and at four
 * courses that was fine: `c.pad(41, 5, -1, ...)` next to `c.pad(46, 5, -1, ...)`
 * is a gap of two if you subtract, and you can subtract twenty times without
 * getting one wrong. Twenty courses is several hundred of those subtractions,
 * every one of them a place where a jump silently becomes impossible — and the
 * number the arc actually constrains, the gap, never appears in the source at
 * all. It has to be recovered by arithmetic on two other numbers, which is
 * exactly backwards for the one value that can break a level.
 *
 * So a hop states the gap and the rise, and the coordinates are derived:
 *
 *     t.hop("east", 2, 1)   // two cells of air, one cell up
 *
 * ── It refuses to build an impossible course ─────────────────────────────
 *
 * `canClear` is checked here, at construction. `courses.test.ts` already
 * proves the shipped set is finishable, but it proves it about a whole
 * assembled world — the failure says "the goal cannot be reached", and finding
 * which of sixty jumps was wrong is on you. Throwing at the hop names the hop.
 *
 * The test is still the authority and is not redundant: it walks the real
 * surfaces, so it catches routes this cursor cannot see — a pad landing on top
 * of another one, a checkpoint whose next jump only worked from somewhere
 * else, a headroom conflict where two decks stack too close to stand between.
 * This catches the arithmetic; that catches the geometry.
 */
export class Trail {
  private pad_: Pad;

  /**
   * Checkpoints dropped on the current pad that do not yet know which way the
   * run leaves it. `hop` (or `goal`) resolves them — see `mark`.
   */
  private awaiting: Checkpoint[] = [];

  constructor(
    private readonly course: Course,
    start: Pad
  ) {
    this.pad_ = { ...start };
  }

  /** The pad the cursor is standing on. */
  get pad(): Pad {
    return { ...this.pad_ };
  }

  /**
   * The next pad: `gap` empty cells away in `dir`, `rise` cells up.
   *
   * `gap` is a count of empty cells, the same unit `canClear` takes and the
   * same one `course-graph` measures — see the note on `canClear`. Pads keep
   * their footprint unless `size` says otherwise, because a course that
   * changes landing size mid-flight is making a difficulty statement and
   * should have to write it down.
   */
  hop(
    dir: Dir,
    gap: number,
    rise: number,
    deck: number,
    edge: number,
    size?: { w?: number; d?: number },
    finish: number = MATTE
  ): this {
    if (!canClear(gap, rise)) {
      throw new RangeError(
        `unreachable hop: ${gap} cells of air with a rise of ${rise} is past ` +
          `the arc (max ${maxGap(rise).toFixed(2)} at that rise) — see jump-arc.ts`
      );
    }
    // A respawn has to look the way the run is *going*, not the way it came in.
    // Any mark left on the pad we are now leaving learns its facing from this
    // hop — the first move out of it.
    this.aim(FACING[dir]);
    const p = this.pad_;
    const w = size?.w ?? p.w;
    const d = size?.d ?? p.d;
    const [sx, sz] = STEP[dir];

    // Leading edge to leading edge: east and north grow away from the current
    // pad's far side, west and south grow back from its near side, so the
    // empty cells between the two footprints number exactly `gap` either way.
    const x =
      sx > 0 ? p.x + p.w + gap : sx < 0 ? p.x - gap - w : p.x + Math.round((p.w - w) / 2);
    const z =
      sz > 0 ? p.z + p.d + gap : sz < 0 ? p.z - gap - d : p.z + Math.round((p.d - d) / 2);

    this.pad_ = { x, y: p.y + rise, z, w, d };
    this.course.pad(x, p.y + rise, z, w, d, deck, edge, finish);
    return this;
  }

  /**
   * A checkpoint in the middle of the pad the cursor is on.
   *
   * Its facing is deferred by default: the next `hop` points it the way the
   * run leaves this pad, which is the one direction a resume must not get
   * wrong. Pass `next` only when this trail is about to be abandoned for a
   * fresh one — across a staircase, say — so there is no hop coming to infer
   * it from.
   */
  mark(next?: Dir): this {
    const p = this.pad_;
    this.course.checkpoint(
      p.x + Math.floor(p.w / 2),
      p.y,
      p.z + Math.floor(p.d / 2),
      // A placeholder when deferred; `hop`/`goal` overwrites it before the
      // doc is assembled, and `facing.test.ts` fails loudly if one slips out.
      next ? FACING[next] : FACING.east
    );
    if (!next) {
      this.awaiting.push(
        this.course.checkpoints[this.course.checkpoints.length - 1]
      );
    }
    return this;
  }

  /**
   * The goal standing on the middle of the current pad. Also aims a trailing
   * `mark` at the finish, for a course that ends on a checkpoint.
   */
  goal(): Vec3 {
    const p = this.pad_;
    const gx = p.x + Math.floor(p.w / 2);
    const gz = p.z + Math.floor(p.d / 2);
    for (const cp of this.awaiting) {
      cp.yaw = facing(gx - cp.pos[0], gz - cp.pos[2]);
    }
    this.awaiting = [];
    return goalOver(gx, p.y, gz);
  }

  /** Give every still-unaimed mark on the current pad a facing. */
  private aim(yaw: number): void {
    for (const cp of this.awaiting) cp.yaw = yaw;
    this.awaiting = [];
  }
}
