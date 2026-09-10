import test from "node:test";
import assert from "node:assert/strict";
import { createPainter } from "@/arcade/host/board";
import {
  CARD_SQUARES,
  HAND_LIMIT,
  JUMPS,
  LADDERS,
  SNAKES,
  SNAKES_GRAPH,
  SQUARES,
  START_SQUARE,
  advance,
  gridOf,
  handCell,
  handSlotOf,
  squareAt,
  walk,
  walkBack,
} from "./board";

/**
 * The board, checked for the four things a hand-written table gets wrong.
 *
 * A hundred squares, nineteen entries in a jump table and eight card squares
 * is enough data to typo and not enough to notice. Each test below is one
 * property that would otherwise be found by a player.
 */

test("the fold is a fold: every next square is the one beside it", () => {
  // The whole reason a ladder can be a straight line on the paper. If the
  // boustrophedon were wrong at a row end, squares 10 and 11 would be a
  // board's width apart and every drawn snake would cross the page.
  for (let n = 1; n < SQUARES; n++) {
    const a = squareAt(n);
    const b = squareAt(n + 1);
    const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    assert.equal(
      Math.round(d * 1000),
      1000,
      `squares ${n} and ${n + 1} are ${d.toFixed(2)} apart`
    );
  }
});

test("square 1 is bottom left and square 100 is top left", () => {
  // The two corners everybody knows, and the check that the whole grid is not
  // upside down or mirrored — which is a bug the fold test above cannot see,
  // because a mirrored board folds correctly too.
  assert.deepEqual(gridOf(1), { col: 0, row: 9 });
  assert.deepEqual(gridOf(10), { col: 9, row: 9 });
  assert.deepEqual(gridOf(11), { col: 9, row: 8 });
  assert.deepEqual(gridOf(SQUARES), { col: 0, row: 0 });
});

test("ladders go up, snakes go down, and nothing is both", () => {
  for (const [foot, top] of LADDERS) {
    assert.ok(top > foot, `the ladder at ${foot} goes down`);
  }
  for (const [head, tail] of SNAKES) {
    assert.ok(tail < head, `the snake at ${head} goes up`);
  }

  // A square that is both an end and a start is a chain, and a chain is a rule
  // nobody can hold in their head — you land on 47, slide to 26, and 26 is a
  // ladder foot, so what happened? `applyMove` resolves exactly one jump, so a
  // chain in the table would be a jump the rules silently ignore.
  const starts = new Set(JUMPS.keys());
  const ends = new Set(JUMPS.values());
  for (const end of ends) {
    assert.ok(!starts.has(end), `square ${end} is the far end of one jump and the start of another`);
  }
  assert.equal(starts.size, LADDERS.length + SNAKES.length, "two jumps share a square");
});

test("no card square is on a snake, a ladder, or either end of one", () => {
  // Stated in `board.ts` as the reason the list is what it is: a square that
  // both teleports you and pays you is a reward the player never sees arrive,
  // because the token is already elsewhere by the time they look.
  for (const n of CARD_SQUARES) {
    assert.ok(!JUMPS.has(n), `card square ${n} is also a jump`);
    assert.ok(
      ![...JUMPS.values()].includes(n),
      `card square ${n} is where a jump lands`
    );
    assert.ok(n > 0 && n < SQUARES, `card square ${n} is off the board`);
  }
  assert.ok(CARD_SQUARES.size >= 6, "too few card squares to keep a hand fed");
});

test("a walk counts every square it passes through, bounce included", () => {
  assert.deepEqual(walk(0, 3), [1, 2, 3]);
  assert.deepEqual(walk(97, 3), [98, 99, 100]);
  // The bounce, counted out the way a person counts it: up to a hundred and
  // back down. An arrival at 98 with no walk is a move the player cannot
  // check.
  assert.deepEqual(walk(97, 5), [98, 99, 100, 99, 98]);
  assert.deepEqual(walk(99, 4), [100, 99, 98, 97]);
});

test("nothing walks off either end of the board", () => {
  // Twelve is the largest step there is — a boosted six — so this is every
  // reachable case rather than a sample.
  for (let from = 0; from <= SQUARES; from++) {
    for (let steps = 1; steps <= 12; steps++) {
      const path = walk(from, steps);
      assert.equal(path.length, steps, `walk from ${from} by ${steps} lost a square`);
      for (const sq of path) {
        assert.ok(sq >= 0 && sq <= SQUARES, `walk from ${from} reached ${sq}`);
      }
      assert.equal(advance(from, steps), path[path.length - 1]);
    }
  }
});

test("a reverse stops at the start rather than going negative", () => {
  assert.deepEqual(walkBack(4, 3), [3, 2, 1]);
  assert.deepEqual(walkBack(2, 6), [1, 0]);
  assert.deepEqual(walkBack(START_SQUARE, 3), []);
});

test("every cell in the graph has a position, and it is a number", () => {
  // A hole in the array is a token drawn at (0, 0) — the top-left corner of
  // the board — with no error anywhere.
  assert.equal(SNAKES_GRAPH.cells.length, SQUARES + 1 + HAND_LIMIT);
  for (let i = 0; i < SNAKES_GRAPH.cells.length; i++) {
    const p = SNAKES_GRAPH.cells[i];
    assert.ok(p, `cell ${i} has no position`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `cell ${i} is NaN`);
    assert.ok(
      p.x >= 0 && p.x <= SNAKES_GRAPH.size && p.y >= 0 && p.y <= SNAKES_GRAPH.size,
      `cell ${i} is off the board at ${p.x}, ${p.y}`
    );
  }
});

test("a tap on a card cannot land on a square, or on the next card", () => {
  // The reason the hand is in the graph at all: it reuses the one tested
  // inverse of the board transform. That only holds if the tray is far enough
  // from the grid that `cellAt`'s deliberately generous radius cannot resolve
  // a finger to the wrong thing — which is a geometry fact, and drifts the
  // moment somebody moves the tray up a little to make room.
  const painter = createPainter(SNAKES_GRAPH);
  for (const [w, h] of [
    [900, 640],
    [390, 844],
    [600, 600],
  ]) {
    const { ctx, t } = recorder();
    painter.layout(ctx, w, h);
    const toScreen = (i: number) => ({
      x: t.x + SNAKES_GRAPH.cells[i].x * t.k,
      y: t.y + SNAKES_GRAPH.cells[i].y * t.k,
    });

    for (let slot = 0; slot < HAND_LIMIT; slot++) {
      const cell = handCell(slot);
      const at = toScreen(cell);
      const hit = painter.cellAt(at.x, at.y);
      assert.equal(hit, cell, `card ${slot} at ${w}x${h} taps as cell ${hit}`);
      assert.equal(handSlotOf(hit as number), slot);
    }

    // And the round trip the other way: every square still finds itself now
    // that there are four more cells in the array to be confused with.
    for (let n = 0; n <= SQUARES; n++) {
      const at = toScreen(n);
      assert.equal(painter.cellAt(at.x, at.y), n, `square ${n} at ${w}x${h}`);
    }
  }
});

/** A context that records nothing but the transform `layout` installs. */
function recorder() {
  const t = { x: 0, y: 0, k: 1 };
  const ctx = {
    translate: (x: number, y: number) => {
      t.x = x;
      t.y = y;
    },
    scale: (k: number) => {
      t.k = k;
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, t };
}
