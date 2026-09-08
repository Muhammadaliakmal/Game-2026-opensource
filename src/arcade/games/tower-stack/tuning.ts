/**
 * Every number Tower Stack has.
 *
 * Same rule as Chunk Runner's: a reviewer changes the difficulty here or the
 * difficulty does not get changed.
 */

/** The view the game is simulated and drawn at, before letterboxing. */
export const VIEW_W = 960;
export const VIEW_H = 540;

/** ── The block ─────────────────────────────────────────────────────────── */

export const ROW_H = 28;
/** The first block's width. Everything after it is what survives a drop. */
export const START_W = 260;

/** ── The slide ─────────────────────────────────────────────────────────── */

export const SLIDE_SPEED = 180;
/** Added per row placed. */
export const SLIDE_INC = 6;
export const SLIDE_CAP = 520;

/** ── The perfect window ────────────────────────────────────────────────── */

/**
 * How close counts as perfect, in pixels.
 *
 * This number is the game. Without it every drop shaves the block a little,
 * every tower is a losing race against its own width, and the run ends the
 * same way every time no matter how well it is played — which is not a
 * difficulty curve, it is an execution.
 */
export const PERFECT_WINDOW = 4;

/**
 * Width handed back for a perfect, in pixels.
 *
 * Less than the window, deliberately: a perfect must be worth chasing without
 * making a perfect run infinitely wide.
 */
export const WIDTH_BONUS = 3;

/** ── Scoring ───────────────────────────────────────────────────────────── */

/** Points for placing a row at all. */
export const ROW_POINTS = 1;
/**
 * Extra points per row of an unbroken perfect combo.
 *
 * Escalating, so the fifth perfect in a row is worth more than the first. It
 * is the only place in the game where skill compounds.
 */
export const COMBO_POINTS = 1;

/** ── Presentation ──────────────────────────────────────────────────────── */

/** How many rows of the tower are kept for drawing. Below this is off screen. */
export const VISIBLE_ROWS = 26;
/** Sliced-off pieces falling at once. Pooled; never allocated mid-run. */
export const SLICES = 10;

/** Where the active block sits, as a fraction of the view height. */
export const DROP_LINE = 0.32;
/** How fast the camera eases to a new tower height, per second. */
export const CAM_LERP = 9;

/** Degrees of hue per row. A free, premium-looking gradient up the tower. */
export const HUE_STEP = 7;
export const HUE_START = 190;

/** Seconds a perfect's white flash lasts. */
export const FLASH_TIME = 0.18;
/** Seconds the combo counter stays up after the last perfect. */
export const COMBO_TIME = 1.2;
/** Semitones the perfect chime climbs per combo step, and its ceiling. */
export const COMBO_PITCH_MAX = 12;
