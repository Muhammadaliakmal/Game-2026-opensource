"use client";

import { useEffect } from "react";
import { Leva, useControls, folder } from "leva";
import { FEEL } from "@/lib/feel";

/**
 * Dev-only live tuning for the game-feel config.
 *
 * SPEC §8 calls FEEL "the single highest-leverage artifact in the build" and
 * wants it tunable live. `FEEL` is a plain runtime object (`as const` is
 * compile-time only) and every play component reads `FEEL.*` fresh inside its
 * frame loop, so writing back here lands next frame with no re-render or prop
 * threading. PlayCanvas only mounts this outside production.
 */

const feel = FEEL as unknown as Record<string, number>;

export default function FeelTuner() {
  const values = useControls({
    Movement: folder({
      walkSpeed: { value: FEEL.walkSpeed, min: 0.5, max: 8, step: 0.1 },
      runSpeed: { value: FEEL.runSpeed, min: 1, max: 14, step: 0.1 },
      airControl: { value: FEEL.airControl, min: 0, max: 1, step: 0.01 },
    }),
    Jump: folder({
      jumpVel: { value: FEEL.jumpVel, min: 2, max: 12, step: 0.1 },
      fallGravityScale: {
        value: FEEL.fallGravityScale,
        min: 1,
        max: 6,
        step: 0.1,
      },
      coyoteTime: { value: FEEL.coyoteTime, min: 0, max: 0.3, step: 0.001 },
      jumpBuffer: { value: FEEL.jumpBuffer, min: 0, max: 0.3, step: 0.001 },
      jumpCutMultiplier: {
        value: FEEL.jumpCutMultiplier,
        min: 0,
        max: 1,
        step: 0.01,
      },
    }),
    Camera: folder({
      camLag: { value: FEEL.camLag, min: 0.02, max: 0.5, step: 0.01 },
      camLookahead: { value: FEEL.camLookahead, min: 0, max: 1.5, step: 0.01 },
    }),
    Juice: folder({
      hardLandVel: { value: FEEL.hardLandVel, min: 3, max: 20, step: 0.5 },
      shakeAmp: { value: FEEL.shakeAmp, min: 0, max: 0.5, step: 0.01 },
      audioVolume: { value: FEEL.audioVolume, min: 0, max: 1, step: 0.01 },
    }),
  });

  useEffect(() => {
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "number") feel[k] = v;
    }
  }, [values]);

  return <Leva collapsed />;
}
