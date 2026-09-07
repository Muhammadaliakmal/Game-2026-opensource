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
 * Expert — the three courses after Overclock.
 *
 * Single-cell landings, the whole way, exactly as Overclock does it: nothing
 * beside the block you are aiming at, so a jump that is a little short or a
 * little long is a jump into the void. `courses.test.ts` counts the isolated
 * landings on every course and holds this tier to fifteen or more of them.
 *
 * Each course also spends the arc's last margin once — a gap of three with a
 * rise, which `jump-arc.ts` says is the longest jump the character can be
 * asked for — and each puts that jump immediately after a checkpoint, because
 * a jump on the limit is only fair when failing it is cheap.
 *
 * Every landing here glows: an unlit single cell in a night sky is a jump you
 * take on faith. Only the wide resume pads and the finish are matte.
 */

const LIT = GLOW;

// ─────────────────────────────────────────────────────────────────────────
// Filament
// ─────────────────────────────────────────────────────────────────────────

/**
 * Flat, and turning the whole time.
 *
 * Overclock climbs; this one barely leaves the height it starts at and instead
 * drifts a cell sideways on almost every hop, so the line is never the one the
 * last jump left the player facing. The single climbing jump is the long one —
 * gap three, one cell up — and it is the hop straight out of the second
 * checkpoint.
 */
const FILAMENT_SPAWN: Vec3 = [0, 2, 0];

function filament(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.cyan);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.cyan, HUE.cyan, { w: 1, d: 1 }, LIT);

  /** A drift of single lit cells, one hop per direction given. */
  const drift = (steps: Dir[]) => {
    for (const d of steps) t.hop(d, 2, 0, HUE.cyan, HUE.cyan, { w: 1, d: 1 }, LIT);
  };

  drift(["east", "north", "east", "south", "east", "north", "east", "south"]);
  t.hop("east", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  drift(["east", "east", "north", "east", "south", "east"]);
  t.hop("east", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  // The long one, straight out of the checkpoint: gap 3, one cell up.
  t.hop("east", 3, 1, HUE.acid, HUE.acid, { w: 1, d: 1 }, LIT);
  drift(["north", "east", "south", "east", "north", "east", "south", "east"]);
  t.hop("east", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  drift(["east", "north", "east", "south", "east", "east"]);
  t.mark();

  t.hop("east", 2, 0, HUE.ink, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.cyan, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: FILAMENT_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Arc Light
// ─────────────────────────────────────────────────────────────────────────

/**
 * A single-cell spiral, most of the way up, then the whole way down.
 *
 * Where Filament stays flat, this goes almost straight up: a switchback of lit
 * cells that alternates axis and gains a cell every hop, until the finish is
 * far enough below that the descent is a string of gap-4 drops. The arc-limit
 * hop is the first one after the top checkpoint, aiming at a cell you cannot
 * see the deck of because it is above you.
 */
const ARCLIGHT_SPAWN: Vec3 = [0, 2, 0];

function arcLight(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.violet);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.violet, HUE.violet, { w: 1, d: 1 }, LIT);

  const spin: Dir[] = ["east", "north", "west", "north"];
  /** `n` climbing single-cell hops around the spiral, from phase `from`. */
  const climb = (n: number, from: number) => {
    for (let i = 0; i < n; i++) {
      t.hop(spin[(from + i) % 4], 2, 1, HUE.violet, HUE.violet, { w: 1, d: 1 }, LIT);
    }
  };

  climb(7, 0);
  t.hop("north", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  climb(7, 2);
  t.hop("north", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  climb(6, 0);
  t.hop("north", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  // The arc-limit hop, straight off the checkpoint: gap 3, one cell up.
  t.hop("north", 3, 1, HUE.acid, HUE.acid, { w: 1, d: 1 }, LIT);
  // The descent — gap 4, three cells down, around the same square.
  t.hop("east", 4, -3, HUE.fuchsia, HUE.fuchsia, { w: 1, d: 1 }, LIT);
  t.hop("north", 4, -3, HUE.fuchsia, HUE.fuchsia, { w: 1, d: 1 }, LIT);
  t.hop("west", 4, -3, HUE.fuchsia, HUE.fuchsia, { w: 1, d: 1 }, LIT);
  t.hop("north", 3, -2, HUE.fuchsia, HUE.fuchsia, { w: 1, d: 1 }, LIT);
  t.hop("east", 3, -2, HUE.fuchsia, HUE.fuchsia, { w: 1, d: 1 }, LIT);
  t.mark();

  t.hop("east", 2, -1, HUE.ink, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.violet, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: ARCLIGHT_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Lattice
// ─────────────────────────────────────────────────────────────────────────

/**
 * Axis change on every hop, single cells, and two plunges.
 *
 * No two jumps in a row go the same way — east, north, east, north — so the
 * course is a grid of lit points and the player is turning ninety degrees
 * into a one-cell target every time. The two plunges are the rests: a gap-4
 * drop buys most of a second of air, and after a section of nothing but turns,
 * a jump you only have to point at feels like one.
 */
const LATTICE_SPAWN: Vec3 = [0, 2, 0];

function lattice(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.acid);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.cyan, HUE.cyan, { w: 1, d: 1 }, LIT);

  const grid: Dir[] = ["east", "north"];
  /** `n` alternating single-cell hops, climbing by `rise` each. */
  const weave = (n: number, from: number, rise: number) => {
    for (let i = 0; i < n; i++) {
      t.hop(grid[(from + i) % 2], 2, rise, HUE.cyan, HUE.cyan, { w: 1, d: 1 }, LIT);
    }
  };

  weave(9, 0, 1);
  t.hop("east", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  // First plunge — gap 4, three cells down, twice.
  t.hop("east", 4, -3, HUE.teal, HUE.teal, { w: 1, d: 1 }, LIT);
  t.hop("east", 4, -3, HUE.teal, HUE.teal, { w: 1, d: 1 }, LIT);
  t.hop("east", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  // The arc-limit hop off the checkpoint, then more weave.
  t.hop("east", 3, 1, HUE.acid, HUE.acid, { w: 1, d: 1 }, LIT);
  weave(8, 1, 1);
  t.hop("east", 2, 0, HUE.ink, HUE.acid, { w: 3, d: 3 });
  t.mark();

  // Second plunge, into the finish yard.
  t.hop("east", 4, -3, HUE.teal, HUE.teal, { w: 1, d: 1 }, LIT);
  t.hop("north", 4, -3, HUE.teal, HUE.teal, { w: 1, d: 1 }, LIT);
  t.hop("east", 3, -2, HUE.teal, HUE.teal, { w: 1, d: 1 }, LIT);
  t.mark();

  t.hop("east", 2, -1, HUE.ink, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.cyan, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: LATTICE_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

/** The three Expert courses that follow Overclock, in ladder order. */
export const EXPERT_COURSES: CourseEntry[] = [
  {
    slug: "filament",
    name: "Filament",
    tier: "Expert",
    blurb: "Flat single-cell landings, turning the whole time. One long jump up.",
    build: (ownerId) => filament("filament", ownerId, "Filament"),
  },
  {
    slug: "arclight",
    name: "Arc Light",
    tier: "Expert",
    blurb: "A single-cell spiral almost straight up, then the whole way back down.",
    build: (ownerId) => arcLight("arclight", ownerId, "Arc Light"),
  },
  {
    slug: "lattice",
    name: "Lattice",
    tier: "Expert",
    blurb: "Ninety degrees into a one-cell target every hop, with two plunges to rest.",
    build: (ownerId) => lattice("lattice", ownerId, "Lattice"),
  },
];
