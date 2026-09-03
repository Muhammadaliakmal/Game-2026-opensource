"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import {
  ENV_INTENSITY,
  FOG_DENSITY,
  FOG_HEX,
  HEMI_GROUND_COLOR,
  HEMI_INTENSITY,
  HEMI_SKY_COLOR,
  SUN_DRIFT_DEG_PER_MIN,
  sunDirection,
} from "@/lib/atmosphere";
import { buildSkyEnvironment } from "./sky-shader";
import { SkyDome } from "./SkyDome";
import { SunSprite } from "./SunSprite";
import { useSunDir } from "./use-sun-dir";

/**
 * The whole sky, as one component: gradient, sun, fog, environment, fill light.
 *
 * MAP.md §3.1 says to set the fog and the camera far plane together, and §4.2
 * treats the visible sky and the lighting as one system. So they live in one
 * file rather than being scattered across a canvas — the failure mode is a fog
 * colour that no longer matches the horizon after somebody tunes one of them,
 * and the fix is to make them impossible to edit separately.
 *
 * Fog, background and environment are all declared as JSX rather than assigned
 * onto `scene`. R3F's `attach` handles binding and restoring them, which is
 * both less code and the reason this component can be mounted and unmounted
 * behind a flag without leaving the scene in a half-sunset state.
 *
 * ── What this deliberately does not do ───────────────────────────────────
 *
 * No shadow configuration and no key light. The existing <FollowSun> already
 * implements what MAP.md §5.1 asks for — an orthographic shadow camera that
 * tracks the player and stays tight — so this provides the fill, the ambient
 * and everything you can see, and FollowSun stays the one shadow-caster.
 * Adding a directional light here as well would give the scene two suns
 * pointing different ways.
 */
export function SunsetSky() {
  const gl = useThree((s) => s.gl);

  // Shared with the dome and the sprite. A ref, not state: it moves every
  // frame, and a sun position in React state would re-render at the frame rate.
  const sunDir = useSunDir();

  /**
   * The environment map, rendered from the same gradient the dome paints.
   *
   * Built once. The sun drifts by a fraction of a degree over a race, which is
   * far below what a blurred irradiance map can represent, so rebuilding it
   * per frame would cost a PMREM render to change nothing.
   */
  const env = useMemo(() => buildSkyEnvironment(gl, sunDirection()), [gl]);

  // Allocated outside the R3F tree, so nothing else will free it.
  useEffect(() => env.dispose, [env]);

  useFrame((_, dt) => {
    // Cosmetic, so variable delta is fine — MAP.md §0 rule 3 reserves the
    // fixed step for anything touching physics or lap logic, and nothing here
    // does.
    sunDir.advance(dt * (SUN_DRIFT_DEG_PER_MIN / 60));
  });

  return (
    <>
      {/* The fog colour and the sky's horizon stop are the same constant, not
          two hex strings kept in step by hand — MAP.md §3.1's world-edge seam
          cannot appear if there is only one value. */}
      <fogExp2 attach="fog" args={[FOG_HEX, FOG_DENSITY]} />
      {/* Only ever visible for the frame before the dome draws, but a black
          flash on load reads as a bug on a slow phone. */}
      <color attach="background" args={[FOG_HEX]} />

      <Environment
        map={env.texture}
        background={false}
        environmentIntensity={ENV_INTENSITY}
      />

      <SkyDome sunDir={sunDir.ref} />
      <SunSprite sunDir={sunDir.ref} />

      {/* Fill. Warm from the sky, dark earth from below, so the shadowed side
          of a block is tinted rather than merely darker. */}
      <hemisphereLight
        args={[HEMI_SKY_COLOR, HEMI_GROUND_COLOR, HEMI_INTENSITY]}
      />
    </>
  );
}
