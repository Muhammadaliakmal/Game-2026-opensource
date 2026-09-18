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
 * Medium — the three courses after Cinder Gap.
 *
 * The tier where the landing stops being in front of you. Tutorial and Easy
 * still let a bad jump drop you onto the wrong corner of the right pad; here
 * the pads are still 3x3 and still inside the arc, but almost every one of them
 * is reached out of a turn, and the turn happens *on the pad* rather than on a
 * deck wide enough to walk it. Cinder Gap has one S-bend; these are S-bends all
 * the way through.
 *
 * Gap 3 also becomes ordinary. Easy only ever asked for it downhill, where
 * falling buys the airtime; Medium asks for it flat, so "a longer jump" and "a
 * jump I have to commit to" stop being the same feeling before Hard makes them
 * both routine.
 */

// ─────────────────────────────────────────────────────────────────────────
// Ratchet
// ─────────────────────────────────────────────────────────────────────────

/**
 * A climb that alternates axis on every single hop.
 *
 * East, north, east, north — never twice the same way, always gaining a cell —
 * so the course is one long diagonal staircase and the player is turning
 * ninety degrees between every takeoff. There is no straight section to fall
 * into a rhythm on until the flat run at the top, which is the reward for
 * getting there and is itself still a jump.
 */
const RATCHET_SPAWN: Vec3 = [0, 2, 0];

function ratchet(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.indigo, HUE.cyan);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.blue, HUE.cyan, { w: 3, d: 3 });

  // The ratchet: E, N, E, N, up a cell each time.
  const climb: Dir[] = ["east", "north"];
  for (let i = 0; i < 12; i++) t.hop(climb[i % 2], 2, 1, HUE.blue, HUE.cyan);
  t.mark();

  // The flat run — gap 3, no turn, the one place a rhythm is possible.
  for (let i = 0; i < 5; i++) t.hop("east", 3, 0, HUE.sky, HUE.cyan);
  t.mark();

  // The descent puts the alternation back, dropping two cells a hop.
  const drop: Dir[] = ["east", "south"];
  for (let i = 0; i < 6; i++) t.hop(drop[i % 2], 3, -2, HUE.teal, HUE.cyan);
  t.mark();

  // A short climb to the finish deck.
  for (let i = 0; i < 4; i++) t.hop("east", 2, 1, HUE.blue, HUE.cyan);
  t.mark();

  t.hop("east", 2, 1, HUE.indigo, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.violet, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: RATCHET_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Switchback Yard
// ─────────────────────────────────────────────────────────────────────────

/**
 * Beacon Climb's switchback, taken on the landing instead of a turn deck.
 *
 * Four flights that each reverse the one before, but the reversal is a single
 * jump sideways onto a 3x3 pad and then a hundred-and-eighty-degree turn on
 * that pad — no wide deck to walk the corner on. Same climb as the Easy tower;
 * the room to make the turn is what got taken away.
 */
const SWITCHYARD_SPAWN: Vec3 = [0, 2, 0];

function switchbackYard(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.ink, HUE.amber);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.orange, HUE.amber, { w: 3, d: 3 });

  /** A flight of `n` climbing hops one way, then the sideways jump that turns
   *  it around. The last flight passes `turn:false` and runs into the finish. */
  const flight = (dir: Dir, n: number, deck: number) => {
    for (let i = 0; i < n; i++) t.hop(dir, 2, 1, deck, HUE.amber);
    t.hop("north", 2, 1, HUE.red, HUE.amber);
    t.mark();
  };

  flight("east", 4, HUE.orange);
  flight("west", 4, HUE.orange);
  flight("east", 4, HUE.orange);
  for (let i = 0; i < 3; i++) t.hop("west", 2, 1, HUE.orange, HUE.amber);
  t.mark();

  t.hop("west", 2, 1, HUE.ink, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.orange, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: SWITCHYARD_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// The Turnpike
// ─────────────────────────────────────────────────────────────────────────

/**
 * One road, one corner, and a plunge on the far side of it.
 *
 * The other two Medium courses turn constantly; this one turns once, hard, and
 * makes the whole back half of the course a direction the player was not
 * travelling in when they started. The plunge after the corner is gap 3
 * downhill — Easy's generous version of the jump — but arriving at it already
 * turned ninety degrees is what the tier is about.
 */
const TURNPIKE_SPAWN: Vec3 = [0, 2, 0];

function turnpike(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  c.pad(-6, 0, -6, 13, 13, HUE.slate, HUE.violet);

  const t = new Trail(c, { x: -6, y: 0, z: -6, w: 13, d: 13 });
  t.hop("east", 2, 0, HUE.purple, HUE.violet, { w: 3, d: 3 });

  // The road out — climbing east.
  for (let i = 0; i < 6; i++) t.hop("east", 2, 1, HUE.purple, HUE.violet);
  t.mark();

  // A gap-3 straight, still heading east.
  for (let i = 0; i < 4; i++) t.hop("east", 3, 0, HUE.fuchsia, HUE.violet);
  t.mark();

  // The corner: north now, and north for the rest of the course.
  for (let i = 0; i < 8; i++) t.hop("north", 2, i % 2, HUE.purple, HUE.violet);
  t.mark();

  // The plunge — gap 3, two cells down, four times.
  for (let i = 0; i < 4; i++) t.hop("north", 3, -2, HUE.pink, HUE.fuchsia);
  t.mark();

  for (let i = 0; i < 3; i++) t.hop("north", 2, 1, HUE.purple, HUE.violet);
  t.mark();

  t.hop("north", 2, 0, HUE.slate, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.purple, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: TURNPIKE_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// The Narrows
// ─────────────────────────────────────────────────────────────────────────

/**
 * Standard jumps, one-block-wide beams.
 *
 * ── The one lever this course pulls ──────────────────────────────────────
 *
 * Every other Medium course makes its point with the turn: the pad is 3x3 and
 * reached out of a ninety, so the mistake is aim. This one leaves the gap at 2
 * and the rise at 0 for almost its whole length — the arc is never in question
 * — and takes the landing down to a single cell across.
 *
 * That separates two things the tier otherwise teaches together. A 3x3 pad
 * forgives a cell either side of the middle; a beam one cell wide forgives
 * nothing across and everything along, so a jump that is long or short is fine
 * and a jump that is off to the side is a fall. There is no time pressure
 * anywhere in it. It is precision on one axis at a time, which is the thing
 * Hard's 2x2 pads will ask for on both at once.
 *
 * ── Why the beams alternate axis ─────────────────────────────────────────
 *
 * A run of beams all pointing east is one alignment held for eight jumps, and
 * once you are on the line you stay on it. Turning onto a beam means arriving
 * across its width — the one cell — from a beam that gave you no room to
 * square up on. The corners are the course; the straights are where you
 * recover.
 *
 * `d: 1` on an east beam and `w: 1` on a north one: the width is always the
 * axis you are NOT travelling along, so the beam runs away from you and the
 * cell you have to hit is the one under your feet.
 */
const NARROWS_SPAWN: Vec3 = [0, 2, 0];

function narrows(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  // A proper deck to start from. The only wide ground in the course, and the
  // reason the first beam reads as a beam rather than as the normal width.
  c.pad(-4, 0, -4, 9, 9, HUE.teal, HUE.cyan);

  const t = new Trail(c, { x: -4, y: 0, z: -4, w: 9, d: 9 });

  /** A run of `n` beams along one axis, then the turn off the end of it. */
  const along = (dir: Dir, n: number, rise = 0) => {
    const across = dir === "east" || dir === "west" ? { w: 5, d: 1 } : { w: 1, d: 5 };
    for (let i = 0; i < n; i++) t.hop(dir, 2, rise, HUE.sky, HUE.cyan, across);
  };

  // ── First straight: three beams east, flat. Learn the width. ──
  along("east", 3);
  // A 3x3 to stand on and a checkpoint, before the first corner.
  t.hop("east", 2, 0, HUE.teal, HUE.cyan, { w: 3, d: 3 });
  t.mark();

  // ── The corners. Each leg is shorter than the last, so the turns come
  //    closer together as the course goes on and the straights stop being a
  //    rest. ──
  along("north", 3);
  along("east", 3);
  t.hop("east", 2, 0, HUE.teal, HUE.cyan, { w: 3, d: 3 });
  t.mark();

  along("north", 3);
  along("west", 2);
  along("north", 2);
  t.hop("north", 2, 0, HUE.teal, HUE.cyan, { w: 3, d: 3 });
  t.mark();

  // ── The last stretch climbs. One cell per beam, which is the only place
  //    the arc and the width are asked for together. ──
  along("east", 4, 1);

  t.hop("east", 2, 1, HUE.teal, HUE.acid, { w: 7, d: 7 });
  const p = t.pad;
  c.fill(p.x + 2, p.y + 1, p.z + 2, 3, 3, HUE.sky, GLOSSY);
  c.put(p.x + 3, p.y + 2, p.z + 3, BLOCK, HUE.acid, GLOW);

  return courseDoc(c, {
    id,
    ownerId,
    name,
    spawn: NARROWS_SPAWN,
    goal: goalOver(p.x + 3, p.y + 2, p.z + 3),
  });
}

/** The three Medium courses that follow Cinder Gap, in ladder order. */
export const MEDIUM_COURSES: CourseEntry[] = [
  {
    slug: "ratchet",
    name: "Ratchet",
    tier: "Medium",
    blurb: "A climb that changes axis on every hop. No straight line until the top.",
    build: (ownerId) => ratchet("ratchet", ownerId, "Ratchet"),
  },
  {
    slug: "switchyard",
    name: "Switchback Yard",
    tier: "Medium",
    blurb: "Beacon Climb's tower, with the turn taken on the pad and no deck to walk.",
    build: (ownerId) => switchbackYard("switchyard", ownerId, "Switchback Yard"),
  },
  {
    slug: "turnpike",
    name: "The Turnpike",
    tier: "Medium",
    blurb: "One hard corner, and a plunge on the far side you arrive at already turned.",
    build: (ownerId) => turnpike("turnpike", ownerId, "The Turnpike"),
  },
  {
    slug: "narrows",
    name: "The Narrows",
    tier: "Medium",
    blurb: "Ordinary jumps onto beams one cell wide. Precision, with no clock on it.",
    build: (ownerId) => narrows("narrows", ownerId, "The Narrows"),
  },
];
