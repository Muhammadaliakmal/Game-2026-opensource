import {
  BLOCK,
  Course,
  courseDoc,
  type Dir,
  FACING,
  GLOSSY,
  GLOW,
  goalOver,
  HUE,
  Trail,
} from "../course-kit";
import type { Vec3, WorldDoc } from "../worlddoc";
import type { CourseEntry } from "../courses";

/**
 * Easy — the three courses after Beacon Climb.
 *
 * Still no isolated landings: a miss on this tier puts you on the wrong corner
 * of the right pad, never in the void, and `courses.test.ts` holds the set to
 * it. What changes from Tutorial is that the landing is no longer in front of
 * you. Every course here turns — a helix that turns four times a lap, a route
 * that doubles back under itself, an orchard with no straight line in it — so
 * the jump the player learned facing east has to be made facing anywhere.
 *
 * Pads drop from five wide to three, which is the tier's other half: three is
 * still forgiving (a whole cell of slop on each side of the middle) and it is
 * small enough that the edge is somewhere you can see rather than somewhere
 * you assume.
 */

// ─────────────────────────────────────────────────────────────────────────
// Spiral Yard
// ─────────────────────────────────────────────────────────────────────────

/**
 * A square helix: two laps of the same yard, thirty cells higher each time.
 *
 * The turn drill. Eighteen hops to a lap and four of them are corners, so a
 * quarter of the course is a jump taken out of a direction change — and
 * because the second lap runs directly above the first, the player can see the
 * route they just took underneath them and knows exactly how far they have
 * come. That readability is the whole reason it is a helix and not a line.
 *
 * The two laps are nine cells apart vertically, which matters for more than
 * the view: a surface needs two clear cells above it to be standable at all,
 * so a helix with a tighter pitch would have the upper lap quietly deleting
 * the landings on the lower one.
 */
const SPIRAL_SPAWN: Vec3 = [0, 2, 0];

function spiralYard(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.violet);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.purple, HUE.violet, { w: 3, d: 3 });

  /** One side of the yard. The rise alternates so a lap climbs half its length. */
  const leg = (dir: Dir, n: number, deck: number, edge: number) => {
    for (let i = 0; i < n; i++) t.hop(dir, 2, i % 2, deck, edge);
    t.mark();
  };

  for (let lap = 0; lap < 2; lap++) {
    // Each side gets its own colour, so "which lap am I on" is answerable at a
    // glance from anywhere on the map.
    leg("east", 5, lap ? HUE.fuchsia : HUE.purple, HUE.violet);
    leg("north", 4, lap ? HUE.pink : HUE.indigo, HUE.violet);
    leg("west", 5, lap ? HUE.fuchsia : HUE.purple, HUE.violet);
    leg("south", 4, lap ? HUE.pink : HUE.indigo, HUE.violet);
  }

  // Out of the helix and onto the roof.
  t.hop("east", 2, 1, HUE.violet, HUE.acid, { w: 9, d: 9 });
  const p = t.pad;
  c.fill(p.x + 3, p.y + 1, p.z + 3, 3, 3, HUE.purple, GLOSSY);
  c.put(p.x + 4, p.y + 2, p.z + 4, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: SPIRAL_SPAWN,
    goal: goalOver(p.x + 4, p.y + 2, p.z + 4),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Copper Bridges
// ─────────────────────────────────────────────────────────────────────────

/**
 * Long spans with landings between them, and two descents that open up.
 *
 * Where the tier introduces gap 3 — but only downhill. Falling two cells buys
 * about a fifth of a second of extra airtime, which is the difference between
 * a three-cell gap being at the edge of the arc and being comfortably inside
 * it, so a descending three reads as *generous* even though the number went
 * up. Doing that deliberately here is what stops a player reading gap size as
 * difficulty later, when Overclock uses a four.
 *
 * The bridges themselves are three wide and walked, not jumped. They exist to
 * put distance between the interesting moments — a course that is nothing but
 * landings gives the player nowhere to look up.
 */
const BRIDGES_SPAWN: Vec3 = [0, 2, 0];

function copperBridges(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.orange);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });

  /** A walkable span, then the pad at the end of it. */
  const bridge = (dir: Dir, len: number, deck: number) => {
    t.hop(dir, 2, 0, deck, HUE.amber, dir === "east" || dir === "west" ? { w: len, d: 3 } : { w: 3, d: len });
    t.hop(dir, 2, 0, HUE.orange, HUE.amber, { w: 3, d: 3 });
  };

  // Up onto the bridges first — a descent has to have somewhere to fall from.
  for (let i = 0; i < 6; i++) {
    t.hop("east", 2, 1, HUE.orange, HUE.amber, i === 0 ? { w: 3, d: 3 } : undefined);
  }
  t.mark();

  bridge("east", 8, HUE.red);
  // A little more height to spend on the drop.
  for (let i = 0; i < 3; i++) t.hop("east", 2, 1, HUE.orange, HUE.amber);
  t.mark();

  // First descent — three cells of air, two cells down, three times. Nine cells
  // up buys the airtime that makes a three-cell gap read as generous.
  for (let i = 0; i < 3; i++) t.hop("east", 3, -2, HUE.amber, HUE.orange);
  t.mark();

  // North, over the top, climbing back to height.
  bridge("north", 8, HUE.red);
  for (let i = 0; i < 5; i++) t.hop("north", 2, 1, HUE.orange, HUE.amber);
  t.mark();

  bridge("west", 10, HUE.red);
  t.hop("west", 2, 1, HUE.orange, HUE.amber);
  t.mark();

  // Second descent, longer, into the finish yard.
  for (let i = 0; i < 4; i++) t.hop("west", 3, -2, HUE.amber, HUE.orange);
  t.mark();

  t.hop("west", 2, 0, HUE.ink, HUE.acid, { w: 9, d: 9 });
  const p = t.pad;
  c.fill(p.x + 3, p.y + 1, p.z + 3, 3, 3, HUE.red, GLOSSY);
  c.put(p.x + 4, p.y + 2, p.z + 4, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: BRIDGES_SPAWN,
    goal: goalOver(p.x + 4, p.y + 2, p.z + 4),
    sky: 1,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sky Orchard
// ─────────────────────────────────────────────────────────────────────────

/**
 * A route with no straight section in it, through trees.
 *
 * Every second hop changes axis, which makes it the turn-heaviest map in the
 * tier and the closest thing Easy has to a preview of Cinder Gap's S-bend. The
 * trees are landmarks and shade, never obstacles: the trunk stands in a corner
 * cell of a pad and the canopy sits five cells up, well past the apex of a
 * jump, so nothing a player can reach is ever a tree.
 */
const ORCHARD_SPAWN: Vec3 = [0, 2, 0];

function skyOrchard(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.slate, HUE.green);

  /**
   * A trunk in the corner cell of a pad, with a canopy above the arc.
   *
   * Four cells of trunk puts the canopy's top face six above the deck it grows
   * from — the apex of a jump is a cell and a half, so no part of a tree is a
   * surface anyone can stand on. That is deliberate: a reachable canopy would
   * be a landing this tier is not allowed to have, and an unreachable one is
   * scenery that can never be in the way.
   */
  const tree = (x: number, y: number, z: number) => {
    for (let h = 1; h <= 4; h++) c.put(x, y + h, z, BLOCK, HUE.slate, 0);
    c.fill(x - 1, y + 5, z - 1, 3, 3, HUE.green, 0);
    c.put(x, y + 6, z, BLOCK, HUE.lime, GLOW);
  };

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.green, HUE.lime, { w: 3, d: 3 });

  // The weave: two hops in a direction, then a quarter turn, all the way out.
  const weave: Dir[] = ["east", "north", "east", "south", "east", "north"];
  for (const [i, dir] of weave.entries()) {
    t.hop(dir, 2, i % 2, HUE.green, HUE.lime);
    t.hop(dir, 2, 0, HUE.emerald, HUE.lime);
    const p = t.pad;
    if (i % 2 === 0) tree(p.x, p.y, p.z);
    if (i === 1 || i === 4) t.mark();
  }
  t.mark();

  // The orchard floor: a wide terrace, then the weave again heading home.
  t.hop("east", 2, 0, HUE.slate, HUE.green, { w: 9, d: 9 });
  t.mark();

  t.hop("north", 2, 0, HUE.emerald, HUE.lime, { w: 3, d: 3 });
  const home: Dir[] = ["north", "west", "north", "west", "north", "west"];
  for (const [i, dir] of home.entries()) {
    t.hop(dir, 2, i % 2, HUE.teal, HUE.lime);
    t.hop(dir, 2, 0, HUE.emerald, HUE.lime);
    const p = t.pad;
    if (i % 2 === 1) tree(p.x, p.y, p.z);
    if (i === 2) t.mark();
  }
  t.mark();

  t.hop("north", 2, 0, HUE.slate, HUE.acid, { w: 9, d: 9 });
  const p = t.pad;
  c.fill(p.x + 3, p.y + 1, p.z + 3, 3, 3, HUE.green, GLOSSY);
  c.put(p.x + 4, p.y + 2, p.z + 4, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: ORCHARD_SPAWN,
    spawnYaw: FACING.east,
    goal: goalOver(p.x + 4, p.y + 2, p.z + 4),
  });
}

/** The three Easy courses that follow Beacon Climb, in ladder order. */
export const EASY_COURSES: CourseEntry[] = [
  {
    slug: "spiral",
    name: "Spiral Yard",
    tier: "Easy",
    blurb: "Two laps of a square helix. A quarter of the jumps are corners.",
    build: (ownerId) => spiralYard("spiral", ownerId, "Spiral Yard"),
  },
  {
    slug: "bridges",
    name: "Copper Bridges",
    tier: "Easy",
    blurb: "Long spans between landings, and two descents that open up to three.",
    build: (ownerId) => copperBridges("bridges", ownerId, "Copper Bridges"),
  },
  {
    slug: "orchard",
    name: "Sky Orchard",
    tier: "Easy",
    blurb: "A weave with no straight section in it, through unreachable trees.",
    build: (ownerId) => skyOrchard("orchard", ownerId, "Sky Orchard"),
  },
];
