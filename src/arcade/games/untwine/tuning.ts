/**
 * Every number Untwine has.
 *
 * ── The one idea ─────────────────────────────────────────────────────────
 *
 * A board packed with bent lines, each with an arrowhead. Tap one and it
 * slides out the way its head points, the body following the head like a
 * snake — but only if nothing is in the way between the head and the edge.
 * If something is, it lunges, bumps the line that blocks it, springs back,
 * and costs a heart. Clear the board and the next one is bigger.
 *
 * That is the rule set of the arrow-escape puzzles that took the charts in
 * 2025–26, and it is a rule set, not anyone's game: the genre goes back to
 * sliding-block puzzles, and nothing here borrows a name, a layout or a look.
 * See `reports/Arrow puzzle and parkour camera.md` at the workspace root.
 *
 * ── Why it can never soft-lock ──────────────────────────────────────────
 *
 * Removing a line only ever empties cells. So the set of lines that can
 * leave only grows, and any order of legal taps clears the board — a level
 * is solvable exactly when its "is blocked by" graph has no cycle. The
 * generator builds levels in a removal order it keeps, so every level is
 * solvable by construction, and `generate.test.ts` proves it on hundreds of
 * seeds rather than trusting the construction.
 *
 * ── What it deliberately does not have ──────────────────────────────────
 *
 * The commercial versions sell hint packs, life refills, streak freezes and
 * an ad to continue. None of that is here (SPEC §1): hearts are per run and
 * refill a little on a clean board, a hint is free once per board, and a
 * run that ends just ends.
 */

export const VIEW_W = 960;
export const VIEW_H = 540;
export const HUD_H = 60;
/** Margin round the board inside the view, in view pixels. */
export const BOARD_PAD = 18;
/** Never draw a cell bigger than this, or a 4×4 tutorial fills the screen. */
export const MAX_CELL = 64;

/** ── Hearts and scoring ──────────────────────────────────────────────── */

export const HEARTS = 3;
/** Points for a line pulled free, before the chain. */
export const PULL_POINTS = 10;
/** Extra points per step of chain, capped at CHAIN_CAP steps. */
export const CHAIN_POINTS = 5;
export const CHAIN_CAP = 10;
/**
 * Two pulls closer together than this extend the chain.
 *
 * Long enough that reading the next free line counts, short enough that
 * stopping to think breaks it — the chain rewards fluency, not speed alone.
 */
export const CHAIN_WINDOW = 1.4;
/** A cleared board pays this, plus HEART_BONUS for every heart still held. */
export const CLEAR_POINTS = 100;
export const HEART_BONUS = 50;

/** ── Timing (seconds) ────────────────────────────────────────────────── */

/** Lines pop in over this long when a board starts; taps wait for it. */
export const INTRO = 0.55;
/** The cleared-board banner, before the next board is dealt. */
export const CLEAR_HOLD = 1.35;
/** The out-of-hearts banner, before the run is over. */
export const LOST_HOLD = 1.6;
/** A freed line starts at this many cells a second and accelerates. */
export const SLIDE_V0 = 7;
export const SLIDE_ACCEL = 70;
export const SLIDE_VMAX = 30;
/** A blocked line runs at the blocker at this speed, then springs back. */
export const LUNGE_SPEED = 26;
/** How far into the blocker it bumps, in cells. */
export const LUNGE_OVERSHOOT = 0.22;
export const LUNGE_BACK = 0.24;
/** The red flash on a blocked line and its blocker. */
export const FLASH = 0.45;
/** How long a hinted line pulses for, unless it is pulled first. */
export const HINT_TIME = 6;

/** ── Juice ───────────────────────────────────────────────────────────── */

export const SHAKE_PX = 7;
export const SHAKE_DECAY = 0.18;
