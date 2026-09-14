import type { TokenView, Vec2 } from "@/arcade/host/anim";
import type { BoardPainter } from "@/arcade/host/board";
import { SEAT_COLOURS } from "@/arcade/host/board";
import type { Phase } from "@/arcade/host/turn";
import type { Seat } from "@/arcade/host/rules";
import {
  BOARD_SIZE,
  HOME,
  HOME_LANE,
  LOOP_CELLS,
  LUDO_GRAPH,
  MAX_TOKENS,
  SAFE,
  START,
  homeCell,
  laneCell,
  rotatePoint,
  yardCell,
} from "./board";
import type { LudoMove, LudoState } from "./rules";
import { grainOverlay, paperTexture, woodTexture } from "@/arcade/host/texture";

/**
 * Ludo's own furniture.
 *
 * ── What the host draws, and what is drawn here ──────────────────────────
 *
 * `host/board.ts` owns everything two board games would otherwise implement
 * twice: fitting the board to the canvas, the inverse of that for a tap, the
 * stacking rule, one token and one die. It does not own the *picture* — a
 * cross with four yards and a centre is not a ten-by-ten grid with snakes on
 * it, and a shared painter with `drawYard` on it would be a module both games
 * have to edit. So the transform is the host's and the ink is the game's.
 *
 * ── Everything is in board units ─────────────────────────────────────────
 *
 * Inside `painter.layout` the canvas is a 15-unit square, so a cell is 1 and a
 * line is 0.05. The only exception is text, which is set in real pixels by
 * momentarily undoing the scale — a font size of 0.4 board units is a font
 * size no engine hints properly, and names on a phone are the first thing to
 * turn to mush. That undoing is `painter.label`, which moved into the host
 * when the second board game needed it: it is transform arithmetic, not ink.
 */

const TAU = Math.PI * 2;

/** The felt the board is printed on. */
const BOARD = "#F3F1EA";

/** The frame, the sheet and the grain. Module tiles, painted once. */
const WOOD = woodTexture(31);
const PAPER = paperTexture(BOARD, 32);
const GRAIN = grainOverlay(33, 0.09);
const TRACK = "#FFFFFF";
const INK = "#12151C";
const LINE = "rgba(18,21,28,0.35)";
const BACKDROP = "#0B0F18";

/** A seat's colour, thinned for large areas. A yard at full strength shouts. */
const wash = (seat: number, alpha: number) => {
  const hex = SEAT_COLOURS[seat % SEAT_COLOURS.length];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/**
 * Everything the picture needs, and nothing the picture can change.
 *
 * A view rather than the turn machine itself: the renderer that holds the
 * machine is the renderer that can be tempted to call `chooseMove` from inside
 * a draw, and `index.ts` is where that decision belongs.
 */
export interface LudoView {
  seats: readonly Seat[];
  state: LudoState;
  phase: Phase;
  activeSeatId: number;
  /** The seat the person holding the phone is playing. */
  localSeatId: number;
  /** The face to show. Held after the roll so the number stays up. */
  die: number;
  /** 0..1 through the tumble; 1 once it has landed. */
  dieProgress: number;
  /** Only ever the local player's, and only while it is their move. */
  moves: readonly LudoMove[];
  /** Board cells a tap would move from, matching `moves` one for one. */
  moveCells: readonly number[];
  /** Steps left on the turn clock and what it started at, or null. */
  clock: { left: number; span: number } | null;
  thinking: boolean;
  shake: Vec2;
  /** Step counter, for anything that breathes. */
  tick: number;
  tokenView(tokenId: number): TokenView | null;
}

export interface Renderer {
  draw(ctx: CanvasRenderingContext2D, view: LudoView, w: number, h: number): void;
  destroy(): void;
}

/** The bounding square of a seat's yard, derived from its own slots. */
function yardRect(seat: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < MAX_TOKENS; i++) {
    const p = LUDO_GRAPH.cells[yardCell(seat, i)];
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  // The slots sit 1.5 units in from the block's edges on every side, which is
  // true by construction for seat 0 and therefore for the three rotations of
  // it. Derived rather than written down so a yard cannot drift from the
  // pieces standing in it.
  return { x: minX - 1.5, y: minY - 1.5, w: maxX - minX + 3, h: maxY - minY + 3 };
}

/** The four home triangles, seat 0's pointing in from the left. */
function homeTriangles(): Vec2[][] {
  let tri: Vec2[] = [
    { x: 6, y: 6 },
    { x: 6, y: 9 },
    { x: 7.5, y: 7.5 },
  ];
  const out: Vec2[][] = [];
  for (let seat = 0; seat < 4; seat++) {
    out.push(tri);
    tri = tri.map(rotatePoint);
  }
  return out;
}

/** Where the dice sit: in the middle of whoever is holding them. */
function diePos(seat: number): Vec2 {
  const r = yardRect(seat);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A five-pointed star, for the cells nobody can be taken on. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.44;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(painter: BoardPainter): Renderer {
  const triangles = homeTriangles();
  const yards = [0, 1, 2, 3].map(yardRect);

  return {
    draw(ctx, view, w, h) {
      ctx.save();
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, w, h);

      painter.layout(ctx, w, h);
      // The hit-stop shake, already zero under reduced motion. Applied to the
      // board rather than to the canvas so the backdrop stays put — a
      // background that moves with the board reads as the camera lurching.
      ctx.translate(view.shake.x, view.shake.y);

      const scale = painter.scale;
      const { state } = view;
      const tokens = state.settings.tokens;

      // ── The frame, and the board itself ──
      // A wooden frame under a printed sheet. The frame sits in the margin
      // the host leaves around the board, so nothing here moves.
      ctx.fillStyle = WOOD.fill(ctx, 3);
      roundRect(ctx, -0.42, -0.42, BOARD_SIZE + 0.84, BOARD_SIZE + 0.84, 0.7);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.06;
      ctx.stroke();
      ctx.fillStyle = PAPER.fill(ctx, 2.4);
      roundRect(ctx, 0, 0, BOARD_SIZE, BOARD_SIZE, 0.5);
      ctx.fill();

      // ── Yards ──
      for (let seat = 0; seat < view.seats.length; seat++) {
        const r = yards[seat];
        ctx.fillStyle = wash(seat, 0.9);
        roundRect(ctx, r.x, r.y, r.w, r.h, 0.6);
        ctx.fill();
        ctx.fillStyle = BOARD;
        roundRect(ctx, r.x + 0.8, r.y + 0.8, r.w - 1.6, r.h - 1.6, 0.45);
        ctx.fill();
      }

      // ── The track ──
      ctx.lineWidth = 0.045;
      ctx.strokeStyle = LINE;
      for (let i = 0; i < LOOP_CELLS.length; i++) {
        const [c, r] = LOOP_CELLS[i];
        // A seat's start square is painted in its colour: it is the one cell on
        // the shared loop that belongs to somebody, and the whole first move is
        // aimed at it.
        const owner = (START as readonly number[]).indexOf(i);
        ctx.fillStyle = owner >= 0 ? wash(owner, 0.55) : TRACK;
        ctx.fillRect(c, r, 1, 1);
        ctx.strokeRect(c, r, 1, 1);
      }

      // Safe cells, marked rather than tinted: colour is already carrying seat
      // identity here, and a ninth colour on the board would be a ninth thing
      // to learn.
      ctx.fillStyle = "rgba(18,21,28,0.16)";
      for (const cell of SAFE) {
        const p = LUDO_GRAPH.cells[cell];
        star(ctx, p.x, p.y, 0.34);
        ctx.fill();
      }

      // ── Home lanes ──
      for (let seat = 0; seat < view.seats.length; seat++) {
        for (let i = 0; i < HOME_LANE; i++) {
          const p = LUDO_GRAPH.cells[laneCell(seat, i)];
          ctx.fillStyle = wash(seat, 0.75);
          ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
          ctx.strokeStyle = LINE;
          ctx.strokeRect(p.x - 0.5, p.y - 0.5, 1, 1);
        }
      }

      // ── The centre ──
      for (let seat = 0; seat < 4; seat++) {
        const tri = triangles[seat];
        ctx.fillStyle =
          seat < view.seats.length ? wash(seat, 0.85) : "rgba(18,21,28,0.08)";
        ctx.beginPath();
        ctx.moveTo(tri[0].x, tri[0].y);
        ctx.lineTo(tri[1].x, tri[1].y);
        ctx.lineTo(tri[2].x, tri[2].y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = LINE;
      ctx.strokeRect(6, 6, 3, 3);

      // The grain over everything printed, before anything that stands on
      // it: cells, yards and lanes are opaque colour, and this is what makes
      // them one sheet rather than three kinds of paint.
      ctx.fillStyle = GRAIN.fill(ctx, 2);
      roundRect(ctx, 0, 0, BOARD_SIZE, BOARD_SIZE, 0.5);
      ctx.fill();

      // ── What can be tapped ──
      // Only ever the local player's own moves. Drawing the highlights on a
      // bot's turn would be showing its hand a second before it plays.
      for (const cell of view.moveCells) painter.drawHighlight(ctx, cell, view.tick);

      // ── Tokens ──
      // Grouped by the cell each is drawn on so a stack fans out instead of
      // hiding three pieces under one. Knowing there are three of yours on a
      // square is most of Ludo's tactics.
      const byCell = new Map<number, Array<{ seat: number; id: number }>>();
      for (let seat = 0; seat < view.seats.length; seat++) {
        for (let t = 0; t < tokens; t++) {
          const id = seat * MAX_TOKENS + t;
          const v = view.tokenView(id);
          if (!v) continue;
          const list = byCell.get(v.cell);
          if (list) list.push({ seat, id });
          else byCell.set(v.cell, [{ seat, id }]);
        }
      }
      for (const [, list] of byCell) {
        const offsets = painter.stack(list.length);
        for (let i = 0; i < list.length; i++) {
          const v = view.tokenView(list[i].id);
          if (!v) continue;
          painter.drawToken(ctx, v, list[i].seat, { offset: offsets[i] });
        }
      }

      // ── The dice, in the hands of whoever is holding them ──
      const seat = view.seats[view.activeSeatId];
      if (seat && view.phase !== "matchOver") {
        const at = diePos(view.activeSeatId);
        painter.drawDie(ctx, at, view.die, view.dieProgress, view.activeSeatId);

        // The turn clock, as a ring that empties. A number counting down says
        // "you are being timed"; a ring says "there is still time", which is
        // the same fact told the way round that keeps somebody playing.
        if (view.clock && view.clock.span > 0) {
          const left = view.clock.left / view.clock.span;
          ctx.strokeStyle = left < 0.25 ? "#E8484E" : "rgba(18,21,28,0.45)";
          ctx.lineWidth = 0.12;
          ctx.beginPath();
          ctx.arc(at.x, at.y, 1.0, -Math.PI / 2, -Math.PI / 2 + TAU * left);
          ctx.stroke();
        }

        if (view.thinking) {
          // Three dots that fill in turn: the seat is deliberating, and a seat
          // that goes quiet for a second with nothing moving reads as a hang.
          const lit = Math.floor(view.tick / 12) % 3;
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i <= lit ? INK : "rgba(18,21,28,0.25)";
            ctx.beginPath();
            ctx.arc(at.x - 0.36 + i * 0.36, at.y + 1.25, 0.11, 0, TAU);
            ctx.fill();
          }
        }
      }

      // ── Who is who ──
      const px = Math.max(9, Math.min(15, scale * 0.4));
      for (let s = 0; s < view.seats.length; s++) {
        const r = yards[s];
        const place = state.done.indexOf(s);
        const name = view.seats[s].name;
        const text =
          place >= 0 ? `${name} · ${place + 1}${ordinal(place + 1)}` : name;
        painter.label(
          ctx,
          { x: r.x + r.w / 2, y: r.y + 0.42 },
          text,
          px,
          s === view.activeSeatId ? INK : "rgba(18,21,28,0.55)"
        );
      }

      // A home token is off the board and inside the centre, where four of them
      // would sit on top of each other. Counted instead.
      for (let s = 0; s < view.seats.length; s++) {
        const home = state.progress[s].filter((p) => p >= HOME).length;
        if (home === 0) continue;
        const p = LUDO_GRAPH.cells[homeCell(s)];
        ctx.fillStyle = wash(s, 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.3, 0, TAU);
        ctx.fill();
        painter.label(ctx, { x: p.x, y: p.y }, String(home), px * 0.85, "#ffffff");
      }

      ctx.restore();
    },

    destroy() {
      // Nothing retained: no images, no offscreen canvases, no audio nodes.
      // The method exists because the contract has it and a renderer that
      // starts caching a gradient should have somewhere obvious to let it go.
    },
  };
}

const ordinal = (n: number) =>
  n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
