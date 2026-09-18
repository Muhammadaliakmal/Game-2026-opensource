import { inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { gameLikes, gamePlaysDaily, gameStats } from "./schema";

/**
 * Plays and likes: every statement that touches them.
 *
 * ── The shape of the contract ────────────────────────────────────────────
 *
 * Every function here either returns a value or throws. None of them swallow
 * anything, because a query that fails silently at this level is a number
 * that is wrong for a month before anybody notices. The silence the spec asks
 * for — "a Redis outage must never block a play" — belongs one layer up, in
 * the routes and in the client, where there is a request to answer and a
 * decision about what the player sees. `lib/db/players.ts` draws the line in
 * the same place.
 *
 * ── Why the counters are written in single statements ────────────────────
 *
 * Read-modify-write over a counter is a race, and these counters are written
 * concurrently by definition — the whole point of them is that several people
 * are playing at once. Every write below is one statement that Postgres
 * executes atomically, which is the same property the spec wanted `INCR` for.
 */

export interface Stat {
  plays: number;
  likes: number;
}

/** How many days of daily rows "this week" is summed from, and kept. */
export const TRENDING_DAYS = 7;

/**
 * Rows are kept a day longer than they are read, so a query that straddles
 * midnight cannot lose the far end of its own window.
 */
const KEEP_DAYS = TRENDING_DAYS + 1;

/** A UTC day key, YYYY-MM-DD. The same format `lib/daily.ts` uses. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The day key `n` days before `from`. Used for the trending window. */
export function dayBefore(n: number, from: Date = new Date()): string {
  return utcDay(new Date(from.getTime() - n * 24 * 60 * 60 * 1000));
}

/**
 * Stats for a batch of slugs, in one round trip.
 *
 * The caller is a page with up to thirty cards on it, so this is deliberately
 * one query rather than one per card — `<StatsProvider>` exists to collect the
 * slugs and make exactly this call.
 *
 * A slug with no row yet is simply absent from the result. That is not an
 * error condition: a game nobody has played has no row, and the badge renders
 * an em dash for it either way.
 */
export async function readStats(slugs: readonly string[]): Promise<Record<string, Stat>> {
  if (slugs.length === 0) return {};
  const rows = await db
    .select({
      slug: gameStats.slug,
      plays: gameStats.plays,
      likes: gameStats.likes,
    })
    .from(gameStats)
    .where(inArray(gameStats.slug, [...slugs]));

  const out: Record<string, Stat> = {};
  for (const r of rows) out[r.slug] = { plays: r.plays, likes: r.likes };
  return out;
}

/**
 * Count one play of `slug` on `day`.
 *
 * Two upserts and, once a day per slug, a delete.
 *
 * ── `xmax = 0` ───────────────────────────────────────────────────────────
 *
 * Postgres has no TTL, and the daily rows need one. Running the delete on
 * every play would mean a scan per play for a row that becomes stale once a
 * week. `xmax` is the system column holding the transaction that deleted or
 * locked a row; on a tuple that `ON CONFLICT DO UPDATE` just updated it is
 * non-zero, and on one the INSERT actually created it is zero. So `xmax = 0`
 * reads as "this is the first play of this slug today" — which is exactly
 * when a day has rolled over and there is something old to sweep.
 *
 * That is thirty-five deletes a day across the whole registry rather than one
 * per play, and it needs no cron, no scheduled function and nothing that has
 * to be deployed separately from the app.
 */
export async function recordPlay(slug: string, day: string = utcDay()): Promise<void> {
  await db.execute(sql`
    insert into ${gameStats} (slug, plays, updated_at)
    values (${slug}, 1, now())
    on conflict (slug) do update
      set plays = ${gameStats.plays} + 1, updated_at = now()
  `);

  const rows = await db.execute(sql`
    insert into ${gamePlaysDaily} (slug, day, plays)
    values (${slug}, ${day}, 1)
    on conflict (slug, day) do update
      set plays = ${gamePlaysDaily.plays} + 1
    returning (xmax = 0) as inserted
  `);

  const first = (rows as unknown as Array<{ inserted: boolean }>)[0];
  if (first?.inserted) {
    await db.execute(sql`
      delete from ${gamePlaysDaily} where day < ${dayBefore(KEEP_DAYS)}
    `);
  }
}

/**
 * Add or remove one like, and return the slug's new total.
 *
 * ── Idempotent by primary key ────────────────────────────────────────────
 *
 * The count is bumped by however many rows the insert produced, and the
 * insert produces one row the first time and none after that. So a
 * double-click, a refresh and another double-click add up to one like, with
 * no read of the current state in between to be raced.
 *
 * `greatest(..., 0)` on the way down is a floor, not an expectation: nothing
 * in the app deletes `game_likes` rows in bulk, but if anything ever does,
 * a negative like count on a card is a bug a player can see and a support
 * question nobody can answer.
 */
export async function setLike(
  slug: string,
  anonId: string,
  liked: boolean
): Promise<number> {
  const rows = liked
    ? await db.execute(sql`
        with added as (
          insert into ${gameLikes} (slug, anon_id)
          values (${slug}, ${anonId})
          on conflict do nothing
          returning 1
        )
        insert into ${gameStats} (slug, likes, updated_at)
        values (${slug}, (select count(*)::int from added), now())
        on conflict (slug) do update
          set likes = ${gameStats.likes} + (select count(*)::int from added),
              updated_at = now()
        returning likes
      `)
    : await db.execute(sql`
        with removed as (
          delete from ${gameLikes}
          where slug = ${slug} and anon_id = ${anonId}
          returning 1
        )
        insert into ${gameStats} (slug, likes, updated_at)
        values (${slug}, 0, now())
        on conflict (slug) do update
          set likes = greatest(
                ${gameStats.likes} - (select count(*)::int from removed), 0
              ),
              updated_at = now()
        returning likes
      `);

  const first = (rows as unknown as Array<{ likes: number }>)[0];
  return Number(first?.likes ?? 0);
}

/**
 * The most-played slugs over the trending window.
 *
 * Summed from the daily rows rather than ordered by the all-time `plays`
 * column, which is the entire point: an all-time chart is a chart of what was
 * popular in the first week the counter existed, and it never changes again.
 * This one is self-updating content nobody has to curate, which is what the
 * spec is buying with it.
 */
export async function trending(
  limit = 6,
  days = TRENDING_DAYS
): Promise<Array<{ slug: string; plays: number }>> {
  const rows = await db
    .select({
      slug: gamePlaysDaily.slug,
      plays: sql<number>`sum(${gamePlaysDaily.plays})::int`,
    })
    .from(gamePlaysDaily)
    .where(sql`${gamePlaysDaily.day} >= ${dayBefore(days)}`)
    .groupBy(gamePlaysDaily.slug)
    .orderBy(sql`sum(${gamePlaysDaily.plays}) desc`)
    .limit(limit);

  return rows.map((r) => ({ slug: r.slug, plays: Number(r.plays) }));
}

/**
 * Site-wide totals, for the one line in the footer.
 *
 * Two sums over a table with one row per shipped game — thirty-five rows
 * today, and bounded by the registry forever. Cheap enough to do on a page
 * render, which is why it is a sum rather than a maintained total.
 */
export async function siteTotals(): Promise<{ plays: number; likes: number }> {
  const rows = await db
    .select({
      plays: sql<number>`coalesce(sum(${gameStats.plays}), 0)::int`,
      likes: sql<number>`coalesce(sum(${gameStats.likes}), 0)::int`,
    })
    .from(gameStats);

  const first = rows[0];
  return { plays: Number(first?.plays ?? 0), likes: Number(first?.likes ?? 0) };
}
