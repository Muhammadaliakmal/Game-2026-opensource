import { NextResponse } from "next/server";
import { siteTotals } from "@/lib/db/stats";

/**
 * GET /api/stats/totals — plays and likes across the whole site.
 *
 * ── Why this is an endpoint and not a server component ───────────────────
 *
 * Because the line it feeds is in the footer, and the footer is on `/about`,
 * `/privacy`, `/terms`, `/contact`, `/games`, `/arcade` and `/blog` — every
 * one of which is statically prerendered and should stay that way.
 *
 * The trap here is worth writing down, because the build does not report it as
 * one. An async server component doing this query builds perfectly well and
 * the route table still prints `○ Static` beside those pages — because the
 * query runs once, at build time, and its answer is baked into the HTML. The
 * line would then show the numbers as they were on the day of the last deploy,
 * for as long as that deploy lasted, and nothing about it would look wrong.
 * "Social proof" frozen at build time is worse than none.
 *
 * Fetched by the client instead. The line arrives after paint, at the very
 * bottom of the page, where nothing moves when it does.
 */
export async function GET() {
  try {
    const totals = await siteTotals();
    return NextResponse.json(totals, {
      /*
       * Five minutes shared, an hour stale.
       *
       * This is the least urgent number on the site by some distance, and it
       * is requested from every content page — so the cache is what keeps a
       * decorative line from being a query per page view.
       */
      headers: {
        "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch {
    // The same contract as the rest of the stats routes: no counts and failed
    // counts are the same thing to every caller, and the line renders nothing
    // for both.
    return NextResponse.json({ plays: 0, likes: 0 }, {
      headers: { "cache-control": "no-store" },
    });
  }
}
