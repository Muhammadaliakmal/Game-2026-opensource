"use client";

import { MEDALS, MEDAL_LABELS, type Medal } from "@/lib/medals";
import { medalledCount, useCourseProgress } from "@/lib/course-progress";

/**
 * How much of the ladder this browser has medalled, as a ring and a count.
 *
 * ── Why a ring and not a bar ─────────────────────────────────────────────
 *
 * A bar reads as loading. It is the shape of something happening to you,
 * which is the opposite of what this is — and at low completion a bar is a
 * long empty trough with a smear at one end, which is discouraging in a way
 * the same number in a ring is not. A ring at 3 of 23 reads as a start.
 *
 * ── Why it counts courses and not medals ─────────────────────────────────
 *
 * The spec asks for "medals earned / 90" — thirty courses times three tiers.
 * This game does not work that way: a course awards exactly one medal, the
 * best tier the time reaches, and beating your Silver replaces it with Gold
 * rather than adding to it. So the honest denominator is the number of
 * courses, and the tier breakdown underneath is where the depth lives:
 * twenty-three Bronzes and twenty-three Golds are the same ring and very
 * different runs.
 *
 * ── It renders nothing on the server ─────────────────────────────────────
 *
 * The bests are per-browser. On the server there is nothing to say, so
 * `useCourseProgress` returns an empty map and this returns null — which
 * means the heading row has no reserved gap for it. That is deliberate: a
 * first-time visitor should not meet an empty progress ring reading 0 of 23
 * before they have played anything.
 */

/** Ring geometry. A stroke thick enough to read at 44px, and no thicker. */
const SIZE = 44;
const STROKE = 5;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function LadderProgress({ slugs }: { slugs: readonly string[] }) {
  const progress = useCourseProgress(slugs);
  const done = medalledCount(progress);
  const total = slugs.length;

  // Nothing played, or no storage to read. Say nothing rather than zero.
  if (done === 0) return null;

  const fraction = total === 0 ? 0 : done / total;

  // Tally by tier, best first, so "4 Gold" sits ahead of "9 Bronze".
  const byMedal = new Map<Medal, number>();
  for (const p of progress.values()) {
    if (p.medal) byMedal.set(p.medal, (byMedal.get(p.medal) ?? 0) + 1);
  }

  return (
    <div className="flex items-center gap-3">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0"
        role="img"
        aria-label={`${done} of ${total} courses medalled`}
      >
        {/* The track. Never zero-width, so the ring is a ring at 1 of 23
            rather than a lone tick floating in space. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-dim"
          opacity={0.2}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          className="text-accent"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          // Twelve o'clock, clockwise. An arc that starts at three o'clock is
          // the default and reads as an arbitrary slice of something.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="hud-label num">
          {done} of {total} medalled
        </span>
        <span className="hud-label num truncate">
          {MEDALS.filter((m) => byMedal.has(m))
            .map((m) => `${byMedal.get(m)} ${MEDAL_LABELS[m]}`)
            .join(" · ")}
        </span>
      </div>
    </div>
  );
}
