/**
 * What an arcade run is worth.
 *
 * ── Why this is not the course rule ──────────────────────────────────────
 *
 * `lib/coins.ts` pays the *difference* between your best result on a course
 * and the one you just got, so a course pays out at most once however many
 * times it is run. That works because a course has a fixed top: the Author
 * time exists, and the geometry bounds it.
 *
 * An endless runner has no top. There is no "best possible" score for a
 * difference to be measured against, so the same trick does not transfer and
 * paying per run is the only rule that leaves the game worth playing twice.
 * Which makes the arcade farmable by construction — a longer session is more
 * coins, and a score is a number a client computes.
 *
 * ── So the bound is the day, and it is a hard one ────────────────────────
 *
 * Two limits, doing two different jobs, and it is worth being precise about
 * which is which because the soft one on its own bounds nothing:
 *
 *  - `DAILY_SOFT_CAP` is the *design* limit. Past it a run pays a fifth, so
 *    grinding has sharply diminishing returns without ever paying zero.
 *  - `DAILY_HARD_CAP` is the *security* limit. It is the only thing standing
 *    between a forged score and an unlimited balance, because a fifth of an
 *    arbitrarily large number is still arbitrarily large.
 *
 * A soft cap alone reads like a defence and is not one. The hard ceiling is
 * what makes the honest sentence sayable: the arcade pays at most a thousand
 * coins a day to anybody, however they got their score.
 *
 * This is the same position `coins.ts` states for courses — what this buys is
 * a cosmetic, the guard that matters is the one protecting the leaderboard
 * everybody else reads, and a second weaker claim is not worth making.
 *
 * ── Why the soft cap is soft ─────────────────────────────────────────────
 *
 * A hard cut at 500 would turn the best session of somebody's week into a run
 * worth nothing, and a game that pays zero is a game you stop playing at
 * exactly the moment you were enjoying it. A fifth still rises with skill and
 * still shows a number going up.
 */

/** Coins a day of play pays at full rate. The design limit. */
export const DAILY_SOFT_CAP = 500;

/** The rate beyond it. Never zero — see above. */
export const OVER_CAP_RATE = 0.2;

/**
 * The most the arcade will pay one player in one day, by any route.
 *
 * The security limit, and the one that has to be enforced where the balance
 * lives rather than where the score is computed.
 */
export const DAILY_HARD_CAP = 1000;

/**
 * The coins a finished run pays, given what the player has already earned
 * today.
 *
 * Split across the soft cap rather than switched at it: a run that crosses the
 * line is paid in full up to it and at the reduced rate after, so there is no
 * cliff where a better run pays less than a worse one. Then clamped to
 * whatever the day has left.
 */
export function payout(
  score: number,
  coinsPerPoint: number,
  earnedToday: number
): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  if (!Number.isFinite(coinsPerPoint) || coinsPerPoint <= 0) return 0;

  const already = Number.isFinite(earnedToday) ? Math.max(0, earnedToday) : 0;
  const raw = score * coinsPerPoint;

  const room = Math.max(0, DAILY_SOFT_CAP - already);
  const atFull = Math.min(raw, room);
  const earned = atFull + (raw - atFull) * OVER_CAP_RATE;

  // The day's ceiling, applied last. Everything above is tuning; this is the
  // line a forged score cannot cross.
  const left = Math.max(0, DAILY_HARD_CAP - already);
  return Math.floor(Math.min(earned, left));
}
