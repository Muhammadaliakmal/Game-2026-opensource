/**
 * Every number ECHO has.
 *
 * ── The one idea ─────────────────────────────────────────────────────────
 *
 * A run lasts a few seconds. When it ends, the level resets and the run you
 * just made becomes a ghost that repeats it exactly, on loop, while you make
 * the next one. A door needs a plate held; nobody is holding it; so the first
 * run stands on the plate and the second walks through. Every level after
 * that is the same trick with something in the way — a patrol to time, a
 * second plate behind the first door, a door that *closes* while its plate
 * is held so a ghost has to step off at the right moment.
 *
 * There is no enemy AI and no second player. The co-operation is entirely
 * the player's own past, which is why it feels like cleverness rather than
 * luck when it works.
 */

/** The virtual resolution. Letterboxed into the canvas — see host/view.ts. */
export const VIEW_W = 960;
export const VIEW_H = 540;
/** The strip across the top with the clock and the loop count. */
export const HUD_H = 40;
/** The room the level is built in, below the HUD. */
export const ROOM_W = VIEW_W;
export const ROOM_H = VIEW_H - HUD_H;

/** ── The runner ────────────────────────────────────────────────────────── */

/** Half-width of the runner's box. Boxes rather than circles: the walls are. */
export const PLAYER_R = 13;
/** Pixels per second at full stick. */
export const SPEED = 250;
/** Seconds to reach full speed from rest, and to stop. Small, not zero. */
export const ACCEL = 0.08;

/** ── Touch ─────────────────────────────────────────────────────────────── */

/**
 * The floating stick: the finger's first touch is the centre, and the drag
 * from it is the direction. Full speed this many pixels out.
 */
export const STICK_RADIUS = 48;
/** A drag shorter than this is a rest, not a move. */
export const STICK_DEADZONE = 6;

/** ── The loop ──────────────────────────────────────────────────────────── */

/** Steps the level holds still between runs, with the loop number up. */
export const RESET_STEPS = 45;
/** Steps the finish is held before the next level. */
export const CLEAR_STEPS = 60;
/** Steps the failure is held before the result. */
export const LOST_STEPS = 50;

/** ── Scoring ───────────────────────────────────────────────────────────── */

export const LEVEL_POINTS = 100;
/** Per loop the level was cleared under its budget. */
export const SPARE_LOOP_POINTS = 40;
/** Per whole second left on the clock of the winning run. */
export const TIME_POINTS = 5;

/** ── Juice ─────────────────────────────────────────────────────────────── */

export const SHAKE_PX = 5;
export const SHAKE_DECAY = 0.18;
