"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useRenderQuality } from "@/lib/quality";
import {
  beginComposedFrames,
  endComposedFrames,
  snapshotComposedFrame,
} from "@/components/perf/perf-stats";

/**
 * Keeps `?perf=1` honest under the composer.
 *
 * `gl.info` resets itself on every `renderer.render()`, and the composer
 * makes one of those per pass, so the probe would read the final
 * full-screen triangle and nothing else. This turns the auto-reset off,
 * snapshots the frame's totals AFTER the composer (priority 2 runs after
 * its 1) and resets by hand, so the next frame starts from zero again.
 */
function FrameTotals() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    beginComposedFrames(gl);
    return () => endComposedFrames(gl);
  }, [gl]);
  useFrame(() => snapshotComposedFrame(gl), 2);
  return null;
}

/**
 * The post-processing chain. Play and Race; never the editor.
 *
 * ── Restrained on purpose ────────────────────────────────────────────────
 *
 * Two effects. Bloom with a high threshold, so only the emissive finish
 * glows — it sits at 1.4, past the 0.75 cut, and nothing lit by the moon
 * gets near it. Everything a player is meant to find (a goal, a checkpoint,
 * a collectible) is already emissive, so the glow is the wayfinding the spec
 * describes: eyes go to the bright thing without a UI arrow. A vignette to
 * pull the eye to centre screen. No colour grading: the palette the player
 * chose is the content, and a saturation push would repaint it.
 *
 * ── Why not in the editor ────────────────────────────────────────────────
 *
 * Build mode is where a colour is judged, on a neutral studio background
 * chosen for exactly that. A bloomed, vignetted editor shows a colour that
 * Play then renders differently.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────
 *
 * A second full-screen pass on a fragment-bound world, so the low tier skips
 * it (`quality.post`). `multisampling` is the composer's own MSAA on its
 * render target — the Canvas's `antialias` flag does nothing once a composer
 * owns the frame — and follows the tier the same way that flag does.
 */
export function PostFX() {
  const quality = useRenderQuality();
  if (!quality.post) return null;

  return (
    <>
      <FrameTotals />
      <EffectComposer multisampling={quality.antialias ? 4 : 0}>
        <Bloom
          intensity={0.55}
          luminanceThreshold={0.75}
          luminanceSmoothing={0.3}
          mipmapBlur
        />
        <Vignette offset={0.3} darkness={0.45} />
      </EffectComposer>
    </>
  );
}
