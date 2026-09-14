"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { monitorFrame, useRenderQuality } from "@/lib/quality";
import { setBlockArraysAnisotropy, useBlockArrays } from "@/lib/textures/block-arrays";

/**
 * Everything the block surfaces need from inside a <Canvas>, in one place.
 * Renders nothing. Mount it once per canvas that draws blocks.
 *
 *  - Starts the array download (the first `useBlockArrays` subscriber does),
 *    so it is in flight while the world is still being bucketed.
 *  - Applies the tier's anisotropy, which needs the renderer to know the
 *    GPU's ceiling.
 *  - `precompile`: Part 13. Once the arrays land every bucket swaps to a
 *    patched material, and the first frame that draws one would otherwise
 *    pay a shader compile — 100–400 ms of frozen game, on the first step a
 *    player takes. `gl.compile` pays it here, behind the loading screen.
 *  - `adaptive`: Part 12's frame monitor, for canvases with a continuous
 *    loop. The editor renders on demand, where a long frame means the player
 *    stopped clicking, not that the device is slow — leave it off there.
 */
export function BlockSurfaces({
  precompile = false,
  adaptive = false,
}: {
  precompile?: boolean;
  adaptive?: boolean;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const quality = useRenderQuality();
  const arrays = useBlockArrays();

  useEffect(() => {
    setBlockArraysAnisotropy(quality.anisotropy, gl);
  }, [quality.anisotropy, gl, arrays]);

  useEffect(() => {
    if (!precompile || !arrays) return;
    // Effects run children first, so by now every bucket has committed its
    // patched material onto its mesh and this compiles the real programs.
    gl.compile(scene, camera);
  }, [precompile, arrays, gl, scene, camera]);

  useFrame((_, dt) => {
    if (adaptive) monitorFrame(dt, quality.tier);
  });

  return null;
}
