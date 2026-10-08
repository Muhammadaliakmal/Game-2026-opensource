/**
 * Every number Chunk Runner has.
 *
 * The rule this file exists for: a reviewer must be able to change the
 * difficulty without opening `sim.ts`. If a constant ends up inline over
 * there, it is a constant nobody will ever tune.
 */

/** ── The three numbers that ARE the game feel ─────────────────────────── */

/** Pixels per second squared, downward. Screen coordinates, so y grows down. */
export const GRAVITY = 1800;
/** Upward impulse on a jump. Negative because up is negative. */
export const JUMP_V = -620;
/**
 * How long after walking off a ledge a jump still works.
 *
 * Forgiveness, and not the optional kind. Without it, every missed jump feels
 * like the game stole the input — players press at the edge, believe they were
 * on the ground, and are right about the second part.
 */
export const COYOTE = 0.1;
/**
 * How long before landing a jump press is remembered.
 *
 * The mirror of coyote time: a player who presses one frame before touching
 * down meant to jump, and dropping it makes the game feel deaf.
 */
export const JUMP_BUFFER = 0.12;

/** ── Speed ─────────────────────────────────────────────────────────────── */

export const BASE_SPEED = 300;
/** Pixels per second, per second. Reaches the cap at about 53 seconds. */
export const SPEED_RAMP = 9;
export const SPEED_CAP = 780;

/**
 * Held-jump glide: gravity while falling with the button down.
 *
 * A fraction, not a fixed force, so it scales with the ramp. It buys a long
 * gap late in a run without turning the whole game into flying.
 */
export const GLIDE_GRAVITY = 0.45;
/** Only after the apex. Gliding upward would just be a bigger jump. */
export const GLIDE_MIN_VY = 0;

/** Releasing the button early cuts the rise, which is what makes a short hop. */
export const JUMP_CUT = 0.45;

/** ── The player ────────────────────────────────────────────────────────── */

export const PLAYER_W = 26;
export const PLAYER_H = 34;
/** Where the player sits across the canvas, as a fraction of its width. */
export const PLAYER_ANCHOR = 0.28;

/** ── Terrain ───────────────────────────────────────────────────────────── */

/** The baseline every platform height is measured up from, off the bottom. */
export const GROUND_Y = 90;
/** Platform widths, in pixels. */
export const CHUNK_MIN_W = 120;
export const CHUNK_MAX_W = 340;
/**
 * Gaps, at base speed. Scaled with the current speed in `sim.ts` — a gap that
 * is a fair jump at 300 px/s is a free one at 780, so difficulty has to come
 * from spacing rather than from speed alone. Section 4.1 is explicit about it.
 */
export const GAP_MIN = 90;
export const GAP_MAX = 260;
/** Step heights between neighbouring platforms. */
export const STEP_MAX = 96;
export const HEIGHT_MIN = 0;
export const HEIGHT_MAX = 210;

/** How many platforms exist at once. Fixed: the ring buffer never grows. */
export const CHUNKS = 14;
/**
 * How many gold blocks exist at once. Also fixed, also recycled.
 *
 * Must cover every platform's worth at once: CHUNKS x the most a platform
 * carries (4). Any fewer and a recycled platform's coins take the slot of the
 * oldest live coin, which is the one on the platform just ahead of the runner
 * — they vanish in the first seconds of the run.
 */
export const COINS = CHUNKS * 4;
/** How many spikes exist at once: at most one per platform, for the same reason. */
export const SPIKES = CHUNKS;

export const COIN_R = 9;
export const SPIKE_W = 22;
export const SPIKE_H = 20;

/** ── Difficulty over time ──────────────────────────────────────────────── */

/** Seconds of a run before spikes start appearing at all. */
export const SPIKE_GRACE = 12;
/** Chance a platform gets a spike, once they have started. */
export const SPIKE_CHANCE = 0.35;
/** Chance a platform carries a line of gold. */
export const COIN_CHANCE = 0.55;

/** ── Scoring ───────────────────────────────────────────────────────────── */

/** Pixels of ground covered per point. */
export const PIXELS_PER_POINT = 20;
/** What one gold block is worth, in points. */
export const COIN_POINTS = 10;

/** ── Juice ─────────────────────────────────────────────────────────────── */

export const SHAKE_PX = 6;
export const SHAKE_DECAY = 0.2;
/** Frames the whole game freezes on death, at 60 Hz. */
export const HIT_STOP_STEPS = 8;
/** How high a coin streak may raise the pitch, in semitones. */
export const COIN_PITCH_MAX = 12;

/** ── The view ──────────────────────────────────────────────────────────── */

/**
 * The virtual resolution the game is played at, whatever the canvas is.
 *
 * Not a detail. A game that simulates at the canvas size gives a wide monitor
 * more warning about the next gap than a phone gets, which makes the same run
 * a different difficulty on different hardware — and it means a resize
 * mid-run moves the ground under the player. Fixing the resolution and
 * scaling the picture to fit settles both: one course, one difficulty, and a
 * resize that is purely a matter of drawing.
 */
export const VIEW_W = 960;
export const VIEW_H = 540;
