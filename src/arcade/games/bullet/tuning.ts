/**
 * Every number One Bullet has.
 *
 * ── The one idea ─────────────────────────────────────────────────────────
 *
 * One shot per room, and it does not stop when it hits something. It comes
 * off walls, turns at mirrors, goes through glass and leaves it broken,
 * throws a switch and bounces on, shoves a crate a tile, sets off a charge,
 * and puts down every target it passes through. The room is cleared when
 * no target is left; the shot is spent when it has bounced its budget out.
 * The puzzle is never "how do I hit that" — it is "how do I make one shot
 * do all of it, in the right order".
 *
 * ── Aim, then let go ─────────────────────────────────────────────────────
 *
 * On touch the finger drags the aim and the release fires; a drag pulled
 * back short is a cancel. The path is drawn ahead while aiming, up to a
 * few bounces, so the room can be *read* — a bounce you cannot predict is
 * not a puzzle, it is a dice roll.
 */

export const VIEW_W = 960;
export const VIEW_H = 540;
export const HUD_H = 60;

export const TILE = 40;
export const COLS = 24;
export const ROWS = 12;

/** ── The shot ──────────────────────────────────────────────────────────── */

/** Pixels per second. */
export const SPEED = 640;
/** Pixels per substep of the march. Small enough never to skip a tile. */
export const MARCH = 4;
/**
 * The bounce budget is per room (`levels.ts`), and small. With ten bounces
 * in an open room almost any angle wins eventually; with one or two, the
 * room is the puzzle.
 */
/** Whatever the bounces, a shot ends after this many pixels of travel. */
export const MAX_TRAVEL = 9000;
/** How many bounces the aiming line shows. */
export const PREVIEW_BOUNCES = 2;
/** How far the aiming line goes, in pixels. */
export const PREVIEW_LENGTH = 1400;

/** ── Aim ───────────────────────────────────────────────────────────────── */

/** Radians per second with an arrow key held. */
export const AIM_RATE = 1.4;
/** With shift held: fine aim. */
export const AIM_FINE = 0.35;
/** A drag shorter than this on release is a cancel, not a shot. */
export const CANCEL_PX = 28;

/** ── The run ───────────────────────────────────────────────────────────── */

export const LIVES = 3;
/** Steps after the shot is spent before the level resets. */
export const SPENT_STEPS = 45;
/** Steps the finish is held. */
export const CLEAR_STEPS = 50;

/** ── Scoring ───────────────────────────────────────────────────────────── */

export const LEVEL_POINTS = 100;
export const TARGET_POINTS = 20;
/** Per bounce the winning shot took: a longer chain is the point. */
export const BOUNCE_POINTS = 5;
export const LIFE_POINTS = 50;

/** ── Juice ─────────────────────────────────────────────────────────────── */

export const SHAKE_PX = 5;
export const SHAKE_DECAY = 0.2;
/** Trail samples kept behind the shot. */
export const TRAIL = 24;
