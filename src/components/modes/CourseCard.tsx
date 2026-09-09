import Link from "next/link";
import type { Tier } from "@/lib/course-kit";
// From lib/sky-stops rather than lib/atmosphere: this renders on the
// server, and atmosphere.ts imports the whole of three.js.
import { NIGHT_STOPS } from "@/lib/sky-stops";
import { SILHOUETTE_COLUMNS, silhouetteFor } from "@/lib/course-silhouette";

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
 * The course's own elevation, read off its actual blocks — see
 * `lib/course-silhouette`. It is not a map: a 220x90 thumbnail of a 90-unit
 * course is an unreadable smear. It is where the run climbs, where it gives
 * height back and where it breaks, which is the shape of the ask.
 *
 * ── It used to be a lie ──────────────────────────────────────────────────
 *
 * The skyline was generated from the TIER — a climb rate and a bar width per
 * difficulty — so all four Hard courses drew the same picture, and the `seed`
 * prop that appeared to vary them only fed a gradient id. Two adjacent cards
 * with identical art and identical captions is worse than two cards with no
 * art at all, because it looks like information.
 */

function CourseArt({ slug, index }: { slug: string; index: number }) {
  // Cached at module scope in the library — see the note there about why that
  // cache is permanently valid.
  const heights = silhouetteFor(slug);
  const id = `c${index}`;

  const step = 220 / SILHOUETTE_COLUMNS;
  // A 2px sliver of air between columns, so a run of equal heights still reads
  // as separate blocks rather than one bar.
  const width = step - 2;
  const bars = (heights ?? []).map((h, i) => ({
    x: i * step + 1,
    // 12 is the ceiling and 82 the floor, so a full-height column stops short
    // of the top edge and a zero-height one is a gap rather than a hairline.
    y: 82 - h * 70,
    w: width,
    // Kept so the renderer can tell "nothing here" from "something very low".
    empty: h <= 0,
  }));

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
          <stop offset="0" stopColor={NIGHT_STOPS[1].hex} />
          <stop offset="0.55" stopColor={NIGHT_STOPS[3].hex} />
          <stop offset="1" stopColor={NIGHT_STOPS[4].hex} />
        </linearGradient>
      </defs>
      <rect width="220" height="90" fill={`url(#${id}-sky)`} />

      {/* A handful of stars, placed by index rather than at random: this
          renders on the server, and a random sky would hydrate as a mismatch. */}
      <g fill="#ffffff" opacity="0.55">
        {[17, 46, 83, 112, 149, 178, 201, 62, 131].map((sx, k) => (
          <circle key={sx} cx={sx} cy={8 + ((k * 13) % 26)} r={k % 3 === 0 ? 1.2 : 0.7} />
        ))}
      </g>

      {/* A gap in the course is drawn as a gap. That is the half of this that
          the tier-generated version could not do at all: a course is defined
          by where the ground is not. */}
      {bars.map((b, k) =>
        b.empty ? null : (
          <g key={k}>
            <rect x={b.x} y={b.y} width={b.w} height={90 - b.y} fill="#131a3c" />
            {/* The lit top edge, which is the surface a runner lands on. */}
            <rect
              x={b.x}
              y={b.y - 2}
              width={b.w}
              height="2.5"
              fill="var(--color-accent)"
              opacity={0.45 + Math.min(0.5, k * 0.03)}
            />
          </g>
        )
      )}
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
}) {
  return (
    <Link
      href={`/play/${slug}`}
      className="group card hover:border-accent/70 focus-visible:border-accent/70 block overflow-hidden transition-colors"
    >
      <div className="relative h-28 w-full">
        <CourseArt slug={slug} index={index} />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(2,3,10,0.85) 0%, rgba(2,3,10,0.25) 55%, rgba(2,3,10,0) 100%)",
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
      </div>

      <div className="flex flex-col gap-1 p-4">
        <h3 className="text-ink text-base font-semibold">{name}</h3>
        <p className="text-dim text-sm">{blurb}</p>
        {target && (
          <p className="hud-label num text-dim mt-2">Chasing {target}</p>
        )}
      </div>
    </Link>
  );
}
