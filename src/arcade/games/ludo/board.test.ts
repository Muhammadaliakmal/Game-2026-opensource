import test from "node:test";
import assert from "node:assert/strict";
import {
  CELL_COUNT,
  HOME,
  IN_YARD,
  LANE_FIRST,
  LAST_LOOP,
  LOOP_CELLS,
  LOOP_LEN,
  LUDO_GRAPH,
  SAFE,
  START,
  cellFor,
  homeCell,
  laneCell,
  yardCell,
} from "./board";

/**
 * The board is generated from one quarter and a rotation, so these tests are
 * checking the generator rather than a table somebody typed. That is the
 * trade: a hand-written table is checked by reading it, a generated one is
 * checked by asserting the properties it was generated to have.
 */

const pos = (cell: number) => LUDO_GRAPH.cells[cell];
const adjacent = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

test("the loop is 52 distinct cells", () => {
  assert.equal(LOOP_CELLS.length, LOOP_LEN);
  const seen = new Set(LOOP_CELLS.map(([c, r]) => `${c},${r}`));
  assert.equal(seen.size, LOOP_LEN, "the quarters do not overlap");
});

test("the loop is a loop: it steps one cell at a time, and it closes", () => {
  // Forty-eight straight steps and four corners, and the corners are diagonal.
  //
  // That is the real board rather than a concession to this one: an arm's edge
  // row and the next arm's edge column meet at a vertex, and the square between
  // them — (6,6) and its three rotations — is part of the central design, not
  // of the track. A token turning the corner therefore moves diagonally, which
  // every standard 52-cell Ludo table does.
  //
  // Asserted as a distribution rather than as `d <= 2`, which would also pass a
  // table that took a two-cell leap in the middle of a straight — the exact
  // fault this test exists to catch. The wrap from 51 back to 0 is included,
  // because it is the step the rotation has to get right and the one a
  // hand-typed table always gets wrong.
  const corners: number[] = [];
  for (let i = 0; i < LOOP_LEN; i++) {
    const a = LOOP_CELLS[i];
    const b = LOOP_CELLS[(i + 1) % LOOP_LEN];
    const dc = Math.abs(a[0] - b[0]);
    const dr = Math.abs(a[1] - b[1]);
    const straight = dc + dr === 1;
    const corner = dc === 1 && dr === 1;
    assert.ok(
      straight || corner,
      `cells ${i} and ${(i + 1) % LOOP_LEN} are neither adjacent nor a corner`
    );
    if (corner) corners.push(i);
  }
  // One per quarter, and inside it rather than at the seam between two — the
  // seam is the straight that closes the ring.
  assert.deepEqual(corners, [5, 18, 31, 44]);
});

test("the four seats start a quarter apart", () => {
  assert.equal(START.length, 4);
  for (let s = 0; s < 4; s++) {
    assert.equal((START[s] - START[0] + LOOP_LEN) % LOOP_LEN, s * 13);
  }
});

test("a seat walks straight into its own home lane", () => {
  // The reason `START` is [1, 14, 27, 40] and not the spec's [0, 13, 26, 39].
  // Off by one cell, the last loop square is diagonal to the lane and the turn
  // has to be drawn as a sidestep.
  for (let s = 0; s < 4; s++) {
    const last = pos(cellFor(s, LAST_LOOP, 0));
    const first = pos(cellFor(s, LANE_FIRST, 0));
    assert.equal(adjacent(last, first), true, `seat ${s} sidesteps into home`);
  }
});

test("the home lane is six cells and ends next to home", () => {
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 5; i++) {
      assert.equal(adjacent(pos(laneCell(s, i)), pos(laneCell(s, i + 1))), true);
    }
    // Home itself is nudged off the centre so four seats do not stack there,
    // so this is a proximity check rather than an adjacency one.
    const lastLane = pos(cellFor(s, HOME - 1, 0));
    const home = pos(homeCell(s));
    assert.equal(Math.hypot(lastLane.x - home.x, lastLane.y - home.y) < 1.6, true);
  }
});

test("every seat is a rotation of seat 0", () => {
  // (x, y) -> (15 - y, x), applied once per seat. If this holds for every
  // progress value then the board has exact four-fold symmetry and no seat is
  // playing a slightly different game.
  const rot = (p: { x: number; y: number }) => ({ x: 15 - p.y, y: p.x });

  for (let token = 0; token < 4; token++) {
    for (let p = IN_YARD; p <= HOME; p++) {
      let expected = pos(cellFor(0, p, token));
      for (let s = 1; s < 4; s++) {
        expected = rot(expected);
        const actual = pos(cellFor(s, p, token));
        assert.equal(
          Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9,
          true,
          `seat ${s}, token ${token}, progress ${p}`
        );
      }
    }
  }
});

test("eight safe cells: four starts and four stars", () => {
  assert.equal(SAFE.size, 8);
  for (const s of START) {
    assert.equal(SAFE.has(s), true, "a start square is safe");
    // Eight is the largest gap a single roll cannot cross, so a token on a
    // star cannot be taken off it by one throw from the star behind it.
    assert.equal(SAFE.has((s + 8) % LOOP_LEN), true);
  }
});

test("every cell id maps to a position, and no two share one", () => {
  assert.equal(LUDO_GRAPH.cells.length, CELL_COUNT);
  const seen = new Map<string, number>();
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = pos(i);
    assert.equal(Number.isFinite(p?.x) && Number.isFinite(p?.y), true, `cell ${i}`);
    const key = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
    const prev = seen.get(key);
    assert.equal(prev, undefined, `cells ${prev} and ${i} are drawn on top of each other`);
    seen.set(key, i);
  }
});

test("progress maps onto the board exactly once per range", () => {
  for (let s = 0; s < 4; s++) {
    assert.equal(cellFor(s, IN_YARD, 2), yardCell(s, 2), "the yard slot, per token");
    assert.equal(cellFor(s, 0, 0), START[s], "progress 0 is the start square");
    assert.equal(cellFor(s, LANE_FIRST, 0), laneCell(s, 0));
    assert.equal(cellFor(s, HOME, 0), homeCell(s));

    // A lap is 51 cells, not 52: a token stops one short of its own start and
    // turns in. Walking the full 52 would take it past its lane entrance.
    const cells = new Set<number>();
    for (let p = 0; p <= LAST_LOOP; p++) cells.add(cellFor(s, p, 0));
    assert.equal(cells.size, 51);
    assert.equal(cells.has(START[s]), true);
  }
});

test("all four seats share the loop, and only the loop", () => {
  const loopCells = new Set<number>();
  const privateCells = new Set<number>();
  for (let s = 0; s < 4; s++) {
    for (let p = 0; p <= LAST_LOOP; p++) loopCells.add(cellFor(s, p, 0));
    for (let p = LANE_FIRST; p <= HOME; p++) {
      const c = cellFor(s, p, 0);
      assert.equal(loopCells.has(c), false, `seat ${s} lane cell ${c} is on the track`);
      assert.equal(privateCells.has(c), false, `two seats share lane cell ${c}`);
      privateCells.add(c);
    }
  }
  assert.equal(loopCells.size, LOOP_LEN, "between them the seats cover every loop cell");
});
