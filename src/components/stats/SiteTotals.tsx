"use client";

import { useEffect, useState } from "react";
import { formatCount } from "@/lib/stat-format";

/**
 * "412k plays · 1.2k likes" — one line in the footer.
 *
 * ── Why it is worth having ───────────────────────────────────────────────
 *
 * It is the only place on the site that says other people are here, and it is
 * on every content page rather than only on the ones with cards.
 *
 * ── Why it is fetched and not rendered on the server ─────────────────────
 *
 * Because the footer is on seven statically prerendered pages, and an async
 * server component here would run the query once at build time and bake the
 * answer into all seven. See the note in `api/stats/totals/route.ts` — the
 * build reports those pages as static either way, which is what makes that
 * the version of this component that looks correct and is not.
 *
 * ── It is absent rather than zero ────────────────────────────────────────
 *
 * Two ways to have nothing to say — the counters are unreachable, or nothing
 * has been played yet — and they are treated identically, because "0 plays ·
 * 0 likes" in the footer of a games site is the most discouraging thing it
 * could print about itself. The floor is the one the badges use, for the
 * reason `lib/stat-format.ts` gives.
 *
 * Nothing moves when it arrives: it is the last line on the page, and the row
 * it joins already has the copyright notice setting its height.
 */

/** Below this there is nothing worth claiming. Matches the badges' floor. */
const MIN_PLAYS = 50;

export function SiteTotals() {
  const [totals, setTotals] = useState<{ plays: number; likes: number } | null>(
    null
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/stats/totals");
        if (!res.ok) return;
        const data = (await res.json()) as { plays?: unknown; likes?: unknown };
        if (!alive) return;
        if (typeof data.plays !== "number" || typeof data.likes !== "number") return;
        setTotals({ plays: data.plays, likes: data.likes });
      } catch {
        /* Absent is the same as unavailable here. See above. */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!totals || totals.plays < MIN_PLAYS) return null;

  return (
    <span className="hud-label num">
      {formatCount(totals.plays)} plays
      {totals.likes > 0 && <> · {formatCount(totals.likes)} likes</>}
    </span>
  );
}
