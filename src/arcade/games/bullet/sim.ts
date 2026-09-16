import * as T from "./tuning";
import { LEVELS, type BulletLevel } from "./levels";

/**
 * One Bullet's simulation: a room of tiles and one point moving through it.
 *
 * ── The march ────────────────────────────────────────────────────────────
 *
 * The shot is a point advanced `MARCH` pixels at a time. Each substep looks
 * at the tile it is now in; if that tile does something, it does it, and
 * the bounce is worked out from which tile edge the point crossed to get
 * there — a change of column is a vertical face, a change of row a
 * horizontal one, both at once a corner. Four pixels per substep at 640
 * px/s is 160 substeps a second, which is cheap, and it is what lets the
 * same code draw the aiming line: the preview is the march run ahead
 * against a copy of the room.
 *
 * ── Tiles ────────────────────────────────────────────────────────────────
 *
 * Wall: bounce. Mirror `/` and `\`: turn, no bounce charged. Glass: through,
 * and gone. Switch: every door flips, and the shot bounces. Door: a wall
 * while shut, air while open. Crate: shoved one tile along the shot's
 * axis if that tile is air (onto a switch if one is there, which throws
 * it), and the shot bounces. Charge: goes off, taking the eight tiles
 * around it — targets, glass, crates, other charges — and the shot goes on
 * through. Target: down, and the shot goes on through.
 */

export enum Tile {
  Air = 0,
  Wall = 1,
  MirrorA = 2, // "/"
  MirrorB = 3, // "\"
  Glass = 4,
  Switch = 5,
  DoorShut = 6,
  DoorOpen = 7,
  Crate = 8,
  Charge = 9,
  Target = 10,
}

const LEGEND: Record<string, Tile> = {
  ".": Tile.Air,
  "#": Tile.Wall,
  "/": Tile.MirrorA,
  "\\": Tile.MirrorB,
  X: Tile.Glass,
  S: Tile.Switch,
  D: Tile.DoorShut,
  d: Tile.DoorOpen,
  C: Tile.Crate,
  B: Tile.Charge,
  E: Tile.Target,
  T: Tile.Air,
};

export type Phase = "aim" | "flight" | "spent" | "clear" | "done";

export interface Sim {
  phase: Phase;
  hold: number;
  level: number;
  lives: number;
  score: number;

  /** The turret. */
  tx: number;
  ty: number;
  /** Aim, radians, screen convention (y down). */
  angle: number;

  /** The shot. */
  bx: number;
  by: number;
  dx: number;
  dy: number;
  prevX: number;
  prevY: number;
  bounces: number;
  travel: number;
  /** Recent positions, interleaved, for the trail. Ring buffer. */
  trail: Float32Array;
  trailAt: number;

  tiles: Uint8Array;
  targetsLeft: number;

  event: "none" | "fire" | "bounce" | "mirror" | "glass" | "switch" | "crate" | "boom" | "target" | "spent" | "clear" | "level" | "won" | "lost";
  outcome: "won" | "lost" | null;
}

export interface BulletSim extends Sim {
  step(dt: number): void;
  aim(angle: number): void;
  /** Fire along the current aim. Ignored unless aiming. */
  fire(): void;
  /** Start a level fresh. Tests only. */
  jumpTo(index: number): void;
  /**
   * The aiming line: where a shot at `angle` would go for `length` pixels,
   * against a copy of the room. Interleaved points, one per direction
   * change plus the end, written into `out`; returns the count.
   */
  preview(angle: number, out: Float32Array): number;
}

export function parseLevel(level: BulletLevel): { tiles: Uint8Array; turret: [number, number]; targets: number } {
  const tiles = new Uint8Array(T.COLS * T.ROWS);
  let turret: [number, number] = [T.TILE * 1.5, T.TILE * 1.5];
  let targets = 0;
  for (let r = 0; r < T.ROWS; r++) {
    const row = level.rows[r] ?? "";
    for (let c = 0; c < T.COLS; c++) {
      const ch = row[c] ?? "#";
      const t = LEGEND[ch] ?? Tile.Wall;
      tiles[r * T.COLS + c] = t;
      if (ch === "T") turret = [(c + 0.5) * T.TILE, (r + 0.5) * T.TILE];
      if (t === Tile.Target) targets++;
    }
  }
  return { tiles, turret, targets };
}

export function tileAt(tiles: Uint8Array, c: number, r: number): Tile {
  if (c < 0 || r < 0 || c >= T.COLS || r >= T.ROWS) return Tile.Wall;
  return tiles[r * T.COLS + c] as Tile;
}

/** What the shot does on entering a tile. Shared by the flight and the preview. */
interface Marcher {
  /** The room's bounce budget. */
  budget: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  bounces: number;
  travel: number;
  /** Set by `advance` when something happened this substep. */
  event: Sim["event"];
  targets: number;
}

function explode(tiles: Uint8Array, c: number, r: number, m: Marcher) {
  tiles[r * T.COLS + c] = Tile.Air;
  for (let rr = r - 1; rr <= r + 1; rr++) {
    for (let cc = c - 1; cc <= c + 1; cc++) {
      if (cc < 0 || rr < 0 || cc >= T.COLS || rr >= T.ROWS) continue;
      const t = tiles[rr * T.COLS + cc] as Tile;
      if (t === Tile.Target) {
        tiles[rr * T.COLS + cc] = Tile.Air;
        m.targets--;
      } else if (t === Tile.Glass || t === Tile.Crate) {
        tiles[rr * T.COLS + cc] = Tile.Air;
      } else if (t === Tile.Charge) {
        explode(tiles, cc, rr, m);
      }
    }
  }
}

function toggleDoors(tiles: Uint8Array) {
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === Tile.DoorShut) tiles[i] = Tile.DoorOpen;
    else if (tiles[i] === Tile.DoorOpen) tiles[i] = Tile.DoorShut;
  }
}

/** Does the shot stop at this tile's edge (as opposed to entering it)? */
function blocks(t: Tile): boolean {
  return t === Tile.Wall || t === Tile.DoorShut || t === Tile.Switch || t === Tile.Crate;
}

/**
 * The shot enters tile (c, r) across the face(s) named by `crossedX` /
 * `crossedY`, and the tile does what it does. Returns true if the shot
 * went in (and `m.x/m.y` should advance), false if it came off the face.
 */
function enter(tiles: Uint8Array, m: Marcher, c: number, r: number, crossedX: boolean, crossedY: boolean): boolean {
  const t = tileAt(tiles, c, r);

  const bounce = () => {
    if (crossedX) m.dx = -m.dx;
    if (crossedY) m.dy = -m.dy;
    m.bounces++;
    m.event = "bounce";
  };

  switch (t) {
    case Tile.Air:
    case Tile.DoorOpen:
      return true;
    case Tile.Wall:
    case Tile.DoorShut:
      bounce();
      return false;
    case Tile.Switch:
      toggleDoors(tiles);
      bounce();
      m.event = "switch";
      return false;
    case Tile.MirrorA: {
      // "/" — a ray going right turns up, going down turns left.
      const dx = m.dx;
      m.dx = -m.dy;
      m.dy = -dx;
      m.x = (c + 0.5) * T.TILE;
      m.y = (r + 0.5) * T.TILE;
      m.event = "mirror";
      return false;
    }
    case Tile.MirrorB: {
      // "\" — a ray going right turns down.
      const dx = m.dx;
      m.dx = m.dy;
      m.dy = dx;
      m.x = (c + 0.5) * T.TILE;
      m.y = (r + 0.5) * T.TILE;
      m.event = "mirror";
      return false;
    }
    case Tile.Glass:
      tiles[r * T.COLS + c] = Tile.Air;
      m.event = "glass";
      return true;
    case Tile.Crate: {
      // Shoved along the axis it was hit on, if there is room.
      const sc = crossedX ? c + Math.sign(m.dx) : c;
      const sr = crossedX ? r : r + Math.sign(m.dy);
      const beyond = tileAt(tiles, sc, sr);
      if (beyond === Tile.Air || beyond === Tile.Switch || beyond === Tile.DoorOpen) {
        tiles[r * T.COLS + c] = Tile.Air;
        tiles[sr * T.COLS + sc] = Tile.Crate;
        if (beyond === Tile.Switch) toggleDoors(tiles);
        bounce();
        m.event = "crate";
      } else {
        bounce();
      }
      return false;
    }
    case Tile.Charge:
      explode(tiles, c, r, m);
      m.event = "boom";
      return true;
    case Tile.Target:
      tiles[r * T.COLS + c] = Tile.Air;
      m.targets--;
      m.event = "target";
      return true;
  }
  return true;
}

/**
 * One substep of the march against `tiles`, which it may change. Returns
 * false when the shot is spent.
 *
 * A substep that crosses both a column and a row line is resolved in the
 * order the lines are crossed, so a diagonal shot skimming a floor comes off
 * the floor and not off the corner of the tile it never touched. Without
 * that, one substep in a few dozen reversed a 45° shot outright.
 */
function advance(tiles: Uint8Array, m: Marcher): boolean {
  m.event = "none";
  const c0 = Math.floor(m.x / T.TILE);
  const r0 = Math.floor(m.y / T.TILE);
  const nx = m.x + m.dx * T.MARCH;
  const ny = m.y + m.dy * T.MARCH;
  const c1 = Math.floor(nx / T.TILE);
  const r1 = Math.floor(ny / T.TILE);
  m.travel += T.MARCH;

  const crossedX = c1 !== c0;
  const crossedY = r1 !== r0;

  if (!crossedX && !crossedY) {
    m.x = nx;
    m.y = ny;
  } else if (crossedX !== crossedY) {
    if (enter(tiles, m, c1, r1, crossedX, crossedY)) {
      m.x = nx;
      m.y = ny;
    }
  } else {
    // Both. Which line is crossed first?
    const bx = m.dx > 0 ? (c0 + 1) * T.TILE : c0 * T.TILE;
    const by = m.dy > 0 ? (r0 + 1) * T.TILE : r0 * T.TILE;
    const tx = (bx - m.x) / m.dx;
    const ty = (by - m.y) / m.dy;
    if (Math.abs(tx - ty) < 1e-6) {
      // The corner itself.
      if (enter(tiles, m, c1, r1, true, true)) {
        m.x = nx;
        m.y = ny;
      }
    } else if (tx < ty) {
      // Column line first, into (c1, r0); then the row line into (c1, r1).
      const side = tileAt(tiles, c1, r0);
      if (blocks(side) || side === Tile.MirrorA || side === Tile.MirrorB) {
        enter(tiles, m, c1, r0, true, false);
      } else {
        if (side !== Tile.Air && side !== Tile.DoorOpen) enter(tiles, m, c1, r0, true, false);
        if (enter(tiles, m, c1, r1, false, true)) {
          m.x = nx;
          m.y = ny;
        }
      }
    } else {
      const side = tileAt(tiles, c0, r1);
      if (blocks(side) || side === Tile.MirrorA || side === Tile.MirrorB) {
        enter(tiles, m, c0, r1, false, true);
      } else {
        if (side !== Tile.Air && side !== Tile.DoorOpen) enter(tiles, m, c0, r1, false, true);
        if (enter(tiles, m, c1, r1, true, false)) {
          m.x = nx;
          m.y = ny;
        }
      }
    }
  }

  return m.bounces <= m.budget && m.travel < T.MAX_TRAVEL;
}

export function createSim(): BulletSim {
  let level = LEVELS[0];
  let base: Uint8Array = new Uint8Array(T.COLS * T.ROWS);
  const marcher: Marcher = { budget: 0, x: 0, y: 0, dx: 1, dy: 0, bounces: 0, travel: 0, event: "none", targets: 0 };
  const previewTiles = new Uint8Array(T.COLS * T.ROWS);

  const sim: BulletSim = {
    phase: "aim",
    hold: 0,
    level: 0,
    lives: T.LIVES,
    score: 0,
    tx: 0,
    ty: 0,
    angle: 0,
    bx: 0,
    by: 0,
    dx: 1,
    dy: 0,
    prevX: 0,
    prevY: 0,
    bounces: 0,
    travel: 0,
    trail: new Float32Array(T.TRAIL * 2),
    trailAt: 0,
    tiles: new Uint8Array(T.COLS * T.ROWS),
    targetsLeft: 0,
    event: "none",
    outcome: null,
    step: stepSim,
    aim,
    fire,
    jumpTo: loadLevel,
    preview,
  };

  function loadLevel(index: number) {
    sim.level = index;
    level = LEVELS[index];
    const parsed = parseLevel(level);
    base = parsed.tiles;
    sim.tx = parsed.turret[0];
    sim.ty = parsed.turret[1];
    sim.angle = level.aim ?? 0;
    marcher.budget = level.bounces;
    reset();
  }

  /** The room as it was, the shot back in the turret. */
  function reset() {
    sim.tiles = base.slice();
    let n = 0;
    for (let i = 0; i < sim.tiles.length; i++) if (sim.tiles[i] === Tile.Target) n++;
    sim.targetsLeft = n;
    sim.bx = sim.prevX = sim.tx;
    sim.by = sim.prevY = sim.ty;
    sim.bounces = 0;
    sim.travel = 0;
    sim.trail.fill(-1000);
    sim.phase = "aim";
  }

  function aim(angle: number) {
    if (sim.phase !== "aim") return;
    sim.angle = angle;
  }

  function fire() {
    if (sim.phase !== "aim") return;
    sim.dx = Math.cos(sim.angle);
    sim.dy = Math.sin(sim.angle);
    sim.bx = sim.tx;
    sim.by = sim.ty;
    sim.phase = "flight";
    sim.event = "fire";
  }

  function preview(angle: number, out: Float32Array): number {
    previewTiles.set(sim.tiles);
    marcher.x = sim.tx;
    marcher.y = sim.ty;
    marcher.dx = Math.cos(angle);
    marcher.dy = Math.sin(angle);
    marcher.bounces = 0;
    marcher.travel = 0;
    marcher.targets = sim.targetsLeft;
    let n = 0;
    out[n++] = marcher.x;
    out[n++] = marcher.y;
    let turns = 0;
    const steps = Math.floor(T.PREVIEW_LENGTH / T.MARCH);
    for (let i = 0; i < steps && n + 2 <= out.length; i++) {
      const dx = marcher.dx;
      const dy = marcher.dy;
      const alive = advance(previewTiles, marcher);
      if (marcher.dx !== dx || marcher.dy !== dy) {
        out[n++] = marcher.x;
        out[n++] = marcher.y;
        if (marcher.event === "bounce" || marcher.event === "switch" || marcher.event === "crate") turns++;
        if (turns > T.PREVIEW_BOUNCES) return n / 2;
      }
      if (!alive) break;
    }
    if (n + 2 <= out.length) {
      out[n++] = marcher.x;
      out[n++] = marcher.y;
    }
    return n / 2;
  }

  function spend() {
    sim.event = "spent";
    sim.lives--;
    sim.phase = "spent";
    sim.hold = T.SPENT_STEPS;
  }

  function stepSim(dt: number) {
    sim.event = "none";
    sim.prevX = sim.bx;
    sim.prevY = sim.by;
    if (sim.phase === "done" || sim.phase === "aim") return;

    if (sim.phase !== "flight") {
      if (--sim.hold > 0) return;
      if (sim.phase === "spent") {
        if (sim.lives <= 0) {
          sim.phase = "done";
          sim.outcome = "lost";
          sim.event = "lost";
        } else {
          reset();
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

    // Flight: march the whole step's distance in substeps, keeping the most
    // interesting event of the step for the seam.
    marcher.x = sim.bx;
    marcher.y = sim.by;
    marcher.dx = sim.dx;
    marcher.dy = sim.dy;
    marcher.bounces = sim.bounces;
    marcher.travel = sim.travel;
    marcher.targets = sim.targetsLeft;
    const subs = Math.max(1, Math.round((T.SPEED * dt) / T.MARCH));
    let alive = true;
    for (let i = 0; i < subs && alive; i++) {
      alive = advance(sim.tiles, marcher);
      if (marcher.event !== "none") sim.event = marcher.event;
      if (marcher.targets <= 0) break;
    }
    sim.bx = marcher.x;
    sim.by = marcher.y;
    sim.dx = marcher.dx;
    sim.dy = marcher.dy;
    sim.bounces = marcher.bounces;
    sim.travel = marcher.travel;
    sim.score += (sim.targetsLeft - marcher.targets) * T.TARGET_POINTS;
    sim.targetsLeft = marcher.targets;
    sim.trail[sim.trailAt * 2] = sim.bx;
    sim.trail[sim.trailAt * 2 + 1] = sim.by;
    sim.trailAt = (sim.trailAt + 1) % T.TRAIL;

    if (sim.targetsLeft <= 0) {
      sim.score += T.LEVEL_POINTS + sim.bounces * T.BOUNCE_POINTS;
      sim.event = "clear";
      sim.phase = "clear";
      sim.hold = T.CLEAR_STEPS;
    } else if (!alive) {
      spend();
    }
  }

  loadLevel(0);
  return sim;
}
