/**
 * The screen between pressing a thing and the world existing.
 *
 * ── Why it is not a spinner ──────────────────────────────────────────────
 *
 * Every mount in this app used the same borrowed spinner: a rotating ring with
 * one transparent border, which is the default loading affordance of the web
 * and reads as a page fetching JSON. That is exactly the wrong promise for the
 * three seconds before a race. A loading screen is the first frame of the
 * game, and a game's loading screen is made of the game's own material — so
 * this is blocks, in the mode's accent, filling a row.
 *
 * ── What the animation is actually saying ────────────────────────────────
 *
 * The blocks fill left to right and then hold, rather than looping a bar back
 * to zero. A bar that resets says "still nothing"; a row that fills and waits
 * says "nearly". Neither is a real progress figure — there isn't one, because
 * a Colyseus join has no byte count to report — so the honest thing is a
 * rhythm that reads as activity without claiming a percentage it does not
 * have. Overstating progress is the one thing a fake progress bar must not do.
 *
 * The count is eight because that is the smallest number of steps that still
 * reads as filling rather than as four things blinking, and `--unit` is 8px,
 * so a row of eight blocks with the standard gap is exactly the width of the
 * grid everything else in the interface is built on.
 *
 * ── Reduced motion ───────────────────────────────────────────────────────
 *
 * The global `prefers-reduced-motion` rule in globals.css flattens every
 * animation to 0.01ms, which would leave this a static row of dim blocks. That
 * is the correct outcome and the reason the blocks carry a visible resting
 * colour rather than starting at zero opacity: with motion off the component
 * still shows a filled row and a label, which is a loading screen — just not
 * an animated one.
 */
import { LoaderTip, type TipKind } from "./LoaderTip";

export function GameLoader({
  label,
  /**
   * A sub-line for something the player might need to act on — a code they are
   * joining, a server that might be asleep. Optional, because most loads have
   * nothing worth saying.
   */
  detail,
  /**
   * Which set of tips to show under the row. Defaults to all of them; a
   * mount that knows what it is loading says so. See LoaderTip.
   */
  tips = "any",
}: {
  label: string;
  detail?: string;
  tips?: TipKind;
}) {
  return (
    <div className="bg-base flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6">
      <div className="flex items-end gap-1.5" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="loader-block"
            style={{
              // Staggered by an eighth of the cycle each, so the lit edge
              // travels along the row at a constant speed.
              animationDelay: `${i * 0.11}s`,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        {/* `role="status"` rather than a live region on the whole screen: a
            screen reader should hear "Joining race" once, not every frame of
            an animation it cannot see. */}
        <span className="hud-label" role="status">
          {label}
        </span>
        {detail && <span className="text-dim text-2xs">{detail}</span>}
      </div>

      {/* A line to read while the row fills. A wait with something to read
          is a game already talking; a wait with nothing is a wait. */}
      <LoaderTip kind={tips} />
    </div>
  );
}
