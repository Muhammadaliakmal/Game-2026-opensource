"use client";

import { MEDAL_LABELS } from "@/lib/medals";
import { useCourseProgress } from "@/lib/course-progress";
import { formatTime } from "@/components/play/course";

/**
 * "Gold · 0:31.20" on a card, or nothing.
 *
 * The one line that turns a wall of twenty-three identical cards back into a
 * ladder: which of them you have done, and how well. Everything else on the
 * card is the same for every visitor.
 *
 * ── Why it takes the whole slug list ─────────────────────────────────────
 *
 * So that twenty-three cards share one read of storage and one snapshot. See
 * `lib/course-progress.ts` — the alternative is twenty-three subscriptions
 * each with their own cache to keep stable, which is the shape that produces
 * a render loop the first time somebody forgets.
 *
 * ── What an unplayed course says instead ─────────────────────────────────
 *
 * The Gold time, as "Chasing Gold 0:31.20" — which is what the card said
 * before any of this existed and is still the right thing to say to somebody
 * who has not run it. So the fallback is passed in and this component picks
 * between them, rather than the page rendering one and hoping the other stays
 * out of the way. On the server, and in a browser with no storage, the
 * fallback is what shows.
 *
 * The line keeps its place either way — the badge holds the right-hand end of
 * the row — so a ladder of mixed played and unplayed courses does not have two
 * different card heights in it.
 */
export function CourseProgress({
  slug,
  slugs,
  fallback,
}: {
  slug: string;
  /** Every course on the page, so the read is shared. */
  slugs: readonly string[];
  /** What to say before a first finish — the Gold time to chase. */
  fallback?: string;
}) {
  const progress = useCourseProgress(slugs);
  const mine = progress.get(slug);

  if (!mine || mine.bestMs === null) return <>{fallback ?? ""}</>;

  return (
    <>
      {mine.medal && <span className="text-accent">{MEDAL_LABELS[mine.medal]} · </span>}
      {formatTime(mine.bestMs)}
    </>
  );
}
