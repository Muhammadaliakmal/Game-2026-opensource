import Link from "next/link";
import type { Tier } from "@/lib/course-kit";
// From lib/sky-stops rather than lib/atmosphere: this renders on the
// server, and atmosphere.ts imports the whole of three.js.
import { NIGHT_STOPS } from "@/lib/sky-stops";

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
 * The course's own difficulty curve, as a skyline: one bar per section, rising
 * with the tier. It is not a map — a 220x90 thumbnail of a 90-unit course is
 * an unreadable smear — it is the shape of the ask, which is the thing worth
 * knowing before you press it.
 */

/** How steep the skyline climbs, and how narrow the landings get, by tier. */
const PROFILE: Record<Tier, { climb: number; width: number; gap: number }> = {
  Tutorial: { climb: 0.28, width: 20, gap: 6 },
  Easy: { climb: 0.46, width: 17, gap: 8 },
  Medium: { climb: 0.6, width: 14, gap: 10 },
  Hard: { climb: 0.74, width: 10, gap: 13 },
  Expert: { climb: 0.9, width: 7, gap: 16 },
};

function CourseArt({ tier, seed }: { tier: Tier; seed: number }) {
  const { climb, width, gap } = PROFILE[tier];
  const id = `c${seed}`;

  const bars: { x: number; y: number; w: number }[] = [];
  let x = 8;
  let i = 0;
  while (x < 212) {
    // Rises overall, with a dip every third step so it reads as a course
    // rather than a bar chart — every good one gives height back somewhere.
    const t = i / 9;
    const dip = i % 3 === 2 ? 0.12 : 0;
    const y = 78 - (t * climb - dip) * 58;
    bars.push({ x, y: Math.max(12, y), w: width });
    x += width + gap;
    i++;
  }

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

      {bars.map((b, k) => (
        <g key={k}>
          <rect x={b.x} y={b.y} width={b.w} height={90 - b.y} fill="#131a3c" />
          <rect
            x={b.x}
            y={b.y - 2}
            width={b.w}
            height="2.5"
            fill="var(--color-accent)"
            opacity={0.45 + Math.min(0.5, k * 0.07)}
          />
        </g>
      ))}
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
        <CourseArt tier={tier} seed={index} />
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
