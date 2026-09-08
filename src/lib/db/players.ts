import { and, eq, sql } from "drizzle-orm";
import { db } from ".";
import { players } from "./schema";
import { DEFAULT_CHARACTER } from "@/lib/characters";

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
