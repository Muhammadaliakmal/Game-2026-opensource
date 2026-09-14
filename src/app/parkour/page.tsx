import { Suspense } from "react";
import { PARKOUR_COURSES } from "@/lib/built-in-worlds";
import {
  CommunityCourses,
  CommunityCoursesFallback,
} from "@/components/modes/CommunityCourses";
import { TIERS, type Tier } from "@/lib/course-kit";
import { MEDALS, MEDAL_LABELS, medalTimes } from "@/lib/medals";
import { formatTime } from "@/components/play/course";
import { CourseCard } from "@/components/modes/CourseCard";
import { PageShell, PageHeader } from "@/components/PageShell";
import { PrefetchCanvas } from "@/components/PrefetchCanvas";

/**
 * The parkour ladder.
 *
 * ── Why this screen exists ───────────────────────────────────────────────
 *
 * The courses used to be entries in a flat list of built-in worlds,
 * indistinguishable from the sandbox ones, each with a `Play` button after it.
 * Nothing said they were a ladder, nothing said which to try first, and the
 * difficulty design — which is the entire point of there being a set of them —
 * was invisible. This is one place they live, grouped by tier and in the order
 * they are meant to be played, with the thing you are chasing on each card.
 *
 * ── Server-rendered; the ladder is still a function of the repo ──────────
 *
 * The ladder comes entirely from code: the courses are generated, the tiers
 * are a constant, and the medal times are computed from the geometry at build
 * time (see `AUTHOR_MS`). Nothing above the Community section touches a
 * database or a client component.
 *
 * The Community section does, which is why the route is now
 * `force-dynamic` — a cached copy of a list whose whole job is to show what
 * somebody published five minutes ago would be worse than not having it. It
 * sits in its own `<Suspense>` boundary so the twenty shipped courses are in
 * the static shell and paint before that query resolves; a slow database
 * delays the new section and nothing else.
 *
 * Personal bests are deliberately NOT here. They live in `localStorage` per
 * world (`play/course.ts`), so rendering them would mean a client component
 * that flashes empty on every load to show a number the player sees again the
 * moment they finish a run. The board on the completion panel is where a time
 * belongs.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parkour — Spec Driven Games",
  description: "Twenty courses, Tutorial to Expert. Beat the clock, take a medal.",
};

/** The one-line promise each tier makes, in the order they are played. */
const TIER_NOTE: Record<Tier, string> = {
  Tutorial: "Learn the jump",
  Easy: "Learn it properly",
  Medium: "Learn to turn",
  Hard: "One-block landings",
  Expert: "On the limit",
};

export default function ParkourPage() {
  // Registry order is ladder order — `BUILT_IN_WORLDS` lists the tutorial
  // first and then `TIERED_COURSES` — but sorting by tier makes that a fact
  // rather than a coincidence of how the array happens to be written.
  const courses = [...PARKOUR_COURSES].sort(
    (a, b) => TIERS.indexOf(a.tier!) - TIERS.indexOf(b.tier!)
  );

  return (
    // `mode` rebinds --color-accent to the parkour green for the whole screen,
    // the same mechanism the in-game HUD uses. See globals.css.
    <PageShell mode="parkour">
      <PrefetchCanvas kind="world" />
      <PageHeader title="Parkour">
        <p className="text-dim max-w-xl text-sm">
          {courses.length} courses, Tutorial to Expert. The clock runs from the
          moment you land, checkpoints keep it running through a fall, and every
          map has an Author time somebody has to beat eventually.
        </p>
      </PageHeader>

      <ul className="grid gap-4 sm:grid-cols-2">
        {courses.map((course, i) => {
          const times = medalTimes(course.slug);
          const gold = times?.find((t) => t.medal === "gold");
          return (
            <li key={course.slug}>
              <CourseCard
                slug={course.slug}
                name={course.name}
                blurb={course.blurb}
                tier={course.tier!}
                note={TIER_NOTE[course.tier!]}
                index={i}
                target={
                  gold
                    ? `${MEDAL_LABELS[gold.medal]} ${formatTime(gold.ms)}`
                    : undefined
                }
              />
            </li>
          );
        })}
      </ul>

      {/* Below the ladder, deliberately. The twenty above are the designed
          difficulty curve and are what a first visit should start with; this
          is where you go once you have run out of them. */}
      <section className="mt-10">
        <h2 className="mb-1 text-base font-semibold">Made by players</h2>
        <p className="text-dim mb-4 max-w-xl text-sm">
          Published worlds with a finish somebody can actually reach. They are
          timed, medalled and ranked on the same terms as the ladder — the
          Author time comes off the course&apos;s own geometry, not off a number
          its builder typed.
        </p>
        <Suspense fallback={<CommunityCoursesFallback />}>
          <CommunityCourses limit={12} />
        </Suspense>
      </section>

      {/* The ladder itself, said once. Repeating four medal times on every
          card would be four times the ink for a rule that is the same on
          every map. */}
      <section className="mt-10">
        <h2 className="hud-label mb-3">Medals</h2>
        <p className="text-dim max-w-2xl text-xs">
          {MEDALS.map((m) => MEDAL_LABELS[m]).join(", ")} — measured against the
          fastest route the course geometry actually admits, not guessed at. The
          Author time is what a very good run of that route looks like; the rest
          are multiples of it.
        </p>
      </section>
    </PageShell>
  );
}
