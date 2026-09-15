import test from "node:test";
import assert from "node:assert/strict";
import { createSim, type Sim } from "./sim";
import * as T from "./tuning";

const DT = 1 / 60;

/** Slide without dropping. */
function slide(s: Sim, steps: number) {
  for (let i = 0; i < steps; i++) s.step(DT, false);
}

/**
 * Put the block exactly where we want it, then drop it.
 *
 * This is only meaningful because the sim resolves a drop at the position the
 * block is already in rather than after advancing it — see the note in
 * `sim.ts`. If that order is ever reversed, most of the assertions below stop
 * being about the positions they name.
 */
function dropAt(s: Sim, x: number) {
  s.curX = x;
  s.step(DT, true);
}

const topRow = (s: Sim) => s.rowAt(0)!;

test("the run starts with a base course under the first drop", () => {
  const s = createSim();
  assert.equal(s.placed, 1);
  assert.equal(topRow(s).w, T.START_W);
  assert.equal(s.dead, false);
});

test("a perfect drop gives width back rather than taking it", () => {
  // The rule the whole game is built on. Without it every tower is a losing
  // race against its own width and skill changes nothing but the length.
  const s = createSim();
  const before = topRow(s);
  const w0 = before.w;
  // Land inside the window but not dead centre, so the snap is doing work.
  dropAt(s, before.x + T.PERFECT_WINDOW - 1);
  assert.equal(s.drop, "perfect");
  assert.equal(s.combo, 1);
  const placed = topRow(s);
  assert.equal(placed.x, before.x, "a perfect did not snap into line");
  assert.equal(placed.w, Math.min(T.START_W, w0 + T.WIDTH_BONUS));
});

test("a perfect never grows the tower past the block it started with", () => {
  // Otherwise a good player ends up with a plank and the game stops asking
  // anything of them.
  const s = createSim();
  for (let i = 0; i < 40; i++) dropAt(s, topRow(s).x);
  assert.ok(topRow(s).w <= T.START_W, `tower grew to ${topRow(s).w}`);
});

test("an imperfect drop is sliced down to the overlap", () => {
  const s = createSim();
  const before = topRow(s);
  const off = 40; // well outside the perfect window
  dropAt(s, before.x + off);
  assert.equal(s.drop, "placed");
  assert.equal(topRow(s).w, before.w - off);
  assert.equal(topRow(s).x, before.x + off);
});

test("a placed drop reports how much of the block survived", () => {
  // `kept` is what the near-miss sting reads: a fraction, so the cue means
  // the same thing on a wide base and on a sliver twenty rows up.
  const s = createSim();
  const before = topRow(s);
  const off = Math.round(before.w * 0.75);
  dropAt(s, before.x + off);
  assert.equal(s.drop, "placed");
  assert.ok(Math.abs(s.kept - 0.25) < 0.02, `kept ${s.kept}`);
  assert.ok(s.kept < T.NEAR_MISS_KEPT, "a quarter left should count as a near miss");

  const wide = createSim();
  dropAt(wide, topRow(wide).x + 8);
  assert.ok(wide.kept > T.NEAR_MISS_KEPT, "a small trim is not a near miss");
});

test("the sliced piece is thrown on the side it hung over", () => {
  const right = createSim();
  dropAt(right, topRow(right).x + 40);
  const a = right.slices.find((sl) => sl.life > 0)!;
  assert.ok(a.vx > 0, "an overhang to the right flew left");

  const left = createSim();
  dropAt(left, topRow(left).x - 40);
  const b = left.slices.find((sl) => sl.life > 0)!;
  assert.ok(b.vx < 0, "an overhang to the left flew right");
});

test("missing the tower entirely ends the run", () => {
  const s = createSim();
  dropAt(s, topRow(s).x + topRow(s).w + 10);
  assert.equal(s.drop, "missed");
  assert.equal(s.dead, true);
});

test("a dead run stops stacking", () => {
  const s = createSim();
  dropAt(s, topRow(s).x + topRow(s).w + 10);
  const placed = s.placed;
  const score = s.score;
  slide(s, 60);
  dropAt(s, 0);
  assert.equal(s.placed, placed);
  assert.equal(s.score, score);
});

test("one imperfect drop breaks the combo", () => {
  const s = createSim();
  dropAt(s, topRow(s).x);
  dropAt(s, topRow(s).x);
  assert.equal(s.combo, 2);
  dropAt(s, topRow(s).x + 30);
  assert.equal(s.combo, 0);
  assert.equal(s.bestCombo, 2, "the run forgot its best combo");
});

test("a combo is worth more than the rows it is made of", () => {
  const perfect = createSim();
  const sloppy = createSim();
  for (let i = 0; i < 6; i++) {
    dropAt(perfect, topRow(perfect).x);
    dropAt(sloppy, topRow(sloppy).x + 8);
  }
  assert.equal(perfect.placed, sloppy.placed, "the towers are not the same height");
  assert.ok(
    perfect.score > sloppy.score,
    `skill paid nothing: ${perfect.score} vs ${sloppy.score}`
  );
});

test("the block stays on screen at every speed", () => {
  // Ping-pong that reflects around an overshoot puts the block off the edge
  // for a frame, which reads as a bug in a game with no physics at all.
  const s = createSim();
  s.speed = T.SLIDE_CAP;
  for (let i = 0; i < 4000; i++) {
    s.step(DT, false);
    assert.ok(s.curX >= 0, `block left the screen at ${s.curX}`);
    assert.ok(
      s.curX + s.curW <= T.VIEW_W,
      `block ran off the right at ${s.curX + s.curW}`
    );
  }
});

test("the slide speeds up per row and then stops", () => {
  const s = createSim();
  const start = s.speed;
  dropAt(s, topRow(s).x);
  assert.equal(s.speed, start + T.SLIDE_INC);
  for (let i = 0; i < 300; i++) dropAt(s, topRow(s).x);
  assert.equal(s.speed, T.SLIDE_CAP, "the slide speed has no ceiling");
});

test("the tower ring never grows, however tall the tower gets", () => {
  // A session's worth of rows kept in full would be an array that grows all
  // session to hold rows nothing draws.
  const s = createSim();
  const rows = s.rows.length;
  const slices = s.slices.length;
  for (let i = 0; i < 500; i++) dropAt(s, topRow(s).x);
  assert.equal(s.rows.length, rows);
  assert.equal(s.slices.length, slices);
  assert.equal(s.placed, 501);
});

test("rowAt reads the tower downward from the top", () => {
  const s = createSim();
  dropAt(s, topRow(s).x + 30);
  dropAt(s, topRow(s).x + 20);
  const top = s.rowAt(0)!;
  const below = s.rowAt(1)!;
  assert.ok(top.w < below.w, "the top row is not the narrowest");
  assert.equal(s.rowAt(999), null, "reading past the ring returned a row");
});

test("the next block enters from the far side of the tower", () => {
  // So the rhythm alternates instead of the player waiting out a full sweep.
  const s = createSim();
  const base = topRow(s);
  dropAt(s, base.x - 10); // overlaps, and lands left of centre
  assert.equal(s.dead, false, "the setup drop missed the tower");
  assert.ok(topRow(s).x < T.VIEW_W / 2);
  assert.equal(s.dir, 1);
  assert.equal(s.curX, 0);
});

test("a drop lands where the block was, not a step further on", () => {
  // The bug this exists for: resolving the drop after advancing the slide
  // puts the block up to `speed * dt` past the aim — 8.7 px at the cap,
  // against a 4 px perfect window. Perfects would become unhittable exactly
  // as the game got fast enough to need them.
  const s = createSim();
  s.speed = T.SLIDE_CAP;
  const base = topRow(s);
  dropAt(s, base.x);
  assert.equal(s.drop, "perfect", "a dead-centre drop at full speed missed");
});

/**
 * ── The tower goes up ────────────────────────────────────────────────────
 *
 * These pin the world-to-screen transform rather than the rules, because the
 * bug they exist for was purely a transform: every rule below already held
 * while the tower was being drawn downward from a pinned top, and the game was
 * still showing a stack that descended into the floor. A rule test cannot
 * catch a sign error in a projection; only a test that asks where a row lands
 * on screen can.
 */

test("the base rests on the ground rather than floating", () => {
  const s = createSim();
  // The base is row 0, and a row occupies [y, y + ROW_H].
  assert.equal(s.rowY(0) + T.ROW_H, T.FLOOR_Y);
});

test("the active block sits one row above the top of the tower", () => {
  const s = createSim();
  assert.equal(s.rowY(s.placed - 1) - s.rowY(s.placed), T.ROW_H);
  for (let i = 0; i < 5; i++) dropAt(s, topRow(s).x);
  assert.equal(s.rowY(s.placed - 1) - s.rowY(s.placed), T.ROW_H);
});

test("a taller tower puts its newest row higher up the screen", () => {
  // The regression itself. Canvas y grows downward, so "higher" is a SMALLER
  // number, and the shipped renderer had this exactly inverted.
  const s = createSim();
  const first = s.rowY(s.placed - 1);
  dropAt(s, topRow(s).x);
  assert.ok(
    s.rowY(s.placed - 1) < first,
    "the tower grew downward: newest row moved to a larger y"
  );
});

test("the view does not move until the tower needs it to", () => {
  // A camera that starts climbing on the first drop makes the ground scroll
  // away under a two-block tower, which is worse than not having one.
  const s = createSim();
  assert.equal(s.camTarget, 0);
  dropAt(s, topRow(s).x);
  assert.equal(s.camTarget, 0, "the camera moved for a two-block tower");
});

test("once it does move, the play line stops climbing", () => {
  const s = createSim();
  // Well past the point where the stack reaches the drop line.
  for (let i = 0; i < 60; i++) {
    dropAt(s, topRow(s).x);
    // Settle the easing, which is the only reason cam and camTarget differ.
    for (let k = 0; k < 120; k++) s.step(DT, false);
  }
  const y = s.rowY(s.placed - 1);
  assert.ok(
    Math.abs(y - T.VIEW_H * T.DROP_LINE) < 1,
    `the top of the tower settled at ${y}, not the drop line`
  );
  assert.ok(y > 0, "the tower climbed off the top of the screen");
});

test("a sliced piece is thrown from the height it was cut at", () => {
  // Not from a fixed screen position: once the view climbs, a constant would
  // spawn debris in the middle of the tower.
  const s = createSim();
  for (let i = 0; i < 40; i++) dropAt(s, topRow(s).x);
  for (let k = 0; k < 120; k++) s.step(DT, false);
  const cutAt = s.rowY(s.placed);
  dropAt(s, topRow(s).x + 30);
  const piece = s.slices.find((sl) => sl.life > 1.0)!;
  assert.ok(
    Math.abs(piece.y - cutAt) < 1,
    `debris spawned at ${piece.y}, block was cut at ${cutAt}`
  );
});
