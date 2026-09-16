import { test } from "node:test";
import assert from "node:assert/strict";
import { createSim, parseLevel, Tile, tileAt } from "./sim";
import { LEVELS } from "./levels";
import { play, settle, solve } from "./solver";
import * as T from "./tuning";

/**
 * A room that cannot be done is the worst bug a puzzle game can ship, and
 * the one a playtest is least likely to catch — the tester assumes they are
 * missing something. So every room is solved by search here, and its `par`
 * is held to what the search finds.
 */

const DT = 1 / 60;

test("every room is 24 by 12 with one start and one goal", () => {
  for (const L of LEVELS) {
    assert.equal(L.rows.length, T.ROWS, L.name);
    for (const r of L.rows) assert.equal(r.length, T.COLS, `${L.name}: "${r}"`);
    const flat = L.rows.join("");
    assert.equal((flat.match(/P/g) ?? []).length, 1, `${L.name}: one start`);
    assert.equal((flat.match(/G/g) ?? []).length, 1, `${L.name}: one goal`);
  }
});

test("every room starts at rest", () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const sim = createSim();
    sim.jumpTo(i);
    assert.equal(settle(sim), "rest", `${LEVELS[i].name}: the ball should come to rest before the first choice`);
  }
});

test("every room is solvable, and par is the fewest flips from rest", () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    const rest = solve(i, false);
    const air = rest ?? solve(i, true);
    assert.ok(air, `${L.name}: unsolvable`);
    assert.equal(air.length, L.par, `${L.name}: par ${L.par}, solver found ${air.length}: ${air.map((m) => m.dir + (m.after ? "@" + m.after : "")).join(" ")}`);
    assert.ok(play(i, air), `${L.name}: the found solution should replay`);
  }
});

test("the last two rooms need a flip mid-fall", () => {
  for (const i of [LEVELS.length - 2, LEVELS.length - 1]) {
    assert.equal(solve(i, false), null, `${LEVELS[i].name}: should not be solvable from rest alone`);
  }
});

test("glass breaks after a long fall and not a short one", () => {
  // Drop: the first fall is two tiles and rests on the glass; the fall from
  // the ceiling breaks it.
  const i = LEVELS.findIndex((l) => l.name === "Drop");
  const sim = createSim();
  sim.jumpTo(i);
  settle(sim);
  const { tiles } = parseLevel(LEVELS[i]);
  let glass = 0;
  for (let k = 0; k < tiles.length; k++) if (tiles[k] === Tile.Glass) glass++;
  assert.equal(glass, 1);
  assert.equal(tileAt(sim.tiles, 11, 6), Tile.Glass, "short fall leaves the glass");
  sim.flip("up");
  settle(sim);
  sim.flip("down");
  const r = settle(sim);
  assert.equal(tileAt(sim.tiles, 11, 6), Tile.Air, "long fall breaks it");
  assert.equal(r, "clear");
});

test("a spike costs a life, and three cost the run", () => {
  const i = LEVELS.findIndex((l) => l.name === "Teeth");
  const sim = createSim();
  sim.jumpTo(i);
  settle(sim);
  for (let life = T.LIVES; life > 0; life--) {
    assert.equal(sim.lives, life);
    // Off the ledge onto the teeth.
    sim.flip("right");
    settle(sim);
    sim.flip("down");
    settle(sim);
    sim.flip("right");
    const r = settle(sim);
    assert.equal(r, "dead");
    for (let k = 0; k < T.DEATH_STEPS + 2; k++) sim.step(DT);
  }
  assert.equal(sim.phase, "done");
  assert.equal(sim.outcome, "lost");
});
