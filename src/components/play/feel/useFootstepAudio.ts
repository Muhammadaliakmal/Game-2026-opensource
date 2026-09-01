"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";
import { noiseHit } from "@/lib/audio";

/**
 * Footstep, jump and landing SFX.
 *
 * Every sound is one short burst of white noise shaped by a lowpass filter and
 * an exponential gain envelope — enough for readable "thud" and "tick" cues,
 * with no asset files to ship. The graph itself (context, master gain, mute)
 * lives in `lib/audio` so the editor's placement sounds and the mute button
 * share one signal chain.
 */
export function useFootstepAudio(handleRef: RefObject<EcctrlHandle | null>) {
  const stepClock = useRef(0);
  const wasOnGround = useRef(true);
  const wasJumping = useRef(false);

  useFrame((_, dt) => {
    const h = handleRef.current;
    if (!h) return;

    // Jump: rising edge of jumpActive — a short airy tick.
    if (h.jumpActive && !wasJumping.current) noiseHit(0.12, 900, 0.25);
    wasJumping.current = h.jumpActive;

    // Landing: rising edge of isOnGround, weighted by impact speed.
    if (h.isOnGround && !wasOnGround.current) {
      const impact = Math.min(1, Math.abs(h.verticalSpeed) / FEEL.hardLandVel);
      noiseHit(0.1 + impact * 0.16, 260 + impact * 200, 0.2 + impact * 0.6);
    }
    wasOnGround.current = h.isOnGround;

    // Footsteps: cadence tracks ground speed so a run sounds faster than a walk.
    if (h.isMoving && h.isOnGround && h.moveSpeed > 0.4) {
      stepClock.current -= dt;
      if (stepClock.current <= 0) {
        noiseHit(0.07, 800, 0.22);
        const rate = Math.max(0.5, h.moveSpeed / FEEL.walkSpeed);
        stepClock.current = FEEL.footstepGap / rate;
      }
    } else {
      // Land the next step promptly when movement resumes.
      stepClock.current = Math.min(stepClock.current, 0.08);
    }
  });
}
