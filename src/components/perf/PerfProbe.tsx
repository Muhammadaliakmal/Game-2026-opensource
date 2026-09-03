"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRenderQuality } from "@/lib/quality";
import { perfEnabled, perfStats } from "./perf-stats";

/**
 * Samples the renderer from inside the frame loop. Renders nothing.
 *
 * Must be mounted INSIDE the <Canvas>: `renderer.info.render` is reset each
 * frame, so it has to be read within the loop that produced it.
 *
 * It reads after everything else has drawn — hence the priority-free useFrame
 * placed last in the tree by convention — but the numbers are for a human
 * reading them a few times a second, so being one frame stale is irrelevant.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const quality = useRenderQuality();

  const frames = useRef(0);
  const since = useRef(0);
  const worst = useRef(0);

  useFrame((_, dt) => {
    if (!perfEnabled) return;

    frames.current++;
    since.current += dt;
    // dt is seconds; a 33ms frame on a 60fps target is a visible hitch.
    worst.current = Math.max(worst.current, dt * 1000);

    // Once a second, not every frame: FPS averaged over a handful of frames is
    // noise, and the whole point of this panel is to be readable.
    if (since.current >= 1) {
      perfStats.fps = frames.current / since.current;
      perfStats.worstMs = worst.current;
      frames.current = 0;
      since.current = 0;
      worst.current = 0;

      const info = gl.info;
      perfStats.calls = info.render.calls;
      perfStats.triangles = info.render.triangles;
      perfStats.geometries = info.memory.geometries;
      perfStats.textures = info.memory.textures;
      perfStats.programs = info.programs?.length ?? 0;
      perfStats.tier = quality.tier;
      perfStats.dpr = gl.getPixelRatio();
    }
  });

  return null;
}
