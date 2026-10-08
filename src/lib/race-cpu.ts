import { BX, BZ, CORNER, HALF_WIDTH } from "./race-track";
import type { PartTuple } from "./worlddoc-core";

/**
 * CPU riders: Easy, Medium and Hard.
 *
 * Not physics bikes. A CPU rides the track's centreline by distance — every
 * race track shares one rounded-box footprint (`race-track.ts`), so the line
 * is the same maths for all of them — holding a lane, easing off before each
 * corner and riding up the terrain it is over. It reports a pose exactly like
 * a person's bike reports one, so the race rules count its laps and the
 * renderer draws it with the same model as everyone else.
 *
 * The host rider's browser runs them (`lib/net/race.ts`), and they are
 * deterministic for a seed, so `race-cpu.test.ts` can time their laps.
 *
 * ── How the three differ ─────────────────────────────────────────────────
 *
 * A person's bike tops out at 18 u/s and 26 on boost (`Bike.tsx`). Easy
 * cruises well under that and brakes hard for corners; Medium sits a little
 * under full throttle; Hard holds full throttle, carries speed through the
 * corners and boosts on the straights — beatable, but only by somebody who
 * drifts to fill the boost meter and spends it.
 */

export type CpuDifficulty = "easy" | "medium" | "hard";

export const CPU_DIFFICULTIES: readonly CpuDifficulty[] = ["easy", "medium", "hard"];

export const isCpuDifficulty = (v: unknown): v is CpuDifficulty =>
  v === "easy" || v === "medium" || v === "hard";

interface Profile {
  /** Speed down a straight, u/s. */
  cruise: number;
  /** Fraction of `cruise` held through a corner. */
  corner: number;
  /** u/s². */
  accel: number;
  /** Top speed on a straight's boost, or 0 for none. */
  boost: number;
  /** How much a rider's pace wanders, so a pack does not move as one. */
  wander: number;
}

export const CPU_PROFILES: Record<CpuDifficulty, Profile> = {
  easy: { cruise: 12.5, corner: 0.78, accel: 5, boost: 0, wander: 0.05 },
  medium: { cruise: 15.5, corner: 0.86, accel: 6.5, boost: 0, wander: 0.04 },
  hard: { cruise: 18, corner: 0.94, accel: 8.5, boost: 22.5, wander: 0.03 },
};

// ── The centreline ───────────────────────────────────────────────────────

interface Sample {
  x: number;
  z: number;
  dx: number;
  dz: number;
  corner: boolean;
}

const STEP = 0.5;
const samples: Sample[] = [];

/**
 * Walk the loop once, starting on the start line (x = 0 on the top straight)
 * and heading +x, the way the grid faces (`GRID_YAW`). Straights and
 * quarter-circles, clockwise seen from above with +z up the page.
 */
(function buildLine() {
  const Z = BZ + CORNER;
  const X = BX + CORNER;
  const straight = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    for (let d = 0; d < len; d += STEP) samples.push({ x: x0 + dx * d, z: z0 + dz * d, dx, dz, corner: false });
  };
  const arc = (cx: number, cz: number, from: number) => {
    // `from` is the angle of the first point, measured as atan2(x, z) about
    // the centre; the arc turns a quarter clockwise (angle increasing).
    const len = (Math.PI / 2) * CORNER;
    for (let d = 0; d < len; d += STEP) {
      const a = from + d / CORNER;
      samples.push({
        x: cx + Math.sin(a) * CORNER,
        z: cz + Math.cos(a) * CORNER,
        dx: Math.cos(a),
        dz: -Math.sin(a),
        corner: true,
      });
    }
  };
  straight(0, Z, BX, Z);
  arc(BX, BZ, 0);
  straight(X, BZ, X, -BZ);
  arc(BX, -BZ, Math.PI / 2);
  straight(BX, -Z, -BX, -Z);
  arc(-BX, -BZ, Math.PI);
  straight(-X, -BZ, -X, BZ);
  arc(-BX, BZ, (3 * Math.PI) / 2);
  straight(-BX, Z, 0, Z);
})();

export const LAP_LENGTH = samples.length * STEP;

const wrap = (s: number) => ((s % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;

/** The centreline at distance `s` from the start line. */
export function lineAt(s: number): Sample {
  return samples[Math.floor(wrap(s) / STEP) % samples.length];
}

/** Distance along the line of the point nearest (x, z). */
export function distanceAt(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best * STEP;
}

// ── The ground ───────────────────────────────────────────────────────────

/** How high a bike's reported y sits above the surface it rides on (`GRID_SLOTS`). */
export const RIDE_HEIGHT = 0.35;

export type HeightAt = (x: number, z: number, nearY: number) => number;

/**
 * The surface under (x, z), read off the track's own blocks. Of the surfaces
 * in that column, the highest one a bike at `nearY` could be riding on — so an
 * arch over the track is not mistaken for the road.
 */
export function heightMap(parts: readonly PartTuple[]): HeightAt {
  const tops = new Map<string, number[]>();
  for (const p of parts) {
    const key = `${p[0]},${p[2]}`;
    // A full block's top is its cell's top; a slab, ramp or wedge rides at
    // about half, which is close enough for a line nobody is steering.
    const top = p[1] + (p[3] === 0 ? 1 : 0.5);
    const list = tops.get(key);
    if (list) list.push(top);
    else tops.set(key, [top]);
  }
  return (x, z, nearY) => {
    const list = tops.get(`${Math.floor(x)},${Math.floor(z)}`);
    if (!list || list.length === 0) return nearY;
    const ground = nearY - RIDE_HEIGHT;
    let best = -Infinity;
    for (const t of list) if (t <= ground + 1.2 && t > best) best = t;
    if (best === -Infinity) best = Math.min(...list);
    return best + RIDE_HEIGHT;
  };
}

// ── A rider ──────────────────────────────────────────────────────────────

export interface CpuPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface CpuRider {
  readonly difficulty: CpuDifficulty;
  /** Line it up on a grid slot. */
  place(pose: { x: number; y: number; z: number }): void;
  /** One step. Stationary unless `racing`. */
  step(dt: number, racing: boolean): CpuPose;
  readonly speed: number;
}

/** How far ahead a rider looks for a corner to brake for. */
const LOOKAHEAD = 10;
/** The widest lane a rider holds, short of the rails. */
const MAX_LANE = HALF_WIDTH - 1.4;

export function createCpuRider(difficulty: CpuDifficulty, rng: () => number, heightAt?: HeightAt): CpuRider {
  const pr = CPU_PROFILES[difficulty];
  let s = 0;
  let v = 0;
  let lane = 0;
  let laneTarget = 0;
  let laneT = 0;
  let y = 1.35;
  let t = rng() * 100;
  const phase = rng() * Math.PI * 2;

  const pose = (): CpuPose => {
    const p = lineAt(s);
    // Right of the direction of travel is (-dz, dx) seen from above.
    const x = p.x - p.dz * lane;
    const z = p.z + p.dx * lane;
    if (heightAt) {
      const want = heightAt(x, z, y);
      y += (want - y) * 0.25;
    }
    return { x, y, z, yaw: Math.atan2(p.dx, p.dz) };
  };

  return {
    difficulty,
    get speed() {
      return v;
    },
    place(g) {
      s = distanceAt(g.x, g.z);
      const p = lineAt(s);
      // How far right of the line the slot is: the offset dotted with (-dz, dx).
      lane = (g.x - p.x) * -p.dz + (g.z - p.z) * p.dx;
      laneTarget = lane;
      y = g.y;
      v = 0;
    },
    step(dt, racing) {
      if (!racing) {
        v = 0;
        return pose();
      }
      t += dt;
      // Brake for what is coming, not for what it is in.
      const ahead = lineAt(s + LOOKAHEAD).corner || lineAt(s).corner;
      const wander = 1 + pr.wander * Math.sin(t * 0.7 + phase);
      const straightTop = pr.boost > 0 && !ahead && !lineAt(s + LOOKAHEAD * 2).corner ? pr.boost : pr.cruise;
      const target = (ahead ? pr.cruise * pr.corner : straightTop) * wander;
      v = v < target ? Math.min(target, v + pr.accel * dt) : Math.max(target, v - pr.accel * 1.6 * dt);
      s = wrap(s + v * dt);

      // Drift between lanes now and then, so riders pass rather than queue.
      laneT -= dt;
      if (laneT <= 0) {
        laneTarget = (rng() * 2 - 1) * MAX_LANE * 0.7;
        laneT = 2 + rng() * 3;
      }
      lane += Math.sign(laneTarget - lane) * Math.min(Math.abs(laneTarget - lane), 1.2 * dt);
      lane = Math.max(-MAX_LANE, Math.min(MAX_LANE, lane));
      return pose();
    },
  };
}

/** The name a CPU rider goes by on the board: plainly a CPU, and which kind. */
export function cpuName(i: number, difficulty: CpuDifficulty): string {
  const names = ["Volt", "Nitro", "Comet"];
  const tag = difficulty === "easy" ? "Easy" : difficulty === "medium" ? "Medium" : "Hard";
  return `${names[i % names.length]} · CPU ${tag}`;
}
