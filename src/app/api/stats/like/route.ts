import { NextResponse } from "next/server";
import { isKnownSlug } from "@/content/registry";
import { isAnonId } from "@/lib/anon-id";
import { setLike } from "@/lib/db/stats";
import { spend } from "@/lib/db/rate-limit";

/**
 * POST /api/stats/like — add or remove one like.
 *
 * ── Why this one answers with a body and the play route does not ─────────
 *
 * Because the player pressed something and is looking at it. The heart has
 * already moved optimistically; the count that comes back is what confirms it
 * or corrects it, and a non-2xx is what tells the badge to put itself back.
 * That is a decision the client can actually act on, which is exactly what
 * the play endpoint has none of.
 *
 * ── Idempotent, by primary key rather than by checking first ─────────────
 *
 * `setLike` bumps the counter by however many rows the insert produced, which
 * is one the first time and none afterwards. So double-click, refresh,
 * double-click again is one like — with no read of the current state in
 * between for two tabs to race over. The definition-of-done item this
 * satisfies is satisfied by the database, not by this route being careful.
 *
 * ── The anon id is validated because it is half of a primary key ─────────
 *
 * Unvalidated, it is a column any caller can write any string into, as many
 * times as they like. The pattern is the exact shape `crypto.randomUUID`
 * produces and nothing else — see `lib/anon-id.ts`, which holds both halves
 * so they cannot drift apart.
 */

/** Sixty an hour, from the spec. Liking every game on the site is thirty-five. */
const HOURLY_LIMIT = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    slug?: unknown;
    liked?: unknown;
    anonId?: unknown;
  } | null;

  const { slug, liked, anonId } = body ?? {};

  if (!isKnownSlug(slug) || typeof liked !== "boolean" || !isAnonId(anonId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    if (!(await spend(req, "like", HOURLY_LIMIT))) {
      // A real 429, unlike the play route: the heart is about to revert, and
      // it should, because this press genuinely did not land.
      return NextResponse.json({ error: "Too many likes" }, { status: 429 });
    }
    const likes = await setLike(slug, anonId, liked);
    return NextResponse.json({ likes }, { headers: { "cache-control": "no-store" } });
  } catch {
    /*
     * The database is unreachable. A 503 rather than a quiet 200: the badge
     * reverts, and a heart that springs back is a truer report than one that
     * stays filled on a like that was never stored.
     */
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
