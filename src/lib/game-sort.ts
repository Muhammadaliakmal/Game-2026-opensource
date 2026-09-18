import type { GameEntry, GameTag } from "@/content/registry";

/**
 * Sorting and filtering a grid of games, as pure functions.
 *
 * Separated from the component for the reason `lib/site-links.ts` gives: this
 * is the part worth testing and the grid around it is the part that is not.
 * It is also the part with the two decisions in it — what "Popular" means
 * when nothing has been played yet, and what an unreadable URL parameter
 * should do.
 */

export const SORTS = ["popular", "newest", "az"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  popular: "Popular",
  newest: "Newest",
  az: "A–Z",
};

/** From the spec. The default, because it is the one that answers "which?". */
export const DEFAULT_SORT: Sort = "popular";

/**
 * A sort read off the URL.
 *
 * Anything unrecognised falls back to the default rather than erroring or
 * rendering an empty grid. A sort parameter is a view preference in a link
 * somebody shared, and the worst outcome for a bad one is a page that looks
 * broken; the best is a page that looks normal.
 */
export function parseSort(value: unknown): Sort {
  return SORTS.includes(value as Sort) ? (value as Sort) : DEFAULT_SORT;
}

/**
 * Tags read off the URL, keeping only ones that are actually offered.
 *
 * Same argument as above, with one addition: an unknown tag that was kept
 * would filter the grid down to nothing and leave the player looking at an
 * empty page with a chip selected that they cannot see.
 */
export function parseTags(value: unknown, offered: readonly GameTag[]): GameTag[] {
  if (typeof value !== "string" || value === "") return [];
  const wanted = new Set(value.split(",").map((t) => t.trim()));
  return offered.filter((t) => wanted.has(t));
}

/**
 * Entries matching every selected tag.
 *
 * AND, not OR. Two chips pressed means "show me the puzzle games I can play
 * alone", which is what somebody pressing two chips is asking; OR would
 * *widen* the list on the second press, which is the opposite of what a filter
 * appears to promise.
 */
export function filterByTags(
  entries: readonly GameEntry[],
  tags: readonly GameTag[]
): GameEntry[] {
  if (tags.length === 0) return [...entries];
  return entries.filter((e) => tags.every((t) => e.tags.includes(t)));
}

/**
 * Order a grid.
 *
 * ── What "Popular" does on a site with no plays yet ──────────────────────
 *
 * This is the decision that matters. `plays` is empty on a fresh deployment,
 * on a page whose stats request has not landed, and forever if the counters
 * are down — and "Popular" that silently becomes "registry order" in all
 * three cases is a control that appears to do nothing. So the tiebreak is
 * `newest`, which is a real ordering, is never empty, and is the right answer
 * for two games nobody has played: show me the one that arrived last.
 *
 * ── Stable ───────────────────────────────────────────────────────────────
 *
 * Every comparator falls through to the slug, so the order is total and two
 * renders of the same data produce the same grid. Without it, cards would
 * quietly swap places when the stats arrived and changed nothing about their
 * relative order.
 */
export function sortEntries(
  entries: readonly GameEntry[],
  sort: Sort,
  plays: Readonly<Record<string, number>> = {}
): GameEntry[] {
  const out = [...entries];
  const newest = (a: GameEntry, b: GameEntry) => b.addedAt.localeCompare(a.addedAt);

  switch (sort) {
    case "az":
      out.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug));
      break;
    case "newest":
      out.sort((a, b) => newest(a, b) || a.slug.localeCompare(b.slug));
      break;
    case "popular":
      out.sort(
        (a, b) =>
          (plays[b.slug] ?? 0) - (plays[a.slug] ?? 0) ||
          newest(a, b) ||
          a.slug.localeCompare(b.slug)
      );
      break;
  }
  return out;
}

/**
 * The query string for a view, with the defaults left out.
 *
 * A link to the default view is the bare path. That keeps the canonical URL
 * of `/arcade` free of parameters that say nothing — which matters because
 * `?play=<slug>` deep links to those pages are indexed, and a second
 * parameter set appearing on every internal link would compete with them.
 */
export function viewQuery(sort: Sort, tags: readonly GameTag[]): string {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  if (tags.length > 0) params.set("tags", tags.join(","));
  const query = params.toString();
  return query ? `?${query}` : "";
}
