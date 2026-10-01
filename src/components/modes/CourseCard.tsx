import Image from "next/image";
import Link from "next/link";
import type { Tier } from "@/lib/course-kit";
// From lib/sky-stops rather than lib/atmosphere: this renders on the
// server, and atmosphere.ts imports the whole of three.js.
import { NIGHT_STOPS } from "@/lib/sky-stops";
import covers from "@/lib/world-covers.json";
import { StatBadge } from "@/components/stats/StatBadge";
import { CourseProgress } from "@/components/modes/CourseProgress";
import { NewPill } from "@/components/modes/NewPill";

const COVERS: Record<string, { key: string; blur: string }> = covers;

/**
 * One course on the parkour ladder.
 *
 * The same argument as `ModeCard`: the whole tile is the link, because a
 * picture with a small button under it makes most of the target dead. Smaller
 * art than a mode cover, and generated per course rather than shared — five
 * identical thumbnails would be worse than none, since the only thing a player
 * can read off them would be wrong.
 *
 * ── What the picture is ──────────────────────────────────────────────────
 *
 * The course itself, seen from above at the one fixed oblique angle every
 * cover in the app shares — see `lib/world-cover.ts` for why that angle is
 * not straight down, and `scripts/generate-covers.ts` for where the image
 * comes from.
 *
 * It replaced an elevation silhouette drawn from the same blocks, which was
 * honest and answered a narrower question: how the run climbs, but not what
 * it looks like or how big it is. The oblique view carries both, because
 * height survives it — that is the whole reason for the angle — so the strip
 * was information the picture already contained, drawn twice.
 *
 * ── It used to be a lie ──────────────────────────────────────────────────
 *
 * Before the silhouette, the skyline was generated from the TIER — a climb
 * rate and a bar width per difficulty — so all four Hard courses drew the
 * same picture, and the `seed` prop that appeared to vary them only fed a
 * gradient id. Two adjacent cards with identical art and identical captions
 * is worse than two cards with no art at all, because it looks like
 * information. The rule that came out of it is the one this still follows:
 * the art is read off the course's own blocks or it does not exist.
 */

/** The night behind the cover. Only the index varies — it keys the gradient. */
function CourseArt({ index }: { index: number }) {
  const id = `c${index}`;
  return (
    <svg
      viewBox="0 0 220 90"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="1" x2="0" y2="0">
          {/* Through `--art-sky-*` like every other cover, so the light
              theme draws these by day too. They were the one cover left on
              literal night stops: a row of black banners on a pale page,
              with the ladder numeral (ink at 25%) invisible on them. */}
          <stop offset="0" stopColor={`var(--art-sky-0, ${NIGHT_STOPS[1].hex})`} />
          <stop offset="0.55" stopColor={`var(--art-sky-2, ${NIGHT_STOPS[3].hex})`} />
          <stop offset="1" stopColor={`var(--art-sky-3, ${NIGHT_STOPS[4].hex})`} />
        </linearGradient>
      </defs>
      <rect width="220" height="90" fill={`url(#${id}-sky)`} />

      {/* A handful of stars, placed by index rather than at random: this
          renders on the server, and a random sky would hydrate as a mismatch. */}
      <g fill="#ffffff" style={{ opacity: "calc(0.55 * var(--art-stars, 1))" }}>
        {[17, 46, 83, 112, 149, 178, 201, 62, 131].map((sx, k) => (
          <circle key={sx} cx={sx} cy={8 + ((k * 13) % 26)} r={k % 3 === 0 ? 1.2 : 0.7} />
        ))}
      </g>
    </svg>
  );
}

export function CourseCard({
  slug,
  name,
  blurb,
  tier,
  note,
  index,
  target,
  ladder,
  addedAt,
}: {
  slug: string;
  name: string;
  blurb: string;
  tier: Tier;
  /** The one-line promise the tier makes. */
  note: string;
  /** Position on the ladder, for the numeral. */
  index: number;
  /** What to chase — the Gold time, if the map has one. */
  target?: string;
  /**
   * Every course on the page, so the whole ladder shares one read of the
   * personal bests out of storage. See `lib/course-progress.ts`.
   */
  ladder?: readonly string[];
  /** When this course shipped, as an ISO date. Drives the "New" pill. */
  addedAt?: string;
}) {
  return (
    /*
     * An article with a stretched link rather than a link around everything.
     *
     * The whole tile is still one press — that argument has not changed — but
     * the card now carries a second control, the like button on `<StatBadge>`,
     * and a `<button>` inside an `<a>` is invalid HTML that browsers resolve
     * differently and screen readers read as one run-on link. The link is the
     * course name; `.stretched-link` spreads its hit area over the card. See
     * globals.css.
     *
     * `focus-within` rather than `focus-visible`, because the focus now lands
     * on a child.
     */
    <article className="group card card-linked hover:border-accent/70 focus-within:border-accent/70 overflow-hidden transition-colors">
      <div className="relative h-32 w-full">
        <CourseArt index={index} />
        {COVERS[slug] && (
          <Image
            src={`/covers/${slug}.png`}
            alt=""
            fill
            sizes="(max-width: 640px) 92vw, 30vw"
            placeholder="blur"
            blurDataURL={COVERS[slug].blur}
            className="object-contain p-1.5 transition-transform duration-300 group-hover:scale-[1.05]"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgb(var(--art-scrim, 2 3 10) / 0.85) 0%, rgb(var(--art-scrim, 2 3 10) / 0.25) 55%, rgb(var(--art-scrim, 2 3 10) / 0) 100%)",
          }}
        />
        {/* The ladder position, big and in the corner — the fastest way to say
            "this one is third" without a word. */}
        <span
          aria-hidden
          className="num text-ink/25 absolute top-1 right-3 text-4xl leading-none font-bold"
        >
          {index + 1}
        </span>
        <span className="hud-label text-accent absolute bottom-2 left-3">
          {tier} · {note}
        </span>
        {/* Top-left, opposite the ladder numeral, and only for a fortnight.
            A "New" that never expires is decoration; the date on the registry
            row is what makes it a fact. */}
        {addedAt && <NewPill addedAt={addedAt} />}
      </div>

      <div className="flex flex-col gap-1 p-4">
        <h3 className="text-ink text-base font-semibold">
          <Link href={`/play/${slug}`} className="stretched-link">
            {name}
          </Link>
        </h3>
        <p className="text-dim text-sm">{blurb}</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          {/* Your best on this course once you have one, and what there is to
              chase until then. Always rendered, empty when there is neither,
              so the badge keeps its place in the row on every card — a slot
              that appears only on some cards is the layout fault
              `ArcadeLobby`'s "best" readout already has a comment about. */}
          <p className="hud-label num text-dim min-w-0 truncate">
            {ladder ? (
              <CourseProgress
                slug={slug}
                slugs={ladder}
                fallback={target ? `Chasing ${target}` : undefined}
              />
            ) : (
              target && `Chasing ${target}`
            )}
          </p>
          <StatBadge slug={slug} />
        </div>
        {/*
          The written half of this course.

          `card-actions` rather than a bare link, because the card's stretched
          link covers everything and an anchor under it is an anchor nobody can
          press — the same reason `<StatBadge>`'s like button needs it.

          It is worth the row. The tile goes straight to the canvas, which is
          the right default for somebody who already knows what they are
          pressing; this is for the one who does not, and it is the page that
          can actually answer them. It is also the only link the ladder gives
          a crawler to the readable half of the site.
        */}
        <Link
          href={`/games/${slug}`}
          // The visible text is the same on all 23 cards, which is right —
          // it is a repeated affordance and naming each one would make the
          // ladder shout. The accessible name is not: a screen reader lists
          // links out of context, and 23 entries reading "Course guide" is a
          // list nobody can navigate. A browser pass is what surfaced this.
          aria-label={`${name} course guide`}
          className="card-actions hud-label text-dim hover:text-accent mt-1 w-fit underline"
        >
          Course guide →
        </Link>
      </div>
    </article>
  );
}
