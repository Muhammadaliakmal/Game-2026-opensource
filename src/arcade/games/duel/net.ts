import * as T from "./tuning";
import * as R from "./ragdoll";
import type { Match, MatchEvent } from "./match";

/**
 * A duel across two devices: the HOST's tab runs the fight, and the guest's
 * draws what the host sends.
 *
 * Not lockstep. Lockstep would have both tabs simulate from the same inputs,
 * which only works if both compute bit-identical floats — and a ragdoll is
 * trigonometry all the way down, where Chrome and Safari are allowed to round
 * `Math.sin` differently. One phone in each would drift in a second. So the
 * guest sends its stick and buttons every step, and the host sends the match
 * back: twelve particles a fighter and a handful of numbers, small enough to
 * send every step on one Wi-Fi.
 *
 * `applySnapshot` writes into a real `Match` the guest created from the same
 * seed, so the renderer, the HUD and the sound reactions run unchanged — they
 * cannot tell a match that was stepped from one that was told.
 */

export interface InputMsg {
  k: "in";
  x: number;
  y: number;
  j: boolean;
  h: boolean;
}

interface FighterSnap {
  w: string;
  x: number[];
  y: number[];
  s: number[];
  b: number;
}

export interface DuelSnapshot {
  k: "snap";
  phase: Match["phase"];
  phaseT: number;
  round: number;
  wins: [number, number];
  clock: number;
  lava: [string, number, number, number];
  movers: number[];
  roundT: number;
  roundWinner: 0 | 1 | null;
  cause: Match["cause"];
  winner: 0 | 1 | null;
  dealt: [number, number];
  f: [FighterSnap, FighterSnap];
  ev: MatchEvent[];
}

/** Scalars a renderer or HUD reads. Order is the wire format. */
const NUMS = ["hp", "stamina", "windup", "swing", "swingPower", "stun", "strength", "gait", "hitCool", "tipSpeed"] as const;
/** Booleans, packed into one number. */
const FLAGS = ["tired", "ko", "support"] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

function fighterSnap(f: R.Fighter): FighterSnap {
  let b = f.facing === 1 ? 1 : 0;
  FLAGS.forEach((k, i) => {
    if (f[k]) b |= 2 << i;
  });
  return {
    w: f.weapon.id,
    x: Array.from(f.x, r2),
    y: Array.from(f.y, r2),
    s: NUMS.map((k) => r2(f[k])),
    b,
  };
}

export function snapshotOf(m: Match): DuelSnapshot {
  return {
    k: "snap",
    phase: m.phase,
    phaseT: r2(m.phaseT),
    round: m.round,
    wins: [m.wins[0], m.wins[1]],
    clock: r2(m.clock),
    lava: [m.lava.phase, r2(m.lava.t), r2(m.lava.next), r2(m.lava.y)],
    movers: m.movers.flatMap((r) => [r2(r.x0), r2(r.y0), r2(r.x1), r2(r.y1)]),
    roundT: r2(m.roundT),
    roundWinner: m.roundWinner,
    cause: m.cause,
    winner: m.winner,
    dealt: [r2(m.dealt[0]), r2(m.dealt[1])],
    f: [fighterSnap(m.fighters[0]), fighterSnap(m.fighters[1])],
    ev: m.events.slice(),
  };
}

function applyFighter(f: R.Fighter, s: FighterSnap, newRound: boolean) {
  // Every round re-arms both fighters, and a fresh match has no links at all
  // until its first round — so a new round rebuilds, not only a new weapon.
  if (newRound || f.weapon.id !== s.w || f.links.length === 0) {
    const weapon = T.WEAPONS.find((w) => w.id === s.w);
    // Rebuilds the links and the tip's mass for the new weapon; the positions
    // it sets are overwritten just below.
    if (weapon) R.resetFighter(f, weapon, s.x[R.PELVIS] ?? 0, s.y[R.FOOT_L] ?? 0, f.facing);
  }
  for (let i = 0; i < f.x.length && i < s.x.length; i++) {
    f.ox[i] = f.x[i];
    f.oy[i] = f.y[i];
    f.x[i] = s.x[i];
    f.y[i] = s.y[i];
  }
  NUMS.forEach((k, i) => {
    f[k] = s.s[i];
  });
  f.facing = s.b & 1 ? 1 : -1;
  FLAGS.forEach((k, i) => {
    f[k] = (s.b & (2 << i)) !== 0;
  });
}

/** Write the host's match into the guest's. Events replace the guest's own. */
export function applySnapshot(m: Match, s: DuelSnapshot) {
  const newRound = m.round !== s.round;
  m.phase = s.phase;
  m.phaseT = s.phaseT;
  m.round = s.round;
  m.wins[0] = s.wins[0];
  m.wins[1] = s.wins[1];
  m.clock = s.clock;
  m.lava.phase = s.lava[0] as Match["lava"]["phase"];
  m.lava.t = s.lava[1];
  m.lava.next = s.lava[2];
  m.lava.y = s.lava[3];
  m.movers.forEach((r, i) => {
    r.x0 = s.movers[i * 4] ?? r.x0;
    r.y0 = s.movers[i * 4 + 1] ?? r.y0;
    r.x1 = s.movers[i * 4 + 2] ?? r.x1;
    r.y1 = s.movers[i * 4 + 3] ?? r.y1;
  });
  m.roundT = s.roundT;
  m.roundWinner = s.roundWinner;
  m.cause = s.cause;
  m.winner = s.winner;
  m.dealt[0] = s.dealt[0];
  m.dealt[1] = s.dealt[1];
  applyFighter(m.fighters[0], s.f[0], newRound);
  applyFighter(m.fighters[1], s.f[1], newRound);
  m.events.length = 0;
  for (const e of s.ev) m.events.push(e);
}

export const inputMsg = (i: R.FighterInput): InputMsg => ({ k: "in", x: r2(i.x), y: r2(i.y), j: i.jump, h: i.heavy });

export function readInputMsg(msg: InputMsg, into: R.FighterInput) {
  into.x = Math.max(-1, Math.min(1, Number(msg.x) || 0));
  into.y = Math.max(-1, Math.min(1, Number(msg.y) || 0));
  into.jump = msg.j === true;
  into.heavy = msg.h === true;
}
