import type { TokenView, Vec2 } from "./anim";
import { gameFont } from "./type";

/**
 * The one board painter, and the geometry both board games share.
 *
 * ── What is shared is the graph, not the picture ─────────────────────────
 *
 * Ludo is a cross and Snakes & Ladders is a ten-by-ten grid, and no amount of
 * cleverness makes one drawing routine produce both. What they genuinely have
 * in common is narrower and more useful: a list of cells with positions, a
 * transform that fits that list into whatever rectangle the canvas is this
 * frame, the inverse of that transform so a tap finds a cell, a rule for
 * stacking several tokens on one cell without them hiding each other, and one
 * implementation each of a token and a die.
 *
 * So this file owns those six things and nothing else. A game's own furniture
 * — Ludo's coloured quadrants, the snakes, the numbers in the squares — is
 * drawn by the game, inside this transform. The alternative, a painter with a
 * `drawLadder` on it, is a shared module that both games have to edit.
 *
 * ── The house rules for canvas here ──────────────────────────────────────
 *
 * From `tower-stack/render.ts`, and they hold: draw in a fixed board space and
 * scale it to fit, so nothing computes layout from pixel sizes; and never
 * `shadowBlur`, which is the most expensive thing Canvas 2D offers. The
 * "glow" on a legal destination is a stroked ring with alpha, which looks the
 * same at a fraction of the cost and does not fall off a cliff on a phone.
 */

export type TokenShape = "circle" | "hexagon" | "square" | "diamond";

/**
 * Seat colours, chosen to be distinct in luminance as well as hue.
 *
 * Stated here rather than read from `tokens.css` because this is a canvas:
 * there is no cascade to read them from, and `getComputedStyle` per frame to
 * fetch a constant would be a layout read inside the render path. The DOM HUD
 * takes the same values from CSS; the pairing is a thing to keep, and the
 * reason it is safe to duplicate is that these four are a fixed set that a
 * theme does not get to change — they are the identity of the seats.
 */
export const SEAT_COLOURS = ["#E8484E", "#2FA8E0", "#F2B233", "#3FBF7F"] as const;

/**
 * And a shape per seat, which is not decoration.
 *
 * Colour alone fails for roughly one man in twelve, and red-versus-green is
 * the exact pair Ludo is built on. A shape is legible to everybody and costs
 * one `switch` in the draw call, so it is always on rather than hiding behind
 * a colourblind setting somebody has to know to look for.
 */
export const SEAT_SHAPES: readonly TokenShape[] = [
  "circle",
  "hexagon",
  "square",
  "diamond",
];

/**
 * A board, as far as the painter is concerned: where every cell is.
 *
 * Positions are in **board space** — an arbitrary square, conventionally
 * `size` units on a side — not pixels. Nothing in a board description ever
 * mentions a screen dimension, which is what lets the same graph serve a
 * phone in portrait and a desktop window.
 */
export interface BoardGraph {
  /** Indexed by cell id. Includes bases and home lanes; they are cells too. */
  readonly cells: readonly Vec2[];
  /** The side of the square the cells live in. */
  readonly size: number;
  /** Cells a token cannot be captured on. Empty for games without capture. */
  readonly safe: ReadonlySet<number>;
}

/** How much of a cell a token occupies. Leaves a visible gutter. */
const TOKEN_RADIUS = 0.34;

/** Board-space inset so the outermost cells are not flush to the canvas edge. */
const MARGIN = 0.6;

export interface BoardPainter {
  /** Board units to CSS pixels. Recomputed by `layout`. */
  readonly scale: number;

  /**
   * Fit the board to the canvas and install the transform.
   *
   * Sized to the **shorter** axis so the board is always square and never
   * cropped — spec §8.4, and the rule that makes a board game survive a phone
   * in landscape. Call inside a `save`/`restore` pair.
   */
  layout(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void;

  /** Board-space point for a cell. */
  at(cell: number): Vec2;

  /**
   * Which cell a tap landed on, in CSS pixels, or null.
   *
   * The inverse of `layout`, which is why both live here: two places deriving
   * the same transform is two places to get it wrong, and the failure mode is
   * a board that draws correctly and cannot be tapped.
   */
  cellAt(px: number, py: number): number | null;

  /**
   * Where each of `count` tokens sits within one cell, in board units.
   *
   * Stacked tokens that share a centre are tokens you cannot count, and
   * knowing there are three of yours on a square is most of Ludo's tactics.
   */
  stack(count: number): readonly Vec2[];

  drawToken(
    ctx: CanvasRenderingContext2D,
    view: TokenView,
    seat: number,
    opts?: { offset?: Vec2; dim?: boolean }
  ): void;

  /** A pulsing ring on a legal destination. `t` is a step counter. */
  drawHighlight(ctx: CanvasRenderingContext2D, cell: number, t: number): void;

  /**
   * Text at a board position, set in real pixels.
   *
   * The scale is undone for the duration, so `px` is a font size a browser can
   * hint rather than a fraction of a cell — 0.4 board units is a size no
   * engine hints properly, and names on a phone are the first thing to turn to
   * mush. It lives here rather than in a game because it is transform
   * arithmetic, which is the one thing this file owns.
   */
  label(
    ctx: CanvasRenderingContext2D,
    at: Vec2,
    text: string,
    px: number,
    colour: string,
    align?: CanvasTextAlign
  ): void;

  /**
   * Many labels at one size, in one `save`/`scale` pair.
   *
   * Snakes & Ladders numbers a hundred squares every frame. Through `label`
   * that is six hundred canvas calls — save, translate, scale, font, fill,
   * restore, a hundred times — for a hundred short strings. Batched it is a
   * hundred `fillText`s and four calls of overhead, which is the difference
   * between a board that costs nothing to draw and one that shows up on a
   * phone as heat.
   */
  labels(
    ctx: CanvasRenderingContext2D,
    items: ReadonlyArray<{ at: Vec2; text: string }>,
    px: number,
    colour: string,
    align?: CanvasTextAlign
  ): void;

  /**
   * The die.
   *
   * `progress` is 0..1 through the tumble; at 1 it shows `value` and has
   * finished its settle bounce. Spec §8.6 puts this first for good reason —
   * it is the emotional centre of both games, and a number that snaps into
   * place is the difference between a board game and a form.
   */
  drawDie(
    ctx: CanvasRenderingContext2D,
    at: Vec2,
    value: number,
    progress: number,
    seed: number
  ): void;
}

const TAU = Math.PI * 2;

/** The die's outline: a square with rounded corners, via arcTo — not
 *  `ctx.roundRect`, which is missing from the browsers a year or two back. */
function dieFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const w = r * 2;
  const c = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.arcTo(x + w, y, x + w, y + w, c);
  ctx.arcTo(x + w, y + w, x, y + w, c);
  ctx.arcTo(x, y + w, x, y, c);
  ctx.arcTo(x, y, x + w, y, c);
  ctx.closePath();
}

function shapePath(
  ctx: CanvasRenderingContext2D,
  shape: TokenShape,
  x: number,
  y: number,
  r: number
) {
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.arc(x, y, r, 0, TAU);
      break;
    case "square":
      ctx.rect(x - r * 0.86, y - r * 0.86, r * 1.72, r * 1.72);
      break;
    case "diamond":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        // Flat-top, so it does not read as a slightly wrong circle next to one.
        const a = (i / 6) * TAU;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
  }
}

/**
 * A face value that scrambles while the die is in the air.
 *
 * Deterministic in `seed` and `progress` rather than random per frame: the
 * tumble has to look the same on a 60 Hz laptop and a 144 Hz monitor, and a
 * face picked per *frame* would flicker faster on the better screen. It also
 * slows down as it lands, which is most of what sells the settle.
 */
function tumbleFace(faces: number, progress: number, seed: number): number {
  const eased = 1 - (1 - progress) * (1 - progress);
  const ticks = Math.floor(eased * 14);
  return 1 + ((seed + ticks * 7) % faces);
}

export function createPainter(graph: BoardGraph): BoardPainter {
  let scale = 1;
  let ox = 0;
  let oy = 0;

  const span = graph.size + MARGIN * 2;

  return {
    get scale() {
      return scale;
    },

    layout(ctx, canvasW, canvasH) {
      scale = Math.min(canvasW, canvasH) / span;
      ox = (canvasW - graph.size * scale) / 2;
      oy = (canvasH - graph.size * scale) / 2;
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
    },

    at(cell) {
      return graph.cells[cell] ?? { x: 0, y: 0 };
    },

    cellAt(px, py) {
      const bx = (px - ox) / scale;
      const by = (py - oy) / scale;
      // Nearest cell within a token's radius, not "inside a rect": cells are
      // points here, and a finger is bigger than a cell on a phone. The
      // generous radius is why a tap near a token counts as a tap on it.
      let best: number | null = null;
      let bestD = 0.62 * 0.62;
      for (let i = 0; i < graph.cells.length; i++) {
        const c = graph.cells[i];
        const dx = c.x - bx;
        const dy = c.y - by;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    },

    stack(count) {
      if (count <= 1) return [{ x: 0, y: 0 }];
      if (count === 2) {
        return [
          { x: -0.16, y: 0 },
          { x: 0.16, y: 0 },
        ];
      }
      const out: Vec2[] = [];
      const r = 0.19;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU - Math.PI / 2;
        out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return out;
    },

    drawToken(ctx, view, seat, opts) {
      const off = opts?.offset ?? { x: 0, y: 0 };
      const x = view.x + off.x;
      // The hop is drawn as a rise, so `lift` has to subtract: board space runs
      // downward like the canvas it is drawn into.
      const y = view.y + off.y - view.lift;
      const colour = SEAT_COLOURS[seat % SEAT_COLOURS.length];
      const shape = SEAT_SHAPES[seat % SEAT_SHAPES.length];

      // A shadow on the cell, so a token in the air is legibly in the air
      // rather than merely drawn higher. Flat, cheap, and it shrinks with the
      // lift, which is the whole cue.
      if (view.lift > 0.01) {
        ctx.globalAlpha = 0.22 * (1 - view.lift);
        ctx.fillStyle = "#000000";
        shapePath(ctx, shape, view.x + off.x, view.y + off.y, TOKEN_RADIUS * 0.8);
        ctx.fill();
      }

      ctx.globalAlpha = opts?.dim ? 0.45 : 1;
      ctx.fillStyle = colour;
      shapePath(ctx, shape, x, y, TOKEN_RADIUS);
      ctx.fill();

      // A dark rim rather than a light one: these sit on a warm, near-white
      // board, and a white outline on a pale board is not an outline.
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = "rgba(18,21,28,0.55)";
      ctx.stroke();

      // The bead: a darker lower half and a glint up-left, which is what
      // turns a flat disc of colour into something with a surface. Two more
      // fills of the same path, no gradient, no allocation.
      ctx.save();
      shapePath(ctx, shape, x, y, TOKEN_RADIUS);
      ctx.clip();
      ctx.fillStyle = "rgba(18,21,28,0.22)";
      ctx.fillRect(x - TOKEN_RADIUS, y + TOKEN_RADIUS * 0.25, TOKEN_RADIUS * 2, TOKEN_RADIUS);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      shapePath(ctx, shape, x - TOKEN_RADIUS * 0.22, y - TOKEN_RADIUS * 0.26, TOKEN_RADIUS * 0.42);
      ctx.fill();

      if (view.flash > 0) {
        ctx.globalAlpha = Math.min(1, view.flash / 12);
        ctx.fillStyle = "#ffffff";
        shapePath(ctx, shape, x, y, TOKEN_RADIUS);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    },

    drawHighlight(ctx, cell, t) {
      const p = graph.cells[cell];
      if (!p) return;
      // A slow breathe. Something on screen must always be moving (§8.6), and
      // this is the one thing that is moving while the game waits for a tap.
      const pulse = 0.5 + 0.5 * Math.sin(t / 9);
      ctx.globalAlpha = 0.35 + pulse * 0.4;
      ctx.strokeStyle = "#7C6BF5";
      ctx.lineWidth = 0.07 + pulse * 0.03;
      ctx.beginPath();
      ctx.arc(p.x, p.y, TOKEN_RADIUS + 0.12 + pulse * 0.05, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },

    label(ctx, at, text, px, colour, align = "center") {
      this.labels(ctx, [{ at, text }], px, colour, align);
    },

    labels(ctx, items, px, colour, align = "center") {
      if (items.length === 0) return;
      ctx.save();
      // Board space is undone once, so a board point (x, y) is at (x * scale,
      // y * scale) inside this pass. Everything drawn here is in real pixels.
      ctx.scale(1 / scale, 1 / scale);
      ctx.font = gameFont(px);
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillStyle = colour;
      for (const item of items) {
        ctx.fillText(item.text, item.at.x * scale, item.at.y * scale);
      }
      ctx.restore();
    },

    drawDie(ctx, at, value, progress, seed) {
      const settled = progress >= 1;
      const face = settled ? value : tumbleFace(6, progress, seed);

      // The settle: one overshoot in the last fifth of the tumble. Without it
      // the die stops dead, which is the single tell that a dice roll was a
      // number assignment with a delay on it.
      const bounce =
        progress > 0.8 && progress < 1
          ? Math.sin((progress - 0.8) * 5 * Math.PI) * 0.09
          : 0;
      const s = 1 + bounce;
      const r = 0.62 * s;

      ctx.save();
      ctx.translate(at.x, at.y);
      // Spins down to square rather than stopping at an angle.
      ctx.rotate(settled ? 0 : (1 - progress) * 1.7);

      // A cast die rather than a white square: rounded, a lit top edge, a
      // shaded bottom edge, and a soft shadow under it on the board.
      ctx.fillStyle = "rgba(18,21,28,0.18)";
      dieFace(ctx, -r + 0.05, -r + 0.09, r);
      ctx.fill();
      ctx.fillStyle = "#F5F7FA";
      dieFace(ctx, -r, -r, r);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(-r, -r, r * 2, r * 0.18);
      ctx.fillStyle = "rgba(18,21,28,0.13)";
      ctx.fillRect(-r, r * 0.7, r * 2, r * 0.3);
      ctx.restore();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = "rgba(18,21,28,0.35)";
      ctx.stroke();

      // Pips, from the standard layout. The centre pip is on for odd faces and
      // the corners come in pairs, which is the whole table in two lines.
      const d = r * 0.46;
      const pips: Vec2[] = [];
      if (face % 2 === 1) pips.push({ x: 0, y: 0 });
      if (face >= 2) pips.push({ x: -d, y: -d }, { x: d, y: d });
      if (face >= 4) pips.push({ x: -d, y: d }, { x: d, y: -d });
      if (face === 6) pips.push({ x: -d, y: 0 }, { x: d, y: 0 });

      ctx.fillStyle = "#12151C";
      for (const p of pips) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.15, 0, TAU);
        ctx.fill();
      }

      ctx.restore();
    },
  };
}
