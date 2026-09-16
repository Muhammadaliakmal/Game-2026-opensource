/**
 * Every number Gravity Shift has.
 *
 * ── The one idea ─────────────────────────────────────────────────────────
 *
 * You do not move the ball. You choose which way is down, and the ball
 * falls. Four directions, a room made of walls, spikes and glass, and a way
 * out — and every level is the question "in what order should the world
 * tip?". The doc's difficulty ladder is the level order: plain rooms first,
 * then glass that only breaks at speed (so a fall has to be a long one),
 * then rooms that need down to change *mid-fall*.
 *
 * ── Everything is a tile ─────────────────────────────────────────────────
 *
 * A level is 24 columns by 12 rows of 40 px tiles, written as strings in
 * `levels.ts`. The ball is a box of `BALL_R` half-width resolved against
 * the tiles one axis at a time, the same collision the runner uses in ECHO.
 * A tile-based room is what lets the solution be reasoned about — "that
 * wall is three tiles down" — and the test file plays each level's intended
 * solution through the real simulation to prove it can be done.
 */

export const VIEW_W = 960;
export const VIEW_H = 540;
export const HUD_H = 60;

export const TILE = 40;
export const COLS = 24;
export const ROWS = 12;

/** ── The ball ──────────────────────────────────────────────────────────── */

/** Half-width of the ball's box. Under half a tile so it fits a corridor. */
export const BALL_R = 15;
/** Pixels per second squared, along whichever way is down. */
export const GRAVITY = 1500;
/** Terminal speed. Under this, a fall across the room is a second and a bit. */
export const MAX_SPEED = 720;
/**
 * Per-second decay of the speed *across* a surface the ball is resting on.
 * The ball has to stop somewhere, or a tipped room never settles — but not
 * instantly, so a fall onto a ledge slides off it if the ledge is short.
 */
export const FRICTION = 7;
/** Speed below which a resting ball is called still, for the solver and the HUD. */
export const REST_SPEED = 4;

/** ── Glass ─────────────────────────────────────────────────────────────── */

/**
 * How fast the ball must arrive to break a glass tile. A fall of four tiles
 * from rest reaches ~690 px/s; three tiles ~600; two ~490. So four breaks
 * it, two does not, and that distance is what the glass levels are about.
 */
export const BREAK_SPEED = 560;
/** The ball keeps this much of its speed through the glass. */
export const BREAK_KEEP = 0.6;

/** ── Zones ─────────────────────────────────────────────────────────────── */

/** Gravity inside a light zone, as a fraction. The difficulty-two rooms. */
export const LIGHT_GRAVITY = 0.35;

/** ── The run ───────────────────────────────────────────────────────────── */

export const LIVES = 3;
/** Steps the death is held before the level resets. */
export const DEATH_STEPS = 40;
/** Steps the finish is held before the next level. */
export const CLEAR_STEPS = 50;

/** ── Scoring ───────────────────────────────────────────────────────────── */

export const LEVEL_POINTS = 100;
export const COIN_POINTS = 15;
/** Per life left at the end. */
export const LIFE_POINTS = 50;

/** ── Juice ─────────────────────────────────────────────────────────────── */

export const SHAKE_PX = 6;
export const SHAKE_DECAY = 0.2;
/** Speed above which a landing thumps and puffs. */
export const HARD_LANDING = 400;
