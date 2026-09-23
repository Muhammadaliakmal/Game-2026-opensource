import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "@/arcade/host/rng";
import type { GameServices, InputState } from "@/arcade/host/types";
import ludo from "./index";
import { BOARD_SIZE } from "./board";

/**
 * The drawing, checked without a canvas.
 *
 * This cannot tell you the board looks right — nothing but a screenshot can.
 * What it can tell you is the two things canvas 2D is worst at reporting, both
 * of which it swallows in silence:
 *
 *   - **A NaN coordinate draws nothing and throws nothing.** One undefined in
 *     one expression and a token, a yard or the whole board is simply absent,
 *     with a clean console and a passing type check.
 *   - **Ink outside the board is ink nobody sees.** Everything after
 *     `painter.layout` is in board units, so a coordinate of 40 is not a
 *     scaling bug, it is a piece drawn a board and a half off the edge.
 *
 * The context is a recorder rather than a stub with the methods filled in: a
 * fake that answers only the calls somebody thought of is a fake that throws
 * the first time the renderer is improved.
 */

interface Recorded {
  name: string;
  numbers: number[];
  strings: string[];
}

function recorder() {
  const calls: Recorded[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, prop: string) {
        return (...args: unknown[]) => {
          calls.push({
            name: prop,
            numbers: args.filter((a): a is number => typeof a === "number"),
            strings: args.filter((a): a is string => typeof a === "string"),
          });
        };
      },
      // Every style property — `fillStyle`, `lineWidth`, `font` — is a write
      // the recorder has no opinion about.
      set: () => true,
    }
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

/**
 * Ink-placing calls, and how many of their leading numbers are positions.
 *
 * A count rather than a set, because not every number a draw call takes is a
 * place: `arc` ends with two angles, and -1.57 is not a token drawn off the
 * left edge, it is -pi/2. Checking those as coordinates is how this test fails
 * on correct code.
 */
const DRAWS: Record<string, number> = {
  fillRect: 4,
  strokeRect: 4,
  rect: 4,
  moveTo: 2,
  lineTo: 2,
  arcTo: 5,
  // x, y, radius. The two angles after them are angles.
  arc: 3,
};

/**
 * Text is the one thing on this board NOT drawn in board units.
 *
 * `painter.label` undoes the scale so a font size is a real pixel size, which
 * means its coordinates come out multiplied by that scale — 300, not 7.5. It
 * is checked below by dividing them back down rather than by being skipped,
 * and that is a strictly stronger test than the one this replaced: the old
 * helper translated to the anchor first and drew at (0, 0), so "every mark
 * lands on the board" was passing on two zeroes for every label in the game.
 */
const TEXT_PLACES = 2;

const input: InputState = {
  keys: {},
  pointer: { x: 0, y: 0, down: false },
  axis: { x: 0, y: 0 },
  touches: [],
};

/**
 * Play a match, drawing a frame every so often, and keep every call made.
 *
 * Kept frame by frame rather than as one list, because the board-unit rule
 * restarts every frame: each one repaints the backdrop in pixels before
 * installing the transform, so a single "the transform starts here" index over
 * the whole run declares frame two's backdrop to be a mark 900 units off the
 * board.
 */
function drawThrough(seed: number, frames = 60) {
  const { ctx, calls } = recorder();
  let drawn = 0;

  const services: GameServices = {
    ctx,
    width: 900,
    height: 640,
    input,
    rng: mulberry32(seed),
    sfx: () => {},
    onScore: () => {},
    onGameOver: () => {},
    onPlaced: () => {},
  };

  const game = ludo.create(services) as Exclude<
    ReturnType<typeof ludo.create>,
    Promise<unknown>
  >;

  // Spread across a whole match, so the frames land in every phase there is:
  // the dice tumbling, a token mid-hop, a capture's flash, seats already home.
  const byFrame: Recorded[][] = [];
  for (let step = 0; step < frames * 90; step++) {
    game.step(1 / 60, services);
    if (step % 90 === 0) {
      const from = calls.length;
      game.render(0.5, services);
      byFrame.push(calls.slice(from));
      drawn++;
    }
  }
  game.destroy();
  return { calls, byFrame, drawn };
}

test("nothing is drawn at a coordinate that is not a number", () => {
  const { calls, drawn } = drawThrough(2024);
  assert.ok(drawn >= 50, "the match was too short to have covered much");

  for (const call of calls) {
    for (const n of call.numbers) {
      assert.ok(
        Number.isFinite(n),
        `${call.name} was handed ${n} — canvas would draw nothing and say nothing`
      );
    }
  }
});

test("every mark lands on the board", () => {
  const { byFrame } = drawThrough(77);

  // A cell and a half of margin either side, because a yard's rounded corner
  // and a highlight ring both sit a little proud of the cells they belong to.
  const low = -1.5;
  const high = BOARD_SIZE + 1.5;

  for (const frame of byFrame) {
    // The backdrop is painted in pixels, so the board-unit rule starts at this
    // frame's `scale` — which is `painter.layout` and nothing else. Its
    // argument is also what a label's coordinates are multiplied by.
    const start = frame.findIndex((c) => c.name === "scale");
    assert.ok(start > 0, "the board was never laid out");
    const scale = frame[start].numbers[0];
    assert.ok(scale > 0, "the layout installed no scale");

    for (let i = start + 1; i < frame.length; i++) {
      const call = frame[i];
      const text = call.name === "fillText";
      const places = text ? TEXT_PLACES : DRAWS[call.name];
      if (places === undefined) continue;
      for (const raw of call.numbers.slice(0, places)) {
        const n = text ? raw / scale : raw;
        assert.ok(
          n >= low && n <= high,
          `${call.name} drew at ${n.toFixed(2)}, off a ${BOARD_SIZE}-unit board`
        );
      }
    }
  }
});

test("the table is named on the board, not only in the lobby", () => {
  // Four seats with four names on them is what makes the other three players
  // people rather than colours, which is the whole argument in `bots.ts` for
  // giving a bot a real name in the first place.
  const { calls } = drawThrough(5);
  const written = new Set(
    calls.filter((c) => c.name === "fillText").flatMap((c) => c.strings)
  );
  assert.ok(written.has("You"), "the local player is not on the board");

  const others = [...written].filter((t) => t !== "You" && !/^\\d+$/.test(t));
  assert.ok(others.length >= 3, `only ${others.length} seats were labelled`);
});

test("a frame is a few hundred calls, not a few thousand", () => {
  // Canvas 2D is fast until it is asked to do too much per frame, and this
  // board is ~96 cells plus a handful of pieces. A frame an order of magnitude
  // past that means something is being redrawn per cell that should be drawn
  // once — the failure mode that arrives as "the phone gets hot", long after
  // the commit that caused it.
  const { calls, drawn } = drawThrough(31);
  const perFrame = calls.length / drawn;
  assert.ok(perFrame < 1200, `${perFrame.toFixed(0)} canvas calls per frame`);
});
