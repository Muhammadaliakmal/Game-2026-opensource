import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "@/arcade/host/rng";
import { createSim, surfaceY, type Sim, type SimInput } from "./sim";
import * as T from "./tuning";

/**
 * The parts of a runner that go wrong in ways nobody can report.
 *
 * "It feels unresponsive sometimes" is what a dropped jump input sounds like
 * from the other side, and it is unfixable as a bug report. These pin the
 * three mechanisms that produce it — coyote time, the jump buffer, and the
 * rule that one press is one jump — plus the ring buffer, which fails by
 * leaking rather than by looking wrong.
 */

const W = 900;
const H = 500;
const DT = 1 / 60;
const IDLE: SimInput = { jumpPressed: false, jumpHeld: false };
const HOLD: SimInput = { jumpPressed: false, jumpHeld: true };
const PRESS: SimInput = { jumpPressed: true, jumpHeld: true };

const fresh = (seed = 1) => createSim(mulberry32(seed), W, H);

/** The ground the run starts on, which is flat and spans the first screen. */
const START_SURFACE = surfaceY(H, 0);

/**
 * A jump's velocity one step after the press.
 *
 * Gravity is applied in the same step as the impulse, so a jump never reads
 * back as exactly `JUMP_V` — asserting that it does is a test that fails on
 * correct code.
 */
const JUST_JUMPED = T.JUMP_V + T.GRAVITY * DT;

/**
 * Put the player in the air with the coyote window already spent.
 *
 * High enough that it cannot reach a surface within the window, because a
 * player that lands refreshes coyote time and quietly re-grounds the premise
 * of every test below.
 */
function airborne(s: Sim, aboveSurface = 320) {
  s.py = START_SURFACE - T.PLAYER_H - aboveSurface;
  s.vy = 0;
  s.onGround = false;
}

/** Steps until `stop` says so, or `limit` steps pass. Returns steps taken. */
function until(s: Sim, limit: number, stop: (s: Sim) => boolean, input = IDLE) {
  let n = 0;
  while (n < limit && !s.dead && !stop(s)) {
    s.step(DT, input);
    n++;
  }
  return n;
}

test("the run starts standing on ground, not falling onto it", () => {
  const s = fresh();
  assert.equal(s.onGround, true);
  assert.equal(s.py + T.PLAYER_H, START_SURFACE);
});

test("a press on the ground jumps", () => {
  const s = fresh();
  s.step(DT, PRESS);
  assert.ok(s.vy <= JUST_JUMPED + 1, `a press did not produce a jump: ${s.vy}`);
  assert.equal(s.onGround, false);
});

test("coyote time lets a jump land just after the ledge", () => {
  // The input players swear they made on the ground. They are right, and
  // without this window the game is wrong.
  const s = fresh();
  airborne(s);
  for (let i = 0; i < 3; i++) s.step(DT, IDLE); // 0.05s, inside COYOTE
  s.step(DT, PRESS);
  assert.ok(
    s.vy <= JUST_JUMPED + 1,
    `coyote time did not honour the press: ${s.vy}`
  );
});

test("coyote time expires rather than lasting the whole fall", () => {
  // The other half. A window that never closes is a double jump.
  const s = fresh();
  airborne(s);
  for (let i = 0; i < Math.ceil(T.COYOTE / DT) + 4; i++) s.step(DT, IDLE);
  const before = s.vy;
  s.step(DT, PRESS);
  assert.ok(s.vy > before, "a press well into a fall produced a jump");
});

test("a press just before landing is remembered", () => {
  // The mirror of coyote time, and it has to be tested with the coyote window
  // already spent — otherwise this passes on the wrong mechanism.
  const s = fresh();
  airborne(s);
  until(s, 600, (x) => x.py + T.PLAYER_H > START_SURFACE - 12);
  assert.ok(!s.onGround, "the player landed before the press");

  // Still airborne on the press, with the coyote window long gone, so this
  // must NOT launch. `vy` reads zero rather than positive when the same step
  // also lands — either way, what matters is that nothing went upward.
  s.step(DT, PRESS);
  assert.ok(s.vy >= 0, `that press jumped on coyote time, not the buffer: ${s.vy}`);

  until(s, 20, (x) => x.onGround);
  assert.ok(s.onGround, "never landed");

  // The buffered press is spent here. Stepped with the button still held,
  // because releasing it would invoke the jump cut — a real rule, tested
  // separately, and one that would otherwise be measured as a weak buffer.
  s.step(DT, HOLD);
  assert.ok(
    s.vy <= JUST_JUMPED + 1,
    `a buffered press did not become a jump on landing: ${s.vy}`
  );
});

test("one press is one jump, however long it is held", () => {
  // The bug: leaving the buffer set after a jump means the player relaunches
  // the instant they touch down without pressing again.
  const s = fresh();
  s.step(DT, PRESS);
  let relaunches = 0;
  for (let i = 0; i < 600 && !s.dead; i++) {
    const before = s.vy;
    s.step(DT, HOLD); // held, never re-pressed
    // A launch is a jump out of a non-rising state. Landing also drops vy
    // sharply, which is why this tests the sign rather than the delta.
    if (before >= 0 && s.vy <= JUST_JUMPED + 1) relaunches++;
  }
  assert.equal(relaunches, 0, "holding the button produced another jump");
});

test("holding past the apex glides instead of dropping like a stone", () => {
  // Compared at the same point in the same fall, so the jump cut — which is a
  // different rule on the same button — cannot be what is measured.
  const a = fresh(9);
  const b = fresh(9);
  airborne(a, 400);
  airborne(b, 400);
  a.vy = 100;
  b.vy = 100;
  a.step(DT, HOLD);
  b.step(DT, IDLE);
  assert.ok(a.vy < b.vy, `the glide did not slow the fall: ${a.vy} vs ${b.vy}`);
  assert.ok(a.vy > 100, "the glide became lift");
});

test("releasing early cuts the jump short", () => {
  const held = fresh(3);
  const tapped = fresh(3);
  held.step(DT, PRESS);
  tapped.step(DT, PRESS);
  for (let i = 0; i < 8; i++) {
    held.step(DT, HOLD);
    tapped.step(DT, IDLE);
  }
  assert.ok(held.py < tapped.py, "a tap climbed as high as a hold");
});

/**
 * Fly the player over the course without dying.
 *
 * Held above the tallest platform the generator can produce, so it never
 * collides with anything: the subject of these two tests is the generator and
 * the buffer, and a player that keeps dying tests neither.
 */
function fly(s: Sim, steps: number) {
  const ceiling = surfaceY(H, T.HEIGHT_MAX) - T.PLAYER_H - 5;
  for (let i = 0; i < steps; i++) {
    s.py = ceiling;
    s.vy = 0;
    s.onGround = true;
    s.dead = null;
    s.step(DT, IDLE);
  }
}

test("the ring buffer never grows, however far the run goes", () => {
  // The failure mode is a leak, not a wrong picture, so nothing on screen
  // would ever show it.
  const s = fresh(42);
  const chunks = s.chunks.length;
  const coins = s.coinPool.length;
  const spikes = s.spikePool.length;
  fly(s, 20000);
  assert.equal(s.chunks.length, chunks);
  assert.equal(s.coinPool.length, coins);
  assert.equal(s.spikePool.length, spikes);
  assert.ok(s.dist > 100_000, `the run did not travel: ${s.dist}`);
});

test("platforms stay reachable however fast the run gets", () => {
  // Gaps scale with speed, so this checks the scaling did not outrun the jump.
  // A generator that can emit an impossible gap is a game that kills you for
  // nothing, and it would only show up in the minute of a run nobody reaches.
  const s = fresh(7);
  fly(s, 20000);
  const airtime = (2 * -T.JUMP_V) / T.GRAVITY;
  const reach = airtime * T.SPEED_CAP;
  const sorted = [...s.chunks].sort((a, b) => a.x - b.x);
  let checked = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
    if (gap <= 0) continue;
    checked++;
    assert.ok(
      gap <= reach,
      `a ${gap.toFixed(0)}px gap is wider than the ${reach.toFixed(0)}px a full jump covers`
    );
  }
  assert.ok(checked > 5, "no gaps were actually examined");
});

test("the same seed produces the same run", () => {
  // The reason `Math.random` is banned in a game module: a reported run has to
  // be reproducible or its bug cannot be looked at.
  const a = fresh(2024);
  const b = fresh(2024);
  for (let i = 0; i < 900; i++) {
    a.step(DT, IDLE);
    b.step(DT, IDLE);
  }
  assert.equal(a.dead, b.dead);
  assert.equal(a.score, b.score);
  assert.equal(a.dist, b.dist);
});

test("falling into a gap ends the run", () => {
  const s = fresh();
  s.py = H + 200;
  s.onGround = false;
  s.step(DT, IDLE);
  assert.equal(s.dead, "gap");
});

test("a dead run stops simulating", () => {
  // The host stops the loop, but a game that kept stepping after death would
  // keep scoring, and the number on the death screen would climb behind it.
  const s = fresh();
  s.py = H + 200;
  s.onGround = false;
  s.step(DT, IDLE);
  const { score, dist } = s;
  for (let i = 0; i < 100; i++) s.step(DT, IDLE);
  assert.equal(s.score, score);
  assert.equal(s.dist, dist);
});
