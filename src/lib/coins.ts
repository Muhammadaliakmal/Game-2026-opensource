import type { Medal } from "./medals";

/**
 * What a run is worth.
 *
 * ── The rule, in one sentence ────────────────────────────────────────────
 *
 * A course pays you the difference between the best result you have ever had
 * on it and the one you just got — so each course pays out at most `author`
 * coins in total, however many times you run it.
 *
 * ── Why it is a difference and not a payment ─────────────────────────────
 *
 * The obvious rule is "finish a course, get coins". It is also the rule that
 * turns the easiest course in the game into a vending machine: `parkour` takes
 * half a minute, and a player who wants the 1,200-coin character grinds it
 * forty times rather than playing anything. Paying per *attempt* is farmable
 * by definition, because attempts are unlimited and free.
 *
 * Paying for improvement is not. `runs` already keeps one row per player per
 * course holding their best, so "the best you have ever had here" is a column
 * rather than a new table, and the payout for a course is bounded by its top
 * tier no matter how the player gets there — in one Author run, or in five
 * steps from a bare finish upward. Both routes pay the same total, which is
 * the property that makes this fair rather than merely un-farmable.
 *
 * ── What it is not ───────────────────────────────────────────────────────
 *
 * It is not anti-cheat. A time is only checked against the course's physical
 * floor (see `medals.ts`), so somebody determined can post a near-floor time
 * and collect an Author payout they did not earn. That buys them a cosmetic.
 * The guard that matters — the one protecting the board everybody else reads —
 * is the same one it always was, and this deliberately does not add a second,
 * weaker claim on top of it.
 */

/**
 * The coins a result is worth, cumulatively.
 *
 * Not linear, and steeply so at the top: Bronze is "you finished it
 * competently" and is meant to arrive on a first or second clear, while Author
 * is a time nobody is expected to reach. The gap between them is what makes
 * the 1,200-coin character a run of good races rather than a wait.
 */
const TIER: Record<Medal, number> = {
  author: 300,
  gold: 140,
  silver: 60,
  bronze: 25,
};

/**
 * A finish that earned no medal is still a finish, and still pays.
 *
 * `medals.ts` is explicit that a medal-less finish is a real outcome and not a
 * failure — the course was completed, which is the thing that matters. Paying
 * zero for it would quietly contradict that, and would make the first hour of
 * a new player's game earn nothing at all.
 */
const FINISH = 10;

/** What having this result on a course is worth in total. */
export function valueOf(medal: Medal | null | undefined): number {
  if (medal === null || medal === undefined) return 0;
  return TIER[medal] ?? 0;
}

/**
 * The coins a finish earns, given the best result already held on that course.
 *
 * `before` is undefined when this is the first time the course has ever been
 * finished. Both arguments accept null, which means "finished, no medal" —
 * distinct from undefined, which means "never finished".
 */
export function coinAward(
  before: Medal | null | undefined,
  after: Medal | null
): number {
  const had = before === undefined ? 0 : Math.max(FINISH, valueOf(before));
  const now = Math.max(FINISH, valueOf(after));
  // Never negative. A time can only improve here — the run is not written at
  // all unless it beat the stored one, and a better time cannot earn a worse
  // medal — but a rule that can pay out negative coins is one bad refactor
  // away from taking somebody's balance, so it is clamped rather than trusted.
  return Math.max(0, now - had);
}

/** The most any single course can ever pay a player. */
export const MAX_PER_COURSE = TIER.author;
