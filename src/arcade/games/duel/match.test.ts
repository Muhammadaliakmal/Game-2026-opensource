import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "@/arcade/host/rng";
import * as T from "./tuning";
import * as R from "./ragdoll";
import { MAGMA, collide, moverAt } from "./arena";
import { createMatch, scoreFor, type Match } from "./match";

/**
 * Rounds, the lava and the arena, played headless.
 */

const DT = 1 / 60;
const NEUTRAL: R.FighterInput = { x: 0, y: 0, jump: false, heavy: false };

function run(m: Match, seconds: number, a = NEUTRAL, b = NEUTRAL) {
  for (let k = 0; k < Math.round(seconds / DT); k++) m.step(DT, a, b);
}

function untilFight(m: Match) {
  let guard = 0;
  while (m.phase !== "fight" && guard++ < 600) m.step(DT, NEUTRAL, NEUTRAL);
}

test("the same seed and the same inputs give the same match", () => {
  const inputs = (k: number): [R.FighterInput, R.FighterInput] => [
    { x: Math.sin(k / 9), y: Math.cos(k / 7), jump: k % 97 === 0, heavy: k % 150 < 30 },
    { x: -Math.sin(k / 11), y: Math.cos(k / 5), jump: k % 83 === 0, heavy: false },
  ];
  const a = createMatch(mulberry32(42));
  const b = createMatch(mulberry32(42));
  for (let k = 0; k < 900; k++) {
    a.step(DT, ...inputs(k));
    b.step(DT, ...inputs(k));
  }
  for (const i of [0, 1] as const) {
    assert.deepEqual(Array.from(a.fighters[i].x), Array.from(b.fighters[i].x));
    assert.equal(a.fighters[i].hp, b.fighters[i].hp);
  }
  assert.deepEqual(a.wins, b.wins);
});

test("nobody moves before the bell", () => {
  const m = createMatch(mulberry32(1));
  m.step(DT, { ...NEUTRAL, x: 1 }, NEUTRAL);
  const x0 = m.fighters[0].x[R.PELVIS];
  for (let k = 0; k < 30; k++) m.step(DT, { ...NEUTRAL, x: 1 }, NEUTRAL);
  assert.equal(m.phase, "intro");
  assert.ok(Math.abs(m.fighters[0].x[R.PELVIS] - x0) < 3);
});

test("two knockouts win the match", () => {
  const m = createMatch(mulberry32(3));
  for (let round = 0; round < T.ROUNDS_TO_WIN; round++) {
    untilFight(m);
    R.knockOut(m.fighters[1]);
    m.step(DT, NEUTRAL, NEUTRAL);
    assert.equal(m.phase, "ko");
    assert.equal(m.roundWinner, 0);
    run(m, T.KO_HOLD + DT);
  }
  assert.equal(m.phase, "over");
  assert.equal(m.winner, 0);
  assert.deepEqual(m.wins, [T.ROUNDS_TO_WIN, 0]);
});

test("time goes to whoever has more health, and a level clock is a draw", () => {
  const m = createMatch(mulberry32(4), { roundTime: 1 });
  untilFight(m);
  m.fighters[1].hp = 40;
  run(m, 1.1);
  assert.equal(m.cause, "time");
  assert.equal(m.roundWinner, 0);

  // Draws do not count, so all-draw play has to stop somewhere.
  const d = createMatch(mulberry32(5), { roundTime: 0.5 });
  run(d, T.MAX_ROUNDS * (T.INTRO_TIME + 0.5 + T.KO_HOLD) + 2);
  assert.equal(d.phase, "over");
  assert.equal(d.winner, null);
  assert.equal(d.round, T.MAX_ROUNDS);
});

test("the lava takes the low bridge on the beat, and never the stone", () => {
  const m = createMatch(mulberry32(6), { roundTime: 30 });
  untilFight(m);
  // Stand fighter 0 on the moving bridge; fighter 1 stays on its bank.
  const bridge = m.movers[0];
  R.resetFighter(m.fighters[0], m.fighters[0].weapon, (bridge.x0 + bridge.x1) / 2, bridge.y0, 1);
  let burned: number | null = null;
  for (let k = 0; k < 60 * 20 && m.phase === "fight"; k++) {
    m.step(DT, NEUTRAL, NEUTRAL);
    for (const e of m.events) if (e.type === "burn") burned = e.fighter;
  }
  assert.equal(burned, 0, "the robot left on the bridge should have burned");
  assert.equal(m.cause, "lava");
  assert.equal(m.roundWinner, 1);
  assert.ok(!m.fighters[1].ko, "the one on the stone is untouched");
  // And the geometry that makes that true: the peak is under the banks.
  assert.ok(MAGMA.lava.peakY > MAGMA.spawnGround + T.HEAD_R);
  // While the bridge at its lowest is under the peak.
  const low = moverAt(MAGMA.movers[0], 0, { x0: 0, y0: 0, x1: 0, y1: 0 });
  assert.ok(low.y0 > MAGMA.lava.peakY);
});

test("the lava tells before it rises, by the arena's own tell", () => {
  const m = createMatch(mulberry32(7), { roundTime: 30 });
  untilFight(m);
  let tellAt = -1;
  let riseAt = -1;
  for (let k = 0; k < 60 * 15; k++) {
    m.step(DT, NEUTRAL, NEUTRAL);
    for (const e of m.events) {
      if (e.type === "lavaTell" && tellAt < 0) tellAt = k * DT;
      if (e.type === "lavaRise" && riseAt < 0) riseAt = k * DT;
    }
  }
  assert.ok(tellAt > 0 && riseAt > tellAt);
  assert.ok(Math.abs(riseAt - tellAt - MAGMA.lava.tell) < 0.05);
});

test("a thin platform catches from above and lets you through from below", () => {
  const thin = MAGMA.solids[2];
  assert.ok(thin.oneWay);
  const out = { x: 0, y: 0, top: false, hit: false };
  const r = 3;
  const x = (thin.x0 + thin.x1) / 2;
  // A body that was wholly above it, falling onto it: caught on top.
  collide([thin], x, thin.y0 + 2, thin.y0 - 1, r, out);
  assert.ok(out.hit && out.top && out.y === thin.y0 - r);
  // A body any part of which was below the top: left alone, even the part
  // that is above it now — which is what stops a head being hung on it.
  collide([thin], x, thin.y0 + 2, thin.y1 + 30, r, out);
  assert.ok(!out.hit);
  // A solid bank still stops you from the side.
  const bank = MAGMA.solids[0];
  collide([bank], bank.x0 + 1, bank.y0 + 20, bank.y0 + 20, r, out);
  assert.ok(out.hit && !out.top && out.x < bank.x0);
});

test("score: rounds, damage and the match, times the difficulty", () => {
  const won = { wins: [2, 1] as [number, number], dealt: [150.4, 90] as [number, number], winner: 0 as const };
  assert.equal(scoreFor(won, "easy"), 2 * T.ROUND_POINTS + 150 + T.MATCH_BONUS);
  assert.equal(scoreFor(won, "hard"), (2 * T.ROUND_POINTS + 150 + T.MATCH_BONUS) * 3);
  const lost = { wins: [1, 2] as [number, number], dealt: [80, 200] as [number, number], winner: 1 as const };
  assert.equal(scoreFor(lost, "medium"), (T.ROUND_POINTS + 80) * 2, "a loss pays for what you did");
});
