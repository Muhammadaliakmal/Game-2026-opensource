"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The OS motion setting, in one place.
 *
 * ── Why this is not just `matchMedia` at each call site ──────────────────
 *
 * There were two readings of it already — an inline query in
 * `InstancedParts.tsx` and the `@media` block in `globals.css` — and the WebGL
 * side had none at all. Screen shake, hit-stop and particle bursts are the
 * three things `prefers-reduced-motion` is most obviously about, and none of
 * them is CSS, so the stylesheet rule could never have covered them.
 *
 * ── Reduced motion is not "no feedback" ──────────────────────────────────
 *
 * The setting asks for less *vestibular* motion: things that move the whole
 * frame, or move large areas quickly. It does not ask for a game with no
 * response to input. So the rule applied throughout is that feedback which
 * moves the camera or the world (shake, hit-stop, sprays of particles) is
 * dropped, and feedback which is local to the thing you touched (a button
 * lighting, a block's placement pop, a haptic tap, a sound) survives —
 * shortened where it is an animation, never removed.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function mq(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia(QUERY);
}

/**
 * Read the setting from outside React.
 *
 * Queried live rather than cached: someone turning it on in system settings
 * should not have to reload the game, and this is called from frame loops
 * where the cost is one media-query read against a value the browser already
 * has.
 */
export function reducedMotion(): boolean {
  return mq()?.matches ?? false;
}

/** The same answer, for components that need to re-render when it changes. */
export function useReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const m = mq();
    m?.addEventListener("change", onChange);
    return () => m?.removeEventListener("change", onChange);
  }, []);
  // The server snapshot is `false`: a server has no user to have a preference,
  // and rendering as though motion were reduced would flash the wrong state
  // for everybody who has not asked for it.
  return useSyncExternalStore(subscribe, reducedMotion, () => false);
}
