/**
 * What a race or a duel is worth.
 *
 * ── The third payout rule, and why there are three ───────────────────────
 *
 * Courses pay the *difference* against your best (`coins.ts`) because a
 * course has a top. The arcade pays *per run under a daily ceiling*
 * (`arcade-payout.ts`) because an endless runner has none. A match is a
 * third shape: it has a result, but the result is relative to whoever else
 * turned up, so neither "your best here" nor "your score" means anything.
 *
 * So a match pays a flat amount for the result, and it is bounded the way the
 * arcade is — by the day. It shares the arcade's daily pool rather than
 * getting its own: one ceiling, one column, and one sentence that stays true
 * ("everything that is not a course pays at most a thousand a day").
 *
 * ── Who decides the result ───────────────────────────────────────────────
 *
 * The room server. It runs the lap counter and the knockdown count, and it is
 * the only party that knows a race had two riders in it rather than one. The
 * client never posts a match result; the room does, with the service secret,
 * to `/api/rewards/match`. That is what makes a flat payout safe to offer at
 * all — the thing being paid for is a fact the server established.
 *
 * ── A race alone is a time trial ─────────────────────────────────────────
 *
 * Any rider can start the lights with nobody else on the grid, and that is a
 * feature. It is also, unpaid, a way to grind "1st place" forever. So a race
 * with one rider pays the *finish*, not the place: you did the laps, here is
 * something, and there is nobody you beat.
 *
 * Pure. Imports nothing. The room server imports it, so it must stay that way.
 */

/** Coins for a race, by finishing place, when at least two riders raced. */
const RACE_PLACE: Record<number, number> = { 1: 60, 2: 40, 3: 25, 4: 15 };

/** Finishing at all, on a grid of one. */
const RACE_SOLO = 12;

/** A duel: the winner, and the loser who fought it out to the end. */
const ARENA_WIN = 50;
const ARENA_LOSS = 10;

export type MatchMode = "race" | "arena";

export interface MatchResult {
  mode: MatchMode;
  /** 1-based finishing place (race) — ignored for the arena. */
  place?: number;
  /** How many took part. A race of one is a time trial. */
  entrants: number;
  /** Arena: did this player win. */
  won?: boolean;
}

/** What the result is worth before the day's ceiling is applied. */
export function matchReward(r: MatchResult): number {
  if (r.mode === "race") {
    if (r.entrants < 2) return RACE_SOLO;
    const place = Math.floor(r.place ?? 0);
    return RACE_PLACE[place] ?? 0;
  }
  if (r.mode === "arena") {
    if (r.entrants < 2) return 0;
    return r.won ? ARENA_WIN : ARENA_LOSS;
  }
  return 0;
}

/** The most one match can pay. The route refuses anything a room asks above it. */
export const MAX_MATCH_REWARD = Math.max(RACE_PLACE[1], ARENA_WIN);
