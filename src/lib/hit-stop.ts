import { reducedMotion } from "./motion";

/**
 * "Freeze the world for a moment, something just hit."
 *
 * ── Why a module object rather than a store or an event ──────────────────
 *
 * Both ends of this are frame loops. The asking end is a physics callback
 * inside the Canvas; the acting end is `FrameLimiter`, which is the only thing
 * holding the clock. Neither should re-render anything, and a hit-stop that
 * arrived a render later than the impact would land after the frame it was
 * supposed to punctuate — which is the whole effect, gone.
 *
 * Same shape and the same reasoning as `race/telemetry.ts` and
 * `play/touch-input.ts`: one plain object, written by whoever is closest to
 * the event, drained by whoever owns the schedule.
 *
 * ── Reduced motion drops it entirely ─────────────────────────────────────
 *
 * A freeze frame is a whole-screen event and there is no gentler version of
 * it: shortening a hit-stop to a millisecond is the same as not having one.
 * Everything else about an impact — the sound, the haptic, the speed the rider
 * actually lost — is unaffected, so the collision still reads.
 */

/** Seconds of freeze asked for since the last frame, largest wins. */
let pending = 0;

/**
 * Ask for a freeze. Safe to call several times in one frame.
 *
 * The longest request wins rather than the sum: two things hitting on the same
 * frame is one impact from the player's point of view, and adding the freezes
 * together is how a busy moment turns into a visible stall.
 */
export function requestHitStop(seconds: number) {
  if (!(seconds > 0)) return;
  if (reducedMotion()) return;
  pending = Math.max(pending, seconds);
}

/** Take whatever was asked for and clear it. Called once per rendered frame. */
export function takeHitStop(): number {
  const s = pending;
  pending = 0;
  return s;
}
