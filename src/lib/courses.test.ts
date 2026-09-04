import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERED_COURSES, type CourseEntry } from "./courses";
import { TIERS, type Tier } from "./course-kit";
import { parkourWorldDoc } from "./parkour";
import { canClear } from "./jump-arc";
import { inCheckpoint } from "./checkpoints";
import type { PartTuple, Vec3, WorldDoc } from "./worlddoc";

/**
 * Proof that every shipped course can actually be finished.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * A course is a few hundred coordinates typed by hand. One of them being three
 * cells further out than the arc allows is invisible in review, invisible on
 * screen, and costs the player the whole map — they simply cannot get past it,
 * and they will assume they are bad at the game rather than that the game is
 * wrong. Nothing else in the codebase can catch it: the schema says the parts
 * are well-formed, the collider test says they are cheap, and neither has any
 * idea whether a person can get from one to the next.
 *
 * So the surfaces are turned into a graph, the arc from `jump-arc.ts` decides
 * which edges exist, and the test asserts the obvious things: you can reach
 * the goal, you can reach every checkpoint, and — the one that matters most —
 * from every checkpoint you can still reach the goal. A resume point you can
 * be sent back to but not continue from is a soft lock, and it is the specific
 * bug this mechanic invites: respawn onto a pad whose next jump was only ever
 * makeable with the run-up you no longer have.
 *
 * ── What the model is, and is not ────────────────────────────────────────
 *
 * It walks *surfaces*: a cell you can stand on, with headroom above it. Edges
 * are jumps the arc permits between two surfaces. It does not simulate the
 * capsule, air control, or geometry in the flight path — so it proves a course
 * is not obviously impossible, not that it is pleasant. Level feel is still a
 * human judgement. The arithmetic is not.
 */

/** A place you can stand: a column, and the height of its top face. */
interface Surface {
  x: number;
  z: number;
  /** Top face of the block, which is where the feet are. */
  y: number;
}

const key = (s: Surface) => `${s.x},${s.y},${s.z}`;

/**
 * Two cells of headroom.
 *
 * The capsule is 1.2 units tall (radius 0.3, half-height 0.3), so one cell is
 * not enough and three would rule out standing anywhere with a ceiling. None
 * of the shipped courses has a tunnel; if one ever does, this is the number
 * that decides whether it counts as a route.
 */
const HEADROOM = 2;

/**
 * Every standable surface, indexed twice.
 *
 * By cell for lookups, and by COLUMN for the search — a column has one or two
 * standable heights and the arc reaches thirty cells down, so scanning heights
 * blindly costs thirty lookups per candidate for nothing. Indexing the column
 * turns the neighbour scan from ~4000 lookups per node into ~150, which is the
 * difference between this file taking twenty seconds and taking one.
 */
interface Surfaces {
  byCell: Map<string, Surface>;
  byColumn: Map<string, Surface[]>;
}

function surfaces(parts: readonly PartTuple[]): Surfaces {
  const solid = new Set<string>();
  for (const p of parts) solid.add(`${p[0]},${p[1]},${p[2]}`);

  const byCell = new Map<string, Surface>();
  const byColumn = new Map<string, Surface[]>();
  for (const p of parts) {
    const [x, y, z] = p;
    let clear = true;
    for (let h = 1; h <= HEADROOM; h++) {
      if (solid.has(`${x},${y + h},${z}`)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const s: Surface = { x, z, y: y + 1 };
    byCell.set(key(s), s);
    const col = `${x},${z}`;
    const at = byColumn.get(col);
    if (at) at.push(s);
    else byColumn.set(col, [s]);
  }
  return { byCell, byColumn };
}

/**
 * The furthest any single jump can carry the character, rounded up.
 *
 * Used only to bound the neighbour scan — the arc decides the actual edges.
 * Derived rather than typed in, so raising `FEEL.jumpVel` cannot silently make
 * the search miss the very jumps it just enabled.
 */
const SCAN = (() => {
  let r = 1;
  while (canClear(r, -30) && r < 40) r++;
  return r + 1;
})();

/** Everything reachable from `start`, by walking and jumping. */
function reachable(from: Surface, all: Surfaces): Set<string> {
  const seen = new Set<string>([key(from)]);
  const queue: Surface[] = [from];

  while (queue.length) {
    const a = queue.pop()!;
    for (let dx = -SCAN; dx <= SCAN; dx++) {
      for (let dz = -SCAN; dz <= SCAN; dz++) {
        if (dx === 0 && dz === 0) continue;
        // Centre-to-centre minus one cell: the character leaves the leading
        // edge of one platform and lands on the leading edge of the next.
        const gap = Math.max(0, Math.hypot(dx, dz) - 1);
        // A column can be standable at more than one height (a pad over a
        // plaza), so each height there is its own node.
        const column = all.byColumn.get(`${a.x + dx},${a.z + dz}`);
        if (!column) continue;
        for (const b of column) {
          if (seen.has(key(b))) continue;
          if (!canClear(gap, b.y - a.y)) continue;
          seen.add(key(b));
          queue.push(b);
        }
      }
    }
  }
  return seen;
}

/** The surface a world position stands on — the one directly under the feet. */
function surfaceUnder(pos: Vec3, all: Surfaces): Surface | null {
  const x = Math.floor(pos[0]);
  const z = Math.floor(pos[2]);
  for (let y = Math.round(pos[1]); y >= 0; y--) {
    const s = all.byCell.get(`${x},${y},${z}`);
    if (s) return s;
  }
  return null;
}

/** Every course that ships, tutorial included. */
const LADDER: Array<{ tier: Tier; doc: WorldDoc }> = [
  { tier: "Tutorial", doc: parkourWorldDoc("parkour", "user-1", "Neon Run") },
  ...TIERED_COURSES.map((c: CourseEntry) => ({
    tier: c.tier,
    doc: c.build("user-1"),
  })),
];

test("the ladder covers every tier exactly once, in order", () => {
  assert.deepEqual(
    LADDER.map((c) => c.tier),
    [...TIERS]
  );
});

test("every course can be finished from its spawn", () => {
  for (const { doc } of LADDER) {
    const all = surfaces(doc.parts);
    const start = surfaceUnder(doc.spawn, all);
    assert.ok(start, `${doc.id}: nothing to stand on under the spawn`);

    assert.ok(doc.goal, `${doc.id}: a course must have a goal`);
    const finish = surfaceUnder(doc.goal!, all);
    assert.ok(finish, `${doc.id}: nothing to stand on under the goal`);

    const from = reachable(start, all);
    assert.ok(
      from.has(key(finish!)),
      `${doc.id}: the goal at ${doc.goal} cannot be reached from the spawn — ` +
        `some jump on the route is longer than the character can make`
    );
  }
});

test("every checkpoint is on the route, and the route continues from it", () => {
  for (const { doc } of LADDER) {
    const cps = doc.checkpoints ?? [];
    assert.ok(cps.length >= 3, `${doc.id}: a tiered course needs checkpoints`);

    const all = surfaces(doc.parts);
    const start = surfaceUnder(doc.spawn, all)!;
    const fromSpawn = reachable(start, all);
    const finish = surfaceUnder(doc.goal!, all)!;

    for (const [i, cp] of cps.entries()) {
      const under = surfaceUnder(cp.pos, all);
      assert.ok(under, `${doc.id}: checkpoint ${i} is floating`);
      assert.ok(
        Math.abs(under!.y - cp.pos[1]) < 0.001,
        `${doc.id}: checkpoint ${i} sits ${(cp.pos[1] - under!.y).toFixed(2)} ` +
          `above the deck it belongs to`
      );
      assert.ok(
        fromSpawn.has(key(under!)),
        `${doc.id}: checkpoint ${i} cannot be reached from the spawn`
      );
      // The soft-lock guard. A respawn puts the runner exactly here with no
      // speed and no run-up; if the rest of the course is not reachable from
      // that, the checkpoint has ended the attempt rather than saved it.
      assert.ok(
        reachable(under!, all).has(key(finish)),
        `${doc.id}: checkpoint ${i} is a dead end — the goal is not reachable ` +
          `from it, so respawning there soft-locks the run`
      );
    }
  }
});

test("checkpoints do not overlap each other", () => {
  // Zones are 2.2 units across and the runner banks the furthest one they are
  // inside of, so two overlapping zones would silently skip the earlier one —
  // and skipping forward is the one direction the resume rule cannot undo.
  for (const { doc } of LADDER) {
    const cps = doc.checkpoints ?? [];
    for (let i = 0; i < cps.length; i++) {
      for (let j = i + 1; j < cps.length; j++) {
        const [x, y, z] = cps[j].pos;
        assert.ok(
          !inCheckpoint(x, y, z, cps[i]),
          `${doc.id}: checkpoints ${i} and ${j} overlap`
        );
      }
    }
  }
});

test("the tiers differ by how much deck the player lands on", () => {
  // The design claim in `courses.ts`: every jump in the set is inside the arc
  // (which the reachability test above proves), so difficulty has to come from
  // somewhere else — and where it comes from is the size of the landing.
  //
  // A "one-block landing" is a surface you can reach, with nothing beside it
  // and nothing beside it a cell down: miss it and you fall. Both halves of
  // that matter. Beacon Climb's beacon pylons stand alone and are not landings
  // because nothing can reach their tops; the lit cap on a finish podium is
  // reachable and is not one either, because stepping off it costs a cell
  // rather than the run.
  const oneBlockLandings = (doc: WorldDoc) => {
    const all = surfaces(doc.parts);
    const stood = reachable(surfaceUnder(doc.spawn, all)!, all);

    let alone = 0;
    for (const k of stood) {
      const s = all.byCell.get(k)!;
      const beside = ([dx, dz]: [number, number]) =>
        (all.byColumn.get(`${s.x + dx},${s.z + dz}`) ?? []).some(
          (n) => n.y === s.y || n.y === s.y - 1
        );
      const joined = ([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as Array<[number, number]>).some(beside);
      if (!joined) alone++;
    }
    return alone;
  };

  const byTier = new Map(LADDER.map((c) => [c.tier, oneBlockLandings(c.doc)]));
  assert.equal(byTier.get("Tutorial"), 0, "the tutorial must forgive a bad landing");
  assert.equal(byTier.get("Easy"), 0, "Easy is the same jump, learned properly");
  assert.ok(
    byTier.get("Expert")! >= 15,
    `Expert is meant to be single-block landings, found ${byTier.get("Expert")}`
  );
});
