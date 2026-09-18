import { NextResponse } from "next/server";
import { isKnownSlug } from "@/content/registry";
import { recordPlay } from "@/lib/db/stats";
import { spend } from "@/lib/db/rate-limit";

/**
 * POST /api/stats/play — record that somebody actually played something.
 *
 * ── It always answers 204, including when it refuses ─────────────────────
 *
 * From the spec, and it is the right shape for this endpoint: the client has
 * no decision to make with the answer. It cannot show the player anything
 * useful about a play that was not counted, and it must not retry — a retry
 * after a rate limit spends the rest of a budget that is already gone. So
 * there is one response, the client fires and forgets, and nothing about a
 * counter can surface as an error on a screen somebody is playing on.
 *
 * That includes the database being down. A play counter is the least
 * important thing on the page and it is emphatically not allowed to be the
 * thing that breaks it.
 *
 * ── The guards, in the order they are cheap ──────────────────────────────
 *
 * The real defences against an inflated count are upstream in the client and
 * cost the server nothing: ten seconds of unpaused play before this is called
 * at all, and once per slug per tab session. What is left for this route is
 * the case where none of that ran — a hand-written `fetch` — and against that
 * it has the slug allowlist, which stops the table filling with keys no page
 * will read, and an hourly budget, which stops one caller from deciding what
 * is popular.
 */

/** Thirty an hour, from the spec. A real player earns one per ten seconds. */
const HOURLY_LIMIT = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const slug = (body as { slug?: unknown } | null)?.slug;

  // Not a slug the site ships. Still 204 — see above — but nothing is written.
  if (!isKnownSlug(slug)) return new NextResponse(null, { status: 204 });

  try {
    if (!(await spend(req, "play", HOURLY_LIMIT))) {
      return new NextResponse(null, { status: 204 });
    }
    await recordPlay(slug);
  } catch {
    /*
     * Deliberately swallowed, and this is the one place in the app where that
     * is the whole point rather than a concession. `lib/db/stats.ts` throws so
     * that a broken query is visible to a caller that can do something about
     * it; this caller cannot, and the player it is answering is mid-game.
     */
  }

  return new NextResponse(null, { status: 204 });
}
