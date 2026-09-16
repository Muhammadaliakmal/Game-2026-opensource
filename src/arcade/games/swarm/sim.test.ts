import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "@/arcade/host/rng";
import { canEat, createSim, radiusOf, speedFor, zoomFor, type Sim, type SimInput } from "./sim";
import * as T from "./tuning";

/**
 * The rules of the arena, each proved on the real simulation.
 *
 * The genre lives or dies on trust in its one rule — bigger eats smaller,
 * by a margin, on contact — so that rule is tested first and from both
 * sides. The rest is the shape of a run: a dash costs what it says, a split
 * halves and heals, the storm arrives on time and closes on schedule, and a
 * few minutes of forty bots never produce a NaN.
 */

const DT = 1 / 60;
const IDLE: SimInput = { dx: 0, dy: 0, dash: false, split: false };

const fresh = (seed = 1) => createSim(mulberry32(seed));

function run(sim: Sim, seconds: number, input: SimInput = IDLE) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) sim.step(DT, input);
}

/** Park every bot far away and harmless, so a test sees only what it set up. */
function clearBots(sim: Sim) {
  for (const b of sim.bots) {
    b.alive = false;
    b.respawnIn = 1e9;
  }
}

/**
 * Move every pellet out of reach. The grid keeps its stale buckets, but the
 * bite is decided by distance to the pellet's real position, so nothing is
 * eaten — which is what a test about exact mass needs.
 */
function clearMatter(sim: Sim) {
  for (let i = 0; i < sim.matter.n; i++) {
    sim.matter.x[i] = 1e6;
    sim.matter.y[i] = 1e6;
  }
}

/** A table with nothing on it but what the test puts there. */
function bare(seed: number): Sim {
  const sim = fresh(seed);
  clearBots(sim);
  clearMatter(sim);
  return sim;
}

test("radius grows with the root of mass, speed falls with mass, zoom is bounded", () => {
  assert.ok(radiusOf(80) > radiusOf(20));
  assert.ok(Math.abs(radiusOf(80) / radiusOf(20) - 2) < 1e-9, "four times the mass is twice the radius");
  assert.ok(speedFor(20) > speedFor(200) && speedFor(200) > speedFor(2000));
  assert.ok(speedFor(1e6) >= T.SPEED_MIN);
  assert.ok(zoomFor(radiusOf(20)) > zoomFor(radiusOf(2000)));
  assert.ok(zoomFor(1) <= T.ZOOM_MAX && zoomFor(1e5) >= T.ZOOM_MIN);
});

test("bigger eats smaller by a margin, on overlap, and not otherwise", () => {
  const a = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, mass: 100, boost: 0, dashCd: 0 };
  const b = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, mass: 100 / T.EAT_RATIO - 1, boost: 0, dashCd: 0 };
  assert.ok(canEat(a, b), "heavy enough and on top of it");
  assert.ok(!canEat(b, a), "never the other way round");
  b.mass = 100 / T.EAT_RATIO + 1;
  assert.ok(!canEat(a, b), "under the ratio is a stand-off");
  b.mass = 20;
  b.x = radiusOf(100) + 5;
  assert.ok(!canEat(a, b), "not from a distance");
});

test("moving over matter eats it, grows you, and the pellet count holds", () => {
  const sim = fresh(3);
  clearBots(sim);
  const before = sim.mass();
  const n = sim.matter.n;
  // Wander in a square for a while; a pellet field this dense guarantees bites.
  run(sim, 3, { dx: 1, dy: 0, dash: false, split: false });
  run(sim, 3, { dx: 0, dy: 1, dash: false, split: false });
  assert.ok(sim.mass() > before, "grew");
  assert.ok(sim.eatenMass > 0 && sim.score >= Math.floor(sim.eatenMass));
  assert.equal(sim.matter.n, n, "eaten pellets respawn; the field is a constant");
});

test("a bot big enough eats you: a life goes, and you respawn small after the wait", () => {
  const sim = fresh(4);
  clearBots(sim);
  const me = sim.cells[0];
  const b = sim.bots[0];
  b.alive = true;
  b.respawnIn = 0;
  b.mass = me.mass * 3;
  b.x = me.x;
  b.y = me.y;
  b.sx = b.sy = 0;
  // Spawn protection first: the same bot, on top of you, cannot bite yet.
  sim.step(DT, IDLE);
  assert.ok(!sim.events.died && !sim.dead, "shielded for the first seconds");
  me.shield = 0;
  b.x = me.x;
  b.y = me.y;
  sim.step(DT, IDLE);
  assert.ok(sim.events.died, "eaten this step");
  assert.equal(sim.lives, T.LIVES - 1);
  assert.equal(sim.eatenBy, b.name);
  assert.ok(sim.dead);
  clearBots(sim);
  run(sim, T.RESPAWN_S + T.DEATH_STEPS * DT + 0.1);
  assert.ok(!sim.dead, "back");
  assert.equal(sim.cells.length, 1);
  assert.ok(Math.abs(sim.mass() - T.START_MASS) < 1e-9, "at starting mass");
  const h = sim.world / 2;
  assert.ok(Math.abs(sim.cells[0].x) < h && Math.abs(sim.cells[0].y) < h, "inside the world");
});

test("you eat a smaller bot: a kill, its mass, and a line in the feed", () => {
  const sim = bare(5);
  const me = sim.cells[0];
  me.mass = 200;
  const b = sim.bots[1];
  b.alive = true;
  b.respawnIn = 0;
  b.mass = 40;
  b.x = me.x;
  b.y = me.y;
  sim.step(DT, IDLE);
  assert.equal(sim.events.killed, b);
  assert.equal(sim.kills, 1);
  assert.ok(!b.alive);
  assert.ok(Math.abs(me.mass - (200 + 40 * T.EAT_GAIN)) < 1);
  assert.ok(sim.feed.some((f) => f.text.includes(b.name) && f.kill));
  assert.ok(sim.score >= T.KILL_POINTS);
});

test("a dash costs mass, speeds you up, and cannot be spammed", () => {
  const sim = bare(6);
  const c = sim.cells[0];
  c.mass = 100;
  sim.step(DT, { dx: 1, dy: 0, dash: true, split: false });
  assert.ok(sim.events.dashed);
  assert.ok(Math.abs(c.mass - 100 * (1 - T.DASH_COST)) < 0.5, `cost ${100 - c.mass}`);
  assert.ok(c.boost > 0 && c.dashCd > 0);
  const m = c.mass;
  sim.step(DT, { dx: 1, dy: 0, dash: true, split: false });
  assert.ok(!sim.events.dashed, "on cooldown");
  assert.ok(c.mass <= m && c.mass > m - 1, "no second charge");
  // Faster than the same orb undashed.
  const plain = bare(6);
  plain.cells[0].mass = c.mass;
  run(plain, 0.25, { dx: 1, dy: 0, dash: false, split: false });
  run(sim, 0.25, { dx: 1, dy: 0, dash: false, split: false });
  assert.ok(Math.hypot(c.vx, c.vy) > Math.hypot(plain.cells[0].vx, plain.cells[0].vy) * 1.5);
});

test("a fresh orb cannot dash: it has no mass to spend", () => {
  const sim = bare(7);
  sim.step(DT, { dx: 1, dy: 0, dash: true, split: false });
  assert.ok(!sim.events.dashed);
  assert.ok(Math.abs(sim.mass() - T.START_MASS) < 1e-9);
});

test("a split halves you into two steering together, and they merge again in time", () => {
  const sim = bare(8);
  sim.cells[0].mass = 120;
  sim.step(DT, { dx: 1, dy: 0, dash: false, split: true });
  assert.ok(sim.events.split);
  assert.equal(sim.cells.length, 2);
  assert.ok(Math.abs(sim.cells[0].mass - 60) < 1e-9 && Math.abs(sim.cells[1].mass - 60) < 1e-9);
  // Too small to split again, and on cooldown anyway.
  sim.step(DT, { dx: 1, dy: 0, dash: false, split: true });
  assert.equal(sim.cells.length, 2);
  // The pair keeps apart until the timer, then rejoins on contact.
  run(sim, T.SPLIT_MERGE_S * 0.5, { dx: 0, dy: 0, dash: false, split: false });
  assert.equal(sim.cells.length, 2, "still two before the timer");
  run(sim, T.SPLIT_MERGE_S * 0.6 + 2, { dx: 0, dy: 0, dash: false, split: false });
  assert.equal(sim.cells.length, 1, "one again");
  assert.ok(sim.mass() >= 118, `mass kept through the split (${sim.mass()})`);
});

test("a split below the minimum mass does nothing", () => {
  const sim = bare(9);
  sim.cells[0].mass = T.SPLIT_MIN_MASS - 1;
  sim.step(DT, { dx: 1, dy: 0, dash: false, split: true });
  assert.ok(!sim.events.split);
  assert.equal(sim.cells.length, 1);
});

test("a spike zone bleeds mass and says so", () => {
  const sim = bare(10);
  const c = sim.cells[0];
  const s = sim.spikes[0];
  c.mass = 100;
  c.x = s.x;
  c.y = s.y;
  sim.step(DT, IDLE);
  assert.ok(sim.events.hazard);
  assert.ok(c.mass < 100);
});

test("Big Mode arrives on the clock: the world grows, the swarm grows, the ring closes", () => {
  const sim = fresh(11);
  clearBots(sim);
  run(sim, T.NORMAL_S - 0.5);
  assert.equal(sim.phase, "normal");
  assert.equal(sim.world, T.WORLD);
  let announced = false;
  for (let i = 0; i < 60 && !announced; i++) {
    sim.step(DT, IDLE);
    announced = sim.events.bigStart;
  }
  assert.ok(announced, "the announcement fires once");
  assert.equal(sim.phase, "big");
  assert.equal(sim.world, T.WORLD_BIG);
  assert.equal(sim.bots.length, T.BOTS_BIG);
  assert.equal(sim.matter.n, T.MATTER_N_BIG);
  assert.ok(sim.spikes.length >= T.SPIKES_BIG);
  const r0 = sim.ring;
  assert.ok(Number.isFinite(r0));
  run(sim, T.BIG_INTRO_S + 10);
  assert.ok(sim.ring < r0, "closing");
  assert.ok(sim.ring > T.RING_MIN);
});

test("outside the ring you bleed; sit in the eye and the round is yours, placed", () => {
  const sim = fresh(12);
  clearBots(sim);
  run(sim, T.NORMAL_S + 0.1);
  assert.equal(sim.phase, "big");
  clearBots(sim);
  clearMatter(sim);
  // The ring starts wider than the world, so wait until it has come in.
  run(sim, T.BIG_INTRO_S + 20);
  assert.ok(sim.ring + 100 < sim.world / 2, "the ring is inside the world now");
  // Outside it: the storm drains.
  const c = sim.cells[0];
  c.mass = 200;
  c.x = sim.ring + 100;
  c.y = 0;
  sim.step(DT, IDLE);
  assert.ok(sim.events.storm);
  assert.ok(c.mass < 200);
  // Then to the centre, and wait it out.
  c.x = 0;
  c.y = 0;
  const lives = sim.lives;
  run(sim, T.BIG_S + T.RING_HOLD_S + 1);
  assert.equal(sim.phase, "done");
  assert.equal(sim.outcome, "survived");
  assert.equal(sim.place, 1, "nobody left to be ahead of you");
  assert.equal(sim.lives, lives);
  assert.ok(sim.score >= T.PLACE_POINTS[0] + lives * T.LIFE_POINTS, `score ${sim.score}`);
});

test("the third death ends the run, eaten, with no place bonus", () => {
  const sim = fresh(13);
  clearBots(sim);
  for (let life = T.LIVES; life > 0; life--) {
    if (sim.dead) run(sim, T.RESPAWN_S + T.DEATH_STEPS * DT + 0.1);
    assert.ok(!sim.dead);
    const me = sim.cells[0];
    me.shield = 0;
    const b = sim.bots[0];
    b.alive = true;
    b.respawnIn = 0;
    b.mass = me.mass * 3;
    b.x = me.x;
    b.y = me.y;
    sim.step(DT, IDLE);
    assert.ok(sim.events.died);
    clearBots(sim);
  }
  assert.equal(sim.lives, 0);
  assert.equal(sim.phase, "done");
  assert.equal(sim.outcome, "eaten");
  assert.ok(sim.events.lost);
  assert.equal(sim.score, Math.floor(sim.eatenMass) + sim.kills * T.KILL_POINTS);
});

test("the board is sorted, at most five rows, and knows where you stand", () => {
  const sim = fresh(14);
  run(sim, 1);
  assert.ok(sim.board.length > 0 && sim.board.length <= T.BOARD_ROWS);
  for (let i = 1; i < sim.board.length; i++) assert.ok(sim.board[i - 1].mass >= sim.board[i].mass);
  assert.ok(sim.rank >= 1);
  const you = sim.board.findIndex((r) => r.you);
  if (you >= 0) assert.equal(sim.rank, you + 1);
});

test("a full run of bots against an idle player never leaves the world or produces a NaN", () => {
  const sim = fresh(15);
  const total = T.NORMAL_S + T.BIG_INTRO_S + T.BIG_S + T.RING_HOLD_S + 5;
  const n = Math.round(total / DT);
  for (let i = 0; i < n; i++) {
    // Steer in a slow circle so the player is not a sitting duck every run.
    const a = i / 600;
    sim.step(DT, { dx: Math.cos(a), dy: Math.sin(a), dash: i % 300 === 0, split: false });
    if (i % 60 === 0) {
      const h = sim.world / 2 + 1;
      for (const b of sim.bots) {
        if (!b.alive) continue;
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.mass), `bot ${b.name} step ${i}`);
        assert.ok(Math.abs(b.x) <= h && Math.abs(b.y) <= h, `bot ${b.name} left the world at step ${i}`);
        assert.ok(b.mass > 0);
      }
      for (const c of sim.cells) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.mass));
      assert.ok(Number.isFinite(sim.zoom) && Number.isFinite(sim.camX));
    }
    if (sim.phase === "done") break;
  }
  assert.equal(sim.phase, "done", "a run ends");
  assert.ok(sim.score >= 0);
});

test("the same seed is the same run", () => {
  const a = fresh(21);
  const b = fresh(21);
  run(a, 20, { dx: 0.7, dy: -0.3, dash: false, split: false });
  run(b, 20, { dx: 0.7, dy: -0.3, dash: false, split: false });
  assert.equal(a.score, b.score);
  assert.equal(a.mass(), b.mass());
  assert.deepEqual(a.bots.map((x) => [x.alive, x.mass]), b.bots.map((x) => [x.alive, x.mass]));
});
