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

/**
 * ── The ground, and why the game needed one ──────────────────────────────
 *
 * The tower used to be drawn top-down from the drop line: the newest row sat
 * at `DROP_LINE` and every older one below it. That is arithmetically the same
 * tower and visually the opposite game. On the first drop the base floated in
 * the middle of an empty screen with nothing under it; by the third the three
 * rows read as a stack growing DOWNWARD, because the top was pinned and the
 * bottom was the end that moved. A game called Tower Stack in which the tower
 * descends is not conveying its own mechanic.
 *
 * So the tower is anchored to a floor instead, and the camera only starts to
 * climb once the stack is tall enough to need it — which is what every game of
 * this kind does and the reason `cam` was in the simulation all along without
 * anything reading it.
 */
/** Height of the ground plate, in view pixels. */
export const GROUND_H = 46;
/** Screen y of the top of the ground. The base row rests on this. */
export const FLOOR_Y = VIEW_H - GROUND_H;
/**
 * How much tower fits between the floor and the drop line.
 *
 * Past this the view scrolls instead of the tower running off the top, so the
 * play line stays at a comfortable height for the whole run.
 */
export const CLIMB = FLOOR_Y - VIEW_H * DROP_LINE;

/** Degrees of hue per row. A free, premium-looking gradient up the tower. */
export const HUE_STEP = 7;
export const HUE_START = 190;

/** Seconds a perfect's white flash lasts. */
export const FLASH_TIME = 0.18;
/** Seconds the combo counter stays up after the last perfect. */
export const COMBO_TIME = 1.2;
/** Semitones the perfect chime climbs per combo step, and its ceiling. */
export const COMBO_PITCH_MAX = 12;

/**
 * A placed block that kept less than this of itself gets the near-miss
 * sting. A third: wide enough that it fires a few times in a decent run,
 * narrow enough that it still means something when it does.
 */
export const NEAR_MISS_KEPT = 0.34;
