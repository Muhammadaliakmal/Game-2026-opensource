"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";

/**
 * The forgiveness layer that makes jumping feel fair rather than precise.
 *
 * Three techniques, all from the platformer canon (Celeste ships 5 frames of
 * each of the first two):
 *
 *  - Coyote time: a jump pressed just after walking off a ledge still counts.
 *  - Jump buffering: a jump pressed just before landing fires on touchdown,
 *    instead of being swallowed.
 *  - Variable height: releasing early cuts upward velocity, so tap and hold
 *    give different arcs and the player controls the jump.
 *
 * The point is that everything is fudged slightly in the player's favour.
 */
export function useJumpFeel(
  handleRef: RefObject<EcctrlHandle | null>,
  jumpHeld: () => boolean,
  jumpPressedEdge: () => boolean
) {
  const coyote = useRef(0);
  const buffer = useRef(0);

  useFrame((_, dt) => {
    const h = handleRef.current;
    if (!h) return;

    // Refill the window while grounded; drain it once airborne.
    coyote.current = h.isOnGround
      ? FEEL.coyoteTime
      : Math.max(0, coyote.current - dt);

    buffer.current = jumpPressedEdge()
      ? FEEL.jumpBuffer
      : Math.max(0, buffer.current - dt);

    if (buffer.current > 0 && coyote.current > 0) {
      h.setMovement({ jump: true });
      // Consume both so one press can't produce two jumps.
      buffer.current = 0;
      coyote.current = 0;
    } else {
      h.setMovement({ jump: false });
    }

    // Cut the rise short when the button is released mid-ascent.
    if (!jumpHeld() && h.verticalSpeed > 0) {
      const v = h.body.linvel();
      h.body.setLinvel(
        { x: v.x, y: v.y * FEEL.jumpCutMultiplier, z: v.z },
        true
      );
    }
  });
}
