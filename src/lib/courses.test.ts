import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERED_COURSES, type CourseEntry } from "./courses";
import { TIERS, type Tier } from "./course-kit";
import { parkourWorldDoc } from "./parkour";
import {
  reachable,
  surfaceKey as key,
  surfaces,
  surfaceUnder,
} from "./course-graph";
import { inCheckpoint } from "./checkpoints";
import type { WorldDoc } from "./worlddoc";

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
 * So `course-graph.ts` turns the surfaces into a graph — the arc decides which
 * edges exist — and this asserts the obvious things about it: you can reach
 * the goal, you can reach every checkpoint, and — the one that matters most —
 * from every checkpoint you can still reach the goal. A resume point you can
 * be sent back to but not continue from is a soft lock, and it is the specific
 * bug this mechanic invites: respawn onto a pad whose next jump was only ever
 * makeable with the run-up you no longer have.
 *
 * The graph does not simulate the capsule, air control, or geometry in the
 * flight path, so it proves a course is not obviously impossible rather than
 * that it is pleasant. Level feel is still a human judgement. The arithmetic
 * is not.
 */

/** Every course that ships, tutorial included. */
const LADDER: Array<{ tier: Tier; doc: WorldDoc }> = [
  { tier: "Tutorial", doc: parkourWorldDoc("parkour", "user-1", "Neon Run") },
  ...TIERED_COURSES.map((c: CourseEntry) => ({
    tier: c.tier,
    doc: c.build("user-1"),
  })),
];

test("the ladder covers every tier, grouped and in order", () => {
  // The set used to be one course per tier and this asserted exactly that.
  // Now each tier holds several, so the contract is looser: every tier is
  // present, they appear in `TIERS` order, and a tier's courses are contiguous
  // — the parkour screen sorts by tier index and a gap would scatter a tier
  // across the page.
  const seen = LADDER.map((c) => c.tier);
  assert.deepEqual([...new Set(seen)], [...TIERS], "every tier, once, in order");

  const firstOf = (t: Tier) => seen.indexOf(t);
  const lastOf = (t: Tier) => seen.lastIndexOf(t);
  for (const t of TIERS) {
    const span = lastOf(t) - firstOf(t) + 1;
    const count = seen.filter((x) => x === t).length;
    assert.equal(span, count, `${t}'s courses are not contiguous in the ladder`);
  }
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

  // Every course in a tier, not just the last one — a Map keyed by tier would
  // hide a bad Tutorial course behind a good one.
  for (const { tier, doc } of LADDER) {
    const alone = oneBlockLandings(doc);
    if (tier === "Tutorial" || tier === "Easy") {
      assert.equal(
        alone,
        0,
        `${doc.id} (${tier}) has ${alone} isolated landings — this tier forgives a bad jump`
      );
    }
    if (tier === "Expert") {
      assert.ok(
        alone >= 15,
        `${doc.id} (Expert) has only ${alone} isolated landings — the tier is single-cell`
      );
    }
  }
});
