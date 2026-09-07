import {
  BLOCK,
  Course,
  courseDoc,
  type Dir,
  GLOSSY,
  GLOW,
  goalOver,
  HUE,
  Trail,
} from "../course-kit";
import type { Vec3, WorldDoc } from "../worlddoc";
import type { CourseEntry } from "../courses";

/**
 * Hard — the three courses after Vault of Wires.
 *
 * The landings are 2x2 now, and 2x1 where the course wants to make a point. A
 * 3x3 pad forgives a jump by a whole cell either side of the middle; a 2x2
 * forgives it by nothing — you are either on the pad or you are not — and
 * every one of these courses reaches most of its pads out of a turn, the way
 * Medium does, so the two mistakes compound.
 *
 * Consequence is the other lever. Tutorial and Easy drop a checkpoint every
 * few jumps; these space them so a fall through the wrong part of a section
 * costs the section. The Gauntlet's plunge has one checkpoint before all of
 * it.
 */

// ─────────────────────────────────────────────────────────────────────────
// Zip Line
// ─────────────────────────────────────────────────────────────────────────

/**
 * Vault's zigzag, made the whole course.
 *
 * Every hop changes axis and every hop climbs — east, north, east, north — on
 * 2x2 pads, so it is sixteen separate decisions with no two in a row alike and
 * no cell of slack on any of the landings. The only wide pads are the three
 * you resume from.
 */
const ZIPLINE_SPAWN: Vec3 = [0, 2, 0];

function zipLine(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-5, 0, -5, 11, 11, HUE.purple, HUE.fuchsia);

  const t = new Trail(c, { x: -5, y: 0, z: -5, w: 11, d: 11 });
  t.hop("east", 2, 0, HUE.violet, HUE.pink, { w: 2, d: 2 });

  const zig: Dir[] = ["east", "north"];
  /** `n` alternating climbing hops, then a 3x3 pad to bank. */
  const run = (n: number, from: number) => {
    for (let i = 0; i < n; i++) t.hop(zig[(from + i) % 2], 2, 1, HUE.violet, HUE.pink);
    t.hop("east", 2, 0, HUE.purple, HUE.pink, { w: 3, d: 3 });
    t.mark();
  };

  run(5, 0);
  run(5, 1);
  run(5, 0);
  for (let i = 0; i < 3; i++) t.hop(zig[i % 2], 2, 1, HUE.violet, HUE.pink);
  t.mark();

  t.hop("east", 2, 1, HUE.purple, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.violet, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: ZIPLINE_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// The Gauntlet
// ─────────────────────────────────────────────────────────────────────────

/**
 * A climb, one checkpoint, and then a plunge with nothing to catch you.
 *
 * The whole descent — six 2x2 pads, gap 3 and gap 4, coming off a fall at full
 * speed — is banked by a single checkpoint at the top of it. Miss the third
 * pad and you are back at the top doing all six again. That is the tier's
 * consequence lever turned as far as it goes before Expert.
 */
const GAUNTLET_SPAWN: Vec3 = [0, 2, 0];

function gauntlet(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-5, 0, -5, 11, 11, HUE.ink, HUE.orange);

  const t = new Trail(c, { x: -5, y: 0, z: -5, w: 11, d: 11 });
  t.hop("east", 2, 0, HUE.red, HUE.amber, { w: 2, d: 2 });

  // The climb up to the plunge — a zigzag on 2x2, gaining the height the
  // descent spends.
  const up: Dir[] = ["east", "north"];
  for (let i = 0; i < 14; i++) t.hop(up[i % 2], 2, 1, HUE.red, HUE.amber);
  t.hop("east", 2, 0, HUE.orange, HUE.amber, { w: 3, d: 3 });
  t.mark();

  // A run of tight flat jumps — gap 3, no rise, 2x2 landings.
  t.hop("east", 3, 0, HUE.red, HUE.amber, { w: 2, d: 2 });
  t.hop("east", 3, 0, HUE.orange, HUE.amber, { w: 3, d: 3 });
  t.mark();

  // The plunge. One checkpoint above it, then six pads down to the floor.
  t.hop("east", 3, -2, HUE.red, HUE.orange, { w: 2, d: 2 });
  t.hop("north", 3, -2, HUE.red, HUE.orange);
  t.hop("east", 4, -3, HUE.red, HUE.orange);
  t.hop("south", 3, -2, HUE.red, HUE.orange);
  t.hop("east", 4, -3, HUE.red, HUE.orange);
  t.hop("east", 3, -1, HUE.orange, HUE.amber, { w: 3, d: 3 });
  t.mark();

  // A short spiral back up to the finish.
  t.hop("north", 2, 1, HUE.red, HUE.amber, { w: 2, d: 2 });
  t.hop("east", 2, 1, HUE.red, HUE.amber);
  t.hop("south", 2, 1, HUE.red, HUE.amber);
  t.mark();

  t.hop("east", 2, 1, HUE.ink, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.orange, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: GAUNTLET_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Needlepoint
// ─────────────────────────────────────────────────────────────────────────

/**
 * 2x2 pads and 2x1 pads, alternating, mostly straight.
 *
 * The skinny pads sit end-on to the direction of travel, so the landing you
 * cannot afford to overshoot is also the one you can see least of on the way
 * in. Straighter than the rest of the tier on purpose — the difficulty is
 * entirely the width of every other landing.
 */
const NEEDLE_SPAWN: Vec3 = [0, 2, 0];

function needlepoint(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-5, 0, -5, 11, 11, HUE.slate, HUE.cyan);

  const t = new Trail(c, { x: -5, y: 0, z: -5, w: 11, d: 11 });
  t.hop("east", 2, 0, HUE.blue, HUE.cyan, { w: 2, d: 2 });

  // Straight east: 2x2 pad, then a needle one cell deep in the travel
  // direction — the landing you overshoot — over and over, climbing.
  for (let i = 0; i < 6; i++) {
    t.hop("east", 2, 1, HUE.teal, HUE.cyan, { w: 2, d: 2 });
    t.hop("east", 2, 0, HUE.sky, HUE.cyan, { w: 1, d: 2 });
  }
  t.hop("east", 2, 0, HUE.blue, HUE.cyan, { w: 3, d: 3 });
  t.mark();

  // A turn, then the same again heading north — needles one cell deep in z now.
  for (let i = 0; i < 5; i++) {
    t.hop("north", 2, 1, HUE.teal, HUE.cyan, { w: 2, d: 2 });
    t.hop("north", 2, 0, HUE.sky, HUE.cyan, { w: 2, d: 1 });
  }
  t.hop("north", 2, 0, HUE.blue, HUE.cyan, { w: 3, d: 3 });
  t.mark();

  // A gap-3 descent onto needles.
  for (let i = 0; i < 4; i++) {
    t.hop("north", 3, -2, HUE.teal, HUE.cyan, { w: 2, d: 2 });
  }
  t.hop("north", 2, 0, HUE.blue, HUE.cyan, { w: 3, d: 3 });
  t.mark();

  for (let i = 0; i < 3; i++) t.hop("north", 2, 1, HUE.teal, HUE.cyan, { w: 2, d: 2 });
  t.mark();

  t.hop("north", 2, 1, HUE.slate, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.blue, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: NEEDLE_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

/** The three Hard courses that follow Vault of Wires, in ladder order. */
export const HARD_COURSES: CourseEntry[] = [
  {
    slug: "zipline",
    name: "Zip Line",
    tier: "Hard",
    blurb: "Vault's zigzag as the whole course. Sixteen turns, not one cell of slack.",
    build: (ownerId) => zipLine("zipline", ownerId, "Zip Line"),
  },
  {
    slug: "gauntlet",
    name: "The Gauntlet",
    tier: "Hard",
    blurb: "A plunge of six 2x2 pads, banked by one checkpoint at the top of it.",
    build: (ownerId) => gauntlet("gauntlet", ownerId, "The Gauntlet"),
  },
  {
    slug: "needle",
    name: "Needlepoint",
    tier: "Hard",
    blurb: "Every other landing is a 2x1 pad seen end-on. Straight, and unforgiving.",
    build: (ownerId) => needlepoint("needle", ownerId, "Needlepoint"),
  },
];
