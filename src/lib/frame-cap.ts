/**
 * The scheduling half of the frame cap, with no React and no browser in it.
 *
 * Pulled out of FrameLimiter so it can be tested. The hard part of capping a
 * frame rate is not calling `advance()`; it is deciding which of the display's
 * rAF ticks are allowed through, and getting that wrong is invisible on the
 * machine you wrote it on and obvious on somebody else's 144Hz screen.
 *
 * See frame-cap.test.ts for the cadences this is asserted to produce.
 */

/**
 * rAF on a 60Hz panel does not land on exact 16.667ms boundaries. Without a
 * grace window the jitter reads as "too early", every other tick is skipped,
 * and a 60Hz screen renders at 30 — the exact opposite of the intent.
 */
const TOLERANCE_MS = 1;

/**
 * How far behind schedule we tolerate before giving up on catching up. A
 * backgrounded tab returns owing hundreds of frames; paying that debt back is
 * a stall, not a recovery.
 */
const CATCHUP_FRAMES = 4;

/** Longest step handed to the scene, ms. A wake-from-sleep frame is clamped. */
const MAX_STEP_MS = 100;

export interface FrameGate {
  /**
   * Offer a rAF timestamp in milliseconds.
   *
   * @returns the elapsed time **in seconds** to advance the renderer with, or
   *   `null` if this tick is to be skipped. Seconds because that is what R3F's
   *   `advance()` wants in `frameloop="never"` mode — it assigns the value
   *   straight to `clock.elapsedTime` and derives delta from the difference.
   */
  tick: (nowMs: number) => number | null;
}

export function createFrameGate(fps: number): FrameGate {
  const interval = 1000 / fps;

  /** When the next frame is allowed, on the rAF timebase. */
  let due = 0;
  /** Previous accepted timestamp, ms. */
  let prev = 0;
  /** Monotonic seconds handed to the renderer. */
  let elapsed = 0;
  let started = false;

  return {
    tick(nowMs: number): number | null {
      if (started && nowMs < due - TOLERANCE_MS) return null;

      if (!started) {
        // First tick always renders, and starts the schedule from here rather
        // than from zero — `nowMs` is time since page load, not since mount.
        due = nowMs + interval;
        prev = nowMs;
        started = true;
        elapsed += interval / 1000;
        return elapsed;
      }

      // Advance the target by whole frames rather than resetting it to now.
      // That is what holds a true 60 average on a panel whose refresh rate is
      // not a multiple of 60: a 144Hz display then renders on every second or
      // third tick as needed and lands on exactly 60, where resetting would
      // settle at 72 — over the cap.
      //
      // Unless we are far behind, in which case resync instead of catching up.
      due = nowMs - due > interval * CATCHUP_FRAMES ? nowMs + interval : due + interval;

      const stepMs = Math.min(nowMs - prev, MAX_STEP_MS);
      prev = nowMs;
      elapsed += stepMs / 1000;
      return elapsed;
    },
  };
}
