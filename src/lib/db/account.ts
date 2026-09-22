import { eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { players, runs, worlds } from "./schema";

/**
 * Every row this app keeps for one Clerk user, removed in one transaction.
 *
 * What "your data" means here, table by table:
 *
 * - `players` — coins, owned characters, the equipped one.
 * - `runs` — the player's own times and ghosts, on every world.
 * - `worlds` — the worlds they built, and with them every OTHER player's
 *   runs on those worlds: a board for a world that no longer exists is rows
 *   nobody can reach. `runs.world_id` has no foreign key (shipped courses are
 *   slugs with no row), so nothing cascades and this has to say it.
 *
 * `game_likes` is keyed by a browser-generated id that is never joined to an
 * account, and `rate_hits` by a salted hash of the hour; neither is the
 * user's to delete because neither is theirs to begin with.
 *
 * Idempotent: a second call finds nothing and deletes nothing, which is what
 * lets the route retry the Clerk half without special cases.
 */
export async function deleteAccountData(userId: string): Promise<{ worlds: number }> {
  const owned = await db
    .select({ id: worlds.id })
    .from(worlds)
    .where(eq(worlds.ownerId, userId));
  const ids = owned.map((w) => w.id);

  // neon-http runs a batch as a single transaction, so a failure part-way
  // cannot leave worlds deleted with their runs still standing.
  await db.batch([
    db.delete(runs).where(eq(runs.userId, userId)),
    ...(ids.length ? [db.delete(runs).where(inArray(runs.worldId, ids))] : []),
    db.delete(worlds).where(eq(worlds.ownerId, userId)),
    db.delete(players).where(eq(players.userId, userId)),
  ] as const);

  return { worlds: ids.length };
}
