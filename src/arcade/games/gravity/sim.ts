import * as T from "./tuning";
import { LEVELS, type GravityLevel } from "./levels";

/**
 * Gravity Shift's simulation: one ball, one direction called down.
 *
 * ── Tiles ────────────────────────────────────────────────────────────────
 *
 * The level is a byte grid the ball is resolved against one axis at a time:
 * move x, push out of any solid tile, move y, push out again. That is enough
 * for a room of axis-aligned tiles and it never tunnels — the ball is
 * smaller than a tile and capped under a tile per step.
 *
 * ── Rest, and why it is a state ──────────────────────────────────────────
 *
 * A ball pressed against a wall by gravity with no speed across it is at
 * rest, and `resting` says so. The HUD reads it to show that the room is
 * waiting for a choice, and the tests read it to know when to make the
 * next one. Friction is what gets the ball there: the component of speed
 * across the surface it rests on decays, so a ball dropped onto a floor
 * stops rather than sliding forever.
 *
 * ── Glass ────────────────────────────────────────────────────────────────
 *
 * A glass tile is a wall until the ball arrives at `BREAK_SPEED`, when it
 * becomes air and the ball keeps most of its speed through it. The speed
 * test is on the axis of impact only, so glancing along glass does not
 * break it. That makes glass a question about *fall distance*, which is a
 * question about the room's shape, which is the puzzle.
 */

export enum Tile {
  Air = 0,
  Wall = 1,
  Spike = 2,
  Goal = 3,
  Coin = 4,
  Glass = 5,
  Light = 6,
}

const LEGEND: Record<string, Tile> = {
  ".": Tile.Air,
  "#": Tile.Wall,
  "^": Tile.Spike,
  G: Tile.Goal,
  o: Tile.Coin,
  X: Tile.Glass,
  "~": Tile.Light,
  P: Tile.Air,
};

export type Dir = "down" | "up" | "left" | "right";

export const DIRS: Record<Dir, [number, number]> = {
  down: [0, 1],
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

export type Phase = "play" | "dead" | "clear" | "done";

export interface Sim {
  phase: Phase;
  hold: number;
  level: number;
  lives: number;
  score: number;
  /** Coins taken this level, for the score line. */
  coins: number;
  gravity: Dir;
  /** How many times down has been chosen this level. Fewer is better. */
  flips: number;

  px: number;
  py: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  resting: boolean;

  /** The live tile grid, `COLS * ROWS`, row-major. */
  tiles: Uint8Array;

  event: "none" | "flip" | "land" | "coin" | "glass" | "die" | "clear" | "level" | "won" | "lost";
  /** Speed at the last landing, for the thump. */
  landSpeed: number;
  outcome: "won" | "lost" | null;
}

export interface GravitySim extends Sim {
  step(dt: number): void;
  /** Choose which way is down. Ignored while not playing. */
  flip(dir: Dir): void;
  /** Start a level fresh. Tests only. */
  jumpTo(index: number): void;
  /** The whole state, for the solver in the tests. */
  save(): Saved;
  load(saved: Saved): void;
}

export interface Saved {
  px: number;
  py: number;
  vx: number;
  vy: number;
  gravity: Dir;
  tiles: Uint8Array;
  coins: number;
  score: number;
  flips: number;
  phase: Phase;
  hold: number;
  lives: number;
  level: number;
}

export function parseLevel(level: GravityLevel): { tiles: Uint8Array; spawn: [number, number] } {
  const tiles = new Uint8Array(T.COLS * T.ROWS);
  let spawn: [number, number] = [T.TILE * 1.5, T.TILE * 1.5];
  for (let r = 0; r < T.ROWS; r++) {
    const row = level.rows[r] ?? "";
    for (let c = 0; c < T.COLS; c++) {
      const ch = row[c] ?? "#";
      tiles[r * T.COLS + c] = LEGEND[ch] ?? Tile.Wall;
      if (ch === "P") spawn = [(c + 0.5) * T.TILE, (r + 0.5) * T.TILE];
    }
  }
  return { tiles, spawn };
}

export function tileAt(tiles: Uint8Array, c: number, r: number): Tile {
  if (c < 0 || r < 0 || c >= T.COLS || r >= T.ROWS) return Tile.Wall;
  return tiles[r * T.COLS + c] as Tile;
}

const solid = (t: Tile) => t === Tile.Wall || t === Tile.Glass;

export function createSim(): GravitySim {
  let level = LEVELS[0];
  let spawn: [number, number] = [0, 0];

  const sim: GravitySim = {
    phase: "play",
    hold: 0,
    level: 0,
    lives: T.LIVES,
    score: 0,
    coins: 0,
    gravity: "down",
    flips: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    prevX: 0,
    prevY: 0,
    resting: false,
    tiles: new Uint8Array(T.COLS * T.ROWS),
    event: "none",
    landSpeed: 0,
    outcome: null,
    step: stepSim,
    flip,
    jumpTo: loadLevel,
    save: () => ({
      px: sim.px,
      py: sim.py,
      vx: sim.vx,
      vy: sim.vy,
      gravity: sim.gravity,
      tiles: sim.tiles.slice(),
      coins: sim.coins,
      score: sim.score,
      flips: sim.flips,
      phase: sim.phase,
      hold: sim.hold,
      lives: sim.lives,
      level: sim.level,
    }),
    load: (v) => {
      if (v.level !== sim.level) loadLevel(v.level);
      sim.px = sim.prevX = v.px;
      sim.py = sim.prevY = v.py;
      sim.vx = v.vx;
      sim.vy = v.vy;
      sim.gravity = v.gravity;
      sim.tiles = v.tiles.slice();
      sim.coins = v.coins;
      sim.score = v.score;
      sim.flips = v.flips;
      sim.phase = v.phase;
      sim.hold = v.hold;
      sim.lives = v.lives;
      sim.event = "none";
      sim.outcome = null;
    },
  };

  function loadLevel(index: number) {
    sim.level = index;
    level = LEVELS[index];
    const parsed = parseLevel(level);
    sim.tiles = parsed.tiles;
    spawn = parsed.spawn;
    sim.coins = 0;
    sim.flips = 0;
    respawn();
  }

  function respawn() {
    sim.px = sim.prevX = spawn[0];
    sim.py = sim.prevY = spawn[1];
    sim.vx = sim.vy = 0;
    sim.gravity = "down";
    sim.resting = false;
    sim.phase = "play";
  }

  function flip(dir: Dir) {
    if (sim.phase !== "play") return;
    if (dir === sim.gravity) return;
    sim.gravity = dir;
    sim.flips++;
    sim.event = "flip";
  }

  /** The tile range the ball's box covers. */
  const span = { c0: 0, c1: 0, r0: 0, r1: 0 };
  function cover() {
    const r = T.BALL_R;
    span.c0 = Math.floor((sim.px - r) / T.TILE);
    span.c1 = Math.floor((sim.px + r - 0.001) / T.TILE);
    span.r0 = Math.floor((sim.py - r) / T.TILE);
    span.r1 = Math.floor((sim.py + r - 0.001) / T.TILE);
  }

  /**
   * Push the ball out of solid tiles along one axis. `d` is the sign of the
   * movement that got it here; `speed` the speed along that axis before the
   * move, for the glass. Returns true if it hit something.
   */
  function resolve(axis: "x" | "y", d: number, speed: number): boolean {
    if (d === 0) return false;
    cover();
    let hit = false;
    for (let r = span.r0; r <= span.r1; r++) {
      for (let c = span.c0; c <= span.c1; c++) {
        const t = tileAt(sim.tiles, c, r);
        if (!solid(t)) continue;
        if (t === Tile.Glass && speed >= T.BREAK_SPEED && c >= 0 && r >= 0 && c < T.COLS && r < T.ROWS) {
          sim.tiles[r * T.COLS + c] = Tile.Air;
          sim.event = "glass";
          if (axis === "x") sim.vx *= T.BREAK_KEEP;
          else sim.vy *= T.BREAK_KEEP;
          continue;
        }
        hit = true;
        if (axis === "x") {
          sim.px = d > 0 ? c * T.TILE - T.BALL_R : (c + 1) * T.TILE + T.BALL_R;
          sim.vx = 0;
        } else {
          sim.py = d > 0 ? r * T.TILE - T.BALL_R : (r + 1) * T.TILE + T.BALL_R;
          sim.vy = 0;
        }
        cover();
      }
    }
    return hit;
  }

  /** Is there something solid one pixel beyond the ball in direction (gx, gy)? */
  function pressed(gx: number, gy: number): boolean {
    const r = T.BALL_R;
    const x0 = sim.px - r + (gx > 0 ? 2 * r : 0) + gx;
    const y0 = sim.py - r + (gy > 0 ? 2 * r : 0) + gy;
    if (gx !== 0) {
      const c = Math.floor(x0 / T.TILE);
      for (let rr = Math.floor((sim.py - r) / T.TILE); rr <= Math.floor((sim.py + r - 0.001) / T.TILE); rr++) {
        if (solid(tileAt(sim.tiles, c, rr))) return true;
      }
      return false;
    }
    const rr = Math.floor(y0 / T.TILE);
    for (let c = Math.floor((sim.px - r) / T.TILE); c <= Math.floor((sim.px + r - 0.001) / T.TILE); c++) {
      if (solid(tileAt(sim.tiles, c, rr))) return true;
    }
    return false;
  }

  /** Non-solid tiles under the ball: coins, spikes, the goal, light zones. */
  function touch(): "die" | "clear" | null {
    cover();
    let out: "die" | "clear" | null = null;
    for (let r = span.r0; r <= span.r1; r++) {
      for (let c = span.c0; c <= span.c1; c++) {
        const t = tileAt(sim.tiles, c, r);
        if (t === Tile.Coin) {
          sim.tiles[r * T.COLS + c] = Tile.Air;
          sim.coins++;
          sim.score += T.COIN_POINTS;
          sim.event = "coin";
        } else if (t === Tile.Spike) {
          // Spikes are a tile, but the ball has to actually be in it — a
          // touch at the very edge of the box is a graze and not a death.
          const cx = (c + 0.5) * T.TILE;
          const cy = (r + 0.5) * T.TILE;
          if (Math.abs(cx - sim.px) < T.TILE / 2 + T.BALL_R - 6 && Math.abs(cy - sim.py) < T.TILE / 2 + T.BALL_R - 6) out = "die";
        } else if (t === Tile.Goal) {
          if (out !== "die") out = "clear";
        }
      }
    }
    return out;
  }

  function inLight(): boolean {
    return tileAt(sim.tiles, Math.floor(sim.px / T.TILE), Math.floor(sim.py / T.TILE)) === Tile.Light;
  }

  function die() {
    sim.event = "die";
    sim.lives--;
    sim.phase = "dead";
    sim.hold = T.DEATH_STEPS;
  }

  function stepSim(dt: number) {
    sim.event = "none";
    sim.prevX = sim.px;
    sim.prevY = sim.py;
    if (sim.phase === "done") return;

    if (sim.phase !== "play") {
      if (--sim.hold > 0) return;
      if (sim.phase === "dead") {
        if (sim.lives <= 0) {
          sim.phase = "done";
          sim.outcome = "lost";
          sim.event = "lost";
        } else {
          respawn();
        }
      } else if (sim.phase === "clear") {
        if (sim.level + 1 >= LEVELS.length) {
          sim.score += sim.lives * T.LIFE_POINTS;
          sim.phase = "done";
          sim.outcome = "won";
          sim.event = "won";
        } else {
          loadLevel(sim.level + 1);
          sim.event = "level";
        }
      }
      return;
    }

    const [gx, gy] = DIRS[sim.gravity];
    const g = T.GRAVITY * (inLight() ? T.LIGHT_GRAVITY : 1);
    sim.vx += gx * g * dt;
    sim.vy += gy * g * dt;

    // Friction across the surface the ball is pressed against.
    const onSurface = pressed(gx, gy);
    if (onSurface) {
      const k = Math.max(0, 1 - T.FRICTION * dt);
      if (gx !== 0) sim.vy *= k;
      else sim.vx *= k;
    }

    const speed = Math.hypot(sim.vx, sim.vy);
    if (speed > T.MAX_SPEED) {
      sim.vx *= T.MAX_SPEED / speed;
      sim.vy *= T.MAX_SPEED / speed;
    }

    const wasFalling = !onSurface;
    const vAlong = Math.abs(gx !== 0 ? sim.vx : sim.vy);

    const dx = sim.vx * dt;
    const dy = sim.vy * dt;
    const sx = Math.abs(sim.vx);
    const sy = Math.abs(sim.vy);
    sim.px += dx;
    resolve("x", Math.sign(dx), sx);
    sim.py += dy;
    resolve("y", Math.sign(dy), sy);

    // A landing: was in the air along gravity, now pressed against something.
    if (wasFalling && pressed(gx, gy) && vAlong > 40) {
      sim.landSpeed = vAlong;
      if (sim.event === "none") sim.event = "land";
    }

    // Judged after the move: a resting ball still picks up one step of
    // gravity before the wall takes it back, so the speed before the move
    // is never zero.
    const across = Math.abs(gx !== 0 ? sim.vy : sim.vx);
    const along = Math.abs(gx !== 0 ? sim.vx : sim.vy);
    sim.resting = pressed(gx, gy) && across < T.REST_SPEED && along < T.REST_SPEED;

    const hit = touch();
    if (hit === "die") {
      die();
    } else if (hit === "clear") {
      sim.score += T.LEVEL_POINTS;
      sim.event = "clear";
      sim.phase = "clear";
      sim.hold = T.CLEAR_STEPS;
    }
  }

  loadLevel(0);
  return sim;
}
