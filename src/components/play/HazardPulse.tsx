"use client";

import { useFrame } from "@react-three/fiber";
import { FINISH_PARAMS, HAZARD_FINISH, HAZARD_MATERIALS } from "@/components/editor/shapes";

/** How fast the lava breathes, and how far above and below its base level. */
const RATE = 2.6;
const SWING = 0.55;

/**
 * The pulse on every hazard block.
 *
 * One `useFrame`, walking the registry of live hazard materials, moving one
 * number on each: `emissiveIntensity`. That is the whole animation, and it is
 * what makes a kill block read as *dangerous* rather than merely red — a
 * steady glow is a marker, a breathing one is something alive.
 *
 * Mounted in Play only. The editor is `frameloop="demand"` and does not
 * animate anything, on purpose; see CourseMarkers. It reads the base level
 * from FINISH_PARAMS so retuning the finish retunes the pulse's centre.
 */
export function HazardPulse() {
  const base = FINISH_PARAMS[HAZARD_FINISH].emissiveIntensity;
  useFrame(({ clock }) => {
    if (HAZARD_MATERIALS.size === 0) return;
    // A sharpened sine: quick to brighten, slow to fade, like a coal.
    const s = Math.sin(clock.elapsedTime * RATE);
    const k = base + SWING * (s > 0 ? Math.sqrt(s) : s * 0.6);
    for (const m of HAZARD_MATERIALS) m.emissiveIntensity = k;
  });
  return null;
}
