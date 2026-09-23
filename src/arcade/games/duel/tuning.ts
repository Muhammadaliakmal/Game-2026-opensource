/**
 * Every number the duel runs on.
 *
 * The same rule as every cabinet: nothing in `ragdoll.ts`, `combat.ts` or
 * `match.ts` is a bare constant, so feel is iterated here and the tests read
 * the same values the game does. Units are view pixels and seconds; the view
 * is the fixed 960x540 every cabinet letterboxes (see `host/view.ts`).
 */

export const VIEW_W = 960;
export const VIEW_H = 540;

/**
 * The fighter's scale against the arena.
 *
 * The robots in the asset pack stand about 80 px in this view — two and a
 * half tiles — and the skeleton was first built at 111. Every length, speed
 * and acceleration below that is a *distance* is multiplied by S, which is a
 * similarity: positions, velocities and accelerations all scale together and
 * time does not, so the fight plays exactly as it did, only smaller. Spring
 * gains are per unit of error and do not change. Damage is paid per px/s and
 * is divided by S so a hit still does what it did.
 */
export const S = 0.72;

// ── Simulation ─────────────────────────────────────────────────────────────

/**
 * Physics substeps per host step.
 *
 * A swung weapon tip moves 20-25 px per 1/60 s. Sampled once a frame, a
 * thin shaft passes clean through a 20 px torso between two samples and the
 * hit never registers; two substeps halve that, and the sweep test in
 * `combat.ts` covers what is left.
 */
export const SUBSTEPS = 2;
/** Constraint passes per substep. The skeleton is small; more buys nothing. */
export const ITERATIONS = 6;
export const GRAVITY = 2000 * S;
/** Fraction of velocity lost per second to air. A little, so nothing orbits. */
export const LINEAR_DAMP = 0.6;
/** Muscle accelerations are clamped here, so a bad target cannot explode. */
export const MAX_ACC = 42000 * S;
/** Sideways velocity kept per substep by a particle resting on a top face. */
export const GROUND_GRIP = 0.82;

// ── The skeleton ───────────────────────────────────────────────────────────

export const HEAD_R = 9;
/** Neck to the centre of the head. */
export const NECK_LEN = 17 * S;
export const TORSO = 38 * S;
export const THIGH = 25 * S;
export const SHIN = 25 * S;
export const UPPER_ARM = 21 * S;
export const FOREARM = 21 * S;
export const ARM_REACH = UPPER_ARM + FOREARM;
/** Pelvis height above the ground when standing: legs nearly straight. */
export const STAND_H = (THIGH + SHIN) * 0.9;
/** How far above STAND_H the ground may be and still hold the body up. */
export const SUPPORT_SLACK = 16 * S;

// ── Muscles (force per unit of error; divided by the particle's mass) ────

export const STAND_KP = 2600;
export const STAND_KD = 110;
export const UPRIGHT_KP = 5200;
export const UPRIGHT_KD = 160;
export const HEAD_KP = 2400;
export const HEAD_KD = 70;
export const FOOT_KP = 900;
export const FOOT_KD = 50;
export const KNEE_KP = 500;
export const KNEE_KD = 30;
/** The weapon arm. Underdamped on purpose — a swing should whip. */
export const ARM_KP = 1500;
export const ARM_KD = 34;
/** The arm's acceleration ceiling at gain 1. This, more than ARM_KP, sets swing speed. */
export const ARM_ACC = 15000 * S;
export const OFFARM_KP = 90;
export const OFFARM_KD = 10;
/** Arm strength with the stick at rest: a guard, not a grip of iron. */
export const GUARD_GAIN = 0.35;
/** Arm strength when out of stamina. */
export const TIRED_GAIN = 0.55;

// ── Movement ───────────────────────────────────────────────────────────────

export const WALK_SPEED = 250 * S;
/** How hard the body chases its walking speed, on the ground and in the air. */
export const WALK_K = 16;
export const AIR_K = 5;
export const JUMP_V = 820 * S;
/** Seconds after take-off before the ground can catch the body again. */
export const JUMP_AIR = 0.12;
/** Stick below this is neutral: no walk, arm at guard. */
export const STICK_DEAD = 0.28;
/** Walking needs the stick this far sideways, so aiming up does not drift. */
export const WALK_DEAD = 0.35;
export const STRIDE = 13 * S;
export const STRIDE_LEN = 30 * S;
export const STEP_LIFT = 9 * S;
/** Forward lean of the torso at full walking speed, in px at the neck. */
export const LEAN = 7 * S;

// ── Stamina: the "tendon" ─────────────────────────────────────────────────

export const STAMINA_MAX = 100;
/** Per second, when the arm is not being thrashed and nothing is charging. */
export const STAMINA_REGEN = 24;
/** Tip speed relative to the shoulder above which a swing costs stamina. */
export const SWING_FAST = 720 * S;
export const SWING_DRAIN = 14;
export const JUMP_COST = 10;
/** Tired below the first number, recovered above the second. */
export const TIRED_BELOW = 16;
export const TIRED_CLEAR = 40;

// ── The heavy swing: wind-up and release ──────────────────────────────────

/** Stamina needed to start charging. */
export const HEAVY_MIN_STAMINA = 30;
/** Stamina a full charge costs; a half charge costs 70% of it. */
export const HEAVY_COST = 34;
/** A release before this much charge is a cancel, not a swing. */
export const HEAVY_MIN_CHARGE = 0.14;
/** Charge beyond this adds nothing. */
export const HEAVY_FULL = 0.6;
/** How long the released swing drives the arm. */
export const HEAVY_SWING_T = 0.22;
/** Arm gain during the swing, at zero and at full charge. */
export const HEAVY_GAIN_MIN = 1.6;
export const HEAVY_GAIN_MAX = 3.0;
/** Forward lunge at full charge, px/s. */
export const LUNGE = 380 * S;
/** Damage multiplier added at full charge. */
export const HEAVY_DAMAGE = 0.8;

// ── Weapons ────────────────────────────────────────────────────────────────

export interface Weapon {
  readonly id: string;
  readonly name: string;
  /** Hand to tip. */
  readonly length: number;
  /** Mass at the tip. A heavy head swings slower and hits harder. */
  readonly tipMass: number;
  /** Collision radius of the tip. The shaft is always SHAFT_R. */
  readonly tipR: number;
  /** Damage per px/s of impact speed above MIN_HIT_SPEED. */
  readonly damage: number;
  /**
   * Arm strength multiplier, and the only thing that makes a heavy weapon
   * slow. The tip's muscle is scaled by its mass so the weapon points where
   * it is told at rest; without a weaker grip the maul swung exactly as fast
   * as the rod and simply hit harder.
   */
  readonly grip: number;
  /** Frame in the items atlas. Drawn with its grip on the hand. */
  readonly sprite: string;
}

export const SHAFT_R = 2.5;

/**
 * The launch pair. Same arm, same rules; mass and reach are the difference.
 *
 * Deliberately two and not eight: a weapon that is just a number change is
 * one the tests already cover, and anything with a signature ability of its
 * own (a hook, a shield) is new rules rather than new data. See `plan-duel.md`.
 */
export const WEAPONS: readonly Weapon[] = [
  // Lengths are the pack's sprites (`assets/duel/models/data/weapons.json`)
  // at this view's half scale: the rebar's shaft ends 110 px past the grip,
  // the maul's head is centred 99 px past it and 26 px tall.
  { id: "rebar", name: "Rebar", length: 55, tipMass: 0.55, tipR: 3, damage: 0.012 / S, grip: 1, sprite: "weapon/rebar" },
  { id: "maul", name: "Pylon Maul", length: 50, tipMass: 1.5, tipR: 11, damage: 0.02 / S, grip: 0.78, sprite: "weapon/pylon_maul" },
];

// ── Combat ─────────────────────────────────────────────────────────────────

export const HP = 100;
/** Impact speed below which contact is a graze and does nothing. */
export const MIN_HIT_SPEED = 380 * S;
/** One hit never does more than this, whatever the physics produced. */
export const MAX_HIT = 42;
export const LOCATION_MULT = { head: 1.5, torso: 1, limb: 0.55 } as const;
export type BodyPart = keyof typeof LOCATION_MULT;
/** A weapon cannot hit again for this long after it has landed. */
export const HIT_COOLDOWN = 0.22;
/** Knockback in px/s per point of damage, and its ceiling. */
export const KNOCK_PER_DMG = 26 * S;
export const KNOCK_MAX = 820 * S;
/** A hit this big or bigger staggers: the muscles let go for a moment. */
export const STUN_MIN = 9;
export const STUN_PER_DMG = 0.022;
export const STUN_MAX = 0.75;
/** Muscle strength regained per second after a stagger. */
export const RECOVER_RATE = 2.4;
/** Weapons meeting faster than this clash: both bounce, nobody is hurt. */
export const CLASH_SPEED = 420 * S;
export const CLASH_COOLDOWN = 0.16;

// ── Rounds ─────────────────────────────────────────────────────────────────

export const BEST_OF = 3;
export const ROUNDS_TO_WIN = Math.ceil(BEST_OF / 2);
/** Draws do not count, so a match needs a hard stop. */
export const MAX_ROUNDS = 5;
export const ROUND_TIME = 60;
export const INTRO_TIME = 1.3;
/** Sim time the loser keeps falling before the next round. */
export const KO_HOLD = 2.0;

// ── The lava: the arena beat ──────────────────────────────────────────────
//
// The timings belong to the arena (`arena.ts`, from the pack's own
// magma_gauntlet.json); these are what every lava shares.

/** Speed a body sinks at once it is in, px/s. It is out; this is for show. */
export const LAVA_SINK = 60 * S;

// ── Scoring (vs CPU only) ─────────────────────────────────────────────────

export const ROUND_POINTS = 100;
export const MATCH_BONUS = 300;
export const DIFFICULTY_MULT = { easy: 1, medium: 2, hard: 3 } as const;

// ── Feel ───────────────────────────────────────────────────────────────────

/** Host steps frozen per point of damage on a hit, and the ceiling. */
export const HITSTOP_PER_DMG = 0.16;
export const HITSTOP_MAX = 6;
export const SHAKE_PER_DMG = 0.45;
export const SHAKE_MAX = 14;
export const SHAKE_DECAY = 0.28;
/** Time scale for the first KO_SLOW_T seconds of a round-ending blow. */
export const KO_SLOW = 0.3;
export const KO_SLOW_T = 0.7;
/** Tip positions kept for the swing trail. */
export const TRAIL = 9;

// ── Touch ──────────────────────────────────────────────────────────────────

/**
 * Stick drag radius in view px.
 *
 * There is no flick-to-jump, though the plan asked for one: the backswing of
 * every overhead chop IS a fast flick upward, so a flick gesture would jump
 * on every other swing. Jump is a button.
 */
export const STICK_R = 64;
/** Touch buttons, in view px. Above the 48 css px floor on a 390px phone. */
export const BUTTON_R = 40;
