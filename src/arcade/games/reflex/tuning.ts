/**
 * Every number Reflex has.
 *
 * Same rule as the other cabinets': the difficulty is changed here or it is
 * not changed. A constant that appears in `sim.ts` is a constant nobody will
 * find when they want to make the game easier.
 */

/** The view the game is simulated and drawn at, before letterboxing. */
export const VIEW_W = 960;
export const VIEW_H = 540;

/* ── The play field ────────────────────────────────────────────────────── */

/**
 * How far a target's centre stays from the edge.
 *
 * Its own radius plus a margin, so a target is never half off the screen and
 * never tucked under the score readout in the corner. A target you cannot
 * fully see is a target you blame the game for missing.
 */
export const EDGE_INSET = 96;

/* ── The target ────────────────────────────────────────────────────────── */

export const TARGET_R = 44;

/**
 * How long a target survives, in seconds, at the start and at the end.
 *
 * This is the game. The window is the only thing that gets harder — the
 * targets do not move, do not shrink, and never overlap — so the whole
 * difficulty curve is the distance between these two numbers and how fast
 * `RAMP_HITS` closes it.
 *
 * 1.6s is generous enough that the first few are free, which is what buys the
 * player the half-second of learning where to look. 0.44s is a shade under
 * average human visual reaction plus a mouse movement, so the top of the curve
 * is genuinely at the edge rather than merely fast.
 */
export const WINDOW_START = 1.6;
export const WINDOW_END = 0.44;

/** Hits to travel the whole way from `WINDOW_START` to `WINDOW_END`. */
export const RAMP_HITS = 40;

/* ── Spawning ──────────────────────────────────────────────────────────── */

/** Seconds between spawns, at the start and once the ramp is done. */
export const SPAWN_START = 0.9;
export const SPAWN_END = 0.42;

/**
 * The most that can be on screen at once.
 *
 * Three, and it is a difficulty ceiling rather than a performance one. Two is
 * a queue and never a decision; four or more turns a reaction test into a
 * triage puzzle, where the skill is choosing which to abandon and the shrinking
 * window stops being the thing being tested.
 */
export const MAX_TARGETS = 3;

/**
 * How far apart two live targets' centres must be.
 *
 * Two overlapping circles make a tap ambiguous, and an ambiguous tap in a game
 * about precision under time pressure reads as the game cheating. Two radii
 * plus a margin: they may sit close, never touching.
 */
export const MIN_SEPARATION = TARGET_R * 2 + 24;

/**
 * Attempts to place a target before giving up for this spawn.
 *
 * Rejection sampling against `MIN_SEPARATION`. It gives up rather than looping
 * forever because with three targets on a field this size a failure is nearly
 * impossible and an infinite loop inside a fixed timestep is a hung tab.
 */
export const PLACE_TRIES = 24;

/* ── Scoring ───────────────────────────────────────────────────────────── */

export const HIT_POINTS = 10;

/**
 * Extra points per consecutive hit, and where the bonus stops growing.
 *
 * The streak is the reason to keep going once the window is at its floor:
 * past the ramp nothing else changes, so the run needs a number that is still
 * climbing. Capped, because an uncapped streak makes the first ninety seconds
 * of every run worthless by comparison.
 */
export const STREAK_BONUS = 2;
export const STREAK_CAP = 15;

/** Semitones the hit sound climbs per streak, and its ceiling. */
export const PITCH_PER_STREAK = 1;
export const PITCH_MAX = 12;

/* ── Failure ───────────────────────────────────────────────────────────── */

/**
 * Lives, spent when a target expires untouched.
 *
 * Three, so a single lapse is not the run. Tapping empty space costs the
 * streak and nothing else: punishing a miss with a life would make the
 * correct strategy "wait until certain", which is the opposite of the game.
 */
export const LIVES = 3;

/** Seconds the world holds still after the last life, before the score screen. */
export const DEATH_FREEZE = 0.7;

/* ── Juice ─────────────────────────────────────────────────────────────── */

/** Seconds a hit's burst ring expands for. */
export const BURST_TIME = 0.32;
/** Seconds of screen shake after a target expires, and its amplitude. */
export const SHAKE_TIME = 0.24;
export const SHAKE_AMP = 7;
