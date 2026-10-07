/**
 * When an interstitial is allowed between arcade runs. Pure, so the rule is
 * tested rather than described (`game-ads-policy.test.ts`).
 *
 * Google's placement policy forbids full-screen ads that "appear
 * unexpectedly" or "trigger after every user interaction"
 * (support.google.com/publisherpolicies/answer/11975916). Google also caps
 * frequency on its side, but its cap is tuned for revenue, and a cabinet run
 * can be fifteen seconds long. So this site adds its own floor on top:
 *
 *  - **Never in a player's first few runs.** The first minutes are when
 *    somebody decides whether the game is worth staying for, and an ad there
 *    costs the player before it has earned anything from them.
 *  - **Never within `MIN_GAP_MS` of the last ad**, rewarded or not. A player
 *    who just chose to watch one has paid for a quiet stretch.
 */

/** Runs a session must finish before the first interstitial. */
export const FREE_RUNS = 3;

/** The least time between two full-screen ads of any kind. */
export const MIN_GAP_MS = 3 * 60 * 1000;

export type AdPacing = {
  /** Runs finished this page session. */
  runs: number;
  /** When the last ad of any kind started, or null for none yet. */
  lastAdAt: number | null;
};

export function interstitialAllowed(p: AdPacing, now: number): boolean {
  if (p.runs < FREE_RUNS) return false;
  if (p.lastAdAt !== null && now - p.lastAdAt < MIN_GAP_MS) return false;
  return true;
}

/**
 * The coins a watched rewarded ad adds: the run's own payout again, capped.
 *
 * The server applies the same cap and the arcade's daily ceiling on top
 * (`api/arcade/bonus`), so this is what the button promises, not what
 * defends the balance.
 */
export const MAX_BONUS = 200;

export function bonusFor(earned: number | null): number {
  if (earned === null || !Number.isFinite(earned) || earned <= 0) return 0;
  return Math.min(Math.floor(earned), MAX_BONUS);
}

/**
 * What one watched ad in the shop pays (`ShopAdReward`). Under `MAX_BONUS`,
 * which the bonus route clamps to, and out of the same daily pool — so ten
 * ads is a day's ceiling, and a 1,250-coin character is about thirteen ads.
 */
export const SHOP_AD_COINS = 100;
