import { and, eq, sql } from "drizzle-orm";
import { db } from ".";
import { players } from "./schema";
import { DEFAULT_CHARACTER } from "@/lib/characters";
import { DAILY_HARD_CAP, payout } from "@/lib/arcade-payout";

/**
 * The wallet, server side.
 *
 * Every write here is a single statement that states its own precondition, so
 * two tabs cannot both spend the same coins. That is the whole reason these
 * are not read-then-write helpers: a balance check in JavaScript followed by an
 * UPDATE is a race with a purchase on the other end of it.
 *
 * Rows are created lazily, because most accounts never open the shop. "No row"
 * is therefore a legitimate state and means exactly the starting one — no
 * coins, nothing owned, wearing the default — never an error.
 */

export interface PlayerState {
  coins: number;
  owned: string[];
  character: string;
}

/** What an account that has never played looks like. */
const FRESH: PlayerState = {
  coins: 0,
  owned: [],
  character: DEFAULT_CHARACTER,
};

/** The player's wallet and wardrobe, or the starting state if they have none. */
export async function playerState(userId: string): Promise<PlayerState> {
  const [row] = await db
    .select({
      coins: players.coins,
      owned: players.owned,
      character: players.character,
    })
    .from(players)
    .where(eq(players.userId, userId));
  return row ?? FRESH;
}

/**
 * Add coins, creating the row if this is the player's first payout.
 *
 * The addition is done in SQL rather than by writing a number this process
 * computed, so two courses finished in two tabs at the same moment both land.
 * Returns the new balance.
 */
export async function awardCoins(userId: string, amount: number): Promise<number> {
  if (amount <= 0) {
    const { coins } = await playerState(userId);
    return coins;
  }
  const [row] = await db
    .insert(players)
    .values({ userId, coins: amount })
    .onConflictDoUpdate({
      target: players.userId,
      set: {
        coins: sql`${players.coins} + ${amount}`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ coins: players.coins });
  return row.coins;
}

/** Why a purchase did not happen, or that it did. */
export type PurchaseResult = "bought" | "owned" | "insufficient";

/**
 * Buy a character.
 *
 * The price and the ownership test are both in the WHERE clause, so the row is
 * only debited if it could actually afford it and did not already have it —
 * which makes a double-clicked buy button a no-op rather than a double charge.
 * When nothing is updated the row is read back to say which of the two reasons
 * it was, because "you already own this" and "you cannot afford this" are very
 * different things to put on a screen.
 */
export async function buyCharacter(
  userId: string,
  characterId: string,
  price: number
): Promise<{ result: PurchaseResult; state: PlayerState }> {
  // A player with no row has no coins and can afford nothing, but the row has
  // to exist for the conditional UPDATE below to have anything to match. This
  // cannot overwrite an existing wallet: on conflict it does nothing at all.
  await db.insert(players).values({ userId }).onConflictDoNothing();

  const [row] = await db
    .update(players)
    .set({
      coins: sql`${players.coins} - ${price}`,
      owned: sql`array_append(${players.owned}, ${characterId})`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(players.userId, userId),
        sql`${players.coins} >= ${price}`,
        sql`not (${characterId} = any(${players.owned}))`
      )
    )
    .returning({
      coins: players.coins,
      owned: players.owned,
      character: players.character,
    });

  if (row) return { result: "bought", state: row };

  const state = await playerState(userId);
  return {
    result: state.owned.includes(characterId) ? "owned" : "insufficient",
    state,
  };
}

/**
 * Pay an arcade run, and hold the day's ceiling while doing it.
 *
 * ── Where the two caps are enforced, and why they differ ─────────────────
 *
 * `payout()` computes the soft-capped amount from the day's total as this
 * process last read it. That read can be stale — two tabs finishing runs at
 * the same moment both see the same "earned today" — so a concurrent pair can
 * each be granted a little more full-rate credit than they strictly should.
 * That is a tuning inaccuracy and it is acceptable.
 *
 * The *hard* ceiling is not, so it is applied in the UPDATE itself, against
 * the column rather than against the value JavaScript read. Two racing
 * requests therefore cannot between them take more than a day's limit: the
 * second one's LEAST() sees the first one's write.
 *
 * The rollover is in the same statement for the same reason. Reading the day,
 * deciding it has changed and then writing zero is a race that eats a payout.
 */
export async function awardArcadeCoins(
  userId: string,
  score: number,
  rate: number,
  date: string
): Promise<{ earned: number; coins: number; cappedForToday: boolean }> {
  await db.insert(players).values({ userId }).onConflictDoNothing();

  const [before] = await db
    .select({ arcadeCoins: players.arcadeCoins, arcadeDay: players.arcadeDay })
    .from(players)
    .where(eq(players.userId, userId));

  // A row from a previous day has no bearing on today's total.
  const earnedToday = before && before.arcadeDay === date ? before.arcadeCoins : 0;
  const wanted = payout(score, rate, earnedToday);

  if (wanted <= 0) {
    const { coins } = await playerState(userId);
    return { earned: 0, coins, cappedForToday: true };
  }

  // `today` is the day-total as it will be after this write: zero if the
  // stored day is not this one, so the rollover and the clamp are one
  // expression and cannot disagree with each other.
  const today = sql`(case when ${players.arcadeDay} = ${date} then ${players.arcadeCoins} else 0 end)`;
  const granted = sql`least(${wanted}, greatest(0, ${DAILY_HARD_CAP} - ${today}))`;

  const [row] = await db
    .update(players)
    .set({
      coins: sql`${players.coins} + ${granted}`,
      arcadeCoins: sql`${today} + ${granted}`,
      arcadeDay: date,
      updatedAt: sql`now()`,
    })
    .where(eq(players.userId, userId))
    .returning({ coins: players.coins, arcadeCoins: players.arcadeCoins });

  if (!row) {
    const { coins } = await playerState(userId);
    return { earned: 0, coins, cappedForToday: true };
  }

  // What was actually granted, read back rather than assumed: the clamp above
  // may have paid less than `wanted`, and the screen must show what happened.
  const earned = Math.max(0, row.arcadeCoins - earnedToday);
  return {
    earned,
    coins: row.coins,
    cappedForToday: row.arcadeCoins >= DAILY_HARD_CAP,
  };
}

/**
 * Pay a match result out of the arcade's daily pool.
 *
 * A race place or a duel result is a flat amount (`lib/match-reward.ts`),
 * and the only thing that bounds a grind of them is the day — the same
 * ceiling, the same two columns and the same statement the arcade uses, with
 * the amount standing in for `score × rate`. One pool means one sentence
 * that stays true about everything that is not a course.
 */
export async function awardMatchCoins(
  userId: string,
  amount: number,
  date: string
): Promise<{ earned: number; coins: number; cappedForToday: boolean }> {
  return awardArcadeCoins(userId, amount, 1, date);
}

/**
 * Pay the daily challenge bonus, once per UTC day.
 *
 * The day already collected is in the WHERE clause, so the row is only paid
 * if it has not been paid today — two tabs finishing the challenge at the
 * same moment produce one payout and one "already collected". Returns the
 * amount actually granted, which is the bonus or nothing.
 */
export async function awardDailyBonus(
  userId: string,
  amount: number,
  day: string
): Promise<{ earned: number; coins: number }> {
  await db.insert(players).values({ userId }).onConflictDoNothing();

  const [row] = await db
    .update(players)
    .set({
      coins: sql`${players.coins} + ${amount}`,
      dailyDay: day,
      updatedAt: sql`now()`,
    })
    .where(and(eq(players.userId, userId), sql`${players.dailyDay} <> ${day}`))
    .returning({ coins: players.coins });

  if (row) return { earned: amount, coins: row.coins };
  const { coins } = await playerState(userId);
  return { earned: 0, coins };
}

/**
 * Wear a character.
 *
 * `free` is for the catalog entries that cost nothing and are therefore not in
 * anybody's `owned` list — the default courier. Everything else has to be
 * owned, and the check is in the WHERE clause for the same reason the purchase
 * is: it is the only place that can answer it without a race.
 */
export async function equipCharacter(
  userId: string,
  characterId: string,
  free: boolean
): Promise<{ equipped: boolean; state: PlayerState }> {
  await db.insert(players).values({ userId }).onConflictDoNothing();

  const [row] = await db
    .update(players)
    .set({ character: characterId, updatedAt: sql`now()` })
    .where(
      and(
        eq(players.userId, userId),
        free ? sql`true` : sql`${characterId} = any(${players.owned})`
      )
    )
    .returning({
      coins: players.coins,
      owned: players.owned,
      character: players.character,
    });

  if (row) return { equipped: true, state: row };
  return { equipped: false, state: await playerState(userId) };
}
