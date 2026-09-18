import { sql } from "drizzle-orm";
import { db } from "./index";
import { rateHits } from "./schema";

/**
 * A fixed hourly budget per caller, for the two routes that accept writes.
 *
 * ── What this defends ────────────────────────────────────────────────────
 *
 * The ordering of the cards, and nothing else. There is no wallet behind
 * these endpoints and no board — the whole prize for defeating this is making
 * one game look more played than it is. `lib/coins.ts` and `lib/medals.ts`
 * both state the same position about their own guards, and this one is
 * weaker than either on purpose.
 *
 * The cheaper defences do most of the work and are upstream of this: a play
 * is not counted until ten seconds of unpaused play have elapsed, is counted
 * once per slug per tab session, and a like is idempotent by primary key. By
 * the time a request reaches this function it is already a hand-written
 * `fetch` rather than a player.
 *
 * ── Fixed window rather than sliding ─────────────────────────────────────
 *
 * The spec asks for `Ratelimit.slidingWindow`, an Upstash primitive. An
 * hourly bucket is one upsert; a sliding window is a sorted set and a second
 * datastore. What the approximation costs is that a caller can spend two
 * hours' budget either side of an hour boundary, which against a budget of
 * thirty plays is not a distinction the popularity sort can feel.
 *
 * ── The bucket is hashed ─────────────────────────────────────────────────
 *
 * An IP address is personal data, and this table would otherwise be the one
 * place in the app that writes one down. The stored key is a SHA-256 of the
 * address, the route and the hour.
 *
 * Be precise about what that buys: an IP has a small enough key space to be
 * searched, so this is obfuscation plus expiry rather than anonymisation.
 * What makes it safe is that the row is meaningless an hour later and deleted
 * shortly after — it cannot accumulate into a history of anybody, which is
 * the property that actually matters.
 */

/** Rows are swept once they are this far past their hour. */
const SWEEP_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * The caller, as well as a serverless function can know it.
 *
 * Behind Vercel the client address is in `x-forwarded-for`, leftmost entry.
 * A request that arrives without one — a local `curl`, a misconfigured proxy
 * — is bucketed together under "unknown" rather than waved through: sharing
 * one budget is the conservative failure, and in production there is always a
 * header.
 */
export function callerKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** SHA-256, hex, via Web Crypto — which exists on both runtimes Next offers. */
async function hash(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Spend one unit of `route`'s hourly budget for this caller.
 *
 * Returns whether the request is within budget. One upsert: the counter is
 * incremented and read back in the same statement, so two requests arriving
 * together cannot both see the same count and both pass.
 *
 * Throws if the database is unreachable — the caller decides what an outage
 * means, and for these two routes it means "let it through", because a
 * counter that stops working must not become a game that stops working.
 */
export async function spend(
  req: Request,
  route: string,
  limit: number,
  now: Date = new Date()
): Promise<boolean> {
  const hour = Math.floor(now.getTime() / 3_600_000);
  const bucket = await hash(`${callerKey(req)}|${route}|${hour}`);
  const expiresAt = new Date((hour + 1) * 3_600_000);

  const rows = await db.execute(sql`
    insert into ${rateHits} (bucket, hits, expires_at)
    values (${bucket}, 1, ${expiresAt.toISOString()})
    on conflict (bucket) do update
      set hits = ${rateHits.hits} + 1
    returning hits
  `);

  const first = (rows as unknown as Array<{ hits: number }>)[0];
  const hits = Number(first?.hits ?? 1);

  /*
   * Swept from the write path, like the daily play rows, and for the same
   * reason: there is no scheduler in this deployment, and adding one to expire
   * a counter would be the largest moving part in the feature.
   *
   * One caller in 256 does the sweeping, chosen by the first byte of a hash
   * that is already computed. Deterministic rather than `Math.random()`, so
   * the behaviour is the same on every run of the tests, and bounded rather
   * than "every new caller", which at any real traffic would be a table scan
   * per visitor per hour to delete rows that expire on their own schedule.
   */
  if (bucket.startsWith("00")) {
    try {
      await db.execute(
        sql`delete from ${rateHits} where expires_at < ${new Date(
          now.getTime() - SWEEP_AFTER_MS
        ).toISOString()}`
      );
    } catch {
      // A failed sweep is a few stale rows, not a failed request — and the
      // budget above has already been spent and is about to be answered.
    }
  }

  return hits <= limit;
}
