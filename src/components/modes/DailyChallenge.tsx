"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PARKOUR_COURSES } from "@/lib/built-in-worlds";
import { DAILY_BONUS, dailyPick, dayEndsAt, dayKey } from "@/lib/daily";
import { current, doneToday, onStreakChange, readStreak } from "@/lib/streak";
import { medalTimes, MEDAL_LABELS } from "@/lib/medals";
import { formatTime } from "@/components/play/course";
import covers from "@/lib/world-covers.json";

const COVERS: Record<string, { key: string; blur: string }> = covers;

/**
 * Today's challenge: one course from the ladder, the same one for everyone,
 * with a bonus for finishing it.
 *
 * ── Why the pick is made in the browser ──────────────────────────────────
 *
 * The hub renders on the server and the home page is allowed to be cached.
 * A pick made there would be the day the page was built, served for as long
 * as the cache held it — and the route paying the bonus would be checking
 * against the real day. So the day is read here, from the client's clock,
 * through `useSyncExternalStore` with a server snapshot of "no day yet": the
 * server renders nothing, the client fills it in, and there is no hydration
 * mismatch and no effect-set-state. `lib/daily.ts` is the same pure function
 * the runs route calls, so the card and the payout cannot disagree.
 *
 * Every clock read is inside the snapshot, never in render — the purity lint
 * would reject `Date.now()` there, and it is right to. The snapshot is one
 * string, `slug|hoursLeft`, so it compares stable between polls until either
 * changes; a one-minute poll is more than enough to notice midnight on a tab
 * that stayed open.
 */
function subscribeDay(cb: () => void) {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
}
function daySnapshot(): string {
  const now = new Date();
  const slug = dailyPick(PARKOUR_COURSES, now)?.slug ?? "";
  const hoursLeft = Math.max(1, Math.ceil((dayEndsAt(now).getTime() - now.getTime()) / 3_600_000));
  // The streak rides in the same snapshot: it changes when a finish is
  // recorded (a listener) or when the day rolls (the poll), and both are
  // already what this store watches.
  const streak = readStreak();
  const today = dayKey(now);
  return `${slug}|${hoursLeft}|${current(streak, today)}|${doneToday(streak, today) ? 1 : 0}`;
}
function subscribeAll(cb: () => void) {
  const stopDay = subscribeDay(cb);
  const stopStreak = onStreakChange(cb);
  return () => {
    stopDay();
    stopStreak();
  };
}
const dayServerSnapshot = () => null;

/**
 * The card's height, reserved before the client has picked a course. The
 * server renders the frame and nothing in it; without the reservation the
 * three mode covers below hydrate a card's height lower than they were
 * painted, which is the layout shift this page is otherwise free of.
 */
const CARD_MIN_H = "min-h-[7.25rem] sm:min-h-[7.75rem]";

export function DailyChallenge() {
  const today = useSyncExternalStore(subscribeAll, daySnapshot, dayServerSnapshot);
  const [slug, hours, streakStr, doneStr] = (today ?? "|||").split("|");
  const streak = Number(streakStr) || 0;
  const done = doneStr === "1";
  const course = PARKOUR_COURSES.find((c) => c.slug === slug);

  if (!course) {
    return <div className={`card border-accent/40 ${CARD_MIN_H}`} aria-hidden />;
  }
  const hoursLeft = Number(hours);
  const gold = medalTimes(course.slug)?.find((t) => t.medal === "gold");

  return (
    <Link
      href={`/play/${course.slug}`}
      className={`group card hover:border-accent/70 focus-visible:border-accent/70 border-accent/40 flex overflow-hidden transition-colors ${CARD_MIN_H}`}
    >
      <div className="relative w-32 shrink-0 bg-[#0b1030] sm:w-44">
        {COVERS[course.slug] && (
          <Image
            src={`/covers/${course.slug}.png`}
            alt=""
            fill
            sizes="176px"
            placeholder="blur"
            blurDataURL={COVERS[course.slug].blur}
            className="object-contain p-1.5 transition-transform duration-300 group-hover:scale-[1.05]"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <span className="hud-label text-accent">
          Daily challenge · {done ? "done today" : `resets in ${hoursLeft}h`}
          {streak > 1 && ` · ${streak}-day streak`}
        </span>
        <h3 className="text-ink truncate text-base font-semibold">{course.name}</h3>
        <p className="text-dim line-clamp-2 text-sm">{course.blurb}</p>
        <p className="hud-label num text-dim mt-1">
          {course.tier}
          {gold && ` · ${MEDAL_LABELS.gold} ${formatTime(gold.ms)}`}
          {done ? " · bonus collected" : ` · finish for + ⬤ ${DAILY_BONUS}`}
        </p>
      </div>
    </Link>
  );
}
