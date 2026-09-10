import type { TokenView, Vec2 } from "@/arcade/host/anim";
import type { BoardPainter } from "@/arcade/host/board";
import { SEAT_COLOURS } from "@/arcade/host/board";
import type { Seat } from "@/arcade/host/rules";
import type { Phase } from "@/arcade/host/turn";
import {
  BOARD_SIZE,
  CARD_SQUARES,
  DIE_AT,
  GRID,
  HAND_LIMIT,
  LADDERS,
  NAMES_Y,
  SNAKES,
  SQUARES,
  START_AT,
  handCell,
  squareAt,
} from "./board";
import type { SnakesMove, SnakesState } from "./rules";
import { CARDS, type CardKind } from "./tuning";

/**
 * The hundred squares, the things on them, and the tray.
 *
 * ── What the host draws, and what is drawn here ──────────────────────────
 *
 * The same split Ludo's renderer states: `host/board.ts` fits the board to the
 * canvas, inverts that for a tap, stacks tokens on a shared square, and draws
 * one token, one die and one label. Everything below is this board's own ink —
 * the fold, the snakes, the ladders, the numbers, the cards — because a
 * painter with `drawSnake` on it would be a shared module both games have to
 * edit, and Ludo has no snakes.
 *
 * ── A hundred numbers is the one thing here with a cost ──────────────────
 *
 * Every other mark on this board is a handful of calls. The numbers are a
 * hundred strings redrawn sixty times a second, and drawn one at a time
 * through a save/scale pair each they would be six hundred canvas calls a
 * frame on their own. `painter.labels` exists for exactly this: one pass, one
 * font, a hundred `fillText`s.
 *
 * ── The palette is stated here rather than shared with Ludo ──────────────
 *
 * Both boards happen to be printed on the same warm paper today. They are two
 * boards, though, and the moment one of them wants green felt a shared
 * constant becomes a shared argument. Seat colours *are* shared, and live in
 * the host, because those are the identity of the players rather than the
 * decoration of a board.
 */

const TAU = Math.PI * 2;

const BOARD = "#F3F1EA";
const INK = "#12151C";
const LINE = "rgba(18,21,28,0.28)";
const BACKDROP = "#0B0F18";
/** The two square tints of the checker. Low contrast: numbers sit on them. */
const LIGHT = "#FFFFFF";
const DARK = "#E7E3D6";
/** The last square, which is the only one worth a colour of its own. */
const GOAL = "rgba(242,178,51,0.55)";
const ACCENT = "#7C6BF5";

/** Ladders, drawn in wood; snakes in three greens so ten are tellable apart. */
const LADDER_INK = "#B07A3C";
const SNAKE_INKS = ["#3E8E57", "#57736A", "#7A5C8E"] as const;

export interface SnakesView {
  seats: readonly Seat[];
  state: SnakesState;
  phase: Phase;
  activeSeatId: number;
  localSeatId: number;
  die: number;
  /** 0..1 through the tumble; 1 once it has landed. */
  dieProgress: number;
  /** Only ever the local player's, and only while it is their move. */
  moves: readonly SnakesMove[];
  /**
   * The move each hand slot would play, or null for a card that changes
   * nothing this turn. Indexed by slot, so a card the rules did not offer is
   * drawn dim in the place it is actually sitting.
   */
  slotMoves: readonly (SnakesMove | null)[];
  clock: { left: number; span: number } | null;
  thinking: boolean;
  shake: Vec2;
  tick: number;
  /**
   * A snake an Anchor just refused, and how many steps the mark stays up.
   *
   * The one piece of feedback on this board that is a thing *not* happening,
   * so it is the one that needs saying out loud — a card whose whole effect is
   * an absence is a card the player suspects did nothing.
   */
  held: { square: number; left: number } | null;
  tokenView(tokenId: number): TokenView | null;
}

export interface Renderer {
  draw(ctx: CanvasRenderingContext2D, view: SnakesView, w: number, h: number): void;
  destroy(): void;
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

/** A unit vector from `a` to `b`, and the length it was derived from. */
function along(a: Vec2, b: Vec2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len, len };
}

/**
 * A ladder: two rails and the rungs between them.
 *
 * Rungs are spaced along the actual length rather than counted, so a ladder
 * from 28 to 84 does not get the same eight rungs as one from 4 to 14 — the
 * long ones are the ones worth wanting, and a ladder that reads as longer is
 * the cheapest way to say so.
 */
function ladder(ctx: CanvasRenderingContext2D, foot: Vec2, top: Vec2) {
  const d = along(foot, top);
  const nx = -d.y * 0.17;
  const ny = d.x * 0.17;

  ctx.strokeStyle = LADDER_INK;
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(foot.x + nx, foot.y + ny);
  ctx.lineTo(top.x + nx, top.y + ny);
  ctx.moveTo(foot.x - nx, foot.y - ny);
  ctx.lineTo(top.x - nx, top.y - ny);
  ctx.stroke();

  ctx.lineWidth = 0.06;
  ctx.beginPath();
  const rungs = Math.max(2, Math.round(d.len / 0.75));
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs;
    const x = foot.x + (top.x - foot.x) * t;
    const y = foot.y + (top.y - foot.y) * t;
    ctx.moveTo(x + nx, y + ny);
    ctx.lineTo(x - nx, y - ny);
  }
  ctx.stroke();
}

/**
 * A snake: one curve, thick at the head and thin at the tail.
 *
 * Curved rather than straight, and bowed to one side by a fixed fraction of
 * its own length, for a reason that is not decoration: two snakes whose ends
 * are close together are two straight lines nobody can tell apart, and this
 * board has 47 and 49 starting one square from each other and finishing
 * fifteen apart.
 *
 * The taper is drawn as three strokes of falling width rather than as a
 * filled outline. A `lineWidth` cannot vary along a path in Canvas 2D, and
 * the outline that would is fifty points of trigonometry for a shape that is
 * two centimetres tall on a phone.
 */
function snake(ctx: CanvasRenderingContext2D, head: Vec2, tail: Vec2, ink: string) {
  const d = along(head, tail);
  const bow = d.len * 0.18;
  const mid = { x: (head.x + tail.x) / 2, y: (head.y + tail.y) / 2 };
  const ctrl = { x: mid.x - d.y * bow, y: mid.y + d.x * bow };

  ctx.strokeStyle = ink;
  ctx.lineCap = "round";
  for (const [width, from] of [
    [0.26, 0],
    [0.18, 0.45],
    [0.1, 0.75],
  ] as const) {
    ctx.lineWidth = width;
    ctx.beginPath();
    // Each segment starts further along the same curve, so the widths stack
    // into a taper instead of three parallel lines.
    const start = {
      x: quad(head.x, ctrl.x, tail.x, from),
      y: quad(head.y, ctrl.y, tail.y, from),
    };
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i <= 10; i++) {
      const t = from + (1 - from) * (i / 10);
      ctx.lineTo(quad(head.x, ctrl.x, tail.x, t), quad(head.y, ctrl.y, tail.y, t));
    }
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 0.24, 0, TAU);
  ctx.fill();
  // Two eyes, which is the whole of "this end is the end that bites you".
  ctx.fillStyle = "#F5F7FA";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(head.x + d.y * 0.1 * s, head.y - d.x * 0.1 * s, 0.06, 0, TAU);
    ctx.fill();
  }
}

const quad = (a: number, b: number, c: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

/** A card in the tray. Half the size of the board's own squares, and readable. */
const CARD_W = 1.0;
const CARD_H = 1.3;

export function createRenderer(painter: BoardPainter): Renderer {
  // The board's furniture never moves, so the positions are resolved once.
  const numbers = Array.from({ length: SQUARES }, (_, i) => ({
    at: squareAt(i + 1),
    text: String(i + 1),
  }));
  const ladders = LADDERS.map(([foot, top]) => [squareAt(foot), squareAt(top)] as const);
  const snakes = SNAKES.map(
    ([head, tail], i) =>
      [squareAt(head), squareAt(tail), SNAKE_INKS[i % SNAKE_INKS.length]] as const
  );

  return {
    draw(ctx, view, w, h) {
      ctx.save();
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, w, h);

      painter.layout(ctx, w, h);
      ctx.translate(view.shake.x, view.shake.y);

      const scale = painter.scale;
      const px = Math.max(8, Math.min(15, scale * 0.3));
      const { state } = view;

      ctx.fillStyle = BOARD;
      roundRect(ctx, 0, 0, BOARD_SIZE, BOARD_SIZE, 0.5);
      ctx.fill();

      // ── The hundred squares ──
      // The checker is by square number rather than by column, so it follows
      // the fold: the alternation never breaks at the end of a row, which is
      // what makes the boustrophedon legible without an arrow drawn on it.
      for (let n = 1; n <= SQUARES; n++) {
        const p = squareAt(n);
        ctx.fillStyle = n === SQUARES ? GOAL : n % 2 === 0 ? DARK : LIGHT;
        ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
      }

      // One path for every rule on the grid, rather than a stroke per square.
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        ctx.moveTo(GRID.x + i, GRID.y);
        ctx.lineTo(GRID.x + i, GRID.y + GRID.h);
        ctx.moveTo(GRID.x, GRID.y + i);
        ctx.lineTo(GRID.x + GRID.w, GRID.y + i);
      }
      ctx.stroke();

      // A card square, marked with the thing it gives you rather than a dot.
      ctx.fillStyle = "rgba(124,107,245,0.22)";
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 0.05;
      for (const n of CARD_SQUARES) {
        const p = squareAt(n);
        roundRect(ctx, p.x - 0.3, p.y - 0.38, 0.6, 0.76, 0.14);
        ctx.fill();
        ctx.stroke();
      }

      painter.labels(ctx, numbers, px * 0.85, "rgba(18,21,28,0.45)");

      // ── What the squares do to you ──
      for (const [foot, top] of ladders) ladder(ctx, foot, top);
      for (const [head, tail, ink] of snakes) snake(ctx, head, tail, ink);

      // ── The start pad ──
      ctx.fillStyle = "rgba(18,21,28,0.08)";
      roundRect(ctx, START_AT.x - 0.75, START_AT.y - 0.6, 1.5, 1.2, 0.25);
      ctx.fill();
      painter.label(
        ctx,
        { x: START_AT.x, y: START_AT.y - 0.85 },
        "START",
        px * 0.8,
        "rgba(18,21,28,0.5)"
      );

      // ── Where a tap would take you ──
      // Only the local player's, and only on their turn: drawing a bot's
      // options is showing its hand a second before it plays.
      for (const move of view.moves) {
        const cell = move.to;
        painter.drawHighlight(ctx, cell, view.tick);
        if (move.card) {
          // The card's own mark beside its ring, because four rings on four
          // squares with nothing to tell them apart is four questions.
          const p = squareAt(cell);
          painter.label(
            ctx,
            { x: p.x, y: p.y - 0.62 },
            CARDS[move.card].glyph,
            px * 0.95,
            ACCENT
          );
        }
      }

      // ── The snake that let go ──
      if (view.held && view.held.left > 0) {
        const p = squareAt(view.held.square);
        ctx.strokeStyle = "#F2B233";
        ctx.lineWidth = 0.09;
        ctx.globalAlpha = Math.min(1, view.held.left / 20);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.5, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        painter.label(
          ctx,
          { x: p.x, y: p.y - 0.75 },
          CARDS.anchor.glyph,
          px,
          "#F2B233"
        );
      }

      // ── Tokens ──
      // Grouped by the square each is drawn on, so four seats on square 1 at
      // the start of a match are four pieces rather than one.
      const byCell = new Map<number, number[]>();
      for (let seat = 0; seat < view.seats.length; seat++) {
        const v = view.tokenView(seat);
        if (!v) continue;
        const list = byCell.get(v.cell);
        if (list) list.push(seat);
        else byCell.set(v.cell, [seat]);
      }
      for (const [, list] of byCell) {
        const offsets = painter.stack(list.length);
        for (let i = 0; i < list.length; i++) {
          const v = view.tokenView(list[i]);
          if (!v) continue;
          painter.drawToken(ctx, v, list[i], { offset: offsets[i] });
        }
      }

      // ── The hand ──
      // Always three slots, empty ones included. A tray that grows and shrinks
      // moves the card you were about to press.
      const local = view.state.hands[view.localSeatId] ?? [];
      for (let slot = 0; slot < HAND_LIMIT; slot++) {
        const at = painter.at(handCell(slot));
        const kind = local[slot] as CardKind | undefined;
        const move = view.slotMoves[slot] ?? null;
        drawCard(ctx, painter, at, kind, move !== null, px, view.tick);
      }

      // ── The dice ──
      if (view.phase !== "matchOver") {
        painter.drawDie(ctx, DIE_AT, view.die, view.dieProgress, view.activeSeatId);

        // The seat holding them, named under them: unlike Ludo there is no
        // yard to put the dice in front of, so whose turn it is has to be
        // written next to the thing they are about to press.
        const holder = view.seats[view.activeSeatId];
        if (holder) {
          painter.label(
            ctx,
            { x: DIE_AT.x, y: DIE_AT.y + 1.05 },
            holder.name,
            px * 0.85,
            SEAT_COLOURS[view.activeSeatId % SEAT_COLOURS.length]
          );
        }

        // The turn clock as a ring that empties. A number counting down says
        // "you are being timed"; a ring says "there is still time".
        if (view.clock && view.clock.span > 0) {
          const left = view.clock.left / view.clock.span;
          ctx.strokeStyle = left < 0.25 ? "#E8484E" : "rgba(245,247,250,0.5)";
          ctx.lineWidth = 0.12;
          ctx.beginPath();
          ctx.arc(DIE_AT.x, DIE_AT.y, 0.95, -Math.PI / 2, -Math.PI / 2 + TAU * left);
          ctx.stroke();
        }

        if (view.thinking) {
          const lit = Math.floor(view.tick / 12) % 3;
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i <= lit ? "#F5F7FA" : "rgba(245,247,250,0.3)";
            ctx.beginPath();
            ctx.arc(DIE_AT.x - 0.34 + i * 0.34, DIE_AT.y - 1.1, 0.1, 0, TAU);
            ctx.fill();
          }
        }
      }

      // ── Who is where ──
      // The seat strip is the only place a player can see the other three
      // without counting squares, and the number beside a name is the whole
      // of the race.
      const slotW = GRID.w / Math.max(1, view.seats.length);
      for (let s = 0; s < view.seats.length; s++) {
        const x = GRID.x + (s + 0.5) * slotW;
        const active = s === view.activeSeatId;
        const colour = SEAT_COLOURS[s % SEAT_COLOURS.length];

        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x - 1.05, NAMES_Y - 0.05, 0.17, 0, TAU);
        ctx.fill();

        const place = state.done.indexOf(s);
        const name = view.seats[s].name;
        painter.label(
          ctx,
          { x: x - 0.7, y: NAMES_Y - 0.05 },
          place >= 0 ? `${name} · ${place + 1}${ordinal(place + 1)}` : name,
          px * 0.95,
          active ? "#F5F7FA" : "rgba(245,247,250,0.55)",
          "left"
        );
        painter.label(
          ctx,
          { x: x - 0.7, y: NAMES_Y + 0.5 },
          `${state.at[s]}`,
          px * 0.85,
          active ? colour : "rgba(245,247,250,0.4)",
          "left"
        );

        // Cards held, as pips. A count of somebody else's hand is the only
        // thing about their position that is not already on the board.
        const held = state.hands[s]?.length ?? 0;
        ctx.fillStyle = active ? ACCENT : "rgba(124,107,245,0.5)";
        for (let i = 0; i < held; i++) {
          ctx.beginPath();
          ctx.arc(x + 0.55 + i * 0.24, NAMES_Y + 0.44, 0.09, 0, TAU);
          ctx.fill();
        }
      }

      ctx.restore();
    },

    destroy() {
      // Nothing retained: no images, no offscreen canvases, no audio nodes.
    },
  };
}

/**
 * One card slot.
 *
 * An empty slot is drawn as an outline rather than as nothing, and a card that
 * cannot be played this turn is drawn dim rather than hidden — both for the
 * same reason. The hand is a row of three fixed places, and a card that
 * vanishes on the turns it is useless is a card whose position moves under a
 * finger that had already decided where to press.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  painter: BoardPainter,
  at: Vec2,
  kind: CardKind | undefined,
  playable: boolean,
  px: number,
  tick: number
) {
  const x = at.x - CARD_W / 2;
  const y = at.y - CARD_H / 2;

  if (!kind) {
    ctx.strokeStyle = "rgba(245,247,250,0.18)";
    ctx.lineWidth = 0.04;
    roundRect(ctx, x, y, CARD_W, CARD_H, 0.16);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = playable ? "#F5F7FA" : "rgba(245,247,250,0.32)";
  roundRect(ctx, x, y, CARD_W, CARD_H, 0.16);
  ctx.fill();

  if (playable) {
    // The same breathe as a legal destination on the board, so the two things
    // that can be pressed this turn are moving in the same rhythm.
    const pulse = 0.5 + 0.5 * Math.sin(tick / 9);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 0.05 + pulse * 0.03;
    roundRect(ctx, x, y, CARD_W, CARD_H, 0.16);
    ctx.stroke();
  }

  const spec = CARDS[kind];
  const ink = playable ? INK : "rgba(18,21,28,0.55)";
  painter.label(ctx, { x: at.x, y: at.y - 0.18 }, spec.glyph, px * 1.5, ink);
  painter.label(ctx, { x: at.x, y: at.y + 0.42 }, spec.name, px * 0.7, ink);
}

const ordinal = (n: number) =>
  n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
