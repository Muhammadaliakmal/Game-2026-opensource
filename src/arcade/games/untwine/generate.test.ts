import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, levelBoard, paramsFor, rayOf, solve } from "./generate";

/**
 * The generator's whole promise is "every board can be cleared", and that is
 * a claim about every seed, so it is checked across many of them rather than
 * argued from the construction. `solve` is an independent Kahn pass and does
 * not know how the board was made.
 */

test("every board on the first 40 levels is solvable, across many runs", () => {
  for (let run = 1; run <= 12; run++) {
    for (let level = 1; level <= 40; level++) {
      const b = levelBoard(level, run * 7919);
      const s = solve(b);
      assert.ok(s.solvable, `run ${run} level ${level} cannot be cleared`);
      assert.ok(b.lines.length >= 2, `run ${run} level ${level} has ${b.lines.length} lines`);
    }
  }
});

test("boards are dense", () => {
  let total = 0;
  let count = 0;
  for (let run = 1; run <= 8; run++) {
    for (let level = 3; level <= 30; level++) {
      const s = solve(levelBoard(level, run * 104729));
      total += s.coverage;
      count++;
      assert.ok(s.coverage > 0.8, `level ${level} covered only ${(s.coverage * 100).toFixed(1)}%`);
    }
  }
  assert.ok(total / count > 0.92, `mean coverage ${((total / count) * 100).toFixed(1)}%`);
});

test("lines never sit on their own way out, and never overlap", () => {
  for (let level = 1; level <= 30; level++) {
    const b = levelBoard(level, 31337);
    const seen = new Set<number>();
    for (const l of b.lines) {
      assert.ok(l.cells.length >= 2);
      const own = new Set(l.cells);
      for (const c of rayOf(b.cols, b.rows, l.cells[0], l.dir)) {
        assert.ok(!own.has(c), `a line on level ${level} blocks itself`);
      }
      for (const c of l.cells) {
        assert.ok(b.mask[c] === 1, "a line sits outside the board's shape");
        assert.ok(!seen.has(c), "two lines share a cell");
        seen.add(c);
      }
      // Body cells are orthogonally adjacent: a line is a path, not a scatter.
      for (let i = 1; i < l.cells.length; i++) {
        const a = l.cells[i - 1];
        const z = l.cells[i];
        const d =
          Math.abs((a % b.cols) - (z % b.cols)) +
          Math.abs(Math.floor(a / b.cols) - Math.floor(z / b.cols));
        assert.equal(d, 1);
      }
    }
  }
});

test("the stored order is a real solution", () => {
  for (let level = 1; level <= 25; level++) {
    const b = levelBoard(level, 99);
    const owner = new Int32Array(b.cols * b.rows).fill(-1);
    b.lines.forEach((l, i) => l.cells.forEach((c) => (owner[c] = i)));
    for (const i of b.order) {
      const l = b.lines[i];
      for (const c of rayOf(b.cols, b.rows, l.cells[0], l.dir)) {
        assert.equal(owner[c], -1, `level ${level}: order pulls line ${i} into another`);
      }
      for (const c of l.cells) owner[c] = -1;
    }
    assert.equal(b.order.length, b.lines.length);
  }
});

test("the same seed makes the same board; another seed does not", () => {
  const p = paramsFor(12);
  const a = generate(p, 5);
  const b = generate(p, 5);
  const c = generate(p, 6);
  assert.deepEqual(a.lines, b.lines);
  assert.notDeepEqual(a.lines, c.lines);
});

test("the opening boards teach: small and straight", () => {
  const p1 = paramsFor(1);
  assert.equal(p1.bend, 0);
  assert.ok(p1.cols * p1.rows <= 25);
  // Later boards really are bigger, and every fifth is a breather shape.
  assert.ok(paramsFor(20).cols * paramsFor(20).rows > p1.cols * p1.rows * 6);
  assert.notEqual(paramsFor(10).shape, "rect");
  assert.equal(paramsFor(11).shape, "rect");
});

test("generation is fast enough to run on the press", () => {
  const t0 = performance.now();
  for (let level = 20; level <= 29; level++) levelBoard(level, level);
  const each = (performance.now() - t0) / 10;
  // Generous for a CI box; on a desktop it is a few milliseconds.
  assert.ok(each < 120, `a late board took ${each.toFixed(1)} ms`);
});
