import * as T from "./tuning";
import * as R from "./ragdoll";
import { surfaceBelow } from "./arena";
import type { Difficulty, Match } from "./match";

/**
 * The CPU: a small state machine that produces the same `FighterInput` a
 * thumb does.
 *
 * ── Difficulty is timing and accuracy, never stats ───────────────────────
 *
 * Every tier plays by the rules the player plays by — same health, same
 * stamina, same arm. What separates them is what a person watching can see:
 *
 *  - **Reaction.** The CPU sees you as you were `reaction` seconds ago. It
 *    is a ring buffer of snapshots, not a timer on its decisions, so Easy
 *    swings at where you *were* and Hard at where you are.
 *  - **Cadence.** How often it re-plans. A slow planner commits to walking
 *    in long after it should have stopped.
 *  - **Aim.** Gaussian error on the swing's angle, in radians.
 *  - **Reading.** Whether it notices your wind-up and backs off, and whether
 *    it knows the lava's beat. Easy knows neither: it sees where the lava IS,
 *    never where it is about to be, and will stand on the low bridge as it
 *    goes under — which is a thing a player can learn to use, and that is
 *    the point of it.
 *
 * Every tier knows how to cross a gap. A CPU that walked into the lava on
 * its way to you would be losing to the arena, not to you, and a tier that
 * reads as broken is worse than one that reads as bad.
 *
 * `ai.test.ts` holds the tiers in order by playing them against each other.
 */

export interface AiProfile {
  /** Seconds of delay on everything it knows about you. */
  readonly reaction: number;
  /** Seconds between decisions. */
  readonly cadence: number;
  /** Standard deviation of the swing angle, radians. */
  readonly aimSigma: number;
  /** Chance a decision in range is a heavy rather than a quick swing. */
  readonly heavy: number;
  /** Chance it backs off from a wind-up it can see. */
  readonly guard: number;
  /** Knows the lava's beat, and gets off the low ground before it rises. */
  readonly hazard: boolean;
  /** Will not back away onto ground that needs a jump to reach. */
  readonly edges: boolean;
  /** Chance a swing aims at the head rather than the chest. */
  readonly headshots: number;
  /** Seconds the arm is held back before a quick swing comes through. */
  readonly windBack: number;
}

export const PROFILES: Record<Difficulty, AiProfile> = {
  easy: {
    reaction: 0.5,
    cadence: 0.45,
    aimSigma: 0.55,
    heavy: 0.06,
    guard: 0,
    hazard: false,
    edges: false,
    headshots: 0.1,
    windBack: 0.3,
  },
  medium: {
    reaction: 0.27,
    cadence: 0.25,
    aimSigma: 0.28,
    heavy: 0.18,
    guard: 0.35,
    hazard: true,
    edges: true,
    headshots: 0.3,
    windBack: 0.2,
  },
  hard: {
    reaction: 0.12,
    cadence: 0.12,
    aimSigma: 0.1,
    heavy: 0.28,
    guard: 0.8,
    hazard: true,
    edges: true,
    headshots: 0.55,
    windBack: 0.15,
  },
};

/** What it remembers of you, one entry per step. */
interface Seen {
  x: number;
  hx: number;
  hy: number;
  cy: number;
  windup: number;
  ko: boolean;
  /** The lava has shown its tell, or is up. */
  lavaComing: boolean;
}

type Plan =
  | { kind: "idle" }
  | { kind: "approach"; dir: number }
  | { kind: "retreat"; dir: number }
  | { kind: "evade"; dir: number }
  | { kind: "swing"; a0: number; a1: number; wind: number; through: number }
  | { kind: "charge"; hold: number; aim: number };

const HISTORY = 64;
const DT = 1 / 60;
const FOLLOW = 0.16;
/** How far ahead of the pelvis it looks for ground, and how far a jump carries. */
const LOOK = 30 * T.S;
const JUMP_NEAR = 50 * T.S;
const JUMP_FAR = 230 * T.S;
/**
 * Drops and climbs a jump can make, from the feet. The drop is generous: down
 * is never the problem, only where you land. At 90 a CPU that had been
 * carried up onto the high bridge found the banks 96 px below it out of
 * bounds, and stood on the lip for the rest of the round.
 */
const DROP_MAX = 240;
const CLIMB_MAX = 95;
/** How much ground either side it wants under it before it swings. */
const FOOTING = 16 * T.S;
/** A landing this close to the other robot is theirs. */
const OCCUPIED = 60 * T.S;

export interface Ai {
  /** One step of input. Call exactly once per match step, before it. */
  input(m: Match): R.FighterInput;
}

export function createAi(profile: AiProfile, self: 0 | 1, rng: () => number): Ai {
  const seen: Seen[] = Array.from({ length: HISTORY }, () => ({
    x: 0, hx: 0, hy: 0, cy: 0, windup: 0, ko: false, lavaComing: false,
  }));
  let head = 0;
  let filled = 0;
  let plan: Plan = { kind: "idle" };
  let planT = 0;
  let nextThink = 0;
  const out: R.FighterInput = { x: 0, y: 0, jump: false, heavy: false };
  const lag = Math.min(HISTORY - 1, Math.round(profile.reaction / DT));

  const gauss = () => {
    // Box-Muller, off the seeded stream.
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  function remember(m: Match) {
    const o = m.fighters[1 - self];
    const s = seen[head];
    s.x = o.x[R.PELVIS];
    s.hx = o.x[R.HEAD];
    s.hy = o.y[R.HEAD];
    s.cy = (o.y[R.NECK] + o.y[R.PELVIS]) / 2;
    s.windup = o.windup;
    s.ko = o.ko;
    s.lavaComing = m.lava.phase === "tell" || m.lava.phase === "rise" || m.lava.phase === "hold";
    head = (head + 1) % HISTORY;
    filled = Math.min(HISTORY, filled + 1);
  }

  /** You, `lag` steps ago — or as long ago as it has been watching. */
  const view = (): Seen => seen[(head - 1 - Math.min(lag, filled - 1) + HISTORY * 2) % HISTORY];

  function decide(m: Match) {
    const me = m.fighters[self];
    const v = view();
    const mx = me.x[R.PELVIS];
    const dir = v.x > mx ? 1 : -1;
    const dist = Math.abs(v.x - mx);
    const feet = me.y[R.PELVIS] + T.STAND_H;
    const safe = safeLine(m, v.lavaComing);
    const here = surfaceBelow(m.solids(), mx, feet - 6);
    // Backing off means walking away from you; cornered is when that needs a jump.
    const behind = surfaceBelow(m.solids(), mx - dir * LOOK * 2, feet - 6);
    const cornered = profile.edges && !(behind < safe && Math.abs(behind - feet) < 20);

    // The lava's beat: off anything it is about to cover, toward the stone.
    if (profile.hazard && v.lavaComing && here >= m.arena.lava.peakY - 4) {
      return set({ kind: "evade", dir: mx < T.VIEW_W / 2 ? -1 : 1 });
    }

    // Footing: a swing on the lip of a platform is a swing that its own
    // recoil can carry over the edge. Take a step in first.
    if (profile.edges && me.support) {
      const solids = m.solids();
      const fore = surfaceBelow(solids, mx + dir * FOOTING, feet - 6);
      const aft = surfaceBelow(solids, mx - dir * FOOTING, feet - 6);
      const firm = (g: number) => g < safe && Math.abs(g - feet) < 12;
      if (!firm(fore) && firm(aft)) return set({ kind: "evade", dir: -dir });
      if (firm(fore) && !firm(aft)) return set({ kind: "evade", dir });
    }

    // A wind-up you can see coming: give it room, unless there is none.
    if (v.windup > 0.12 && dist < 150 && !cornered && rng() < profile.guard) {
      return set({ kind: "retreat", dir: -dir });
    }

    const ideal = T.ARM_REACH * 0.9 + me.weapon.length * 0.7;
    if (dist > ideal + 22) return set({ kind: "approach", dir });

    if (me.tired || me.stamina < 20) {
      return set(cornered ? { kind: "idle" } : { kind: "retreat", dir: -dir });
    }

    if (me.stamina > T.HEAVY_MIN_STAMINA + 10 && rng() < profile.heavy) {
      const aim = Math.atan2(v.cy - me.y[R.NECK], v.x - me.x[R.NECK]);
      return set({ kind: "charge", hold: 0.25 + rng() * 0.35, aim });
    }

    // A quick swing through where it thinks you are.
    const head = rng() < profile.headshots;
    const tx = head ? v.hx : v.x;
    const ty = head ? v.hy : v.cy;
    const theta = Math.atan2(ty - me.y[R.NECK], tx - me.x[R.NECK]) + gauss() * profile.aimSigma;
    const f = me.facing;
    const overhead = rng() < 0.6;
    const a0 = overhead ? theta - f * 1.9 : theta + f * 1.6;
    const a1 = overhead ? theta + f * 1.0 : theta - f * 1.1;
    return set({ kind: "swing", a0, a1, wind: profile.windBack, through: FOLLOW });
  }

  function set(p: Plan) {
    plan = p;
    planT = 0;
  }

  /**
   * Anything whose top is below this is somewhere it will not stand. For a
   * CPU that knows the beat, that is the lava's peak once the tell has
   * shown; for one that does not, it is where the lava is now.
   */
  function safeLine(m: Match, coming: boolean): number {
    return (profile.hazard && coming ? m.arena.lava.peakY : m.lava.y) - 4;
  }

  /**
   * Walk `dir`, and never into the lava. Ground ahead: walk. Higher ground
   * within a jump: jump up to it. A gap with a landing past it: jump it. A
   * gap with nothing: stop at the edge.
   */
  function walk(m: Match, dir: number) {
    const me = m.fighters[self];
    out.x = dir;
    // In the air from its own jump: keep carrying. Anywhere else off the
    // ground — a foot slipping over the lip — is judged like standing, or
    // the flicker of support at an edge walks it straight off.
    if (!me.support && me.airT < 1) return;
    const solids = m.solids();
    const px = me.x[R.PELVIS];
    const feet = me.y[R.PELVIS] + T.STAND_H;
    const safe = safeLine(m, view().lavaComing);
    // The highest surface a jump can reach, per column. Asking for the
    // highest surface outright finds the bridge overhead and misses the one
    // at your feet.
    const top = feet - CLIMB_MAX + 4;
    const ahead = surfaceBelow(solids, px + dir * LOOK, top);
    if (ahead < safe && Math.abs(ahead - feet) < 10) return;
    if (ahead < safe && ahead < feet - 10) {
      out.jump = true;
      return;
    }
    const them = view().x;
    for (let d = JUMP_NEAR; d <= JUMP_FAR; d += 12) {
      const land = surfaceBelow(solids, px + dir * d, top);
      if (land < safe && land < feet + DROP_MAX) {
        // Not onto somebody. Jumping a gap at a robot standing on its far
        // lip is a collision in mid-air over the lava, and the one in the
        // air loses it: hold the edge and swing across instead.
        if (Math.abs(px + dir * d - them) < OCCUPIED) break;
        out.jump = true;
        return;
      }
    }
    out.x = 0;
  }

  /** Swings and charges finish before anything else is considered. */
  const committed = () =>
    (plan.kind === "swing" && planT < plan.wind + plan.through) ||
    (plan.kind === "charge" && planT < plan.hold + T.HEAVY_SWING_T);

  return {
    input(m) {
      remember(m);
      out.x = 0;
      out.y = 0;
      out.jump = false;
      out.heavy = false;
      const me = m.fighters[self];
      if (m.phase !== "fight" || me.ko || view().ko) {
        plan = { kind: "idle" };
        return out;
      }

      planT += DT;
      nextThink -= DT;
      // No change of mind in the air. A jump is a commitment: a CPU that
      // leapt for a platform and re-planned into a swing on the way up
      // stopped steering and fell into the gap it was jumping.
      const airborne = !me.support && (plan.kind === "approach" || plan.kind === "evade" || plan.kind === "retreat");
      if (nextThink <= 0 && !committed() && !airborne) {
        nextThink = profile.cadence;
        decide(m);
      }

      switch (plan.kind) {
        case "approach":
          walk(m, plan.dir);
          out.y = -0.1;
          break;
        case "retreat":
          walk(m, plan.dir);
          out.x *= 0.8;
          out.y = 0.6;
          break;
        case "evade":
          walk(m, plan.dir);
          break;
        case "swing": {
          // A part push, scaled so its sideways part stays under the walk
          // threshold: the arm aims along the angle and the feet stay put.
          // The same thing a player does with half a push of the stick.
          const a = planT < plan.wind ? plan.a0 : plan.a1;
          const c = Math.abs(Math.cos(a));
          const k = Math.min(1, T.WALK_DEAD / Math.max(c, 1e-6));
          out.x = Math.cos(a) * k;
          out.y = Math.sin(a) * k;
          break;
        }
        case "charge":
          out.heavy = planT < plan.hold;
          out.x = Math.cos(plan.aim) * 0.3;
          out.y = Math.sin(plan.aim) * 0.3;
          break;
        case "idle":
          break;
      }
      return out;
    },
  };
}
