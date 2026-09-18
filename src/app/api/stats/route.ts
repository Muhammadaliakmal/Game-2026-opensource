import { NextResponse } from "next/server";
import { isKnownSlug } from "@/content/registry";
import { readStats, type Stat } from "@/lib/db/stats";

/**
 * GET /api/stats?slugs=a,b,c — plays and likes for a page of cards.
 *
 * ── One request for the whole page ───────────────────────────────────────
 *
 * Thirty cards making thirty requests is thirty database round trips to fill
 * in thirty small numbers, and on a phone it is thirty connections competing
 * with whatever the page is still loading. `<StatsProvider>` collects the
 * slugs that are actually on screen and asks once; this answers once.
 *
 * ── Unknown slugs are dropped, not rejected ──────────────────────────────
 *
 * A read with a stale slug in it is a stale page, not an attack, and failing
 * the whole batch would blank every badge on it. The write routes are the
 * ones that answer 400 — that is where an unknown slug would create a row.
 *
 * ── Why there is no identity in this request ─────────────────────────────
 *
 * The obvious extra field is "and which of these have I liked", and it is
 * deliberately absent: answering it means sending a stable per-browser id on
 * every page view, and it would tell the browser something it already knows.
 * See `lib/anon-id.ts` and `lib/liked.ts`.
 */

/** From the spec. A page with more cards than this asks twice. */
const MAX_SLUGS = 60;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("slugs") ?? "";
  const slugs = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(isKnownSlug)
    ),
  ].slice(0, MAX_SLUGS);

  try {
    const stats = await readStats(slugs);
    return NextResponse.json(stats, {
      /*
       * Ten seconds at the edge, and a minute of staleness on top.
       *
       * The spec's freshness rule is "stale-then-correct beats blank". A
       * counter is the least urgent number on the page — nobody is watching
       * their own play register — and a short shared cache turns a burst of
       * visitors on the home page into one query instead of one each.
       */
      headers: {
        "cache-control": "public, s-maxage=10, stale-while-revalidate=60",
      },
    });
  } catch {
    /*
     * The outage contract, and the reason this is a 200.
     *
     * "A Redis outage must never block a play" — here, a Postgres one. An
     * error status would put a failed request in the console of a site that
     * is otherwise working perfectly, and the client would have to special-
     * case it to render the same thing an empty object already renders: an em
     * dash on every card. Empty is the honest answer to "what are the counts"
     * when they cannot be read, and it is the answer a brand-new game gives
     * too.
     */
    return NextResponse.json({} as Record<string, Stat>, {
      headers: { "cache-control": "no-store" },
    });
  }
}
