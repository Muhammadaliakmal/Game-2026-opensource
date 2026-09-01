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
