import * as T from "./tuning";

/**
 * SwarmRush's simulation. Pure: no canvas, no DOM, no `Math.random`.
 *
 * ── Everything that moves is an `Orb` ────────────────────────────────────
 *
 * The player's cells and the bots share one shape and one movement rule, so
 * the eating rule is written once and applied to every pair. The player is
 * `cells` (one, or two after a split); the bots are `bots`. A dead bot keeps
 * its seat and respawns fresh, so the arena's population is a constant.
 *
 * ── Matter lives in a grid ───────────────────────────────────────────────
 *
 * Six hundred pellets against forty orbs is twenty-four thousand distance
 * checks a step. A uniform grid of `MATTER_CELL` squares turns that into
 * "the pellets in the cells my radius touches". Orbs check each other
 * pairwise: there are at most forty-two of them.
 *
 * ── Events are counters, not a slot ──────────────────────────────────────
 *
 * The puzzle cabinets report one event a step. Here an orb can eat six
 * pellets, dash and be threatened in the same step, so each is its own field
 * on `events`, zeroed at the top of `step` and read by the seam after it.
 */

export type Phase = "normal" | "big" | "done";
export type Outcome = "survived" | "eaten" | null;

export interface Orb {
  x: number;
  y: number;
  /** Where it was at the previous step, so the renderer can interpolate. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  mass: number;
  /** Seconds of dash speed left. */
  boost: number;
  /** Seconds until this orb may dash again. */
  dashCd: number;
}

export interface Cell extends Orb {
  /** Launch velocity from a split, decaying to zero. */
  lx: number;
  ly: number;
  /** Seconds until this half may merge back. */
  mergeIn: number;
  /** Steps of squash left after a bite, for the renderer. */
  squash: number;
  /** Seconds of spawn protection left. */
  shield: number;
}

export interface Bot extends Orb {
  id: number;
  name: string;
  hue: number;
  /** 0 timid … 1 hunts anything it can. */
  aggro: number;
  alive: boolean;
  respawnIn: number;
  /** Seconds until the next decision. */
  think: number;
  /** Current steering, unit-ish. */
  sx: number;
  sy: number;
}

export interface Spike {
  x: number;
  y: number;
  r: number;
}

export interface BoardRow {
  name: string;
  mass: number;
  you: boolean;
}

export interface FeedLine {
  text: string;
  /** Seconds left on screen. */
  ttl: number;
  kill: boolean;
}

export interface SimInput {
  /** Steering, magnitude 0..1. */
  dx: number;
  dy: number;
  dash: boolean;
  split: boolean;
}

export interface Events {
  /** Pellets eaten by the player this step. */
  ate: number;
  /** A bot the player ate, or null. */
  killed: Bot | null;
  died: boolean;
  dashed: boolean;
  split: boolean;
  merged: boolean;
  hazard: boolean;
  bigStart: boolean;
  won: boolean;
  lost: boolean;
  /** A bigger orb is close. 0..1 with closeness. */
  threat: number;
  /** The player is outside the ring. */
  storm: boolean;
}

const NAMES = [
  "Vex", "Moth", "Nyx", "Pip", "Quill", "Rook", "Sable", "Tilt", "Umber", "Wisp",
  "Ash", "Blip", "Cinder", "Dusk", "Ember", "Flick", "Gale", "Halo", "Ion", "Jolt",
  "Kite", "Lumen", "Nova", "Onyx", "Pulse", "Rune", "Sol", "Tide", "Veil", "Zephyr",
  "Bolt", "Coil", "Drift", "Echo", "Fuse", "Glim", "Husk", "Iris", "Knot", "Lark",
];

export const radiusOf = (mass: number) => T.RADIUS_K * Math.sqrt(Math.max(1, mass));

export const speedFor = (mass: number) =>
  Math.max(T.SPEED_MIN, T.SPEED_BASE * Math.pow(T.START_MASS / Math.max(T.START_MASS, mass), T.SPEED_EXP));

export const zoomFor = (radius: number) =>
  Math.min(T.ZOOM_MAX, Math.max(T.ZOOM_MIN, T.ZOOM_NUM / (T.ZOOM_BASE + radius / T.ZOOM_R)));

/** Can `a` eat `b`, here and now. */
export function canEat(a: Orb, b: Orb): boolean {
  if (a.mass < T.EAT_RATIO * b.mass) return false;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = radiusOf(a.mass) - radiusOf(b.mass) * T.EAT_DEPTH;
  return reach > 0 && dx * dx + dy * dy < reach * reach;
}

/** A pellet. Stored as parallel arrays for the grid; `hue` is which colour bucket. */
export interface Matter {
  x: Float32Array;
  y: Float32Array;
  hue: Uint8Array;
  n: number;
}

class MatterGrid {
  cells = new Map<number, number[]>();
  constructor(private size: number) {}
  key(x: number, y: number) {
    // Offset so the world's negative half hashes apart from the positive.
    return (Math.floor(x / this.size) + 4096) * 8192 + (Math.floor(y / this.size) + 4096);
  }
  insert(i: number, x: number, y: number) {
    const k = this.key(x, y);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(i);
  }
  remove(i: number, x: number, y: number) {
    const bucket = this.cells.get(this.key(x, y));
    if (!bucket) return;
    const at = bucket.indexOf(i);
    if (at >= 0) bucket.splice(at, 1);
  }
  /** Visit every pellet index in cells overlapping the square around (x, y). */
  around(x: number, y: number, r: number, visit: (i: number) => void) {
    const x0 = Math.floor((x - r) / this.size);
    const x1 = Math.floor((x + r) / this.size);
    const y0 = Math.floor((y - r) / this.size);
    const y1 = Math.floor((y + r) / this.size);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get((cx + 4096) * 8192 + (cy + 4096));
        if (!bucket) continue;
        // Visit a copy's worth of indices by count, since a visit may remove.
        for (let j = bucket.length - 1; j >= 0; j--) visit(bucket[j]);
      }
    }
  }
}

export interface Sim {
  phase: Phase;
  outcome: Outcome;
  /** Seconds into the run. */
  t: number;
  /** Seconds into Big Mode, or 0. */
  bigT: number;
  world: number;
  /** Storm ring radius; Infinity before Big Mode. */
  ring: number;
  cells: Cell[];
  bots: Bot[];
  spikes: Spike[];
  matter: Matter;
  lives: number;
  dead: boolean;
  /** Steps of death freeze left, then seconds to respawn. */
  deathSteps: number;
  respawnIn: number;
  /** Who ate you last, for the banner. */
  eatenBy: string;
  kills: number;
  eatenMass: number;
  peakMass: number;
  score: number;
  place: number;
  /** Seconds until the player may split again. */
  splitCd: number;
  board: BoardRow[];
  /** The player's rank among everyone alive, 1-based. */
  rank: number;
  feed: FeedLine[];
  events: Events;
  /** Camera, eased: centre and zoom, with the previous step's for interpolation. */
  camX: number;
  camY: number;
  zoom: number;
  camPX: number;
  camPY: number;
  zoomP: number;

  /** Total player mass across cells. */
  mass(): number;
  /** Player centre of mass. */
  centre(): { x: number; y: number };
  step(dt: number, input: SimInput): void;
}

export function createSim(rng: () => number): Sim {
  const grid = new MatterGrid(T.MATTER_CELL);
  const matter: Matter = {
    x: new Float32Array(T.MATTER_N_BIG),
    y: new Float32Array(T.MATTER_N_BIG),
    hue: new Uint8Array(T.MATTER_N_BIG),
    n: 0,
  };

  const events: Events = {
    ate: 0, killed: null, died: false, dashed: false, split: false, merged: false,
    hazard: false, bigStart: false, won: false, lost: false, threat: 0, storm: false,
  };

  const sim: Sim = {
    phase: "normal",
    outcome: null,
    t: 0,
    bigT: 0,
    world: T.WORLD,
    ring: Infinity,
    cells: [],
    bots: [],
    spikes: [],
    matter,
    lives: T.LIVES,
    dead: false,
    deathSteps: 0,
    respawnIn: 0,
    eatenBy: "",
    kills: 0,
    eatenMass: 0,
    peakMass: T.START_MASS,
    score: 0,
    place: 0,
    splitCd: 0,
    board: [],
    rank: 1,
    feed: [],
    events,
    camX: 0,
    camY: 0,
    zoom: zoomFor(radiusOf(T.START_MASS)),
    camPX: 0,
    camPY: 0,
    zoomP: zoomFor(radiusOf(T.START_MASS)),
    mass,
    centre,
    step,
  };

  const half = () => sim.world / 2;
  const rnd = (a: number, b: number) => a + (b - a) * rng();

  function mass() {
    let m = 0;
    for (const c of sim.cells) m += c.mass;
    return m;
  }

  function centre() {
    let x = 0;
    let y = 0;
    let m = 0;
    for (const c of sim.cells) {
      x += c.x * c.mass;
      y += c.y * c.mass;
      m += c.mass;
    }
    return m > 0 ? { x: x / m, y: y / m } : { x: sim.camX, y: sim.camY };
  }

  // ── Matter ────────────────────────────────────────────────────────────

  function placeMatter(i: number) {
    let x = 0;
    let y = 0;
    // Inside the ring, if there is one: matter outside a storm is bait nobody
    // can take.
    for (let tries = 0; tries < 8; tries++) {
      x = rnd(-half() + 20, half() - 20);
      y = rnd(-half() + 20, half() - 20);
      if (Math.hypot(x, y) < sim.ring * 0.95) break;
    }
    matter.x[i] = x;
    matter.y[i] = y;
    matter.hue[i] = Math.floor(rng() * 4);
    grid.insert(i, x, y);
  }

  function fillMatter(n: number) {
    while (matter.n < n) {
      placeMatter(matter.n);
      matter.n++;
    }
  }

  /** Eat pellet `i`: respawn it elsewhere. Returns its mass. */
  function takeMatter(i: number): number {
    grid.remove(i, matter.x[i], matter.y[i]);
    placeMatter(i);
    return T.MATTER_MASS;
  }

  // ── Spawning ──────────────────────────────────────────────────────────

  function safeSpot(minMass: number): { x: number; y: number } {
    let best = { x: 0, y: 0 };
    let bestD = -1;
    for (let tries = 0; tries < 14; tries++) {
      const lim = Math.min(half() - T.EDGE_MARGIN, sim.ring * 0.8);
      const x = rnd(-lim, lim);
      const y = rnd(-lim, lim);
      let d = Infinity;
      for (const b of sim.bots) {
        if (!b.alive || b.mass < minMass) continue;
        d = Math.min(d, Math.hypot(b.x - x, b.y - y) - radiusOf(b.mass));
      }
      for (const s of sim.spikes) d = Math.min(d, Math.hypot(s.x - x, s.y - y) - s.r);
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
      if (d > 320) break;
    }
    return best;
  }

  function freshCell(x: number, y: number, m: number): Cell {
    return { x, y, px: x, py: y, vx: 0, vy: 0, mass: m, boost: 0, dashCd: 0, lx: 0, ly: 0, mergeIn: 0, squash: 0, shield: 0 };
  }

  function spawnPlayer() {
    const at = safeSpot(T.START_MASS * 2);
    const cell = freshCell(at.x, at.y, T.START_MASS);
    cell.shield = T.SPAWN_SHIELD_S;
    sim.cells = [cell];
    sim.camX = sim.camPX = at.x;
    sim.camY = sim.camPY = at.y;
  }

  function spawnBot(b: Bot, massMin: number, massMax: number) {
    const at = safeSpot(0);
    b.x = b.px = at.x;
    b.y = b.py = at.y;
    b.vx = 0;
    b.vy = 0;
    b.mass = rnd(massMin, massMax);
    b.boost = 0;
    b.dashCd = rnd(0, T.DASH_CD_S);
    b.alive = true;
    b.respawnIn = 0;
    b.think = rng() * T.AI_THINK_S;
    b.sx = 0;
    b.sy = 0;
  }

  function addBot(id: number, massMin: number, massMax: number) {
    const b: Bot = {
      id,
      name: NAMES[id % NAMES.length],
      hue: Math.floor(rng() * 360),
      aggro: rng(),
      x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, mass: 0, boost: 0, dashCd: 0,
      alive: false, respawnIn: 0, think: 0, sx: 0, sy: 0,
    };
    sim.bots.push(b);
    spawnBot(b, massMin, massMax);
  }

  function addSpikes(n: number) {
    while (sim.spikes.length < n) {
      const r = rnd(T.SPIKE_R_MIN, T.SPIKE_R_MAX);
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 10; tries++) {
        x = rnd(-half() + r + 40, half() - r - 40);
        y = rnd(-half() + r + 40, half() - r - 40);
        if (Math.hypot(x, y) > T.SPIKE_CLEAR + r) break;
      }
      sim.spikes.push({ x, y, r });
    }
  }

  // ── Movement ──────────────────────────────────────────────────────────

  function move(o: Orb, sx: number, sy: number, dt: number) {
    o.px = o.x;
    o.py = o.y;
    let speed = speedFor(o.mass);
    if (o.boost > 0) {
      speed *= T.DASH_MULT;
      o.boost -= dt;
    }
    if (o.dashCd > 0) o.dashCd -= dt;
    const k = Math.min(1, T.ACCEL * dt);
    o.vx += (sx * speed - o.vx) * k;
    o.vy += (sy * speed - o.vy) * k;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    const lim = half() - radiusOf(o.mass) * 0.5;
    if (o.x < -lim) { o.x = -lim; o.vx = Math.max(0, o.vx); }
    if (o.x > lim) { o.x = lim; o.vx = Math.min(0, o.vx); }
    if (o.y < -lim) { o.y = -lim; o.vy = Math.max(0, o.vy); }
    if (o.y > lim) { o.y = lim; o.vy = Math.min(0, o.vy); }
  }

  function dash(o: Orb): boolean {
    if (o.dashCd > 0 || o.boost > 0 || o.mass <= T.START_MASS) return false;
    o.mass -= o.mass * T.DASH_COST;
    o.boost = T.DASH_S;
    o.dashCd = T.DASH_CD_S;
    return true;
  }

  /** Mass drains under the storm or a spike; returns true if this orb is gone. */
  function drain(o: Orb, dt: number): boolean {
    let rate = 0;
    if (Math.hypot(o.x, o.y) > sim.ring) rate += T.STORM_DRAIN;
    const r = radiusOf(o.mass);
    for (const s of sim.spikes) {
      if (Math.hypot(o.x - s.x, o.y - s.y) < r + s.r * 0.6) {
        rate += T.HAZARD_DRAIN;
        // Pushed out, so a spike is a wall you bleed on rather than a pit.
        const dx = o.x - s.x;
        const dy = o.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        o.x += (dx / d) * 60 * dt;
        o.y += (dy / d) * 60 * dt;
      }
    }
    if (rate > 0) o.mass -= o.mass * rate * dt;
    if (o.mass > T.DECAY_ABOVE) o.mass -= o.mass * T.DECAY_RATE * dt;
    return o.mass < T.STORM_KILL_MASS;
  }

  function graze(o: Orb, onEat: (m: number) => void) {
    const r = radiusOf(o.mass);
    grid.around(o.x, o.y, r, (i) => {
      const dx = matter.x[i] - o.x;
      const dy = matter.y[i] - o.y;
      if (dx * dx + dy * dy < r * r) onEat(takeMatter(i));
    });
  }

  // ── Bots ──────────────────────────────────────────────────────────────

  function think(b: Bot) {
    const r = radiusOf(b.mass);
    let sx = 0;
    let sy = 0;
    let fled = false;

    // Outside the ring, everything else can wait.
    if (Math.hypot(b.x, b.y) > sim.ring * 0.9) {
      const d = Math.hypot(b.x, b.y) || 1;
      b.sx = -b.x / d;
      b.sy = -b.y / d;
      return;
    }

    // Threats first: the nearest orb that could eat me, within sight.
    let threat: Orb | null = null;
    let threatD = Infinity;
    const fleeR = r * T.FLEE_R_K + T.FLEE_R_PX;
    const consider = (o: Orb) => {
      const d = Math.hypot(o.x - b.x, o.y - b.y) - radiusOf(o.mass);
      if (o.mass >= T.EAT_RATIO * b.mass && d < fleeR && d < threatD) {
        threat = o;
        threatD = d;
      }
    };
    for (const o of sim.bots) if (o !== b && o.alive) consider(o);
    if (!sim.dead) for (const c of sim.cells) consider(c);

    if (threat) {
      const t = threat as Orb;
      const d = Math.hypot(b.x - t.x, b.y - t.y) || 1;
      sx = (b.x - t.x) / d;
      sy = (b.y - t.y) / d;
      fled = true;
      if (threatD < radiusOf(t.mass) * 1.2 && rng() < 0.6) dash(b);
    } else {
      // Prey, if I am the hunting kind.
      let prey: Orb | null = null;
      let preyD = Infinity;
      const huntR = r * T.HUNT_R_K + T.HUNT_R_PX;
      const hunt = (o: Orb) => {
        if (o.mass < b.mass * T.HUNT_MIN_RATIO) return;
        const d = Math.hypot(o.x - b.x, o.y - b.y);
        if (b.mass >= T.EAT_RATIO * o.mass && d < huntR && d < preyD) {
          prey = o;
          preyD = d;
        }
      };
      // The chance a bot even looks for prey this think is its personality:
      // a timid one grazes, a hungry one hunts on most of them.
      if (rng() < b.aggro * 0.85) {
        for (const o of sim.bots) if (o !== b && o.alive) hunt(o);
        if (!sim.dead) for (const c of sim.cells) hunt(c);
      }
      if (prey) {
        const p = prey as Orb;
        // Lead the target a touch.
        const tx = p.x + p.vx * 0.25;
        const ty = p.y + p.vy * 0.25;
        const d = Math.hypot(tx - b.x, ty - b.y) || 1;
        sx = (tx - b.x) / d;
        sy = (ty - b.y) / d;
        if (preyD < r * 2.5 && b.aggro > 0.5 && rng() < 0.5) dash(b);
      } else {
        // Graze: the nearest of a handful of sampled pellets.
        let bx = 0;
        let by = 0;
        let bd = Infinity;
        for (let s = 0; s < T.GRAZE_SAMPLES; s++) {
          const i = Math.floor(rng() * matter.n);
          const d = Math.hypot(matter.x[i] - b.x, matter.y[i] - b.y);
          if (d < bd) {
            bd = d;
            bx = matter.x[i];
            by = matter.y[i];
          }
        }
        const d = bd || 1;
        sx = (bx - b.x) / d;
        sy = (by - b.y) / d;
      }
    }

    // Spikes: steer off them, hard when close.
    for (const s of sim.spikes) {
      const dx = b.x - s.x;
      const dy = b.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const near = r + s.r + 90;
      if (d < near) {
        const w = (1 - d / near) * 2.5;
        sx += (dx / d) * w;
        sy += (dy / d) * w;
      }
    }

    // Edges: turn in before the wall, unless fleeing along it.
    const lim = half() - T.EDGE_MARGIN - r;
    if (!fled || Math.abs(b.x) > lim + 60 || Math.abs(b.y) > lim + 60) {
      if (b.x < -lim) sx += 1;
      if (b.x > lim) sx -= 1;
      if (b.y < -lim) sy += 1;
      if (b.y > lim) sy -= 1;
    }

    const len = Math.hypot(sx, sy);
    if (len > 1) {
      sx /= len;
      sy /= len;
    }
    b.sx = sx;
    b.sy = sy;
  }

  // ── Board and feed ────────────────────────────────────────────────────

  const boardPool: BoardRow[] = [];
  for (let i = 0; i < T.BOARD_ROWS; i++) boardPool.push({ name: "", mass: 0, you: false });
  const ranked: Array<{ name: string; mass: number; you: boolean }> = [];

  function rebuildBoard() {
    ranked.length = 0;
    const me = mass();
    if (!sim.dead) ranked.push({ name: "You", mass: me, you: true });
    for (const b of sim.bots) if (b.alive) ranked.push({ name: b.name, mass: b.mass, you: false });
    ranked.sort((a, b) => b.mass - a.mass);
    sim.rank = sim.dead ? ranked.length + 1 : ranked.findIndex((r) => r.you) + 1;
    const n = Math.min(T.BOARD_ROWS, ranked.length);
    for (let i = 0; i < n; i++) {
      boardPool[i].name = ranked[i].name;
      boardPool[i].mass = ranked[i].mass;
      boardPool[i].you = ranked[i].you;
    }
    sim.board = boardPool.slice(0, n);
  }

  function say(text: string, kill = false) {
    sim.feed.unshift({ text, ttl: T.FEED_S, kill });
    if (sim.feed.length > T.FEED_LINES) sim.feed.length = T.FEED_LINES;
  }

  function placeNow(): number {
    const me = sim.dead ? 0 : mass();
    let ahead = 0;
    for (const b of sim.bots) if (b.alive && b.mass > me) ahead++;
    return ahead + 1;
  }

  function tally() {
    sim.score = Math.floor(sim.eatenMass) + sim.kills * T.KILL_POINTS;
    if (sim.outcome === "survived") {
      sim.score += T.PLACE_POINTS[sim.place - 1] ?? 0;
      sim.score += sim.lives * T.LIFE_POINTS;
    }
  }

  // ── Death ─────────────────────────────────────────────────────────────

  function die(by: string) {
    sim.cells = [];
    sim.dead = true;
    sim.eatenBy = by;
    sim.lives--;
    sim.deathSteps = T.DEATH_STEPS;
    sim.respawnIn = T.RESPAWN_S;
    events.died = true;
    say(`Eaten by ${by}`);
    if (sim.lives <= 0) {
      sim.phase = "done";
      sim.outcome = "eaten";
      sim.place = placeNow();
      events.lost = true;
    }
    tally();
  }

  // ── Big Mode ──────────────────────────────────────────────────────────

  function startBig() {
    sim.phase = "big";
    sim.bigT = 0;
    sim.world = T.WORLD_BIG;
    sim.ring = (sim.world / 2) * 1.05;
    // New arrivals are sized against the player, so the round is a fight
    // whether the first hundred seconds went well or badly.
    const me = Math.max(T.START_MASS * 2, sim.dead ? sim.peakMass : mass());
    for (let i = sim.bots.length; i < T.BOTS_BIG; i++) addBot(i, me * 0.5, me * 1.6);
    addSpikes(T.SPIKES_BIG);
    fillMatter(T.MATTER_N_BIG);
    events.bigStart = true;
    say("BIG MODE — the storm is coming", true);
  }

  function ringNow(): number {
    const t = sim.bigT - T.BIG_INTRO_S;
    const start = (sim.world / 2) * 1.05;
    if (t <= 0) return start;
    const f = Math.min(1, t / T.BIG_S);
    return start + (T.RING_MIN - start) * f;
  }

  // ── The step ──────────────────────────────────────────────────────────

  let boardTick = 0;
  // Through a call, because `die()` and `startBig()` change the phase and
  // TypeScript's narrowing cannot see that from `step`.
  const isDone = () => sim.phase === "done";

  function step(dt: number, input: SimInput) {
    events.ate = 0;
    events.killed = null;
    events.died = false;
    events.dashed = false;
    events.split = false;
    events.merged = false;
    events.hazard = false;
    events.bigStart = false;
    events.won = false;
    events.lost = false;
    events.threat = 0;
    events.storm = false;

    if (sim.phase === "done") return;

    sim.t += dt;
    for (const f of sim.feed) f.ttl -= dt;
    while (sim.feed.length && sim.feed[sim.feed.length - 1].ttl <= 0) sim.feed.pop();

    // The clock of the run.
    if (sim.phase === "normal" && sim.t >= T.NORMAL_S) startBig();
    if (sim.phase === "big") {
      sim.bigT += dt;
      sim.ring = ringNow();
      if (sim.ring <= T.RING_MIN + 1e-6 && sim.bigT - T.BIG_INTRO_S - T.BIG_S >= T.RING_HOLD_S) {
        sim.phase = "done";
        sim.outcome = "survived";
        sim.place = placeNow();
        events.won = true;
        tally();
        return;
      }
    }

    // ── Player ──
    if (sim.dead) {
      if (sim.deathSteps > 0) sim.deathSteps--;
      else {
        sim.respawnIn -= dt;
        if (sim.respawnIn <= 0) {
          sim.dead = false;
          spawnPlayer();
        }
      }
    } else {
      if (sim.splitCd > 0) sim.splitCd -= dt;

      if (input.dash) {
        let any = false;
        for (const c of sim.cells) any = dash(c) || any;
        if (any) events.dashed = true;
      }

      if (input.split && sim.cells.length === 1 && sim.splitCd <= 0 && sim.cells[0].mass >= T.SPLIT_MIN_MASS) {
        const c = sim.cells[0];
        const h = c.mass / 2;
        c.mass = h;
        const len = Math.hypot(input.dx, input.dy);
        const dx = len > 0.05 ? input.dx / len : c.vx / (Math.hypot(c.vx, c.vy) || 1);
        const dy = len > 0.05 ? input.dy / len : c.vy / (Math.hypot(c.vx, c.vy) || 1);
        const twin = freshCell(c.x + dx * radiusOf(h), c.y + dy * radiusOf(h), h);
        twin.vx = c.vx;
        twin.vy = c.vy;
        twin.lx = dx * T.SPLIT_LAUNCH;
        twin.ly = dy * T.SPLIT_LAUNCH;
        twin.dashCd = c.dashCd;
        c.mergeIn = twin.mergeIn = T.SPLIT_MERGE_S;
        sim.cells.push(twin);
        sim.splitCd = T.SPLIT_CD_S;
        events.split = true;
      }

      for (const c of sim.cells) {
        move(c, input.dx, input.dy, dt);
        // The launch rides on top of steering and dies away.
        if (c.lx !== 0 || c.ly !== 0) {
          c.x += c.lx * dt;
          c.y += c.ly * dt;
          const k = Math.max(0, 1 - T.SPLIT_LAUNCH_DECAY * dt);
          c.lx *= k;
          c.ly *= k;
          if (Math.abs(c.lx) + Math.abs(c.ly) < 2) c.lx = c.ly = 0;
        }
        if (c.mergeIn > 0) c.mergeIn -= dt;
        if (c.shield > 0) c.shield -= dt;
        if (c.squash > 0) c.squash--;
        graze(c, (m) => {
          c.mass += m;
          sim.eatenMass += m;
          events.ate++;
          c.squash = T.SQUASH_STEPS;
        });
      }

      // Two halves: keep apart until they may merge, then merge on touch.
      if (sim.cells.length === 2) {
        const [a, b] = sim.cells;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const ra = radiusOf(a.mass);
        const rb = radiusOf(b.mass);
        if (a.mergeIn <= 0 && b.mergeIn <= 0) {
          if (d < Math.max(ra, rb)) {
            a.mass += b.mass;
            a.x = (a.x + b.x) / 2;
            a.y = (a.y + b.y) / 2;
            sim.cells = [a];
            events.merged = true;
          } else {
            const pull = Math.min(1, T.MERGE_PULL * dt) * 0.5;
            a.x += dx * pull;
            a.y += dy * pull;
            b.x -= dx * pull;
            b.y -= dy * pull;
          }
        } else if (d < ra + rb) {
          const push = (ra + rb - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }

      // Storm and spikes.
      for (let i = sim.cells.length - 1; i >= 0; i--) {
        const c = sim.cells[i];
        const out = Math.hypot(c.x, c.y) > sim.ring;
        if (out) events.storm = true;
        const before = c.mass;
        const gone = drain(c, dt);
        if (c.mass < before && !out) events.hazard = true;
        if (gone) {
          sim.cells.splice(i, 1);
          if (sim.cells.length === 0) die("the storm");
        }
      }
    }

    if (isDone()) return;

    // ── Bots ──
    for (const b of sim.bots) {
      if (!b.alive) {
        b.respawnIn -= dt;
        if (b.respawnIn <= 0) {
          const me = Math.max(T.START_MASS, sim.dead ? sim.peakMass * 0.5 : mass() * 0.6);
          if (sim.phase === "big") spawnBot(b, me * 0.5, me * 1.3);
          else spawnBot(b, T.BOT_MASS_MIN, T.BOT_MASS_MAX);
        }
        continue;
      }
      b.think -= dt;
      if (b.think <= 0) {
        b.think = T.AI_THINK_S * (0.6 + 0.8 * rng());
        think(b);
      }
      move(b, b.sx, b.sy, dt);
      graze(b, (m) => {
        b.mass += m;
      });
      if (drain(b, dt)) {
        b.alive = false;
        b.respawnIn = T.BOT_RESPAWN_S;
      }
    }

    // ── Who eats whom ──
    const alive: Bot[] = [];
    for (const b of sim.bots) if (b.alive) alive.push(b);

    // Bots against bots.
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (!b.alive) continue;
        if (canEat(a, b)) {
          a.mass += b.mass * T.EAT_GAIN;
          b.alive = false;
          b.respawnIn = T.BOT_RESPAWN_S;
        } else if (canEat(b, a)) {
          b.mass += a.mass * T.EAT_GAIN;
          a.alive = false;
          a.respawnIn = T.BOT_RESPAWN_S;
          break;
        }
      }
    }

    // Player against bots, and the threat reading for the screen.
    if (!sim.dead) {
      for (let i = sim.cells.length - 1; i >= 0; i--) {
        const c = sim.cells[i];
        const rc = radiusOf(c.mass);
        for (const b of alive) {
          if (!b.alive) continue;
          if (canEat(c, b)) {
            c.mass += b.mass * T.EAT_GAIN;
            sim.eatenMass += b.mass * T.EAT_GAIN;
            sim.kills++;
            b.alive = false;
            b.respawnIn = T.BOT_RESPAWN_S;
            c.squash = T.SQUASH_STEPS;
            c.shield = 0;
            events.killed = b;
            say(`You ate ${b.name}`, true);
          } else if (c.shield <= 0 && canEat(b, c)) {
            b.mass += c.mass * T.EAT_GAIN;
            sim.cells.splice(i, 1);
            if (sim.cells.length === 0) die(b.name);
            break;
          } else if (b.mass >= T.EAT_RATIO * c.mass) {
            const d = Math.hypot(b.x - c.x, b.y - c.y) - radiusOf(b.mass) - rc;
            const reach = rc * T.THREAT_RADII + 40;
            if (d < reach) events.threat = Math.max(events.threat, 1 - Math.max(0, d) / reach);
          }
        }
        if (sim.dead) break;
      }
      if (!sim.dead) {
        const now = mass();
        if (now > sim.peakMass) sim.peakMass = now;
      }
    }

    if (isDone()) return;
    tally();

    // ── Camera ──
    const target = centre();
    let biggest = 0;
    for (const c of sim.cells) if (c.mass > biggest) biggest = c.mass;
    const r = radiusOf(sim.dead ? sim.peakMass * 0.5 : biggest);
    const z = zoomFor(sim.cells.length === 2 ? r * 1.5 : r);
    const k = Math.min(1, T.CAM_EASE * dt);
    sim.camPX = sim.camX;
    sim.camPY = sim.camY;
    sim.zoomP = sim.zoom;
    sim.camX += (target.x - sim.camX) * k;
    sim.camY += (target.y - sim.camY) * k;
    sim.zoom += (z - sim.zoom) * k;

    if (++boardTick >= 20) {
      boardTick = 0;
      rebuildBoard();
    }
  }

  // ── Set the table ─────────────────────────────────────────────────────

  addSpikes(T.SPIKES);
  fillMatter(T.MATTER_N);
  for (let i = 0; i < T.BOTS; i++) addBot(i, T.BOT_MASS_MIN, T.BOT_MASS_MAX);
  spawnPlayer();
  rebuildBoard();

  return sim;
}
