import {
  BLOCK,
  Course,
  courseDoc,
  FACING,
  GLOSSY,
  GLOW,
  goalOver,
  HUE,
  type Tier,
} from "./course-kit";
import type { Vec3, WorldDoc } from "./worlddoc";
import { TUTORIAL_COURSES } from "./courses/tutorial";
import { EASY_COURSES } from "./courses/easy";
import { MEDIUM_COURSES } from "./courses/medium";
import { HARD_COURSES } from "./courses/hard";
import { EXPERT_COURSES } from "./courses/expert";
import { OBBY_COURSES } from "./courses/obby";

/**
 * The tiered parkour set — SPEC phase 6d.
 *
 * Twenty courses, four to a tier. This file holds the four that predate the
 * cursor in `course-kit.ts` — Beacon Climb, Cinder Gap, Vault of Wires,
 * Overclock, written as absolute coordinates — and stitches in the rest from
 * `courses/{tutorial,easy,medium,hard,expert}.ts`, which are written as hops.
 *
 * ── What makes a course harder ───────────────────────────────────────────
 *
 * Not longer jumps. `jump-arc.ts` fixes the ceiling on those, every map in the
 * set is built under it, and `courses.test.ts` proves it — a course that asked
 * for more would not be Expert, it would be broken. Nor is it length: a long
 * course is a *tiring* course, and with checkpoints in it, length costs the
 * player time rather than skill.
 *
 * Three levers do the work instead, and they are turned in this order:
 *
 *  1. **Landing size.** 3x3 pads on the low tiers, 2x2 on Hard, single cells
 *     on Expert. The jump is the same jump; the room for error is not.
 *  2. **Turns.** A jump you take by holding one key is free. Every turn is a
 *     decision made at speed, and the harder maps chain them — the difficulty
 *     of Vault's zigzag is entirely that it alternates axis every pad.
 *  3. **Consequence.** How far back the last checkpoint is. Tutorial and Easy
 *     forgive a fall almost completely; the Expert plunges do not.
 *
 * Gap length is used for *rhythm*, not difficulty: the descents open up to
 * three and four cells because falling buys airtime, and a course that never
 * changes its jump length reads as one note held for two minutes.
 *
 * ── Reading the coordinates ──────────────────────────────────────────────
 *
 * Everything is min-corner, so a 3-wide pad at x=8 occupies 8..10 and the next
 * one at x=13 leaves cells 11 and 12 empty: a gap of 2. That count — empty
 * cells between two pads — is exactly the distance the character has to fly,
 * and it is the number the arc is checked against.
 */

/** A course in the ladder, with everything the browse page needs to rank it. */
export interface CourseEntry {
  slug: string;
  name: string;
  tier: Tier;
  blurb: string;
  build(ownerId: string): WorldDoc;
}

// ─────────────────────────────────────────────────────────────────────────
// Easy — Beacon Climb
// ─────────────────────────────────────────────────────────────────────────

/**
 * Four switchback flights up to a lit tower.
 *
 * The first course that goes *up*. Every jump is the same jump — gap 2, rise 1,
 * onto a 3x3 pad — repeated until it is automatic, and the only new thing it
 * asks for is the turn at the end of each flight, which happens on a deck wide
 * enough that nobody falls off it. The height is the point: by the fourth
 * flight the plaza is nineteen cells below and the same jump feels different.
 */
const CLIMB_SPAWN: Vec3 = [0, 2, 0];
const CLIMB_GOAL = goalOver(7, 21, 24);

function beaconClimb(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  // Start plaza, 13x13.
  c.pad(-6, 0, -6, 13, 13, HUE.indigo, HUE.cyan);

  // Flight A — east, along z = -1..1, climbing to y=4.
  for (let i = 0; i < 4; i++) {
    c.pad(8 + i * 5, 1 + i, -1, 3, 3, HUE.blue, HUE.cyan);
  }
  // Turn deck: spans the lane it arrives in and the one it leaves by, so the
  // switchback is a walk rather than a second jump taken sideways at speed.
  c.pad(28, 5, -1, 5, 11, HUE.indigo, HUE.cyan);
  c.checkpoint(30, 5, 4, FACING.north);

  // Flight B — back west, along z = 7..9.
  for (let i = 0; i < 4; i++) {
    c.pad(23 - i * 5, 6 + i, 7, 3, 3, HUE.sky, HUE.cyan);
  }
  c.pad(2, 10, 7, 5, 11, HUE.indigo, HUE.cyan);
  c.checkpoint(4, 10, 12, FACING.north);

  // Flight C — east again, along z = 15..17.
  for (let i = 0; i < 4; i++) {
    c.pad(8 + i * 5, 11 + i, 15, 3, 3, HUE.teal, HUE.cyan);
  }
  c.pad(28, 15, 15, 5, 11, HUE.indigo, HUE.cyan);
  c.checkpoint(30, 15, 20, FACING.north);

  // Flight D — the last three, west, along z = 23..25.
  for (let i = 0; i < 3; i++) {
    c.pad(23 - i * 5, 16 + i, 23, 3, 3, HUE.emerald, HUE.acid);
  }

  // The beacon: a tower deck, a podium, and four pylons that mark it from the
  // plaza — the whole climb is visible from the start, and so is its end.
  c.pad(4, 19, 21, 7, 7, HUE.indigo, HUE.acid);
  c.fill(6, 20, 23, 3, 3, HUE.violet, GLOSSY);
  c.put(7, 21, 24, BLOCK, HUE.acid, GLOW);
  for (const [px, pz] of [
    [4, 21],
    [10, 21],
    [4, 27],
    [10, 27],
  ]) {
    for (let y = 20; y < 25; y++) c.put(px, y, pz, BLOCK, HUE.acid, GLOW);
  }

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: CLIMB_SPAWN,
    goal: CLIMB_GOAL,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Medium — Cinder Gap
// ─────────────────────────────────────────────────────────────────────────

/**
 * A broken causeway, a climb, an S-bend, and a descent that opens up.
 *
 * The first course with a shape rather than a direction. The causeway teaches
 * the flat gap, the stair gives it back for free, and the S-bend is where the
 * player first has to jump somewhere they are not already facing. The descent
 * is the reward: gaps of three, which only work because falling two cells buys
 * the airtime to cross them.
 */
const GAP_SPAWN: Vec3 = [0, 2, 0];
const GAP_GOAL = goalOver(79, 7, 0);

function cinderGap(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.orange);

  // The causeway — three flat spans, gap 2.
  for (const x of [9, 15, 21]) c.beam(x, 0, -1, 4, 3, "x", HUE.slate);
  c.checkpoint(23, 0, 0, FACING.east);

  // Stairs out of the gap, then a deck to breathe on.
  c.stairs(27, 1, -1, 5, 3, "x", HUE.amber);
  c.pad(32, 5, -3, 7, 7, HUE.ink, HUE.amber);
  c.checkpoint(35, 5, 0, FACING.east);

  // The S-bend: east, north, east, south — a turn between every jump.
  c.pad(41, 5, -1, 3, 3, HUE.orange, HUE.amber);
  c.pad(41, 5, 4, 3, 3, HUE.orange, HUE.amber);
  c.pad(46, 5, 4, 3, 3, HUE.orange, HUE.amber);
  c.pad(46, 5, -1, 3, 3, HUE.orange, HUE.amber);

  // The descent — gap 3, dropping two cells at a time.
  c.pad(52, 3, -1, 3, 3, HUE.red, HUE.orange);
  c.pad(58, 1, -1, 3, 3, HUE.red, HUE.orange);
  c.pad(63, 0, -1, 3, 3, HUE.red, HUE.orange);
  c.checkpoint(64, 0, 0, FACING.east);

  // Back up to the finish.
  c.beam(68, 0, -1, 3, 3, "x", HUE.slate);
  c.stairs(71, 1, -1, 5, 3, "x", HUE.amber);
  c.pad(76, 5, -3, 7, 7, HUE.ink, HUE.acid);
  c.fill(78, 6, -1, 3, 3, HUE.orange, GLOSSY);
  c.put(79, 7, 0, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: GAP_SPAWN,
    goal: GAP_GOAL,
    sky: 1,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Hard — Vault of Wires
// ─────────────────────────────────────────────────────────────────────────

/**
 * Single-cell walkways, a zigzag on 2x2 pads, a plunge, and a spiral back up.
 *
 * Where the landings stop being generous. The wire is one cell wide and long
 * enough that walking it is a held input rather than a moment; the zigzag
 * alternates axis on every pad, so the eight jumps in it are eight separate
 * decisions; and the spiral does the same thing climbing, which is harder,
 * because the pad you are aiming at is above you and you cannot see its deck.
 */
const VAULT_SPAWN: Vec3 = [0, 2, 0];
const VAULT_GOAL = goalOver(75, 9, 4);

function vaultOfWires(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-5, 0, -5, 11, 11, HUE.purple, HUE.fuchsia);

  // The wire — one cell wide, with a break in it.
  c.beam(8, 0, 0, 6, 1, "x", HUE.fuchsia);
  c.beam(16, 0, 0, 6, 1, "x", HUE.fuchsia);
  c.pad(22, 0, -1, 3, 3, HUE.purple, HUE.fuchsia);
  c.checkpoint(23, 0, 0, FACING.east);

  // The zigzag — 2x2 pads, one axis change per jump, climbing throughout.
  c.pad(27, 1, -1, 2, 2, HUE.violet, HUE.pink);
  c.pad(31, 2, -1, 2, 2, HUE.violet, HUE.pink);
  c.pad(31, 3, 3, 2, 2, HUE.violet, HUE.pink);
  c.checkpoint(31, 3, 3, FACING.east);
  c.pad(35, 4, 3, 2, 2, HUE.violet, HUE.pink);
  c.pad(35, 5, -1, 2, 2, HUE.violet, HUE.pink);

  c.pad(39, 5, -3, 5, 5, HUE.purple, HUE.pink);
  c.checkpoint(41, 5, -1, FACING.east);

  // The plunge — gap 3 twice, then a short one so the last landing is not also
  // the fastest. Coming out of a fall at full speed onto a 2x2 pad is the one
  // place this course can take a run off you for a mistake you cannot feel.
  c.pad(47, 3, -1, 2, 2, HUE.pink, HUE.fuchsia);
  c.pad(52, 1, -1, 2, 2, HUE.pink, HUE.fuchsia);
  c.pad(56, 0, -1, 2, 2, HUE.pink, HUE.fuchsia);
  c.checkpoint(56, 0, 0, FACING.east);

  // The spiral back up — east, north, east, south, east, north.
  c.pad(60, 1, -1, 2, 2, HUE.violet, HUE.pink);
  c.pad(60, 2, 3, 2, 2, HUE.violet, HUE.pink);
  c.pad(64, 3, 3, 2, 2, HUE.violet, HUE.pink);
  c.checkpoint(64, 3, 3, FACING.east);
  c.pad(64, 4, -1, 2, 2, HUE.violet, HUE.pink);
  c.pad(68, 5, -1, 2, 2, HUE.violet, HUE.pink);
  c.pad(68, 6, 3, 2, 2, HUE.violet, HUE.pink);

  c.pad(72, 7, 1, 7, 7, HUE.purple, HUE.acid);
  c.fill(74, 8, 3, 3, 3, HUE.violet, GLOSSY);
  c.put(75, 9, 4, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: VAULT_SPAWN,
    goal: VAULT_GOAL,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Expert — Overclock
// ─────────────────────────────────────────────────────────────────────────

/**
 * Single cells, the whole way.
 *
 * Every landing in the middle three sections is one block. Nothing here is
 * longer than the arc allows and one jump — the third of the ascent — sits
 * exactly on it: gap 3 with a rise, the longest jump the game can be asked
 * for. It is placed immediately after a checkpoint on purpose, because a jump
 * at the limit of what is possible is only fair if failing it is cheap.
 *
 * The two plunges are the opposite idea. Gap 4 sounds worse and is easier:
 * dropping three cells buys most of a second of airtime, and the difficulty is
 * entirely in landing on one block while moving fast enough to have crossed it.
 */
const OVERCLOCK_SPAWN: Vec3 = [0, 2, 0];
const OVERCLOCK_GOAL = goalOver(111, 3, 0);

function overclock(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-4, 0, -4, 9, 9, HUE.ink, HUE.acid);

  /** One cell, lit. The whole vocabulary of this course. */
  const step = (x: number, y: number, z: number) =>
    c.put(x, y, z, BLOCK, HUE.cyan, GLOW);

  // The chain — flat, but drifting a cell sideways each time, so the line is
  // never the one the previous jump left you facing.
  step(7, 0, 0);
  step(10, 0, 1);
  step(13, 0, 0);
  step(16, 0, -1);
  step(19, 0, 0);
  c.pad(22, 0, -1, 3, 3, HUE.ink, HUE.acid);
  c.checkpoint(23, 0, 0, FACING.east);

  // The ascent. Third jump is the long one.
  step(27, 1, 0);
  step(30, 2, 0);
  c.checkpoint(30, 2, 0, FACING.east);
  step(34, 3, 0);
  step(37, 4, 0);
  step(40, 5, 0);
  c.pad(43, 5, -1, 3, 3, HUE.ink, HUE.acid);
  c.checkpoint(44, 5, 0, FACING.east);

  // The plunge.
  step(50, 2, 0);
  step(55, 0, 0);
  c.pad(58, 0, -1, 3, 3, HUE.ink, HUE.acid);
  c.checkpoint(59, 0, 0, FACING.east);

  // The wire, broken once.
  c.beam(63, 0, 0, 5, 1, "x", HUE.cyan);
  c.beam(71, 0, 0, 5, 1, "x", HUE.cyan);
  c.pad(76, 0, -1, 3, 3, HUE.ink, HUE.acid);
  c.checkpoint(77, 0, 0, FACING.east);

  // The switchback — single cells, alternating axis, climbing eight.
  step(81, 1, 0);
  step(81, 2, 3);
  step(84, 3, 3);
  step(84, 4, 0);
  step(87, 5, 0);
  step(87, 6, 3);
  step(90, 7, 3);
  step(90, 8, 0);
  c.pad(93, 8, -1, 3, 3, HUE.ink, HUE.acid);
  c.checkpoint(94, 8, 0, FACING.east);

  // The dive to the finish.
  step(100, 5, 0);
  step(105, 2, 0);
  c.pad(108, 1, -3, 7, 7, HUE.ink, HUE.acid);
  c.fill(110, 2, -1, 3, 3, HUE.cyan, GLOSSY);
  c.put(111, 3, 0, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: OVERCLOCK_SPAWN,
    goal: OVERCLOCK_GOAL,
  });
}

/**
 * The ladder, in tier order.
 *
 * Neon Run (`lib/parkour.ts`) opens the Tutorial tier — it is the course every
 * new world starts from — and it stays there rather than moving here, because
 * it is also the template a blank world is seeded with and that is a different
 * job from being one rung of the ladder. It is listed in `built-in-worlds.ts`
 * alongside these, and `TUTORIAL_COURSES` continues its tier.
 */
export const TIERED_COURSES: CourseEntry[] = [
  ...TUTORIAL_COURSES,
  {
    slug: "climb",
    name: "Beacon Climb",
    tier: "Easy",
    blurb: "Four switchback flights to a lit tower. One jump, learned properly.",
    build: (ownerId) => beaconClimb("climb", ownerId, "Beacon Climb"),
  },
  ...EASY_COURSES,
  {
    slug: "gap",
    name: "Cinder Gap",
    tier: "Medium",
    blurb: "A broken causeway, an S-bend, and a descent that opens up.",
    build: (ownerId) => cinderGap("gap", ownerId, "Cinder Gap"),
  },
  ...MEDIUM_COURSES,
  {
    slug: "vault",
    name: "Vault of Wires",
    tier: "Hard",
    blurb: "One-cell walkways and a zigzag that turns on every pad.",
    build: (ownerId) => vaultOfWires("vault", ownerId, "Vault of Wires"),
  },
  ...HARD_COURSES,
  {
    slug: "overclock",
    name: "Overclock",
    tier: "Expert",
    blurb: "Single-block landings, the whole way. One jump sits on the limit.",
    build: (ownerId) => overclock("overclock", ownerId, "Overclock"),
  },
  ...EXPERT_COURSES,
  ...OBBY_COURSES,
];
