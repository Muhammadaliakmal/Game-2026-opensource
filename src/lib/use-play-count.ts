"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  PLAY_THRESHOLD_MS,
  PlayTimer,
  alreadyCounted,
  markCounted,
  reportPlay,
} from "./play-count";

/**
 * Count one play of `slug` once the game has actually been played.
 *
 * Called from each game's root client component. `active` is that screen's own
 * answer to "is the game running right now" — the arcade passes
 * `status === "playing"`, a course passes whether the run clock is going — and
 * this hook adds the half every screen shares: a hidden tab is never playing.
 *
 * ── Why a poll and not a timeout ─────────────────────────────────────────
 *
 * The threshold is ten seconds of *unpaused* play, so the moment it is crossed
 * is not knowable when the clock starts — it moves every time the player
 * pauses. A `setTimeout` would have to be cancelled and rescheduled on every
 * transition, carrying the remaining time by hand, which is the arithmetic
 * `PlayTimer` already does. One interval that asks "are we there yet" is both
 * less code and correct across any number of pauses.
 *
 * The interval is cleared the instant the count fires, so a long session polls
 * for ten seconds and then never again.
 *
 * ── Two things move the clock, and one of them is not the poll ───────────
 *
 * The poll decides when the threshold is *reached*; it must not be what
 * notices a pause, or up to a second of paused time would be banked as play on
 * every transition. So `active` has an effect of its own that syncs on the
 * render it changed, and `visibilitychange` does the same for the tab. The
 * poll then only ever confirms a state the other two have already set.
 *
 * ── Why the timer is a ref ───────────────────────────────────────────────
 *
 * Three effects share it and none of them may rebuild it: a timer recreated on
 * a pause resets its accumulator, and a player who pauses twice would never
 * reach ten seconds of anything. It is created once per slug and torn down
 * with it.
 */
export function usePlayCount(slug: string | null, active: boolean): void {
  const timer = useRef<PlayTimer | null>(null);
  /*
   * `active` as the poll and the visibility listener see it.
   *
   * Written in the effect below rather than in the body, because
   * `react-hooks/refs` rejects a ref assignment during render (CLAUDE.md
   * lists the rule). It is seeded with the first `active` so the mount-time
   * sync in the main effect — which runs before the one that updates it —
   * reads the right value rather than a default.
   */
  const activeRef = useRef(active);
  const done = useRef(false);

  const sync = useCallback(() => {
    const t = timer.current;
    if (!t || done.current) return;
    const now = performance.now();
    if (activeRef.current && !document.hidden) t.resume(now);
    else t.pause(now);
  }, []);

  useEffect(() => {
    if (!slug) return;
    // Already counted in this tab session, so there is nothing to time.
    // Checked before anything is allocated: this is the common case on a
    // second run of the same game.
    if (alreadyCounted(slug)) return;

    timer.current = new PlayTimer(PLAY_THRESHOLD_MS);
    done.current = false;
    sync();

    const poll = window.setInterval(() => {
      const t = timer.current;
      if (!t || done.current || !t.reached(performance.now())) return;
      done.current = true;
      window.clearInterval(poll);
      markCounted(slug);
      void reportPlay(slug);
    }, 1000);

    document.addEventListener("visibilitychange", sync);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", sync);
      timer.current = null;
    };
  }, [slug, sync]);

  // The pause itself, on the render it happened — and the only place the ref
  // above is written.
  useEffect(() => {
    activeRef.current = active;
    sync();
  }, [active, sync]);
}
