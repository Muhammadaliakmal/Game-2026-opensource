import Link from "next/link";
import { bySlug, type GameEntry } from "@/content/registry";
import { StatBadge } from "@/components/stats/StatBadge";
import { trending } from "@/lib/db/stats";

/**
 * The six most-played things this week.
 *
 * ── Why this is the payoff for the whole stats backend ───────────────────
 *
 * It is content that updates itself. Nobody writes it, nobody curates it, and
 * it is different next week because people played different things — which is
 * the one kind of "what's new" a site with one maintainer can actually keep
 * up. It is also the only part of the site that is evidence other people are
 * here, which is what "Popular" is really for.
 *
 * ── It is summed over seven days, not ordered by all-time plays ──────────
 *
 * An all-time chart is a chart of whatever was popular in the first week the
 * counter existed, and it never moves again. `trending()` sums the daily rows
 * instead — see `lib/db/stats.ts`.
 *
 * ── Nothing is shown until there is something to show ────────────────────
 *
 * Fewer than three entries and the section does not render. A "Popular this
 * week" rail with one card in it is not a chart, it is an admission, and the
 * week after launch is exactly when the site can least afford to make one.
 * The same applies when the database is unreachable: this is a server
 * component, the query is wrapped, and a failure means the section is absent
 * rather than the page being.
 */

/** Below this it is not a chart. See above. */
const MIN_ENTRIES = 3;

export async function PopularThisWeek({ limit = 6 }: { limit?: number }) {
  let rows: Array<{ slug: string; plays: number }> = [];
  try {
    rows = await trending(limit);
  } catch {
    // The counters are down. The rest of the page is unaffected, which is the
    // whole deployment contract for this feature.
    return null;
  }

  /*
   * Registry entries only.
   *
   * `trending` returns whatever is in the table, and the table can hold a slug
   * that has since been retired — the arena's, had this existed in September.
   * A row with no entry has no title, no href and no art, so it is dropped
   * here rather than rendered as a blank card.
   */
  const entries = rows
    .map((r) => bySlug.get(r.slug))
    .filter((e): e is GameEntry => e !== undefined);

  if (entries.length < MIN_ENTRIES) return null;

  return (
    <section
      className="rise-in flex flex-col gap-3"
      style={{ "--rise-i": 1 } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Popular this week</h2>
        <span className="hud-label">What everyone else has been playing</span>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        {entries.map((entry) => (
          <li key={entry.slug}>
            <article className="card card-linked hover:border-accent/70 focus-within:border-accent/70 flex h-full flex-col gap-1 p-3 transition-colors">
              <h3 className="text-ink truncate text-sm font-semibold">
                <Link href={entry.href} className="stretched-link">
                  {entry.title}
                </Link>
              </h3>
              <p className="text-dim line-clamp-2 flex-1 text-xs">{entry.tagline}</p>
              <StatBadge slug={entry.slug} className="mt-1" />
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What stands in while the query runs.
 *
 * Fixed height, matching the cards above it, because this section sits above
 * the fold on the home page and a block that appears late pushes everything
 * under it down — which is a layout shift, which is a Core Web Vital, which
 * on this site is also an AdSense question. A skeleton that reserves the exact
 * space is the cheap half of that fix; the aspect-ratio boxes on the cards are
 * the other half.
 */
export function PopularThisWeekFallback() {
  return (
    <section className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-7" />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <div className="card h-[5.75rem] animate-pulse opacity-40" />
          </li>
        ))}
      </ul>
    </section>
  );
}
