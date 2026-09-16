import { test } from "node:test";
import assert from "node:assert/strict";
import { createSim, Tile, tileAt } from "./sim";
import { LEVELS } from "./levels";
import * as T from "./tuning";

/**
 * A puzzle about one shot is a puzzle about whether the shot exists, so the
 * first test fires every one of 1440 angles at every room and holds the
 * count of winners to the `window` each room promises. A room that drifts
 * into a pixel hunt fails here rather than on a phone.
 *
 * The rest are the mechanics the rooms are built from, each proved on the
 * room that introduces it: a mirror turns for free, a shoved crate throws a
 * switch, a charge takes its neighbours, and a spent shot costs a life.
 */

const DT = 1 / 60;
const ANGLES = 1440;

type S = ReturnType<typeof createSim>;

function fresh(level: number): S {
  const sim = createSim();
  sim.jumpTo(level);
  return sim;
}

/** Fire and run the flight out. Returns the phase the flight ended in. */
function shoot(sim: S, angle: number) {
  sim.aim(angle);
  sim.fire();
  for (let i = 0; i < 5000 && sim.phase === "flight"; i++) sim.step(DT);
  return sim.phase;
}

/** Sit through a hold phase. */
function settle(sim: S) {
  for (let i = 0; i < 200 && sim.phase !== "aim" && sim.phase !== "done"; i++) sim.step(DT);
}

function wins(level: number): number {
  let n = 0;
  for (let a = 0; a < ANGLES; a++) {
    if (shoot(fresh(level), (a / ANGLES) * Math.PI * 2) === "clear") n++;
  }
  return n;
}

test("every room clears from at least as many angles as its window", () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const n = wins(i);
    assert.ok(n >= LEVELS[i].window, `${LEVELS[i].name}: ${n} of ${ANGLES} angles clear it, window is ${LEVELS[i].window}`);
  }
});

test("no room clears from more than a tenth of angles — it is still a puzzle", () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const n = wins(i);
    assert.ok(n <= ANGLES / 10, `${LEVELS[i].name}: ${n} angles clear it, which is not a puzzle`);
  }
});

test("mirrors turn the shot and cost no bounce", () => {
  const sim = fresh(1);
  assert.equal(LEVELS[1].bounces, 0, "the mirrors room has no bounce budget, so a mirror must not spend one");
  const phase = shoot(sim, 0);
  assert.equal(phase, "clear");
  assert.equal(sim.bounces, 0);
});

test("a shoved crate lands on the switch and opens the door", () => {
  const sim = fresh(4);
  // Row 2: `#/.T.........CS........#` — crate at column 13, switch at 14.
  assert.equal(tileAt(sim.tiles, 13, 2), Tile.Crate);
  assert.equal(tileAt(sim.tiles, 14, 2), Tile.Switch);
  assert.equal(tileAt(sim.tiles, 6, 5), Tile.DoorShut);

  sim.aim(0);
  sim.fire();
  let shoved = false;
  for (let i = 0; i < 5000 && sim.phase === "flight"; i++) {
    sim.step(DT);
    if (sim.event === "crate") shoved = true;
  }
  assert.ok(shoved, "the shot should have shoved the crate");
  assert.equal(tileAt(sim.tiles, 14, 2), Tile.Crate, "crate sits on the switch");
  assert.equal(tileAt(sim.tiles, 13, 2), Tile.Air);
  assert.equal(tileAt(sim.tiles, 6, 5), Tile.DoorOpen, "the crate threw the switch");
  assert.equal(sim.phase, "clear", "and the shot went on through the door to the target");
});

test("a charge takes the targets around it and the shot goes on through", () => {
  const sim = fresh(5);
  assert.equal(sim.targetsLeft, 4);
  // Aim straight at the charge at column 18, row 8.
  const angle = Math.atan2((8.5 - 2.5) * T.TILE, (18.5 - 3.5) * T.TILE);
  assert.equal(tileAt(sim.tiles, 18, 8), Tile.Charge);
  assert.equal(shoot(sim, angle), "clear");
  // The clear lands in the same step as the boom and takes the event slot,
  // so the proof is the room: the charge is gone and so is every target.
  assert.equal(tileAt(sim.tiles, 18, 8), Tile.Air);
  assert.equal(sim.targetsLeft, 0);
  assert.equal(sim.bounces, 0, "the shot went straight there");
  assert.ok(sim.score >= 4 * T.TARGET_POINTS + T.LEVEL_POINTS);
});

test("glass breaks on the way through and is gone for the next shot", () => {
  const sim = fresh(2);
  // Find a glass tile and aim through it.
  let gc = -1;
  let gr = -1;
  for (let r = 0; r < T.ROWS && gc < 0; r++) {
    for (let c = 0; c < T.COLS; c++) {
      if (tileAt(sim.tiles, c, r) === Tile.Glass) {
        gc = c;
        gr = r;
        break;
      }
    }
  }
  assert.ok(gc >= 0, "the glass room has glass");
  const angle = Math.atan2((gr + 0.5) * T.TILE - sim.ty, (gc + 0.5) * T.TILE - sim.tx);
  sim.aim(angle);
  sim.fire();
  let broke = false;
  for (let i = 0; i < 5000 && sim.phase === "flight"; i++) {
    sim.step(DT);
    if (sim.event === "glass") broke = true;
  }
  assert.ok(broke);
  assert.equal(tileAt(sim.tiles, gc, gr), Tile.Air);
});

test("a spent shot costs a life, resets the room, and the third ends the run", () => {
  const sim = fresh(0);
  assert.equal(sim.lives, T.LIVES);
  // Straight up into the ceiling, one bounce, then the floor: spent.
  for (let life = T.LIVES; life > 1; life--) {
    assert.equal(shoot(sim, -Math.PI / 2), "spent");
    assert.equal(sim.lives, life - 1);
    settle(sim);
    assert.equal(sim.phase, "aim", "the room is back for another go");
    assert.equal(sim.level, 0);
  }
  assert.equal(shoot(sim, -Math.PI / 2), "spent");
  settle(sim);
  assert.equal(sim.phase, "done");
  assert.equal(sim.outcome, "lost");
});

test("fire and aim are ignored while the shot is in flight", () => {
  const sim = fresh(0);
  sim.aim(0.3);
  sim.fire();
  assert.equal(sim.phase, "flight");
  sim.step(DT);
  const dx = sim.dx;
  sim.aim(2);
  sim.fire();
  sim.step(DT);
  assert.equal(sim.dx, dx, "aiming in flight changes nothing");
  assert.equal(sim.angle, 0.3);
});

test("the preview starts at the turret and turns where the room turns it", () => {
  const sim = fresh(1);
  const out = new Float32Array(64);
  const n = sim.preview(0, out);
  assert.ok(n >= 3, `the mirrors room should give at least turret, mirror, end — got ${n}`);
  assert.equal(out[0], sim.tx);
  assert.equal(out[1], sim.ty);
  // Row 2: `#.T..........\.........#` — the first turn is at the `\` at column 13.
  assert.ok(Math.abs(out[2] - 13.5 * T.TILE) < 1e-3, `first turn x ${out[2]}`);
  assert.ok(Math.abs(out[3] - 2.5 * T.TILE) < 1e-3, `first turn y ${out[3]}`);
});

test("the preview does not change the room", () => {
  const sim = fresh(2);
  const before = sim.tiles.slice();
  const out = new Float32Array(64);
  for (let a = 0; a < 60; a++) sim.preview((a / 60) * Math.PI * 2, out);
  assert.deepEqual(Array.from(sim.tiles), Array.from(before));
  assert.equal(sim.phase, "aim");
});

test("clearing the last room ends the run won, with the lives paid out", () => {
  const sim = fresh(LEVELS.length - 1);
  let won = false;
  for (let a = 0; a < ANGLES && !won; a++) {
    const s = fresh(LEVELS.length - 1);
    if (shoot(s, (a / ANGLES) * Math.PI * 2) === "clear") {
      settle(s);
      assert.equal(s.phase, "done");
      assert.equal(s.outcome, "won");
      assert.ok(s.score >= T.LEVEL_POINTS + T.LIVES * T.LIFE_POINTS);
      won = true;
    }
  }
  assert.ok(won);
  assert.equal(sim.phase, "aim");
});
