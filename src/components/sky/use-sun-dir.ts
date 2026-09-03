"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { sunDirection } from "@/lib/atmosphere";

/**
 * The sun's direction, as a mutable ref shared by everything that needs it.
 *
 * A ref rather than state because it changes every frame and three components
 * read it. Wrapped in a small object rather than exposed raw so the drift is
 * advanced through one method — the ref itself is handed to the dome and the
 * sprite read-only, and nothing else is in a position to reset the elapsed
 * angle by accident.
 */
export interface SunDir {
  /** Read-only for consumers. Points from the origin toward the sun. */
  ref: React.RefObject<THREE.Vector3>;
  /** Advance the drift by this many degrees of azimuth. */
  advance: (deg: number) => void;
}

export function useSunDir(): SunDir {
  const ref = useRef(sunDirection(0));
  const drift = useRef(0);

  // useMemo rather than a lazily-filled ref. Both give a stable object, but
  // reading `someRef.current` during render is exactly what React's `refs`
  // lint rule forbids — and the reason it forbids it applies here: a ref read
  // at render time is invisible to the compiler's memoisation.
  return useMemo<SunDir>(
    () => ({
      ref,
      advance: (deg: number) => {
        drift.current += deg;
        // Recomputed rather than rotated incrementally: repeatedly applying a
        // small rotation to a vector accumulates error, and this runs sixty
        // times a second for the length of a race.
        ref.current.copy(sunDirection(drift.current));
      },
    }),
    []
  );
}
