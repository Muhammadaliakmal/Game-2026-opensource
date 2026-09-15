/**
 * The Lucky Run.
 *
 * ── What it is ───────────────────────────────────────────────────────────
 *
 * Occasionally, a course payout is doubled. Not the medal, not the time, not
 * the board — only the coins, and only on a run that was already going to be
 * paid. A variable reward on top of a fixed one is the oldest engagement
 * trick there is, and the spec asks for it with two conditions attached:
 * keep it rare, and never sell it. Both are held here.
 *
 * ── Why the server rolls the die ─────────────────────────────────────────
 *
 * The client cannot be told "you were lucky" and then asked to report it
 * back; it would be lucky every time. The roll happens in the runs route,
 * against the payout it has just computed, and the doubled amount is what
 * goes into the wallet. The client only ever learns the outcome.
 *
 * ── Why it only doubles a payout that exists ─────────────────────────────
 *
 * `coinAward` pays the difference against your best, so most runs pay zero
 * and a lucky zero is still zero. Doubling nothing and announcing it would
 * be the game shouting "LUCKY" at a player who got nothing, which is worse
 * than silence. The roll is skipped entirely when there is nothing to double.
 */

/** One run in twelve. Rare enough to be a surprise, common enough to be seen. */
export const LUCKY_ODDS = 1 / 12;

/** The multiplier. Two, and not a jackpot — this is a cosmetic economy. */
export const LUCKY_MULTIPLIER = 2;

/**
 * Roll for a payout. Returns the amount to pay and whether it was doubled.
 * `random` is injectable so the test can make the die land.
 */
export function luckyRoll(
  earned: number,
  random: () => number = Math.random
): { earned: number; lucky: boolean } {
  if (earned <= 0) return { earned: 0, lucky: false };
  if (random() < LUCKY_ODDS) return { earned: earned * LUCKY_MULTIPLIER, lucky: true };
  return { earned, lucky: false };
}
