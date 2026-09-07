import {
  BLOCK,
  Course,
  courseDoc,
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
 * Tutorial — the three courses after Neon Run.
 *
 * ── What a Tutorial course may not do ────────────────────────────────────
 *
 * One rule, and `courses.test.ts` enforces it: **no isolated landings.** Every
 * surface a player can reach has another one beside it, so a jump that comes
 * up short or long puts them on the wrong part of the right platform rather
 * than in the void. That is the whole difference between this tier and the
 * next four — the jumps are identical, the punishment for missing is not.
 *
 * Beyond that the tier is deliberately monotonous. Every hop is two cells of
 * air, every rise is one cell, and the pads are five wide. A player finishing
 * these three has made the same jump about sixty times, which is the point:
 * Easy asks for that jump with a turn attached, and Medium asks for it when
 * you are not already facing the landing.
 *
 * Length carries the tier instead of difficulty. These are long walks with
 * frequent checkpoints — a fall costs a few seconds, so the courses can afford
 * to be places rather than tests.
 */

// ─────────────────────────────────────────────────────────────────────────
// Harbour Steps
// ─────────────────────────────────────────────────────────────────────────

/**
 * A causeway out, a climb, and a long shelf back.
 *
 * The first course that is a *shape* — out east, north across the top, and
 * west along a shelf to a lit finish — so the player sees where they are going
 * from the plaza and sees where they have been from the shelf. Neon Run is a
 * corridor; this is the same corridor bent twice, and bending it is all it
 * takes for the climb to feel like it went somewhere.
 */
const STEPS_SPAWN: Vec3 = [0, 2, 0];

function harbourSteps(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  // The plaza. Thirteen across on every course in the tier, so the first thing
  // a player does is always land somewhere they cannot fall off.
  c.pad(-6, 0, -6, 13, 13, HUE.indigo, HUE.cyan);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });

  // The causeway: five flat hops east, all identical.
  for (let i = 0; i < 5; i++) {
    t.hop("east", 2, 0, HUE.sky, HUE.cyan, i === 0 ? { w: 5, d: 5 } : undefined);
  }
  t.mark();

  // The climb: the same hop, now gaining a cell each time.
  for (let i = 0; i < 4; i++) t.hop("east", 2, 1, HUE.blue, HUE.cyan);
  t.mark();

  // North across the top of the map.
  for (let i = 0; i < 3; i++) t.hop("north", 2, 0, HUE.teal, HUE.cyan);
  t.hop("north", 2, 1, HUE.teal, HUE.cyan);
  t.mark();

  // The shelf home, running back west above the causeway.
  for (let i = 0; i < 5; i++) t.hop("west", 2, 0, HUE.emerald, HUE.acid);
  t.mark();
  t.hop("west", 2, 1, HUE.emerald, HUE.acid);

  // The finish deck, wide enough that arriving is never the hard part.
  t.hop("west", 2, 0, HUE.indigo, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.violet, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: STEPS_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Lantern Row
// ─────────────────────────────────────────────────────────────────────────

/**
 * A wide street with a lantern on every pad, and one turn in the middle.
 *
 * Built to be read from a distance. The lanterns are two cells tall and sit at
 * a corner of each pad, so from the plaza the whole route is a line of lights
 * receding — and the turn is visible as the place where the line stops going
 * away from you and starts going sideways.
 *
 * The lanterns stand ON the pads rather than beside them, which costs the
 * player nothing (a five-wide pad with one corner occupied is still four wide)
 * and buys the course its only piece of landmark navigation.
 */
const LANTERN_SPAWN: Vec3 = [0, 2, 0];

function lanternRow(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.amber);

  /**
   * A three-cell post with a lit cap, standing on the pad at (x, y, z).
   *
   * Three and not two, which is the height it looks better at. A two-cell post
   * puts its cap one cell above the *next* pad's deck, and one cell above a
   * deck two cells away is a jump the arc allows — so the cap became a
   * reachable surface with nothing beside it, which is precisely the
   * one-block landing this tier is defined by not having. At three, the cap is
   * two cells above anything that can reach it, and two is past the apex.
   */
  const lantern = (x: number, y: number, z: number) => {
    c.put(x, y + 1, z, BLOCK, HUE.slate, GLOSSY);
    c.put(x, y + 2, z, BLOCK, HUE.slate, GLOSSY);
    c.put(x, y + 3, z, BLOCK, HUE.amber, GLOW);
  };

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  const lit = () => {
    const p = t.pad;
    lantern(p.x, p.y, p.z);
  };

  // North up the street, climbing every other pad.
  for (let i = 0; i < 8; i++) {
    t.hop("north", 2, i % 2, HUE.orange, HUE.amber, i === 0 ? { w: 5, d: 5 } : undefined);
    lit();
    if (i === 3) t.mark();
  }
  t.mark();

  // The turn: west, along the top of the street.
  for (let i = 0; i < 6; i++) {
    t.hop("west", 2, i % 3 === 2 ? 1 : 0, HUE.red, HUE.amber);
    lit();
    if (i === 2) t.mark();
  }
  t.mark();

  // The last stretch, and a finish that is itself the biggest lantern here.
  t.hop("north", 2, 0, HUE.ink, HUE.amber, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.orange, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: LANTERN_SPAWN,
    spawnYaw: FACING.north,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
    sky: 1,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Meadow Rise
// ─────────────────────────────────────────────────────────────────────────

/**
 * Nothing but climbing, for a long time, with two staircases as rest.
 *
 * The tier's altitude course. Every hop gains a cell, so by the finish the
 * plaza is twenty-odd cells below and still visible — and the two flights of
 * stairs exist because a course made only of jumps has no moment where the
 * player can look up and see how far they have come. Climbing them costs
 * nothing and is where the view is.
 */
const MEADOW_SPAWN: Vec3 = [0, 2, 0];

function meadowRise(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.slate, HUE.lime);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });

  // First flight — six climbing hops east.
  for (let i = 0; i < 6; i++) {
    t.hop("east", 2, 1, HUE.green, HUE.lime, i === 0 ? { w: 5, d: 5 } : undefined);
  }
  t.mark("east");

  // A staircase, walked rather than jumped. It starts one cell clear of the
  // pad so the two never share a column — a tread directly over a deck would
  // take the headroom off it and quietly delete a landing.
  let p = t.pad;
  c.stairs(p.x + p.w + 1, p.y + 1, p.z, 6, 5, "x", HUE.emerald);
  const t2 = new Trail(c, {
    x: p.x + p.w + 1,
    y: p.y + 6,
    z: p.z,
    w: 6,
    d: 5,
  });
  t2.hop("east", 1, 0, HUE.green, HUE.lime, { w: 5, d: 5 });
  t2.mark();

  // Second flight, turning north halfway so the climb is not one held key.
  for (let i = 0; i < 4; i++) t2.hop("east", 2, 1, HUE.emerald, HUE.lime);
  t2.mark();
  for (let i = 0; i < 4; i++) t2.hop("north", 2, 1, HUE.teal, HUE.lime);
  t2.mark("north");

  // Second staircase, climbing north this time.
  p = t2.pad;
  c.stairs(p.x, p.y + 1, p.z + p.d + 1, 6, 5, "z", HUE.emerald);
  const t3 = new Trail(c, {
    x: p.x,
    y: p.y + 6,
    z: p.z + p.d + 1,
    w: 5,
    d: 6,
  });
  t3.hop("north", 1, 0, HUE.green, HUE.lime, { w: 5, d: 5 });
  t3.mark();

  // The summit.
  for (let i = 0; i < 3; i++) t3.hop("east", 2, 1, HUE.lime, HUE.acid);
  t3.hop("east", 2, 0, HUE.slate, HUE.acid, { w: 9, d: 9 });
  p = t3.pad;
  c.fill(p.x + 3, p.y + 1, p.z + 3, 3, 3, HUE.green, GLOSSY);
  c.put(p.x + 4, p.y + 2, p.z + 4, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: MEADOW_SPAWN,
    goal: goalOver(p.x + 4, p.y + 2, p.z + 4),
  });
}

/** The three Tutorial courses that follow Neon Run, in ladder order. */
export const TUTORIAL_COURSES: CourseEntry[] = [
  {
    slug: "steps",
    name: "Harbour Steps",
    tier: "Tutorial",
    blurb: "A causeway out, a climb, and a long shelf home. Nothing to fall off.",
    build: (ownerId) => harbourSteps("steps", ownerId, "Harbour Steps"),
  },
  {
    slug: "lanterns",
    name: "Lantern Row",
    tier: "Tutorial",
    blurb: "A lit street with one turn in it. The route is visible from the start.",
    build: (ownerId) => lanternRow("lanterns", ownerId, "Lantern Row"),
  },
  {
    slug: "meadow",
    name: "Meadow Rise",
    tier: "Tutorial",
    blurb: "A long climb to a summit, with two staircases to rest on.",
    build: (ownerId) => meadowRise("meadow", ownerId, "Meadow Rise"),
  },
];
