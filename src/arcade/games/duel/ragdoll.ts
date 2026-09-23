import * as T from "./tuning";
import { collide, surfaceBelow, type Contact, type Rect } from "./arena";

/**
 * One fighter: twelve particles, twelve sticks, and muscles that reach.
 *
 * ── Position-based, not rigid bodies ─────────────────────────────────────
 *
 * Each particle carries a position and a velocity. A substep adds gravity
 * and muscle forces to the velocity, moves the particle, then projects every
 * stick back to its length and every particle out of the floor, and reads the
 * velocity back off how far it actually moved. That is the whole solver, and
 * it cannot explode the way a spring skeleton does: a stick is a length, not
 * a stiffness, so there is no stiffness to set too high.
 *
 * ── Active, not animated ─────────────────────────────────────────────────
 *
 * Nothing here sets a pose. The stick names a direction and the muscles pull
 * the hand and the weapon tip towards the point that direction reaches, with
 * a spring that is deliberately underdamped so a fast change of direction
 * whips. A hit that lands drops `strength` to zero and the same code is a
 * ragdoll; it climbs back and the same code stands up again. KO is strength
 * zero for good.
 *
 * ── The forearm and the weapon are one rod ───────────────────────────────
 *
 * The tip is tied to the hand at the weapon's length and to the elbow at
 * forearm + weapon, which makes elbow–hand–tip collinear without a joint
 * limit. The weapon therefore points where the forearm points, which is what
 * a held thing does, and the tip's mass loads the arm the way a maul should.
 */

export const HEAD = 0;
export const NECK = 1;
export const PELVIS = 2;
export const KNEE_L = 3;
export const FOOT_L = 4;
export const KNEE_R = 5;
export const FOOT_R = 6;
export const ELBOW = 7;
export const HAND = 8;
export const ELBOW2 = 9;
export const HAND2 = 10;
export const TIP = 11;
export const N = 12;

/** What one player, or the CPU, asks of a fighter for one host step. */
export interface FighterInput {
  /** The stick, -1..1 each way, y down. */
  x: number;
  y: number;
  /** An edge: true on the step a jump was asked for. */
  jump: boolean;
  /** A level: held to charge the heavy swing, released to throw it. */
  heavy: boolean;
}

export const neutralInput = (): FighterInput => ({ x: 0, y: 0, jump: false, heavy: false });

interface Link {
  a: number;
  b: number;
  len: number;
}

export interface Fighter {
  readonly id: 0 | 1;
  weapon: T.Weapon;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** Position at the start of the substep. */
  readonly ox: Float64Array;
  readonly oy: Float64Array;
  readonly m: Float64Array;
  readonly inv: Float64Array;
  readonly r: Float64Array;
  /** 1 where the particle rested on a top face last substep. */
  readonly contact: Uint8Array;
  links: Link[];
  facing: 1 | -1;
  hp: number;
  stamina: number;
  tired: boolean;
  /** Seconds of heavy charge held so far; 0 when not charging. */
  windup: number;
  /** Seconds left on a released heavy swing, and its charge 0..1. */
  swing: number;
  swingPower: number;
  /** Seconds of stagger left. Muscles are off while it runs. */
  stun: number;
  /** Muscle strength 0..1, ramped back up after a stagger. */
  strength: number;
  ko: boolean;
  /** Standing on something this substep. */
  support: boolean;
  gait: number;
  /** Seconds before this fighter's weapon may hit again. */
  hitCool: number;
  /** Tip speed relative to the shoulder, px/s. What the trail and the drain read. */
  tipSpeed: number;
  /**
   * Seconds since a jump left the ground. Support is ignored until it
   * passes: the standing spring is damped against vertical speed, and on the
   * substep after take-off the feet are still touching, so it read the jump
   * as a fall to be caught and ate two thirds of it.
   */
  airT: number;
}

export type RagdollEvent =
  | { type: "jump"; fighter: 0 | 1 }
  | { type: "windup"; fighter: 0 | 1 }
  | { type: "heavy"; fighter: 0 | 1; power: number }
  | { type: "tired"; fighter: 0 | 1 };

const MASS = [1.4, 2.2, 3, 0.9, 0.9, 0.9, 0.9, 0.5, 0.5, 0.4, 0.4, 1];
const RADIUS = [T.HEAD_R, 4.5, 5, 3, 3, 3, 3, 2.2, 2.2, 2.2, 2.2, 3];

function linksFor(w: T.Weapon): Link[] {
  return [
    { a: HEAD, b: NECK, len: T.NECK_LEN },
    { a: NECK, b: PELVIS, len: T.TORSO },
    { a: PELVIS, b: KNEE_L, len: T.THIGH },
    { a: KNEE_L, b: FOOT_L, len: T.SHIN },
    { a: PELVIS, b: KNEE_R, len: T.THIGH },
    { a: KNEE_R, b: FOOT_R, len: T.SHIN },
    { a: NECK, b: ELBOW, len: T.UPPER_ARM },
    { a: ELBOW, b: HAND, len: T.FOREARM },
    { a: NECK, b: ELBOW2, len: T.UPPER_ARM },
    { a: ELBOW2, b: HAND2, len: T.FOREARM },
    { a: HAND, b: TIP, len: w.length },
    { a: ELBOW, b: TIP, len: T.FOREARM + w.length },
  ];
}

export function createFighter(id: 0 | 1, weapon: T.Weapon): Fighter {
  const f: Fighter = {
    id,
    weapon,
    x: new Float64Array(N),
    y: new Float64Array(N),
    vx: new Float64Array(N),
    vy: new Float64Array(N),
    ox: new Float64Array(N),
    oy: new Float64Array(N),
    m: new Float64Array(N),
    inv: new Float64Array(N),
    r: new Float64Array(N),
    contact: new Uint8Array(N),
    links: [],
    facing: id === 0 ? 1 : -1,
    hp: T.HP,
    stamina: T.STAMINA_MAX,
    tired: false,
    windup: 0,
    swing: 0,
    swingPower: 0,
    stun: 0,
    strength: 1,
    ko: false,
    support: true,
    gait: 0,
    hitCool: 0,
    tipSpeed: 0,
    airT: 1,
  };
  return f;
}

/** Stand a fighter up at `px` on the ground at `groundY`, fresh for a round. */
export function resetFighter(
  f: Fighter,
  weapon: T.Weapon,
  px: number,
  groundY: number,
  facing: 1 | -1
): void {
  f.weapon = weapon;
  f.links = linksFor(weapon);
  for (let i = 0; i < N; i++) {
    f.m[i] = i === TIP ? weapon.tipMass : MASS[i];
    f.inv[i] = 1 / f.m[i];
    f.r[i] = i === TIP ? weapon.tipR : RADIUS[i];
  }
  const py = groundY - T.STAND_H;
  const ny = py - T.TORSO;
  const set = (i: number, x: number, y: number) => {
    f.x[i] = f.ox[i] = x;
    f.y[i] = f.oy[i] = y;
    f.vx[i] = f.vy[i] = 0;
    f.contact[i] = 0;
  };
  set(HEAD, px + facing * 2 * T.S, ny - T.NECK_LEN);
  set(NECK, px, ny);
  set(PELVIS, px, py);
  set(KNEE_L, px + (facing * 4 - 3) * T.S, py + T.THIGH * 0.95);
  set(FOOT_L, px - 5 * T.S, groundY - RADIUS[FOOT_L]);
  set(KNEE_R, px + (facing * 4 + 3) * T.S, py + T.THIGH * 0.95);
  set(FOOT_R, px + 5 * T.S, groundY - RADIUS[FOOT_R]);
  // The weapon arm out in guard: upper arm down-forward, forearm forward.
  const ex = px + facing * T.UPPER_ARM * 0.7;
  const ey = ny + T.UPPER_ARM * 0.7;
  set(ELBOW, ex, ey);
  set(HAND, ex + facing * T.FOREARM, ey);
  set(TIP, ex + facing * (T.FOREARM + weapon.length), ey);
  set(ELBOW2, px - facing * 4 * T.S, ny + T.UPPER_ARM);
  set(HAND2, px - facing * 2 * T.S, ny + T.UPPER_ARM + T.FOREARM);
  f.facing = facing;
  f.hp = T.HP;
  f.stamina = T.STAMINA_MAX;
  f.tired = false;
  f.windup = 0;
  f.swing = 0;
  f.swingPower = 0;
  f.stun = 0;
  f.strength = 1;
  f.ko = false;
  f.support = true;
  f.gait = 0;
  f.hitCool = 0;
  f.tipSpeed = 0;
  f.airT = 1;
}

/** Let go for good. */
export function knockOut(f: Fighter): void {
  f.ko = true;
  f.strength = 0;
  f.windup = 0;
  f.swing = 0;
}

/** Stagger: muscles off for `seconds`, then a ramp back up. */
export function stagger(f: Fighter, seconds: number): void {
  f.stun = Math.max(f.stun, seconds);
  f.strength = 0;
  f.windup = 0;
}

/**
 * A muscle: pull particle `i` towards a target, and push `anchor` back.
 *
 * The push back is what keeps a fighter standing still. The first version
 * pulled limbs and nothing else, which is a force from nowhere: a knee held
 * forward of the hips walked the whole body backwards at 27 px/s with the
 * stick at rest. A muscle is internal, so it moves the body's parts relative
 * to each other and never the body — the walk is the only force that does.
 */
function pull(
  f: Fighter,
  i: number,
  anchor: number,
  tx: number,
  ty: number,
  tvx: number,
  tvy: number,
  kp: number,
  kd: number,
  h: number,
  maxAcc = T.MAX_ACC
) {
  let fx = kp * (tx - f.x[i]) + kd * (tvx - f.vx[i]);
  let fy = kp * (ty - f.y[i]) + kd * (tvy - f.vy[i]);
  const a = Math.hypot(fx, fy) * f.inv[i];
  if (a > maxAcc) {
    fx *= maxAcc / a;
    fy *= maxAcc / a;
  }
  f.vx[i] += fx * f.inv[i] * h;
  f.vy[i] += fy * f.inv[i] * h;
  f.vx[anchor] -= fx * f.inv[anchor] * h;
  f.vy[anchor] -= fy * f.inv[anchor] * h;
}

/** A stick past its dead zone, rescaled so the edge of the zone reads as 0. */
const shaped = (v: number, dead: number) => {
  const a = Math.abs(v);
  return a <= dead ? 0 : (Math.sign(v) * (a - dead)) / (1 - dead);
};

/**
 * The decisions a fighter makes once per host step: jump, charge, release,
 * stamina. Separate from the forces because it runs once per step rather
 * than per substep, and an edge like `jump` must be read exactly once.
 */
export function think(f: Fighter, input: FighterInput, dt: number, events: RagdollEvent[]): void {
  if (f.hitCool > 0) f.hitCool = Math.max(0, f.hitCool - dt);
  f.airT += dt;
  if (f.ko) return;

  if (f.stun > 0) {
    f.stun = Math.max(0, f.stun - dt);
    if (f.stun === 0) f.strength = 0.2;
  } else if (f.strength < 1) {
    f.strength = Math.min(1, f.strength + T.RECOVER_RATE * dt);
  }
  const able = f.stun === 0 && f.strength > 0.5;

  // ── Jump ──
  if (input.jump && able && f.support && f.stamina >= T.JUMP_COST && f.windup === 0) {
    for (let i = 0; i < N; i++) f.vy[i] = Math.min(f.vy[i], 0) - T.JUMP_V;
    f.stamina -= T.JUMP_COST;
    f.support = false;
    f.airT = 0;
    events.push({ type: "jump", fighter: f.id });
  }

  // ── The heavy: hold to charge, release to throw ──
  if (f.swing > 0) f.swing = Math.max(0, f.swing - dt);
  if (input.heavy && able && f.swing === 0) {
    if (f.windup === 0 && f.stamina >= T.HEAVY_MIN_STAMINA) {
      f.windup = dt;
      events.push({ type: "windup", fighter: f.id });
    } else if (f.windup > 0) {
      f.windup = Math.min(T.HEAVY_FULL, f.windup + dt);
    }
  } else if (f.windup > 0) {
    if (f.windup >= T.HEAVY_MIN_CHARGE && able) {
      const power = Math.min(1, f.windup / T.HEAVY_FULL);
      f.swing = T.HEAVY_SWING_T;
      f.swingPower = power;
      f.stamina = Math.max(0, f.stamina - T.HEAVY_COST * (0.4 + 0.6 * power));
      const lunge = f.facing * T.LUNGE * power;
      for (let i = 0; i < N; i++) f.vx[i] += lunge;
      events.push({ type: "heavy", fighter: f.id, power });
    }
    f.windup = 0;
  }

  // ── Stamina: the tendon ──
  const thrashing = f.tipSpeed > T.SWING_FAST;
  if (thrashing && f.swing === 0) f.stamina -= T.SWING_DRAIN * dt;
  else if (f.windup === 0 && f.swing === 0) f.stamina += T.STAMINA_REGEN * dt;
  f.stamina = Math.max(0, Math.min(T.STAMINA_MAX, f.stamina));
  if (!f.tired && f.stamina < T.TIRED_BELOW) {
    f.tired = true;
    events.push({ type: "tired", fighter: f.id });
  } else if (f.tired && f.stamina > T.TIRED_CLEAR) {
    f.tired = false;
  }
}

/** Gravity and every muscle, into the velocities. One substep. */
export function applyForces(f: Fighter, input: FighterInput, solids: readonly Rect[], h: number): void {
  for (let i = 0; i < N; i++) f.vy[i] += T.GRAVITY * h;

  const s = f.ko ? 0 : f.strength;
  const px = f.x[PELVIS];
  const py = f.y[PELVIS];
  const ground = surfaceBelow(solids, px, py);
  const touching = f.contact[PELVIS] | f.contact[FOOT_L] | f.contact[FOOT_R] | f.contact[KNEE_L] | f.contact[KNEE_R];
  // Standing is ground within reach of the feet, touching or not. Contact
  // alone flickered on the moving bridge: as it sank the feet parted from it
  // every substep, and every flicker handed the robot to the weak air
  // control — where the recoil of its own swing walked it off the lip.
  const near = ground - py < T.STAND_H + T.SUPPORT_SLACK;
  const close = ground - (py + T.STAND_H) < T.SUPPORT_SLACK * 0.5;
  f.support = f.airT > T.JUMP_AIR && near && (touching === 1 || close);
  if (s === 0) return;

  const fc = f.facing;
  const pvx = f.vx[PELVIS];
  const pvy = f.vy[PELVIS];

  // Held up: the arms carry themselves and the weapon, and on the ground the
  // torso is carried too. Legs keep their weight so they stay planted.
  for (let i = ELBOW; i <= TIP; i++) f.vy[i] -= T.GRAVITY * h * s;
  if (f.support) {
    f.vy[HEAD] -= T.GRAVITY * h * s;
    f.vy[NECK] -= T.GRAVITY * h * s;
    f.vy[PELVIS] -= T.GRAVITY * h * s;
    const ay = (T.STAND_KP * (ground - T.STAND_H - py) - T.STAND_KD * pvy) * f.inv[PELVIS] * s;
    f.vy[PELVIS] += Math.max(-T.MAX_ACC, Math.min(T.MAX_ACC, ay)) * h;
  }

  // ── Walk ──
  const charging = f.windup > 0;
  const want = shaped(input.x, T.WALK_DEAD) * T.WALK_SPEED * (charging ? 0.4 : 1);
  const k = (f.support ? T.WALK_K : T.AIR_K) * s;
  for (const i of [PELVIS, NECK, HEAD]) f.vx[i] += (want - f.vx[i]) * Math.min(1, k * h);

  // ── Upright ──
  const lean = (pvx / T.WALK_SPEED) * T.LEAN - (charging ? fc * 5 * T.S : 0);
  pull(f, NECK, PELVIS, px + lean, py - T.TORSO, pvx, pvy, T.UPRIGHT_KP * s, T.UPRIGHT_KD * s, h);
  pull(f, HEAD, NECK, f.x[NECK] + fc * 2 * T.S + lean * 0.4, f.y[NECK] - T.NECK_LEN, f.vx[NECK], f.vy[NECK], T.HEAD_KP * s, T.HEAD_KD * s, h);

  // ── Legs ──
  if (f.support) {
    const moving = Math.abs(pvx) > 30 * T.S;
    f.gait += ((pvx * h) / T.STRIDE_LEN) * Math.PI;
    const sw = moving ? Math.sin(f.gait) * T.STRIDE : 0;
    const lift = moving ? Math.cos(f.gait) * T.STEP_LIFT : 0;
    const floorY = Math.min(ground, py + T.STAND_H + T.SUPPORT_SLACK) - f.r[FOOT_L];
    pull(f, FOOT_L, PELVIS, px - fc * 5 * T.S + sw, floorY - Math.max(0, lift), pvx, 0, T.FOOT_KP * s, T.FOOT_KD * s, h);
    pull(f, FOOT_R, PELVIS, px + fc * 5 * T.S - sw, floorY - Math.max(0, -lift), pvx, 0, T.FOOT_KP * s, T.FOOT_KD * s, h);
  } else {
    pull(f, FOOT_L, PELVIS, px - 6 * T.S, py + T.STAND_H * 0.75, pvx, pvy, T.FOOT_KP * s * 0.5, T.FOOT_KD * s, h);
    pull(f, FOOT_R, PELVIS, px + 6 * T.S, py + T.STAND_H * 0.75, pvx, pvy, T.FOOT_KP * s * 0.5, T.FOOT_KD * s, h);
  }
  for (const [knee, foot] of [
    [KNEE_L, FOOT_L],
    [KNEE_R, FOOT_R],
  ]) {
    const kx = (px + f.x[foot]) / 2 + fc * 9 * T.S;
    const ky = (py + f.y[foot]) / 2;
    pull(f, knee, PELVIS, kx, ky, pvx, pvy, T.KNEE_KP * s, T.KNEE_KD * s, h);
  }

  // ── The weapon arm ──
  let dx: number;
  let dy: number;
  let gain: number;
  const mag = Math.hypot(input.x, input.y);
  if (f.swing > 0) {
    dx = fc;
    dy = 0.55;
    gain = T.HEAVY_GAIN_MIN + (T.HEAVY_GAIN_MAX - T.HEAVY_GAIN_MIN) * f.swingPower;
  } else if (charging) {
    dx = -fc * 0.45;
    dy = -1;
    gain = 1;
  } else if (mag > T.STICK_DEAD) {
    dx = input.x;
    dy = input.y;
    gain = 1;
  } else {
    dx = fc * 0.85;
    dy = 0.45;
    gain = T.GUARD_GAIN;
  }
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  if (f.tired) gain *= T.TIRED_GAIN;
  gain *= f.weapon.grip * s;

  const sx = f.x[NECK];
  const sy = f.y[NECK];
  const svx = f.vx[NECK];
  const svy = f.vy[NECK];
  const reach = T.ARM_REACH * 0.9;
  // The elbow bends to whichever side of the arm is lower.
  let nx = -dy;
  let ny = dx;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const kp = T.ARM_KP * gain;
  const kd = T.ARM_KD * Math.sqrt(gain);
  // The arm's own ceiling, scaled by gain: what a charged heavy actually
  // buys is a faster arm, and a shared clamp made a tap nearly as fast.
  const acc = T.ARM_ACC * gain;
  pull(f, ELBOW, NECK, sx + dx * T.UPPER_ARM * 0.85 + nx * 6 * T.S, sy + dy * T.UPPER_ARM * 0.85 + ny * 6 * T.S, svx, svy, kp * 0.4, kd * 0.5, h, acc);
  pull(f, HAND, NECK, sx + dx * reach, sy + dy * reach, svx, svy, kp, kd, h, acc);
  pull(f, TIP, NECK, sx + dx * (reach + f.weapon.length), sy + dy * (reach + f.weapon.length), svx, svy, kp * f.weapon.tipMass, kd * f.weapon.tipMass, h, acc);

  // ── The other arm, held in close ──
  pull(f, ELBOW2, NECK, sx - fc * 6 * T.S, sy + T.UPPER_ARM * 0.8, svx, svy, T.OFFARM_KP * s, T.OFFARM_KD * s, h);
  pull(f, HAND2, NECK, sx + fc * 4 * T.S, sy + T.UPPER_ARM * 0.4, svx, svy, T.OFFARM_KP * s, T.OFFARM_KD * s, h);
}

/** Move every particle by its velocity, remembering where it started. */
export function integrate(f: Fighter, h: number): void {
  for (let i = 0; i < N; i++) {
    f.ox[i] = f.x[i];
    f.oy[i] = f.y[i];
    f.x[i] += f.vx[i] * h;
    f.y[i] += f.vy[i] * h;
    f.contact[i] = 0;
  }
}

const scratch: Contact = { x: 0, y: 0, top: false, hit: false };

/**
 * The lowest point of the body at the start of the substep. See `collide`.
 *
 * The body, not the arms: head to feet. With the weapon counted, every low
 * swing put the tip below the feet, and a robot standing on a thin platform
 * fell through it the moment it swung downward.
 */
function bottomOf(f: Fighter): number {
  let b = -Infinity;
  for (let i = HEAD; i <= FOOT_R; i++) b = Math.max(b, f.oy[i] + f.r[i]);
  return b;
}

/** One pass of sticks, then one pass of floor. Called ITERATIONS times. */
export function solve(f: Fighter, solids: readonly Rect[]): void {
  for (const l of f.links) {
    const dx = f.x[l.b] - f.x[l.a];
    const dy = f.y[l.b] - f.y[l.a];
    const d = Math.hypot(dx, dy) || 1e-6;
    const w = f.inv[l.a] + f.inv[l.b];
    const k = (d - l.len) / (d * w);
    f.x[l.a] += dx * k * f.inv[l.a];
    f.y[l.a] += dy * k * f.inv[l.a];
    f.x[l.b] -= dx * k * f.inv[l.b];
    f.y[l.b] -= dy * k * f.inv[l.b];
  }
  const bottom = bottomOf(f);
  for (let i = 0; i < N; i++) {
    // Arms and the weapon ride with the body: they cannot be caught by a
    // thin platform the body is passing through, nor fall through one the
    // body is standing on.
    const c = collide(solids, f.x[i], f.y[i], i > FOOT_R ? Math.min(bottom, f.oy[i] + f.r[i]) : bottom, f.r[i], scratch);
    if (!c.hit) continue;
    f.x[i] = c.x;
    f.y[i] = c.y;
    if (c.top) f.contact[i] = 1;
  }
}

/** Read velocity back off the move, and keep a broken particle from spreading. */
export function finish(f: Fighter, h: number): void {
  const damp = Math.max(0, 1 - T.LINEAR_DAMP * h);
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(f.x[i]) || !Number.isFinite(f.y[i])) {
      f.x[i] = f.ox[i];
      f.y[i] = f.oy[i];
      f.vx[i] = 0;
      f.vy[i] = 0;
      continue;
    }
    f.vx[i] = ((f.x[i] - f.ox[i]) / h) * damp;
    f.vy[i] = ((f.y[i] - f.oy[i]) / h) * damp;
    if (f.contact[i]) f.vx[i] *= T.GROUND_GRIP;
  }
  f.tipSpeed = Math.hypot(f.vx[TIP] - f.vx[NECK], f.vy[TIP] - f.vy[NECK]);
}
