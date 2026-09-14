import Image from "next/image";
import Link from "next/link";
import covers from "@/lib/world-covers.json";
import { COVER_H, COVER_W } from "@/lib/world-cover";

/**
 * A level-select card: what the place looks like, before you go there.
 *
 * ── Why a picture at all ─────────────────────────────────────────────────
 *
 * These were a title, a sentence and a Play chip, which is the shape of a
 * blog index rather than of a game. "A railed loop with nothing to fall off"
 * is a good sentence and it still does not tell you whether the loop is big,
 * whether it climbs, or whether you have already played it. A player picking
 * a level is asking a question about shape and scale, and a picture answers
 * it in the time it takes to glance.
 *
 * ── The angle ────────────────────────────────────────────────────────────
 *
 * Drawn by `lib/world-cover.ts` at a fixed oblique elevation rather than
 * straight down, because a parkour course IS its verticality and a true
 * top-down shot flattens the climb, the gap and the drop into one plane. The
 * full argument is in that file. One heading for every world, so a grid of
 * these reads as a matched set instead of a pile of separately-lit stills.
 *
 * ── Colour ───────────────────────────────────────────────────────────────
 *
 * `data-mode` rebinds `--color-accent`, which is how every HUD in this app
 * already recolours, so the badge and the glow follow the mode with no
 * per-card branching. The spec this came from proposes a parallel set of
 * per-mode accent names; this repo already had the mechanism, and a second
 * one would be two places to change a colour.
 */
export type WorldKind = "parkour" | "race" | "build";

const COVERS: Record<string, { key: string; blur: string }> = covers;

export function WorldCard({
  slug,
  name,
  blurb,
  href,
  kind = "build",
  /** Top-right label: the tier on a course, "Built-in" on a sandbox. */
  badge,
}: {
  slug: string;
  name: string;
  blurb: string;
  href: string;
  kind?: WorldKind;
  badge?: string;
}) {
  const cover = COVERS[slug];

  return (
    <Link
      href={href}
      data-mode={kind}
      className="group card hover:border-accent/70 focus-visible:border-accent/70 flex h-full flex-col overflow-hidden p-0 transition-colors"
    >
      {/*
        A fixed ratio box, so a grid of these never shifts as images arrive —
        and so a sprawling track and a single tower get the same frame. The
        covers are transparent, which is what lets this ground show through
        and keeps them looking like part of the card rather than stickers on
        it.
      */}
      <div
        className="relative w-full shrink-0 overflow-hidden"
        style={{
          aspectRatio: `${COVER_W} / ${COVER_H}`,
          background:
            "radial-gradient(120% 90% at 50% 15%, rgb(255 255 255 / 0.07), transparent 70%), var(--color-base)",
        }}
      >
        {cover ? (
          <Image
            src={`/covers/${slug}.png`}
            alt={`${name}, seen from above`}
            fill
            // Two columns on a tablet, one on a phone, three on a wide screen.
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 30vw"
            placeholder="blur"
            blurDataURL={cover.blur}
            className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          // A world with no committed cover still gets a card. `world-cover.test.ts`
          // is what stops that being the silent state.
          <div className="text-dim absolute inset-0 grid place-items-center text-2xs">
            No preview
          </div>
        )}

        {badge && (
          <span className="hud-label bg-accent/15 text-accent absolute top-2 right-2 px-1.5 py-0.5 backdrop-blur-sm">
            {badge}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-ink text-base font-semibold">{name}</h3>
        <p className="text-dim mt-1 flex-1 text-sm">{blurb}</p>
        <span className="hud-chip hud-chip--primary group-hover:brightness-110 mt-4 w-fit">
          Play
        </span>
      </div>
    </Link>
  );
}
