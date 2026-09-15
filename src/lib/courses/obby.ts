import {
  BLOCK,
  Course,
  courseDoc,
  type Dir,
  FACING,
  GLOW,
  goalOver,
  HUE,
  MATTE,
  type Pad,
  Trail,
} from "../course-kit";
import type { Vec3, WorldDoc } from "../worlddoc";
import type { CourseEntry } from "../courses";

/**
 * Obby — Magma Gauntlet.
 *
 * ── What an obby is, and is not ──────────────────────────────────────────
 *
 * The five tiers before this one turn three levers: landing size, turns, and
 * how far back the checkpoint is. None of them is *traps*. An obby — the
 * Roblox word for an obstacle course — is built on the fourth lever the
 * ladder never pulls: things that kill you when you touch them. Every jump
 * here is one the ladder has already taught (nothing past `canClear`), the
 * landings are mostly 3x3, and the checkpoints are generous. What is new is
 * that the floor is lava, the walls are lava, and a section is not "reach
 * the far pad" but "find the way through the lava that is between you and
 * it".
 *
 * It is also LONG, on purpose, and against the ladder's own advice that
 * length is tiring rather than hard. An obby is an expedition; the death
 * counter on the finish panel is its scoreboard as much as the clock, and
 * "died 41 times, finished" is the result people come back for.
 *
 * ── The sea ──────────────────────────────────────────────────────────────
 *
 * The whole course stands over one sheet of lava at y=0. A fall lands in it
 * rather than into the void, which respawns the runner in a quarter of a
 * second with a red flash instead of the two seconds of falling to -20 —
 * and the sheet is a single merged collider, so it costs the physics
 * nothing. Every deck sits at y=2 or above so there is always a visible
 * cell of air over the glow.
 *
 * ── Stages ───────────────────────────────────────────────────────────────
 *
 *  1. Stepping stones — 3x3 pads east over the sea. The warm-up.
 *  2. The weave — a long deck with lava pillars standing on it, alternating
 *     sides, so the run is a slalom. Brush one and it is over.
 *  3. The climb — switchback hops rising a cell each, onto a tower.
 *  4. The pits — 2x2 pads with three cells of lava between them.
 *  5. The tiles — a 5-wide plate of lava with a one-cell path snaking
 *     through it. The classic "which tile is safe" trap, drawn honestly:
 *     the safe tiles are a different colour, so it is a test of nerve and
 *     footwork, not of memory.
 *  6. The plunge — south and down, long hops toward the sea, each landing
 *     narrower than the last.
 *  7. The needles — one-wide beams heading back west with lava gates
 *     across them, and the podium.
 *
 * The course folds back on itself after the tiles so it fits the build
 * plane; the return leg runs south of the outward one. Every stage ends on
 * a wide, lit pad with a checkpoint, and `courses.test.ts` proves the goal
 * is reachable from every one of them: lava is not a surface to the solver,
 * so a route it finds is a route that avoids it.
 */

const SPAWN: Vec3 = [0, 3, 0];

/** Deck colours: dark stone over the glow, a hot rim so edges read from the air. */
const DECK = HUE.slate;
const EDGE = HUE.amber;
const SAFE = HUE.emerald;

/** The sea's footprint, min-corner. Sized to the course with a margin. */
const SEA = { x: -14, z: -22, w: 186, d: 62 };

/** A bank: a lit 5x5 landing with a checkpoint on it, facing `next`. */
function bank(c: Course, x: number, y: number, z: number, next: Dir): Pad {
  c.pad(x, y, z, 5, 5, DECK, EDGE);
  c.checkpoint(x + 2, y, z + 2, FACING[next]);
  return { x, y, z, w: 5, d: 5 };
}

function magmaGauntlet(id: string, ownerId: string, name: string): WorldDoc {
  const c = new Course();

  // The sea. One sheet, one collider, one hazard under everything.
  c.lava(SEA.x, 0, SEA.z, SEA.w, SEA.d);

  // The plaza. Wide, safe, and two cells above the glow.
  c.pad(-5, 2, -5, 11, 11, DECK, EDGE);

  // ── 1. Stepping stones ───────────────────────────────────────────────
  let t = new Trail(c, { x: -5, y: 2, z: -5, w: 11, d: 11 });
  t.hop("east", 2, 0, DECK, EDGE, { w: 3, d: 3 });
  for (let i = 0; i < 4; i++) t.hop("east", 2, 0, DECK, EDGE);
  t.hop("east", 2, 0, DECK, EDGE, { w: 5, d: 5 });
  // The weave is drawn by hand, so the mark is aimed by hand too.
  t.mark("east");

  // ── 2. The weave ─────────────────────────────────────────────────────
  // A 3-wide deck 24 long, with a two-high lava pillar every third cell,
  // alternating between the two outer lanes. The middle lane is always
  // open; each outer lane is open two cells in three. A runner holding a
  // straight line down the middle is fine — which is the lesson — and one
  // drifting is not.
  {
    const p = t.pad;
    const x0 = p.x + p.w + 2;
    const z0 = p.z + 1;
    const y = p.y;
    c.beam(x0, y, z0, 24, 3, "x", DECK);
    for (let i = 2; i < 23; i += 3) {
      const lane = Math.floor(i / 3) % 2 === 0 ? 0 : 2;
      c.hazard(x0 + i, y + 1, z0 + lane);
      c.hazard(x0 + i, y + 2, z0 + lane);
    }
    t = new Trail(c, bank(c, x0 + 24 + 2, y, z0 - 1, "north"));
  }

  // ── 3. The climb ─────────────────────────────────────────────────────
  // Switchbacks north then east, a cell up each hop, onto a tower. No lava
  // on the way up: the climb is the breather between two trap sections,
  // and a jump that passes low over a kill block is a jump the arc cannot
  // vouch for.
  {
    const zig: Dir[] = ["north", "east"];
    for (let i = 0; i < 8; i++) t.hop(zig[i % 2], 2, 1, DECK, EDGE, { w: 3, d: 3 });
    t.hop("east", 2, 1, DECK, EDGE, { w: 5, d: 5 });
    t.mark();
  }

  // ── 4. The pits ──────────────────────────────────────────────────────
  // 2x2 pads with three cells of air between them, dropping a cell each so
  // the airtime is there. The sea is the pit; nothing else is needed.
  {
    t.hop("east", 3, -1, DECK, EDGE, { w: 2, d: 2 });
    for (let i = 0; i < 4; i++) t.hop("east", 3, -1, DECK, EDGE);
    t.hop("east", 2, 0, DECK, EDGE, { w: 5, d: 5 });
    t.mark("east");
  }

  // ── 5. The tiles ─────────────────────────────────────────────────────
  // A 5-wide, 21-long plate. Lava everywhere except a one-cell path that
  // snakes across it. The safe tiles are green so the eye can find the
  // line; the feet still have to follow it.
  {
    const p = t.pad;
    const x0 = p.x + p.w;
    const z0 = p.z;
    const y = p.y;
    const L = 21;
    c.lava(x0, y, z0, L, 5, HUE.orange);
    // The path, walked as legs of (dx, dz, cells) from the plate's west edge.
    let px = 0;
    let pz = 2;
    c.put(x0, y, z0 + pz, BLOCK, SAFE, GLOW);
    const legs: Array<[number, number, number]> = [
      [1, 0, 3],
      [0, 1, 2],
      [1, 0, 3],
      [0, -1, 4],
      [1, 0, 3],
      [0, 1, 3],
      [1, 0, 3],
      [0, -1, 2],
      [1, 0, 8],
    ];
    for (const [dx, dz, n] of legs) {
      for (let i = 0; i < n; i++) {
        px += dx;
        pz += dz;
        c.put(x0 + px, y, z0 + pz, BLOCK, SAFE, GLOW);
      }
    }
    // The far bank starts where the path ends, and the run turns south.
    t = new Trail(c, bank(c, x0 + L, y, z0 + pz - 2, "south"));
  }

  // ── 6. The plunge ────────────────────────────────────────────────────
  // South and down: long hops falling toward the sea, each landing
  // narrower. A fall here is a fall into lava a cell below the last pad.
  {
    t.hop("south", 3, -1, DECK, EDGE, { w: 3, d: 3 });
    t.hop("south", 4, -2, DECK, EDGE, { w: 3, d: 3 });
    t.hop("south", 3, -1, DECK, EDGE, { w: 2, d: 2 });
    t.hop("south", 2, 0, DECK, EDGE, { w: 2, d: 2 });
    t.hop("west", 2, 0, DECK, EDGE, { w: 5, d: 5 });
    t.mark("west");
  }

  // ── 7. The needles ───────────────────────────────────────────────────
  // One-wide beams heading west with lava gates: a two-high pillar each
  // side of the beam every four cells, leaving exactly the beam. A gap to
  // jump between the two beams, then the podium.
  {
    const p = t.pad;
    const y = p.y;
    const z = p.z + 2;
    const x0 = p.x - 2 - 16;
    /** A gate: lava posts either side of the beam, from the deck up. */
    const gate = (x: number, height: number) => {
      for (let h = 0; h < height; h++) {
        c.hazard(x, y + h, z - 1);
        c.hazard(x, y + h, z + 1);
      }
    };
    c.beam(x0, y, z, 16, 1, "x", DECK, MATTE);
    for (let i = 2; i < 15; i += 4) gate(x0 + i, 3);
    const x1 = x0 - 2 - 10;
    c.beam(x1, y, z, 10, 1, "x", DECK, MATTE);
    for (let i = 2; i < 9; i += 4) gate(x1 + i, 2);
    // The podium: a lit tower a cell up, reached by a last hop west.
    const podium = { x: x1 - 2 - 5, y: y + 1, z: z - 2, w: 5, d: 5 };
    c.pad(podium.x, podium.y, podium.z, podium.w, podium.d, HUE.amber, HUE.white, GLOW);
    const goal = goalOver(podium.x + 2, podium.y, podium.z + 2);
    return courseDoc(c, { id, ownerId, name, spawn: SPAWN, goal });
  }
}

export const OBBY_COURSES: CourseEntry[] = [
  {
    slug: "magma",
    name: "Magma Gauntlet",
    tier: "Obby",
    blurb:
      "Seven stages over a lava sea. Kill walls, a tile floor, a plunge and " +
      "the needles. Touch the glow and you are back at the checkpoint.",
    build: (ownerId) => magmaGauntlet("magma", ownerId, "Magma Gauntlet"),
  },
];
