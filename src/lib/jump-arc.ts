import { FEEL } from "./feel";

/**
 * What the character can actually reach with one jump.
 *
 * ── Why this is a module and not a number in a comment ───────────────────
 *
 * `lib/parkour.ts` carries the sentence "with jumpVel 5.5 the character rises
 * ~1.5 units — so every rise is at most 1 cell and every gap at most 2". That
 * was true when it was written and it is a constant folded by hand: change
 * `FEEL.jumpVel` or `FEEL.fallGravityScale` and the comment stays, the courses
 * stay, and some of them quietly become impossible. Nothing fails. Nobody
 * finds out until a player cannot make the fourth jump.
 *
 * So the arc is computed from FEEL here, the courses are built against it, and
 * `courses.test.ts` walks every shipped course with it. Retune the feel and
 * the tests say which levels no longer work.
 *
 * ── The arc ──────────────────────────────────────────────────────────────
 *
 * Rise and fall use different gravities — `fallGravityScale` is the single
 * biggest feel lever in the game and it makes the arc asymmetric, so the naive
 * `2 * v / g` airtime is wrong by about 40%. Up is `GRAVITY`, down is
 * `GRAVITY * fallGravityScale`, and long drops additionally clamp at
 * `maxFallSpeed`.
 *
 * Horizontal speed is treated as constant through the jump. That is a
 * simplification — `airControl` is 0.15, so a player who takes off at full run
 * speed keeps almost all of it, and one who does not never had it. It errs
 * toward optimism, which is exactly why nothing is designed at 100% of the
 * result: see DESIGN_MARGIN.
 */

/** Rapier's default, and the value FEEL's numbers were tuned against. */
export const GRAVITY = 9.81;

const G_UP = GRAVITY;
const G_DOWN = GRAVITY * FEEL.fallGravityScale;

/**
 * The highest a standing jump reaches, in world units.
 *
 * `v0^2 / 2g` — the fall scale plays no part in it, because the character is
 * still rising.
 */
export const APEX = (FEEL.jumpVel * FEEL.jumpVel) / (2 * G_UP);

/** Distance fallen before hitting `maxFallSpeed`; past this the fall is linear. */
const TERMINAL_DROP = (FEEL.maxFallSpeed * FEEL.maxFallSpeed) / (2 * G_DOWN);

/** Seconds to fall `d` units from rest, respecting terminal velocity. */
function fallTime(d: number): number {
  if (d <= 0) return 0;
  if (d <= TERMINAL_DROP) return Math.sqrt((2 * d) / G_DOWN);
  return FEEL.maxFallSpeed / G_DOWN + (d - TERMINAL_DROP) / FEEL.maxFallSpeed;
}

/**
 * Seconds in the air for a jump that lands `rise` units above the takeoff
 * (negative for a drop), or `null` if the landing is above the arc's peak.
 *
 * A landing exactly at APEX is "reachable" for zero seconds, which is not a
 * jump anyone can make; the caller gets a finite but tiny airtime and the
 * margin below turns it into a gap of roughly nothing. That is the correct
 * answer rather than a special case.
 */
export function airTime(rise: number): number | null {
  if (rise > APEX) return null;
  return FEEL.jumpVel / G_UP + fallTime(APEX - rise);
}

/**
 * How far the character travels horizontally clearing a `rise`-unit step, at
 * `speed` units/sec. `null` when the step is taller than the jump.
 */
export function jumpReach(rise: number, speed: number = FEEL.runSpeed): number | null {
  const t = airTime(rise);
  return t === null ? null : t * speed;
}

/**
 * The fraction of the theoretical reach a course is allowed to ask for.
 *
 * A jump designed at 100% is one the player makes only by taking off on the
 * last frame of the platform at exactly full speed, which is a frame-perfect
 * input for a move the game asks for a hundred times a run. The remaining 20%
 * is the difference between a course that is hard and one that is unfair —
 * and it also absorbs the optimism in the constant-speed assumption above.
 *
 * Expert courses spend this margin, not the safety underneath it.
 */
export const DESIGN_MARGIN = 0.8;

/**
 * The longest gap a course may ask for at this rise, centre to centre.
 *
 * This is the number level geometry is built and asserted against — never
 * `jumpReach` directly.
 */
export function maxGap(rise: number, speed: number = FEEL.runSpeed): number {
  const reach = jumpReach(rise, speed);
  return reach === null ? 0 : reach * DESIGN_MARGIN;
}

/**
 * Can the character cross `gap` empty cells landing `rise` units up or down?
 *
 * The predicate every course is built and tested against. `gap` is a count of
 * empty cells and not a centre-to-centre distance, because the character takes
 * off at the leading edge of one platform and lands on the leading edge of the
 * next: two pads three cells apart centre-to-centre have two cells of air
 * between them, and two cells of air is what has to be flown.
 */
export function canClear(gap: number, rise: number): boolean {
  const reach = jumpReach(rise);
  return reach !== null && gap <= reach * DESIGN_MARGIN;
}
