/**
 * Every number Ludo has an opinion about.
 *
 * Here rather than inline for the reason the other cabinets keep a
 * `tuning.ts`: these are values to be *played with*, and a weight buried in a
 * `switch` inside a scoring function is a weight nobody ever tunes.
 */

/** Tokens per seat in the standard game. */
export const TOKENS_STANDARD = 4;

/** And in Quick Ludo, which is the default — see below. */
export const TOKENS_QUICK = 2;

/**
 * Quick Ludo is the default mode, and that is a real decision.
 *
 * A standard four-token match runs twelve to twenty minutes. That is longer
 * than the entire session most people give a browser arcade, and it is far
 * longer than the runners in the next two cabinets — a player who bounces off
 * a twenty-minute commitment never learns the game is good. Two tokens lands
 * in four to six minutes and keeps every rule that makes Ludo interesting:
 * captures, safe cells, the exact roll home.
 */
export const DEFAULT_QUICK = true;

export interface LudoSettings {
  /** 1, 2 or 4. */
  tokens: number;
  /** Whether a 1 also releases a token from the yard. */
  unlockOnOne: boolean;
  /** A capture grants another roll. */
  captureExtraTurn: boolean;
  /**
   * The match stops at the first seat home, rather than playing out 2nd and
   * 3rd. Default on, and `plan-phase8.md` §2D explains why it has to be: the
   * host's `onGameOver` fires once, so a run ends when the local player is
   * placed whatever the remaining seats are doing.
   */
  endOnFirstWin: boolean;
}

export const DEFAULT_SETTINGS: LudoSettings = {
  tokens: DEFAULT_QUICK ? TOKENS_QUICK : TOKENS_STANDARD,
  unlockOnOne: false,
  captureExtraTurn: true,
  endOnFirstWin: true,
};

/** Consecutive sixes before the turn is forfeit. */
export const SIXES_FORFEIT = 3;

/**
 * What a bot wants, in order.
 *
 * ── These are ordinal before they are cardinal ───────────────────────────
 *
 * What matters most is the *ranking* — a capture beats going home, going home
 * beats leaving the yard — and the gaps are wide enough that ordinary
 * progress can never outrank an intent. `advanceProgress` at 1 per cell means
 * a six-cell walk scores 6, which cannot accidentally beat a 40-point safe
 * cell. A weight table where the tie-breaker can outvote the plan is the
 * classic way a heuristic bot starts making moves nobody can explain.
 *
 * ── Why `exposeToCapture` is negative and large ──────────────────────────
 *
 * Losing a token to a capture costs its entire journey, so a move that parks
 * a piece in front of an enemy is worse than most moves are good. It is
 * deliberately not as large as `capture` itself: a bot that will not take a
 * piece because the square is contested plays like a coward, and reads worse
 * than one that occasionally trades.
 */
export const BOT_WEIGHTS = {
  capture: 100,
  enterHome: 80,
  leaveYard: 60,
  reachSafe: 40,
  escapeThreat: 35,
  advanceProgress: 1,
  exposeToCapture: -45,
} as const;

/** How far behind an enemy can be and still take you next turn. */
export const THREAT_RANGE = 6;

/**
 * How often a bot is wrong is NOT here, and that is the point.
 *
 * It lived here briefly, and it does not belong to Ludo: "an easy opponent
 * blunders three times in five" is a sentence about opponents, not about this
 * board. Left in a game's tuning it would be copied into the next game's, and
 * the easy tier would end up easy in one cabinet and merciless in the other.
 * `host/bots.ts` owns `BLUNDER_RATE`; this file owns what a move is worth.
 */
