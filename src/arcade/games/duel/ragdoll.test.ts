import test from "node:test";
import assert from "node:assert/strict";
import * as T from "./tuning";
import { MAGMA } from "./arena";
import * as R from "./ragdoll";

/**
 * One fighter on the stone, stepped the way the match steps it.
 *
 * What these hold is what a person would call "the robot works": it stands
 * where it was put, it jumps high enough for the arena's platforms, it gets
 * up after a stagger and it does not after a knockout. Every one of those was
 * wrong at least once while the numbers were being found — see the comment
 * on `pull` for the one that walked the robot backwards at rest.
 */

const DT = 1 / 60;
const H = DT / T.SUBSTEPS;
const NEUTRAL: R.FighterInput = { x: 0, y: 0, jump: false, heavy: false };

function fighter(x = 220, facing: 1 | -1 = 1, weapon = T.WEAPONS[0]) {
  const f = R.createFighter(0, weapon);
  R.resetFighter(f, weapon, x, MAGMA.spawnGround, facing);
  return f;
}

function step(f: R.Fighter, input: R.FighterInput = NEUTRAL, n = 1) {
  const events: R.RagdollEvent[] = [];
  for (let k = 0; k < n; k++) {
    R.think(f, input, DT, events);
    for (let s = 0; s < T.SUBSTEPS; s++) {
      R.applyForces(f, input, MAGMA.solids, H);
      R.integrate(f, H);
      for (let i = 0; i < T.ITERATIONS; i++) R.solve(f, MAGMA.solids);
      R.finish(f, H);
    }
  }
  return events;
}

const standY = MAGMA.spawnGround - T.STAND_H;

test("a robot left alone stands where it was put, facing either way", () => {
  // Muscles push back on what they pull from. Without that a knee held
  // forward of the hips was a force from nowhere, and the idle robot walked.
  for (const facing of [1, -1] as const) {
    const f = fighter(220, facing);
    step(f, NEUTRAL, 180);
    assert.ok(Math.abs(f.x[R.PELVIS] - 220) < 4, `drifted to ${f.x[R.PELVIS]} facing ${facing}`);
    assert.ok(Math.abs(f.y[R.PELVIS] - standY) < 4, `pelvis sagged to ${f.y[R.PELVIS]}`);
    assert.ok(f.y[R.HEAD] < f.y[R.NECK] && f.y[R.NECK] < f.y[R.PELVIS], "head over shoulders over hips");
    assert.ok(f.support);
  }
});

test("the stick walks, and a part push only aims", () => {
  const f = fighter();
  step(f, { ...NEUTRAL, x: 1 }, 30);
  assert.ok(f.x[R.PELVIS] > 240, `a full push walked only to ${f.x[R.PELVIS]}`);

  // Under WALK_DEAD sideways, the arm turns and the feet stay put.
  const g = fighter();
  step(g, NEUTRAL, 20);
  const before = g.x[R.PELVIS];
  step(g, { ...NEUTRAL, x: T.WALK_DEAD * 0.9, y: -0.9 }, 40);
  assert.ok(Math.abs(g.x[R.PELVIS] - before) < 4, "a part push walked");
  assert.ok(g.y[R.TIP] < g.y[R.NECK], "and the weapon went up");
});

test("a jump rises high enough to reach the high bridge", () => {
  const f = fighter();
  step(f, NEUTRAL, 20);
  const events = step(f, { ...NEUTRAL, jump: true });
  assert.ok(events.some((e) => e.type === "jump"));
  let top = Infinity;
  for (let k = 0; k < 60; k++) {
    step(f);
    top = Math.min(top, f.y[R.PELVIS]);
  }
  const rise = standY - top;
  // The high bridge is three tiles above the banks; the feet have to clear it.
  const bridge = MAGMA.spawnGround - MAGMA.solids[2].y0;
  assert.ok(rise > bridge, `a jump rose ${rise.toFixed(0)} px; the bridge is ${bridge} up`);
  assert.ok(f.support, "and it lands");
});

test("a released heavy swings faster than any quick swing, and lunges forward", () => {
  const quick = fighter();
  step(quick, NEUTRAL, 20);
  let quickPeak = 0;
  for (let r = 0; r < 3; r++) {
    step(quick, { ...NEUTRAL, y: -1 }, 18);
    for (let k = 0; k < 18; k++) {
      step(quick, { ...NEUTRAL, x: 0.3, y: 0.3 });
      quickPeak = Math.max(quickPeak, quick.tipSpeed);
    }
  }

  const heavy = fighter();
  step(heavy, NEUTRAL, 20);
  const x0 = heavy.x[R.PELVIS];
  step(heavy, { ...NEUTRAL, heavy: true }, 40);
  const events = step(heavy);
  assert.ok(events.some((e) => e.type === "heavy"));
  let heavyPeak = 0;
  for (let k = 0; k < 20; k++) {
    step(heavy);
    heavyPeak = Math.max(heavyPeak, heavy.tipSpeed);
  }
  assert.ok(heavyPeak > quickPeak * 1.25, `heavy ${heavyPeak.toFixed(0)} vs quick ${quickPeak.toFixed(0)}`);
  assert.ok(heavy.x[R.PELVIS] > x0 + 5, "the lunge goes the way it faces");
  assert.ok(heavy.stamina < T.STAMINA_MAX, "and it costs stamina");
});

test("a heavy needs the stamina to start, and a tap is a cancel", () => {
  const f = fighter();
  f.stamina = 2;
  step(f, { ...NEUTRAL, heavy: true }, 10);
  assert.equal(f.windup, 0, "tired arms do not wind up");

  const g = fighter();
  step(g, { ...NEUTRAL, heavy: true }, 3);
  const events = step(g);
  assert.ok(!events.some((e) => e.type === "heavy"), "a three-frame tap threw a heavy");
  assert.equal(g.swing, 0);
});

test("a stagger drops the robot and it gets back up", () => {
  const f = fighter();
  step(f, NEUTRAL, 20);
  R.stagger(f, 0.6);
  step(f, NEUTRAL, 40);
  assert.ok(f.y[R.HEAD] > standY - T.TORSO, "a staggered robot should be down");
  step(f, NEUTRAL, 150);
  assert.ok(Math.abs(f.y[R.PELVIS] - standY) < 6, `still down at ${f.y[R.PELVIS]}`);
  assert.equal(f.strength, 1);
});

test("a knockout is for good", () => {
  const f = fighter();
  R.knockOut(f);
  step(f, NEUTRAL, 240);
  assert.ok(f.y[R.HEAD] > standY, "a knocked-out robot is lying down");
  assert.equal(f.strength, 0);
});

test("a broken particle is put back rather than spreading", () => {
  const f = fighter();
  f.vx[R.HAND] = NaN;
  step(f, NEUTRAL, 5);
  for (let i = 0; i < R.N; i++) {
    assert.ok(Number.isFinite(f.x[i]) && Number.isFinite(f.y[i]), `particle ${i} is not finite`);
  }
});
