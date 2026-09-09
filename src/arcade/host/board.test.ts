import test from "node:test";
import assert from "node:assert/strict";
import { SEAT_COLOURS, SEAT_SHAPES, createPainter, type BoardGraph } from "./board";

/**
 * A canvas context that records the transform and draws nothing.
 *
 * The property worth testing here is that `layout` and `cellAt` agree — they
 * are the forward and inverse of one transform written twice, and when they
 * disagree the board draws perfectly and cannot be tapped, which is a bug
 * report nobody knows how to describe. Recording `translate` and `scale` is
 * enough to compute where a cell landed on screen and hand it straight back.
 */
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

/** A 4x4 lattice of cells in a 10-unit square, offset off the origin. */
const grid: BoardGraph = {
  size: 10,
  safe: new Set([5]),
  cells: Array.from({ length: 16 }, (_, i) => ({
    x: 1.5 + (i % 4) * 2.33,
    y: 1.5 + Math.floor(i / 4) * 2.33,
  })),
};

test("the board is square, sized to the shorter axis, and centred", () => {
  const p = createPainter(grid);
  const { ctx, t } = recorder();
  p.layout(ctx, 800, 400);

  // 400 tall against a 10-unit board plus 0.6 of margin either side.
  assert.equal(Math.round(p.scale * 1000), Math.round((400 / 11.2) * 1000));
  const drawn = grid.size * p.scale;
  assert.equal(drawn < 400, true, "the margin is real, not decorative");
  assert.equal(Math.round(t.x), Math.round((800 - drawn) / 2), "centred across");
  assert.equal(Math.round(t.y), Math.round((400 - drawn) / 2), "and down");
});

test("a tap on a cell finds that cell, in portrait and in landscape", () => {
  for (const [w, h] of [
    [800, 400],
    [390, 844],
    [500, 500],
  ]) {
    const p = createPainter(grid);
    const { ctx, t } = recorder();
    p.layout(ctx, w, h);

    for (let i = 0; i < grid.cells.length; i++) {
      const c = p.at(i);
      const px = t.x + c.x * t.k;
      const py = t.y + c.y * t.k;
      assert.equal(p.cellAt(px, py), i, `cell ${i} at ${w}x${h}`);
    }
  }
});

test("a tap near a token still counts as a tap on it", () => {
  const p = createPainter(grid);
  const { ctx, t } = recorder();
  p.layout(ctx, 500, 500);

  const c = p.at(5);
  // Half a cell off centre. A finger is bigger than a cell on a phone, and a
  // hit test that demanded the exact centre would make Ludo unplayable.
  const px = t.x + (c.x + 0.5) * t.k;
  const py = t.y + c.y * t.k;
  assert.equal(p.cellAt(px, py), 5);
});

test("a tap on empty board is nothing, not the nearest cell", () => {
  const p = createPainter(grid);
  const { ctx } = recorder();
  p.layout(ctx, 500, 500);
  assert.equal(p.cellAt(2, 2), null, "the corner outside the board");
  assert.equal(p.cellAt(-40, 250), null, "and off it entirely");
});

test("stacked tokens do not share a centre", () => {
  const p = createPainter(grid);
  for (let n = 1; n <= 4; n++) {
    const offsets = p.stack(n);
    assert.equal(offsets.length, n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = offsets[i].x - offsets[j].x;
        const dy = offsets[i].y - offsets[j].y;
        // Knowing there are three of yours on a square is most of Ludo's
        // tactics, and it is unreadable if they are drawn on top of each other.
        assert.equal(
          Math.hypot(dx, dy) > 0.15,
          true,
          `${n} tokens: ${i} and ${j} overlap`
        );
      }
    }
  }
});

test("every seat has both a colour and a shape", () => {
  // Colour alone fails for roughly one man in twelve, and red-against-green is
  // the exact pair Ludo is built on. The shape is the fallback, so the two
  // lists must not drift apart.
  assert.equal(SEAT_COLOURS.length, 4);
  assert.equal(SEAT_SHAPES.length, SEAT_COLOURS.length);
  assert.equal(new Set(SEAT_SHAPES).size, SEAT_SHAPES.length, "and are distinct");
  assert.equal(new Set(SEAT_COLOURS).size, SEAT_COLOURS.length);
});
