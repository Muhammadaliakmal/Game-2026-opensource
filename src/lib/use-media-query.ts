"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * `useSyncExternalStore` rather than useState + useEffect: a match list is
 * external state, and mirroring it into component state means a setState in an
 * effect on every mount, which cascades a render. This also gives the server
 * snapshot for free — it renders false on the server and corrects on hydration
 * without a flash.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * A device driven by fingers rather than a cursor.
 *
 * Strictly about the input device, with no viewport clause: a narrow desktop
 * window is still a mouse, and telling that user to "drag with two fingers"
 * would be nonsense.
 */
export const useCoarsePointer = () => useMediaQuery("(pointer: coarse)");

/**
 * Whether the on-screen thumb controls should be mounted.
 *
 * Wider than `useCoarsePointer` on purpose: a narrow window gets the thumb
 * layout too, because at that size the HUD is already stacked for a phone.
 *
 * It lives here rather than beside <TouchControls> because it is no longer
 * only that component's business — the look controls have to know whether
 * there are overlay buttons on screen before they take the cursor away.
 */
export const useTouchControls = () =>
  useMediaQuery("(pointer: coarse), (max-width: 900px)");

/**
 * The touch-control size scale, as a number.
 *
 * ── Why this exists when tokens.css already has the sizes ────────────────
 *
 * Every control that is a `TouchButton` gets its size from a CSS custom
 * property, which is the right mechanism: rotating a phone should cost a style
 * recalculation, not a React render of every live control. ecctrl's `Joystick`
 * is the one that cannot. Its `joystickMaxRadius` is not a length it draws —
 * it is the clamp its drag maths divides by, so it has to be a JavaScript
 * number, and a number cannot be `var(--touch-md)`.
 *
 * So the same scale is expressed twice, and the two must stay in step: the
 * breakpoints below are the ones in tokens.css, and the factors are what the
 * button sizes there work out to. If a breakpoint moves in one place it has to
 * move in the other.
 *
 * ── Why the knob is allowed under the 48px floor ─────────────────────────
 *
 * At the tightest scale the knob is ~45px, which would fail the touch floor if
 * it were a button. It is not one: the pressable area of a joystick is its
 * whole 121px wrapper, and the knob is the thing that gets dragged inside it
 * rather than the thing that gets aimed at. The floor applies to targets you
 * have to hit, and nobody has to hit a joystick knob.
 */
export function useTouchScale(): number {
  // Ordered most-specific first, and read unconditionally — hooks cannot be
  // called in a branch, and three matchMedia subscriptions are cheaper than
  // the render they would save.
  const tight = useMediaQuery("(max-width: 380px)");
  const compact = useMediaQuery(
    "(max-width: 600px), (orientation: landscape) and (max-height: 480px)"
  );
  if (tight) return 0.72;
  if (compact) return 0.84;
  return 1;
}
