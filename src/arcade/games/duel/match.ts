import * as T from "./tuning";
import { MAGMA, moverAt, type Arena, type Rect } from "./arena";
import * as R from "./ragdoll";
import { resolveCombat, separate, type CombatEvent } from "./combat";

/**
 * A best-of-three: two fighters, the arena, the lava, and the rounds.
 *
 * Pure and seeded, like every cabinet's sim. It takes two `FighterInput`s a
 * step and does not know or care whether a thumb, a keyboard or the CPU made
 * them — which is what lets `ai.test.ts` play hundreds of rounds headless, and
 * what makes "two players on one phone" no more code than one.
 *
 * ── The lava is the arena's beat ─────────────────────────────────────────
 *
 * Every `lava.beat` seconds the lava shows a tell, and `lava.tell` later it
 * rises far enough to swallow the low bridge. Anybody with their body under
 * the surface is out, whatever their health — and so is anybody knocked off
 * the stone into it at any time. Rhythmic and telegraphed on purpose: a
 * hazard you can read is spacing — hold the bridge until the last second,
 * knock somebody back onto it as it goes under — and a hazard you cannot
 * read is a coin toss that ends rounds.
 */

export type Phase = "intro" | "fight" | "ko" | "over";
export type EndCause = "ko" | "lava" | "time" | "draw";
export type LavaPhase = "idle" | "tell" | "rise" | "hold" | "fall";

export type MatchEvent =
  | R.RagdollEvent
  | CombatEvent
  | { type: "round"; round: number; weapon: string }
  | { type: "fight" }
  | { type: "roundEnd"; winner: 0 | 1 | null; cause: EndCause }
  | { type: "matchEnd"; winner: 0 | 1 | null }
  | { type: "lavaTell" }
  | { type: "lavaRise" }
  | { type: "burn"; fighter: 0 | 1; x: number };

export interface Lava {
  phase: LavaPhase;
  /** Seconds into the current phase. */
  t: number;
  /** Seconds until the next tell, while idle. */
  next: number;
  /** The surface. */
  y: number;
}

/** The body parts that burn. A weapon tip dipped in the lava is not a death. */
const BODY_PARTS = [R.HEAD, R.NECK, R.PELVIS, R.KNEE_L, R.KNEE_R, R.FOOT_L, R.FOOT_R] as const;

export interface Match {
  readonly arena: Arena;
  readonly fighters: readonly [R.Fighter, R.Fighter];
  phase: Phase;
  phaseT: number;
  round: number;
  readonly wins: [number, number];
  /** Seconds left in the round. */
  clock: number;
  readonly lava: Lava;
  /** Where each moving platform is this step. */
  readonly movers: readonly Rect[];
  /** Seconds since the round began, which is what moves the movers. */
  roundT: number;
  /** Everything that happened in the last step. Cleared at the start of each. */
  readonly events: MatchEvent[];
  roundWinner: 0 | 1 | null;
  cause: EndCause | null;
  /** The match result, once `phase` is "over". */
  winner: 0 | 1 | null;
  /** Damage each fighter has dealt across the match. */
  readonly dealt: [number, number];
  step(dt: number, a: R.FighterInput, b: R.FighterInput): void;
  /** The solids this step: the arena's, with the movers where they are. */
  solids(): readonly Rect[];
}

export interface MatchOptions {
  arena?: Arena;
  roundTime?: number;
}

const NEUTRAL: R.FighterInput = { x: 0, y: 0, jump: false, heavy: false };

export function createMatch(rng: () => number, opts: MatchOptions = {}): Match {
  const arena = opts.arena ?? MAGMA;
  const roundTime = opts.roundTime ?? T.ROUND_TIME;
  const fighters: [R.Fighter, R.Fighter] = [
    R.createFighter(0, T.WEAPONS[0]),
    R.createFighter(1, T.WEAPONS[0]),
  ];
  const movers: Rect[] = arena.movers.map((d) => moverAt(d, 0, { x0: 0, y0: 0, x1: 0, y1: 0 }));
  const solids: Rect[] = [...movers, ...arena.solids];
  const L = arena.lava;
  const lava: Lava = { phase: "idle", t: 0, next: L.first, y: L.restY };

  const m: Match = {
    arena,
    fighters,
    phase: "intro",
    phaseT: 0,
    round: 0,
    wins: [0, 0],
    clock: roundTime,
    lava,
    movers,
    roundT: 0,
    events: [],
    roundWinner: null,
    cause: null,
    winner: null,
    dealt: [0, 0],
    step,
    solids: () => solids,
  };

  function startRound() {
    m.round += 1;
    const weapon = T.WEAPONS[Math.floor(rng() * T.WEAPONS.length) % T.WEAPONS.length];
    R.resetFighter(fighters[0], weapon, arena.spawn[0], arena.spawnGround, 1);
    R.resetFighter(fighters[1], weapon, arena.spawn[1], arena.spawnGround, -1);
    lava.phase = "idle";
    lava.t = 0;
    lava.next = L.first;
    lava.y = L.restY;
    m.roundT = 0;
    placeMovers();
    m.clock = roundTime;
    m.phase = "intro";
    m.phaseT = 0;
    m.roundWinner = null;
    m.cause = null;
    m.events.push({ type: "round", round: m.round, weapon: weapon.id });
  }

  function placeMovers() {
    arena.movers.forEach((d, i) => moverAt(d, m.roundT, movers[i]));
  }

  const ease = (k: number) => k * k * (3 - 2 * k);

  function stepLava(dt: number) {
    lava.t += dt;
    switch (lava.phase) {
      case "idle":
        lava.next -= dt;
        if (lava.next <= 0) {
          lava.phase = "tell";
          lava.t = 0;
          m.events.push({ type: "lavaTell" });
        }
        break;
      case "tell":
        if (lava.t >= L.tell) {
          lava.phase = "rise";
          lava.t = 0;
          m.events.push({ type: "lavaRise" });
        }
        break;
      case "rise":
        lava.y = L.restY + (L.peakY - L.restY) * ease(Math.min(1, lava.t / L.rise));
        if (lava.t >= L.rise) {
          lava.phase = "hold";
          lava.t = 0;
        }
        break;
      case "hold":
        if (lava.t >= L.hold) {
          lava.phase = "fall";
          lava.t = 0;
        }
        break;
      case "fall":
        lava.y = L.peakY + (L.restY - L.peakY) * ease(Math.min(1, lava.t / L.fall));
        if (lava.t >= L.fall) {
          lava.phase = "idle";
          lava.t = 0;
          lava.y = L.restY;
          lava.next = L.beat - L.tell - L.rise - L.hold - L.fall;
        }
        break;
    }
  }

  /** Anybody in the lava is out; anybody out is sinking. */
  function burn() {
    for (const f of fighters) {
      const under = BODY_PARTS.some((i) => f.y[i] > lava.y);
      if (!under) continue;
      if (!f.ko && m.phase === "fight") {
        R.knockOut(f);
        m.cause = "lava";
        m.events.push({ type: "burn", fighter: f.id, x: f.x[R.PELVIS] });
      }
      // Thick: whatever is in it slows to a sink.
      for (let i = 0; i < R.N; i++) {
        if (f.y[i] <= lava.y) continue;
        f.vx[i] *= 0.8;
        f.vy[i] = Math.min(f.vy[i] * 0.8, T.LAVA_SINK) + T.LAVA_SINK * 0.2;
      }
    }
  }

  function physics(dt: number, a: R.FighterInput, b: R.FighterInput) {
    const [f0, f1] = fighters;
    // Face each other, except mid-swing: turning round halfway through a
    // chop would throw it backwards.
    for (const [f, o] of [
      [f0, f1],
      [f1, f0],
    ] as const) {
      if (f.ko || f.swing > 0 || f.windup > 0) continue;
      const d = o.x[R.PELVIS] - f.x[R.PELVIS];
      if (Math.abs(d) > 4) f.facing = d > 0 ? 1 : -1;
    }
    R.think(f0, a, dt, m.events as R.RagdollEvent[]);
    R.think(f1, b, dt, m.events as R.RagdollEvent[]);

    const h = dt / T.SUBSTEPS;
    const fight = m.phase === "fight";
    for (let s = 0; s < T.SUBSTEPS; s++) {
      R.applyForces(f0, a, solids, h);
      R.applyForces(f1, b, solids, h);
      R.integrate(f0, h);
      R.integrate(f1, h);
      for (let k = 0; k < T.ITERATIONS; k++) {
        R.solve(f0, solids);
        R.solve(f1, solids);
        separate(f0, f1);
      }
      R.finish(f0, h);
      R.finish(f1, h);
      if (fight) resolveCombat(f0, f1, m.events as CombatEvent[]);
    }
  }

  function endRound(winner: 0 | 1 | null, cause: EndCause) {
    m.phase = "ko";
    m.phaseT = 0;
    m.roundWinner = winner;
    m.cause = cause;
    if (winner !== null) m.wins[winner] += 1;
    m.events.push({ type: "roundEnd", winner, cause });
  }

  function step(dt: number, a: R.FighterInput, b: R.FighterInput) {
    m.events.length = 0;
    if (m.round === 0) startRound();
    m.phaseT += dt;

    const live = m.phase === "fight";
    m.roundT += dt;
    placeMovers();
    // Before the bell, and after the match, nobody moves. After a KO the
    // winner keeps control: a lap of honour is free and nobody gets hurt.
    const ia = live || (m.phase === "ko" && m.roundWinner === 0) ? a : NEUTRAL;
    const ib = live || (m.phase === "ko" && m.roundWinner === 1) ? b : NEUTRAL;
    if (live) stepLava(dt);
    physics(dt, ia, ib);
    burn();

    for (const e of m.events) {
      if (e.type === "hit") m.dealt[e.attacker] += e.dmg;
    }

    if (m.phase === "intro") {
      if (m.phaseT >= T.INTRO_TIME) {
        m.phase = "fight";
        m.phaseT = 0;
        m.events.push({ type: "fight" });
      }
      return;
    }

    if (m.phase === "fight") {
      m.clock = Math.max(0, m.clock - dt);
      const [f0, f1] = fighters;
      if (f0.ko || f1.ko) {
        const winner = f0.ko && f1.ko ? null : f0.ko ? 1 : 0;
        endRound(winner, winner === null ? "draw" : (m.cause ?? "ko"));
      } else if (m.clock === 0) {
        const d = f0.hp - f1.hp;
        endRound(Math.abs(d) < 0.5 ? null : d > 0 ? 0 : 1, "time");
      }
      return;
    }

    if (m.phase === "ko" && m.phaseT >= T.KO_HOLD) {
      const done = m.wins[0] >= T.ROUNDS_TO_WIN || m.wins[1] >= T.ROUNDS_TO_WIN || m.round >= T.MAX_ROUNDS;
      if (done) {
        m.phase = "over";
        m.phaseT = 0;
        m.winner = m.wins[0] === m.wins[1] ? null : m.wins[0] > m.wins[1] ? 0 : 1;
        m.events.push({ type: "matchEnd", winner: m.winner });
      } else {
        startRound();
      }
    }
  }

  return m;
}

export type Difficulty = keyof typeof T.DIFFICULTY_MULT;

/**
 * What a match against the CPU is worth, for fighter 0.
 *
 * Rounds won, damage dealt and a bonus for the match, times the difficulty.
 * A lost match still pays for what you did in it, the way a runner pays for
 * distance whether or not you beat your best — a player learning Hard should
 * not be paid nothing for the rounds that taught them.
 */
export function scoreFor(m: Pick<Match, "wins" | "dealt" | "winner">, difficulty: Difficulty): number {
  const base =
    m.wins[0] * T.ROUND_POINTS + Math.round(m.dealt[0]) + (m.winner === 0 ? T.MATCH_BONUS : 0);
  return base * T.DIFFICULTY_MULT[difficulty];
}
