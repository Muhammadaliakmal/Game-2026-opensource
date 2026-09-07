import Link from "next/link";
import { ModeCover, type ModeArt } from "./ModeCover";

/**
 * A mode, as a thing you press rather than a row with a button on it.
 *
 * ── Why the whole card is the link ───────────────────────────────────────
 *
 * The previous menu was a list of names with a `Play` chip after each. That is
 * a settings screen, not a game: the picture is the invitation, and putting a
 * small button under it means the ninety percent of the target that reads as
 * pressable is not. One `<Link>` wrapping everything makes the whole tile the
 * hit area — which is also the only version that works with a thumb.
 *
 * ── Why `data-mode` ──────────────────────────────────────────────────────
 *
 * It rebinds `--color-accent` for everything inside (globals.css), which is
 * already how the HUDs recolour themselves per mode. So the parkour card is
 * acid green and the race card is magenta without either of them naming a
 * colour, and the cover art inside picks the same one up for its kerbs and its
 * platform edges. One mechanism, used the way it was built to be used.
 */
export function ModeCard({
  href,
  art,
  eyebrow,
  title,
  blurb,
  meta,
  cta,
}: {
  href: string;
  art: ModeArt;
  /** The small label above the name — a count, a tier range, a rider limit. */
  eyebrow: string;
  title: string;
  blurb: string;
  /** Two or three facts, shown as a row under the description. */
  meta?: string[];
  cta: string;
}) {
  return (
    <Link
      href={href}
      data-mode={art}
      className="group border-[var(--border-color)] hover:border-accent/70 focus-visible:border-accent/70 relative flex min-h-[12rem] flex-col justify-end overflow-hidden sm:min-h-[15rem] rounded-[var(--radius)] border transition-colors md:min-h-[17rem]"
    >
      <ModeCover art={art} />

      {/* The scrim. Without it the copy sits on whatever the art happens to be
          doing behind it, which is unreadable in exactly the places the art is
          most interesting. Weighted to the bottom so the sky stays sky. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(2,3,10,0.92) 0%, rgba(2,3,10,0.72) 34%, rgba(2,3,10,0.12) 66%, rgba(2,3,10,0) 100%)",
        }}
      />

      <div className="relative flex flex-col gap-2 p-5">
        <span className="hud-label text-accent">{eyebrow}</span>
        <h3 className="text-ink text-2xl leading-tight font-bold">{title}</h3>
        <p className="text-dim max-w-sm text-sm">{blurb}</p>

        {meta && meta.length > 0 && (
          <ul className="hud-label num text-dim mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {meta.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        {/* A chip rather than a button, because the card is already the
            control — this is the affordance that says so, not a second target.
            It lights on hover so a mouse gets the same confirmation a thumb
            gets from the press state. */}
        <span className="mt-3 flex items-center gap-2">
          <span className="hud-chip hud-chip--primary group-hover:brightness-110">
            {cta}
          </span>
          <span
            aria-hidden
            className="text-accent translate-x-0 text-sm transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
