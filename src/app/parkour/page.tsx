import Link from "next/link";
import { PARKOUR_COURSES } from "@/lib/built-in-worlds";
import { TIERS, type Tier } from "@/lib/course-kit";
import { MEDALS, MEDAL_LABELS, medalTimes } from "@/lib/medals";
import { formatTime } from "@/components/play/course";
import { CourseCard } from "@/components/modes/CourseCard";

/**
 * The parkour ladder.
 *
 * ── Why this screen exists ───────────────────────────────────────────────
 *
 * The five courses used to be five entries in a flat list of built-in worlds,
 * indistinguishable from the sandbox ones, each with a `Play` button after it.
 * Nothing said they were a ladder, nothing said which to try first, and the
 * difficulty design — which is the entire point of there being five of them —
 * was invisible. This is one place they live, in the order they are meant to
 * be played, with the thing you are chasing on each card.
 *
 * ── Server-rendered, and static ──────────────────────────────────────────
 *
 * Everything here comes from code: the courses are generated, the tiers are a
 * constant, and the medal times are computed from the geometry at build time
 * (see `AUTHOR_MS`). So there is no data fetch, no client component and no
 * loading state — the page is a function of the repo.
 *
 * Personal bests are deliberately NOT here. They live in `localStorage` per
 * world (`play/course.ts`), so rendering them would mean a client component
 * that flashes empty on every load to show a number the player sees again the
 * moment they finish a run. The board on the completion panel is where a time
 * belongs.
 */

export const metadata = {
  title: "Parkour — Blockworld",
  description: "Five courses, Tutorial to Expert. Beat the clock, take a medal.",
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
    <div
      // Rebinds --color-accent to the parkour green for the whole screen, the
      // same mechanism the in-game HUD uses. See globals.css.
      data-mode="parkour"
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
    >
      <header className="mb-8 flex flex-col gap-2">
        <Link href="/" className="hud-label w-fit">
          ← Blockworld
        </Link>
        <h1 className="text-display font-bold">Parkour</h1>
        <p className="text-dim max-w-xl text-sm">
          Five courses, Tutorial to Expert. The clock runs from the moment you
          land, checkpoints keep it running through a fall, and every map has an
          Author time somebody has to beat eventually.
        </p>
      </header>

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
    </div>
  );
}
