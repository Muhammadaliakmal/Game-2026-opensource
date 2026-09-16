import * as T from "./tuning";
import { LEVELS, solidWalls, type EchoLevel, type Rect } from "./levels";

/**
 * ECHO's simulation: the runner, its ghosts, and the room they share.
 *
 * ── A ghost is a recording, and nothing else ─────────────────────────────
 *
 * Every step of a run appends the runner's position to a buffer. When the run
 * ends the buffer is kept, and on every later run a ghost is drawn at
 * `buffer[step]` — the same step index the live runner is on. There is no
 * ghost AI, no replaying of inputs through the physics, and so no way for a
 * ghost to drift from what the player did: it *is* what the player did.
 *
 * When a ghost's recording runs out it leaves. A plate it was standing on
 * releases. That is not a limitation, it is the mechanic — a ghost holds a
 * plate for exactly as long as the player held it, and a level like "Let go"
 * is built on the player choosing when that is.
 *
 * ── Run, reset, run ──────────────────────────────────────────────────────
 *
 * A run ends three ways: the clock, a guard, or the exit. The first two
 * become a ghost and the level resets; the exit clears the level. A run that
 * ends on a guard still becomes a ghost, up to the moment it ended — a
 * mistake is a recording too, and sometimes a useful one.
 *
 * ── Everything is a box ──────────────────────────────────────────────────
 *
 * Walls, doors, the exit and the runner are axis-aligned rectangles; plates
 * and guards are circles tested against the runner's centre with a radius
 * sum. Movement resolves x and then y against the walls, which is enough for
 * a room made of straight corridors and lets the runner slide along a wall
 * rather than stick to it.
 */

export type Phase = "run" | "reset" | "clear" | "lost" | "done";

export interface Ghost {
  /** Interleaved x, y per step. */
  path: Float32Array;
  steps: number;
}

export interface SimInput {
  /** -1..1 each. Normalised inside if longer than one. */
  ax: number;
  ay: number;
}

export interface Sim {
  phase: Phase;
  /** Steps left in the current phase's hold, for reset/clear/lost. */
  hold: number;
  level: number;
  loop: number;
  score: number;

  /** The runner's centre. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;

  /** Seconds left on the clock of this run. */
  clock: number;
  /** Steps into this run. Indexes the ghosts too. */
  tick: number;

  ghosts: Ghost[];
  /** This run's recording, in progress. */
  recording: Float32Array;

  /** Guards' current centres, interleaved x, y. */
  guards: Float32Array;
  /** Plate id → held this step. */
  held: Record<string, boolean>;
  /** Door index → solid this step. */
  doorSolid: boolean[];

  /** One-step flags for the seam. */
  event: "none" | "plate" | "door" | "caught" | "timeout" | "exit" | "level" | "lost" | "won";
  /** Whether the runner is on a plate right now, for the hum. */
  onPlate: boolean;
  /** How it ended, once `phase` is `done`. */
  outcome: "won" | "lost" | null;
}

/** Room a run may take, in steps. */
function runSteps(level: EchoLevel): number {
  return Math.ceil(level.time * 60) + 1;
}

export function currentLevel(sim: Sim): EchoLevel {
  return LEVELS[Math.min(sim.level, LEVELS.length - 1)];
}

function overlaps(ax: number, ay: number, ar: number, r: Rect): boolean {
  return ax + ar > r.x && ax - ar < r.x + r.w && ay + ar > r.y && ay - ar < r.y + r.h;
}

function onCircle(x: number, y: number, r: number, cx: number, cy: number, cr: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const rr = r + cr;
  return dx * dx + dy * dy < rr * rr;
}

/** Where a guard is `t` seconds into a run: back and forth along its path. */
export function guardAt(path: Array<[number, number]>, speed: number, t: number, out: [number, number]) {
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  }
  if (total === 0) {
    out[0] = path[0][0];
    out[1] = path[0][1];
    return;
  }
  // Ping-pong: distance along a doubled path, folded.
  let s = (t * speed) % (2 * total);
  if (s > total) s = 2 * total - s;
  for (let i = 0; i + 1 < path.length; i++) {
    const leg = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (s <= leg || i + 2 === path.length) {
      const k = leg === 0 ? 0 : Math.min(1, s / leg);
      out[0] = path[i][0] + (path[i + 1][0] - path[i][0]) * k;
      out[1] = path[i][1] + (path[i + 1][1] - path[i][1]) * k;
      return;
    }
    s -= leg;
  }
}

export interface EchoSim extends Sim {
  step(dt: number, input: SimInput): void;
  /** Start a level fresh. The seam never calls it; the tests do. */
  jumpTo(index: number): void;
}

export function createSim(): EchoSim {
  let level = LEVELS[0];
  let walls = solidWalls(level);
  const guardTmp: [number, number] = [0, 0];

  const sim: EchoSim = {
    phase: "run",
    hold: 0,
    level: 0,
    loop: 0,
    score: 0,
    px: level.spawn[0],
    py: level.spawn[1],
    vx: 0,
    vy: 0,
    prevX: level.spawn[0],
    prevY: level.spawn[1],
    clock: level.time,
    tick: 0,
    ghosts: [],
    recording: new Float32Array(runSteps(level) * 2),
    guards: new Float32Array(level.patrols.length * 2),
    held: {},
    doorSolid: [],
    event: "none",
    onPlate: false,
    outcome: null,
    step: stepSim,
    jumpTo: loadLevel,
  };

  /** Put the runner at the spawn and the clock at the top. Ghosts stay. */
  function beginRun() {
    sim.px = sim.prevX = level.spawn[0];
    sim.py = sim.prevY = level.spawn[1];
    sim.vx = sim.vy = 0;
    sim.clock = level.time;
    sim.tick = 0;
    sim.recording = new Float32Array(runSteps(level) * 2);
    sim.phase = "run";
    placeGuards();
    resolveDoors();
  }

  function loadLevel(index: number) {
    sim.level = index;
    level = LEVELS[index];
    walls = solidWalls(level);
    sim.loop = 0;
    sim.ghosts = [];
    sim.guards = new Float32Array(level.patrols.length * 2);
    beginRun();
  }

  function placeGuards() {
    const t = sim.tick / 60;
    for (let i = 0; i < level.patrols.length; i++) {
      const p = level.patrols[i];
      guardAt(p.path, p.speed, t, guardTmp);
      sim.guards[i * 2] = guardTmp[0];
      sim.guards[i * 2 + 1] = guardTmp[1];
    }
  }

  /** Plates held by the runner or any ghost this step, and the doors from them. */
  function resolveDoors(): boolean {
    let changed = false;
    sim.onPlate = false;
    for (const plate of level.plates) {
      let held = onCircle(sim.px, sim.py, T.PLAYER_R, plate.x, plate.y, plate.r);
      if (held) sim.onPlate = true;
      if (!held) {
        for (const g of sim.ghosts) {
          if (sim.tick >= g.steps) continue;
          const gx = g.path[sim.tick * 2];
          const gy = g.path[sim.tick * 2 + 1];
          if (onCircle(gx, gy, T.PLAYER_R, plate.x, plate.y, plate.r)) {
            held = true;
            break;
          }
        }
      }
      if (sim.held[plate.id] !== held) changed = true;
      sim.held[plate.id] = held;
    }
    for (let i = 0; i < level.doors.length; i++) {
      const d = level.doors[i];
      const held = sim.held[d.plate] === true;
      sim.doorSolid[i] = d.inverted ? held : !held;
    }
    return changed;
  }

  /** Solid doors this step that the runner is not already inside. */
  const doorBlocks: boolean[] = [];

  /** Move by (dx, dy) against the walls and the closed doors, one axis at a time. */
  function move(dx: number, dy: number) {
    const r = T.PLAYER_R;
    // A door that has just closed on the runner is not solid to it: the
    // runner walks out rather than being crushed or pinned by its own ghost.
    for (let i = 0; i < level.doors.length; i++) {
      doorBlocks[i] = sim.doorSolid[i] && !overlaps(sim.px, sim.py, r, level.doors[i]);
    }

    sim.px += dx;
    for (const w of walls) {
      if (!overlaps(sim.px, sim.py, r, w)) continue;
      sim.px = dx > 0 ? w.x - r : w.x + w.w + r;
      sim.vx = 0;
    }
    for (let i = 0; i < level.doors.length; i++) {
      const d = level.doors[i];
      if (!doorBlocks[i] || !overlaps(sim.px, sim.py, r, d)) continue;
      sim.px = dx > 0 ? d.x - r : d.x + d.w + r;
      sim.vx = 0;
    }
    sim.py += dy;
    for (const w of walls) {
      if (!overlaps(sim.px, sim.py, r, w)) continue;
      sim.py = dy > 0 ? w.y - r : w.y + w.h + r;
      sim.vy = 0;
    }
    for (let i = 0; i < level.doors.length; i++) {
      const d = level.doors[i];
      if (!doorBlocks[i] || !overlaps(sim.px, sim.py, r, d)) continue;
      sim.py = dy > 0 ? d.y - r : d.y + d.h + r;
      sim.vy = 0;
    }
  }

  /** The run is over. It becomes a ghost, or the level is cleared. */
  function endRun(how: "caught" | "timeout") {
    sim.event = how;
    const ghost: Ghost = { path: sim.recording, steps: sim.tick };
    sim.ghosts.push(ghost);
    if (sim.ghosts.length > level.loops) {
      sim.phase = "lost";
      sim.hold = T.LOST_STEPS;
      sim.event = "lost";
      sim.outcome = "lost";
      return;
    }
    sim.loop = sim.ghosts.length;
    sim.phase = "reset";
    sim.hold = T.RESET_STEPS;
  }

  function clearLevel() {
    const spare = level.loops - sim.ghosts.length;
    sim.score += T.LEVEL_POINTS + spare * T.SPARE_LOOP_POINTS + Math.floor(sim.clock) * T.TIME_POINTS;
    sim.event = "exit";
    sim.phase = "clear";
    sim.hold = T.CLEAR_STEPS;
  }

  function stepSim(dt: number, input: SimInput) {
    sim.event = "none";
    sim.prevX = sim.px;
    sim.prevY = sim.py;

    if (sim.phase === "done") return;

    if (sim.phase !== "run") {
      if (--sim.hold > 0) return;
      if (sim.phase === "reset") {
        beginRun();
      } else if (sim.phase === "clear") {
        if (sim.level + 1 >= LEVELS.length) {
          sim.phase = "done";
          sim.event = "won";
          sim.outcome = "won";
        } else {
          loadLevel(sim.level + 1);
          sim.event = "level";
        }
      } else if (sim.phase === "lost") {
        sim.phase = "done";
      }
      return;
    }

    // Record first, so step 0 of every recording is the spawn and a ghost
    // and the live runner share an index exactly.
    sim.recording[sim.tick * 2] = sim.px;
    sim.recording[sim.tick * 2 + 1] = sim.py;

    // Input, eased. The ease is short — it is there so a tap of the key is a
    // nudge rather than a full-speed step, not to make the runner heavy.
    let ax = input.ax;
    let ay = input.ay;
    const len = Math.hypot(ax, ay);
    if (len > 1) {
      ax /= len;
      ay /= len;
    }
    const k = Math.min(1, dt / T.ACCEL);
    sim.vx += (ax * T.SPEED - sim.vx) * k;
    sim.vy += (ay * T.SPEED - sim.vy) * k;
    move(sim.vx * dt, sim.vy * dt);

    sim.tick++;
    sim.clock -= dt;
    placeGuards();

    const doorsChanged = resolveDoors();
    if (doorsChanged) sim.event = "door";

    // The exit: cleared, whatever else is true this step.
    if (overlaps(sim.px, sim.py, T.PLAYER_R * 0.5, level.exit)) {
      clearLevel();
      return;
    }

    // A guard.
    for (let i = 0; i < level.patrols.length; i++) {
      const p = level.patrols[i];
      if (onCircle(sim.px, sim.py, T.PLAYER_R, sim.guards[i * 2], sim.guards[i * 2 + 1], p.r)) {
        endRun("caught");
        return;
      }
    }

    // The clock.
    if (sim.clock <= 0 || sim.tick >= runSteps(level) - 1) {
      sim.clock = 0;
      endRun("timeout");
    }
  }

  loadLevel(0);
  return sim;
}
