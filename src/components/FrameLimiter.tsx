"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { createFrameGate } from "@/lib/frame-cap";

/**
 * Caps the render loop at a frame rate, and drives it.
 *
 * ── Why a cap at all ─────────────────────────────────────────────────────
 *
 * `frameloop="always"` renders on every `requestAnimationFrame`, which means
 * the frame rate is whatever the panel happens to be. A 120Hz iPhone or a
 * 144Hz gaming laptop therefore renders twice as many frames as the game needs
 * — and every one of those frames is a full pass over an instanced voxel world
 * plus a shadow map re-rendered from the sun's point of view. That is double
 * the GPU work, double the heat, and roughly double the battery, in exchange
 * for motion nobody asked for.
 *
 * It also went unnoticed because a high-refresh device *looks* fine. The tell
 * is a phone that gets hot and then throttles to something well below 60,
 * which is worse than having been held at 60 the whole time.
 *
 * ── Why `"never"` rather than `"demand"` ─────────────────────────────────
 *
 * Because `"demand"` is not a cap. R3F's `invalidate()` schedules a frame on
 * the next rAF, so anything that calls it — drei helpers, controls, a material
 * whose props changed — renders at the panel's rate again, and we would be
 * back where we started with no way to tell.
 *
 * `"never"` disables R3F's own loop outright: `invalidate()` returns early for
 * this mode, so nothing can render except the `advance()` calls below. The cap
 * is a fact rather than a request.
 *
 * ── The timestamp is in SECONDS ──────────────────────────────────────────
 *
 * The trap in this API. In `"never"` mode R3F does not read its own clock; it
 * takes ours:
 *
 *     delta = timestamp - clock.elapsedTime
 *     clock.elapsedTime = timestamp
 *
 * So `advance(performance.now())` hands the first frame a delta of about a
 * million seconds and every `useFrame` in the tree integrates it. Hence the
 * accumulator below, in seconds, clamped — which is also strictly better than
 * `"always"` gives, because `"always"` passes an unclamped `getDelta()` and a
 * tab returning from sleep arrives as one enormous step.
 */
export function FrameLimiter({ fps = 60 }: { fps?: number }) {
  const advance = useThree((s) => s.advance);
  const invalidate = useThree((s) => s.invalidate);
  const frameloop = useThree((s) => s.frameloop);

  useEffect(() => {
    // The `frameloop` prop on <Canvas> owns the mode; this only drives it.
    //
    // Setting it from in here as well was tempting and wrong: WorldCanvas
    // switches between "never" while playing and "demand" while building, and
    // two writers for one setting means the mode after a transition depends on
    // effect ordering. Warn instead — a limiter attached to an "always" canvas
    // would double-render silently, which is the one failure worth catching.
    if (process.env.NODE_ENV !== "production" && frameloop !== "never") {
      console.warn(
        `[FrameLimiter] canvas frameloop is "${frameloop}", expected "never". ` +
          `The cap is not in effect.`
      );
    }
    if (frameloop !== "never") return;

    // Which ticks get through, and the seconds to advance with, are decided by
    // lib/frame-cap.ts — a pure function so the cadence can actually be
    // asserted. See frame-cap.test.ts: exactly 60 on a 60, 75, 90, 120, 144,
    // 165 and 240Hz panel, and never more.
    const gate = createFrameGate(fps);
    let raf = 0;

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const elapsed = gate.tick(t);
      if (elapsed !== null) advance(elapsed);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // Leaving Play for Build hands the canvas back to "demand", and the
      // switch happens in the Canvas's own effect — which may not have run yet.
      // Without a nudge afterwards the editor can sit on the last frame this
      // loop drew until something else happens to invalidate it. A frame late
      // is free; a frozen editor is not.
      queueMicrotask(() => invalidate());
    };
  }, [advance, invalidate, frameloop, fps]);

  return null;
}
