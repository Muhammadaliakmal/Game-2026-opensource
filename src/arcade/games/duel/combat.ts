import * as T from "./tuning";
import {
  ELBOW,
  ELBOW2,
  FOOT_L,
  FOOT_R,
  HAND,
  HAND2,
  HEAD,
  KNEE_L,
  KNEE_R,
  N,
  NECK,
  PELVIS,
  TIP,
  knockOut,
  stagger,
  type Fighter,
} from "./ragdoll";

/**
 * Who hit whom, how hard, and what it did to them.
 *
 * ── Damage is speed, not contact ─────────────────────────────────────────
 *
 * A weapon resting against a chest does nothing. What hurts is the speed of
 * the weapon at the point of contact *relative to the part it touched*, above
 * a graze threshold — so walking into a held rod is harmless, a whip of the
 * wrist is a hit, and a charged swing into somebody running at you is the
 * biggest hit in the game. `damageFor` is that rule as one pure function,
 * which is what the tests hold.
 *
 * ── Two samples per substep ──────────────────────────────────────────────
 *
 * The weapon is tested where it is and where it was halfway through the
 * substep. A tip at 3000 px/s moves 25 px in one 1/120 s substep, which is
 * wider than a shin; the midpoint catches what the endpoints straddle.
 */

export type CombatEvent =
  | {
      type: "hit";
      attacker: 0 | 1;
      target: 0 | 1;
      part: T.BodyPart;
      dmg: number;
      x: number;
      y: number;
      /** Direction the blow travelled, unit length. */
      nx: number;
      ny: number;
      heavy: boolean;
      ko: boolean;
    }
  | { type: "clash"; x: number; y: number; speed: number };

/** The damage one contact does. Zero below the graze threshold; never above MAX_HIT. */
export function damageFor(speed: number, weapon: T.Weapon, part: T.BodyPart, power = 0): number {
  if (!(speed > T.MIN_HIT_SPEED)) return 0;
  const raw = (speed - T.MIN_HIT_SPEED) * weapon.damage * T.LOCATION_MULT[part] * (1 + T.HEAVY_DAMAGE * power);
  return Math.min(T.MAX_HIT, raw);
}

interface Segment {
  a: number;
  b: number;
  r: number;
  part: T.BodyPart;
}

/** The parts a weapon can land on, most valuable first so a tie goes to the head. */
const BODY: readonly Segment[] = [
  { a: HEAD, b: HEAD, r: T.HEAD_R, part: "head" },
  // Widths are the robot sprite's: a 36 px torso and 14-15 px limbs at the
  // pack's @1x, halved for this view.
  { a: NECK, b: PELVIS, r: 9, part: "torso" },
  { a: PELVIS, b: KNEE_L, r: 4, part: "limb" },
  { a: PELVIS, b: KNEE_R, r: 4, part: "limb" },
  { a: KNEE_L, b: FOOT_L, r: 3.5, part: "limb" },
  { a: KNEE_R, b: FOOT_R, r: 3.5, part: "limb" },
  { a: NECK, b: ELBOW, r: 3.5, part: "limb" },
  { a: ELBOW, b: HAND, r: 3.5, part: "limb" },
  { a: NECK, b: ELBOW2, r: 3.5, part: "limb" },
  { a: ELBOW2, b: HAND2, r: 3.5, part: "limb" },
];

/** Closest points between two segments. Written into `out`; nothing allocated. */
export interface Closest {
  d: number;
  s: number;
  t: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function closest(
  p1x: number, p1y: number, q1x: number, q1y: number,
  p2x: number, p2y: number, q2x: number, q2y: number,
  out: Closest
): Closest {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s = 0;
  let t = 0;
  const EPS = 1e-9;
  if (a <= EPS && e <= EPS) {
    s = t = 0;
  } else if (a <= EPS) {
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPS) {
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  out.s = s;
  out.t = t;
  out.x1 = p1x + d1x * s;
  out.y1 = p1y + d1y * s;
  out.x2 = p2x + d2x * t;
  out.y2 = p2y + d2y * t;
  out.d = Math.hypot(out.x1 - out.x2, out.y1 - out.y2);
  return out;
}

const c = { d: 0, s: 0, t: 0, x1: 0, y1: 0, x2: 0, y2: 0 };

/** Where the weapon is, at `k` of the way from the substep's start (0) to now (1). */
const at = (f: Fighter, i: number, k: number) => ({
  x: f.ox[i] + (f.x[i] - f.ox[i]) * k,
  y: f.oy[i] + (f.y[i] - f.oy[i]) * k,
});

interface Found {
  seg: Segment;
  s: number;
  t: number;
  x: number;
  y: number;
}

/** The best part `w`'s weapon overlaps on `b`, or null. */
function contactOn(w: Fighter, b: Fighter): Found | null {
  for (const k of [1, 0.5]) {
    const h = at(w, HAND, k);
    const tip = at(w, TIP, k);
    for (const seg of BODY) {
      closest(h.x, h.y, tip.x, tip.y, b.x[seg.a], b.y[seg.a], b.x[seg.b], b.y[seg.b], c);
      // The shaft is thin; the last stretch of it is as thick as the tip.
      const r = (c.s > 0.85 ? w.weapon.tipR : T.SHAFT_R) + seg.r;
      if (c.d < r) return { seg, s: c.s, t: c.t, x: c.x2, y: c.y2 };
    }
  }
  return null;
}

/** Velocity of a point `s` along a–b. */
function velAlong(f: Fighter, a: number, b: number, s: number) {
  return {
    x: f.vx[a] + (f.vx[b] - f.vx[a]) * s,
    y: f.vy[a] + (f.vy[b] - f.vy[a]) * s,
  };
}

/** Can this fighter's weapon do anything right now? */
const armed = (f: Fighter) => !f.ko && f.stun === 0 && f.hitCool === 0;

/** Weapon against weapon. Returns true if they met hard enough to clash. */
function clash(a: Fighter, b: Fighter, events: CombatEvent[]): boolean {
  if (!armed(a) || !armed(b)) return false;
  closest(
    a.x[HAND], a.y[HAND], a.x[TIP], a.y[TIP],
    b.x[HAND], b.y[HAND], b.x[TIP], b.y[TIP],
    c
  );
  const reach = Math.max(a.weapon.tipR, T.SHAFT_R) + Math.max(b.weapon.tipR, T.SHAFT_R);
  if (c.d > reach) return false;
  const va = velAlong(a, HAND, TIP, c.s);
  const vb = velAlong(b, HAND, TIP, c.t);
  const speed = Math.hypot(va.x - vb.x, va.y - vb.y);
  if (speed < T.CLASH_SPEED) return false;
  for (const f of [a, b]) {
    for (const i of [HAND, TIP]) {
      f.vx[i] *= -0.45;
      f.vy[i] *= -0.45;
    }
    f.hitCool = T.CLASH_COOLDOWN;
  }
  events.push({ type: "clash", x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2, speed });
  return true;
}

/** `w` hits `b`, if its weapon is on `b` and moving fast enough. */
function strike(w: Fighter, b: Fighter, events: CombatEvent[]): void {
  if (!armed(w) || b.ko) return;
  const found = contactOn(w, b);
  if (!found) return;
  const vw = velAlong(w, HAND, TIP, found.s);
  const vb = velAlong(b, found.seg.a, found.seg.b, found.t);
  const rx = vw.x - vb.x;
  const ry = vw.y - vb.y;
  const speed = Math.hypot(rx, ry);
  const power = w.swing > 0 ? w.swingPower : 0;
  const dmg = damageFor(speed, w.weapon, found.seg.part, power);
  if (dmg <= 0) return;

  // The blow's direction, with a lift so a hit sends people up and over
  // rather than skidding them flat along the floor.
  let nx = rx / speed;
  let ny = ry / speed - 0.35;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  const dv = Math.min(T.KNOCK_MAX, dmg * T.KNOCK_PER_DMG);
  for (let i = 0; i < N; i++) {
    b.vx[i] += nx * dv * 0.45;
    b.vy[i] += ny * dv * 0.45;
  }
  for (const i of [found.seg.a, found.seg.b]) {
    b.vx[i] += nx * dv * 0.55;
    b.vy[i] += ny * dv * 0.55;
  }
  // The weapon stops in what it hit.
  for (const i of [HAND, TIP]) {
    w.vx[i] *= 0.35;
    w.vy[i] *= 0.35;
  }
  w.hitCool = T.HIT_COOLDOWN;

  b.hp = Math.max(0, b.hp - dmg);
  const ko = b.hp === 0;
  if (ko) knockOut(b);
  else if (dmg >= T.STUN_MIN) stagger(b, Math.min(T.STUN_MAX, dmg * T.STUN_PER_DMG));

  events.push({
    type: "hit",
    attacker: w.id,
    target: b.id,
    part: found.seg.part,
    dmg,
    x: found.x,
    y: found.y,
    nx,
    ny,
    heavy: power > 0,
    ko,
  });
}

/** Everything the two weapons did this substep. A clash cancels both strikes. */
export function resolveCombat(a: Fighter, b: Fighter, events: CombatEvent[]): void {
  if (clash(a, b, events)) return;
  strike(a, b, events);
  strike(b, a, events);
}

/** Keep two bodies from standing inside each other. Positions, half each. */
export function separate(a: Fighter, b: Fighter): void {
  for (const i of [HEAD, NECK, PELVIS]) {
    for (const j of [HEAD, NECK, PELVIS]) {
      const dx = b.x[j] - a.x[i];
      const dy = b.y[j] - a.y[i];
      const min = a.r[i] + b.r[j] + 6 * T.S;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      // Straight on top of each other: split sideways by facing.
      const ux = d > 1e-6 ? dx / d : a.facing;
      const uy = d > 1e-6 ? dy / d : 0;
      const push = (min - d) / 2;
      a.x[i] -= ux * push;
      a.y[i] -= uy * push;
      b.x[j] += ux * push;
      b.y[j] += uy * push;
    }
  }
}
