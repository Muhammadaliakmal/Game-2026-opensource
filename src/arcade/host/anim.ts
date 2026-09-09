import type { MoveEvent } from "./rules";

/**
 * Where a token is *drawn*, which is not where the rules say it is.
 *
 * ── The animator is the only thing that knows a token's position ─────────
 *
 * `applyMove` moves a token from cell 3 to cell 9 instantly, because that is
 * what a rule is. If the renderer read the rules state it would draw the token
 * arriving before the dice had finished settling, and the six cells in between
 * would never be seen. So the rules produce events, this consumes them, and
 * the renderer draws from here and from nowhere else. `turn.ts` waits in its
 * `animating` phase until `busy` goes false.
 *
 * ── Hops, not slides ─────────────────────────────────────────────────────
 *
 * Spec §8.6, and it is the difference between a board game and a diagram. A
 * token that eases smoothly from cell 3 to cell 9 reads as a bug — as though
 * the piece were being dragged. Six separate hops of ~100 ms, each with a
 * lift and a tick that rises in pitch, reads as counting, which is what the
 * player is doing in their head anyway. It also makes the roll legible: you
 * can hear that it was a six.
 *
 * ── Sound comes out as cues, not as calls ────────────────────────────────
 *
 * This file plays nothing. It appends to a cue list the game drains and turns
 * into `sfx` calls. One reason only: a module that called into WebAudio could
 * not be tested under `node:test`, and the hop chain — which is all timing —
 * is exactly the thing worth pinning. Same discipline as `applyMove` returning
 * events instead of drawing.
 *
 * ── Reduced motion ───────────────────────────────────────────────────────
 *
 * CLAUDE.md fixes the rule and this file follows it rather than inventing a
 * second one: hit-stop and shake move the frame, so they are dropped; the hop
 * is local to the piece you are watching, so it is kept and shortened. A board
 * where nothing moves at all would not be an accessible board game, it would
 * be a spreadsheet.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** One cell-to-cell hop. ~100 ms, which is the spec's 90 ms rounded to steps. */
export const HOP_STEPS = 6;

/** A snake or a ladder: one long travel rather than a chain of hops. */
export const JUMP_STEPS = 30;

/** A captured token arcing back to its base. */
export const CAPTURE_STEPS = 30;

/**
 * Hit-stop on a capture. ~70 ms.
 *
 * Freezes the animator *and* the turn machine — the game skips stepping both
 * while this is non-zero. That is the whole effect: not a slow-motion, a stop.
 */
export const HITSTOP_STEPS = 4;

/** How long the white flash on a captured token lasts. */
export const FLASH_STEPS = 12;

/** Peak hop height, in cell widths. */
export const HOP_LIFT = 0.45;

/** A ladder lifts higher than a hop; a snake drops with none. */
export const LADDER_LIFT = 1.1;

/** Screen shake on a capture, in cell widths. Dropped under reduced motion. */
export const SHAKE = 0.28;

export interface TokenView {
  /** Board-space position, interpolated. */
  x: number;
  y: number;
  /** 0 at rest, up to `HOP_LIFT` mid-hop. Drawn as a vertical offset. */
  lift: number;
  /** The cell the token is on, or is travelling to. */
  cell: number;
  /** Counts down after a capture. Drives the white flash. */
  flash: number;
}

export interface Cue {
  readonly kind: string;
  /** Pitch shift for `sfx`, so a six-cell move climbs rather than buzzes. */
  readonly semitones?: number;
}

interface Job {
  tokenId: number;
  /**
   * A snapshot, never a live `TokenView`.
   *
   * Taking the view object itself would alias the thing being written on the
   * next line — the token would chase its own start point and creep instead of
   * travelling. Cheap mistake, invisible until something animates from where
   * it already is.
   */
  from: Vec2;
  to: Vec2;
  cell: number;
  span: number;
  left: number;
  lift: number;
  /** Stated, not inferred from `lift`: a ladder gathers, a snake does not. */
  ease: "in" | "out";
  cue?: Cue;
  /** A capture lands with a flash and a hit-stop; a hop does not. */
  impact: boolean;
}

export interface AnimatorOptions {
  /** Board-space position of a cell. Supplied by the game's board graph. */
  positionOf(cell: number): Vec2;
  /**
   * Read live rather than passed once — someone turning the setting on
   * mid-match should not have to restart. Defaults to false so tests are pure
   * and never touch `matchMedia`.
   */
  reduced?: () => boolean;
}

export interface Animator {
  /** True while anything is in flight. `turn.ts` waits on this going false. */
  readonly busy: boolean;
  /** Steps of freeze left. The game steps nothing while this is above zero. */
  readonly hitstop: number;
  /** Board-space shake offset, already zero under reduced motion. */
  readonly shake: Vec2;

  /** Put a token on a cell with no animation. Match start, and resync. */
  place(tokenId: number, cell: number): void;
  /** Queue the events from one move. Unknown event kinds are ignored. */
  play(events: readonly MoveEvent[]): void;
  /** One fixed step. */
  step(): void;
  /** Where to draw a token, or null if it has never been placed. */
  view(tokenId: number): TokenView | null;
  /** Take the sounds owed since the last call. */
  drainCues(): Cue[];
  /** Drop everything in flight and stop. For a restart. */
  clear(): void;
}

/** Fast in, slow out. The shape a thrown piece lands with. */
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

/** Slow in, fast out. A ladder gathers itself before it lifts. */
const easeInQuad = (t: number) => t * t;

export function createAnimator(opts: AnimatorOptions): Animator {
  const { positionOf } = opts;
  const reduced = opts.reduced ?? (() => false);

  const views = new Map<number, TokenView>();
  let queue: Job[] = [];
  let current: Job | null = null;
  let cues: Cue[] = [];
  let hitstop = 0;
  const shake: Vec2 = { x: 0, y: 0 };
  let shakeLeft = 0;

  const viewOf = (tokenId: number, cell: number): TokenView => {
    let v = views.get(tokenId);
    if (!v) {
      const p = positionOf(cell);
      v = { x: p.x, y: p.y, lift: 0, cell, flash: 0 };
      views.set(tokenId, v);
    }
    return v;
  };

  /**
   * Span for a job, halved under reduced motion.
   *
   * Halved rather than zeroed: an instant teleport is not less motion, it is
   * less *information* — the player loses the count of cells the hop is there
   * to show. One step is the floor, because a zero-span job would divide by
   * zero on the very next line.
   */
  const span = (steps: number) => (reduced() ? Math.max(1, steps >> 1) : steps);

  const push = (job: Job) => {
    queue.push(job);
  };

  const start = (job: Job) => {
    current = job;
    const v = viewOf(job.tokenId, job.cell);
    v.cell = job.cell;
  };

  const finish = (job: Job) => {
    const v = viewOf(job.tokenId, job.cell);
    v.x = job.to.x;
    v.y = job.to.y;
    v.lift = 0;
    v.cell = job.cell;
    if (job.cue) cues.push(job.cue);
    if (job.impact) {
      v.flash = FLASH_STEPS;
      if (!reduced()) {
        hitstop = HITSTOP_STEPS;
        shakeLeft = HITSTOP_STEPS * 3;
      }
    }
    current = null;
  };

  return {
    get busy() {
      return current !== null || queue.length > 0;
    },
    get hitstop() {
      return hitstop;
    },
    get shake() {
      return shake;
    },

    place(tokenId, cell) {
      const p = positionOf(cell);
      views.set(tokenId, { x: p.x, y: p.y, lift: 0, cell, flash: 0 });
    },

    play(events) {
      for (const e of events) {
        const tokenId = e.tokenId;
        if (tokenId === undefined) continue;

        if (e.path && e.path.length) {
          // `path` is the cells *entered*, not including the one departed
          // from, so the walk starts wherever the token already is. Including
          // the origin would make the first hop a jump from a cell to itself,
          // which reads as a stutter before the move.
          const existing = views.get(tokenId);
          let prev = existing ? existing.cell : e.from ?? e.path[0];
          // A hop per cell, each one a job. The pitch climbs across the run,
          // capped so a long home lane does not end up shrill.
          for (let i = 0; i < e.path.length; i++) {
            const cell = e.path[i];
            push({
              tokenId,
              from: positionOf(prev),
              to: positionOf(cell),
              cell,
              span: span(HOP_STEPS),
              left: span(HOP_STEPS),
              lift: HOP_LIFT,
              ease: "out",
              cue: { kind: "hop", semitones: Math.min(i, 11) },
              impact: false,
            });
            prev = cell;
          }
          continue;
        }

        if (e.kind === "jump" && e.from !== undefined && e.to !== undefined) {
          // A ladder lifts and a snake drops, and they must not share a curve:
          // the same motion played twice is the reason most Snakes & Ladders
          // implementations feel like one event with two colours.
          const up = e.to > e.from;
          push({
            tokenId,
            from: positionOf(e.from),
            to: positionOf(e.to),
            cell: e.to,
            span: span(JUMP_STEPS),
            left: span(JUMP_STEPS),
            lift: up ? LADDER_LIFT : 0,
            // A ladder gathers itself and accelerates away; a snake is already
            // falling by the time you have registered it.
            ease: up ? "in" : "out",
            cue: { kind: up ? "ladder" : "snake" },
            impact: false,
          });
          continue;
        }

        if (e.kind === "capture" && e.to !== undefined) {
          const at = views.get(tokenId);
          push({
            tokenId,
            from: at ? { x: at.x, y: at.y } : positionOf(e.from ?? e.to),
            to: positionOf(e.to),
            cell: e.to,
            span: span(CAPTURE_STEPS),
            left: span(CAPTURE_STEPS),
            lift: LADDER_LIFT,
            ease: "out",
            cue: { kind: "capture" },
            impact: true,
          });
        }
      }
    },

    step() {
      // Hit-stop first and alone: the point of it is that nothing else
      // happens. Decayed here rather than by the game so a game that forgets
      // to check it still recovers.
      if (hitstop > 0) {
        hitstop--;
        return;
      }

      for (const v of views.values()) if (v.flash > 0) v.flash--;

      if (shakeLeft > 0) {
        shakeLeft--;
        // Alternating rather than random, so it reads as a hit and not as
        // noise, and decaying so it settles instead of stopping dead.
        const amp = (SHAKE * shakeLeft) / (HITSTOP_STEPS * 3);
        shake.x = shakeLeft % 2 === 0 ? amp : -amp;
        shake.y = 0;
      } else {
        shake.x = 0;
        shake.y = 0;
      }

      if (!current) {
        const next = queue.shift();
        if (!next) return;
        start(next);
      }
      const job = current;
      if (!job) return;

      job.left--;
      if (job.left <= 0) {
        finish(job);
        return;
      }

      const t = 1 - job.left / job.span;
      const eased = job.ease === "in" ? easeInQuad(t) : easeOutQuad(t);
      const v = viewOf(job.tokenId, job.cell);
      v.x = job.from.x + (job.to.x - job.from.x) * eased;
      v.y = job.from.y + (job.to.y - job.from.y) * eased;
      // A parabola over the travel, so the piece leaves and lands flat.
      v.lift = job.lift * 4 * t * (1 - t);
    },

    view(tokenId) {
      return views.get(tokenId) ?? null;
    },

    drainCues() {
      const out = cues;
      cues = [];
      return out;
    },

    clear() {
      queue = [];
      current = null;
      cues = [];
      hitstop = 0;
      shakeLeft = 0;
      shake.x = 0;
      shake.y = 0;
      for (const v of views.values()) {
        v.lift = 0;
        v.flash = 0;
      }
    },
  };
}
