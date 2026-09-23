/**
 * The arena: rectangles, one that moves, and the lava under all of them.
 *
 * Rectangles and nothing else, because a particle against an axis-aligned
 * box is four comparisons and a push along the shallowest axis — the whole
 * of `collide` below. A sloped floor would buy a look and cost a solver.
 *
 * ── One-way platforms ────────────────────────────────────────────────────
 *
 * The thin platforms (one tile tall) catch you from above and let you
 * through from below, as in most platformers. They have to: the middle
 * platform rides up to 32 px under the bridge above it, and a robot is 80 px
 * tall, so as solid blocks the two would crush whoever was standing on the
 * lower one every five seconds. It also makes the high platforms reachable
 * by jumping up through them, which is what they are for.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Stops a particle falling onto it, never one rising through it. */
  oneWay?: boolean;
}

export interface MoverDef {
  /** Top-left at each end of the path; the platform eases between them. */
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly w: number;
  readonly h: number;
  /** Seconds for a full there-and-back. */
  readonly period: number;
}

/**
 * The beat. Idle, then a tell, then the surface rises to `peakY`, holds and
 * falls back. Anybody whose body is under the surface is out.
 */
export interface LavaDef {
  readonly restY: number;
  readonly peakY: number;
  /** Seconds into a round before the first tell. */
  readonly first: number;
  /** Seconds from one tell to the next. */
  readonly beat: number;
  readonly tell: number;
  readonly rise: number;
  readonly hold: number;
  readonly fall: number;
}

export interface Arena {
  readonly id: string;
  readonly name: string;
  readonly solids: readonly Rect[];
  readonly movers: readonly MoverDef[];
  readonly lava: LavaDef;
  /** Pelvis x of each fighter at the start of a round, and the ground under them. */
  readonly spawn: readonly [number, number];
  readonly spawnGround: number;
  /** Tile size in view px: the pack's 64 at this view's half scale. */
  readonly tile: number;
}

const TILE = 32;
/** A platform from the pack's `[col, row, w, h]`. */
const tiles = (c: number, r: number, w: number, h: number): Rect => ({
  x0: c * TILE,
  y0: r * TILE,
  x1: (c + w) * TILE,
  y1: (r + h) * TILE,
  oneWay: h === 1,
});

/**
 * Magma Gauntlet, from `assets/duel/models/arenas/magma_gauntlet.json`: a
 * 30x17 grid of 64 px tiles, which is this 960x540 view at exactly half
 * scale. Two stone banks, a bridge between them that rides up and down, a
 * high bridge over that, a ledge in each top corner, and lava under the lot
 * that rises every twelve seconds far enough to take the lower bridge.
 */
export const MAGMA: Arena = {
  id: "magma_gauntlet",
  name: "Magma Gauntlet",
  solids: [
    tiles(3, 12, 8, 2),
    tiles(19, 12, 8, 2),
    tiles(12, 9, 6, 1),
    tiles(1, 6, 5, 1),
    tiles(24, 6, 5, 1),
  ],
  movers: [{ from: [12 * TILE, 14 * TILE], to: [12 * TILE, 11 * TILE], w: 6 * TILE, h: TILE, period: 5 }],
  lava: { restY: 15 * TILE, peakY: 13 * TILE, first: 8, beat: 12, tell: 2, rise: 0.8, hold: 2.4, fall: 1.2 },
  spawn: [6 * TILE + 16, 23 * TILE + 16],
  spawnGround: 12 * TILE,
  tile: TILE,
};

/** Where a mover is `t` seconds in: eased, so it pauses at each end. */
export function moverAt(m: MoverDef, t: number, out: Rect): Rect {
  const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / m.period);
  out.x0 = m.from[0] + (m.to[0] - m.from[0]) * k;
  out.y0 = m.from[1] + (m.to[1] - m.from[1]) * k;
  out.x1 = out.x0 + m.w;
  out.y1 = out.y0 + m.h;
  return out;
}

/**
 * The top of the highest solid at or below `y` in column `x`, or Infinity
 * over the lava. "Below" allows a small overlap, so a particle resting on a
 * face still finds that face.
 */
export function surfaceBelow(solids: readonly Rect[], x: number, y: number): number {
  let best = Infinity;
  for (const r of solids) {
    if (x < r.x0 || x > r.x1) continue;
    if (r.y0 < y - 4) continue;
    if (r.y0 < best) best = r.y0;
  }
  return best;
}

/** What `collide` found. Reused, never allocated per call. */
export interface Contact {
  x: number;
  y: number;
  /** Pushed out through a top face: the particle is standing on something. */
  top: boolean;
  hit: boolean;
}

/**
 * Push a circle out of every solid it overlaps, along the shallowest axis.
 *
 * `prevBottom` is the lowest point of the WHOLE body at the start of the
 * substep, not this particle's: a one-way platform catches a body that was
 * entirely above it, and nothing of a body that was not. Decided per
 * particle, a robot carried up through the high bridge by the one below had
 * only its head above the top — and when the lower bridge fell away, the
 * high one caught the head and hung the robot from it.
 */
export function collide(
  solids: readonly Rect[],
  x: number,
  y: number,
  prevBottom: number,
  r: number,
  out: Contact
): Contact {
  out.x = x;
  out.y = y;
  out.top = false;
  out.hit = false;
  for (const s of solids) {
    const x0 = s.x0 - r;
    const x1 = s.x1 + r;
    const y0 = s.y0 - r;
    const y1 = s.y1 + r;
    if (out.x <= x0 || out.x >= x1 || out.y <= y0 || out.y >= y1) continue;
    if (s.oneWay) {
      if (prevBottom > s.y0 + 1) continue;
      out.y = y0;
      out.top = true;
      out.hit = true;
      continue;
    }
    const left = out.x - x0;
    const right = x1 - out.x;
    const up = out.y - y0;
    const down = y1 - out.y;
    const m = Math.min(left, right, up, down);
    out.hit = true;
    if (m === up) {
      out.y = y0;
      out.top = true;
    } else if (m === left) out.x = x0;
    else if (m === right) out.x = x1;
    else out.y = y1;
  }
  return out;
}
