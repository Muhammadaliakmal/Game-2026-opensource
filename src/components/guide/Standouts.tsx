import { WORLD_FACTS, type WorldFacts } from "@/content/course-facts";
import { PARKOUR_COURSES } from "@/lib/built-in-worlds";

/**
 * Where this course sits among all the others, on each measured dimension.
 *
 * ── Why a page needs this and not just its own numbers ───────────────────
 *
 * "Spindle climbs 24 cells" is a fact about Spindle. "Spindle has the
 * smallest footprint of any course on the ladder" is a fact about Spindle
 * *and* about the ladder, and it is the one a reader can actually use — a
 * number means nothing until you know what a normal number looks like.
 *
 * There is a second reason and it is the one that made this urgent. A guide
 * page is roughly six hundred words, of which the controls table, the
 * breadcrumbs and the footer are shared with twenty-six others. That ratio is
 * what a duplicate-content classifier measures, and the honest way to move it
 * is to add content that could not appear on any other page rather than to
 * delete the shared parts, which are genuinely useful.
 *
 * Every line below is computed by ranking this course against the whole
 * ladder. A sentence here is true of exactly one course by construction.
 *
 * ── Only the superlatives, and only real ones ────────────────────────────
 *
 * A row is emitted for a dimension only where this course is in the top or
 * bottom three of twenty-three. "The 11th-widest gap" is filler with a number
 * in it, which is worse than filler. A course that is unremarkable on every
 * axis gets no section at all, and that is the correct output for it — three
 * of the twenty-three currently show nothing here.
 *
 * A tied first place is not claimed at all. Four courses share the widest
 * gap and "the widest jump on the ladder" is false on all four of them; the
 * whole value of this section is that a reader can check it.
 */

interface Dimension {
  /**
   * The claim, with no leading article and no ordinal — both are added at
   * render. Writing "the most climbing" here is what produced
   * "second-the most climbing" the first time this was built.
   */
  readonly most: string;
  readonly least: string;
  readonly unit: string;
  /** Null where the dimension does not apply. */
  readonly value: (f: WorldFacts) => number | null;
}

const DIMENSIONS: readonly Dimension[] = [
  {
    most: "most climbing of any course on the ladder",
    least: "least climbing of any course on the ladder",
    unit: "cells gained",
    value: (f) => f.route?.climb ?? null,
  },
  {
    most: "widest single jump on the ladder",
    least: "shortest maximum jump of any course",
    unit: "cells of air",
    value: (f) => f.route?.longestGap ?? null,
  },
  {
    most: "longest fall on the ladder",
    // Every course with no drop at all ties at zero, so a "least" claim here
    // is never unique and is correctly never made.
    least: "",
    unit: "cells",
    value: (f) => f.route?.biggestDrop ?? null,
  },
  {
    most: "most jumps of any course",
    least: "fewest jumps of any course",
    unit: "jumps",
    value: (f) => f.route?.jumps ?? null,
  },
  {
    most: "longest route on the ladder",
    least: "shortest route on the ladder",
    unit: "solver steps",
    value: (f) => f.route?.steps ?? null,
  },
  {
    most: "largest footprint on the ladder",
    least: "smallest footprint on the ladder",
    unit: "cells of ground",
    value: (f) => (f.route ? f.spanX * f.spanZ : null),
  },
  {
    // Aspect ratio, which is what separates a corridor from a tower. It is
    // the dimension that distinguishes Overclock — 119 long and 9 wide — from
    // courses with a similar jump count in a square.
    most: "narrowest corridor of any course",
    least: "squarest footprint on the ladder",
    unit: "to 1, long side to short",
    value: (f) =>
      f.route
        ? Math.round((Math.max(f.spanX, f.spanZ) / Math.min(f.spanX, f.spanZ)) * 10) / 10
        : null,
  },
  {
    most: "most checkpoints of any course",
    least: "fewest checkpoints of any course",
    unit: "checkpoints",
    value: (f) => (f.route ? f.checkpoints : null),
  },
];

/** How rare a rank has to be before it is worth a sentence. */
const NOTABLE = 3;

/** "", "second-", "third-" — prefixed to the claim, after the article. */
const ORDINAL = ["", "second-", "third-"];

function claimsFor(slug: string): string[] {
  const ladder = PARKOUR_COURSES.map((c) => c.slug).filter(
    (s) => WORLD_FACTS[s]?.route
  );
  if (!ladder.includes(slug)) return [];

  const claims: string[] = [];
  for (const dim of DIMENSIONS) {
    const scored = ladder
      .map((s) => ({ slug: s, v: dim.value(WORLD_FACTS[s]) }))
      .filter((r): r is { slug: string; v: number } => r.v !== null)
      .sort((a, b) => b.v - a.v);

    const high = scored.findIndex((r) => r.slug === slug);
    if (high < 0) continue;
    const low = scored.length - 1 - high;
    const mine = scored[high].v;
    // Shared with anybody else at all, at either end: the superlative is not
    // this course's to claim, and a hedged one is not worth printing.
    const tied = scored.filter((r) => r.v === mine).length > 1;
    if (tied) continue;

    if (high < NOTABLE && dim.most) {
      claims.push(`the ${ORDINAL[high]}${dim.most} — ${mine} ${dim.unit}`);
    } else if (low < NOTABLE && dim.least) {
      claims.push(`the ${ORDINAL[low]}${dim.least} — ${mine} ${dim.unit}`);
    }
  }
  return claims;
}

export function Standouts({ slug }: { slug: string }) {
  const claims = claimsFor(slug);
  if (claims.length === 0) return null;

  const total = PARKOUR_COURSES.length;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink text-lg font-bold">
        How it compares to the rest of the ladder
      </h2>
      <div className="text-dim flex flex-col gap-3 text-sm leading-relaxed">
        <p>
          Ranked against all {total} courses on the same measurements, this one
          holds {claims.length === 1 ? "one place" : `${claims.length} places`}:
        </p>
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {claims.map((claim) => (
            <li key={claim}>{claim}</li>
          ))}
        </ul>
        <p className="text-xs">
          Outright places only — ties are not claimed.
        </p>
      </div>
    </section>
  );
}
